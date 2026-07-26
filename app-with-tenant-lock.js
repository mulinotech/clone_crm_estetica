/**
 * MUL-32: Musa CRM - App com Trava de Isolamento Multi-Tenant
 *
 * Versão refatorada do app.js que usa:
 * - Middleware resolve-tenant (domínio → tenant_id)
 * - AsyncLocalStorage para contexto de tenant
 * - DAL única para acesso ao MySQL (isolamento automático)
 *
 * IMPORTANTE: Este arquivo substitui app.js após aprovação da Silvia.
 * Durante a transição, rode com: node app-with-tenant-lock.js
 *
 * @author Rafael von Siemens
 * @date 2026-07-26
 */

'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Carregar variáveis de ambiente do .env (se existir)
try {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (e) {
  // dotenv é opcional
}

// Importar DAL e middleware multi-tenant
const { initializePool, getRawPool } = require('./server/dal/database');
const { createResolveTenantMiddleware } = require('./server/middleware/resolve-tenant');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Servir arquivos estáticos do frontend React compilados (pasta dist)
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

// Configuração do banco de dados
const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || process.env.DB_PASS || '',
  database: process.env.DB_NAME || '',
  port: parseInt(process.env.DB_PORT || '3306')
};

// Inicializar pool da DAL
initializePool(dbConfig);
const pool = getRawPool(); // Usado para migrations e operações administrativas

async function initializeDatabase() {
  // Skip DB initialization in test mode
  if (process.env.SKIP_DB_INIT === 'true') {
    console.log('Database initialization skipped (test mode)');
    return;
  }

  try {
    const connection = await pool.getConnection();
    console.log('Conexao com o banco de dados MySQL realizada com sucesso!');

    // Nota: As migrations criam as tabelas. Aqui só validamos a conexão.
    // Para auto-migrate, rode: npm run migrate

    connection.release();
  } catch (error) {
    console.error('Falha na conexao com o banco de dados:', error.message);
  }
}

initializeDatabase();

// Health check endpoint (não requer tenant)
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'musa-crm',
    multiTenant: true
  });
});

// MUL-32: Middleware de resolução de tenant (ANTES de todas as rotas)
// Injeta tenant_id no AsyncLocalStorage baseado no domínio da requisição
app.use(createResolveTenantMiddleware(pool));

// ===========================================
// ROTAS DO CRM (placeholder)
// ===========================================
// Nota: As rotas existentes em app.js precisarão ser refatoradas para usar a DAL.
// Por enquanto, este arquivo é um esqueleto funcional para testes de integração.
//
// TODO (próxima task):
// - Refatorar todas as rotas de app.js para usar server/dal/database.js
// - Substituir pool.query() por DAL select/insert/update/delete
// - Testar cada rota em ambiente sandbox

app.get('/api/placeholder', (req, res) => {
  res.json({
    message: 'MUL-32: Trava de isolamento ativa. Rotas em refatoração.',
    tenantId: req.tenantId
  });
});

// Rota curinga para o React SPA (deve ficar DEPOIS das rotas /api)
if (fs.existsSync(distPath)) {
  app.get('*', function(req, res) {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Iniciar o servidor no Socket UNIX da Cloudez ou na porta local
const SOCKET_PATH = '/srv/nat-estetica.2d384ff2.configr.cloud/etc/nodejs/nodejs.sock';
const PORT = process.env.PORT || 3001;

// Verificar se estamos no servidor da Cloudez (socket existe) ou rodando localmente
if (fs.existsSync(path.dirname(SOCKET_PATH))) {
  // Remover socket antigo se existir para evitar conflito
  if (fs.existsSync(SOCKET_PATH)) {
    fs.unlinkSync(SOCKET_PATH);
  }
  // eslint-disable-next-line no-unused-vars
  const server = app.listen(SOCKET_PATH, function() {
    console.log('Servidor rodando no socket: ' + SOCKET_PATH);
    // Permissão necessária para o LiteSpeed acessar o socket
    fs.chmodSync(SOCKET_PATH, '777');
  });
} else {
  // Ambiente local - escutar em uma porta TCP normal
  // Only start server if not in test mode
  if (process.env.NODE_ENV !== 'test' && process.env.SKIP_DB_INIT !== 'true') {
    app.listen(PORT, function() {
      console.log('Servidor rodando na porta ' + PORT);
      console.log('MUL-32: Trava de isolamento multi-tenant ativa');
    });
  }
}

// Export app for testing
module.exports = app;
