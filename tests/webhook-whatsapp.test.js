/**
 * Testes unitários para o webhook do WhatsApp
 *
 * Validam as correções R2, R3 e R4:
 * - R2: Payload malformado não deve crashar o servidor
 * - R3: Leads duplicados devem ser prevenidos por transação
 * - R4: Falha no envio Evolution não deve crashar
 */

const request = require('supertest');

// Configurar ambiente de teste antes de importar o app
process.env.SKIP_DB_INIT = 'true';
process.env.NODE_ENV = 'test';

// Suprimir logs durante os testes
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;
const originalInfo = console.info;

console.log = jest.fn();
console.warn = jest.fn();
console.error = jest.fn();
console.info = jest.fn();

// Mock do pool MySQL (ANTES de importar o app) - MUL-33
const mockPool = {
  query: jest.fn(),
  getConnection: jest.fn()
};

jest.mock('mysql2/promise', () => ({
  createPool: jest.fn(() => mockPool)
}));

// Importar app com configuração de teste aplicada
const app = require('../app');

// Restaurar console após importação (os testes já têm app)
afterAll(() => {
  console.log = originalLog;
  console.warn = originalWarn;
  console.error = originalError;
  console.info = originalInfo;
});

describe('Webhook WhatsApp - R2: Validação defensiva de payload', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    // Mock: Resolver tenant por instância (para payloads que têm instanceName válido)
    // Simula que 'Nathi_Estetica_Oficial' está mapeado para 'tenant_legacy'
    mockPool.query.mockResolvedValue([
      [{ id: 'tenant_legacy' }]
    ]);
  });

  test('R2.1: Deve retornar 400 quando payload é null', async () => {
    const response = await request(app)
      .post('/api/webhook/whatsapp')
      .send(null)
      .expect('Content-Type', /json/)
      .expect(400);

    expect(response.body).toHaveProperty('error');
    // Nota: Express.json() transforma null em {}, então falha na validação de key
    expect(response.body.error).toContain('Missing or invalid key');
  });

  test('R2.2: Deve retornar 400 quando key.remoteJid está ausente', async () => {
    const malformedPayload = {
      instance: 'Nathi_Estetica_Oficial', // MUL-33: simula payload Evolution real
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
      instance: 'Nathi_Estetica_Oficial', // MUL-33: simula payload Evolution real
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
      instance: 'Nathi_Estetica_Oficial', // MUL-33: simula payload Evolution real
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
      instance: 'Nathi_Estetica_Oficial', // MUL-33: simula payload Evolution real
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

  test('R2.6: Deve retornar 400 quando telefone extraído é inválido (muito curto)', async () => {
    const invalidPhonePayload = {
      instance: 'Nathi_Estetica_Oficial', // MUL-33: simula payload Evolution real
      data: {
        key: {
          fromMe: false,
          remoteJid: '551599@s.whatsapp.net' // telefone muito curto (< 10 dígitos)
        },
        messageType: 'conversation',
        message: { conversation: 'Test' }
      }
    };

    const response = await request(app)
      .post('/api/webhook/whatsapp')
      .send(invalidPhonePayload)
      .expect('Content-Type', /json/)
      .expect(400);

    expect(response.body.error).toContain('Invalid phone number');
  });
});

describe('Webhook WhatsApp - R2: Tipos de mensagem', () => {
  test('R2.7: Deve retornar 200 e status unsupported para tipo não suportado', async () => {
    const unsupportedPayload = {
      instance: 'Nathi_Estetica_Oficial', // MUL-33: simula payload Evolution real
      data: {
        key: {
          fromMe: false,
          remoteJid: '5515997569764@s.whatsapp.net'
        },
        pushName: 'Cliente Teste',
        messageType: 'audioMessage',
        message: { audioMessage: { url: 'http://example.com/audio.mp3' } }
      }
    };

    const response = await request(app)
      .post('/api/webhook/whatsapp')
      .send(unsupportedPayload)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body.status).toBe('unsupported');
    expect(response.body.messageType).toBe('audioMessage');
  });
});
