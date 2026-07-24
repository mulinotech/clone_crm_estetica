/**
 * Health check integration test
 * Verifies basic app startup and health endpoint
 */

const request = require('supertest');

describe('Health Check', () => {
  let app;
  let server;

  beforeAll(() => {
    // Suppress console logs during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // Load app without starting database initialization
    process.env.SKIP_DB_INIT = 'true';
    app = require('../app');
  });

  afterAll((done) => {
    // Restore console
    console.log.mockRestore();
    console.warn.mockRestore();
    console.error.mockRestore();

    if (server) {
      server.close(done);
    } else {
      done();
    }
  });

  test('GET /api/health should return 200', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status');
  });
});
