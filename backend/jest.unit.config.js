import base from './jest.config.js';

export default {
  ...base,
  roots: ['<rootDir>/src', '<rootDir>/prisma'],
  testMatch: ['**/*.spec.ts', '**/*.spec.mjs'],
  testPathIgnorePatterns: ['\\.integration\\.spec\\.ts$'],
};
