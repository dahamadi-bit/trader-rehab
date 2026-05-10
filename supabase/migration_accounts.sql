-- ============================================================
-- MIGRATION : Table accounts (multi-comptes)
-- À exécuter dans Supabase SQL Editor
-- ============================================================

-- Table accounts
CREATE TABLE IF NOT EXISTS accounts (
  id                      UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id                 UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),

  -- Identification
  name                    TEXT NOT NULL,
  broker                  TEXT,
  account_type            TEXT CHECK (account_type IN ('prop_firm', 'personal', 'simulation')) NOT NULL DEFAULT 'simulation',

  -- Capital
  account_balance         NUMERIC(12,2) NOT NULL DEFAULT 10000,
  starting_balance        NUMERIC(12,2) NOT NULL DEFAULT 10000,
  drawdown_floor          NUMERIC(12,2),

  -- Règles de risque propres au compte
  max_risk_per_trade      NUMERIC(5,4) NOT NULL DEFAULT 0.005,
  max_risk_per_day        NUMERIC(5,4) NOT NULL DEFAULT 0.01,
  min_rr_ratio            NUMERIC(4,2) NOT NULL DEFAULT 1.5,
  max_trades_per_session  INTEGER NOT NULL DEFAULT 2,
  max_consecutive_losses  INTEGER NOT NULL DEFAULT 2,

  -- État
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  is_default              BOOLEAN NOT NULL DEFAULT FALSE,

  notes                   TEXT
);

-- Colonne account_id dans trading_sessions (optionnelle pour compatibilité)
ALTER TABLE trading_sessions
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

-- Colonne account_id dans trades (optionnelle pour compatibilité)
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

-- RLS
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own accounts" ON accounts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Trigger updated_at
CREATE TRIGGER accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Index
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
