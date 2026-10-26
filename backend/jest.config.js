import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));

/** @type {import('jest').Config} */
const config = {
  rootDir,
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup-nest-esm.mjs'],
  roots: ['<rootDir>/src', '<rootDir>/test', '<rootDir>/prisma'],
  testMatch: ['**/*.spec.ts', '**/*.e2e-spec.ts', '**/*.spec.mjs'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: `${rootDir}/tsconfig.json`,
      },
    ],
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};

export default config;
