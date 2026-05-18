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

const sourceSchema = fs.readFileSync(sourceSchemaPath, 'utf8');
const localSchema = buildLocalSchema(sourceSchema);
fs.writeFileSync(localSchemaPath, localSchema);

if (process.argv.includes('--write-only')) {
  process.stdout.write(`Wrote ${path.relative(backendRoot, localSchemaPath)}\n`);
  process.exit(0);
}

runPrismaCommand(['generate', '--schema', path.relative(backendRoot, localSchemaPath)], {
  stdio: 'inherit',
});

const sqlScript = runPrismaCommand([
  'migrate',
  'diff',
  '--from-empty',
  '--to-schema-datamodel',
  path.relative(backendRoot, localSchemaPath),
  '--script',
]);

fs.writeFileSync(localSqlPath, toIdempotentSql(sqlScript));
process.stdout.write(
  `Wrote ${path.relative(backendRoot, localSchemaPath)} and ${path.relative(backendRoot, localSqlPath)}\n`
);
