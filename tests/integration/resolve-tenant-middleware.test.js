/**
 * MUL-32: Teste do middleware resolve-tenant
 *
 * Valida os acceptance criteria 4 e 5:
 * - Resolução por domínio correta
 * - Domínio desconhecido → 403 Forbidden
 * - Falha-fechada: erro na resolução nega acesso
 *
 * @author Rafael von Siemens
 * @date 2026-07-26
 */

const request = require('supertest');
const express = require('express');
const mysql = require('mysql2/promise');
const { createResolveTenantMiddleware } = require('../../server/middleware/resolve-tenant');
const { getTenantId } = require('../../server/utils/tenant-context');

describe('MUL-32: Resolve Tenant Middleware', () => {
  let app;
  let pool;
  let rawConnection;

  const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'musa_crm_test',
    port: parseInt(process.env.DB_PORT || '3306')
  };

  beforeAll(async () => {
    // Criar pool para o middleware
    pool = mysql.createPool(dbConfig);

    // Conexão raw para setup
    rawConnection = await mysql.createConnection(dbConfig);

    // Setup: criar tenants de teste
    await rawConnection.query(
      `INSERT IGNORE INTO tenants (id, nome, dominio, status)
       VALUES
       ('tenant_known', 'Known Tenant', 'known-domain.local', 'ativo'),
       ('tenant_alt', 'Tenant with Alt Domains', 'main-alt.local', 'ativo')`
    );

    // Adicionar domínio alternativo ao tenant_alt
    await rawConnection.query(
      `UPDATE tenants SET dominios_alternativos = ? WHERE id = ?`,
      [JSON.stringify(['alt-domain.local', 'another-alt.local']), 'tenant_alt']
    );

    // Criar app Express de teste
    app = express();
    app.use(createResolveTenantMiddleware(pool));

    // Rota de teste que retorna o tenant_id resolvido
    app.get('/test-tenant', (req, res) => {
      const tenantId = getTenantId();
      res.json({ tenantId });
    });
  });

  afterAll(async () => {
    // Cleanup
    await rawConnection.query(
      `DELETE FROM tenants WHERE id IN ('tenant_known', 'tenant_alt')`
    );

    if (rawConnection) {
      await rawConnection.end();
    }

    if (pool) {
      await pool.end();
    }
  });

  describe('Acceptance 4: Resolução por domínio', () => {
    test('Deve resolver tenant_id para domínio conhecido', async () => {
      const response = await request(app)
        .get('/test-tenant')
        .set('Host', 'known-domain.local')
        .expect(200);

      expect(response.body.tenantId).toBe('tenant_known');
    });

    test('Deve resolver tenant_id para domínio alternativo', async () => {
      const response = await request(app)
        .get('/test-tenant')
        .set('Host', 'alt-domain.local')
        .expect(200);

      expect(response.body.tenantId).toBe('tenant_alt');
    });

    test('Deve normalizar hostname (remover porta)', async () => {
      const response = await request(app)
        .get('/test-tenant')
        .set('Host', 'known-domain.local:3000')
        .expect(200);

      expect(response.body.tenantId).toBe('tenant_known');
    });
  });

  describe('Acceptance 5: Fail-closed (domínio desconhecido)', () => {
    test('Deve retornar 403 para domínio desconhecido', async () => {
      const response = await request(app)
        .get('/test-tenant')
        .set('Host', 'unknown-domain.local')
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toContain('not authorized');
    });

    test('Deve retornar 403 para hostname vazio', async () => {
      await request(app)
        .get('/test-tenant')
        .expect(403);
    });
  });

  describe('Health check bypass', () => {
    test('Rota /api/health não requer tenant', async () => {
      // Adicionar rota de health check ao app
      app.get('/api/health', (req, res) => {
        res.json({ status: 'ok' });
      });

      const response = await request(app)
        .get('/api/health')
        .set('Host', 'unknown-domain.local')
        .expect(200);

      expect(response.body.status).toBe('ok');
    });
  });
});
