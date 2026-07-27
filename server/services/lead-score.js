/**
 * MUL-33: Lead Score Service - Análise de qualificação de leads via Gemini
 *
 * Calcula um score de qualificação (0-100) para leads a partir da mensagem inicial.
 * Usa Google Gemini API para análise de intenção e fit com o negócio.
 *
 * Score: 0-30 (baixo), 31-70 (médio), 71-100 (alto)
 * Critérios: intenção de compra, urgência, fit com serviços, clareza da demanda.
 *
 * @author Rafael von Siemens
 * @date 2026-07-26
 */

'use strict';

const https = require('https');

/**
 * Chama a API do Google Gemini para gerar score de lead.
 *
 * @param {string} messageContent - Conteúdo da mensagem inicial do lead
 * @param {string} contactName - Nome do contato (opcional)
 * @returns {Promise<Object>} { score: number, reasoning: string, category: string }
 */
async function scoreLeadWithGemini(messageContent, contactName = '') {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn('[lead-score] GEMINI_API_KEY não configurada, retornando score default');
    return {
      score: 50,
      reasoning: 'Score padrão - Gemini API não configurada',
      category: 'medium'
    };
  }

  // Prompt otimizado para análise de lead de clínica estética
  const prompt = `Você é um analista de qualificação de leads para clínica de estética avançada.

Analise a mensagem abaixo e retorne um score de 0 a 100 baseado em:
1. Intenção de compra (mencionou interesse em procedimento?)
2. Urgência (quer agendar logo, tem evento próximo?)
3. Fit com serviços (mencionou tratamentos faciais, corporais, harmonização?)
4. Clareza da demanda (pergunta específica ou muito genérica?)

Mensagem do lead:
---
Nome: ${contactName || 'Não informado'}
Conteúdo: "${messageContent}"
---

Retorne APENAS um JSON válido (sem markdown, sem explicação adicional):
{
  "score": <número de 0 a 100>,
  "reasoning": "<explicação curta (1 frase) do score>",
  "category": "<low | medium | high>"
}`;

  try {
    const requestBody = JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.3, // Baixa variação para consistência
        maxOutputTokens: 200
      }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };

    const responseText = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`Gemini API retornou status ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.write(requestBody);
      req.end();
    });

    const response = JSON.parse(responseText);
    const generatedText = response.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      throw new Error('Gemini não retornou texto válido');
    }

    // Extrair JSON da resposta (Gemini às vezes adiciona markdown)
    const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Gemini não retornou JSON válido');
    }

    const scoreData = JSON.parse(jsonMatch[0]);

    // Validar estrutura
    if (typeof scoreData.score !== 'number' || scoreData.score < 0 || scoreData.score > 100) {
      throw new Error('Score inválido retornado pelo Gemini');
    }

    return {
      score: Math.round(scoreData.score),
      reasoning: scoreData.reasoning || 'Análise automática',
      category: scoreData.category || categorizeScore(scoreData.score)
    };

  } catch (error) {
    console.error('[lead-score] Erro ao chamar Gemini API:', error.message);

    // Fallback: análise simples baseada em keywords (fail-safe, não fail-silent)
    return fallbackScoreAnalysis(messageContent);
  }
}

/**
 * Categoriza o score numérico em low/medium/high.
 *
 * @param {number} score - Score de 0 a 100
 * @returns {string} Categoria do score
 */
function categorizeScore(score) {
  if (score <= 30) return 'low';
  if (score <= 70) return 'medium';
  return 'high';
}

/**
 * Análise fallback baseada em keywords (quando Gemini falha).
 *
 * @param {string} messageContent - Conteúdo da mensagem
 * @returns {Object} Score fallback
 */
function fallbackScoreAnalysis(messageContent) {
  const lowerMessage = messageContent.toLowerCase();
  let score = 50; // Base

  // Keywords de alta intenção (+20 cada, máx +40)
  const highIntentKeywords = ['agendar', 'marcar', 'consulta', 'procedimento', 'tratamento', 'harmonização'];
  const highIntentMatches = highIntentKeywords.filter(kw => lowerMessage.includes(kw)).length;
  score += Math.min(highIntentMatches * 20, 40);

  // Keywords de urgência (+15)
  if (lowerMessage.match(/hoje|amanhã|urgente|rápido|logo/)) {
    score += 15;
  }

  // Mensagens muito curtas ou genéricas (-20)
  if (messageContent.length < 10 || lowerMessage.match(/oi|olá|ola|hey|oie/)) {
    score -= 20;
  }

  // Capping
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    reasoning: 'Análise fallback baseada em keywords (Gemini indisponível)',
    category: categorizeScore(score)
  };
}

module.exports = {
  scoreLeadWithGemini,
  categorizeScore
};
