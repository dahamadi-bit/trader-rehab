/**
 * AICoach — Formatage des données pour analyse externe (Claude, etc.)
 * OpenAI supprimé — l'analyse qualitative est faite manuellement via Claude.
 */

import type { Trade, WeeklyReview } from '@/types'

// Conservé pour compatibilité des imports existants
export async function analyzeTradeWithAI(_trade: Trade): Promise<string> {
  return ''
}

export async function generateWeeklyReport(_params: {
  review: WeeklyReview
  trades: Trade[]
  disciplineScore: number
  emotionalScore: number
}): Promise<string> {
  return ''
}

export async function analyzePatterns(_trades: Trade[]): Promise<{
  patterns: string[]
  riskAreas: string[]
  strengths: string[]
}> {
  return { patterns: [], riskAreas: [], strengths: [] }
}
