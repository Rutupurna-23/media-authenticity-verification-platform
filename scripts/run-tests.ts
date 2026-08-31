import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const env = {
  ...process.env,
  NODE_ENV: 'test',
  FIREBASE_PROJECT_ID: 'media-authenticity-platform',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
  GOOGLE_CLOUD_PROJECT: 'media-authenticity-platform',
  GCLOUD_PROJECT: 'media-authenticity-platform',
};

if (!env.FIRESTORE_EMULATOR_HOST || !env.FIREBASE_STORAGE_EMULATOR_HOST) {
  console.error('Test runner safety check failed: Firebase emulator endpoints are not configured.');
  process.exit(1);
}

console.log('Using Firebase emulators for automated tests:');
console.log(`  Firestore: ${env.FIRESTORE_EMULATOR_HOST}`);
console.log(`  Storage:   ${env.FIREBASE_STORAGE_EMULATOR_HOST}`);
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
