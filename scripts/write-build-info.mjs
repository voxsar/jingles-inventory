import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const targets = {
  backend: {
    packageJsonPath: path.join(repoRoot, 'packages', 'backend', 'package.json'),
    outputPath: path.join(repoRoot, 'packages', 'backend', 'src', 'generated', 'buildInfo.ts'),
  },
  electron: {
    packageJsonPath: path.join(repoRoot, 'packages', 'electron', 'package.json'),
    outputPath: path.join(repoRoot, 'packages', 'electron', 'src', 'generated', 'buildInfo.ts'),
  },
};

function runGit(args) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function getPackageVersion(packageJsonPath) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return {
    packageName: packageJson.name,
    appVersion: packageJson.version,
  };
}

function buildInfoSource(targetName) {
  const envCommit = process.env.JINGLES_BUILD_COMMIT?.trim() || null;
  const envBuildNumber = process.env.JINGLES_BUILD_NUMBER?.trim() || null;
  const envBuiltAt = process.env.JINGLES_BUILD_TIME?.trim() || null;

  const commitHash = envCommit ?? runGit(['rev-parse', 'HEAD']);
  const commitShortHash = commitHash ? commitHash.slice(0, 12) : null;
  const buildNumber = envBuildNumber ?? runGit(['rev-list', '--count', 'HEAD']);
  const builtAt = envBuiltAt ?? new Date().toISOString();
  const { packageName, appVersion } = getPackageVersion(targets[targetName].packageJsonPath);

  return {
    packageName,
    appVersion,
    buildNumber,
    commitHash,
    commitShortHash,
    builtAt,
  };
}

function writeTarget(targetName) {
  const target = targets[targetName];
  if (!target) {
    throw new Error(`Unknown build info target: ${targetName}`);
  }

  const buildInfo = buildInfoSource(targetName);
  const contents = `export const GENERATED_BUILD_INFO = ${JSON.stringify(buildInfo, null, 2)} as const;\n`;
  fs.mkdirSync(path.dirname(target.outputPath), { recursive: true });
  fs.writeFileSync(target.outputPath, contents, 'utf8');
}

const requestedTargets = process.argv.slice(2);
const targetNames = requestedTargets.length > 0 ? requestedTargets : Object.keys(targets);

for (const targetName of targetNames) {
  writeTarget(targetName);
}
