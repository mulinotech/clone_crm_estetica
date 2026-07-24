-- MUL-38: Fase 1 — Transformação multi-tenant (após schema base)
-- Migration idempotente: rodar múltiplas vezes é seguro (não quebra)
-- IMPORTANTE: Esta migration só funciona após a 000_base_schema.sql
-- Autor: Rafael von Siemens
-- Data: 2026-07-24 (revisão)

-- ========================================
-- 1. CRIAR TABELA TENANTS
-- ========================================
CREATE TABLE IF NOT EXISTS tenants (
    id VARCHAR(50) PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    dominio VARCHAR(255) NOT NULL UNIQUE COMMENT 'Domínio principal do tenant',
    dominios_alternativos TEXT COMMENT 'JSON array com domínios extras',
    instancia_whatsapp VARCHAR(255) COMMENT 'Nome da instância Evolution API',
    status ENUM('ativo', 'suspenso', 'teste') DEFAULT 'ativo',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_tenants_status (status),
    INDEX idx_tenants_dominio (dominio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- 2. ADICIONAR COLUNA tenant_id (idempotente)
-- ========================================
-- Bloco idempotente: ignora erro ER_DUP_FIELDNAME se coluna já existe

-- 2.1 Leads
SET @exist_leads := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                     WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 'leads'
                     AND COLUMN_NAME = 'tenant_id');
SET @sql_leads := IF(@exist_leads = 0,
    'ALTER TABLE leads ADD COLUMN tenant_id VARCHAR(50) COMMENT ''FK para tenants''',
    'SELECT ''Coluna tenant_id ja existe em leads'' AS info');
PREPARE stmt_leads FROM @sql_leads;
EXECUTE stmt_leads;
DEALLOCATE PREPARE stmt_leads;

-- 2.2 Clients
SET @exist_clients := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                       WHERE TABLE_SCHEMA = DATABASE()
                       AND TABLE_NAME = 'clients'
                       AND COLUMN_NAME = 'tenant_id');
SET @sql_clients := IF(@exist_clients = 0,
    'ALTER TABLE clients ADD COLUMN tenant_id VARCHAR(50) COMMENT ''FK para tenants''',
    'SELECT ''Coluna tenant_id ja existe em clients'' AS info');
PREPARE stmt_clients FROM @sql_clients;
EXECUTE stmt_clients;
DEALLOCATE PREPARE stmt_clients;

-- 2.3 Treatments
SET @exist_treatments := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                          WHERE TABLE_SCHEMA = DATABASE()
                          AND TABLE_NAME = 'treatments'
                          AND COLUMN_NAME = 'tenant_id');
SET @sql_treatments := IF(@exist_treatments = 0,
    'ALTER TABLE treatments ADD COLUMN tenant_id VARCHAR(50) COMMENT ''FK para tenants''',
    'SELECT ''Coluna tenant_id ja existe em treatments'' AS info');
PREPARE stmt_treatments FROM @sql_treatments;
EXECUTE stmt_treatments;
DEALLOCATE PREPARE stmt_treatments;

-- 2.4 Interactions
SET @exist_interactions := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                            WHERE TABLE_SCHEMA = DATABASE()
                            AND TABLE_NAME = 'interactions'
                            AND COLUMN_NAME = 'tenant_id');
SET @sql_interactions := IF(@exist_interactions = 0,
    'ALTER TABLE interactions ADD COLUMN tenant_id VARCHAR(50) COMMENT ''FK para tenants''',
    'SELECT ''Coluna tenant_id ja existe em interactions'' AS info');
PREPARE stmt_interactions FROM @sql_interactions;
EXECUTE stmt_interactions;
DEALLOCATE PREPARE stmt_interactions;

-- 2.5 Salespeople
SET @exist_salespeople := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                           WHERE TABLE_SCHEMA = DATABASE()
                           AND TABLE_NAME = 'salespeople'
                           AND COLUMN_NAME = 'tenant_id');
SET @sql_salespeople := IF(@exist_salespeople = 0,
    'ALTER TABLE salespeople ADD COLUMN tenant_id VARCHAR(50) COMMENT ''FK para tenants''',
    'SELECT ''Coluna tenant_id ja existe em salespeople'' AS info');
PREPARE stmt_salespeople FROM @sql_salespeople;
EXECUTE stmt_salespeople;
DEALLOCATE PREPARE stmt_salespeople;

-- 2.6 Treatment_catalog
SET @exist_treatment_catalog := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                                 WHERE TABLE_SCHEMA = DATABASE()
                                 AND TABLE_NAME = 'treatment_catalog'
                                 AND COLUMN_NAME = 'tenant_id');
SET @sql_treatment_catalog := IF(@exist_treatment_catalog = 0,
    'ALTER TABLE treatment_catalog ADD COLUMN tenant_id VARCHAR(50) COMMENT ''FK para tenants''',
    'SELECT ''Coluna tenant_id ja existe em treatment_catalog'' AS info');
PREPARE stmt_treatment_catalog FROM @sql_treatment_catalog;
EXECUTE stmt_treatment_catalog;
DEALLOCATE PREPARE stmt_treatment_catalog;

-- 2.7 Treatment_plans
SET @exist_treatment_plans := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                               WHERE TABLE_SCHEMA = DATABASE()
                               AND TABLE_NAME = 'treatment_plans'
                               AND COLUMN_NAME = 'tenant_id');
SET @sql_treatment_plans := IF(@exist_treatment_plans = 0,
    'ALTER TABLE treatment_plans ADD COLUMN tenant_id VARCHAR(50) COMMENT ''FK para tenants''',
    'SELECT ''Coluna tenant_id ja existe em treatment_plans'' AS info');
PREPARE stmt_treatment_plans FROM @sql_treatment_plans;
EXECUTE stmt_treatment_plans;
DEALLOCATE PREPARE stmt_treatment_plans;

-- 2.8 Treatment_sessions
SET @exist_treatment_sessions := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                                  WHERE TABLE_SCHEMA = DATABASE()
                                  AND TABLE_NAME = 'treatment_sessions'
                                  AND COLUMN_NAME = 'tenant_id');
SET @sql_treatment_sessions := IF(@exist_treatment_sessions = 0,
    'ALTER TABLE treatment_sessions ADD COLUMN tenant_id VARCHAR(50) COMMENT ''FK para tenants''',
    'SELECT ''Coluna tenant_id ja existe em treatment_sessions'' AS info');
PREPARE stmt_treatment_sessions FROM @sql_treatment_sessions;
EXECUTE stmt_treatment_sessions;
DEALLOCATE PREPARE stmt_treatment_sessions;

-- ========================================
-- 3. POPULAR tenant_id COM VALOR DEFAULT (se NULL)
-- ========================================
-- Criar tenant padrão para dados legados se não existir
INSERT IGNORE INTO tenants (id, nome, dominio, instancia_whatsapp, status)
VALUES ('tenant_legacy', 'Nathi Estética (Legacy)', 'nathi-estetica.legacy.local', 'Nathi_Estetica_Oficial', 'ativo');

-- Popular tenant_id nas tabelas onde estiver NULL
UPDATE leads SET tenant_id = 'tenant_legacy' WHERE tenant_id IS NULL;
UPDATE clients SET tenant_id = 'tenant_legacy' WHERE tenant_id IS NULL;
UPDATE treatments SET tenant_id = 'tenant_legacy' WHERE tenant_id IS NULL;
UPDATE interactions SET tenant_id = 'tenant_legacy' WHERE tenant_id IS NULL;
UPDATE salespeople SET tenant_id = 'tenant_legacy' WHERE tenant_id IS NULL;
UPDATE treatment_catalog SET tenant_id = 'tenant_legacy' WHERE tenant_id IS NULL;
UPDATE treatment_plans SET tenant_id = 'tenant_legacy' WHERE tenant_id IS NULL;
UPDATE treatment_sessions SET tenant_id = 'tenant_legacy' WHERE tenant_id IS NULL;

-- ========================================
-- 4. TORNAR tenant_id NOT NULL (idempotente)
-- ========================================
-- Só aplica NOT NULL se a coluna existir e não for NOT NULL ainda

SET @null_leads := (SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                    AND TABLE_NAME = 'leads'
                    AND COLUMN_NAME = 'tenant_id');
SET @sql_nn_leads := IF(@null_leads = 'YES',
    'ALTER TABLE leads MODIFY COLUMN tenant_id VARCHAR(50) NOT NULL COMMENT ''FK para tenants''',
    'SELECT ''tenant_id ja e NOT NULL em leads'' AS info');
PREPARE stmt_nn_leads FROM @sql_nn_leads;
EXECUTE stmt_nn_leads;
DEALLOCATE PREPARE stmt_nn_leads;

SET @null_clients := (SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
                      WHERE TABLE_SCHEMA = DATABASE()
                      AND TABLE_NAME = 'clients'
                      AND COLUMN_NAME = 'tenant_id');
SET @sql_nn_clients := IF(@null_clients = 'YES',
    'ALTER TABLE clients MODIFY COLUMN tenant_id VARCHAR(50) NOT NULL COMMENT ''FK para tenants''',
    'SELECT ''tenant_id ja e NOT NULL em clients'' AS info');
PREPARE stmt_nn_clients FROM @sql_nn_clients;
EXECUTE stmt_nn_clients;
DEALLOCATE PREPARE stmt_nn_clients;

SET @null_treatments := (SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
                         WHERE TABLE_SCHEMA = DATABASE()
                         AND TABLE_NAME = 'treatments'
                         AND COLUMN_NAME = 'tenant_id');
SET @sql_nn_treatments := IF(@null_treatments = 'YES',
    'ALTER TABLE treatments MODIFY COLUMN tenant_id VARCHAR(50) NOT NULL COMMENT ''FK para tenants''',
    'SELECT ''tenant_id ja e NOT NULL em treatments'' AS info');
PREPARE stmt_nn_treatments FROM @sql_nn_treatments;
EXECUTE stmt_nn_treatments;
DEALLOCATE PREPARE stmt_nn_treatments;

SET @null_interactions := (SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
                           WHERE TABLE_SCHEMA = DATABASE()
                           AND TABLE_NAME = 'interactions'
                           AND COLUMN_NAME = 'tenant_id');
SET @sql_nn_interactions := IF(@null_interactions = 'YES',
    'ALTER TABLE interactions MODIFY COLUMN tenant_id VARCHAR(50) NOT NULL COMMENT ''FK para tenants''',
    'SELECT ''tenant_id ja e NOT NULL em interactions'' AS info');
PREPARE stmt_nn_interactions FROM @sql_nn_interactions;
EXECUTE stmt_nn_interactions;
DEALLOCATE PREPARE stmt_nn_interactions;

SET @null_salespeople := (SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
                          WHERE TABLE_SCHEMA = DATABASE()
                          AND TABLE_NAME = 'salespeople'
                          AND COLUMN_NAME = 'tenant_id');
SET @sql_nn_salespeople := IF(@null_salespeople = 'YES',
    'ALTER TABLE salespeople MODIFY COLUMN tenant_id VARCHAR(50) NOT NULL COMMENT ''FK para tenants''',
    'SELECT ''tenant_id ja e NOT NULL em salespeople'' AS info');
PREPARE stmt_nn_salespeople FROM @sql_nn_salespeople;
EXECUTE stmt_nn_salespeople;
DEALLOCATE PREPARE stmt_nn_salespeople;

SET @null_treatment_catalog := (SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
                                WHERE TABLE_SCHEMA = DATABASE()
                                AND TABLE_NAME = 'treatment_catalog'
                                AND COLUMN_NAME = 'tenant_id');
SET @sql_nn_treatment_catalog := IF(@null_treatment_catalog = 'YES',
    'ALTER TABLE treatment_catalog MODIFY COLUMN tenant_id VARCHAR(50) NOT NULL COMMENT ''FK para tenants''',
    'SELECT ''tenant_id ja e NOT NULL em treatment_catalog'' AS info');
PREPARE stmt_nn_treatment_catalog FROM @sql_nn_treatment_catalog;
EXECUTE stmt_nn_treatment_catalog;
DEALLOCATE PREPARE stmt_nn_treatment_catalog;

SET @null_treatment_plans := (SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
                              WHERE TABLE_SCHEMA = DATABASE()
                              AND TABLE_NAME = 'treatment_plans'
                              AND COLUMN_NAME = 'tenant_id');
SET @sql_nn_treatment_plans := IF(@null_treatment_plans = 'YES',
    'ALTER TABLE treatment_plans MODIFY COLUMN tenant_id VARCHAR(50) NOT NULL COMMENT ''FK para tenants''',
    'SELECT ''tenant_id ja e NOT NULL em treatment_plans'' AS info');
PREPARE stmt_nn_treatment_plans FROM @sql_nn_treatment_plans;
EXECUTE stmt_nn_treatment_plans;
DEALLOCATE PREPARE stmt_nn_treatment_plans;

SET @null_treatment_sessions := (SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
                                 WHERE TABLE_SCHEMA = DATABASE()
                                 AND TABLE_NAME = 'treatment_sessions'
                                 AND COLUMN_NAME = 'tenant_id');
SET @sql_nn_treatment_sessions := IF(@null_treatment_sessions = 'YES',
    'ALTER TABLE treatment_sessions MODIFY COLUMN tenant_id VARCHAR(50) NOT NULL COMMENT ''FK para tenants''',
    'SELECT ''tenant_id ja e NOT NULL em treatment_sessions'' AS info');
PREPARE stmt_nn_treatment_sessions FROM @sql_nn_treatment_sessions;
EXECUTE stmt_nn_treatment_sessions;
DEALLOCATE PREPARE stmt_nn_treatment_sessions;

-- ========================================
-- 5. ADICIONAR FOREIGN KEYS (idempotente)
-- ========================================
-- Bloco idempotente: ignora erro ER_DUP_KEYNAME se FK já existe

SET @fk_exists_leads := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                         WHERE TABLE_SCHEMA = DATABASE()
                         AND TABLE_NAME = 'leads'
                         AND CONSTRAINT_NAME = 'fk_leads_tenant');
SET @sql_fk_leads := IF(@fk_exists_leads = 0,
    'ALTER TABLE leads ADD CONSTRAINT fk_leads_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT',
    'SELECT ''FK fk_leads_tenant ja existe'' AS info');
PREPARE stmt_fk_leads FROM @sql_fk_leads;
EXECUTE stmt_fk_leads;
DEALLOCATE PREPARE stmt_fk_leads;

SET @fk_exists_clients := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                           WHERE TABLE_SCHEMA = DATABASE()
                           AND TABLE_NAME = 'clients'
                           AND CONSTRAINT_NAME = 'fk_clients_tenant');
SET @sql_fk_clients := IF(@fk_exists_clients = 0,
    'ALTER TABLE clients ADD CONSTRAINT fk_clients_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT',
    'SELECT ''FK fk_clients_tenant ja existe'' AS info');
PREPARE stmt_fk_clients FROM @sql_fk_clients;
EXECUTE stmt_fk_clients;
DEALLOCATE PREPARE stmt_fk_clients;

SET @fk_exists_treatments := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                              WHERE TABLE_SCHEMA = DATABASE()
                              AND TABLE_NAME = 'treatments'
                              AND CONSTRAINT_NAME = 'fk_treatments_tenant');
SET @sql_fk_treatments := IF(@fk_exists_treatments = 0,
    'ALTER TABLE treatments ADD CONSTRAINT fk_treatments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT',
    'SELECT ''FK fk_treatments_tenant ja existe'' AS info');
PREPARE stmt_fk_treatments FROM @sql_fk_treatments;
EXECUTE stmt_fk_treatments;
DEALLOCATE PREPARE stmt_fk_treatments;

SET @fk_exists_interactions := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                                WHERE TABLE_SCHEMA = DATABASE()
                                AND TABLE_NAME = 'interactions'
                                AND CONSTRAINT_NAME = 'fk_interactions_tenant');
SET @sql_fk_interactions := IF(@fk_exists_interactions = 0,
    'ALTER TABLE interactions ADD CONSTRAINT fk_interactions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT',
    'SELECT ''FK fk_interactions_tenant ja existe'' AS info');
PREPARE stmt_fk_interactions FROM @sql_fk_interactions;
EXECUTE stmt_fk_interactions;
DEALLOCATE PREPARE stmt_fk_interactions;

SET @fk_exists_salespeople := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                               WHERE TABLE_SCHEMA = DATABASE()
                               AND TABLE_NAME = 'salespeople'
                               AND CONSTRAINT_NAME = 'fk_salespeople_tenant');
SET @sql_fk_salespeople := IF(@fk_exists_salespeople = 0,
    'ALTER TABLE salespeople ADD CONSTRAINT fk_salespeople_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT',
    'SELECT ''FK fk_salespeople_tenant ja existe'' AS info');
PREPARE stmt_fk_salespeople FROM @sql_fk_salespeople;
EXECUTE stmt_fk_salespeople;
DEALLOCATE PREPARE stmt_fk_salespeople;

SET @fk_exists_treatment_catalog := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                                     WHERE TABLE_SCHEMA = DATABASE()
                                     AND TABLE_NAME = 'treatment_catalog'
                                     AND CONSTRAINT_NAME = 'fk_treatment_catalog_tenant');
SET @sql_fk_treatment_catalog := IF(@fk_exists_treatment_catalog = 0,
    'ALTER TABLE treatment_catalog ADD CONSTRAINT fk_treatment_catalog_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT',
    'SELECT ''FK fk_treatment_catalog_tenant ja existe'' AS info');
PREPARE stmt_fk_treatment_catalog FROM @sql_fk_treatment_catalog;
EXECUTE stmt_fk_treatment_catalog;
DEALLOCATE PREPARE stmt_fk_treatment_catalog;

SET @fk_exists_treatment_plans := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                                   WHERE TABLE_SCHEMA = DATABASE()
                                   AND TABLE_NAME = 'treatment_plans'
                                   AND CONSTRAINT_NAME = 'fk_treatment_plans_tenant');
SET @sql_fk_treatment_plans := IF(@fk_exists_treatment_plans = 0,
    'ALTER TABLE treatment_plans ADD CONSTRAINT fk_treatment_plans_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT',
    'SELECT ''FK fk_treatment_plans_tenant ja existe'' AS info');
PREPARE stmt_fk_treatment_plans FROM @sql_fk_treatment_plans;
EXECUTE stmt_fk_treatment_plans;
DEALLOCATE PREPARE stmt_fk_treatment_plans;

SET @fk_exists_treatment_sessions := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                                      WHERE TABLE_SCHEMA = DATABASE()
                                      AND TABLE_NAME = 'treatment_sessions'
                                      AND CONSTRAINT_NAME = 'fk_treatment_sessions_tenant');
SET @sql_fk_treatment_sessions := IF(@fk_exists_treatment_sessions = 0,
    'ALTER TABLE treatment_sessions ADD CONSTRAINT fk_treatment_sessions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT',
    'SELECT ''FK fk_treatment_sessions_tenant ja existe'' AS info');
PREPARE stmt_fk_treatment_sessions FROM @sql_fk_treatment_sessions;
EXECUTE stmt_fk_treatment_sessions;
DEALLOCATE PREPARE stmt_fk_treatment_sessions;

-- ========================================
-- 6. CRIAR ÍNDICES COMPOSTOS iniciados por tenant_id (idempotente)
-- ========================================
-- Performance: tenant_id sempre vem primeiro para bater WHERE tenant_id = ? queries

SET @idx_exists_leads_tenant_date := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
                                      WHERE TABLE_SCHEMA = DATABASE()
                                      AND TABLE_NAME = 'leads'
                                      AND INDEX_NAME = 'idx_leads_tenant_date');
SET @sql_idx_leads := IF(@idx_exists_leads_tenant_date = 0,
    'CREATE INDEX idx_leads_tenant_date ON leads (tenant_id, date DESC)',
    'SELECT ''Indice idx_leads_tenant_date ja existe'' AS info');
PREPARE stmt_idx_leads FROM @sql_idx_leads;
EXECUTE stmt_idx_leads;
DEALLOCATE PREPARE stmt_idx_leads;

SET @idx_exists_clients_tenant_name := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
                                        WHERE TABLE_SCHEMA = DATABASE()
                                        AND TABLE_NAME = 'clients'
                                        AND INDEX_NAME = 'idx_clients_tenant_name');
SET @sql_idx_clients := IF(@idx_exists_clients_tenant_name = 0,
    'CREATE INDEX idx_clients_tenant_name ON clients (tenant_id, name)',
    'SELECT ''Indice idx_clients_tenant_name ja existe'' AS info');
PREPARE stmt_idx_clients FROM @sql_idx_clients;
EXECUTE stmt_idx_clients;
DEALLOCATE PREPARE stmt_idx_clients;

SET @idx_exists_treatments_tenant_date := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
                                           WHERE TABLE_SCHEMA = DATABASE()
                                           AND TABLE_NAME = 'treatments'
                                           AND INDEX_NAME = 'idx_treatments_tenant_date');
SET @sql_idx_treatments := IF(@idx_exists_treatments_tenant_date = 0,
    'CREATE INDEX idx_treatments_tenant_date ON treatments (tenant_id, session_date DESC)',
    'SELECT ''Indice idx_treatments_tenant_date ja existe'' AS info');
PREPARE stmt_idx_treatments FROM @sql_idx_treatments;
EXECUTE stmt_idx_treatments;
DEALLOCATE PREPARE stmt_idx_treatments;

SET @idx_exists_interactions_tenant_created := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
                                                WHERE TABLE_SCHEMA = DATABASE()
                                                AND TABLE_NAME = 'interactions'
                                                AND INDEX_NAME = 'idx_interactions_tenant_created');
SET @sql_idx_interactions := IF(@idx_exists_interactions_tenant_created = 0,
    'CREATE INDEX idx_interactions_tenant_created ON interactions (tenant_id, created_at DESC)',
    'SELECT ''Indice idx_interactions_tenant_created ja existe'' AS info');
PREPARE stmt_idx_interactions FROM @sql_idx_interactions;
EXECUTE stmt_idx_interactions;
DEALLOCATE PREPARE stmt_idx_interactions;

SET @idx_exists_salespeople_tenant_status := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
                                              WHERE TABLE_SCHEMA = DATABASE()
                                              AND TABLE_NAME = 'salespeople'
                                              AND INDEX_NAME = 'idx_salespeople_tenant_status');
SET @sql_idx_salespeople := IF(@idx_exists_salespeople_tenant_status = 0,
    'CREATE INDEX idx_salespeople_tenant_status ON salespeople (tenant_id, status)',
    'SELECT ''Indice idx_salespeople_tenant_status ja existe'' AS info');
PREPARE stmt_idx_salespeople FROM @sql_idx_salespeople;
EXECUTE stmt_idx_salespeople;
DEALLOCATE PREPARE stmt_idx_salespeople;

SET @idx_exists_treatment_catalog_tenant := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
                                             WHERE TABLE_SCHEMA = DATABASE()
                                             AND TABLE_NAME = 'treatment_catalog'
                                             AND INDEX_NAME = 'idx_treatment_catalog_tenant');
SET @sql_idx_treatment_catalog := IF(@idx_exists_treatment_catalog_tenant = 0,
    'CREATE INDEX idx_treatment_catalog_tenant ON treatment_catalog (tenant_id)',
    'SELECT ''Indice idx_treatment_catalog_tenant ja existe'' AS info');
PREPARE stmt_idx_treatment_catalog FROM @sql_idx_treatment_catalog;
EXECUTE stmt_idx_treatment_catalog;
DEALLOCATE PREPARE stmt_idx_treatment_catalog;

SET @idx_exists_treatment_plans_tenant := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
                                           WHERE TABLE_SCHEMA = DATABASE()
                                           AND TABLE_NAME = 'treatment_plans'
                                           AND INDEX_NAME = 'idx_treatment_plans_tenant');
SET @sql_idx_treatment_plans := IF(@idx_exists_treatment_plans_tenant = 0,
    'CREATE INDEX idx_treatment_plans_tenant ON treatment_plans (tenant_id, status)',
    'SELECT ''Indice idx_treatment_plans_tenant ja existe'' AS info');
PREPARE stmt_idx_treatment_plans FROM @sql_idx_treatment_plans;
EXECUTE stmt_idx_treatment_plans;
DEALLOCATE PREPARE stmt_idx_treatment_plans;

SET @idx_exists_treatment_sessions_tenant := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
                                              WHERE TABLE_SCHEMA = DATABASE()
                                              AND TABLE_NAME = 'treatment_sessions'
                                              AND INDEX_NAME = 'idx_treatment_sessions_tenant');
SET @sql_idx_treatment_sessions := IF(@idx_exists_treatment_sessions_tenant = 0,
    'CREATE INDEX idx_treatment_sessions_tenant ON treatment_sessions (tenant_id, status)',
    'SELECT ''Indice idx_treatment_sessions_tenant ja existe'' AS info');
PREPARE stmt_idx_treatment_sessions FROM @sql_idx_treatment_sessions;
EXECUTE stmt_idx_treatment_sessions;
DEALLOCATE PREPARE stmt_idx_treatment_sessions;

-- ========================================
-- FIM DA MIGRATION 001
-- ========================================
