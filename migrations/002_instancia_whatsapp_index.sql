-- MUL-33: Adiciona índice na coluna instancia_whatsapp para otimizar resolução de tenant
-- Migration idempotente: rodar múltiplas vezes é seguro
-- Autor: Rafael von Siemens
-- Data: 2026-07-26

-- Criar índice único na instancia_whatsapp (se não existir)
-- Cada tenant tem uma instância WhatsApp dedicada (1:1)
SET @idx_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
                    WHERE TABLE_SCHEMA = DATABASE()
                    AND TABLE_NAME = 'tenants'
                    AND INDEX_NAME = 'idx_tenants_instancia_whatsapp');

SET @sql_idx := IF(@idx_exists = 0,
    'CREATE UNIQUE INDEX idx_tenants_instancia_whatsapp ON tenants (instancia_whatsapp)',
    'SELECT ''Indice idx_tenants_instancia_whatsapp ja existe'' AS info');

PREPARE stmt_idx FROM @sql_idx;
EXECUTE stmt_idx;
DEALLOCATE PREPARE stmt_idx;

-- FIM DA MIGRATION 002
