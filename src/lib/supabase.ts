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
      get(name) {
        return cookies.get(name)?.value
      },
      set(name, value, options) {
        cookies.set(name, value, options)
      },
      remove(name, options) {
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
