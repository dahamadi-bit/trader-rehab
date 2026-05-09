/**
 * DisciplineScore — Calcul du score de discipline
 *
 * Score composite 0-100 reflétant la qualité comportementale
 * du trader sur une période donnée.
 *
 * Composantes :
 *   1. Respect du plan (30 pts)
 *   2. Contrôle émotionnel (25 pts)
 *   3. Gestion du risque (20 pts)
 *   4. Régularité (15 pts)
 *   5. Routines de vie (10 pts)
 *   − Pénalités violations (variable)
 *
 * Principe : le score est une description, pas un jugement.
 * Il sert à identifier les leviers d'amélioration, pas à culpabiliser.
 */

import type { Trade, DisciplineScoreBreakdown, RoutineLog } from '@/types'

// ============================================================
// POIDS DES COMPOSANTES
// ============================================================

const WEIGHTS = {
  PLAN_COMPLIANCE:    30,
  EMOTIONAL_CONTROL:  25,
  RISK_MANAGEMENT:    20,
  CONSISTENCY:        15,
  LIFE_ROUTINE:       10,
} as const

// ============================================================
// CALCUL PAR COMPOSANTE
// ============================================================

/**
 * Respect du plan de trading
 * Critères : plan_respected, setup_documented, justification remplie
 */
function calcPlanCompliance(trades: Trade[]): number {
  if (trades.length === 0) return WEIGHTS.PLAN_COMPLIANCE  // Pas de trade = pas de violation

  let score = 0
  const max = trades.length * 3  // 3 critères par trade

  for (const trade of trades) {
    if (trade.plan_respected === true)          score += 1
    if (trade.playbook_setup_id)                score += 1
    if (trade.plan_justification?.length > 20)  score += 1
  }

  return Math.round((score / max) * WEIGHTS.PLAN_COMPLIANCE)
}

/**
 * Contrôle émotionnel
 * Critères : pas de revenge flags, émotion déclarée calme, pas de stop déplacé
 */
function calcEmotionalControl(trades: Trade[]): number {
  if (trades.length === 0) return WEIGHTS.EMOTIONAL_CONTROL

  let score = 0
  const max = trades.length * 3

  for (const trade of trades) {
    if (!trade.revenge_flags || trade.revenge_flags.length === 0)  score += 1
    if (trade.emotion_before === 'calm' || trade.emotion_before === 'uncertain') score += 1
    if (!trade.stop_moved)  score += 1
  }

  return Math.round((score / max) * WEIGHTS.EMOTIONAL_CONTROL)
}

/**
 * Gestion du risque
 * Critères : RR ≥ 1.5, risque défini avant entrée, taille correcte
 */
function calcRiskManagement(trades: Trade[]): number {
  if (trades.length === 0) return WEIGHTS.RISK_MANAGEMENT

  let score = 0
  const max = trades.length * 3

  for (const trade of trades) {
    if (trade.rr_ratio !== null && trade.rr_ratio >= 1.5)   score += 1
    if (trade.risk_amount !== null && trade.risk_amount > 0) score += 1
    if (trade.stop_loss !== null)                            score += 1
  }

  return Math.round((score / max) * WEIGHTS.RISK_MANAGEMENT)
}

/**
 * Régularité
 * Critères : journal complété, checkins effectués, no consecutive misses
 */
function calcConsistency(params: {
  journalDaysLast30: number
  checkinDaysLast30: number
}): number {
  const { journalDaysLast30, checkinDaysLast30 } = params
  const target = 30

  const journalRate  = Math.min(journalDaysLast30 / target, 1)
  const checkinRate  = Math.min(checkinDaysLast30 / target, 1)
  const avgRate      = (journalRate + checkinRate) / 2

  return Math.round(avgRate * WEIGHTS.CONSISTENCY)
}

/**
 * Routines de vie
 * Critères : sommeil, exercice, méditation, revues journalières
 */
function calcLifeRoutine(routineLogs: RoutineLog[]): number {
  if (routineLogs.length === 0) return 0

  const recentLogs = routineLogs.slice(0, 7)  // 7 derniers jours
  let score = 0
  const max = recentLogs.length * 4  // 4 critères

  for (const log of recentLogs) {
    if (log.sleep_hours !== null && log.sleep_hours >= 7) score += 1
    if (log.exercise)    score += 1
    if (log.meditation)  score += 1
    if (log.morning_review && log.evening_review) score += 1
  }

  return Math.round((score / max) * WEIGHTS.LIFE_ROUTINE)
}

// ============================================================
// PÉNALITÉS
// ============================================================

interface ViolationCounts {
  revengeDetections: number
  forcedSessionCloses: number
  planViolations: number
  stopMovements: number
}

function calcPenalties(violations: ViolationCounts): number {
  let penalty = 0

  penalty += violations.revengeDetections  * 10  // -10 pts par détection revenge
  penalty += violations.forcedSessionCloses * 8   // -8 pts par fermeture forcée
  penalty += violations.planViolations      * 3   // -3 pts par violation de plan
  penalty += violations.stopMovements       * 5   // -5 pts par déplacement de stop

  return Math.min(penalty, 50)  // Cap à -50 pts max
}

// ============================================================
// CALCUL GLOBAL
// ============================================================

/**
 * Calcule le score de discipline complet.
 *
 * @returns DisciplineScoreBreakdown avec le score total et les composantes
 */
export function calculateDisciplineScore(params: {
  trades: Trade[]
  journalDaysLast30: number
  checkinDaysLast30: number
  routineLogs: RoutineLog[]
  violations: ViolationCounts
}): DisciplineScoreBreakdown {
  const { trades, journalDaysLast30, checkinDaysLast30, routineLogs, violations } = params

  const planCompliance    = calcPlanCompliance(trades)
  const emotionalControl  = calcEmotionalControl(trades)
  const riskManagement    = calcRiskManagement(trades)
  const consistency       = calcConsistency({ journalDaysLast30, checkinDaysLast30 })
  const lifeRoutine       = calcLifeRoutine(routineLogs)
  const penalties         = calcPenalties(violations)

  const raw = planCompliance + emotionalControl + riskManagement + consistency + lifeRoutine
  const total = Math.max(0, Math.min(100, raw - penalties))

  return {
    total,
    planCompliance,
    emotionalControl,
    riskManagement,
    consistency,
    lifeRoutine,
    penalties,
  }
}

// ============================================================
// INTERPRÉTATION DU SCORE
// ============================================================

export interface ScoreInterpretation {
  level: 'critical' | 'low' | 'developing' | 'solid' | 'excellent'
  label: string
  description: string
  primaryAction: string
  color: string
}

/**
 * Retourne une interprétation factuelle du score.
 * Ton : descriptif, non culpabilisant, orienté action.
 */
export function interpretDisciplineScore(score: number): ScoreInterpretation {
  if (score < 30) {
    return {
      level: 'critical',
      label: 'Critique',
      description: 'La discipline actuelle expose le capital à des risques élevés. Mode simulation recommandé.',
      primaryAction: 'Passer en mode simulation exclusivement.',
      color: '#e74c3c',
    }
  }
  if (score < 50) {
    return {
      level: 'low',
      label: 'Faible',
      description: 'Des patterns comportementaux problématiques sont identifiés. Focus sur le journal et le respect du plan.',
      primaryAction: 'Compléter le journal pour les 10 derniers trades.',
      color: '#e67e22',
    }
  }
  if (score < 70) {
    return {
      level: 'developing',
      label: 'En développement',
      description: 'Progression visible. Des axes d\'amélioration restent identifiables.',
      primaryAction: 'Renforcer la régularité du check-in quotidien.',
      color: '#f39c12',
    }
  }
  if (score < 85) {
    return {
      level: 'solid',
      label: 'Solide',
      description: 'Discipline établie. Le comportement est reproductible sur la durée.',
      primaryAction: 'Maintenir le cap. Analyser les 2-3 dernières violations.',
      color: '#27ae60',
    }
  }
  return {
    level: 'excellent',
    label: 'Excellent',
    description: 'Discipline de haut niveau. Le comportement est stable et méthodique.',
    primaryAction: 'Continuer. Documenter ce qui fonctionne pour le conserver.',
    color: '#2ecc71',
  }
}

// ============================================================
// RECOMMANDATIONS COMPORTEMENTALES
// ============================================================

/**
 * Génère des recommandations concrètes basées sur le breakdown.
 * Maximum 3 recommandations, ordonnées par impact.
 */
export function generateRecommendations(breakdown: DisciplineScoreBreakdown): string[] {
  const recs: Array<{ text: string; priority: number }> = []

  // Respect du plan
  const planRate = breakdown.planCompliance / 30
  if (planRate < 0.6) {
    recs.push({
      text: 'Documenter systématiquement la justification avant chaque entrée. L\'objectif est 100% des trades avec setup enregistré.',
      priority: 10,
    })
  }

  // Contrôle émotionnel
  const emotionalRate = breakdown.emotionalControl / 25
  if (emotionalRate < 0.6) {
    recs.push({
      text: 'Le stop ne se déplace jamais une fois posé. Le déplacer invalide le plan originel et biaise la gestion des pertes futures.',
      priority: 9,
    })
  }

  // Pénalités élevées
  if (breakdown.penalties > 15) {
    recs.push({
      text: 'Réduire le nombre de violations. Chaque violation coûte des points et doit être analysée dans le journal.',
      priority: 8,
    })
  }

  // Routines de vie
  const lifeRate = breakdown.lifeRoutine / 10
  if (lifeRate < 0.5) {
    recs.push({
      text: 'Les routines de vie (sommeil, exercice) corrèlent directement avec la qualité décisionnelle. 7h de sommeil minimum.',
      priority: 6,
    })
  }

  // Régularité journal
  const consistencyRate = breakdown.consistency / 15
  if (consistencyRate < 0.6) {
    recs.push({
      text: 'Le journal est l\'outil principal d\'amélioration. L\'objectif est 1 entrée par jour de trading, même pour les jours sans trade.',
      priority: 7,
    })
  }

  return recs
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3)
    .map(r => r.text)
}
