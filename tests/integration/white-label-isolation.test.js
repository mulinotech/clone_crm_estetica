/**
 * MUL-34: Testes de Isolamento White-Label e Super-Admin
 *
 * Valida:
 * 1. Duas clínicas em domínios diferentes não cruzam dados
 * 2. Domínio desconhecido retorna 403
 * 3. Super-admin consegue listar todas as clínicas
 * 4. Requisição normal não acessa dados cross-tenant
 *
 * @author Lucas Andrade
 * @date 2026-07-27
 */

'use strict';

const request = require('supertest');
const app = require('../../app');
const { initializePool, getRawPool, closePool } = require('../../server/dal/database');
const { runWithTenantContext, runWithSuperAdminContext } = require('../../server/utils/tenant-context');

describe('MUL-34: White-Label Isolation & Super-Admin', () => {
  let tenant1Id, tenant2Id;

  beforeAll(async () => {
    // Inicializar pool de conexão
    initializePool({
      host: process.env.DB_HOST || '127.0.0.1',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'test_crm',
      port: parseInt(process.env.DB_PORT || '3306')
    });

    const pool = getRawPool();

    // Criar migration de audit_log se não existir
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id VARCHAR(50) PRIMARY KEY,
        timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        admin_user VARCHAR(255) NOT NULL,
        action VARCHAR(100) NOT NULL,
        tenant_id VARCHAR(50),
        query_summary TEXT,
        result_count INT DEFAULT 0,
        metadata TEXT,
        INDEX idx_audit_timestamp (timestamp DESC)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Criar dois tenants de teste
    tenant1Id = 'tenant_clinic1_test';
    tenant2Id = 'tenant_clinic2_test';

    await pool.query('DELETE FROM tenants WHERE id IN (?, ?)', [tenant1Id, tenant2Id]);
    await pool.query('DELETE FROM leads WHERE tenant_id IN (?, ?)', [tenant1Id, tenant2Id]);

    await pool.query(
      `INSERT INTO tenants (id, nome, dominio, instancia_whatsapp, status)
       VALUES (?, ?, ?, ?, ?)`,
      [tenant1Id, 'Clínica A', 'clinica-a.test', 'ClinicaA_WhatsApp', 'teste']
    );

    await pool.query(
      `INSERT INTO tenants (id, nome, dominio, instancia_whatsapp, status)
       VALUES (?, ?, ?, ?, ?)`,
      [tenant2Id, 'Clínica B', 'clinica-b.test', 'ClinicaB_WhatsApp', 'teste']
    );
  });

  afterAll(async () => {
    const pool = getRawPool();
    await pool.query('DELETE FROM tenants WHERE id IN (?, ?)', [tenant1Id, tenant2Id]);
    await pool.query('DELETE FROM leads WHERE tenant_id IN (?, ?)', [tenant1Id, tenant2Id]);
    await closePool();
  });

  test('Isolamento: Clínica A não vê dados da Clínica B', async () => {
    const pool = getRawPool();

    // Criar lead para Clínica A
    await pool.query(
      `INSERT INTO leads (id, name, whatsapp, treatment, status, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['lead_a1', 'Cliente A1', '5511111111111', 'Limpeza de Pele', 'novo', tenant1Id]
    );

    // Criar lead para Clínica B
    await pool.query(
      `INSERT INTO leads (id, name, whatsapp, treatment, status, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['lead_b1', 'Cliente B1', '5522222222222', 'Peeling', 'novo', tenant2Id]
    );

    // Simular requisição da Clínica A (domínio clinica-a.test)
    const responseA = await request(app)
      .get('/api/leads')
      .set('Host', 'clinica-a.test')
      .set('x-user-role', 'admin');

    expect(responseA.status).toBe(200);
    expect(responseA.body).toBeInstanceOf(Array);
    expect(responseA.body.length).toBe(1);
    expect(responseA.body[0].name).toBe('Cliente A1');
    expect(responseA.body.find(l => l.name === 'Cliente B1')).toBeUndefined();

    // Simular requisição da Clínica B (domínio clinica-b.test)
    const responseB = await request(app)
      .get('/api/leads')
      .set('Host', 'clinica-b.test')
      .set('x-user-role', 'admin');

    expect(responseB.status).toBe(200);
    expect(responseB.body).toBeInstanceOf(Array);
    expect(responseB.body.length).toBe(1);
    expect(responseB.body[0].name).toBe('Cliente B1');
    expect(responseB.body.find(l => l.name === 'Cliente A1')).toBeUndefined();
  });

  test('Domínio desconhecido retorna 403 Forbidden', async () => {
    const response = await request(app)
      .get('/api/leads')
      .set('Host', 'dominio-desconhecido.test')
      .set('x-user-role', 'admin');

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Forbidden');
  });

  test('Super-admin lista todos os tenants (cross-tenant)', async () => {
    const superAdminKey = process.env.SUPER_ADMIN_KEY || 'musa-super-admin-dev-key';

    const response = await request(app)
      .get('/api/admin/tenants')
      .set('x-super-admin-key', superAdminKey)
      .set('x-admin-user', 'test-admin@mulino.com');

    expect(response.status).toBe(200);
    expect(response.body).toBeInstanceOf(Array);

    const clinic1 = response.body.find(t => t.id === tenant1Id);
    const clinic2 = response.body.find(t => t.id === tenant2Id);

    expect(clinic1).toBeDefined();
    expect(clinic1.nome).toBe('Clínica A');
    expect(clinic2).toBeDefined();
    expect(clinic2.nome).toBe('Clínica B');
  });

  test('Requisição sem chave super-admin não acessa rota cross-tenant', async () => {
    const response = await request(app)
      .get('/api/admin/tenants')
      .set('x-admin-user', 'fake-admin@test.com');

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Forbidden');
  });

  test('Log de auditoria registra acesso cross-tenant', async () => {
    const superAdminKey = process.env.SUPER_ADMIN_KEY || 'musa-super-admin-dev-key';

    await request(app)
      .get('/api/admin/tenants')
      .set('x-super-admin-key', superAdminKey)
      .set('x-admin-user', 'audit-test@mulino.com');

    const pool = getRawPool();
    const [logs] = await pool.query(
      `SELECT * FROM audit_log WHERE admin_user = ? ORDER BY timestamp DESC LIMIT 1`,
      ['audit-test@mulino.com']
    );

    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].action).toBe('listAllTenants');
    expect(logs[0].admin_user).toBe('audit-test@mulino.com');
  });
});
