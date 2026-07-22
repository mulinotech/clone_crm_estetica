# MUL-27 — Brief de Run Curto para a Dandara

**Decisão do board:** A) Estabilizar runtime da Dandara + re-disparar MUL-27. Edgar passa o artefato pronto para um **run curto** (sem re-investigar o repo).
**Autor do brief:** Edgar Musa (CEO) — 2026-07-22
**Objetivo deste brief:** transformar o MUL-27 em um run de **salvar-e-validar**, não de investigação. A causa raiz do `max_turns_exhausted` foi tentar re-mapear o repositório inteiro dentro do limite de 30 turns. Este brief remove essa causa.

---

## ⚠️ Regra de ouro do run
**NÃO re-investigar o repositório.** O diagnóstico já foi feito e verificado. O artefato existe, está completo e commitado. Seu run tem no máximo ~6 passos e deve fechar em poucos turns.

---

## O artefato já está pronto (não reproduzir)
- **Arquivo:** `D:\Mulino Tech\Musa-CRM\slo-baseline.md` (commit `2ff5a91`)
- **Conteúdo (4 seções completas):**
  1. Diagnóstico do estado atual — 15 dimensões mapeadas
  2. SLIs/SLOs candidatos — 5 SLOs priorizados por risco (S1–S5)
  3. Lacunas P0/P1/P2 — com sequência de execução e dependências
  4. Formato + cadência do resumo semanal — template + regra de honestidade, sexta-feira

## Achado mais crítico (já verificado — só confirmar, não re-descobrir)
- **`jest`/`supertest` não instalados → `npm test` falha e não há CI.** A suíte do MUL-23 não roda no estado atual. Este é o P0 nº 1.

---

## Checklist do run curto (faça exatamente isto, em ordem)
1. **Ler uma vez** `slo-baseline.md`. (1 turn)
2. **Confirmar** os fatos verificados abrindo apenas: `package.json` (ver ausência de jest/supertest em devDependencies) e a existência de `.github/workflows/` (ver ausência de CI). Só isso — sem varredura ampla. (1 turn)
3. **Adotar** `slo-baseline.md` como a entrega oficial do MUL-27 (documento/comentário na issue MUL-27), assumindo a titularidade de confiabilidade. (1 turn)
4. **Registrar** eventuais refinamentos como *comentário curto* — não reescrever o documento inteiro. (opcional, 1 turn)
5. **Definir disposição** do MUL-27 → `in_review` com revisores Edgar (CEO) + Silvia (CTO). (1 turn)
6. **Encerrar.** Não abrir novos loops de investigação. (fim)

## Boundaries (invioláveis)
- Read-only; **nada em produção**. Itens P0/P1 aguardam o gate da Silvia (MUL-26, já liberado para staging).
- Não mexer na infra do Paperclip.
- A primeira leva P0 (healthcheck `/api/health` + CI mínima + Sentry free) só começa **depois** do review e respeitando o gate da Silvia.

## Dependência de infra (não é sua — não gastar turns nisso)
- O `acpx_session_init_failed` (falha de spawn) é **infra Paperclip → dono: Rodrigo**. Se o seu run não iniciar, o problema é infra, não conteúdo. Não tente contornar re-investigando.

---

**Resumo:** o valor já está entregue. Seu run curto apenas dá titularidade e move para review. Se em qualquer momento você se pegar "mapeando o repo", pare — não é isso que o board pediu.
