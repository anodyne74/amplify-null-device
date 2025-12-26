/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx', '**/*.test.ts', '**/*.test.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    'src/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
    '!**/coverage/**',
    '!**/page.tsx',
    '!**/layout.tsx',
    '!app/operator/**',
    '!app/customer/dashboard/**',
    '!app/customer/invoices/[id]/**',
    '!app/customer/routes/[id]/**',
    '!src/**',
    '!lib/queries/**',
    '!lib/cognito-debug.ts',
    '!app/auth/session.ts',
    '!app/components/AuthApp.tsx',
    '!app/components/DataApp.tsx',
    '!app/customer/components/RouteCard.tsx',
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 65,
      statements: 65,
    },
  },
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        jsx: 'react-jsx',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    }],
  },
};

module.exports = config;

module.exports = config;
