// Unit tests: *.spec.ts files under src/ (no database, no network).
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: 'src/.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  // the Prisma 7 generated client is build output, not application code
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  coveragePathIgnorePatterns: ['/node_modules/', '<rootDir>/generated/'],
  coverageDirectory: './coverage',
};
