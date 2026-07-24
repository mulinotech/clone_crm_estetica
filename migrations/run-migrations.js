/**
 * MUL-31: Script de aplicação de migrations SQL
 * Executa migrations idempotentes no banco MySQL
 * Autor: Rafael von Siemens
 */

'use strict';

const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

// Carregar .env se existir
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (e) {
  // dotenv opcional
}

const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || process.env.DB_PASS || '',
  database: process.env.DB_NAME || '',
  port: parseInt(process.env.DB_PORT || '3306'),
  multipleStatements: true // Necessário para executar migration com múltiplas instruções
};

/**
 * Aplica uma migration SQL no banco de dados
 * @param {string} migrationPath - Caminho absoluto para o arquivo .sql
 */
async function runMigration(migrationPath) {
  const migrationName = path.basename(migrationPath);

  console.log(`\n[MIGRATION] Iniciando: ${migrationName}`);

  const connection = await mysql.createConnection(dbConfig);

  try {
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    console.log('[MIGRATION] Executando SQL...');
    const [result] = await connection.query(migrationSQL);

    console.log('[MIGRATION] Sucesso! Migration aplicada.');
    if (Array.isArray(result)) {
      // Algumas queries retornam mensagens de status (SELECT info)
      result.forEach((item, idx) => {
        if (item && item.info) {
          console.log(`  └─ [${idx}] ${item.info}`);
        }
      });
    }

  } catch (error) {
    console.error(`[MIGRATION] ERRO ao aplicar ${migrationName}:`, error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

/**
 * Valida schema após migration — verifica se tenant_id existe e é NOT NULL
 */
async function validateSchema() {
  console.log('\n[VALIDAÇÃO] Verificando schema multi-tenant...');

  const connection = await mysql.createConnection(dbConfig);

  try {
    const tables = [
      'leads', 'clients', 'treatments', 'interactions',
      'salespeople', 'treatment_catalog', 'treatment_plans', 'treatment_sessions'
    ];

    for (const table of tables) {
      const [columns] = await connection.query(
        `SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND COLUMN_NAME = 'tenant_id'`,
        [table]
      );

      if (columns.length === 0) {
        console.error(`  ✗ Tabela ${table}: coluna tenant_id NÃO EXISTE`);
        throw new Error(`Schema inválido: ${table} sem tenant_id`);
      }

      const col = columns[0];
      if (col.IS_NULLABLE === 'YES') {
        console.warn(`  ⚠ Tabela ${table}: tenant_id ainda aceita NULL (migration em progresso)`);
      } else {
        console.log(`  ✓ Tabela ${table}: tenant_id NOT NULL OK`);
      }
    }

    // Verificar se tabela tenants existe
    const [tenantTable] = await connection.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'tenants'`
    );

    if (tenantTable.length === 0) {
      throw new Error('Tabela tenants não existe');
    }
    console.log('  ✓ Tabela tenants: OK');

    // Verificar índices compostos
    const [indexes] = await connection.query(
      `SELECT TABLE_NAME, INDEX_NAME
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
       AND INDEX_NAME LIKE '%tenant%'
       GROUP BY TABLE_NAME, INDEX_NAME`
    );

    console.log(`  ✓ Índices compostos tenant_id: ${indexes.length} encontrados`);
    indexes.forEach(idx => {
      console.log(`    - ${idx.TABLE_NAME}.${idx.INDEX_NAME}`);
    });

    console.log('\n[VALIDAÇÃO] Schema multi-tenant VÁLIDO ✓');

  } catch (error) {
    console.error('[VALIDAÇÃO] FALHOU:', error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

/**
 * Testa um EXPLAIN em query de listagem
 * Verifica se índice tenant_id é utilizado
 */
async function testExplain() {
  console.log('\n[EXPLAIN] Testando query com tenant_id...');

  const connection = await mysql.createConnection(dbConfig);

  try {
    // Explicar query de listagem de leads por tenant
    const [explain] = await connection.query(
      `EXPLAIN SELECT * FROM leads WHERE tenant_id = 'tenant_legacy' ORDER BY date DESC LIMIT 10`
    );

    console.log('[EXPLAIN] Resultado:');
    console.table(explain);

    // Verificar se usa índice
    const usesIndex = explain.some(row =>
      row.key && row.key.includes('tenant')
    );

    if (usesIndex) {
      console.log('  ✓ Query utiliza índice tenant_id (sem full scan)');
    } else {
      console.warn('  ⚠ Query NÃO utiliza índice tenant_id (possível full scan)');
    }

  } catch (error) {
    console.error('[EXPLAIN] ERRO:', error.message);
  } finally {
    await connection.end();
  }
}

/**
 * Main: executa migration, valida e testa
 */
async function main() {
  console.log('='.repeat(60));
  console.log('MUL-31: Aplicar Migration Multi-Tenant');
  console.log('='.repeat(60));

  const migrationFile = path.join(__dirname, '001_multi_tenant_schema.sql');

  if (!fs.existsSync(migrationFile)) {
    console.error(`ERRO: Migration não encontrada em ${migrationFile}`);
    process.exit(1);
  }

  try {
    // 1. Aplicar migration
    await runMigration(migrationFile);

    // 2. Validar schema
    await validateSchema();

    // 3. Testar EXPLAIN
    await testExplain();

    console.log('\n' + '='.repeat(60));
    console.log('✓ SUCESSO: Migration multi-tenant completa!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('✗ FALHA na migration:', error.message);
    console.error('='.repeat(60));
    process.exit(1);
  }
}

// Executar se chamado diretamente (não require)
if (require.main === module) {
  main().catch(error => {
    console.error('Erro fatal:', error);
    process.exit(1);
  });
}

module.exports = { runMigration, validateSchema, testExplain };
