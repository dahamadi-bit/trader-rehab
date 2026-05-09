/**
 * BehavioralEngine — Moteur comportemental central
 *
 * C'est le cerveau de l'application. Il prend les décisions :
 * - Peut-on démarrer une session ?
 * - Quel est le niveau de risque comportemental ?
 * - Faut-il fermer la session ?
 * - Quel est le mode rechute ?
 *
 * Principe : règles déterministes, transparentes, non-manipulables.
 * Pas d'heuristiques floues. Chaque décision est justifiable.
 */

import type {
  DailyCheckIn,
  EmotionalAssessment,
  ActiveSessionState,
  Profile,
  RelapseMode,
  CloseReason,
} from '@/types'

// ============================================================
// CONSTANTES — Seuils comportementaux
// ============================================================

const THRESHOLDS = {
  // Seuils de blocage session (inclus)
  FATIGUE_BLOCK:   7,
  STRESS_BLOCK:    7,
  EUPHORIA_BLOCK:  7,

  // Seuils d'avertissement
  FATIGUE_WARN:    5,
  STRESS_WARN:     5,
  EUPHORIA_WARN:   5,

  // Limites session
  MAX_TRADES_PER_SESSION:      2,
  MAX_CONSECUTIVE_LOSSES:      2,
  COOLDOWN_AFTER_WIN_MINUTES:  30,

  // Rechute
  VIOLATIONS_FOR_WARNING:      1,
  VIOLATIONS_FOR_SUSPEND_24H:  3,
  VIOLATIONS_FOR_SUSPEND_7D:   5,

  // Score discipline
  MIN_SCORE_FOR_CAPITAL_UNLOCK: 70,
} as const

// ============================================================
// ÉVALUATION ÉMOTIONNELLE QUOTIDIENNE
// ============================================================

/**
 * Détermine si l'utilisateur peut démarrer une session de trading
 * en analysant son état émotionnel du check-in quotidien.
 *
 * Règle : fatigue >= 7 OU stress >= 7 OU euphorie >= 7 → BLOQUÉ
 */
export function evaluateEmotionalState(checkin: DailyCheckIn): EmotionalAssessment {
  const blockReasons: Array<'fatigue' | 'stress' | 'euphoria'> = []

  if (checkin.fatigue >= THRESHOLDS.FATIGUE_BLOCK)   blockReasons.push('fatigue')
  if (checkin.stress >= THRESHOLDS.STRESS_BLOCK)     blockReasons.push('stress')
  if (checkin.euphoria >= THRESHOLDS.EUPHORIA_BLOCK) blockReasons.push('euphoria')

  const canStartSession = blockReasons.length === 0

  // Niveau de risque global
  const maxScore = Math.max(checkin.fatigue, checkin.stress, checkin.euphoria, checkin.frustration)
  let riskLevel: EmotionalAssessment['riskLevel']
  if (maxScore >= 7)      riskLevel = 'critical'
  else if (maxScore >= 5) riskLevel = 'high'
  else if (maxScore >= 3) riskLevel = 'medium'
  else                    riskLevel = 'low'

  // Suggestions contextuelles (non culpabilisantes)
  const suggestions: string[] = []
  if (blockReasons.includes('fatigue')) {
    suggestions.push('Repos — une session fatiguée coûte plus qu\'elle ne rapporte.')
    suggestions.push('Backtest sur données historiques : même travail, zéro capital risqué.')
  }
  if (blockReasons.includes('stress')) {
    suggestions.push('30 minutes d\'exercice physique réduisent le cortisol de 20%.')
    suggestions.push('Lecture analytique : trader\'s psychology, market microstructure.')
  }
  if (blockReasons.includes('euphoria')) {
    suggestions.push('L\'euphorie est la cause n°1 du sur-trading. Pause stratégique.')
    suggestions.push('Revue du playbook : fixer les critères, pas les émotions du moment.')
  }
  if (suggestions.length === 0 && riskLevel === 'medium') {
    suggestions.push('État acceptable. Restez vigilant sur la gestion de position.')
  }

  return { canStartSession, blockReasons, riskLevel, suggestions }
}

// ============================================================
// ÉVALUATION SESSION ACTIVE
// ============================================================

/**
 * Vérifie si un trade supplémentaire peut être ouvert
 * dans la session en cours.
 */
export function canOpenTrade(session: ActiveSessionState): {
  allowed: boolean
  reason: string | null
} {
  // Maximum de trades atteint
  if (session.tradesCount >= THRESHOLDS.MAX_TRADES_PER_SESSION) {
    return {
      allowed: false,
      reason: `Maximum ${THRESHOLDS.MAX_TRADES_PER_SESSION} trades par session atteint. La session est terminée.`,
    }
  }

  // Maximum de pertes consécutives
  if (session.consecutiveLosses >= THRESHOLDS.MAX_CONSECUTIVE_LOSSES) {
    return {
      allowed: false,
      reason: `${THRESHOLDS.MAX_CONSECUTIVE_LOSSES} pertes consécutives. Arrêt automatique de la session.`,
    }
  }

  // Cooldown actif après un gain
  if (session.cooldownActive && session.cooldownEndsAt) {
    const remaining = Math.ceil(
      (session.cooldownEndsAt.getTime() - Date.now()) / 60000
    )
    if (remaining > 0) {
      return {
        allowed: false,
        reason: `Cooldown obligatoire après gain : ${remaining} minute(s) restante(s).`,
      }
    }
  }

  return { allowed: true, reason: null }
}

/**
 * Détermine si la session doit être fermée de force.
 */
export function shouldForceCloseSession(session: ActiveSessionState): {
  shouldClose: boolean
  reason: CloseReason | null
} {
  if (session.consecutiveLosses >= THRESHOLDS.MAX_CONSECUTIVE_LOSSES) {
    return { shouldClose: true, reason: 'max_losses' }
  }
  return { shouldClose: false, reason: null }
}



// ============================================================
// GESTION RECHUTE
// ============================================================

/**
 * Calcule le mode rechute en fonction du nombre de violations.
 * Escalade progressive et déterministe.
 */
export function calculateRelapseMode(totalViolations: number): RelapseMode {
  if (totalViolations === 0) return 'none'
  if (totalViolations < THRESHOLDS.VIOLATIONS_FOR_SUSPEND_24H) return 'warning'
  if (totalViolations < THRESHOLDS.VIOLATIONS_FOR_SUSPEND_7D)  return 'suspended_24h'
  return 'suspended_7d'
}

/**
 * Vérifie si l'utilisateur est en suspension active.
 */
export function isUserSuspended(profile: Profile): {
  suspended: boolean
  mode: RelapseMode
  remainingHours: number | null
  message: string | null
} {
  const { relapse_mode, relapse_until } = profile

  if (relapse_mode === 'none' || relapse_mode === 'warning') {
    return { suspended: false, mode: relapse_mode, remainingHours: null, message: null }
  }

  if (relapse_until) {
    const now = Date.now()
    const until = new Date(relapse_until).getTime()
    if (now < until) {
      const remainingHours = Math.ceil((until - now) / 3600000)
      const daysText = relapse_mode === 'suspended_7d' ? '7 jours' : '24 heures'
      return {
        suspended: true,
        mode: relapse_mode,
        remainingHours,
        message: `Suspension ${daysText} active. ${remainingHours}h restantes. Utilisez ce temps pour le backtest ou la révision du playbook.`,
      }
    }
  }

  // Suspension expirée
  return { suspended: false, mode: 'none', remainingHours: null, message: null }
}

// ============================================================
// CALCUL DE LOTAGE
// ============================================================

/**
 * Calcule la taille de position en fonction du risque défini.
 *
 * Formule : lot = (balance × riskPct) / (SL_pips × valeur_pip)
 *
 * Note : la valeur_pip varie selon l'instrument.
 * Pour un usage générique, on travaille en unités monétaires.
 */
export function calculatePositionSize(params: {
  accountBalance: number
  riskPercent: number    // Ex: 0.005 pour 0.5%
  entryPrice: number
  stopLoss: number
  pipValue?: number      // Valeur d'un pip en devise (défaut: 1)
}): {
  riskAmount: number
  stopPips: number
  lotSize: number
  maxLossDay: number
} {
  const { accountBalance, riskPercent, entryPrice, stopLoss, pipValue = 1 } = params

  const riskAmount = accountBalance * riskPercent
  const stopPips = Math.abs(entryPrice - stopLoss) / pipValue
  const lotSize = stopPips > 0 ? riskAmount / stopPips : 0

  return {
    riskAmount: Math.round(riskAmount * 100) / 100,
    stopPips: Math.round(stopPips * 10) / 10,
    lotSize: Math.round(lotSize * 100) / 100,
    maxLossDay: Math.round(accountBalance * 0.01 * 100) / 100,  // 1% max/jour
  }
}

// ============================================================
// DÉTECTION USAGE COMPULSIF
// ============================================================

interface UsageEvent {
  timestamp: number
  type: 'chart_open' | 'account_check' | 'app_open' | 'session_start'
}

/**
 * Analyse les événements d'usage pour détecter un comportement compulsif.
 * Seuils : >5 ouvertures graphiques en 30min, >3 vérifications de compte.
 */
export function detectCompulsiveUsage(events: UsageEvent[], windowMinutes = 30): {
  isCompulsive: boolean
  level: 'normal' | 'elevated' | 'compulsive'
  details: string[]
} {
  const now = Date.now()
  const windowMs = windowMinutes * 60 * 1000
  const recent = events.filter(e => now - e.timestamp < windowMs)

  const chartOpens    = recent.filter(e => e.type === 'chart_open').length
  const accountChecks = recent.filter(e => e.type === 'account_check').length

  const details: string[] = []
  let score = 0

  if (chartOpens > 5) {
    score += 2
    details.push(`${chartOpens} ouvertures de graphiques en ${windowMinutes}min`)
  }
  if (accountChecks > 3) {
    score += 2
    details.push(`${accountChecks} vérifications de compte en ${windowMinutes}min`)
  }

  // Activité nocturne (entre 23h et 6h locale)
  const hour = new Date().getHours()
  if (hour >= 23 || hour < 6) {
    score += 3
    details.push('Activité nocturne détectée (hors heures de marché recommandées)')
  }

  let level: 'normal' | 'elevated' | 'compulsive'
  if (score >= 5)      level = 'compulsive'
  else if (score >= 2) level = 'elevated'
  else                 level = 'normal'

  return { isCompulsive: level === 'compulsive', level, details }
}

// ============================================================
// CITATIONS FROIDES DU JOUR
// ============================================================

const COLD_QUOTES = [
  {
    text: "Le trading est un métier de probabilités, pas d'émotions. Les émotions sont du bruit.",
    author: "Axiome du risk management"
  },
  {
    text: "Une journée sans trade est une journée sans perte. C'est déjà une performance.",
    author: "Principe de préservation du capital"
  },
  {
    text: "La discipline n'est pas une contrainte. C'est la seule chose qui sépare un trader d'un joueur.",
    author: "Manuel de prop trading"
  },
  {
    text: "Le marché sera là demain. Votre capital aussi, si vous ne tradez pas aujourd'hui.",
    author: "Règle de survie"
  },
  {
    text: "Le plan existe pour les situations difficiles. En situation facile, n'importe qui peut trader.",
    author: "Psychologie du trading"
  },
  {
    text: "Attendre le bon setup n'est pas de l'inaction. C'est de l'exécution stratégique.",
    author: "Price Action Institute"
  },
  {
    text: "Votre pire ennemi dans les marchés, c'est votre conviction que vous avez raison.",
    author: "George Soros"
  },
  {
    text: "Préservez le capital. Le reste s'apprend. La perte totale n'admet aucune récupération.",
    author: "Règle fondamentale"
  },
  {
    text: "Un trade manqué coûte zéro. Un trade pris sans setup coûte réel.",
    author: "Principe anti-FOMO"
  },
  {
    text: "La répétition de petits actes disciplinés produit des résultats que l'impulsivité ne produit jamais.",
    author: "Philosophie de la constance"
  },
]

/** Retourne la citation du jour (déterministe basée sur la date) */
export function getDailyQuote(): { text: string; author: string } {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  )
  return COLD_QUOTES[dayOfYear % COLD_QUOTES.length]
}

// ============================================================
// ALTERNATIVES AU TRADING
// ============================================================

/** Liste des activités alternatives proposées lors d'un blocage */
export const TRADING_ALTERNATIVES = [
  { id: 'backtest',  label: 'Session Backtest',     description: 'Analyser des setups historiques sans capital réel.',       icon: '📊' },
  { id: 'playbook',  label: 'Révision Playbook',    description: 'Revoir et améliorer vos setups documentés.',               icon: '📋' },
  { id: 'reading',   label: 'Lecture',               description: 'Psychologie du trading, analyse de marché, académique.',   icon: '📚' },
  { id: 'exercise',  label: 'Activité Physique',     description: 'Réinitialise le cortisol. 20-30 minutes suffisent.',       icon: '🏃' },
  { id: 'music',     label: 'Guitare / Piano',       description: 'Activité à focus élevé sans dopamine financière.',         icon: '🎸' },
  { id: 'rest',      label: 'Repos',                 description: 'Le cerveau fatigué prend de mauvaises décisions.',         icon: '😴' },
  { id: 'journal',   label: 'Journal Réflexif',      description: 'Analyser les trades précédents, identifier les patterns.', icon: '✍️' },
]
