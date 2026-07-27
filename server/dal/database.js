/**
 * MUL-32: DAL (Data Access Layer) - Ponto único de acesso ao MySQL
 *
 * Repository pattern que injeta tenant_id automaticamente em todas as queries.
 * - SELECT/UPDATE/DELETE: adiciona WHERE tenant_id = ? automaticamente
 * - INSERT: preenche tenant_id automaticamente
 *
 * REGRA DE OURO: NINGUÉM importa mysql2/promise fora deste arquivo.
 * Lint rule vai quebrar o build se tentarem bypass.
 *
 * Acceptance criteria MUL-32:
 * - Isolamento de leitura: 100% dos registros retornados são do tenant correto
 * - Isolamento de escrita: INSERT grava tenant_id correto
 * - Bypass impossível: uso do pool MySQL fora da DAL falha o build
 *
 * @author Rafael von Siemens
 * @date 2026-07-26
 */

'use strict';

const mysql = require('mysql2/promise');
const { requireTenantId, getTenantContext, isSuperAdmin } = require('../utils/tenant-context');

/**
 * Pool de conexão MySQL (singleton).
 * Este é o ÚNICO lugar onde mysql2/promise é importado.
 */
let pool = null;

/**
 * Inicializa o pool de conexão com o MySQL.
 *
 * @param {Object} config - Configuração do pool (host, user, password, database, etc.)
 */
function initializePool(config) {
  if (pool) {
    console.warn('[DAL] Pool já inicializado, reutilizando conexão existente');
    return;
  }

  pool = mysql.createPool({
    host: config.host || '127.0.0.1',
    user: config.user || '',
    password: config.password || '',
    database: config.database || '',
    port: config.port || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  console.log('[DAL] Pool MySQL inicializado com sucesso');
}

/**
 * Obtém o pool de conexão (para uso em casos especiais sem isolamento, ex: migrations).
 *
 * ATENÇÃO: Usar getRawPool() bypassa o isolamento multi-tenant.
 * Só use para operações administrativas ou migrations.
 *
 * @returns {Object} Pool MySQL2
 */
function getRawPool() {
  if (!pool) {
    throw new Error('[DAL] Pool não inicializado. Chame initializePool() primeiro.');
  }
  return pool;
}

/**
 * Executa uma query SELECT com isolamento de tenant automático.
 *
 * Injeta automaticamente WHERE tenant_id = ? na query.
 *
 * @param {string} query - Query SQL SELECT (sem WHERE tenant_id)
 * @param {Array} params - Parâmetros da query preparada
 * @returns {Promise<Array>} Array de resultados
 */
async function select(query, params = []) {
  const tenantId = requireTenantId(); // Fail-closed: lança erro se não houver tenant_id

  if (!pool) {
    throw new Error('[DAL] Pool não inicializado');
  }

  // Injetar WHERE tenant_id = ? na query
  // Estratégia: adicionar condição antes de ORDER BY, LIMIT, etc.
  const injectedQuery = injectTenantFilter(query);
  const injectedParams = [tenantId, ...params];

  const [rows] = await pool.query(injectedQuery, injectedParams);
  return rows;
}

/**
 * Executa uma query INSERT com tenant_id injetado automaticamente.
 *
 * @param {string} table - Nome da tabela
 * @param {Object} data - Objeto com os campos a inserir (sem tenant_id)
 * @returns {Promise<Object>} Resultado da inserção (insertId, affectedRows, etc.)
 */
async function insert(table, data) {
  const tenantId = requireTenantId();

  if (!pool) {
    throw new Error('[DAL] Pool não inicializado');
  }

  // Injetar tenant_id no objeto de dados
  const dataWithTenant = { ...data, tenant_id: tenantId };

  const fields = Object.keys(dataWithTenant);
  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map(f => dataWithTenant[f]);

  const query = `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})`;

  const [result] = await pool.query(query, values);
  return result;
}

/**
 * Executa uma query UPDATE com isolamento de tenant automático.
 *
 * Injeta automaticamente WHERE tenant_id = ? na query.
 *
 * @param {string} query - Query SQL UPDATE (sem WHERE tenant_id)
 * @param {Array} params - Parâmetros da query preparada
 * @returns {Promise<Object>} Resultado da atualização (affectedRows, etc.)
 */
async function update(query, params = []) {
  const tenantId = requireTenantId();

  if (!pool) {
    throw new Error('[DAL] Pool não inicializado');
  }

  const injectedQuery = injectTenantFilter(query);
  const injectedParams = [...params, tenantId];

  const [result] = await pool.query(injectedQuery, injectedParams);
  return result;
}

/**
 * Executa uma query DELETE com isolamento de tenant automático.
 *
 * Injeta automaticamente WHERE tenant_id = ? na query.
 *
 * @param {string} query - Query SQL DELETE (sem WHERE tenant_id)
 * @param {Array} params - Parâmetros da query preparada
 * @returns {Promise<Object>} Resultado da exclusão (affectedRows, etc.)
 */
async function deleteQuery(query, params = []) {
  const tenantId = requireTenantId();

  if (!pool) {
    throw new Error('[DAL] Pool não inicializado');
  }

  const injectedQuery = injectTenantFilter(query);
  const injectedParams = [...params, tenantId];

  const [result] = await pool.query(injectedQuery, injectedParams);
  return result;
}

/**
 * Injeta filtro tenant_id na query SQL.
 *
 * Estratégia: adicionar "AND tenant_id = ?" no WHERE existente, ou criar WHERE se não existir.
 *
 * @param {string} query - Query original
 * @returns {string} Query com filtro tenant_id injetado
 */
function injectTenantFilter(query) {
  const normalized = query.trim().replace(/\s+/g, ' ');

  // Detectar se já existe cláusula WHERE
  const whereMatch = normalized.match(/\bWHERE\b/i);

  if (whereMatch) {
    // WHERE existe: adicionar AND tenant_id = ?
    // Encontrar posição do WHERE e injetar logo após
    const whereIndex = normalized.toUpperCase().indexOf('WHERE');
    const beforeWhere = normalized.slice(0, whereIndex + 5); // WHERE tem 5 chars
    const afterWhere = normalized.slice(whereIndex + 5);

    // Injetar tenant_id = ? logo após WHERE
    return `${beforeWhere} tenant_id = ? AND ${afterWhere}`;
  } else {
    // WHERE não existe: adicionar WHERE tenant_id = ? antes de ORDER BY, LIMIT, etc.
    // Detectar cláusulas de ordenação/limitação
    const orderMatch = normalized.match(/\b(ORDER BY|LIMIT|GROUP BY)\b/i);

    if (orderMatch) {
      const clauseIndex = normalized.toUpperCase().indexOf(orderMatch[0].toUpperCase());
      const beforeClause = normalized.slice(0, clauseIndex).trim();
      const afterClause = normalized.slice(clauseIndex);

      return `${beforeClause} WHERE tenant_id = ? ${afterClause}`;
    } else {
      // Nenhuma cláusula especial: adicionar WHERE tenant_id = ? no final
      return `${normalized} WHERE tenant_id = ?`;
    }
  }
}

/**
 * MUL-34: Registra uma ação de auditoria para operações cross-tenant.
 *
 * @param {string} action - Tipo de ação (ex: 'listAllTenants', 'selectCrossTenant')
 * @param {string|null} tenantId - Tenant afetado (null para ações globais)
 * @param {string} querySummary - Resumo da query executada
 * @param {number} resultCount - Quantidade de registros retornados
 */
async function logAudit(action, tenantId, querySummary, resultCount) {
  if (!pool) {
    console.warn('[DAL] Pool não inicializado, log de auditoria ignorado');
    return;
  }

  const context = getTenantContext();
  const adminUser = context?.adminUser || 'unknown';
  const auditId = 'audit_' + Math.random().toString(36).substring(2, 15);

  try {
    await pool.query(
      `INSERT INTO audit_log (id, admin_user, action, tenant_id, query_summary, result_count)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [auditId, adminUser, action, tenantId, querySummary, resultCount]
    );
  } catch (error) {
    // Falha no log de auditoria não deve interromper a operação
    console.error('[DAL] Erro ao registrar auditoria:', error.message);
  }
}

/**
 * MUL-34: Lista todos os tenants (cross-tenant).
 *
 * ATENÇÃO: Apenas super-admins podem chamar este método.
 * Lança erro se isSuperAdmin não estiver ativo no contexto.
 * Toda chamada é auditada na tabela audit_log.
 *
 * @returns {Promise<Array>} Array com todos os tenants
 */
async function listAllTenants() {
  if (!isSuperAdmin()) {
    throw new Error('[DAL] listAllTenants requer contexto super-admin (isSuperAdmin=true)');
  }

  if (!pool) {
    throw new Error('[DAL] Pool não inicializado');
  }

  const [rows] = await pool.query('SELECT id, nome, dominio, instancia_whatsapp, status, created_at FROM tenants ORDER BY nome ASC');

  // Registrar auditoria
  await logAudit('listAllTenants', null, 'SELECT * FROM tenants', rows.length);

  return rows;
}

/**
 * MUL-34: Executa uma query SELECT cross-tenant (sem filtro de tenant_id).
 *
 * ATENÇÃO: Apenas super-admins podem chamar este método.
 * Lança erro se isSuperAdmin não estiver ativo no contexto.
 * Toda chamada é auditada na tabela audit_log.
 *
 * @param {string} query - Query SQL SELECT (SEM injeção automática de tenant_id)
 * @param {Array} params - Parâmetros da query preparada
 * @param {string|null} targetTenantId - Tenant específico sendo consultado (para auditoria)
 * @returns {Promise<Array>} Array de resultados
 */
async function selectCrossTenant(query, params = [], targetTenantId = null) {
  if (!isSuperAdmin()) {
    throw new Error('[DAL] selectCrossTenant requer contexto super-admin (isSuperAdmin=true)');
  }

  if (!pool) {
    throw new Error('[DAL] Pool não inicializado');
  }

  const [rows] = await pool.query(query, params);

  // Registrar auditoria
  await logAudit('selectCrossTenant', targetTenantId, query.substring(0, 200), rows.length);

  return rows;
}

/**
 * Fecha o pool de conexão MySQL.
 * Usado principalmente em testes e shutdown graceful.
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('[DAL] Pool MySQL fechado');
  }
}

module.exports = {
  initializePool,
  getRawPool,
  select,
  insert,
  update,
  delete: deleteQuery,
  closePool,
  // MUL-34: Métodos cross-tenant auditados (somente super-admin)
  listAllTenants,
  selectCrossTenant
};
