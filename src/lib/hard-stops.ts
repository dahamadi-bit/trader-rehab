import { SupabaseClient } from '@supabase/supabase-js';

interface HardStopsResult {
  canTrade: boolean;
  reason?: string;
  dailyPnl: number;
  weeklyPnl: number;
  dailyRemaining: number;
  weeklyRemaining: number;
  accountBalance: number;
}

/**
 * Check if trading should be blocked due to hard stop limits
 * − 1% daily loss → platform closed 24h
 * + 2% daily profit → profit target hit, comeback tomorrow
 * − 2.5% weekly loss → comeback Monday
 */
export async function checkHardStops(
  supabase: SupabaseClient,
  accountId: string,
  tradingDate: string
): Promise<HardStopsResult> {
  try {
    // Get account balance
    const { data: accountData, error: accountError } = await supabase
      .from('accounts')
      .select('account_balance')
      .eq('id', accountId)
      .single();

    if (accountError || !accountData) {
      throw new Error('Failed to fetch account balance');
    }

    const accountBalance = accountData.account_balance || 50000;
    const dailyLimitNegative = accountBalance * -0.01;
    const dailyLimitPositive = accountBalance * 0.02;
    const weeklyLimitNegative = accountBalance * -0.025;

    // Get today's closed trades PnL
    const startOfDay = new Date(tradingDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(tradingDate);
    endOfDay.setHours(23, 59, 59, 999);

    const { data: todayTrades, error: todayError } = await supabase
      .from('trades')
      .select('pnl')
      .eq('account_id', accountId)
      .gte('exit_time', startOfDay.toISOString())
      .lte('exit_time', endOfDay.toISOString())
      .in('result', ['win', 'loss']);

    const todayPnl = (todayTrades || []).reduce((sum, t) => sum + (t.pnl || 0), 0);
    const dailyRemaining = Math.max(0, dailyLimitPositive - todayPnl);

    // Get this week's closed trades PnL (Monday to Sunday)
    const now = new Date(tradingDate);
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const startOfWeek = new Date(now.setDate(diff));
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const { data: weekTrades, error: weekError } = await supabase
      .from('trades')
      .select('pnl')
      .eq('account_id', accountId)
      .gte('exit_time', startOfWeek.toISOString())
      .lte('exit_time', endOfWeek.toISOString())
      .in('result', ['win', 'loss']);

    const weeklyPnl = (weekTrades || []).reduce((sum, t) => sum + (t.pnl || 0), 0);
    const weeklyRemaining = Math.abs(Math.max(0, weeklyLimitNegative - weeklyPnl));

    // Check hard stop conditions
    if (todayPnl <= dailyLimitNegative) {
      return {
        canTrade: false,
        reason: `−1% daily stop hit (−${Math.abs(dailyLimitNegative).toFixed(0)} $). Platform closed 24h.`,
        dailyPnl: todayPnl,
        weeklyPnl: weeklyPnl,
        dailyRemaining: 0,
        weeklyRemaining,
        accountBalance,
      };
    }

    if (todayPnl >= dailyLimitPositive) {
      return {
        canTrade: false,
        reason: `+2% daily profit target hit (+${dailyLimitPositive.toFixed(0)} $). Well done! Return tomorrow.`,
        dailyPnl: todayPnl,
        weeklyPnl: weeklyPnl,
        dailyRemaining: 0,
        weeklyRemaining,
        accountBalance,
      };
    }

    if (weeklyPnl <= weeklyLimitNegative) {
      return {
        canTrade: false,
        reason: `−2.5% weekly limit reached (${weeklyLimitNegative.toFixed(0)} $). Comeback Monday.`,
        dailyPnl: todayPnl,
        weeklyPnl: weeklyPnl,
        dailyRemaining,
        weeklyRemaining: 0,
        accountBalance,
      };
    }

    return {
      canTrade: true,
      dailyPnl: todayPnl,
      weeklyPnl: weeklyPnl,
      dailyRemaining,
      weeklyRemaining,
      accountBalance,
    };
  } catch (error) {
    console.error('Error checking hard stops:', error);
    return {
      canTrade: true,
      dailyPnl: 0,
      weeklyPnl: 0,
      dailyRemaining: 0,
      weeklyRemaining: 0,
      accountBalance: 0,
    };
  }
}

/**
 * Format hard stop banner text for display
 */
export function formatHardStopBanner(
  dailyPnl: number,
  dailyRemaining: number,
  accountBalance: number
): string {
  const dailyLimit = accountBalance * -0.01;
  const percentRemaining = ((dailyRemaining / Math.abs(dailyLimit)) * 100).toFixed(0);

  return `Daily P&L: ${dailyPnl >= 0 ? '+' : ''}${dailyPnl.toFixed(0)} $ | −1% limit: ${dailyRemaining.toFixed(0)} $ remaining (${percentRemaining}%)`;
}
