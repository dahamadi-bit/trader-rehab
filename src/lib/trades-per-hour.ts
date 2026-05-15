import { SupabaseClient } from '@supabase/supabase-js';

interface TradesPerHourResult {
  tradesInLastHour: number;
  detected: boolean;
  message?: string;
  pauseUntil?: Date;
}

/**
 * Detect if 3+ trades were closed in the last hour
 * If yes, enforce 30-minute mandatory pause
 * Called after trade close
 */
export async function detectTradesPerHour(
  supabase: SupabaseClient,
  sessionId: string
): Promise<TradesPerHourResult> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const { data: trades, error } = await supabase
      .from('trades')
      .select('id, exit_time')
      .eq('session_id', sessionId)
      .gte('exit_time', oneHourAgo.toISOString())
      .in('result', ['win', 'loss', 'breakeven']);

    if (error || !trades) {
      return {
        tradesInLastHour: 0,
        detected: false,
      };
    }

    const count = trades.length;

    if (count >= 3) {
      const pauseUntil = new Date(Date.now() + 30 * 60 * 1000);
      return {
        tradesInLastHour: count,
        detected: true,
        message: `⚠️ ${count} trades in 60 minutes detected. 30 min MANDATORY PAUSE activated.`,
        pauseUntil,
      };
    }

    return {
      tradesInLastHour: count,
      detected: false,
    };
  } catch (error) {
    console.error('Error detecting trades per hour:', error);
    return {
      tradesInLastHour: 0,
      detected: false,
    };
  }
}

/**
 * Check if user is still in mandatory pause period
 */
export function isInMandatoryPause(pauseUntil: Date | null): boolean {
  if (!pauseUntil) return false;
  return Date.now() < pauseUntil.getTime();
}

/**
 * Get remaining pause time in seconds
 */
export function getRemainingPauseTime(pauseUntil: Date | null): number {
  if (!pauseUntil) return 0;
  const remaining = pauseUntil.getTime() - Date.now();
  return Math.max(0, Math.ceil(remaining / 1000));
}

/**
 * Format pause timer for display (MM:SS)
 */
export function formatPauseTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Get trades count in last N minutes
 */
export async function getTradesInLastNMinutes(
  supabase: SupabaseClient,
  sessionId: string,
  minutes: number = 60
): Promise<number> {
  try {
    const timeAgo = new Date(Date.now() - minutes * 60 * 1000);

    const { data: trades, error } = await supabase
      .from('trades')
      .select('id', { count: 'exact' })
      .eq('session_id', sessionId)
      .gte('exit_time', timeAgo.toISOString())
      .in('result', ['win', 'loss', 'breakeven']);

    if (error || !trades) {
      return 0;
    }

    return trades.length;
  } catch (error) {
    console.error('Error getting trades in last N minutes:', error);
    return 0;
  }
}
