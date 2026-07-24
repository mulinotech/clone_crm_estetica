-- ============================================================================
-- MUL-38: Schema base do Musa CRM (8 tabelas de negócio)
-- Gerado mecanicamente a partir do app.js:initializeDatabase() (linhas 44-319)
-- Data: 2026-07-24
-- Autor: scripts/generate-base-schema-from-app.js
--
-- Este arquivo cria o schema base que o app.js inicializa no boot.
-- Estado final consolidado: CREATE TABLE inicial + todos os ALTER TABLE aplicados.
--
-- Deve rodar ANTES da 001_multi_tenant_schema.sql (que adiciona tenant_id).
-- ============================================================================

-- Tabela: clients
CREATE TABLE IF NOT EXISTS clients (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    anamnese TEXT,
    image_base64 LONGTEXT,
    laudo TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela: salespeople
CREATE TABLE IF NOT EXISTS salespeople (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    whatsapp VARCHAR(50) NOT NULL,
    role VARCHAR(100) NOT NULL,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    password VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela: treatment_catalog
CREATE TABLE IF NOT EXISTS treatment_catalog (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    duration VARCHAR(50) NOT NULL,
    description TEXT,
    target_regions TEXT,
    restrictions TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    package_price DECIMAL(10,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela: leads
CREATE TABLE IF NOT EXISTS leads (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela: interactions
CREATE TABLE IF NOT EXISTS interactions (
    id VARCHAR(50) PRIMARY KEY,
    client_id VARCHAR(50) NOT NULL,
    type VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    direction ENUM('in', 'out') NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela: treatments (com FK)
CREATE TABLE IF NOT EXISTS treatments (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela: treatment_plans (com FK)
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

-- Tabela: treatment_sessions (com FK)
CREATE TABLE IF NOT EXISTS treatment_sessions (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- FIM DO SCHEMA BASE
-- Próxima migration: 001_multi_tenant_schema.sql (adiciona tenant_id e tabela tenants)
-- ============================================================================
