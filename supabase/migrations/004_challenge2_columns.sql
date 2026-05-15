-- Migration: Add Challenge 2 behavioral guardrails columns
-- Adds 15 columns for hard stops, emotion tracking, control signals, detox phases

-- === EMOTION & PLAN TRACKING (POST-TRADE) ===
ALTER TABLE trades ADD COLUMN emotion_after TEXT;
ALTER TABLE trades ADD COLUMN emotion_after_note TEXT;
ALTER TABLE trades ADD COLUMN thesis_correct TEXT CHECK (thesis_correct IN ('yes', 'partially', 'no', NULL));
ALTER TABLE trades ADD COLUMN reflection_note TEXT;
ALTER TABLE trades ADD COLUMN position_size_percent NUMERIC(5,2);
ALTER TABLE trades ADD COLUMN sizing_vs_emotion_flag BOOLEAN;

-- === BEHAVIORAL SIGNALS & CONTROL FLAGS ===
ALTER TABLE trades ADD COLUMN control_loss_detected BOOLEAN DEFAULT FALSE;
ALTER TABLE trades ADD COLUMN revenge_trade_flag BOOLEAN DEFAULT FALSE;
ALTER TABLE trades ADD COLUMN emotion_risk_flag BOOLEAN DEFAULT FALSE;
ALTER TABLE trades ADD COLUMN three_trades_one_hour BOOLEAN DEFAULT FALSE;
ALTER TABLE trades ADD COLUMN signal_count INTEGER DEFAULT 0 CHECK (signal_count >= 0 AND signal_count <= 4);

-- === DAILY LIMIT TRACKING (AT TIME OF TRADE) ===
ALTER TABLE trades ADD COLUMN daily_pnl_at_entry NUMERIC(10,2);
ALTER TABLE trades ADD COLUMN account_balance_at_entry NUMERIC(12,2);
ALTER TABLE trades ADD COLUMN pnl_hidden BOOLEAN DEFAULT FALSE;
ALTER TABLE trades ADD COLUMN hard_stop_triggered TEXT;

-- === DETOX PHASE TRACKING ===
ALTER TABLE trades ADD COLUMN detox_phase INTEGER CHECK (detox_phase >= 1 AND detox_phase <= 4 OR detox_phase IS NULL);
ALTER TABLE trades ADD COLUMN long_trades_count_week INTEGER DEFAULT 0;

-- Create daily_limits table for aggregated state
CREATE TABLE IF NOT EXISTS daily_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  trading_date DATE NOT NULL,

  pnl_total NUMERIC(10,2),
  trades_count INTEGER,
  losses_consecutive INTEGER,
  trades_in_last_hour INTEGER,

  hard_stop_active BOOLEAN DEFAULT FALSE,
  hard_stop_reason TEXT,

  detox_phase INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(account_id, trading_date)
);

-- Enable RLS on daily_limits
ALTER TABLE daily_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their daily_limits" ON daily_limits
  FOR SELECT USING (auth.uid() = (SELECT user_id FROM accounts WHERE id = account_id));

CREATE POLICY "Users can update their daily_limits" ON daily_limits
  FOR UPDATE USING (auth.uid() = (SELECT user_id FROM accounts WHERE id = account_id));

CREATE POLICY "Users can insert daily_limits" ON daily_limits
  FOR INSERT WITH CHECK (auth.uid() = (SELECT user_id FROM accounts WHERE id = account_id));

-- Create index for daily_limits query optimization
CREATE INDEX idx_daily_limits_account_date ON daily_limits(account_id, trading_date DESC);
CREATE INDEX idx_trades_session_created ON trades(session_id, created_at DESC);
