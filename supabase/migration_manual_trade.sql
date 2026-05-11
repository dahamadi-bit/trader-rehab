-- Migration : trade manuel avec horaires + session rétroactive
-- À exécuter dans Supabase → SQL Editor

-- 1. Colonnes horaires sur trades
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS entry_time  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exit_time   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS account_id  UUID REFERENCES accounts(id) ON DELETE SET NULL;

-- 2. Flag session rétroactive
ALTER TABLE trading_sessions
  ADD COLUMN IF NOT EXISTS is_retroactive BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS account_id     UUID REFERENCES accounts(id) ON DELETE SET NULL;

-- Index utiles
CREATE INDEX IF NOT EXISTS idx_trades_account_id   ON trades(account_id);
CREATE INDEX IF NOT EXISTS idx_sessions_account_id ON trading_sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_sessions_retroactive ON trading_sessions(is_retroactive) WHERE is_retroactive = true;
