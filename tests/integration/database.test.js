/**
 * MUL-37: Teste de integração com MySQL real
 * Valida que o CI consegue rodar migrations e acessar o banco de verdade
 *
 * Este teste serve de molde para futuros testes de isolamento multi-tenant (MUL-C)
 */

const mysql = require('mysql2/promise');

describe('Database Integration Tests', () => {
  let connection;

  // Configuração do banco de teste (mesma do CI)
  const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'musa_crm_test',
    port: parseInt(process.env.DB_PORT || '3306')
  };

  beforeAll(async () => {
    // Conecta ao banco de teste
    connection = await mysql.createConnection(dbConfig);
  });

  afterAll(async () => {
    if (connection) {
      await connection.end();
    }
  });

  describe('Schema validation', () => {
    test('should have tenants table created by migration', async () => {
      const [rows] = await connection.query(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tenants'`,
        [dbConfig.database]
      );

      expect(rows.length).toBe(1);
      expect(rows[0].TABLE_NAME).toBe('tenants');
    });

    test('should have multi-tenant tables with tenant_id column', async () => {
      const multiTenantTables = ['leads', 'clients', 'treatments', 'interactions'];

      for (const tableName of multiTenantTables) {
        const [columns] = await connection.query(
          `SELECT COLUMN_NAME, IS_NULLABLE
           FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = 'tenant_id'`,
          [dbConfig.database, tableName]
        );

        expect(columns.length).toBeGreaterThan(0);
        expect(columns[0].COLUMN_NAME).toBe('tenant_id');
        // tenant_id deve ser NOT NULL (migration 001)
        expect(columns[0].IS_NULLABLE).toBe('NO');
      }
    });
  });

  describe('CRUD operations', () => {
    test('should insert and read a lead from database', async () => {
      const tenantId = 'test_tenant';

      // Setup: criar tenant antes do lead (FK fk_leads_tenant exige)
      await connection.query(
        `INSERT INTO tenants (id, name, created_at) VALUES (?, ?, NOW())`,
        [tenantId, 'Test Tenant']
      );

      // INSERT: criar um lead de teste
      const testLead = {
        id: `test_lead_${Date.now()}`,
        tenant_id: tenantId,
        whatsapp: '5515999999999',
        name: 'Lead Teste Integração',
        treatment: 'Harmonização Facial',
        status: 'novo',
        date: new Date()
      };

      const [insertResult] = await connection.query(
        `INSERT INTO leads (id, tenant_id, whatsapp, name, treatment, status, date)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [testLead.id, testLead.tenant_id, testLead.whatsapp, testLead.name,
         testLead.treatment, testLead.status, testLead.date]
      );

      expect(insertResult.affectedRows).toBe(1);

      // SELECT: ler o lead inserido
      const [rows] = await connection.query(
        'SELECT * FROM leads WHERE id = ?',
        [testLead.id]
      );

      expect(rows.length).toBe(1);
      expect(rows[0].whatsapp).toBe(testLead.whatsapp);
      expect(rows[0].name).toBe(testLead.name);
      expect(rows[0].tenant_id).toBe(testLead.tenant_id);

      // CLEANUP: deletar lead e depois tenant
      await connection.query('DELETE FROM leads WHERE id = ?', [testLead.id]);
      await connection.query('DELETE FROM tenants WHERE id = ?', [tenantId]);
    });

    test('should enforce tenant_id NOT NULL constraint', async () => {
      // Tentar inserir lead sem tenant_id deve falhar
      await expect(
        connection.query(
          `INSERT INTO leads (id, whatsapp, name, treatment, status, date)
           VALUES (?, ?, ?, ?, ?, ?)`,
          ['test_no_tenant', '5515888888888', 'Sem Tenant', 'Botox', 'novo', new Date()]
        )
      ).rejects.toThrow();
    });
  });

  describe('Migration fail-closed verification', () => {
    test('should fail when inserting invalid data', async () => {
      // Query inválida: tenant_id com tipo errado
      // Isso prova que o CI realmente exercita o banco (acceptance criterion 4)
      await expect(
        connection.query(
          `INSERT INTO leads (id, tenant_id, whatsapp, name, treatment, status, date)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ['invalid_lead', null, '551599', 'Invalid', 'Botox', 'novo', 'invalid_date']
        )
      ).rejects.toThrow();
    });
  });

  describe('Tenant isolation foundation', () => {
    test('should filter leads by tenant_id correctly', async () => {
      // Preparação: inserir leads de dois tenants diferentes
      const tenant1Id = 'tenant_1';
      const tenant2Id = 'tenant_2';

      // Setup: criar os registros de tenants ANTES dos leads (FK fk_leads_tenant exige)
      await connection.query(
        `INSERT INTO tenants (id, name, created_at)
         VALUES (?, ?, NOW()), (?, ?, NOW())`,
        [tenant1Id, 'Tenant 1 Test', tenant2Id, 'Tenant 2 Test']
      );

      const lead1 = {
        id: `lead_t1_${Date.now()}`,
        tenant_id: tenant1Id,
        whatsapp: '5515111111111',
        name: 'Lead Tenant 1',
        treatment: 'Preenchimento',
        status: 'novo',
        date: new Date()
      };

      const lead2 = {
        id: `lead_t2_${Date.now()}`,
        tenant_id: tenant2Id,
        whatsapp: '5515222222222',
        name: 'Lead Tenant 2',
        treatment: 'Botox',
        status: 'novo',
        date: new Date()
      };

      // Inserir ambos leads
      await connection.query(
        `INSERT INTO leads (id, tenant_id, whatsapp, name, treatment, status, date)
         VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)`,
        [lead1.id, lead1.tenant_id, lead1.whatsapp, lead1.name, lead1.treatment, lead1.status, lead1.date,
         lead2.id, lead2.tenant_id, lead2.whatsapp, lead2.name, lead2.treatment, lead2.status, lead2.date]
      );

      // Filtrar por tenant_1 — deve retornar apenas lead1
      const [tenant1Leads] = await connection.query(
        'SELECT * FROM leads WHERE tenant_id = ?',
        [tenant1Id]
      );

      const tenant1LeadIds = tenant1Leads.map(l => l.id);
      expect(tenant1LeadIds).toContain(lead1.id);
      expect(tenant1LeadIds).not.toContain(lead2.id);

      // Filtrar por tenant_2 — deve retornar apenas lead2
      const [tenant2Leads] = await connection.query(
        'SELECT * FROM leads WHERE tenant_id = ?',
        [tenant2Id]
      );

      const tenant2LeadIds = tenant2Leads.map(l => l.id);
      expect(tenant2LeadIds).toContain(lead2.id);
      expect(tenant2LeadIds).not.toContain(lead1.id);

      // CLEANUP: deletar leads primeiro (FK), depois tenants
      await connection.query(
        'DELETE FROM leads WHERE id IN (?, ?)',
        [lead1.id, lead2.id]
      );
      await connection.query(
        'DELETE FROM tenants WHERE id IN (?, ?)',
        [tenant1Id, tenant2Id]
      );
    });
  });
});
