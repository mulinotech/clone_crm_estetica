# MUL-38: Análise do Teste `webhook-whatsapp.test.js`

**Autor:** Rafael von Siemens  
**Data:** 2026-07-23

---

## Problema Identificado

O arquivo `tests/webhook-whatsapp.test.js` está quebrando o job `unit-tests` do CI com 9 falhas:

1. **`ReferenceError: app is not defined`** (3 testes) — o código usa `request(app)` sem importar o app
2. **`expected Content-Type /json/, got "text/html"`** (6 testes) — resposta HTML indica rota não registrada (404 do Express)

---

## Análise

### A rota `/api/webhook/whatsapp` existe?

✅ **SIM** — verificado em `app.js:1187-1300`:
- Rota implementada e funcionando em produção
- Validações R2, R3 e R4 presentes (defensive payload, race condition, try/catch Evolution)
- `EvolutionService` e pool de banco usados na implementação real

### O teste descreve comportamento real ou futuro?

✅ **COMPORTAMENTO REAL** — o teste valida as correções R2, R3 e R4 que **já existem** no código:
- R2: Validação defensiva de payload (guards contra null, remoteJid ausente, etc.)
- R3: Prevenção de leads duplicados com transação + SELECT FOR UPDATE
- R4: Try/catch no envio Evolution (não crashar se falhar)

**Origem provável:** Teste escrito durante MUL-19/MUL-23 (trabalho de webhook antigo), mas nunca rodado porque não havia CI na época.

---

## Problemas no Teste

### 1. Não importa o `app` real

**Código atual:**
```javascript
describe('Webhook WhatsApp - R2: Validação defensiva de payload', () => {
  let app;

  beforeEach(() => {
    app = express();  // ❌ Cria Express vazio, sem rotas registradas
    app.use(express.json());
    jest.clearAllMocks();
  });
```

**Correção necessária:**
```javascript
const app = require('../app');  // ✅ Importa o app real com rotas registradas
```

### 2. Mocks não estão conectados ao código real

O teste mocka `mockPool` e `mockEvolutionService`, mas eles não são injetados no `app` real. Precisamos:
- Mockar o `mysql2/promise` module para que `pool.query` use o mock
- Mockar o `EvolutionService` do `app.js`
- Usar `SKIP_DB_INIT=true` para evitar que `initializeDatabase()` rode

---

## Decisão

✅ **CORRIGIR O TESTE** — ele descreve comportamento real e deve ser mantido.

**Justificativa:**
- A rota `/api/webhook/whatsapp` está implementada e em produção
- As validações R2, R3 e R4 existem e devem ter cobertura de testes
- O teste é valioso — só precisa ser conectado ao código real

**Não remover** — seria perder cobertura de uma feature crítica (ingestão de leads via WhatsApp).

---

## Plano de Correção

1. **Importar o `app` real** — remover o `express()` local
2. **Mockar as dependências externas:**
   - `mysql2/promise` → retorna mockPool
   - `EvolutionService` → mockado via `jest.mock()` ou injeção
3. **Setar `process.env.SKIP_DB_INIT = 'true'`** antes de importar o app
4. **Ajustar expectations** para o comportamento real (se necessário)

---

## Próximos Passos

- [ ] Implementar a correção do teste
- [ ] Rodar `npm run test:unit` localmente e confirmar verde
- [ ] Validar que o job `unit-tests` do CI passa

---

**Assinatura técnica:**  
Rafael von Siemens  
Desenvolvedor Fullstack Sênior — Musa CRM
