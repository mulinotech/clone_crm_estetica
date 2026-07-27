/**
 * MUL-34: Serviço de Provisionamento de Tenants
 *
 * Cria novos tenants (clínicas) sem necessidade de deploy.
 * Gera tenant_id único, configura domínio, instância WhatsApp e dados-semente.
 *
 * @author Lucas Andrade
 * @date 2026-07-27
 */

'use strict';

const { getRawPool } = require('../dal/database');

/**
 * Cria um novo tenant com dados-semente.
 *
 * Passos:
 * 1. Valida campos obrigatórios (nome, domínio, instância WhatsApp)
 * 2. Gera tenant_id único
 * 3. Insere na tabela tenants
 * 4. Cria dados-semente (vendedor padrão, catálogo básico de tratamentos)
 *
 * @param {Object} tenantData - Dados do tenant
 * @param {string} tenantData.nome - Nome da clínica (ex: "Bella Vita Estética")
 * @param {string} tenantData.dominio - Domínio principal (ex: "bellavita.clinic")
 * @param {string} tenantData.instanciaWhatsapp - Nome da instância Evolution API
 * @param {Array<string>} [tenantData.dominiosAlternativos] - Domínios extras (opcional)
 * @param {string} [tenantData.status] - Status inicial (default: 'teste')
 * @returns {Promise<Object>} Tenant criado com id, nome, dominio, instanciaWhatsapp
 */
async function createTenant(tenantData) {
  // R1: Validação de campos obrigatórios
  const { nome, dominio, instanciaWhatsapp } = tenantData;

  if (!nome || !dominio || !instanciaWhatsapp) {
    throw new Error('Campos obrigatórios ausentes: nome, dominio, instanciaWhatsapp');
  }

  // R2: Validar formato do domínio (não pode ter http://, espaços, etc)
  const dominioNormalizado = dominio.toLowerCase().trim();
  if (dominioNormalizado.includes('http://') || dominioNormalizado.includes('https://')) {
    throw new Error('Domínio não deve incluir protocolo (http/https)');
  }
  if (dominioNormalizado.includes(' ')) {
    throw new Error('Domínio não pode conter espaços');
  }

  const pool = getRawPool(); // Provisionamento usa pool raw (não escopado a tenant)
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // R3: Verificar se domínio já existe (único)
    const [existingDomain] = await connection.query(
      'SELECT id FROM tenants WHERE dominio = ? LIMIT 1',
      [dominioNormalizado]
    );

    if (existingDomain.length > 0) {
      throw new Error(`Domínio "${dominioNormalizado}" já está em uso por outro tenant`);
    }

    // R4: Gerar tenant_id único
    const tenantId = 'tenant_' + Math.random().toString(36).substring(2, 15);

    // R5: Inserir tenant na tabela
    const dominiosAlternativosJson = tenantData.dominiosAlternativos
      ? JSON.stringify(tenantData.dominiosAlternativos)
      : null;

    await connection.query(
      `INSERT INTO tenants (id, nome, dominio, dominios_alternativos, instancia_whatsapp, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        tenantId,
        nome,
        dominioNormalizado,
        dominiosAlternativosJson,
        instanciaWhatsapp,
        tenantData.status || 'teste' // Default: 'teste' até validação
      ]
    );

    // R6: Criar dados-semente — Vendedor padrão
    const vendedorId = 's_admin_' + Math.random().toString(36).substring(2, 9);
    await connection.query(
      `INSERT INTO salespeople (id, name, email, whatsapp, role, password, status, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        vendedorId,
        'Administrador',
        `admin@${dominioNormalizado}`,
        '5511999999999', // Placeholder
        'Administrador',
        'admin123', // Senha padrão (TROCAR no primeiro acesso)
        'active',
        tenantId
      ]
    );

    // R7: Criar dados-semente — Catálogo básico de tratamentos
    const tratamentosBasicos = [
      { nome: 'Limpeza de Pele', preco: 150.00, duracao: '60 min' },
      { nome: 'Peeling Químico', preco: 250.00, duracao: '45 min' },
      { nome: 'Microagulhamento', preco: 350.00, duracao: '90 min' },
      { nome: 'Preenchimento Facial', preco: 800.00, duracao: '60 min' },
      { nome: 'Toxina Botulínica', preco: 600.00, duracao: '30 min' }
    ];

    for (const trat of tratamentosBasicos) {
      const tratId = 'tc_' + Math.random().toString(36).substring(2, 9);
      await connection.query(
        `INSERT INTO treatment_catalog (id, name, price, duration, tenant_id)
         VALUES (?, ?, ?, ?, ?)`,
        [tratId, trat.nome, trat.preco, trat.duracao, tenantId]
      );
    }

    await connection.commit();

    console.log(`[Provisioning] Tenant criado com sucesso: ${tenantId} (${nome})`);

    return {
      id: tenantId,
      nome,
      dominio: dominioNormalizado,
      instanciaWhatsapp,
      status: tenantData.status || 'teste',
      vendedorPadrao: {
        id: vendedorId,
        email: `admin@${dominioNormalizado}`,
        senhaInicial: 'admin123'
      }
    };

  } catch (error) {
    await connection.rollback();
    console.error('[Provisioning] Erro ao criar tenant:', error.message);
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  createTenant
};
