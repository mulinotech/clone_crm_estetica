# Baseline de Confiabilidade — Musa CRM (v0, draft)

**Data:** 2026-07-22 · **Modo:** Crescimento · **Issue:** MUL-27
**Autoria:** Edgar Musa (CEO), como *recovery owner* — o runtime da Dandara falhou no spawn (`acpx_session_init_failed`) e o board precisa da proposta. Isto é um **rascunho de partida (v0)**: a **Dandara é dona** de validar, refinar e operacionalizar estes SLOs assim que o runtime dela estabilizar e o gate da Silvia (MUL-26) liberar produção.
**Escopo:** diagnóstico + proposta, **somente leitura**. Nada toca produção antes de MUL-26.

---

## 1. Diagnóstico do estado atual (fatos do repo)

Repo: `D:\Mulino Tech\Musa-CRM` (`github.com/mulinotech/nathi_estetica_crm`).

| Dimensão | Estado hoje | Evidência |
|---|---|---|
| **Arquitetura** | Monólito: backend Express (`app.js`, 1.461 linhas, ~30 rotas REST `/api/*`) que também serve o frontend estático (`dist/`). Front Vite/React. | `app.js:20-27`, `package.json` |
| **Persistência** | MySQL via `mysql2`. Auth do painel por senha única (`VITE_ADMIN_PASSWORD`). | `.env.example`, `app.js:599` |
| **Integrações críticas** | Google Gemini (IA) e Evolution API (WhatsApp / captura de leads via webhook). | `app.js:628,715,1104` |
| **Build** | `vite build` → `dist/`. Backend roda `node app.js`. | `package.json` scripts |
| **Deploy** | **Manual, na Cloudez.** Sem IaC, sem script de deploy, sem rollback definido. | comentário `.env.example:1` |
| **CI** | **Inexistente.** Sem `.github/`, sem pipeline. Testes não rodam automaticamente em PR (pergunta em aberto da MUL-23). | ausência de `.github/`, STATUS-MUL-23.md Q5 |
| **Testes** | Jest + Supertest. **1 suíte** (`tests/webhook-whatsapp.test.js`, 8 cenários), cobrindo só o webhook do WhatsApp. Sem gate de cobertura. | `jest.config.js`, MUL-23 |
| **Containerização** | **Nenhuma** (sem Dockerfile/compose). Ambiente não reproduzível. | ausência de arquivos |
| **Observabilidade** | Apenas `console.log/error` (~145 pontos de try/catch+log). **Sem healthcheck**, sem agregação de logs, sem métricas, sem alerta, sem error tracking (Sentry/etc). | grep `app.js`; nenhum endpoint `/health` |
| **Segurança/segredos** | `.env` via dotenv; commit recente removeu chaves hardcoded (bom). Upload de payload até 50mb no webhook. | commit `8c7741a`, `app.js:21` |

**Sinais positivos recentes (MUL-23):** o webhook do WhatsApp ganhou validação defensiva (não crasha com payload malformado), anti-duplicação de leads (`SELECT ... FOR UPDATE`) e isolamento da Evolution API. Bom padrão de resiliência — mas ainda **bloqueado** para merge (git identity + acesso a staging).

**Dúvidas (viram comentário, não suposição):**
- Existe ambiente de **staging** de fato, ou só dev local → Cloudez prod? (MUL-23 pede acesso a staging que ainda não existe formalmente.)
- Como é feito o backup do MySQL na Cloudez hoje? (não há evidência no repo)
- Há domínio/DNS/observabilidade já provisionados na Cloudez?

---

## 2. SLOs / SLIs candidatos (v0 — validar com dados reais)

Ainda **não temos telemetria**, então estes são alvos de partida a instrumentar antes de comprometer. Ordem = do que mais protege receita/retenção.

| # | SLI (o que medir) | SLO candidato | Por que importa |
|---|---|---|---|
| S1 | **Disponibilidade da API** (% de req 2xx/3xx sobre total, janela 28d) | ≥ 99.5% | CRM fora do ar = clínica sem operar. |
| S2 | **Sucesso do webhook WhatsApp** (% de webhooks processados sem erro 5xx/crash) | ≥ 99.9% | É a **entrada de leads**. Perda aqui = perda de receita direta. |
| S3 | **Latência da API** (p95 das rotas `/api/*`) | p95 < 800ms | UX do time comercial; lentidão trava fechamento. |
| S4 | **Sucesso das integrações IA/WhatsApp** (% chamadas Gemini/Evolution OK) | ≥ 98% | Degrada silenciosamente hoje (sem alerta). |
| S5 | **Taxa de erro de deploy** (deploys sem rollback/hotfix em 24h) | ≥ 95% saudáveis | Deploy manual sem gate é o maior risco atual. |

**Custo (teto do modo Crescimento):** SLI de gasto de tokens IA/mês com **hard-stop em US$100** (Gemini + qualquer LLM). Alerta em 70% e 90%.

---

## 3. Lacunas priorizadas por risco a produção

**P0 — risco de queda/perda de receita (atacar primeiro):**
1. **Sem healthcheck nem monitoramento de uptime.** Se o CRM cair, ninguém sabe até a clínica reclamar. → propor endpoint `/api/health` + monitor externo (UptimeRobot/BetterStack, free tier).
2. **Sem gate de testes no deploy.** Deploy manual direto pra Cloudez, sem CI rodando os testes. Um push quebrado vai pra prod. → CI mínima (GitHub Actions rodando `npm test`) como gate de PR.
3. **Sem visibilidade de erros em runtime.** `console.log` na Cloudez não é observabilidade. → error tracking (Sentry free) + log estruturado.

**P1 — fragilidade operacional:**
4. **Ambiente não reproduzível** (sem Docker, sem staging formal). Deploy é artesanal. → Dockerfile + docker-compose para dev/staging paridade.
5. **Sem estratégia de rollback** definida na Cloudez.
6. **Backup de MySQL não verificado.** → confirmar rotina + teste de restore.

**P2 — dívida de qualidade:**
7. **Cobertura de teste concentrada em 1 rota.** ~30 rotas sem teste. → expandir gradualmente, começando pelas rotas de escrita (`/api/leads`, `/api/clients`).

> **Nota de sequência:** P0 #1 e #2 são baratos, alto impacto e **não tocam produção** (healthcheck é código; CI roda no GitHub) — candidatos ideais para a primeira leva pós-MUL-26. Tudo que altera runtime de prod aguarda o gate da Silvia.

---

## 4. Formato do resumo semanal de confiabilidade

**Entregue por:** Dandara → Edgar (CEO), com cópia à Silvia (CTO).
**Cadência proposta:** **toda sexta-feira**, fechando a semana operacional (deploys da semana já assentados, dá pra decidir a próxima). Formato curto — cabe em uma tela.

```
# Resumo de Confiabilidade — Semana {N} ({data})

## 🚦 Semáforo geral: 🟢/🟡/🔴 — {frase de uma linha}

## Deploys
- Nº de deploys · sucesso/rollback · o que foi

## Incidentes
- Nº · maior severidade · MTTR · 1 linha de causa+ação

## SLOs (vs. alvo)
- S1 Disponibilidade: X% (alvo 99.5%) 🟢
- S2 Webhook WhatsApp: X% (alvo 99.9%)
- S3 Latência p95: Xms (alvo <800ms)
- (só os que já têm telemetria; resto = "não instrumentado")

## 💸 Custo IA (teto US$100/mês)
- Gasto acumulado no mês: US$X (X% do teto) · projeção fim do mês

## 🔧 Gargalo da semana + próximo passo proposto
- 1 item, acionável
```

**Regra:** se um SLI ainda não tem telemetria, o resumo diz **"não instrumentado"** — nunca inventa número. Honestidade > maquiagem.

---

## 5. Próximos passos e propriedade

- **Dono da execução:** Dandara (assim que runtime estabilizar). Este v0 é ponto de partida, não decisão fechada.
- **Review:** Edgar (CEO) + Silvia (CTO). Silvia valida o que toca produção.
- **Bloqueio de prod:** tudo que altera produção aguarda **MUL-26** (gate da Silvia).
- **Fora de escopo (confirmado):** infra do Paperclip e migração para VPS.
- **Primeira leva sugerida pós-MUL-26** (baixo custo, não-prod primeiro): `/api/health` + CI de testes no PR + Sentry free. A instrumentar antes de fechar os SLOs numéricos.
