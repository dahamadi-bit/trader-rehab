import { SupabaseClient } from '@supabase/supabase-js';

interface TwoLossBlockerResult {
  blocked: boolean;
  lastTwoResults: ('win' | 'loss' | 'breakeven')[];
  message?: string;
}

/**
 * Check if session should be blocked due to 2 consecutive losses
 * Blocks the 3rd trade attempt after 2 consecutive losses
 */
export async function checkTwoConsecutiveLosses(
  supabase: SupabaseClient,
  sessionId: string
): Promise<TwoLossBlockerResult> {
  try {
    const { data: trades, error } = await supabase
      .from('trades')
      .select('result')
      .eq('session_id', sessionId)
      .in('result', ['win', 'loss', 'breakeven'])
      .order('exit_time', { ascending: false })
      .limit(2);

    if (error || !trades) {
      return {
        blocked: false,
        lastTwoResults: [],
      };
    }

    const results = trades.map(t => t.result as 'win' | 'loss' | 'breakeven');

    // Check if last 2 trades are both losses
    if (results.length === 2 && results[0] === 'loss' && results[1] === 'loss') {
      return {
        blocked: true,
        lastTwoResults: results,
        message: '2 consecutive losses detected. Session ended for today. Return tomorrow.',
      };
    }

    return {
      blocked: false,
      lastTwoResults: results,
    };
  } catch (error) {
    console.error('Error checking two consecutive losses:', error);
    return {
      blocked: false,
      lastTwoResults: [],
    };
  }
}

/**
 * Get the last N trade results for a session
 */
export async function getRecentTradeResults(
  supabase: SupabaseClient,
  sessionId: string,
  limit: number = 5
): Promise<('win' | 'loss' | 'breakeven')[]> {
  try {
    const { data: trades, error } = await supabase
      .from('trades')
      .select('result')
      .eq('session_id', sessionId)
      .in('result', ['win', 'loss', 'breakeven'])
      .order('exit_time', { ascending: false })
      .limit(limit);

    if (error || !trades) {
      return [];
    }

    return trades.map(t => t.result as 'win' | 'loss' | 'breakeven');
  } catch (error) {
    console.error('Error getting recent trade results:', error);
    return [];
  }
}
