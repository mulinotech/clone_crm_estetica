/**
 * MUL-32: Tenant Context - AsyncLocalStorage para propagar tenant_id
 *
 * Gerencia o contexto de tenant por requisição usando AsyncLocalStorage nativo do Node.
 * Nenhuma lib externa, zero overhead de sincronização manual.
 *
 * @author Rafael von Siemens
 * @date 2026-07-26
 */

'use strict';

const { AsyncLocalStorage } = require('async_hooks');

// Instância única de AsyncLocalStorage para armazenar o contexto da requisição
const asyncLocalStorage = new AsyncLocalStorage();

/**
 * Obtém o tenant_id do contexto atual da requisição.
 *
 * @returns {string|null} tenant_id resolvido ou null se não houver contexto
 */
function getTenantId() {
  const store = asyncLocalStorage.getStore();
  return store?.tenantId || null;
}

/**
 * Obtém todo o contexto da requisição (tenant_id + metadados opcionais).
 *
 * @returns {Object|null} Objeto com tenantId, isSuperAdmin e metadados ou null
 */
function getTenantContext() {
  return asyncLocalStorage.getStore() || null;
}

/**
 * Verifica se o contexto atual tem flag de super-admin ativa.
 *
 * @returns {boolean} true se isSuperAdmin está ativo no contexto
 */
function isSuperAdmin() {
  const context = getTenantContext();
  return context?.isSuperAdmin === true;
}

/**
 * Executa uma função dentro de um contexto de tenant específico.
 *
 * Usado internamente pelo middleware resolve-tenant para injetar o contexto.
 *
 * @param {string} tenantId - ID do tenant a ser injetado no contexto
 * @param {Function} callback - Função a executar com o contexto ativo
 * @returns {*} Retorna o resultado da callback
 */
function runWithTenantContext(tenantId, callback) {
  if (!tenantId) {
    throw new Error('tenantId é obrigatório para runWithTenantContext');
  }

  const store = {
    tenantId,
    isSuperAdmin: false,
    createdAt: new Date()
  };

  return asyncLocalStorage.run(store, callback);
}

/**
 * Executa uma função dentro de um contexto de super-admin.
 *
 * MUL-34: Super-admin pode acessar dados cross-tenant de forma auditada.
 * Flag isSuperAdmin=true permite uso de métodos cross-tenant na DAL.
 *
 * @param {string} adminUser - Email ou ID do super-admin (para auditoria)
 * @param {Function} callback - Função a executar com contexto super-admin
 * @returns {*} Retorna o resultado da callback
 */
function runWithSuperAdminContext(adminUser, callback) {
  if (!adminUser) {
    throw new Error('adminUser é obrigatório para runWithSuperAdminContext');
  }

  const store = {
    tenantId: null, // Super-admin não está escopado a um tenant específico
    isSuperAdmin: true,
    adminUser,
    createdAt: new Date()
  };

  return asyncLocalStorage.run(store, callback);
}

/**
 * Valida se há um tenant_id válido no contexto atual.
 *
 * @throws {Error} Se não houver tenant_id no contexto (fail-closed)
 * @returns {string} tenant_id validado
 */
function requireTenantId() {
  const tenantId = getTenantId();

  if (!tenantId) {
    // Fail-closed: erro na resolução de tenant nega acesso, nunca abre para todos
    throw new Error('Tenant context not found - request must pass through tenant resolution middleware');
  }

  return tenantId;
}

module.exports = {
  getTenantId,
  getTenantContext,
  runWithTenantContext,
  runWithSuperAdminContext,
  isSuperAdmin,
  requireTenantId
};
