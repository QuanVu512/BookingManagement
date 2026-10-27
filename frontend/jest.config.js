import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default {
  rootDir,
  // Rendering specs create their own JSDOM; network specs retain Node fetch.
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.spec.ts', '**/*.spec.tsx'],
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          rootDir,
          target: 'ES2023',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          jsx: 'react-jsx',
          esModuleInterop: true,
          isolatedModules: true,
          strict: true,
          skipLibCheck: true,
          sourceMap: true,
          inlineSourceMap: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '\\.module\\.css$': '<rootDir>/__tests__/fixtures/css-module.mjs',
  },
};
