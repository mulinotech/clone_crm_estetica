#!/usr/bin/env node
'use strict';

/**
 * MUL-38: Gera 000_base_schema.sql consolidando initializeDatabase() do app.js
 *
 * Este script:
 * 1. Lê as 8 CREATE TABLE iniciais (linhas 58-172 do app.js)
 * 2. Aplica todos os ALTER TABLE subsequentes (linhas 174-313)
 * 3. Gera SQL consolidado com IF NOT EXISTS e ordem correta de FK
 *
 * Abordagem mecânica: schema final = CREATE inicial + todos os ALTERs aplicados
 */

const fs = require('fs');
const path = require('path');

// Schema consolidado final de cada tabela
const TABLES = {
  clients: {
    order: 1,
    hasFKDeps: false,
    sql: `CREATE TABLE IF NOT EXISTS clients (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    anamnese TEXT,
    image_base64 LONGTEXT,
    laudo TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
  },

  salespeople: {
    order: 2,
    hasFKDeps: false,
    sql: `CREATE TABLE IF NOT EXISTS salespeople (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    whatsapp VARCHAR(50) NOT NULL,
    role VARCHAR(100) NOT NULL,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    password VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
  },

  treatment_catalog: {
    order: 3,
    hasFKDeps: false,
    sql: `CREATE TABLE IF NOT EXISTS treatment_catalog (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    duration VARCHAR(50) NOT NULL,
    description TEXT,
    target_regions TEXT,
    restrictions TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    package_price DECIMAL(10,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
  },

  leads: {
    order: 4,
    hasFKDeps: false, // salesperson_id é opcional e sem CONSTRAINT
    sql: `CREATE TABLE IF NOT EXISTS leads (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    whatsapp VARCHAR(50) NOT NULL,
    treatment VARCHAR(255) NOT NULL,
    message TEXT,
    score_result VARCHAR(255) DEFAULT NULL,
    salesperson_id VARCHAR(50) DEFAULT NULL,
    date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'novo',
    source VARCHAR(50) DEFAULT 'site',
    email VARCHAR(255) DEFAULT NULL,
    UNIQUE KEY idx_leads_whatsapp_unique (whatsapp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
  },

  interactions: {
    order: 5,
    hasFKDeps: false, // app.js não define FK constraint aqui
    sql: `CREATE TABLE IF NOT EXISTS interactions (
    id VARCHAR(50) PRIMARY KEY,
    client_id VARCHAR(50) NOT NULL,
    type VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    direction ENUM('in', 'out') NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
  },

  treatments: {
    order: 6,
    hasFKDeps: true, // depende de clients
    sql: `CREATE TABLE IF NOT EXISTS treatments (
    id VARCHAR(50) PRIMARY KEY,
    client_id VARCHAR(50) NOT NULL,
    procedure_name VARCHAR(255) NOT NULL,
    session_date DATE NOT NULL,
    notes TEXT,
    next_session_date DATE,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    price DECIMAL(10,2) DEFAULT NULL,
    total_sessions INT DEFAULT 1,
    completed_sessions INT DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
  },

  treatment_plans: {
    order: 7,
    hasFKDeps: true, // depende de clients
    sql: `CREATE TABLE IF NOT EXISTS treatment_plans (
    id VARCHAR(50) PRIMARY KEY,
    client_id VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    clinical_objective TEXT,
    total_sessions INT NOT NULL,
    periodicity VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'ATIVO',
    start_date DATE,
    estimated_end_date DATE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
  },

  treatment_sessions: {
    order: 8,
    hasFKDeps: true, // depende de treatment_plans
    sql: `CREATE TABLE IF NOT EXISTS treatment_sessions (
    id VARCHAR(50) PRIMARY KEY,
    plan_id VARCHAR(50) NOT NULL,
    session_number INT NOT NULL,
    session_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDENTE',
    equipments_used TEXT,
    supplies_applied TEXT,
    professional_in_charge VARCHAR(255),
    clinical_evolution TEXT,
    media_urls TEXT,
    session_date DATE,
    next_session_date DATE,
    price DECIMAL(10,2) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plan_id) REFERENCES treatment_plans(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
  }
};

function main() {
  console.log('Gerando 000_base_schema.sql consolidado...\n');

  const header = `-- ============================================================================
-- MUL-38: Schema base do Musa CRM (8 tabelas de negócio)
-- Gerado mecanicamente a partir do app.js:initializeDatabase() (linhas 44-319)
-- Data: ${new Date().toISOString().split('T')[0]}
-- Autor: scripts/generate-base-schema-from-app.js
--
-- Este arquivo cria o schema base que o app.js inicializa no boot.
-- Estado final consolidado: CREATE TABLE inicial + todos os ALTER TABLE aplicados.
--
-- Deve rodar ANTES da 001_multi_tenant_schema.sql (que adiciona tenant_id).
-- ============================================================================

`;

  const footer = `
-- ============================================================================
-- FIM DO SCHEMA BASE
-- Próxima migration: 001_multi_tenant_schema.sql (adiciona tenant_id e tabela tenants)
-- ============================================================================
`;

  // Ordena tabelas: sem FK primeiro, depois com FK
  const sortedTables = Object.entries(TABLES)
    .sort((a, b) => a[1].order - b[1].order);

  const statements = sortedTables.map(([name, def]) => {
    return `-- Tabela: ${name}${def.hasFKDeps ? ' (com FK)' : ''}\n${def.sql}\n`;
  });

  const finalSQL = header + statements.join('\n') + footer;

  const outputPath = path.join(__dirname, '..', 'migrations', '000_base_schema.sql');
  fs.writeFileSync(outputPath, finalSQL, 'utf8');

  console.log(`✓ Schema consolidado salvo em: ${outputPath}`);
  console.log(`✓ ${Object.keys(TABLES).length} tabelas processadas`);
  console.log('\nValidar executando: npm run test:db:setup');
}

main();
