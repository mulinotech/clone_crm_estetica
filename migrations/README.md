# Migrations — Musa CRM Multi-Tenant

## MUL-31: Fase 1 — Schema Multi-Tenant

### Objetivo
Criar a base de dados multi-tenant com:
- Tabela `tenants`
- Coluna `tenant_id` (NOT NULL + FK) em todas as 8 tabelas de negócio
- Índices compostos iniciados por `tenant_id`
- Migration **idempotente** (rodar múltiplas vezes não quebra)

---

## Como Aplicar a Migration

### 1. Pré-requisitos
- Node.js instalado
- Arquivo `.env` configurado com credenciais do banco (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME)
- Banco MySQL 5.7+ ou MariaDB 10.3+

### 2. Executar Migration

```bash
# Ir para a pasta migrations
cd migrations

# Rodar o script
node run-migrations.js
```

### 3. Saída Esperada

```
============================================================
MUL-31: Aplicar Migration Multi-Tenant
============================================================

[MIGRATION] Iniciando: 001_multi_tenant_schema.sql
[MIGRATION] Executando SQL...
[MIGRATION] Sucesso! Migration aplicada.

[VALIDAÇÃO] Verificando schema multi-tenant...
  ✓ Tabela leads: tenant_id NOT NULL OK
  ✓ Tabela clients: tenant_id NOT NULL OK
  ✓ Tabela treatments: tenant_id NOT NULL OK
  ✓ Tabela interactions: tenant_id NOT NULL OK
  ✓ Tabela salespeople: tenant_id NOT NULL OK
  ✓ Tabela treatment_catalog: tenant_id NOT NULL OK
  ✓ Tabela treatment_plans: tenant_id NOT NULL OK
  ✓ Tabela treatment_sessions: tenant_id NOT NULL OK
  ✓ Tabela tenants: OK
  ✓ Índices compostos tenant_id: 8 encontrados

[VALIDAÇÃO] Schema multi-tenant VÁLIDO ✓

[EXPLAIN] Testando query com tenant_id...
[EXPLAIN] Resultado:
  ✓ Query utiliza índice tenant_id (sem full scan)

============================================================
✓ SUCESSO: Migration multi-tenant completa!
============================================================
```

---

## O que a Migration Faz

### 1. Cria tabela `tenants`
```sql
CREATE TABLE tenants (
    id VARCHAR(50) PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    dominio VARCHAR(255) NOT NULL UNIQUE,
    dominios_alternativos TEXT,
    instancia_whatsapp VARCHAR(255),
    status ENUM('ativo', 'suspenso', 'teste') DEFAULT 'ativo',
    ...
);
```

### 2. Adiciona coluna `tenant_id` em todas as tabelas de negócio
- leads
- clients
- treatments
- interactions
- salespeople
- treatment_catalog
- treatment_plans
- treatment_sessions

### 3. Popula `tenant_id` com valor default
- Cria tenant legacy `tenant_legacy` para dados existentes
- Atualiza todas as linhas NULL com o tenant legacy

### 4. Aplica NOT NULL constraint
- Garante que `tenant_id` é obrigatório

### 5. Adiciona Foreign Keys
- `tenant_id` → `tenants(id)` com ON DELETE RESTRICT

### 6. Cria Índices Compostos
Índices iniciados por `tenant_id` para otimizar queries multi-tenant:
- `idx_leads_tenant_date` em `(tenant_id, date DESC)`
- `idx_clients_tenant_name` em `(tenant_id, name)`
- `idx_treatments_tenant_date` em `(tenant_id, session_date DESC)`
- `idx_interactions_tenant_created` em `(tenant_id, created_at DESC)`
- `idx_salespeople_tenant_status` em `(tenant_id, status)`
- `idx_treatment_catalog_tenant` em `(tenant_id)`
- `idx_treatment_plans_tenant` em `(tenant_id, status)`
- `idx_treatment_sessions_tenant` em `(tenant_id, status)`

---

## Idempotência

A migration é **totalmente idempotente**:
- Rodar 2x, 3x ou 10x não causa erro
- Usa `IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS` (via prepared statements)
- Verifica INFORMATION_SCHEMA antes de aplicar mudanças

**Seguro para re-rodar em ambiente de staging/produção.**

---

## Validação Manual (SQL Direto)

Se preferir rodar direto no MySQL:

```bash
mysql -h <host> -u <user> -p <database> < 001_multi_tenant_schema.sql
```

Para validar:

```sql
-- Verificar se tenants existe
SHOW TABLES LIKE 'tenants';

-- Verificar tenant_id em leads
SHOW COLUMNS FROM leads LIKE 'tenant_id';

-- Listar índices compostos
SHOW INDEX FROM leads WHERE Key_name LIKE '%tenant%';

-- EXPLAIN de query multi-tenant
EXPLAIN SELECT * FROM leads WHERE tenant_id = 'tenant_legacy' ORDER BY date DESC LIMIT 10;
```

---

## Troubleshooting

### Erro: "Table 'tenants' doesn't exist"
- Rodar migration novamente — ela cria a tabela automaticamente.

### Erro: "Column 'tenant_id' cannot be null"
- Migration está em progresso, aguarde conclusão ou verifique se dados legados foram populados.

### EXPLAIN não usa índice tenant_id
- Verificar se índice foi criado: `SHOW INDEX FROM <table>;`
- Rodar `ANALYZE TABLE <table>;` para atualizar estatísticas.

---

## Próximos Passos (Fase 2+)

Após Fase 1 (schema), as próximas fases vão:
- **Fase 2**: Adicionar `WHERE tenant_id = ?` em todas as queries das rotas
- **Fase 3**: Middleware de detecção de tenant via domínio/subdomínio
- **Fase 4**: UI de admin para criar/editar tenants
- **Fase 5**: Seeds de dados por tenant

---

## Autor
Rafael von Siemens — MUL-31 — 2026-07-23
