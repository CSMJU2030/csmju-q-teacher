/**
 * Real integration test against a RUNNING Core Hub + a running Q-Teacher.
 * Skipped automatically unless CORE_HUB_URL / SUBSYSTEM_URL and test credentials are set.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: 'test/.*\\.integration-spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  testTimeout: 60000,
};
