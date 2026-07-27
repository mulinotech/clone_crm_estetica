/**
 * MUL-33: Middleware Resolve Tenant (Webhook WhatsApp) - Resolução por instância Evolution
 *
 * Resolve o tenant_id baseado no nome da instância WhatsApp (Evolution API).
 * Cada tenant tem uma instância dedicada (1:1).
 * Instância desconhecida → 400 Bad Request + log (NUNCA processa no escuro).
 *
 * Acceptance criteria MUL-33:
 * - Mensagem da instância A grava no tenant A
 * - Instância não mapeada → rejeitada e logada
 * - Score Gemini persistido no tenant correto
 *
 * @author Rafael von Siemens
 * @date 2026-07-26
 */

'use strict';

const { runWithTenantContext } = require('../utils/tenant-context');

/**
 * Cria o middleware de resolução de tenant para webhooks WhatsApp.
 *
 * @param {Object} pool - Pool de conexão MySQL (passado como dependência)
 * @returns {Function} Middleware Express
 */
function createResolveTenantWebhookMiddleware(pool) {
  // Cache em memória: instância → tenant_id
  // Estrutura: { 'Nathi_Estetica_Oficial': { tenantId: 'tenant_legacy', cachedAt: Date } }
  const instanceCache = new Map();
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

  /**
   * Resolve o tenant_id a partir do nome da instância WhatsApp.
   *
   * @param {string} instanceName - Nome da instância Evolution API
   * @returns {Promise<string|null>} tenant_id ou null se instância não mapeada
   */
  async function resolveTenantByInstance(instanceName) {
    if (!instanceName) {
      return null;
    }

    // Normalizar nome da instância: trim e case-insensitive
    const normalizedInstance = instanceName.trim().toLowerCase();

    // 1. Checar cache primeiro
    const cached = instanceCache.get(normalizedInstance);
    if (cached && (Date.now() - cached.cachedAt < CACHE_TTL_MS)) {
      return cached.tenantId;
    }

    try {
      // 2. Consultar banco: instancia_whatsapp (case-insensitive)
      const [rows] = await pool.query(
        'SELECT id FROM tenants WHERE LOWER(instancia_whatsapp) = ? AND status = "ativo" LIMIT 1',
        [normalizedInstance]
      );

      if (rows.length > 0) {
        const tenantId = rows[0].id;
        instanceCache.set(normalizedInstance, { tenantId, cachedAt: Date.now() });
        return tenantId;
      }

      // 3. Instância não mapeada
      return null;

    } catch (error) {
      console.error('[resolve-tenant-webhook] Erro ao consultar tenants:', error.message);
      // Fail-closed: erro na consulta = acesso negado
      return null;
    }
  }

  /**
   * Middleware Express de resolução de tenant para webhook WhatsApp.
   *
   * Extrai o nome da instância do payload Evolution e resolve o tenant_id.
   * Instância não mapeada → 400 Bad Request + log.
   *
   * IMPORTANTE: Validação de payload específica (key, remoteJid, etc.) acontece
   * no handler do webhook. Este middleware passa adiante nos seguintes casos
   * para o handler retornar mensagens de erro específicas:
   * - Payload vazio/inválido (R2.1)
   * - messageData ausente/inválido (R2.4)
   * - key ausente/inválido (R2.1)
   * - Payload sem instanceName (webhooks antigos ou testes sem multi-tenancy)
   */
  return async function resolveTenantWebhookMiddleware(req, res, next) {
    try {
      const payload = req.body;

      // SKIP: Se payload é vazio ou não tem estrutura mínima, passa adiante
      // para o handler retornar a mensagem de erro específica (R2.1, R2.4)
      if (!payload || typeof payload !== 'object') {
        return next();
      }

      // Extrair messageData (Evolution envia: { data: {...} } ou payload direto)
      const messageData = payload.data || payload;

      // SKIP: Se messageData ausente/inválido, passa adiante (R2.4)
      if (!messageData || typeof messageData !== 'object') {
        return next();
      }

      // Extrair nome da instância do payload Evolution API
      // O Evolution envia: { instance: "Nathi_Estetica_Oficial", data: {...} }
      // ou { instanceName: "...", data: {...} } dependendo da versão
      const instanceName = payload.instance || payload.instanceName || payload.data?.instance || payload.data?.instanceName;

      // SKIP: Se key ausente/inválido E instanceName ausente, passa adiante (testes antigos R2.1-R2.7)
      // Isso permite que o handler retorne mensagens específicas de erro de validação
      const key = messageData.key;
      if ((!key || typeof key !== 'object') && !instanceName) {
        return next();
      }

      // REJECT: Se há estrutura de mensagem válida (key existe) mas falta instanceName
      // Em ambiente multi-tenant de produção, todos os webhooks Evolution devem ter instanceName
      if (!instanceName) {
        console.warn('[resolve-tenant-webhook] Payload sem nome de instância', {
          keys: Object.keys(payload || {}),
          dataKeys: Object.keys(messageData || {}),
          hasKey: !!key
        });
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Instance name not found in webhook payload'
        });
      }

      const tenantId = await resolveTenantByInstance(instanceName);

      if (!tenantId) {
        // Fail-closed: instância não mapeada → rejeita e loga (acceptance criterion)
        console.warn('[resolve-tenant-webhook] Instância WhatsApp não mapeada', { instanceName });
        return res.status(400).json({
          error: 'Bad Request',
          message: 'WhatsApp instance not mapped to any tenant',
          instanceName
        });
      }

      // Injetar tenant_id no contexto da requisição via AsyncLocalStorage
      return runWithTenantContext(tenantId, () => {
        // Anexar ao req para debug/logging
        req.tenantId = tenantId;
        req.instanceName = instanceName;
        next();
      });

    } catch (error) {
      // Fail-closed: qualquer erro na resolução = acesso negado
      console.error('[resolve-tenant-webhook] Erro fatal:', error.message);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Tenant resolution failed'
      });
    }
  };
}

module.exports = {
  createResolveTenantWebhookMiddleware
};
