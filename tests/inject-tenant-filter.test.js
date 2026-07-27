/**
 * MUL-49: Teste unitário do injectTenantFilter - Demonstra furo com OR/precedência
 *
 * Este teste não precisa de banco de dados, apenas valida a manipulação de string da query.
 *
 * @author Rafael von Siemens
 * @date 2026-07-27
 */

'use strict';

// MUL-49: Copiar a função corrigida do database.js para testar isoladamente
function injectTenantFilter(query) {
  const normalized = query.trim().replace(/\s+/g, ' ');

  // Detectar se já existe cláusula WHERE
  const whereMatch = normalized.match(/\bWHERE\b/i);

  if (whereMatch) {
    // WHERE existe: adicionar tenant_id = ? AND (condição_original)
    // IMPORTANTE: Parentetizar afterWhere para isolar precedência do OR
    const whereIndex = normalized.toUpperCase().indexOf('WHERE');
    const beforeWhere = normalized.slice(0, whereIndex + 5); // WHERE tem 5 chars
    const afterWhere = normalized.slice(whereIndex + 5).trim();

    // MUL-49: Envolver afterWhere em parênteses para evitar vazamento com OR
    return `${beforeWhere} tenant_id = ? AND (${afterWhere})`;
  } else {
    // WHERE não existe: adicionar WHERE tenant_id = ? antes de ORDER BY, LIMIT, etc.
    // Detectar cláusulas de ordenação/limitação
    const orderMatch = normalized.match(/\b(ORDER BY|LIMIT|GROUP BY)\b/i);

    if (orderMatch) {
      const clauseIndex = normalized.toUpperCase().indexOf(orderMatch[0].toUpperCase());
      const beforeClause = normalized.slice(0, clauseIndex).trim();
      const afterClause = normalized.slice(clauseIndex);

      return `${beforeClause} WHERE tenant_id = ? ${afterClause}`;
    } else {
      // Nenhuma cláusula especial: adicionar WHERE tenant_id = ? no final
      return `${normalized} WHERE tenant_id = ?`;
    }
  }
}

describe('MUL-49: injectTenantFilter - Furo com OR/precedência', () => {
  test('Query com OR no WHERE deve ter parênteses ao redor da condição original', () => {
    const originalQuery = "SELECT * FROM leads WHERE status = 'novo' OR status = 'ativo'";
    const injectedQuery = injectTenantFilter(originalQuery);

    // CORREÇÃO MUL-49: Parentetizar o WHERE original para evitar vazamento
    // RESULTADO CORRETO:
    // "SELECT * FROM leads WHERE tenant_id = ? AND (status = 'novo' OR status = 'ativo')"
    //
    // Sem parênteses, precedência SQL (AND > OR) causaria vazamento:
    // "tenant_id = ? AND status = 'novo' OR status = 'ativo'"
    // → interpretado como: (tenant_id = ? AND status = 'novo') OR (status = 'ativo')
    // → o segundo ramo do OR ignora tenant_id = VAZAMENTO
    const expectedQuery = "SELECT * FROM leads WHERE tenant_id = ? AND (status = 'novo' OR status = 'ativo')";

    expect(injectedQuery).toBe(expectedQuery);
  });

  test('Query com AND também recebe parênteses (consistência)', () => {
    const originalQuery = "SELECT * FROM leads WHERE status = 'novo' AND treatment = 'Botox'";
    const injectedQuery = injectTenantFilter(originalQuery);

    // Mesmo com AND (sem risco de precedência), parentetizar mantém consistência
    const expectedQuery = "SELECT * FROM leads WHERE tenant_id = ? AND (status = 'novo' AND treatment = 'Botox')";

    expect(injectedQuery).toBe(expectedQuery);
  });

  test('Query sem WHERE deve adicionar WHERE tenant_id = ? corretamente', () => {
    const originalQuery = "SELECT * FROM leads ORDER BY date DESC";
    const injectedQuery = injectTenantFilter(originalQuery);

    // Sem WHERE original, não há o que parentetizar
    const expectedQuery = "SELECT * FROM leads WHERE tenant_id = ? ORDER BY date DESC";

    expect(injectedQuery).toBe(expectedQuery);
  });

  test('Query com condição complexa (múltiplos OR e AND) mantém isolamento', () => {
    const originalQuery = "SELECT * FROM leads WHERE (status = 'novo' OR status = 'ativo') AND treatment = 'Botox'";
    const injectedQuery = injectTenantFilter(originalQuery);

    // Parentetizar a condição completa garante isolamento independente da complexidade
    const expectedQuery = "SELECT * FROM leads WHERE tenant_id = ? AND ((status = 'novo' OR status = 'ativo') AND treatment = 'Botox')";

    expect(injectedQuery).toBe(expectedQuery);
  });
});
