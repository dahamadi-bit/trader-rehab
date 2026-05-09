/**
 * API Route : /api/weekly-report
 * Génération du rapport comportemental hebdomadaire
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateWeeklyReport } from '@/lib/ai-coach'
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

    const interpretation   = interpretDisciplineScore(breakdown.total)
    const recommendations  = generateRecommendations(breakdown)

    // Rapport IA
    const aiReport = await generateWeeklyReport({
      review,
      trades,
      disciplineScore: breakdown.total,
      emotionalScore,
    })

    return NextResponse.json({
      disciplineScore:  breakdown.total,
      emotionalScore,
      interpretation,
      recommendations,
      aiReport,
    })
  } catch (error) {
    console.error('[/api/weekly-report] Error:', error)
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}
