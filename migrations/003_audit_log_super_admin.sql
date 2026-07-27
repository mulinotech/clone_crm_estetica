-- MUL-34: Fase 4 — Tabela de Auditoria para Super-Admin Cross-Tenant
-- Migration idempotente para criar tabela de log de auditoria
-- Registra todos os acessos cross-tenant realizados por super-admins
-- Autor: Lucas Andrade
-- Data: 2026-07-27

-- ========================================
-- CRIAR TABELA audit_log
-- ========================================
-- Tabela cross-tenant (sem tenant_id) que registra ações de super-admin
-- Cada acesso cross-tenant gera uma linha de auditoria

CREATE TABLE IF NOT EXISTS audit_log (
    id VARCHAR(50) PRIMARY KEY,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Momento do acesso',
    admin_user VARCHAR(255) NOT NULL COMMENT 'Email ou ID do super-admin',
    action VARCHAR(100) NOT NULL COMMENT 'Tipo de ação (listAllTenants, selectCrossTenant, etc)',
    tenant_id VARCHAR(50) COMMENT 'Tenant afetado (NULL se ação global)',
    query_summary TEXT COMMENT 'Resumo da query executada (sem dados sensíveis)',
    result_count INT DEFAULT 0 COMMENT 'Quantidade de registros retornados/afetados',
    metadata TEXT COMMENT 'JSON com metadados adicionais (IP, user-agent, etc)',
    INDEX idx_audit_timestamp (timestamp DESC),
    INDEX idx_audit_admin (admin_user),
    INDEX idx_audit_action (action),
    INDEX idx_audit_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Log de auditoria para operações cross-tenant de super-admins';
