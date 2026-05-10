/**
 * API Route : /api/weekly-report
 * Calcul local des scores + génération d'un résumé exportable pour analyse externe.
 * Pas de dépendance OpenAI — l'analyse qualitative est faite par l'utilisateur (Claude, etc.)
 */

import { NextRequest, NextResponse } from 'next/server'
import { calculateDisciplineScore, interpretDisciplineScore, generateRecommendations } from '@/lib/discipline-score'
import type { WeeklyReview, Trade } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { review, trades }: { review: WeeklyReview; trades: Trade[] } = body

    if (!review || !trades) {
      return NextResponse.json({ error: 'review et trades requis' }, { status: 400 })
    }

    // Calcul des scores
    const breakdown = calculateDisciplineScore({
      trades,
      journalDaysLast30: trades.length > 0 ? Math.min(trades.length, 5) : 0,
      checkinDaysLast30: 5,
      routineLogs: [],
      violations: {
        revengeDetections:   trades.filter(t => (t.revenge_flags?.length ?? 0) > 0).length,
        forcedSessionCloses: 0,
        planViolations:      trades.filter(t => !t.plan_respected).length,
        stopMovements:       trades.filter(t => t.stop_moved).length,
      },
    })

    const emotionalScore = review.plan_respect_score !== null
      ? Math.round(
          ((10 - (review.revenge_trading_urge ?? 5)) +
           (10 - (review.market_avoidance_difficulty ?? 5)) +
           (review.discipline_quality ?? 5)) / 3 * 10
        )
      : 50

    const interpretation  = interpretDisciplineScore(breakdown.total)
    const recommendations = generateRecommendations(breakdown)

    // Résumé exportable — à copier dans Claude ou tout autre outil d'analyse
    const exportText = formatExportText(review, trades, breakdown.total, emotionalScore, recommendations)

    return NextResponse.json({
      disciplineScore:  breakdown.total,
      emotionalScore,
      interpretation,
      recommendations,
      exportText,   // Remplace aiReport — à coller dans Claude
    })
  } catch (error) {
    console.error('[/api/weekly-report] Error:', error)
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}

function formatExportText(
  review: WeeklyReview,
  trades: Trade[],
  disciplineScore: number,
  emotionalScore: number,
  recommendations: string[]
): string {
  const wins      = trades.filter(t => t.result === 'win').length
  const losses    = trades.filter(t => t.result === 'loss').length
  const pnlTotal  = trades.reduce((sum, t) => sum + (t.pnl ?? 0), 0)
  const planRespected = trades.filter(t => t.plan_respected === true).length
  const violations    = trades.filter(t => t.plan_respected === false || t.stop_moved).length

  return `BILAN HEBDOMADAIRE TRADER — ${review.week_start} au ${review.week_end}

SCORES
  Discipline : ${disciplineScore}/100
  Émotionnel : ${emotionalScore}/100

ACTIVITÉ TRADING
  Trades : ${trades.length} (${wins} gains / ${losses} pertes)
  PnL total : ${pnlTotal >= 0 ? '+' : ''}${pnlTotal.toFixed(2)} $
  Plans respectés : ${planRespected}/${trades.length}
  Violations : ${violations}

AUTO-ÉVALUATION
  Respect du plan : ${review.plan_respect_score ?? 'N/R'}/10
  Qualité discipline : ${review.discipline_quality ?? 'N/R'}/10
  Envie de revenge trading : ${review.revenge_trading_urge ?? 'N/R'}/10
  Difficulté à décrocher : ${review.market_avoidance_difficulty ?? 'N/R'}/10

VIE HORS TRADING
  Sommeil moyen : ${review.sleep_avg ?? 'N/R'}h
  Jours sport : ${review.exercise_days ?? 'N/R'}/7
  Jours méditation : ${review.meditation_days ?? 'N/R'}/7

OBSERVATIONS PERSONNELLES
  Émotion dominante : ${review.dominant_emotion ?? 'Non renseigné'}
  Erreurs identifiées : ${review.main_errors ?? 'Non renseigné'}
  Déclencheurs : ${review.triggers ?? 'Non renseigné'}
  Autres activités : ${review.other_activities ?? 'Non renseigné'}

${trades.length > 0 ? `DÉTAIL DES TRADES
${trades.map(t => `  ${t.symbol} ${t.direction ?? ''} — ${t.result ?? 'open'} — PnL: ${t.pnl !== null ? (t.pnl >= 0 ? '+' : '') + t.pnl.toFixed(2) + ' $' : 'N/R'} — Plan: ${t.plan_respected === true ? 'respecté' : t.plan_respected === false ? 'non respecté' : 'N/R'} — Émotion: ${t.emotion_before ?? 'N/R'} — Erreur: ${t.main_error ?? 'aucune'}`).join('\n')}` : 'Aucun trade cette semaine.'}

RECOMMANDATIONS GÉNÉRÉES
${recommendations.map((r, i) => `  ${i + 1}. ${r}`).join('\n')}

---
Analyse ce bilan comportemental de trader. Identifie les patterns, les progrès, et donne 2-3 recommandations concrètes pour la semaine suivante. Sois factuel, non culpabilisant, orienté action.`
}
