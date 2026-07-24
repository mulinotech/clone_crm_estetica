/**
 * MUL-37: Script de setup do banco de teste para CI
 * Aplica migrations no banco de teste limpo antes dos testes de integração
 */

'use strict';

const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

// Configuração do banco de teste (via env vars do CI)
const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'musa_crm_test',
  port: parseInt(process.env.DB_PORT || '3306'),
  multipleStatements: true
};

// Credenciais de admin para operações de DROP/CREATE database
// No CI: usa root com MYSQL_ROOT_PASSWORD
// Localmente: usa root (sem senha) ou env vars se definidas
const adminConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_ADMIN_USER || 'root',
  password: process.env.DB_ADMIN_PASSWORD || process.env.DB_ROOT_PASSWORD || '',
  port: parseInt(process.env.DB_PORT || '3306'),
  multipleStatements: true
};

/**
 * Recria o banco de teste do zero (limpa estado anterior)
 */
async function recreateDatabase() {
  console.log('[SETUP] Recriando banco de teste...');

  // Conecta com credenciais de admin para poder dropar/criar banco
  const connection = await mysql.createConnection({
    host: adminConfig.host,
    user: adminConfig.user,
    password: adminConfig.password,
    port: adminConfig.port
  });

  try {
    await connection.query(`DROP DATABASE IF EXISTS ${dbConfig.database}`);
    console.log(`  ✓ Banco ${dbConfig.database} dropado`);

    await connection.query(`CREATE DATABASE ${dbConfig.database}`);
    console.log(`  ✓ Banco ${dbConfig.database} criado`);
  } finally {
    await connection.end();
  }
}

/**
 * Aplica migration no banco de teste
 */
async function runMigration(migrationPath) {
  const migrationName = path.basename(migrationPath);
  console.log(`\n[MIGRATION] Aplicando: ${migrationName}`);

  const connection = await mysql.createConnection(dbConfig);

  try {
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    // Log do tamanho do SQL para debug
    console.log(`  → SQL length: ${migrationSQL.length} chars`);

    await connection.query(migrationSQL);
    console.log('  ✓ Migration aplicada com sucesso');
  } catch (error) {
    console.error(`  ✗ ERRO ao aplicar ${migrationName}:`, error.message);
    console.error(`  ✗ Stack trace:`, error.stack);
    throw error;
  } finally {
    await connection.end();
  }
}

/**
 * Aplica todas as migrations da pasta migrations/
 */
async function runAllMigrations() {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort(); // Ordem alfabética (001_, 002_, etc.)

  console.log(`[MIGRATIONS] Encontradas ${migrationFiles.length} migrations`);

  for (const file of migrationFiles) {
    const migrationPath = path.join(migrationsDir, file);
    await runMigration(migrationPath);
  }
}

/**
 * Insere dados de seed mínimos para testes
 */
async function seedTestData() {
  console.log('\n[SEED] Inserindo dados de teste...');

  const connection = await mysql.createConnection(dbConfig);

  try {
    // Criar tenant de teste (schema conforme 001_multi_tenant_schema.sql)
    await connection.query(
      `INSERT INTO tenants (id, nome, dominio, instancia_whatsapp, status, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      ['test_tenant', 'Clínica de Teste', 'test.local', 'test_instance', 'ativo']
    );
    console.log('  ✓ Tenant de teste criado (id: test_tenant)');

  } catch (error) {
    // Ignorar se tenant já existe (idempotência)
    if (!error.message.includes('Duplicate entry')) {
      throw error;
    }
    console.log('  ℹ Tenant de teste já existe');
  } finally {
    await connection.end();
  }
}

/**
 * Main: setup completo do banco de teste
 */
async function main() {
  console.log('='.repeat(60));
  console.log('MUL-37: Setup do banco de teste para CI');
  console.log('='.repeat(60));

  try {
    // 1. Recriar banco (limpa estado anterior)
    await recreateDatabase();

    // 2. Aplicar todas as migrations
    await runAllMigrations();

    // 3. Inserir dados de seed
    await seedTestData();

    console.log('\n' + '='.repeat(60));
    console.log('✓ SUCESSO: Banco de teste pronto!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('✗ FALHA no setup:', error.message);
    console.error('='.repeat(60));
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  main().catch(error => {
    console.error('Erro fatal:', error);
    process.exit(1);
  });
}

module.exports = { recreateDatabase, runAllMigrations, seedTestData };
