-- ============================================================
-- TRADER REHAB — Schéma Supabase
-- ============================================================
-- Toutes les tables ont RLS activé.
-- Chaque utilisateur ne voit que ses propres données.
-- ============================================================

-- Extensions nécessaires
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLE : profiles
-- Profil utilisateur étendu (lié à auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),

  -- Informations personnelles
  display_name          TEXT,
  timezone              TEXT DEFAULT 'UTC',

  -- Configuration challenge / prop firm
  challenge_type        TEXT CHECK (challenge_type IN ('prop_firm', 'personal', 'simulation')) DEFAULT 'simulation',
  account_balance       NUMERIC(12,2) DEFAULT 10000,
  drawdown_floor        NUMERIC(12,2) DEFAULT 9000,   -- Plancher absolu
  max_risk_per_trade    NUMERIC(5,4) DEFAULT 0.005,    -- 0.5%
  max_risk_per_day      NUMERIC(5,4) DEFAULT 0.01,     -- 1.0%
  min_rr_ratio          NUMERIC(4,2) DEFAULT 1.5,

  -- État du compte
  discipline_score      INTEGER DEFAULT 50 CHECK (discipline_score BETWEEN 0 AND 100),
  consecutive_clean_days INTEGER DEFAULT 0,
  total_violations      INTEGER DEFAULT 0,

  -- Mode rechute
  relapse_mode          TEXT CHECK (relapse_mode IN ('none', 'warning', 'suspended_24h', 'suspended_7d', 'sim_only')) DEFAULT 'none',
  relapse_until         TIMESTAMPTZ,

  -- Capital personnel verrouillé
  personal_capital_unlocked BOOLEAN DEFAULT FALSE,
  journal_days_completed    INTEGER DEFAULT 0,
  prop_firm_validated       BOOLEAN DEFAULT FALSE,
  days_without_discomfort   INTEGER DEFAULT 0
);

-- ============================================================
-- TABLE : daily_checkins
-- Bilan émotionnel quotidien — obligatoire avant session
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_checkins (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  checkin_date    DATE NOT NULL DEFAULT CURRENT_DATE,

  -- État émotionnel (0-10)
  fatigue         INTEGER NOT NULL CHECK (fatigue BETWEEN 0 AND 10),
  stress          INTEGER NOT NULL CHECK (stress BETWEEN 0 AND 10),
  euphoria        INTEGER NOT NULL CHECK (euphoria BETWEEN 0 AND 10),
  frustration     INTEGER NOT NULL CHECK (frustration BETWEEN 0 AND 10),
  motivation      INTEGER NOT NULL CHECK (motivation BETWEEN 0 AND 10),

  -- Qualité de vie
  sleep_quality   INTEGER NOT NULL CHECK (sleep_quality BETWEEN 0 AND 10),
  sleep_hours     NUMERIC(3,1),
  exercise_done   BOOLEAN DEFAULT FALSE,
  meditation_done BOOLEAN DEFAULT FALSE,

  -- État résultant calculé
  session_blocked BOOLEAN GENERATED ALWAYS AS (
    fatigue >= 7 OR stress >= 7 OR euphoria >= 7
  ) STORED,
  block_reason    TEXT,   -- 'fatigue' | 'stress' | 'euphoria' | null

  notes           TEXT,

  UNIQUE(user_id, checkin_date)
);

-- ============================================================
-- TABLE : trading_sessions
-- Chaque session de trading encadrée
-- ============================================================
CREATE TABLE IF NOT EXISTS trading_sessions (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  started_at        TIMESTAMPTZ DEFAULT NOW(),
  ended_at          TIMESTAMPTZ,

  -- Type de session
  session_type      TEXT CHECK (session_type IN ('real', 'prop_firm', 'simulation')) DEFAULT 'simulation',

  -- État
  status            TEXT CHECK (status IN ('active', 'completed', 'force_closed', 'blocked')) DEFAULT 'active',
  close_reason      TEXT,  -- 'max_losses' | 'revenge_detected' | 'manual' | 'timeout'

  -- Métriques session
  trades_count      INTEGER DEFAULT 0,
  wins_count        INTEGER DEFAULT 0,
  losses_count      INTEGER DEFAULT 0,
  consecutive_losses INTEGER DEFAULT 0,
  pnl_session       NUMERIC(12,2) DEFAULT 0,

  -- Timer
  duration_minutes  INTEGER,

  -- État émotionnel à l'ouverture
  checkin_id        UUID REFERENCES daily_checkins(id),
  emotional_state_open TEXT,   -- snapshot JSON des émotions

  notes             TEXT
);

-- ============================================================
-- TABLE : trades
-- Chaque trade individuel — journal complet
-- ============================================================
CREATE TABLE IF NOT EXISTS trades (
  id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id          UUID REFERENCES trading_sessions(id),
  playbook_setup_id   UUID,  -- FK ajoutée après table playbook_setups
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),

  -- Instrument
  symbol              TEXT NOT NULL,
  direction           TEXT CHECK (direction IN ('long', 'short')),
  session_type        TEXT CHECK (session_type IN ('real', 'prop_firm', 'simulation')) DEFAULT 'simulation',

  -- Plan AVANT
  market_context      TEXT,          -- Contexte marché
  setup_name          TEXT,          -- Nom du setup (depuis playbook)
  setup_description   TEXT,          -- Description du plan
  entry_price         NUMERIC(12,5),
  stop_loss           NUMERIC(12,5),
  take_profit_1       NUMERIC(12,5),
  take_profit_2       NUMERIC(12,5),
  risk_amount         NUMERIC(10,2),
  rr_ratio            NUMERIC(4,2),
  plan_justification  TEXT,          -- "Ce trade respecte mon plan parce que..."

  -- État émotionnel AVANT
  emotion_before      TEXT,          -- 'calm' | 'excited' | 'fearful' | 'uncertain'
  emotion_before_note TEXT,
  confidence_level    INTEGER CHECK (confidence_level BETWEEN 1 AND 10),

  -- Screenshot avant
  screenshot_before_url TEXT,

  -- PENDANT
  plan_respected      BOOLEAN,
  stop_moved          BOOLEAN DEFAULT FALSE,
  stop_moved_reason   TEXT,
  emotion_during      TEXT,
  temptation_notes    TEXT,

  -- APRÈS — Résultat
  exit_price          NUMERIC(12,5),
  pnl                 NUMERIC(10,2),
  result              TEXT CHECK (result IN ('win', 'loss', 'breakeven', 'open')),
  exit_reason         TEXT,  -- 'tp1' | 'tp2' | 'sl' | 'manual' | 'forced'

  -- Analyse comportementale APRÈS
  main_error          TEXT,  -- 'impulse' | 'revenge' | 'overconfidence' | 'fear' | 'none'
  execution_quality   INTEGER CHECK (execution_quality BETWEEN 1 AND 10),
  behavioral_notes    TEXT,
  screenshot_after_url TEXT,

  -- Scores calculés
  discipline_score_impact INTEGER DEFAULT 0,  -- Points +/-
  revenge_flags           TEXT[],             -- Phrases détectées

  -- IA
  ai_analysis         TEXT,   -- Retour du coach IA
  ai_analyzed_at      TIMESTAMPTZ
);

-- ============================================================
-- TABLE : playbook_setups
-- Setups autorisés — l'utilisateur ne peut trader que ceux-ci
-- ============================================================
CREATE TABLE IF NOT EXISTS playbook_setups (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),

  -- Identification
  name              TEXT NOT NULL,       -- Ex: "BOS + FVG sur H1"
  pattern_type      TEXT NOT NULL,       -- Ex: "BOS", "Double Bottom", etc.
  description       TEXT,

  -- Conditions d'entrée précises
  entry_conditions  TEXT NOT NULL,
  invalidation      TEXT NOT NULL,
  target_description TEXT,

  -- Exemples
  screenshot_valid_url   TEXT,
  screenshot_invalid_url TEXT,

  -- Stats de performance sur ce setup
  trades_count      INTEGER DEFAULT 0,
  win_rate          NUMERIC(5,2) DEFAULT 0,
  avg_rr            NUMERIC(4,2) DEFAULT 0,

  is_active         BOOLEAN DEFAULT TRUE
);

-- FK trades → playbook_setups
ALTER TABLE trades
  ADD CONSTRAINT fk_trades_playbook
  FOREIGN KEY (playbook_setup_id)
  REFERENCES playbook_setups(id);

-- ============================================================
-- TABLE : weekly_reviews
-- Bilan hebdomadaire thérapeutique
-- ============================================================
CREATE TABLE IF NOT EXISTS weekly_reviews (
  id                        UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id                   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  week_start                DATE NOT NULL,
  week_end                  DATE NOT NULL,

  -- Questions thérapeutiques (score 0-10)
  plan_respect_score        INTEGER CHECK (plan_respect_score BETWEEN 0 AND 10),
  dominant_emotion          TEXT,
  main_errors               TEXT,
  triggers                  TEXT,
  discipline_quality        INTEGER CHECK (discipline_quality BETWEEN 0 AND 10),
  revenge_trading_urge      INTEGER CHECK (revenge_trading_urge BETWEEN 0 AND 10),
  market_avoidance_difficulty INTEGER CHECK (market_avoidance_difficulty BETWEEN 0 AND 10),

  -- Vie quotidienne
  sleep_avg                 NUMERIC(3,1),
  exercise_days             INTEGER,
  meditation_days           INTEGER,
  other_activities          TEXT,

  -- Rapport généré
  discipline_score_week     INTEGER,
  emotional_score_week      INTEGER,
  recommendations           TEXT,   -- JSON array de recommandations
  ai_report                 TEXT,   -- Rapport IA complet
  pdf_url                   TEXT,   -- URL du PDF exporté

  UNIQUE(user_id, week_start)
);

-- ============================================================
-- TABLE : behavioral_events
-- Log de tous les événements comportementaux
-- ============================================================
CREATE TABLE IF NOT EXISTS behavioral_events (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),

  event_type  TEXT NOT NULL,
  -- Types possibles :
  -- 'session_blocked_emotional'
  -- 'revenge_detected'
  -- 'session_force_closed'
  -- 'max_losses_reached'
  -- 'cooldown_bypassed'
  -- 'compulsive_usage_detected'
  -- 'emergency_button_pressed'
  -- 'relapse_mode_activated'
  -- 'discipline_score_drop'

  severity    TEXT CHECK (severity IN ('info', 'warning', 'critical')) DEFAULT 'info',
  description TEXT,
  metadata    JSONB,   -- Données contextuelles (phrases détectées, etc.)
  session_id  UUID REFERENCES trading_sessions(id)
);

-- ============================================================
-- TABLE : routine_logs
-- Suivi des routines quotidiennes
-- ============================================================
CREATE TABLE IF NOT EXISTS routine_logs (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  log_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),

  -- Activités (boolean)
  morning_review  BOOLEAN DEFAULT FALSE,
  exercise        BOOLEAN DEFAULT FALSE,
  meditation      BOOLEAN DEFAULT FALSE,
  reading         BOOLEAN DEFAULT FALSE,
  music_practice  BOOLEAN DEFAULT FALSE,
  evening_review  BOOLEAN DEFAULT FALSE,

  -- Durées (minutes)
  sleep_hours         NUMERIC(3,1),
  exercise_minutes    INTEGER,
  meditation_minutes  INTEGER,

  notes         TEXT,
  discipline_contribution INTEGER DEFAULT 0,  -- Impact sur score

  UNIQUE(user_id, log_date)
);

-- ============================================================
-- TABLE : capital_unlock_progress
-- Progression vers déverrouillage capital personnel
-- ============================================================
CREATE TABLE IF NOT EXISTS capital_unlock_progress (
  id                      UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id                 UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  updated_at              TIMESTAMPTZ DEFAULT NOW(),

  -- Conditions
  journal_days_required   INTEGER DEFAULT 30,
  journal_days_done       INTEGER DEFAULT 0,

  prop_firm_required      BOOLEAN DEFAULT TRUE,
  prop_firm_done          BOOLEAN DEFAULT FALSE,

  clean_days_required     INTEGER DEFAULT 7,
  clean_days_done         INTEGER DEFAULT 0,

  min_discipline_score    INTEGER DEFAULT 70,
  current_discipline_score INTEGER DEFAULT 0,

  -- Résultat
  is_unlocked             BOOLEAN DEFAULT FALSE,
  unlocked_at             TIMESTAMPTZ,

  UNIQUE(user_id)
);

-- ============================================================
-- ROW LEVEL SECURITY — Toutes les tables
-- ============================================================

ALTER TABLE profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_checkins         ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE playbook_setups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_reviews         ENABLE ROW LEVEL SECURITY;
ALTER TABLE behavioral_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE routine_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE capital_unlock_progress ENABLE ROW LEVEL SECURITY;

-- Politique générique : utilisateur voit uniquement ses données
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','daily_checkins','trading_sessions','trades',
    'playbook_setups','weekly_reviews','behavioral_events',
    'routine_logs','capital_unlock_progress'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY "Users see own data" ON %I
       FOR ALL TO authenticated
       USING (user_id = auth.uid())
       WITH CHECK (user_id = auth.uid());',
      t
    );
  END LOOP;
END $$;

-- Exception : profiles — la colonne id = user_id
DROP POLICY IF EXISTS "Users see own data" ON profiles;
CREATE POLICY "Users see own profile" ON profiles
  FOR ALL TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ============================================================
-- TRIGGERS — Automatisations
-- ============================================================

-- Créer un profil automatiquement après inscription
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));

  INSERT INTO capital_unlock_progress (user_id)
  VALUES (NEW.id);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trades_updated_at
  BEFORE UPDATE ON trades
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER playbook_updated_at
  BEFORE UPDATE ON playbook_setups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- INDEX — Performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_daily_checkins_user_date    ON daily_checkins(user_id, checkin_date DESC);
CREATE INDEX IF NOT EXISTS idx_trades_user_created         ON trades(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_session              ON trades(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_status        ON trading_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_behavioral_events_user      ON behavioral_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_routine_logs_user_date      ON routine_logs(user_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_reviews_user_week    ON weekly_reviews(user_id, week_start DESC);
