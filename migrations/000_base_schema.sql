-- MUL-38: Schema base — criação das tabelas de negócio do zero
-- Migration idempotente: rodar múltiplas vezes é seguro (não quebra)
-- Autor: Rafael von Siemens
-- Data: 2026-07-24

-- Esta migration cria as 6 tabelas essenciais do CRM a partir do zero.
-- A 001_multi_tenant_schema.sql (que roda logo após) adiciona a coluna tenant_id em cada uma.

-- ========================================
-- 1. LEADS
-- ========================================
CREATE TABLE IF NOT EXISTS leads (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    whatsapp VARCHAR(20) NOT NULL,
    treatment VARCHAR(255) NOT NULL,
    message TEXT,
    score_result VARCHAR(255) DEFAULT NULL,
    salesperson_id VARCHAR(50) DEFAULT NULL,
    date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status ENUM('novo', 'contatado', 'agendado', 'arquivado') DEFAULT 'novo'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- 2. CLIENTS
-- ========================================
CREATE TABLE IF NOT EXISTS clients (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- 3. TREATMENTS
-- ========================================
CREATE TABLE IF NOT EXISTS treatments (
    id VARCHAR(50) PRIMARY KEY,
    client_id VARCHAR(50) NOT NULL,
    procedure_name VARCHAR(255) NOT NULL,
    session_date DATE NOT NULL,
    notes TEXT,
    next_session_date DATE,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- 4. INTERACTIONS
-- ========================================
CREATE TABLE IF NOT EXISTS interactions (
    id VARCHAR(50) PRIMARY KEY,
    client_id VARCHAR(50) NOT NULL,
    type VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    direction ENUM('in', 'out') NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- 5. SALESPEOPLE
-- ========================================
CREATE TABLE IF NOT EXISTS salespeople (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    whatsapp VARCHAR(20) NOT NULL,
    role VARCHAR(100) NOT NULL,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- 6. TREATMENT_CATALOG
-- ========================================
CREATE TABLE IF NOT EXISTS treatment_catalog (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    duration VARCHAR(50) NOT NULL,
    description TEXT,
    target_regions TEXT,
    restrictions TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- 7. TREATMENT_PLANS
-- ========================================
CREATE TABLE IF NOT EXISTS treatment_plans (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- 8. TREATMENT_SESSIONS
-- ========================================
-- Nota: esta tabela estava faltando no app.js mas é referenciada na 001.
-- Criando-a aqui para completude do schema base.
CREATE TABLE IF NOT EXISTS treatment_sessions (
    id VARCHAR(50) PRIMARY KEY,
    plan_id VARCHAR(50) NOT NULL,
    session_number INT NOT NULL,
    scheduled_date DATE,
    completed_date DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDENTE',
    notes TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plan_id) REFERENCES treatment_plans(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- FIM DA MIGRATION 000
-- ========================================
