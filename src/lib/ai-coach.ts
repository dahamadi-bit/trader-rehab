/**
 * AICoach — Interface avec OpenAI pour l'analyse comportementale
 *
 * Rôle : coach froid, psychologue comportemental, risk manager.
 * Jamais : motivateur euphorique, vendeur de rêve.
 *
 * Toutes les prompts sont calibrées pour produire des analyses
 * factuelles, non culpabilisantes, orientées action.
 */

import OpenAI from 'openai'
import type { Trade, WeeklyReview } from '@/types'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// ============================================================
// SYSTEM PROMPT — Identité du coach IA
// ============================================================

const COACH_SYSTEM_PROMPT = `Tu es un coach comportemental spécialisé en psychologie du trading.

Ton rôle est d'analyser des données de trading (journaux, statistiques, émotions) et de produire des observations factuelles et des recommandations concrètes.

Tes principes fondamentaux :
1. FACTUEL : tu ne parles que de ce que les données montrent. Pas de suppositions.
2. NON CULPABILISANT : les erreurs sont des données, pas des fautes. Ton ton est neutre.
3. CONCRET : chaque observation est suivie d'une action spécifique.
4. BREF : 3-5 observations maximum. Pas de remplissage.
5. FROID : tu n'es pas un motivateur. Tu es un analyste comportemental.

Ce que tu ne fais JAMAIS :
- Encourager à trader plus.
- Minimiser les pertes ("c'est juste un mauvais jour").
- Promettre des résultats.
- Utiliser des métaphores guerrières ou de victoire.

Format de réponse : texte structuré, sans markdown, sans émojis.
Maximum 250 mots.`

// ============================================================
// ANALYSE D'UN TRADE INDIVIDUEL
// ============================================================

export async function analyzeTradeWithAI(trade: Trade): Promise<string> {
  const tradeData = {
    symbol: trade.symbol,
    direction: trade.direction,
    result: trade.result,
    pnl: trade.pnl,
    plan_respected: trade.plan_respected,
    emotion_before: trade.emotion_before,
    emotion_during: trade.emotion_during,
    stop_moved: trade.stop_moved,
    main_error: trade.main_error,
    execution_quality: trade.execution_quality,
    revenge_flags: trade.revenge_flags,
    plan_justification: trade.plan_justification,
    behavioral_notes: trade.behavioral_notes,
  }

  const prompt = `Analyse ce trade :

${JSON.stringify(tradeData, null, 2)}

Identifie :
1. Le pattern comportemental principal (s'il y en a un).
2. Ce qui a fonctionné dans l'exécution.
3. Une recommandation concrète pour le prochain trade similaire.

Si le trade a été bien exécuté, dis-le simplement. Pas besoin d'inventer des critiques.`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: COACH_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      max_tokens: 400,
      temperature: 0.3,  // Basse : réponses cohérentes, pas créatives
    })

    return response.choices[0]?.message?.content ?? 'Analyse indisponible.'
  } catch (error) {
    console.error('[AICoach] analyzeTradeWithAI error:', error)
    return 'Analyse IA temporairement indisponible. Continuez le journal manuellement.'
  }
}

// ============================================================
// RAPPORT HEBDOMADAIRE
// ============================================================

export async function generateWeeklyReport(params: {
  review: WeeklyReview
  trades: Trade[]
  disciplineScore: number
  emotionalScore: number
}): Promise<string> {
  const { review, trades, disciplineScore, emotionalScore } = params

  const weekData = {
    semaine: `${review.week_start} au ${review.week_end}`,
    score_discipline: disciplineScore,
    score_emotional: emotionalScore,
    nombre_trades: trades.length,
    wins: trades.filter(t => t.result === 'win').length,
    losses: trades.filter(t => t.result === 'loss').length,
    plan_respect_score: review.plan_respect_score,
    revenge_trading_urge: review.revenge_trading_urge,
    emotion_dominante: review.dominant_emotion,
    erreurs_principales: review.main_errors,
    déclencheurs: review.triggers,
    activite_physique_jours: review.exercise_days,
    meditation_jours: review.meditation_days,
  }

  const prompt = `Génère un rapport comportemental hebdomadaire pour ce trader.

Données de la semaine :
${JSON.stringify(weekData, null, 2)}

Structure :
OBSERVATIONS (2-3 observations objectives sur les données)
PATTERNS (patterns comportementaux identifiés cette semaine)
RECOMMANDATIONS (2-3 actions concrètes pour la semaine suivante)
FOCUS PRINCIPAL (une seule chose sur laquelle concentrer l'énergie)

Rappel : factuel, non culpabilisant, orienté action. Pas de jugement moral.`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: COACH_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      max_tokens: 600,
      temperature: 0.3,
    })

    return response.choices[0]?.message?.content ?? 'Rapport indisponible.'
  } catch (error) {
    console.error('[AICoach] generateWeeklyReport error:', error)
    return 'Rapport IA temporairement indisponible.'
  }
}

// ============================================================
// ANALYSE DES PATTERNS LONG TERME
// ============================================================

export async function analyzePatterns(trades: Trade[]): Promise<{
  patterns: string[]
  riskAreas: string[]
  strengths: string[]
}> {
  if (trades.length < 5) {
    return {
      patterns: ['Données insuffisantes. Minimum 5 trades requis pour l\'analyse.'],
      riskAreas: [],
      strengths: [],
    }
  }

  const summary = {
    total_trades: trades.length,
    win_rate: trades.filter(t => t.result === 'win').length / trades.length,
    avg_rr: trades.filter(t => t.rr_ratio).reduce((a, t) => a + (t.rr_ratio ?? 0), 0) / trades.filter(t => t.rr_ratio).length,
    plan_respected_rate: trades.filter(t => t.plan_respected).length / trades.length,
    revenge_trade_count: trades.filter(t => (t.revenge_flags?.length ?? 0) > 0).length,
    stop_moved_count: trades.filter(t => t.stop_moved).length,
    main_errors: trades.map(t => t.main_error).filter(Boolean),
    emotions_before: trades.map(t => t.emotion_before).filter(Boolean),
  }

  const prompt = `Analyse les patterns comportementaux de ce trader sur ${trades.length} trades.

Données agrégées :
${JSON.stringify(summary, null, 2)}

Retourne exactement ce JSON (sans markdown) :
{
  "patterns": ["pattern 1", "pattern 2"],
  "riskAreas": ["zone de risque 1", "zone de risque 2"],
  "strengths": ["point fort 1", "point fort 2"]
}

Maximum 2 éléments par tableau. Factuel uniquement.`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: COACH_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      max_tokens: 400,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content
    if (!content) throw new Error('Empty response')

    return JSON.parse(content)
  } catch {
    return {
      patterns: ['Analyse indisponible.'],
      riskAreas: [],
      strengths: [],
    }
  }
}
