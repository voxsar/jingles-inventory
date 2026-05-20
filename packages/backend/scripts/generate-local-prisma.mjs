import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');
const prismaDir = path.join(backendRoot, 'prisma');
const sourceSchemaPath = path.join(prismaDir, 'schema.prisma');
const localSchemaPath = path.join(prismaDir, 'schema.local.prisma');
const localSqlPath = path.join(prismaDir, 'schema.local.sql');
const localClientDir = path.join(backendRoot, 'generated', 'local-prisma');
const prismaPackagePath = path.resolve(backendRoot, '..', '..', 'node_modules', 'prisma', 'package.json');
const localClientPackagePath = path.join(localClientDir, 'package.json');

function getPrismaBinaryPath() {
  const binaryName = process.platform === 'win32' ? 'prisma.cmd' : 'prisma';
  return path.resolve(backendRoot, '..', '..', 'node_modules', '.bin', binaryName);
}

function toIdempotentSql(sqlScript) {
  return sqlScript
    .replace(/^CREATE TABLE /gm, 'CREATE TABLE IF NOT EXISTS ')
    .replace(/^CREATE UNIQUE INDEX /gm, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
    .replace(/^CREATE INDEX /gm, 'CREATE INDEX IF NOT EXISTS ');
}

function buildLocalSchema(sourceSchema) {
  return sourceSchema
    .replace(
      /generator client \{[\s\S]*?\n\}/m,
      `generator client {\n  provider = "prisma-client-js"\n  output   = "../generated/local-prisma"\n}`
    )
    .replace(
      /datasource db \{[\s\S]*?\n\}/m,
      `datasource db {\n  provider = "sqlite"\n  url      = env("LOCAL_SQLITE_DATABASE_URL")\n}`
    )
    .replace(/\bJson\?/g, 'String?')
    .replace(/\bJson\b/g, 'String');
}

function runPrismaCommand(args, options = {}) {
  if (process.platform === 'win32') {
    return execFileSync('cmd.exe', ['/c', getPrismaBinaryPath(), ...args], {
      cwd: backendRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      ...options,
    });
  }

  return execFileSync(getPrismaBinaryPath(), args, {
    cwd: backendRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    ...options,
  });
}

function readFileIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return fs.readFileSync(filePath, 'utf8');
}

function readJsonIfExists(filePath) {
  const content = readFileIfExists(filePath);
  if (!content) {
    return null;
  }

  return JSON.parse(content);
}

function writeFileIfChanged(filePath, nextContent) {
  const previousContent = readFileIfExists(filePath);
  if (previousContent === nextContent) {
    return false;
  }

  fs.writeFileSync(filePath, nextContent);
  return true;
}

function cleanupTemporaryQueryEngineFiles() {
  if (!fs.existsSync(localClientDir)) {
    return [];
  }

  const removedFiles = [];
  for (const entry of fs.readdirSync(localClientDir)) {
    if (!/^query_engine-.*\.tmp\d+$/i.test(entry)) {
      continue;
    }

    const entryPath = path.join(localClientDir, entry);
    try {
      fs.rmSync(entryPath, { force: true });
      removedFiles.push(entry);
    } catch {
      // Ignore best-effort cleanup failures; the main build error will still surface if the lock remains.
    }
  }

  return removedFiles;
}

function hasGeneratedQueryEngine() {
  if (!fs.existsSync(localClientDir)) {
    return false;
  }

  return fs.readdirSync(localClientDir).some((entry) => {
    if (entry.endsWith('.tmp') || /\.tmp\d+$/i.test(entry)) {
      return false;
    }

    return /(?:^query_engine-.*\.dll\.node$)|(?:^libquery_engine-.*\.node$)/i.test(entry);
  });
}

function hasRequiredLocalClientArtifacts() {
  const requiredFiles = [
    path.join(localClientDir, 'index.js'),
    path.join(localClientDir, 'index.d.ts'),
    path.join(localClientDir, 'package.json'),
    path.join(localClientDir, 'schema.prisma'),
    path.join(localClientDir, 'runtime', 'library.js'),
  ];

  return requiredFiles.every((filePath) => fs.existsSync(filePath)) && hasGeneratedQueryEngine();
}

function getInstalledPrismaVersion() {
  return readJsonIfExists(prismaPackagePath)?.version ?? null;
}

function getGeneratedLocalClientVersion() {
  return readJsonIfExists(localClientPackagePath)?.version ?? null;
}

function rethrowWithPrismaLockHint(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes('query_engine-windows.dll.node') &&
    message.includes('EPERM')
  ) {
    throw new Error(
      'Local Prisma client generation failed because Windows is locking ' +
        '`packages/backend/generated/local-prisma/query_engine-windows.dll.node`. ' +
        'Close any running Electron/backend process that is using the local replica client, ' +
        'then rerun the build.',
      { cause: error }
    );
  }

  throw error;
}

const sourceSchema = fs.readFileSync(sourceSchemaPath, 'utf8');
const localSchema = buildLocalSchema(sourceSchema);
const schemaChanged = writeFileIfChanged(localSchemaPath, localSchema);
const removedTempFiles = cleanupTemporaryQueryEngineFiles();

if (process.argv.includes('--write-only')) {
  const schemaVerb = schemaChanged ? 'Wrote' : 'Verified';
  process.stdout.write(`${schemaVerb} ${path.relative(backendRoot, localSchemaPath)}\n`);
  process.exit(0);
}

const installedPrismaVersion = getInstalledPrismaVersion();
const generatedLocalClientVersion = getGeneratedLocalClientVersion();
const prismaVersionChanged =
  installedPrismaVersion !== null &&
  generatedLocalClientVersion !== null &&
  installedPrismaVersion !== generatedLocalClientVersion;
const shouldGenerateLocalClient =
  schemaChanged || prismaVersionChanged || !hasRequiredLocalClientArtifacts();

if (shouldGenerateLocalClient) {
  try {
    runPrismaCommand(['generate', '--schema', path.relative(backendRoot, localSchemaPath)], {
      stdio: 'inherit',
    });
    cleanupTemporaryQueryEngineFiles();
  } catch (error) {
    rethrowWithPrismaLockHint(error);
  }
} else {
  process.stdout.write('Local Prisma client is up to date; skipping generate.\n');
}

const hasLocalSql = fs.existsSync(localSqlPath);
if (schemaChanged || !hasLocalSql) {
  const sqlScript = runPrismaCommand([
    'migrate',
    'diff',
    '--from-empty',
    '--to-schema-datamodel',
    path.relative(backendRoot, localSchemaPath),
    '--script',
  ]);

  writeFileIfChanged(localSqlPath, toIdempotentSql(sqlScript));
}

const schemaVerb = schemaChanged ? 'Wrote' : 'Verified';
const sqlVerb = fs.existsSync(localSqlPath) ? 'verified' : 'missing';
const cleanupSummary =
  removedTempFiles.length > 0 ? ` Removed ${removedTempFiles.length} stale temp engine file(s).` : '';
process.stdout.write(
  `${schemaVerb} ${path.relative(backendRoot, localSchemaPath)} and ${sqlVerb} ${path.relative(
    backendRoot,
    localSqlPath
  )}.${cleanupSummary}\n`
);
