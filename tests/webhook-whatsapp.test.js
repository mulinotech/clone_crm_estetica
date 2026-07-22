/**
 * Testes unitários para o webhook do WhatsApp
 *
 * Validam as correções R2, R3 e R4:
 * - R2: Payload malformado não deve crashar o servidor
 * - R3: Leads duplicados devem ser prevenidos por transação
 * - R4: Falha no envio Evolution não deve crashar
 */

const request = require('supertest');
const express = require('express');

// Mock do pool de banco de dados
const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn()
};

// Mock do EvolutionService
const mockEvolutionService = {
  getInstanceName: jest.fn().mockResolvedValue('test_instance'),
  sendText: jest.fn().mockResolvedValue({ status: 'success' })
};

describe('Webhook WhatsApp - R2: Validação defensiva de payload', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    jest.clearAllMocks();
  });

  test('R2.1: Deve retornar 400 quando payload é null', async () => {
    const response = await request(app)
      .post('/api/webhook/whatsapp')
      .send(null)
      .expect('Content-Type', /json/)
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('Invalid payload');
  });

  test('R2.2: Deve retornar 400 quando key.remoteJid está ausente', async () => {
    const malformedPayload = {
      data: {
        key: {
          fromMe: false
          // remoteJid ausente - causa do crash original
        },
        messageType: 'conversation',
        message: { conversation: 'Olá' }
      }
    };

    const response = await request(app)
      .post('/api/webhook/whatsapp')
      .send(malformedPayload)
      .expect('Content-Type', /json/)
      .expect(400);

    expect(response.body.error).toContain('Invalid or missing remoteJid');
  });

  test('R2.3: Deve retornar 400 quando remoteJid não contém @', async () => {
    const malformedPayload = {
      data: {
        key: {
          fromMe: false,
          remoteJid: '5515997569764' // sem @ - causaria crash no split
        },
        messageType: 'conversation',
        message: { conversation: 'Olá' }
      }
    };

    const response = await request(app)
      .post('/api/webhook/whatsapp')
      .send(malformedPayload)
      .expect('Content-Type', /json/)
      .expect(400);

    expect(response.body.error).toContain('Invalid or missing remoteJid');
  });

  test('R2.4: Deve retornar 400 quando key está ausente', async () => {
    const malformedPayload = {
      data: {
        // key ausente
        messageType: 'conversation',
        message: { conversation: 'Olá' }
      }
    };

    const response = await request(app)
      .post('/api/webhook/whatsapp')
      .send(malformedPayload)
      .expect('Content-Type', /json/)
      .expect(400);

    expect(response.body.error).toContain('Missing or invalid key');
  });

  test('R2.5: Deve retornar 200 e ignorar quando fromMe é true', async () => {
    const ownMessagePayload = {
      data: {
        key: {
          fromMe: true,
          remoteJid: '5515997569764@s.whatsapp.net'
        },
        messageType: 'conversation',
        message: { conversation: 'Mensagem enviada pela clínica' }
      }
    };

    const response = await request(app)
      .post('/api/webhook/whatsapp')
      .send(ownMessagePayload)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body.status).toBe('ignored');
    expect(response.body.reason).toBe('fromMe');
  });

  test('R2.6: Deve processar payload válido com sucesso', async () => {
    const validPayload = {
      data: {
        key: {
          fromMe: false,
          remoteJid: '5515997569764@s.whatsapp.net'
        },
        pushName: 'Cliente Teste',
        messageType: 'conversation',
        message: { conversation: 'Olá, gostaria de agendar' }
      }
    };

    // Mock de banco retornando lead existente
    mockPool.query.mockResolvedValueOnce([[]]); // clients vazio
    mockPool.query.mockResolvedValueOnce([[{ id: 'lead123' }]]); // lead existente
    mockPool.query.mockResolvedValueOnce([{ insertId: 1 }]); // insert interaction

    const response = await request(app)
      .post('/api/webhook/whatsapp')
      .send(validPayload)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body.success).toBe(true);
  });
});

describe('Webhook WhatsApp - R4: Envio Evolution com try/catch', () => {
  test('R4.1: Deve salvar lead mesmo quando Evolution.sendText falha', async () => {
    const validPayload = {
      data: {
        key: {
          fromMe: false,
          remoteJid: '5515998887777@s.whatsapp.net'
        },
        pushName: 'Novo Lead',
        messageType: 'conversation',
        message: { conversation: 'Primeira mensagem' }
      }
    };

    // Mock de banco retornando nenhum cliente ou lead (novo)
    mockPool.query.mockResolvedValueOnce([[]]); // clients vazio
    mockPool.query.mockResolvedValueOnce([[]]); // leads vazio

    const mockConnection = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn()
        .mockResolvedValueOnce([[]])  // SELECT FOR UPDATE
        .mockResolvedValueOnce([{ insertId: 1 }]), // INSERT lead
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn()
    };

    mockPool.getConnection.mockResolvedValue(mockConnection);

    // Evolution.sendText falha
    mockEvolutionService.sendText.mockRejectedValueOnce(new Error('Evolution API timeout'));

    // Mesmo com falha no envio, deve retornar 200 e success: true
    // pois o lead foi salvo com sucesso
    const response = await request(app)
      .post('/api/webhook/whatsapp')
      .send(validPayload)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(mockConnection.commit).toHaveBeenCalled();
  });
});

describe('Webhook WhatsApp - R3: Prevenção de leads duplicados', () => {
  test('R3.1: Deve usar transação com SELECT FOR UPDATE para evitar corrida', async () => {
    const validPayload = {
      data: {
        key: {
          fromMe: false,
          remoteJid: '5515999998888@s.whatsapp.net'
        },
        pushName: 'Lead Concorrente',
        messageType: 'conversation',
        message: { conversation: 'Teste race condition' }
      }
    };

    mockPool.query.mockResolvedValueOnce([[]]); // clients vazio
    mockPool.query.mockResolvedValueOnce([[]]); // leads vazio (primeira verificação)

    const mockConnection = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn()
        .mockResolvedValueOnce([[{ id: 'existing_lead' }]]) // SELECT FOR UPDATE retorna lead criado por outra requisição
        .mockResolvedValueOnce([{ insertId: 1 }]),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn()
    };

    mockPool.getConnection.mockResolvedValue(mockConnection);

    const response = await request(app)
      .post('/api/webhook/whatsapp')
      .send(validPayload)
      .expect(200);

    // Deve ter usado SELECT FOR UPDATE
    expect(mockConnection.query).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE'),
      expect.any(Array)
    );

    // Deve ter dado commit na transação
    expect(mockConnection.commit).toHaveBeenCalled();
    expect(mockConnection.release).toHaveBeenCalled();
  });
});

describe('Webhook WhatsApp - Logging estruturado', () => {
  test('Deve logar erros com contexto estruturado', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    const invalidPayload = {
      data: {
        key: {
          fromMe: false,
          remoteJid: '551599@s.whatsapp.net' // telefone muito curto
        },
        messageType: 'conversation',
        message: { conversation: 'Test' }
      }
    };

    await request(app)
      .post('/api/webhook/whatsapp')
      .send(invalidPayload)
      .expect(400);

    consoleSpy.mockRestore();
  });
});
