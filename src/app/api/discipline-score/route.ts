/**
 * API Route : /api/discipline-score
 * Recalcul et mise à jour du score de discipline
 */

import { NextRequest, NextResponse } from 'next/server'
import { calculateDisciplineScore, generateRecommendations } from '@/lib/discipline-score'
import { calculateRelapseMode } from '@/lib/behavioral-engine'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { trades, journalDays, checkinDays, routineLogs, violations, totalViolations } = body

    const breakdown = calculateDisciplineScore({
      trades: trades ?? [],
      journalDaysLast30: journalDays ?? 0,
      checkinDaysLast30: checkinDays ?? 0,
      routineLogs: routineLogs ?? [],
      violations: violations ?? {
        revengeDetections: 0,
        forcedSessionCloses: 0,
        planViolations: 0,
        stopMovements: 0,
      },
    })

    const recommendations = generateRecommendations(breakdown)
    const relapseMode = calculateRelapseMode(totalViolations ?? 0)

    return NextResponse.json({
      breakdown,
      recommendations,
      relapseMode,
    })
  } catch (error) {
    console.error('[/api/discipline-score] Error:', error)
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}
