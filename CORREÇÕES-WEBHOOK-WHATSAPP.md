# Correções R2, R3 e R4 - Webhook WhatsApp

**Issue:** MUL-23  
**Origem:** Auditoria MUL-4  
**Data:** 2026-07-20  
**Desenvolvedor:** Rafael von Siemens  

---

## Problema Identificado (R2)

O endpoint `POST /api/webhook/whatsapp` não validava a estrutura do payload antes de executar operações críticas, especificamente:

```javascript
// ANTES (linha 1102) - CRASHAVA O SERVIDOR
const senderJid = key?.remoteJid || '';
const phone = senderJid.split('@')[0]; // ❌ Se remoteJid = undefined, split() crasha
```

**Impacto:** Payload malformado sem `key.remoteJid` causava crash do servidor Node.js, derrubando toda a aplicação (CRM + captura de leads).

**Risco:** Perda de receita, churn de clientes beta, indisponibilidade total do sistema.

---

## Correções Implementadas

### R2: Validação Defensiva de Payload

**Arquivo:** `app.js:1093-1243`

#### Guard Clauses Implementadas

1. **Validação do payload raiz**
   ```javascript
   if (!payload || typeof payload !== 'object') {
     return res.status(400).json({ error: 'Invalid payload' });
   }
   ```

2. **Validação do messageData**
   ```javascript
   const messageData = payload.data || payload;
   if (!messageData || typeof messageData !== 'object') {
     return res.status(400).json({ error: 'Invalid message data' });
   }
   ```

3. **Validação da key**
   ```javascript
   if (!key || typeof key !== 'object') {
     return res.status(400).json({ error: 'Missing or invalid key' });
   }
   ```

4. **Validação de remoteJid (FIX PRINCIPAL)**
   ```javascript
   const senderJid = key.remoteJid;
   if (!senderJid || typeof senderJid !== 'string' || !senderJid.includes('@')) {
     console.warn('[Webhook WhatsApp] remoteJid ausente ou malformado', { senderJid });
     return res.status(400).json({ error: 'Invalid or missing remoteJid' });
   }
   
   const phone = senderJid.split('@')[0]; // ✅ Agora seguro
   ```

5. **Validação do telefone extraído**
   ```javascript
   if (!phone || phone.length < 10) {
     return res.status(400).json({ error: 'Invalid phone number' });
   }
   ```

#### Tratamento de Erro Global

```javascript
try {
  // ... toda lógica do webhook
} catch (error) {
  console.error('[Webhook WhatsApp] Erro ao processar webhook', {
    error: error.message,
    stack: error.stack
  });
  // Retornar 200 para Evolution não retentar indefinidamente
  return res.status(200).json({
    success: false,
    error: 'Internal processing error',
    logged: true
  });
}
```

**Comportamento:** Mesmo em caso de erro interno, retorna HTTP 200 para evitar retry infinito do Evolution API.

---

### R3: Prevenção de Leads Duplicados por Corrida

**Problema:** Webhooks simultâneos do mesmo número podiam criar leads duplicados devido a race condition.

**Solução 1: Transação com SELECT FOR UPDATE**

```javascript
const connection = await pool.getConnection();
try {
  await connection.beginTransaction();

  const [existingLeads] = await connection.query(
    'SELECT id FROM leads WHERE REPLACE(whatsapp, "+", "") = ? FOR UPDATE',
    [phone]
  );

  if (existingLeads.length > 0) {
    targetId = existingLeads[0].id;
    await connection.commit();
  } else {
    await connection.query(
      'INSERT INTO leads (id, name, whatsapp, treatment, status, source) VALUES (?, ?, ?, ?, ?, ?)',
      [targetId, contactName, phone, 'Geral', 'novo', 'whatsapp']
    );
    await connection.commit();
  }
} catch (txError) {
  await connection.rollback();
  throw txError;
} finally {
  connection.release();
}
```

**Solução 2: Índice Único no Banco**

```javascript
// app.js:182-192
try {
  await connection.query('CREATE UNIQUE INDEX idx_leads_whatsapp_unique ON leads (whatsapp)');
  console.log('Indice unico idx_leads_whatsapp_unique criado em leads.whatsapp.');
} catch(e) {
  if (e.code !== 'ER_DUP_KEYNAME') {
    console.warn('Aviso ao criar indice unico em leads.whatsapp:', e.message);
  }
}
```

**Garantias:**
- Nível de aplicação: `SELECT FOR UPDATE` trava a linha durante a transação
- Nível de banco: índice único impede duplicação mesmo em caso de falha da aplicação

---

### R4: Envio Evolution com Try/Catch

**Problema:** Falha no `EvolutionService.sendText()` causava rollback da transação, perdendo o lead.

**Solução:**

```javascript
try {
  const welcome = `Seja muito bem-vinda à Nathi Estética Avançada! ✨\n\n...`;
  const instanceName = await EvolutionService.getInstanceName();
  await EvolutionService.sendText(instanceName, phone, welcome);

  const interactionId = 'i_' + Math.random().toString(36).substring(2, 9);
  await pool.query(
    'INSERT INTO interactions (id, client_id, type, content, direction) VALUES (?, ?, ?, ?, ?)',
    [interactionId, targetId, 'whatsapp', welcome, 'out']
  );
} catch (sendError) {
  console.error('[Webhook WhatsApp] Falha ao enviar boas-vindas, mas lead foi salvo', {
    error: sendError.message,
    phone,
    targetId
  });
  // Não lançar erro - lead foi salvo com sucesso
}
```

**Comportamento:**
- Lead é salvo com sucesso via `commit()` antes de tentar enviar mensagem
- Falha no envio é logada mas não impede o processamento
- Sistema continua operacional mesmo com Evolution API fora do ar

---

## Logging Estruturado

Todos os pontos críticos agora emitem logs estruturados:

```javascript
console.info('[Webhook WhatsApp] Mensagem processada com sucesso', {
  phone,
  targetId,
  messageType
});

console.warn('[Webhook WhatsApp] remoteJid ausente ou malformado', { senderJid });

console.error('[Webhook WhatsApp] Falha ao enviar boas-vindas, mas lead foi salvo', {
  error: sendError.message,
  phone,
  targetId
});
```

**Benefícios:**
- Rastreabilidade de erros
- Debugging facilitado
- Monitoramento de padrões de falha

---

## Testes Implementados

**Arquivo:** `tests/webhook-whatsapp.test.js`

### Suite de Testes R2 (Validação Defensiva)

- ✅ R2.1: Payload null retorna 400
- ✅ R2.2: key.remoteJid ausente retorna 400
- ✅ R2.3: remoteJid sem @ retorna 400
- ✅ R2.4: key ausente retorna 400
- ✅ R2.5: fromMe=true é ignorado (200)
- ✅ R2.6: Payload válido processado com sucesso

### Suite de Testes R4 (Evolution Try/Catch)

- ✅ R4.1: Lead salvo mesmo quando Evolution.sendText falha

### Suite de Testes R3 (Duplicação)

- ✅ R3.1: Usa SELECT FOR UPDATE para evitar race condition

### Como Rodar

```bash
npm install
npm test
```

---

## Checklist de Acceptance Criteria

- [x] Webhook valida payload e nunca crasha com dados malformados
- [x] Retorna status HTTP adequado (400 para malformado, 200 para sucesso/erro controlado)
- [x] Log estruturado em todos os pontos críticos
- [x] Testes unitários cobrindo cenários de falha
- [x] Proteção contra leads duplicados (transação + índice único)
- [x] Envio Evolution isolado em try/catch

---

## Status

✅ **Pronto para Review da Silvia (CTO)**

Próximos passos:
1. Review e aprovação da Silvia
2. Teste em staging com `.env` de staging
3. Deploy em produção (via Silvia)

---

## Notas Técnicas

### Por que retornar 200 em erro interno?

```javascript
return res.status(200).json({
  success: false,
  error: 'Internal processing error',
  logged: true
});
```

Evolution API retenta webhooks que retornam 4xx/5xx indefinidamente. Retornar 200 com `success: false` sinaliza "recebi, mas não processei" sem causar retry loop.

### Por que índice único pode falhar?

Se já existem leads duplicados no banco, `CREATE UNIQUE INDEX` falhará. O código trata isso:

```javascript
catch(e) {
  if (e.code !== 'ER_DUP_KEYNAME') {
    console.warn('Aviso ao criar indice unico em leads.whatsapp:', e.message);
  }
}
```

**Ação manual futura:** Limpar duplicatas antes de criar índice em produção.
