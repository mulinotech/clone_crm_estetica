# MUL-38: Recomendação Técnica — Schema Base

**Autor:** Rafael von Siemens  
**Data:** 2026-07-23  
**Status:** Aguardando decisão da Silvia (CTO)

---

## Problema Identificado

A migration `001_multi_tenant_schema.sql` falha quando executada em um banco de dados vazio:

```
[MIGRATION] Aplicando: 001_multi_tenant_schema.sql
  ✗ ERRO: Table 'musa_crm_test.leads' doesn't exist
```

**Causa raiz:** A migration pressupõe que as 8 tabelas de negócio já existem (leads, clients, treatments, interactions, salespeople, treatment_catalog, treatment_plans, treatment_sessions), pois foi desenvolvida e testada contra um banco de desenvolvimento que já possuía essas tabelas criadas pelo boot do `app.js`.

**Implicação além do CI:** Atualmente não existe um caminho único e reproduzível de **banco vazio → schema completo**. Isso impacta:
- Setup de novos ambientes (staging com dados reais da Nathi — Fase 5)
- Provisionamento de novas clínicas (Fase 4)
- Reprodução confiável do estado do banco em testes e CI

---

## Opções Avaliadas

### Opção A: Criar `000_base_schema.sql` ✅ RECOMENDADO

**Descrição:** Extrair o schema das 8 tabelas base do `app.js` para uma migration `000_base_schema.sql`, rodando antes da `001`. Modificar o `app.js` para detectar quando migrations estão ativas e pular o auto-create nesse caso.

**Implementação proposta:**
1. Criar `migrations/000_base_schema.sql` com as 8 tabelas (cópia exata do DDL que está no `app.js`)
2. Adicionar env var `USE_MIGRATIONS=true` — quando ativa, `app.js` pula o `initializeDatabase()` das tabelas
3. `setup-test-db.js` e CI setam `USE_MIGRATIONS=true` antes de rodar migrations
4. Ambiente de produção atual (sem a var setada) mantém comportamento idêntico — **zero risco**

**Prós:**
- ✅ Caminho único e determinístico: migrations se tornam a **única fonte de verdade** do schema
- ✅ Elimina duplicação de DDL entre `app.js` e migrations (manutenção em 1 lugar só)
- ✅ Facilita criação de novos ambientes e provisionamento de clínicas
- ✅ Separação clara de responsabilidades: schema base (000) vs. multi-tenant (001)
- ✅ **Migração gradual e segura:** produção atual não muda; novos ambientes usam o caminho novo

**Contras:**
- ⚠️ Requer modificação no `app.js` (mas é controlada e segura via feature flag)
- ⚠️ Mudança estrutural (mas necessária para a Fase 4/5)

---

### Opção B: Fazer `001` criar tabelas se não existirem

**Descrição:** Adicionar blocos `CREATE TABLE IF NOT EXISTS` no início da `001_multi_tenant_schema.sql`, antes dos `ALTER TABLE`.

**Prós:**
- ✅ Mudança localizada (só na migration)
- ✅ Não toca no `app.js`

**Contras:**
- ❌ Duplica o DDL entre `app.js` e migration — **manutenção em 2 lugares**
- ❌ Migration fica "gorda" e com responsabilidades misturadas (criar schema base + adicionar multi-tenancy)
- ❌ Não resolve o problema fundamental: **duas fontes de verdade do schema**
- ❌ Mudança no schema base (ex: adicionar coluna em `leads`) precisa ser feita em 2 arquivos

---

## Recomendação Final

**Opção A** — criar `000_base_schema.sql` com feature flag no `app.js`.

**Justificativa técnica:**
1. **Evita duplicação de código:** DDL em um único lugar (migrations)
2. **Preparação para Fase 4/5:** necessário para provisionar novos tenants e validar staging
3. **Segurança:** migração gradual com zero impacto em produção (feature flag)
4. **Alinhamento com boas práticas:** migrations como única fonte de verdade do schema

**Abordagem de implementação:**
- Incremental e reversível
- Produção atual permanece inalterada (sem `USE_MIGRATIONS`)
- Novos ambientes (CI, staging, novas clínicas) usam o caminho de migrations
- Validamos o caminho novo sem afetar o existente

---

## Próximos Passos

**Aguardando decisão da Silvia (CTO):**
- [ ] Aprovar Opção A, Opção B, ou propor alternativa
- [ ] Após decisão, implementar a solução escolhida
- [ ] Validar `npm run test:db:setup` com banco vazio
- [ ] Confirmar CI verde (jobs `unit-tests` + `integration-tests`)

---

**Assinatura técnica:**  
Rafael von Siemens  
Desenvolvedor Fullstack Sênior — Musa CRM
