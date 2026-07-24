# MUL-31: Deploy Guide — Migration Multi-Tenant

## Pré-Deploy Checklist

Antes de aplicar a migration em staging/produção:

- [ ] Backup completo do banco de dados
- [ ] Confirmar credenciais do banco em `.env` (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME)
- [ ] Testar migration em ambiente local ou clone
- [ ] Verificar se o banco aceita `multipleStatements: true` (alguns hosts bloqueiam)
- [ ] Ter rollback plan (restore do backup)

---

## Deploy em Staging (Clone/Sandbox)

### 1. Backup
```bash
# MySQL dump completo antes da migration
mysqldump -h <host> -u <user> -p <database> > backup_pre_mul31_$(date +%Y%m%d_%H%M%S).sql
```

### 2. Aplicar Migration
```bash
cd /caminho/para/Musa-CRM
npm run migrate
```

### 3. Validar
Verificar saída do script:
- ✓ Todas as 8 tabelas com `tenant_id NOT NULL`
- ✓ Tabela `tenants` criada
- ✓ Índices compostos criados
- ✓ EXPLAIN usa índice `tenant_id`

### 4. Smoke Test
```bash
# Conectar ao banco e verificar
mysql -h <host> -u <user> -p <database>

-- Listar tenants
SELECT * FROM tenants;

-- Verificar tenant_id em leads
SELECT id, name, tenant_id FROM leads LIMIT 5;

-- EXPLAIN query
EXPLAIN SELECT * FROM leads WHERE tenant_id = 'tenant_legacy' ORDER BY date DESC LIMIT 10;
```

---

## Deploy em Produção

**ATENÇÃO: Aguardar revisão da Silvia antes de aplicar em produção.**

### Janela de Manutenção
- A migration altera schema de todas as tabelas de negócio
- Tabelas pequenas (< 10k rows): ~10-30 segundos
- Tabelas médias (10k-100k rows): ~1-5 minutos
- Considere maintenance mode ou low-traffic window

### Steps
1. **Comunicar:** Avisar stakeholders da janela de manutenção
2. **Backup:** Dump completo do banco (ver comando acima)
3. **Aplicar:** `npm run migrate` em produção
4. **Validar:** Rodar smoke tests
5. **Rollback Plan:** Se falhar, restaurar backup e reverter

### Rollback (Se Necessário)
```bash
# Restaurar backup
mysql -h <host> -u <user> -p <database> < backup_pre_mul31_TIMESTAMP.sql

# Verificar integridade
SELECT COUNT(*) FROM leads;
SELECT COUNT(*) FROM clients;
```

---

## Troubleshooting em Produção

### Migration falha com "Multiple statements not allowed"
**Solução:** Alguns hosts MySQL bloqueiam `multipleStatements`. Rodar migration direto via mysql CLI:
```bash
mysql -h <host> -u <user> -p <database> < migrations/001_multi_tenant_schema.sql
```

### Migration falha em "ALTER TABLE ... ADD COLUMN"
**Causa:** Coluna `tenant_id` já existe (re-run parcial).  
**Ação:** Migration é idempotente — rodar novamente completará as etapas faltantes.

### EXPLAIN mostra "type: ALL" (full scan)
**Causa:** Estatísticas do índice não atualizadas.  
**Solução:**
```sql
ANALYZE TABLE leads;
ANALYZE TABLE clients;
-- ... para todas as 8 tabelas
```

### Performance degradada após migration
**Diagnóstico:**
```sql
-- Verificar se índices foram criados
SHOW INDEX FROM leads;

-- Verificar tamanho das tabelas
SELECT 
    TABLE_NAME, 
    TABLE_ROWS, 
    ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2) AS size_mb
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE();
```

---

## Post-Deploy Monitoring

Após deploy em produção, monitorar por 24-48h:

### Queries Lentas
```sql
-- Ativar slow query log (se ainda não estiver)
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 2;

-- Verificar queries lentas após migration
SELECT * FROM mysql.slow_log WHERE start_time > NOW() - INTERVAL 1 HOUR;
```

### Uso de Índices
```sql
-- Handler stats para verificar eficiência de índice
SHOW GLOBAL STATUS LIKE 'Handler_read%';
```

Se `Handler_read_rnd_next` crescer muito vs `Handler_read_key`, índices não estão sendo usados eficientemente.

---

## Comunicação com Stakeholders

### Template de Comunicação — PRÉ Deploy

**Assunto:** [Manutenção] Multi-Tenant Migration — Musa CRM  
**Para:** Edgar, Silvia, Time Produto

Vamos aplicar a migration MUL-31 (schema multi-tenant) em **[DATA/HORA]**.

**Impacto:**
- Downtime estimado: 2-5 minutos
- Sistema ficará indisponível durante aplicação
- Nenhuma perda de dados (migration é aditiva)

**Rollback:** Backup completo será feito antes. Em caso de falha, restore em < 10 min.

**Validação:** Script de validação automática confirmará sucesso.

### Template de Comunicação — PÓS Deploy

**Assunto:** [Concluído] Multi-Tenant Migration — Musa CRM  
**Para:** Edgar, Silvia, Time Produto

Migration MUL-31 aplicada com **sucesso** em [DATA/HORA].

**Resultados:**
- ✓ Tabela `tenants` criada
- ✓ 8 tabelas de negócio com `tenant_id` NOT NULL
- ✓ Índices compostos criados e funcionais
- ✓ EXPLAIN confirma uso de índice (sem full scan)
- ✓ Smoke tests passaram

Sistema está operacional. Monitoramento ativo por 24h.

---

## Autor
Rafael von Siemens — MUL-31 — 2026-07-23
