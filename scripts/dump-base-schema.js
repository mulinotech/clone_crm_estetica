#!/usr/bin/env node
'use strict';

/**
 * MUL-38: Gera 000_base_schema.sql mecanicamente
 *
 * Este script:
 * 1. Conecta em banco temporário vazio (musa_crm_dump_temp)
 * 2. Simula o boot do app.js para criar o schema base
 * 3. Extrai DDL via SHOW CREATE TABLE
 * 4. Salva em migrations/000_base_schema.sql com idempotência
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Configuração do banco temporário
const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  port: parseInt(process.env.DB_PORT || '3306'),
  multipleStatements: true
};

const TEMP_DB = 'musa_crm_dump_temp';
const TABLES_ORDER = [
  'clients',
  'salespeople',
  'treatment_catalog',
  'leads',
  'interactions',
  'treatments',
  'treatment_plans',
  'treatment_sessions'
];

async function main() {
  let connection;

  try {
    console.log('Conectando ao MySQL...');
    connection = await mysql.createConnection(dbConfig);

    // 1. Drop e recria banco temporário
    console.log(`\nRecriando banco temporário: ${TEMP_DB}`);
    await connection.query(`DROP DATABASE IF EXISTS ${TEMP_DB}`);
    await connection.query(`CREATE DATABASE ${TEMP_DB} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await connection.query(`USE ${TEMP_DB}`);

    // 2. Executa o SQL do initializeDatabase() do app.js
    console.log('\nCriando schema base via app.js...');
    const appInitSQL = await extractInitializeSQL();
    await connection.query(appInitSQL);

    // 3. Extrai DDL de cada tabela
    console.log('\nExtraindo DDL...');
    const ddlStatements = [];

    for (const table of TABLES_ORDER) {
      const [rows] = await connection.query(`SHOW CREATE TABLE ${table}`);
      if (rows.length > 0) {
        let createStmt = rows[0]['Create Table'];

        // Adiciona IF NOT EXISTS para idempotência
        createStmt = createStmt.replace(/^CREATE TABLE/, 'CREATE TABLE IF NOT EXISTS');

        ddlStatements.push(`-- Tabela: ${table}`);
        ddlStatements.push(createStmt + ';');
        ddlStatements.push('');
        console.log(`  ✓ ${table}`);
      }
    }

    // 4. Gera arquivo final
    const outputPath = path.join(__dirname, '..', 'migrations', '000_base_schema.sql');
    const header = `-- ============================================================================
-- MUL-38: Schema base do Musa CRM (8 tabelas de negócio)
-- Gerado mecanicamente via scripts/dump-base-schema.js
-- Data: ${new Date().toISOString().split('T')[0]}
-- Origem: app.js:initializeDatabase() + SHOW CREATE TABLE
--
-- Este arquivo cria o schema base que o app.js inicializa no boot.
-- Deve rodar ANTES da 001_multi_tenant_schema.sql (que adiciona tenant_id).
-- ============================================================================

`;

    const footer = `
-- ============================================================================
-- FIM DO SCHEMA BASE
-- Próxima migration: 001_multi_tenant_schema.sql (adiciona tenant_id e tabela tenants)
-- ============================================================================
`;

    const finalSQL = header + ddlStatements.join('\n') + footer;
    fs.writeFileSync(outputPath, finalSQL, 'utf8');

    console.log(`\n✓ Schema salvo em: ${outputPath}`);

    // 5. Cleanup: drop banco temporário
    await connection.query(`DROP DATABASE IF EXISTS ${TEMP_DB}`);
    console.log(`✓ Banco temporário removido`);

  } catch (error) {
    console.error('ERRO:', error.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * Extrai o SQL completo do initializeDatabase() do app.js
 * (todas as CREATE TABLE + todos os ALTER TABLE)
 */
async function extractInitializeSQL() {
  const appPath = path.join(__dirname, '..', 'app.js');
  const appContent = fs.readFileSync(appPath, 'utf8');

  // Localiza a função initializeDatabase
  const startMarker = 'async function initializeDatabase()';
  const endMarker = '} // fim initializeDatabase';

  const startIdx = appContent.indexOf(startMarker);
  if (startIdx === -1) throw new Error('Função initializeDatabase não encontrada');

  const endIdx = appContent.indexOf(endMarker, startIdx);
  if (endIdx === -1) throw new Error('Fim da função initializeDatabase não encontrado');

  const functionBody = appContent.substring(startIdx, endIdx);

  // Extrai todas as queries SQL (pattern: await conn.query(`...`))
  const sqlStatements = [];
  const queryRegex = /await\s+conn\.query\(\s*`([^`]+)`\s*\)/gs;
  let match;

  while ((match = queryRegex.exec(functionBody)) !== null) {
    const sql = match[1].trim();
    // Ignora checks e queries auxiliares
    if (!sql.startsWith('SELECT') && !sql.includes('information_schema')) {
      sqlStatements.push(sql);
    }
  }

  if (sqlStatements.length === 0) {
    throw new Error('Nenhuma query SQL encontrada no initializeDatabase');
  }

  console.log(`  Encontradas ${sqlStatements.length} queries SQL no app.js`);
  return sqlStatements.join(';\n') + ';';
}

main();
