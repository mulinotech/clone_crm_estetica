module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'app.js',
    '!node_modules/**',
    '!dist/**',
    '!tests/**'
  ],
  testMatch: [
    '**/tests/**/*.test.js'
  ],
  verbose: true,
  // MUL-37: Pular testes de integração localmente se MySQL não disponível
  testPathIgnorePatterns: [
    '/node_modules/',
    // Ignorar integration/ se RUN_INTEGRATION_TESTS não estiver setado
    ...(process.env.RUN_INTEGRATION_TESTS ? [] : ['/tests/integration/'])
  ]
};
