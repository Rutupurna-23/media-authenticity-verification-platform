import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import net from 'node:net';

function isPortOpenSync(port: number): boolean {
  try {
    const res = spawnSync('node', ['-e', `
      const net = require('net');
      const socket = new net.Socket();
      socket.setTimeout(200);
      socket.on('connect', () => { socket.destroy(); process.exit(0); });
      socket.on('error', () => process.exit(1));
      socket.on('timeout', () => process.exit(1));
      socket.connect(${port}, '127.0.0.1');
    `]);
    return res.status === 0;
  } catch (_e) {
    return false;
  }
}

const firestoreActive = isPortOpenSync(8080);
const storageActive = isPortOpenSync(9199);

const env: Record<string, string | undefined> = {
  ...process.env,
  NODE_ENV: 'test',
  FIREBASE_PROJECT_ID: 'media-authenticity-platform',
  GOOGLE_CLOUD_PROJECT: 'media-authenticity-platform',
  GCLOUD_PROJECT: 'media-authenticity-platform',
};

if (firestoreActive) {
  env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
} else {
  delete env.FIRESTORE_EMULATOR_HOST;
}

if (storageActive) {
  env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
} else {
  delete env.FIREBASE_STORAGE_EMULATOR_HOST;
}

console.log('Automated Test Execution Environment:');
console.log(`  Firestore: ${firestoreActive ? '127.0.0.1:8080 (Emulator Active)' : 'InMemoryDB (Fast Isolated Engine)'}`);
console.log(`  Storage:   ${storageActive ? '127.0.0.1:9199 (Emulator Active)' : 'InMemoryDB Storage (Fast Isolated Engine)'}`);
console.log(`  Project:   ${env.FIREBASE_PROJECT_ID}`);

const tsxCli = join(
  process.cwd(),
  'node_modules',
  'tsx',
  'dist',
  'cli.mjs',
);

if (!existsSync(tsxCli)) {
  console.error(`Local tsx CLI not found: ${tsxCli}`);
  process.exit(1);
}

const testFiles = [
  join(process.cwd(), 'tests', 'firestore.test.ts'),
  join(process.cwd(), 'tests', 'bugfixes.test.ts'),
  join(process.cwd(), 'tests', 'activeAuthority.test.ts'),
];

let overallExitCode = 0;

for (const testFile of testFiles) {
  console.log(`\n------------------------------------------------------`);
  console.log(`Running test file: ${testFile}`);
  console.log(`------------------------------------------------------`);

  const result = spawnSync(
    process.execPath,
    [tsxCli, testFile],
    {
      stdio: 'inherit',
      env,
      cwd: process.cwd(),
    },
  );

  if (result.error) {
    console.error(`Failed to start test process for ${testFile}:`, result.error);
    overallExitCode = 1;
    break;
  }

  if ((result.status ?? 1) !== 0) {
    console.error(`Test file failed with exit code ${result.status}`);
    overallExitCode = result.status ?? 1;
    break;
  }
}

process.exit(overallExitCode);
