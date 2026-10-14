import base from './jest.config.js';

export default {
  ...base,
  roots: ['<rootDir>/test'],
  testMatch: ['**/frontend-auth-rendering.spec.tsx'],
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          target: 'ES2023',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          jsx: 'react-jsx',
          esModuleInterop: true,
          isolatedModules: true,
          strict: true,
          skipLibCheck: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    ...base.moduleNameMapper,
    '\\.module\\.css$': '<rootDir>/test/fixtures/css-module.mjs',
  },
};
