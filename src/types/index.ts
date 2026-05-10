/**
 * Types TypeScript globaux — TraderRehab
 * Source de vérité pour toute l'application
 */

// ============================================================
// ENUMS
// ============================================================

export type SessionType = 'real' | 'prop_firm' | 'simulation'
export type TradeDirection = 'long' | 'short'
export type TradeResult = 'win' | 'loss' | 'breakeven' | 'open'
export type TradeEmotion = 'calm' | 'excited' | 'fearful' | 'uncertain' | 'frustrated' | 'overconfident'
export type TradeError = 'impulse' | 'revenge' | 'overconfidence' | 'fear' | 'fomo' | 'none'
export type CloseReason = 'max_losses' | 'revenge_detected' | 'manual' | 'timeout' | 'force_closed'
export type RelapseMode = 'none' | 'warning' | 'suspended_24h' | 'suspended_7d' | 'sim_only'
export type EventSeverity = 'info' | 'warning' | 'critical'

export type BehavioralEventType =
  | 'session_blocked_emotional'
  | 'revenge_detected'
  | 'session_force_closed'
  | 'max_losses_reached'
  | 'cooldown_bypassed'
  | 'compulsive_usage_detected'
  | 'emergency_button_pressed'
  | 'relapse_mode_activated'
  | 'discipline_score_drop'

// ============================================================
// MODÈLES — Correspond aux tables Supabase
// ============================================================

export interface Profile {
  id: string
  created_at: string
  updated_at: string
  display_name: string | null
  timezone: string
  challenge_type: SessionType
  account_balance: number
  drawdown_floor: number
  max_risk_per_trade: number
  max_risk_per_day: number
  min_rr_ratio: number
  discipline_score: number
  consecutive_clean_days: number
  total_violations: number
  relapse_mode: RelapseMode
  relapse_until: string | null
  personal_capital_unlocked: boolean
  journal_days_completed: number
  prop_firm_validated: boolean
  days_without_discomfort: number
}

export type AccountType = 'prop_firm' | 'personal' | 'simulation'

export interface TradingAccount {
  id: string
  user_id: string
  created_at: string
  updated_at: string
  name: string                        // "FTMO 100K", "Oanda Personnel"
  broker: string | null               // "FTMO", "Oanda", "Darwinex"…
  account_type: AccountType
  account_balance: number
  starting_balance: number
  drawdown_floor: number | null       // Plancher absolu (prop firm)
  max_risk_per_trade: number          // % ex: 0.005
  max_risk_per_day: number            // % ex: 0.01
  min_rr_ratio: number
  max_trades_per_session: number
  max_consecutive_losses: number
  is_active: boolean
  is_default: boolean
  notes: string | null
}

export interface DailyCheckIn {
  id: string
  user_id: string
  created_at: string
  checkin_date: string
  fatigue: number
  stress: number
  euphoria: number
  frustration: number
  motivation: number
  sleep_quality: number
  sleep_hours: number | null
  exercise_done: boolean
  meditation_done: boolean
  session_blocked: boolean
  block_reason: string | null
  notes: string | null
}

export interface TradingSession {
  id: string
  user_id: string
  created_at: string
  started_at: string
  ended_at: string | null
  session_type: SessionType
  status: 'active' | 'completed' | 'force_closed' | 'blocked'
  close_reason: CloseReason | null
  trades_count: number
  wins_count: number
  losses_count: number
  consecutive_losses: number
  pnl_session: number
  duration_minutes: number | null
  checkin_id: string | null
  emotional_state_open: string | null
  notes: string | null
}

export interface Trade {
  id: string
  user_id: string
  session_id: string | null
  playbook_setup_id: string | null
  created_at: string
  updated_at: string
  symbol: string
  direction: TradeDirection | null
  session_type: SessionType

  // Plan
  market_context: string | null
  setup_name: string | null
  setup_description: string | null
  entry_price: number | null
  stop_loss: number | null
  take_profit_1: number | null
  take_profit_2: number | null
  risk_amount: number | null
  rr_ratio: number | null
  plan_justification: string | null

  // Avant
  emotion_before: TradeEmotion | null
  emotion_before_note: string | null
  confidence_level: number | null
  screenshot_before_url: string | null

  // Pendant
  plan_respected: boolean | null
  stop_moved: boolean
  stop_moved_reason: string | null
  emotion_during: string | null
  temptation_notes: string | null

  // Après
  exit_price: number | null
  pnl: number | null
  result: TradeResult | null
  exit_reason: string | null
  main_error: TradeError | null
  execution_quality: number | null
  behavioral_notes: string | null
  screenshot_after_url: string | null

  discipline_score_impact: number
  revenge_flags: string[]
  ai_analysis: string | null
  ai_analyzed_at: string | null
}

export interface PlaybookSetup {
  id: string
  user_id: string
  created_at: string
  updated_at: string
  name: string
  pattern_type: string
  description: string | null
  entry_conditions: string
  invalidation: string
  target_description: string | null
  screenshot_valid_url: string | null
  screenshot_invalid_url: string | null
  trades_count: number
  win_rate: number
  avg_rr: number
  is_active: boolean
}

export interface WeeklyReview {
  id: string
  user_id: string
  created_at: string
  week_start: string
  week_end: string
  plan_respect_score: number | null
  dominant_emotion: string | null
  main_errors: string | null
  triggers: string | null
  discipline_quality: number | null
  revenge_trading_urge: number | null
  market_avoidance_difficulty: number | null
  sleep_avg: number | null
  exercise_days: number | null
  meditation_days: number | null
  other_activities: string | null
  discipline_score_week: number | null
  emotional_score_week: number | null
  recommendations: string | null
  ai_report: string | null
  pdf_url: string | null
}

export interface BehavioralEvent {
  id: string
  user_id: string
  created_at: string
  event_type: BehavioralEventType
  severity: EventSeverity
  description: string | null
  metadata: Record<string, unknown> | null
  session_id: string | null
}

export interface RoutineLog {
  id: string
  user_id: string
  log_date: string
  created_at: string
  morning_review: boolean
  exercise: boolean
  meditation: boolean
  reading: boolean
  music_practice: boolean
  evening_review: boolean
  sleep_hours: number | null
  exercise_minutes: number | null
  meditation_minutes: number | null
  notes: string | null
  discipline_contribution: number
}

// ============================================================
// ÉTATS APPLICATIFS
// ============================================================

/** Résultat de l'évaluation émotionnelle quotidienne */
export interface EmotionalAssessment {
  canStartSession: boolean
  blockReasons: Array<'fatigue' | 'stress' | 'euphoria'>
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  suggestions: string[]
}

/** Résultat de la détection revenge trading */
export interface RevengeDetectionResult {
  detected: boolean
  flags: string[]
  riskScore: number   // 0-100
  category: 'safe' | 'concerning' | 'revenge' | 'tilt'
}

/** Score de discipline calculé */
export interface DisciplineScoreBreakdown {
  total: number             // 0-100
  planCompliance: number    // Respect du plan
  emotionalControl: number  // Contrôle émotionnel
  riskManagement: number    // Gestion du risque
  consistency: number       // Régularité
  lifeRoutine: number       // Routines de vie
  penalties: number         // Pénalités violations
}

/** Paramètres de risque pour un trade */
export interface RiskParameters {
  accountBalance: number
  riskPercent: number
  entryPrice: number
  stopLoss: number
  lotSize: number
  riskAmount: number
  maxLossDay: number
  remainingRiskDay: number
}

/** État global d'une session active */
export interface ActiveSessionState {
  sessionId: string
  startedAt: Date
  tradesCount: number
  consecutiveLosses: number
  pnl: number
  cooldownActive: boolean
  cooldownEndsAt: Date | null
  canOpenTrade: boolean
  blockReason: string | null
}
