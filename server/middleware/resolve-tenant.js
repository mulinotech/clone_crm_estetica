/**
 * MUL-32: Middleware Resolve Tenant - Resolução de tenant por domínio
 *
 * Intercepta TODAS as requisições HTTP antes de qualquer rota.
 * Resolve o tenant_id baseado no domínio (req.hostname) consultando a tabela tenants.
 * Domínio desconhecido → 403 Forbidden (NUNCA tenant default).
 *
 * Acceptance criteria MUL-32:
 * - Resolução por domínio correta
 * - Domínio desconhecido → 403/404
 * - Falha-fechada: erro na resolução de tenant nega acesso, nunca abre para todos
 *
 * @author Rafael von Siemens
 * @date 2026-07-26
 */

'use strict';

const { runWithTenantContext } = require('../utils/tenant-context');

/**
 * Cria o middleware de resolução de tenant.
 *
 * @param {Object} pool - Pool de conexão MySQL (passado como dependência)
 * @returns {Function} Middleware Express
 */
function createResolveTenantMiddleware(pool) {
  // Cache em memória para evitar consulta ao banco a cada requisição
  // Estrutura: { 'dominio.com': { tenantId: 'tenant_123', cachedAt: Date } }
  const tenantCache = new Map();
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

  /**
   * Resolve o tenant_id a partir do domínio da requisição.
   *
   * @param {string} hostname - Domínio da requisição (req.hostname)
   * @returns {Promise<string|null>} tenant_id ou null se domínio desconhecido
   */
  async function resolveTenantByDomain(hostname) {
    // Normalizar hostname: remover porta, converter para minúsculas
    const normalizedDomain = hostname.toLowerCase().split(':')[0];

    // 1. Checar cache primeiro
    const cached = tenantCache.get(normalizedDomain);
    if (cached && (Date.now() - cached.cachedAt < CACHE_TTL_MS)) {
      return cached.tenantId;
    }

    try {
      // 2. Consultar banco: domínio principal
      const [rows] = await pool.query(
        'SELECT id FROM tenants WHERE dominio = ? AND status = "ativo" LIMIT 1',
        [normalizedDomain]
      );

      if (rows.length > 0) {
        const tenantId = rows[0].id;
        tenantCache.set(normalizedDomain, { tenantId, cachedAt: Date.now() });
        return tenantId;
      }

      // 3. Consultar banco: domínios alternativos (JSON array)
      const [altRows] = await pool.query(
        `SELECT id FROM tenants
         WHERE status = "ativo"
         AND JSON_CONTAINS(COALESCE(dominios_alternativos, '[]'), JSON_QUOTE(?))
         LIMIT 1`,
        [normalizedDomain]
      );

      if (altRows.length > 0) {
        const tenantId = altRows[0].id;
        tenantCache.set(normalizedDomain, { tenantId, cachedAt: Date.now() });
        return tenantId;
      }

      // 4. Domínio desconhecido
      return null;

    } catch (error) {
      console.error('[resolve-tenant] Erro ao consultar tenants:', error.message);
      // Fail-closed: erro na consulta = acesso negado, não abre para todos
      return null;
    }
  }

  /**
   * Middleware Express de resolução de tenant.
   *
   * Roda ANTES de qualquer rota. Injeta o tenant_id no AsyncLocalStorage.
   * Domínio desconhecido → 403 Forbidden.
   */
  return async function resolveTenantMiddleware(req, res, next) {
    // Rotas de saúde e health check não precisam de tenant (bypass)
    if (req.path === '/api/health' || req.path === '/health') {
      return next();
    }

    const hostname = req.hostname || req.headers.host?.split(':')[0] || 'localhost';

    try {
      const tenantId = await resolveTenantByDomain(hostname);

      if (!tenantId) {
        // Fail-closed: domínio desconhecido → 403 Forbidden (acceptance criterion)
        console.warn(`[resolve-tenant] Domínio desconhecido: ${hostname}`);
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Domain not authorized'
        });
      }

      // Injetar tenant_id no contexto da requisição via AsyncLocalStorage
      return runWithTenantContext(tenantId, () => {
        // Opcional: anexar ao req para debug/logging
        req.tenantId = tenantId;
        next();
      });

    } catch (error) {
      // Fail-closed: qualquer erro na resolução = acesso negado (acceptance criterion)
      console.error('[resolve-tenant] Erro fatal:', error.message);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Tenant resolution failed'
      });
    }
  };
}

module.exports = {
  createResolveTenantMiddleware
};
