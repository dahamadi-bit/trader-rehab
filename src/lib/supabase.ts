/**
 * Client Supabase — TraderRehab
 * Deux clients distincts :
 *   - browser  : pour les composants client (RLS actif)
 *   - server   : pour les API routes (service role, RLS bypassé)
 */

import { createBrowserClient, createServerClient } from '@supabase/ssr'
import type { CookieOptions } from '@supabase/ssr'

// ——— Variables d'environnement ———
const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// ——— Client Browser (composants client) ———
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY)
}

// ——— Client Server (API routes, Server Components) ———
// Utilisation : importer dans les route handlers avec les cookies de la requête
export function createServerSupabaseClient(
  cookies: {
    get(name: string): { value: string } | undefined
    set(name: string, value: string, options: CookieOptions): void
    delete(name: string, options: CookieOptions): void
  }
) {
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      get(name: string) {
        return cookies.get(name)?.value
      },
      set(name: string, value: string, options: CookieOptions) {
        cookies.set(name, value, options)
      },
      remove(name: string, options: CookieOptions) {
        cookies.delete(name, options)
      },
    },
  })
}

// ——— Helpers ———

/** Récupère le profil de l'utilisateur connecté */
export async function getCurrentProfile() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return data
}

/** Récupère le check-in d'aujourd'hui (s'il existe) */
export async function getTodayCheckIn() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const today = new Date().toISOString().split('T')[0]

  const { data } = await supabase
    .from('daily_checkins')
    .select('*')
    .eq('user_id', user.id)
    .eq('checkin_date', today)
    .maybeSingle()

  return data
}

/** Récupère la session active (s'il en existe une) */
export async function getActiveSession() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('trading_sessions')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data
}

/**
 * Recalcule et sauvegarde le score de discipline + métriques du profil.
 * À appeler après : fermeture de session, soumission d'un trade, check-in.
 */
export async function refreshDisciplineScore(): Promise<number> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0]

  const [{ data: trades }, { data: checkins }, { data: routines }, { data: events }] = await Promise.all([
    supabase.from('trades').select('*').eq('user_id', user.id).gte('created_at', thirtyDaysAgo.toISOString()),
    supabase.from('daily_checkins').select('checkin_date').eq('user_id', user.id).gte('checkin_date', thirtyDaysAgoStr),
    supabase.from('routine_logs').select('*').eq('user_id', user.id).gte('log_date', thirtyDaysAgoStr),
    supabase.from('behavioral_events').select('event_type, created_at').eq('user_id', user.id).gte('created_at', thirtyDaysAgo.toISOString()),
  ])

  // Violations
  const revengeDetections  = events?.filter(e => e.event_type === 'revenge_detected').length ?? 0
  const forcedCloses       = events?.filter(e => e.event_type === 'session_force_closed').length ?? 0
  const planViolations     = trades?.filter(t => t.plan_respected === false).length ?? 0
  const stopMovements      = trades?.filter(t => t.stop_moved === true).length ?? 0

  const { calculateDisciplineScore } = await import('./discipline-score')
  const breakdown = calculateDisciplineScore({
    trades: trades ?? [],
    journalDaysLast30:  checkins?.length ?? 0,
    checkinDaysLast30:  checkins?.length ?? 0,
    routineLogs: routines ?? [],
    violations: {
      revengeDetections,
      forcedSessionCloses: forcedCloses,
      planViolations,
      stopMovements,
    },
  })

  // Jours propres consécutifs (check-in fait, aucune violation ce jour-là)
  const checkinDates = new Set(checkins?.map(c => c.checkin_date) ?? [])
  const violationDates = new Set(
    events?.filter(e => ['revenge_detected','session_force_closed','max_losses_reached'].includes(e.event_type))
           .map(e => e.created_at.split('T')[0]) ?? []
  )
  let consecutiveClean = 0
  for (let i = 0; i < 30; i++) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const ds = d.toISOString().split('T')[0]
    if (!checkinDates.has(ds) || violationDates.has(ds)) break
    consecutiveClean++
  }

  // Jours de journal complétés (jours avec au moins 1 trade logged)
  const journalDays = new Set(trades?.map(t => t.created_at.split('T')[0]) ?? []).size

  await supabase.from('profiles').update({
    discipline_score:        Math.max(0, Math.min(100, breakdown.total)),
    consecutive_clean_days:  consecutiveClean,
    journal_days_completed:  journalDays,
    total_violations:        revengeDetections + forcedCloses + planViolations + stopMovements,
  }).eq('id', user.id)

  return breakdown.total
}

/** Log un événement comportemental */
export async function logBehavioralEvent(
  eventType: import('@/types').BehavioralEventType,
  severity: 'info' | 'warning' | 'critical',
  description: string,
  metadata?: Record<string, unknown>,
  sessionId?: string
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from('behavioral_events').insert({
    user_id: user.id,
    event_type: eventType,
    severity,
    description,
    metadata: metadata || null,
    session_id: sessionId || null,
  })
}
