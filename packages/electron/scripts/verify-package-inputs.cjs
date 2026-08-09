const fs = require('fs');
const path = require('path');

const packageRoot = path.resolve(__dirname, '..');
const backendPackagePath = path.resolve(packageRoot, '..', 'backend', 'package.json');
const electronPackagePath = path.resolve(packageRoot, 'package.json');
const requiredArtifacts = [
  {
    label: 'web renderer build',
    target: path.resolve(packageRoot, '..', 'web', 'dist', 'index.html'),
  },
  {
    label: 'desktop backend entry',
    target: path.resolve(packageRoot, '..', 'backend', 'dist', 'server.js'),
  },
  {
    label: 'local replica schema',
    target: path.resolve(packageRoot, '..', 'backend', 'prisma', 'schema.local.sql'),
  },
  {
    label: 'generated local Prisma client',
    target: path.resolve(packageRoot, '..', 'backend', 'generated', 'local-prisma', 'index.js'),
  },
  {
    label: 'generated server Prisma client',
    target: path.resolve(packageRoot, '..', '..', 'node_modules', '.prisma', 'client', 'default.js'),
  },
];

const missingArtifacts = requiredArtifacts.filter(({ target }) => !fs.existsSync(target));

if (missingArtifacts.length > 0) {
  console.error('Electron packaging prerequisites are missing:');
  for (const artifact of missingArtifacts) {
    console.error(`- ${artifact.label}: ${artifact.target}`);
  }
  console.error(
    'Build the shared package, backend, and web renderer before packaging Electron.'
  );
  process.exit(1);
}

const backendPackage = JSON.parse(fs.readFileSync(backendPackagePath, 'utf8'));
const electronPackage = JSON.parse(fs.readFileSync(electronPackagePath, 'utf8'));
const backendRuntimeDependencies = Object.keys(backendPackage.dependencies ?? {});
const packagedRuntimeDependencies = electronPackage.dependencies ?? {};
const missingRuntimeDependencies = backendRuntimeDependencies.filter(
  (dependency) => !(dependency in packagedRuntimeDependencies)
);

if (missingRuntimeDependencies.length > 0) {
  console.error('Electron packaging would omit backend runtime dependencies:');
  for (const dependency of missingRuntimeDependencies) {
    console.error(`- ${dependency}`);
  }
  console.error(
    'Declare every backend production dependency in packages/electron/package.json so electron-builder includes it.'
  );
  process.exit(1);
}

console.log(
  `Verified Electron packaging inputs for ${requiredArtifacts.length} required artifacts and ${backendRuntimeDependencies.length} backend runtime dependencies.`
);
