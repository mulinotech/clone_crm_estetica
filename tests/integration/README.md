# Testes de Integração — MUL-37

## Objetivo

Testes de integração que rodam contra um MySQL real, validando:
- Migrations são aplicadas corretamente
- Schema multi-tenant está correto (tenant_id NOT NULL)
- CRUD básico funciona
- Isolamento por tenant_id funciona

Esses testes servem de **fundação para a MUL-C** (testes de isolamento multi-tenant).

## Estrutura

```
tests/
├── setup-test-db.js           # Script de setup: recria DB, roda migrations, faz seed
├── integration/
│   ├── database.test.js       # Testes de integração com MySQL real
│   └── README.md              # Este arquivo
├── health.test.js             # Testes unitários (mockados, SKIP_DB_INIT=true)
└── webhook-whatsapp.test.js   # Testes unitários (mockados)
```

## Como rodar localmente

### Pré-requisitos

1. MySQL rodando localmente (ou Docker):
   ```bash
   docker run -d --name mysql-test \
     -e MYSQL_ROOT_PASSWORD=root \
     -e MYSQL_DATABASE=musa_crm_test \
     -p 3306:3306 \
     mysql:8.0
   ```

2. Variáveis de ambiente configuradas:
   ```bash
   export DB_HOST=127.0.0.1
   export DB_PORT=3306
   export DB_USER=root
   export DB_PASSWORD=root
   export DB_NAME=musa_crm_test
   export NODE_ENV=test
   ```

### Rodar testes de integração

```bash
# 1. Instalar dependências
npm ci

# 2. Setup do banco de teste (recria DB + migrations + seed)
npm run test:db:setup

# 3. Rodar testes de integração
npm run test:integration
```

### Rodar testes unitários (mockados, sem banco)

```bash
npm run test:unit
```

### Rodar toda a suíte (unit + integration)

```bash
npm test
```

## CI (GitHub Actions)

O workflow `.github/workflows/ci.yml` tem dois jobs:

1. **unit-tests**: testes mockados, rápidos, sem banco (`SKIP_DB_INIT=true`)
2. **integration-tests**: 
   - Sobe MySQL 8.0 como service container
   - Aguarda healthcheck (banco pronto)
   - Roda `npm run test:db:setup` (recria DB + migrations)
   - Roda `npm run test:integration`

Ambos os jobs rodam em paralelo.

## Acceptance Criteria (MUL-37) ✓

- [x] `.github/workflows/ci.yml` sobe MySQL service e aguarda healthcheck
- [x] Migrations rodam no CI sem `SKIP_DB_INIT`, CI fica verde
- [x] Existe teste de integração que lê/escreve no MySQL real (`database.test.js`)
- [x] Falha proposital de banco quebra o CI (teste `should fail when inserting invalid data`)
- [x] Rodar suíte 2x seguidas dá mesmo resultado (setup-test-db recria DB limpo)
- [x] `npm test` funciona localmente

## Próximos passos (MUL-C)

Os testes de **isolamento multi-tenant** serão criados na MUL-C, usando este mesmo padrão:
- Query no contexto do tenant A
- Verificar que 100% dos registros retornados têm `tenant_id = A`
- Query não deve vazar registros de outros tenants
