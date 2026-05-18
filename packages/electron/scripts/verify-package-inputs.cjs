const fs = require('fs');
const path = require('path');

const packageRoot = path.resolve(__dirname, '..');
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

console.log(
  `Verified Electron packaging inputs for ${requiredArtifacts.length} required artifacts.`
);
