/**
 * MUL-33: Testes de isolamento multi-tenant no webhook WhatsApp
 *
 * Validam os acceptance criteria:
 * - Mensagem da instância A grava no tenant A
 * - Instância não mapeada → rejeitada e logada
 * - Score Gemini persistido no tenant correto
 *
 * @author Rafael von Siemens
 * @date 2026-07-26
 */

const request = require('supertest');

// Configurar ambiente de teste ANTES de qualquer import
process.env.SKIP_DB_INIT = 'true';
process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = 'test_key_mock';

// Suprimir logs durante os testes
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;
const originalInfo = console.info;

console.log = jest.fn();
console.warn = jest.fn();
console.error = jest.fn();
console.info = jest.fn();

// Mock do pool MySQL (ANTES de importar o app)
const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn()
};

jest.mock('mysql2/promise', () => ({
  createPool: jest.fn(() => mockPool)
}));

// Mock do serviço de score Gemini
jest.mock('../server/services/lead-score', () => ({
  scoreLeadWithGemini: jest.fn(async (message, name) => ({
    score: 75,
    category: 'high',
    reasoning: 'Lead qualificado - mencionou interesse em procedimento'
  })),
  categorizeScore: jest.fn((score) => {
    if (score <= 30) return 'low';
    if (score <= 70) return 'medium';
    return 'high';
  })
}));

const app = require('../app');
const { scoreLeadWithGemini } = require('../server/services/lead-score');

// Restaurar console após importação
afterAll(() => {
  console.log = originalLog;
  console.warn = originalWarn;
  console.error = originalError;
  console.info = originalInfo;
});

describe('Webhook WhatsApp Multi-Tenant (MUL-33)', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
  });

  test('AC1: Mensagem da instância A grava no tenant A', async () => {
    // Mock: Resolver tenant por instância
    mockPool.query
      .mockResolvedValueOnce([
        [{ id: 'tenant_nathi' }] // Consulta de resolução de tenant
      ])
      .mockResolvedValueOnce([
        [] // Nenhum cliente com esse telefone
      ])
      .mockResolvedValueOnce([
        [] // Nenhum lead com esse telefone
      ]);

    // Mock: getConnection para transação de criação de lead
    const mockConnection = {
      beginTransaction: jest.fn(),
      query: jest.fn()
        .mockResolvedValueOnce([[]]) // SELECT FOR UPDATE (nenhum lead existente)
        .mockResolvedValueOnce([{ insertId: 1 }]), // INSERT lead
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn()
    };
    mockPool.getConnection.mockResolvedValue(mockConnection);

    // Mock: INSERT interaction
    mockPool.query.mockResolvedValueOnce([{ insertId: 1 }]);

    const payload = {
      instance: 'Nathi_Estetica_Oficial', // Instância do tenant A
      data: {
        key: {
          fromMe: false,
          remoteJid: '5515997569764@s.whatsapp.net'
        },
        pushName: 'Cliente Teste',
        messageType: 'conversation',
        message: { conversation: 'Quero agendar uma harmonização facial' }
      }
    };

    const response = await request(app)
      .post('/api/webhook/whatsapp')
      .send(payload)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body.success).toBe(true);

    // Validar que o tenant foi resolvido
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT id FROM tenants WHERE LOWER(instancia_whatsapp)'),
      ['nathi_estetica_oficial']
    );

    // Validar que o lead foi criado com tenant_id correto
    expect(mockConnection.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO leads'),
      expect.arrayContaining(['tenant_nathi'])
    );

    // Validar que o score foi calculado
    expect(scoreLeadWithGemini).toHaveBeenCalledWith(
      'Quero agendar uma harmonização facial',
      'Cliente Teste'
    );
  });

  test('AC2: Instância não mapeada é rejeitada e logada', async () => {
    // Mock: Instância não encontrada
    mockPool.query.mockResolvedValueOnce([
      [] // Nenhum tenant com essa instância
    ]);

    const payload = {
      instance: 'Instancia_Desconhecida',
      data: {
        key: {
          fromMe: false,
          remoteJid: '5515997569764@s.whatsapp.net'
        },
        pushName: 'Cliente Teste',
        messageType: 'conversation',
        message: { conversation: 'Olá' }
      }
    };

    const response = await request(app)
      .post('/api/webhook/whatsapp')
      .send(payload)
      .expect('Content-Type', /json/)
      .expect(400);

    expect(response.body.error).toBe('Bad Request');
    expect(response.body.message).toContain('not mapped');
    expect(response.body.instanceName).toBe('Instancia_Desconhecida');

    // Validar que foi logado (console.warn mockado)
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Instância WhatsApp não mapeada'),
      expect.objectContaining({ instanceName: 'Instancia_Desconhecida' })
    );
  });

  test('AC3: Score Gemini persistido no tenant correto', async () => {
    // Mock: Resolver tenant
    mockPool.query
      .mockResolvedValueOnce([
        [{ id: 'tenant_bella' }] // Tenant B
      ])
      .mockResolvedValueOnce([
        [] // Nenhum cliente
      ])
      .mockResolvedValueOnce([
        [] // Nenhum lead
      ]);

    // Mock: Transação de criação de lead
    const mockConnection = {
      beginTransaction: jest.fn(),
      query: jest.fn()
        .mockResolvedValueOnce([[]]) // SELECT FOR UPDATE
        .mockResolvedValueOnce([{ insertId: 1 }]), // INSERT lead
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn()
    };
    mockPool.getConnection.mockResolvedValue(mockConnection);

    // Mock: INSERT interaction
    mockPool.query.mockResolvedValueOnce([{ insertId: 1 }]);

    const payload = {
      instance: 'Bella_Clinica_Oficial',
      data: {
        key: {
          fromMe: false,
          remoteJid: '5511912345678@s.whatsapp.net'
        },
        pushName: 'Lead Qualificado',
        messageType: 'conversation',
        message: { conversation: 'Preciso de tratamento facial urgente para evento no sábado' }
      }
    };

    const response = await request(app)
      .post('/api/webhook/whatsapp')
      .send(payload)
      .expect(200);

    expect(response.body.success).toBe(true);

    // Validar que o score foi calculado com a mensagem correta
    expect(scoreLeadWithGemini).toHaveBeenCalledWith(
      'Preciso de tratamento facial urgente para evento no sábado',
      'Lead Qualificado'
    );

    // Validar que o INSERT do lead incluiu score_result e tenant_id correto
    const insertCall = mockConnection.query.mock.calls.find(call =>
      call[0].includes('INSERT INTO leads')
    );

    expect(insertCall).toBeDefined();
    expect(insertCall[1]).toContain('tenant_bella'); // tenant_id
    expect(insertCall[1]).toContain(JSON.stringify({
      score: 75,
      category: 'high',
      reasoning: 'Lead qualificado - mencionou interesse em procedimento'
    })); // score_result
  });

  test('AC4: Payload sem nome de instância é rejeitado', async () => {
    const payload = {
      data: {
        key: {
          fromMe: false,
          remoteJid: '5515997569764@s.whatsapp.net'
        },
        messageType: 'conversation',
        message: { conversation: 'Olá' }
      }
      // Sem campo 'instance' ou 'instanceName'
    };

    const response = await request(app)
      .post('/api/webhook/whatsapp')
      .send(payload)
      .expect(400);

    expect(response.body.error).toBe('Bad Request');
    expect(response.body.message).toContain('Instance name not found');

    // Validar log
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Payload sem nome de instância'),
      expect.any(Object)
    );
  });

  test('AC5: Falha no score Gemini não bloqueia captura do lead', async () => {
    // Mock: score lança erro
    scoreLeadWithGemini.mockRejectedValueOnce(new Error('Gemini API timeout'));

    // Mock: Resolver tenant
    mockPool.query
      .mockResolvedValueOnce([
        [{ id: 'tenant_test' }]
      ])
      .mockResolvedValueOnce([
        []
      ])
      .mockResolvedValueOnce([
        []
      ]);

    // Mock: Transação
    const mockConnection = {
      beginTransaction: jest.fn(),
      query: jest.fn()
        .mockResolvedValueOnce([[]]) // SELECT FOR UPDATE
        .mockResolvedValueOnce([{ insertId: 1 }]), // INSERT lead (sem score)
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn()
    };
    mockPool.getConnection.mockResolvedValue(mockConnection);

    mockPool.query.mockResolvedValueOnce([{ insertId: 1 }]);

    const payload = {
      instance: 'Test_Instance',
      data: {
        key: {
          fromMe: false,
          remoteJid: '5515997569764@s.whatsapp.net'
        },
        pushName: 'Lead Teste',
        messageType: 'conversation',
        message: { conversation: 'Olá' }
      }
    };

    const response = await request(app)
      .post('/api/webhook/whatsapp')
      .send(payload)
      .expect(200);

    expect(response.body.success).toBe(true);

    // Validar que o erro foi logado
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Erro ao calcular score Gemini'),
      expect.any(Object)
    );

    // Validar que o lead foi criado mesmo sem score
    expect(mockConnection.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO leads'),
      expect.any(Array)
    );
  });
});
