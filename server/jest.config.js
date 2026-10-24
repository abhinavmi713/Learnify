module.exports = {
  testEnvironment: "node",
  setupFiles: ["<rootDir>/tests/jestEnv.js"],
  moduleNameMapper: {
    "^uuid$": "<rootDir>/tests/__mocks__/uuid.js",
  },
  testTimeout: 30000,
  // Each test file boots its own single-node replica set; too many at once
  // starve each other and time out.
  maxWorkers: 3,
}
