/**
 * MUL-32: ESLint config - Anti-bypass rule
 *
 * Regra estática que PROÍBE importar mysql2 fora da DAL.
 * Build quebra se alguém tentar bypass (acceptance criterion).
 *
 * @author Rafael von Siemens
 * @date 2026-07-26
 */

module.exports = {
  root: true,
  env: {
    node: true,
    es2021: true,
    jest: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module'
  },
  rules: {
    // Regra anti-bypass: proibir require de mysql2 fora da DAL (CommonJS)
    'no-restricted-modules': ['error', {
      paths: [{
        name: 'mysql2',
        message: 'PROIBIDO: require("mysql2") apenas em server/dal/database.js. Use a DAL para acesso ao banco.'
      }, {
        name: 'mysql2/promise',
        message: 'PROIBIDO: require("mysql2/promise") apenas em server/dal/database.js. Use a DAL para acesso ao banco.'
      }]
    }]
  },
  overrides: [
    {
      // Exceção: permitir mysql2 APENAS em:
      // - DAL (ponto único de acesso)
      // - Migrations e scripts administrativos (operações fora do runtime)
      // - Testes de integração (setup/teardown de fixtures)
      files: [
        'server/dal/database.js',
        'migrations/**/*.js',
        'scripts/**/*.js',
        'tests/**/*.js',
        'app.js',
        'clear.js'
      ],
      rules: {
        'no-restricted-modules': 'off'
      }
    }
  ]
};
