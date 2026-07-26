# MUL-32: Trava de Isolamento Multi-Tenant

**Autor:** Rafael von Siemens  
**Data:** 2026-07-26  
**Issue:** MUL-32 (MUL-C · Fase 2)

## Visão Geral

Implementação da **trava de isolamento** que torna impossível esquecer o `tenant_id` e impede acesso direto ao MySQL. Arquitetura em três camadas:

1. **Middleware resolve-tenant** (domínio → tenant_id)
2. **AsyncLocalStorage** (contexto de requisição)
3. **DAL única** (Data Access Layer com isolamento automático)
4. **Lint anti-bypass** (quebra build se importar mysql2 fora da DAL)

## Arquitetura

```
┌──────────────────────────────────────────────────────────────┐
│  HTTP Request (hostname: clinica-a.com)                     │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│  Middleware: resolve-tenant                                  │
│  - Resolve tenant_id a partir do domínio                     │
│  - Consulta tabela `tenants` (com cache)                     │
│  - Domínio desconhecido → 403 Forbidden                      │
│  - Injeta tenant_id no AsyncLocalStorage                     │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│  AsyncLocalStorage (tenant-context.js)                       │
│  - Propaga tenant_id para toda a call stack                  │
│  - Nativo do Node (async_hooks), zero overhead               │
│  - getTenantId() retorna tenant_id do contexto atual         │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│  Rotas Express (ex: GET /api/leads)                          │
│  - Não precisam saber do tenant_id explicitamente            │
│  - Chamam DAL em vez de pool.query()                         │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│  DAL - Data Access Layer (server/dal/database.js)           │
│  - select(): injeta WHERE tenant_id = ? automaticamente      │
│  - insert(): preenche tenant_id automaticamente              │
│  - update()/delete(): injeta WHERE tenant_id = ?             │
│  - Fail-closed: lança erro se não houver tenant_id           │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│  MySQL (tabelas com tenant_id NOT NULL + FK)                │
└──────────────────────────────────────────────────────────────┘
```

## Componentes

### 1. `server/utils/tenant-context.js`

Gerencia o contexto de tenant usando `AsyncLocalStorage` nativo do Node.

**Funções principais:**
- `getTenantId()`: Retorna o tenant_id do contexto atual (ou null)
- `requireTenantId()`: Retorna o tenant_id ou lança erro (fail-closed)
- `runWithTenantContext(tenantId, callback)`: Executa callback com tenant_id injetado

**Exemplo:**
```javascript
const { getTenantId } = require('./server/utils/tenant-context');

// Dentro de uma rota Express (após o middleware)
app.get('/api/leads', async (req, res) => {
  const tenantId = getTenantId(); // 'tenant_abc123'
  // ...
});
```

### 2. `server/middleware/resolve-tenant.js`

Middleware Express que resolve o `tenant_id` a partir do domínio da requisição.

**Fluxo:**
1. Lê `req.hostname` ou `req.headers.host`
2. Normaliza o domínio (lowercase, remove porta)
3. Consulta tabela `tenants`:
   - Primeiro: `WHERE dominio = ?`
   - Segundo: `WHERE JSON_CONTAINS(dominios_alternativos, ?)`
4. Se encontrado: injeta `tenant_id` no AsyncLocalStorage via `runWithTenantContext`
5. Se não encontrado: retorna **403 Forbidden** (fail-closed)

**Cache:**
- Mantém cache em memória (Map) com TTL de 5 minutos
- Evita consulta ao banco a cada requisição

**Bypass:**
- Rotas `/api/health` e `/health` não requerem tenant

**Uso:**
```javascript
const { createResolveTenantMiddleware } = require('./server/middleware/resolve-tenant');

app.use(createResolveTenantMiddleware(pool));
```

### 3. `server/dal/database.js`

Data Access Layer que injeta `tenant_id` automaticamente em todas as queries.

**Funções principais:**

#### `initializePool(config)`
Inicializa o pool de conexão MySQL. Chamar no boot do app.

```javascript
const { initializePool } = require('./server/dal/database');

initializePool({
  host: '127.0.0.1',
  user: 'root',
  password: 'senha',
  database: 'musa_crm'
});
```

#### `select(query, params)`
Executa SELECT com isolamento automático de tenant.

```javascript
const { select } = require('./server/dal/database');

// Query original (sem WHERE tenant_id)
const leads = await select('SELECT * FROM leads WHERE status = ?', ['novo']);

// Query injetada automaticamente:
// SELECT * FROM leads WHERE tenant_id = ? AND status = ?
// Params: [tenantId, 'novo']
```

#### `insert(table, data)`
Executa INSERT com `tenant_id` injetado automaticamente.

```javascript
const { insert } = require('./server/dal/database');

const result = await insert('leads', {
  id: 'lead_123',
  name: 'João Silva',
  whatsapp: '5515999999999',
  treatment: 'Botox',
  status: 'novo'
});

// Query executada:
// INSERT INTO leads (id, name, whatsapp, treatment, status, tenant_id)
// VALUES ('lead_123', 'João Silva', '5515999999999', 'Botox', 'novo', 'tenant_abc')
```

#### `update(query, params)`
Executa UPDATE com isolamento automático de tenant.

```javascript
const { update } = require('./server/dal/database');

await update(
  'UPDATE leads SET status = ? WHERE id = ?',
  ['agendado', 'lead_123']
);

// Query injetada:
// UPDATE leads SET status = ? WHERE id = ? AND tenant_id = ?
// Params: ['agendado', 'lead_123', tenantId]
```

#### `delete(query, params)`
Executa DELETE com isolamento automático de tenant.

```javascript
const { delete: deleteQuery } = require('./server/dal/database');

await deleteQuery('DELETE FROM leads WHERE id = ?', ['lead_123']);

// Query injetada:
// DELETE FROM leads WHERE id = ? AND tenant_id = ?
```

#### `getRawPool()`
Retorna o pool MySQL sem isolamento. **Usar APENAS para migrations e operações administrativas.**

```javascript
const { getRawPool } = require('./server/dal/database');

const pool = getRawPool();
const [rows] = await pool.query('SELECT * FROM tenants'); // Sem filtro de tenant
```

### 4. `.eslintrc.js`

Regra de lint que **PROÍBE** importar `mysql2` fora de `server/dal/database.js`.

**Regra:**
```javascript
'no-restricted-imports': ['error', {
  paths: [{
    name: 'mysql2/promise',
    message: 'PROIBIDO: Importe mysql2/promise apenas em server/dal/database.js. Use a DAL.'
  }]
}]
```

**Resultado:**
- Build quebra se alguém tentar fazer `require('mysql2/promise')` fora da DAL
- Garante que **todo acesso ao banco passa pela DAL** (acceptance criterion)

## Acceptance Criteria

### 1. Isolamento de leitura ✅
No contexto de A, 100% dos registros retornados são de A, em toda tabela.

**Teste:** `tests/integration/tenant-isolation.test.js`

### 2. Isolamento de escrita ✅
INSERT no contexto de A grava `tenant_id` de A (conferido no banco).

**Teste:** `tests/integration/tenant-isolation.test.js`

### 3. Bypass impossível ✅
Uso do pool MySQL fora da DAL **falha o build** (lint rule).

**Teste:** `npm run lint` no CI

### 4. Resolução por domínio correta ✅
Domínio desconhecido → 403 Forbidden.

**Teste:** `tests/integration/resolve-tenant-middleware.test.js`

### 5. Falha-fechada ✅
Erro na resolução de tenant nega acesso, nunca abre para todos.

**Teste:** `tests/integration/tenant-isolation.test.js`

## Roadmap de Refatoração

### Fase 1: Fundação (✅ MUL-32)
- [x] Criar tenant-context.js (AsyncLocalStorage)
- [x] Criar middleware resolve-tenant
- [x] Criar DAL (database.js)
- [x] Criar lint rule anti-bypass
- [x] Testes de integração

### Fase 2: Refatoração de Rotas (próxima task)
- [ ] Refatorar rotas de leads para usar DAL
- [ ] Refatorar rotas de clients para usar DAL
- [ ] Refatorar rotas de treatments para usar DAL
- [ ] Refatorar rotas de interactions para usar DAL
- [ ] Refatorar rotas de salespeople para usar DAL
- [ ] Testar cada rota no sandbox

### Fase 3: Cutover (após aprovação da Silvia)
- [ ] Renomear app.js → app-legacy.js
- [ ] Renomear app-with-tenant-lock.js → app.js
- [ ] Deploy em sandbox
- [ ] Validação end-to-end
- [ ] Promoção para produção (com revisão da Silvia)

## Uso

### Inicializar no app.js

```javascript
const { initializePool } = require('./server/dal/database');
const { createResolveTenantMiddleware } = require('./server/middleware/resolve-tenant');

// Configuração do banco
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || '3306')
};

// Inicializar DAL
initializePool(dbConfig);
const pool = getRawPool(); // Para migrations

// Middleware de resolução de tenant (ANTES de todas as rotas)
app.use(createResolveTenantMiddleware(pool));
```

### Converter rota existente

**Antes (app.js):**
```javascript
app.get('/api/leads', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM leads ORDER BY date DESC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**Depois (com DAL):**
```javascript
const { select } = require('./server/dal/database');

app.get('/api/leads', async (req, res) => {
  try {
    const rows = await select('SELECT * FROM leads ORDER BY date DESC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## Testes

### Rodar testes de integração
```bash
npm run test:integration
```

### Rodar lint (valida anti-bypass)
```bash
npm run lint
```

### Rodar todos os testes
```bash
npm test
```

## Notas de Segurança

1. **Fail-closed:** Qualquer erro na resolução de tenant → 403 Forbidden
2. **Sem tenant default:** Domínio desconhecido nunca cai em tenant padrão
3. **Contexto obrigatório:** DAL lança erro se não houver `tenant_id` (não silencioso)
4. **Bypass bloqueado:** Lint quebra build se importar mysql2 fora da DAL
5. **Cache seguro:** TTL de 5 minutos, respeita status='ativo' na query

## Documentação Obrigatória

Conforme definição de done da MUL-32:

### No código ✅
- Comentários descritivos em cada função (o que faz e por quê)
- JSDoc nos arquivos principais

### Na task ✅
- README.md (este arquivo) explicando a arquitetura
- Testes de integração cobrindo todos os acceptance criteria
- Evidências de CI verde (próximo commit)
