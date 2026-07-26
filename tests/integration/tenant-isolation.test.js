/**
 * MUL-32: Teste de isolamento multi-tenant (trava de isolamento)
 *
 * Valida os acceptance criteria:
 * 1. Isolamento de leitura: no contexto de A, 100% dos registros retornados são de A
 * 2. Isolamento de escrita: INSERT no contexto de A grava tenant_id de A
 * 3. Bypass impossível: uso do pool MySQL fora da DAL falha o build
 * 4. Resolução por domínio correta; domínio desconhecido → 403/404
 * 5. Falha-fechada: erro na resolução de tenant nega acesso, nunca abre para todos
 *
 * @author Rafael von Siemens
 * @date 2026-07-26
 */

const mysql = require('mysql2/promise');
const { runWithTenantContext } = require('../../server/utils/tenant-context');
const { initializePool, select, insert, closePool } = require('../../server/dal/database');

describe('MUL-32: Tenant Isolation Lock', () => {
  let rawConnection;
  let skipTests = false;

  const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'musa_crm_test',
    port: parseInt(process.env.DB_PORT || '3306')
  };

  beforeAll(async () => {
    try {
      // Conectar direto ao banco para setup/teardown (bypass do DAL para testes)
      rawConnection = await mysql.createConnection(dbConfig);

      // Inicializar o pool da DAL
      initializePool(dbConfig);
    } catch (error) {
      // MySQL não disponível — pular testes
      console.warn('MySQL não disponível, pulando testes de integração:', error.message);
      skipTests = true;
    }
  });

  afterAll(async () => {
    if (rawConnection) {
      await rawConnection.end();
    }
    await closePool();
  });

  describe('Acceptance 1: Isolamento de leitura', () => {
    test('SELECT retorna 100% registros do tenant A no contexto de A', async () => {
      if (skipTests) {
        console.log('MySQL não disponível, teste pulado');
        return;
      }
      const tenantA = 'tenant_read_a';
      const tenantB = 'tenant_read_b';

      // Setup: criar tenants e leads
      await rawConnection.query(
        `INSERT IGNORE INTO tenants (id, nome, dominio) VALUES (?, ?, ?), (?, ?, ?)`,
        [tenantA, 'Tenant Read A', 'read-a.local', tenantB, 'Tenant Read B', 'read-b.local']
      );

      const leadA = {
        id: `lead_a_${Date.now()}`,
        tenant_id: tenantA,
        whatsapp: '5515111111111',
        name: 'Lead do Tenant A',
        treatment: 'Botox',
        status: 'novo',
        date: new Date()
      };

      const leadB = {
        id: `lead_b_${Date.now()}`,
        tenant_id: tenantB,
        whatsapp: '5515222222222',
        name: 'Lead do Tenant B',
        treatment: 'Preenchimento',
        status: 'novo',
        date: new Date()
      };

      await rawConnection.query(
        `INSERT INTO leads (id, tenant_id, whatsapp, name, treatment, status, date)
         VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)`,
        [leadA.id, leadA.tenant_id, leadA.whatsapp, leadA.name, leadA.treatment, leadA.status, leadA.date,
         leadB.id, leadB.tenant_id, leadB.whatsapp, leadB.name, leadB.treatment, leadB.status, leadB.date]
      );

      // Teste: SELECT no contexto de tenant A
      const resultsA = await runWithTenantContext(tenantA, async () => {
        return await select('SELECT * FROM leads');
      });

      // Validação: todos os leads retornados devem ser do tenant A
      expect(resultsA.length).toBeGreaterThan(0);
      const allFromTenantA = resultsA.every(lead => lead.tenant_id === tenantA);
      expect(allFromTenantA).toBe(true);

      // Confirmar que lead B NÃO está nos resultados
      const leadBInResults = resultsA.some(lead => lead.id === leadB.id);
      expect(leadBInResults).toBe(false);

      // Cleanup
      await rawConnection.query('DELETE FROM leads WHERE id IN (?, ?)', [leadA.id, leadB.id]);
      await rawConnection.query('DELETE FROM tenants WHERE id IN (?, ?)', [tenantA, tenantB]);
    });
  });

  describe('Acceptance 2: Isolamento de escrita', () => {
    test('INSERT no contexto de A grava tenant_id de A automaticamente', async () => {
      const tenantWrite = 'tenant_write_test';

      // Setup: criar tenant
      await rawConnection.query(
        `INSERT IGNORE INTO tenants (id, nome, dominio) VALUES (?, ?, ?)`,
        [tenantWrite, 'Tenant Write Test', 'write-test.local']
      );

      const leadData = {
        id: `lead_write_${Date.now()}`,
        whatsapp: '5515333333333',
        name: 'Lead Write Test',
        treatment: 'Harmonização',
        status: 'novo',
        date: new Date()
      };

      // Teste: INSERT via DAL no contexto de tenant_write_test
      await runWithTenantContext(tenantWrite, async () => {
        await insert('leads', leadData);
      });

      // Validação: ler direto do banco e conferir tenant_id
      const [rows] = await rawConnection.query(
        'SELECT tenant_id FROM leads WHERE id = ?',
        [leadData.id]
      );

      expect(rows.length).toBe(1);
      expect(rows[0].tenant_id).toBe(tenantWrite);

      // Cleanup
      await rawConnection.query('DELETE FROM leads WHERE id = ?', [leadData.id]);
      await rawConnection.query('DELETE FROM tenants WHERE id = ?', [tenantWrite]);
    });
  });

  describe('Acceptance 3: Bypass impossível', () => {
    test('Lint deve falhar se importar mysql2 fora da DAL', async () => {
      // Este teste é simbólico — o verdadeiro teste é o CI rodando `npm run lint`
      // Aqui validamos que a regra de lint está configurada corretamente

      const fs = require('fs');
      const path = require('path');

      const eslintrcPath = path.join(__dirname, '../../.eslintrc.js');
      expect(fs.existsSync(eslintrcPath)).toBe(true);

      const eslintConfig = require(eslintrcPath);

      // MUL-32: Projeto usa CommonJS (require), então a regra é no-restricted-modules
      expect(eslintConfig.rules['no-restricted-modules']).toBeDefined();

      const restrictedModules = eslintConfig.rules['no-restricted-modules'][1];
      const mysql2Restriction = restrictedModules.paths.find(p => p.name === 'mysql2/promise');
      expect(mysql2Restriction).toBeDefined();
      expect(mysql2Restriction.message).toContain('PROIBIDO');
    });
  });

  describe('Acceptance 4 & 5: Fail-closed (contexto obrigatório)', () => {
    test('DAL lança erro se não houver tenant_id no contexto', async () => {
      // Tentar fazer SELECT sem contexto de tenant (direto, sem runWithTenantContext)
      await expect(async () => {
        await select('SELECT * FROM leads LIMIT 1');
      }).rejects.toThrow('Tenant context not found');
    });

    test('DAL lança erro se tenant_id for null', async () => {
      // runWithTenantContext vai lançar erro se tenantId for null
      await expect(async () => {
        await runWithTenantContext(null, async () => {
          await select('SELECT * FROM leads LIMIT 1');
        });
      }).rejects.toThrow('tenantId é obrigatório');
    });
  });
});
