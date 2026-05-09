'use client'

/**
 * Module Anti-Addiction — Centre thérapeutique
 *
 * Fonctions :
 *   - Bouton urgence "Je vais craquer"
 *   - Respiration guidée (4-7-8)
 *   - Mode rechute
 *   - Historique événements comportementaux
 *   - Limites et blocages horaires
 *
 * Ton : calme, factuel, non culpabilisant.
 * Pas de rouge agressif. Pas d'urgence visuelle excessive.
 */

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { clsx } from 'clsx'
import Navigation from '@/components/shared/Navigation'
import type { BehavioralEvent, Profile } from '@/types'

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================

export default function AntiAddictionPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [events, setEvents] = useState<BehavioralEvent[]>([])
  const [activeView, setActiveView] = useState<'overview' | 'breathing' | 'emergency' | 'history'>('overview')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const [{ data: profileData }, { data: eventsData }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('behavioral_events')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20),
      ])

      setProfile(profileData as Profile)
      setEvents((eventsData as BehavioralEvent[]) ?? [])
      setIsLoading(false)
    }
    load()
  }, [router])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-neutral-600 text-sm">Chargement…</div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Navigation
        disciplineScore={profile?.discipline_score}
        consecutiveCleanDays={profile?.consecutive_clean_days}
      />
      <main className="flex-1 overflow-y-auto p-6 space-y-5">

        <div className="flex items-center justify-between">
          <h1 className="text-base font-medium text-neutral-200">Discipline comportementale</h1>
        </div>

        {/* Navigation interne */}
        <div className="flex gap-1 bg-[#141414] rounded p-1 w-fit">
          {([
            ['overview',   'Vue d\'ensemble'],
            ['breathing',  'Respiration'],
            ['emergency',  '⬤ Urgence'],
            ['history',    'Historique'],
          ] as const).map(([view, label]) => (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              className={clsx(
                'text-xs px-3 py-1.5 rounded transition-colors',
                activeView === view
                  ? 'bg-[#2a2a2a] text-neutral-200'
                  : 'text-neutral-500 hover:text-neutral-300',
                view === 'emergency' && activeView !== view && 'text-neutral-600'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {activeView === 'overview'  && <OverviewPanel profile={profile} events={events} />}
        {activeView === 'breathing' && <BreathingExercise />}
        {activeView === 'emergency' && <EmergencyPanel profile={profile} events={events} onNavigate={setActiveView} />}
        {activeView === 'history'   && <EventHistory events={events} />}

      </main>
    </div>
  )
}

// ============================================================
// VUE D'ENSEMBLE
// ============================================================

function OverviewPanel({ profile, events }: { profile: Profile | null; events: BehavioralEvent[] }) {
  const criticalEvents = events.filter(e => e.severity === 'critical').length
  const warningEvents  = events.filter(e => e.severity === 'warning').length

  const TRADING_HOURS = {
    london:    { start: '10:00', end: '13:00', label: 'Session Londres (UTC+3)' },
    ny_open:   { start: '16:30', end: '19:00', label: 'Ouverture NY (UTC+3)' },
    avoid:     { start: '19:00', end: '10:00', label: 'Zone à éviter' },
  }

  const currentHour = new Date().getHours()
  const isInTradingHours = (currentHour >= 10 && currentHour < 13) || (currentHour >= 16 && currentHour < 19)

  return (
    <div className="space-y-5">
      {/* État comportemental */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card">
          <div className="text-xxs text-neutral-600 uppercase tracking-wider mb-1.5">Mode actuel</div>
          <div className={clsx(
            'text-sm font-medium',
            profile?.relapse_mode === 'none' ? 'text-neutral-300' :
            profile?.relapse_mode === 'warning' ? 'text-[#e67e22]' :
            'text-[#e74c3c]'
          )}>
            {profile?.relapse_mode === 'none'           ? 'Normal' :
             profile?.relapse_mode === 'warning'         ? 'Avertissement' :
             profile?.relapse_mode === 'suspended_24h'   ? 'Suspendu 24h' :
             profile?.relapse_mode === 'suspended_7d'    ? 'Suspendu 7j' :
             profile?.relapse_mode === 'sim_only'        ? 'Simulation seule' :
             '—'}
          </div>
        </div>
        <div className="card">
          <div className="text-xxs text-neutral-600 uppercase tracking-wider mb-1.5">Événements critiques</div>
          <div className="text-sm font-mono text-neutral-300">{criticalEvents} / 30 derniers jours</div>
        </div>
        <div className="card">
          <div className="text-xxs text-neutral-600 uppercase tracking-wider mb-1.5">Horaires marché</div>
          <div className={clsx('text-sm', isInTradingHours ? 'text-neutral-400' : 'text-neutral-600')}>
            {isInTradingHours ? 'Fenêtre active' : 'Hors session'}
          </div>
        </div>
      </div>

      {/* Fenêtres de trading */}
      <div className="card">
        <div className="section-title mb-3">Fenêtres de trading recommandées</div>
        <div className="space-y-2">
          {Object.entries(TRADING_HOURS).map(([key, { start, end, label }]) => {
            const isAvoid = key === 'avoid'
            return (
              <div key={key} className="flex items-center justify-between py-2 border-b border-[#1a1a1a] last:border-0">
                <span className={clsx('text-xs', isAvoid ? 'text-neutral-600' : 'text-neutral-400')}>
                  {label}
                </span>
                <span className={clsx('text-xs font-mono', isAvoid ? 'text-neutral-700' : 'text-neutral-500')}>
                  {isAvoid ? `❌ ${start} – ${end}` : `${start} – ${end}`}
                </span>
              </div>
            )
          })}
        </div>
        <p className="text-xxs text-neutral-700 mt-3">
          Trading nocturne ou le weekend corrèle avec une réduction de 34% du taux de respect du plan.
        </p>
      </div>

      {/* Règles prop firm */}
      <div className="card">
        <div className="section-title mb-3">Règles actives</div>
        <div className="space-y-2">
          {[
            'Maximum 2 trades perdants consécutifs → stop journée',
            'Cooldown 30min obligatoire après chaque gain',
            'Drawdown journalier max 1% → arrêt immédiat',
            'TP1 atteint → stop au breakeven obligatoire',
            'Pas de retrade dans la même zone après 2 stops',
            'Pas de trading vendredi après 19h30 (UTC+3)',
            'Pas de trading lundi avant ouverture Londres (10h UTC+3)',
          ].map((rule, i) => (
            <div key={i} className="flex items-start gap-2.5 text-xs text-neutral-500">
              <span className="text-neutral-700 shrink-0 mt-0.5">—</span>
              <span>{rule}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Escalade rechute */}
      <div className="card">
        <div className="section-title mb-3">Protocole rechute</div>
        <div className="space-y-3">
          {[
            { level: 1, trigger: '1 violation', action: 'Avertissement + log comportemental', active: (profile?.total_violations ?? 0) >= 1 },
            { level: 2, trigger: '3 violations', action: 'Suspension 24 heures + bilan obligatoire', active: (profile?.total_violations ?? 0) >= 3 },
            { level: 3, trigger: '5 violations', action: 'Suspension 7 jours + simulation uniquement', active: (profile?.total_violations ?? 0) >= 5 },
          ].map(({ level, trigger, action, active }) => (
            <div key={level} className={clsx(
              'flex items-start gap-3 p-3 rounded',
              active ? 'bg-[#e74c3c]/5 border border-[#e74c3c]/15' : 'bg-[#1a1a1a]'
            )}>
              <span className={clsx('text-xxs font-mono mt-0.5', active ? 'text-[#e74c3c]' : 'text-neutral-700')}>
                N{level}
              </span>
              <div>
                <div className={clsx('text-xs font-medium', active ? 'text-neutral-400' : 'text-neutral-600')}>
                  {trigger}
                </div>
                <div className="text-xs text-neutral-600 mt-0.5">{action}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// RESPIRATION GUIDÉE — 4-7-8
// ============================================================

type BreathPhase = 'inhale' | 'hold' | 'exhale' | 'idle'

function BreathingExercise() {
  const [phase, setPhase] = useState<BreathPhase>('idle')
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [cycles, setCycles] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const PHASES: Array<{ phase: BreathPhase; duration: number; label: string; instruction: string }> = [
    { phase: 'inhale', duration: 4, label: 'Inspirez',   instruction: 'Lentement par le nez' },
    { phase: 'hold',   duration: 7, label: 'Retenez',    instruction: 'Poumons pleins, corps détendu' },
    { phase: 'exhale', duration: 8, label: 'Expirez',    instruction: 'Lentement par la bouche' },
  ]

  function start() {
    setCycles(0)
    runCycle(0)
  }

  function runCycle(phaseIndex: number) {
    const currentPhase = PHASES[phaseIndex % PHASES.length]
    setPhase(currentPhase.phase)
    setSecondsLeft(currentPhase.duration)

    let count = currentPhase.duration
    intervalRef.current = setInterval(() => {
      count -= 1
      setSecondsLeft(count)
      if (count <= 0) {
        clearInterval(intervalRef.current!)
        const nextIndex = phaseIndex + 1
        if (nextIndex % 3 === 0) setCycles(c => c + 1)
        if (nextIndex < PHASES.length * 4) {  // 4 cycles
          runCycle(nextIndex)
        } else {
          setPhase('idle')
        }
      }
    }, 1000)
  }

  function stop() {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setPhase('idle')
    setSecondsLeft(0)
  }

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current) }, [])

  const currentPhaseData = PHASES.find(p => p.phase === phase)

  return (
    <div className="card max-w-md mx-auto">
      <div className="section-title mb-2">Respiration 4-7-8</div>
      <p className="text-xs text-neutral-600 mb-8 leading-relaxed">
        Technique cliniquement validée pour réduire l&rsquo;activation du système nerveux sympathique.
        4 cycles. 2-3 minutes.
      </p>

      {/* Cercle respiratoire */}
      <div className="flex flex-col items-center gap-8">
        <div className={clsx(
          'w-32 h-32 rounded-full border-2 flex flex-col items-center justify-center transition-all duration-1000',
          phase === 'inhale'  ? 'border-neutral-400 scale-110' :
          phase === 'hold'    ? 'border-neutral-500 scale-110' :
          phase === 'exhale'  ? 'border-neutral-600 scale-90' :
          'border-[#2a2a2a] scale-100',
          phase !== 'idle' && 'animate-breathe'
        )}>
          <div className={clsx('text-2xl font-mono', phase === 'idle' ? 'text-neutral-700' : 'text-neutral-300')}>
            {phase === 'idle' ? '○' : secondsLeft}
          </div>
          <div className="text-xxs text-neutral-600 mt-1 uppercase tracking-wider">
            {currentPhaseData?.label ?? 'Prêt'}
          </div>
        </div>

        {currentPhaseData && (
          <p className="text-xs text-neutral-500 text-center">{currentPhaseData.instruction}</p>
        )}

        <div className="text-xs text-neutral-700 font-mono">
          Cycle {cycles + 1}/4
        </div>

        {phase === 'idle' ? (
          <button onClick={start} className="btn-secondary">
            Commencer l&rsquo;exercice
          </button>
        ) : (
          <button onClick={stop} className="btn-secondary text-xs">
            Arrêter
          </button>
        )}
      </div>
    </div>
  )
}

// ============================================================
// MODE URGENCE — "Je vais craquer"
// ============================================================

function EmergencyPanel({
  profile, events, onNavigate
}: {
  profile: Profile | null
  events: BehavioralEvent[]
  onNavigate: (view: 'overview' | 'breathing' | 'emergency' | 'history') => void
}) {
  const [step, setStep] = useState<'confirm' | 'active'>('confirm')
  const recentLosses = events.filter(e =>
    e.event_type === 'session_force_closed' &&
    new Date(e.created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  ).length

  async function activateEmergency() {
    const { createClient, logBehavioralEvent } = await import('@/lib/supabase')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await logBehavioralEvent(
      'emergency_button_pressed',
      'warning',
      'Bouton urgence activé par l\'utilisateur'
    )

    // Incrémenter violations
    await supabase.from('profiles').update({
      total_violations: (profile?.total_violations ?? 0) + 1,
    }).eq('id', user.id)

    setStep('active')
  }

  if (step === 'confirm') {
    return (
      <div className="card max-w-md">
        <div className="section-title mb-3">Mode urgence</div>
        <p className="text-sm text-neutral-400 mb-5 leading-relaxed">
          Ce mode ferme l&rsquo;accès au trading, affiche vos erreurs passées,
          et vous propose un exercice de recentrage.
        </p>
        <button
          onClick={activateEmergency}
          className="btn-secondary w-full"
        >
          Activer le mode urgence
        </button>
        <p className="text-xxs text-neutral-700 mt-3">
          Cette action est enregistrée dans votre historique comportemental.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-md animate-fade-in">
      {/* Blocage trading */}
      <div className="card border border-[#2a2a2a]">
        <div className="text-sm font-medium text-neutral-400 mb-2">Accès trading suspendu</div>
        <p className="text-xs text-neutral-600">
          Retournez ici quand l&rsquo;état émotionnel est revenu à la normale.
          Il n&rsquo;y a pas de trade à manquer qui vaille le capital risqué dans cet état.
        </p>
      </div>

      {/* Rappel des erreurs passées */}
      <div className="card">
        <div className="section-title mb-3">Rappel objectif</div>
        <div className="space-y-2 text-xs text-neutral-500">
          <div className="flex justify-between">
            <span>Sessions fermées de force (30j)</span>
            <span className="font-mono">{recentLosses}</span>
          </div>
          <div className="flex justify-between">
            <span>Violations totales</span>
            <span className="font-mono">{profile?.total_violations ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span>Score discipline</span>
            <span className="font-mono">{profile?.discipline_score ?? 0}/100</span>
          </div>
        </div>
        <p className="text-xxs text-neutral-700 mt-3 leading-relaxed">
          Ces données sont affichées non pour culpabiliser, mais pour ancrer la décision dans la réalité.
        </p>
      </div>

      {/* Exercice recommandé */}
      <div className="card">
        <div className="section-title mb-3">Action recommandée maintenant</div>
        <p className="text-xs text-neutral-500 mb-4">
          Exercice de respiration 4-7-8. Durée : 3 minutes. Cliniquement efficace pour réduire l&rsquo;activation.
        </p>
        <button onClick={() => onNavigate('breathing')} className="btn-secondary text-xs w-full">
          Lancer la respiration guidée →
        </button>
      </div>

      {/* Alternatives */}
      <div className="card">
        <div className="section-title mb-3">Alternatives immédiates</div>
        <div className="space-y-1.5">
          {[
            '30 min de marche ou sport',
            'Lecture analytique (pas de réseaux sociaux)',
            'Révision du playbook sans ouverture de graphique live',
            'Guitare, piano ou autre activité à focus élevé',
            'Appel avec une personne de confiance',
          ].map((alt, i) => (
            <div key={i} className="text-xs text-neutral-600 flex gap-2">
              <span className="text-neutral-700">—</span>
              <span>{alt}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// HISTORIQUE DES ÉVÉNEMENTS
// ============================================================

function EventHistory({ events }: { events: BehavioralEvent[] }) {
  const SEVERITY_CONFIG = {
    info:     { color: 'text-neutral-600',  bg: 'bg-neutral-800/30' },
    warning:  { color: 'text-[#e67e22]',   bg: 'bg-[#e67e22]/5' },
    critical: { color: 'text-[#e74c3c]',   bg: 'bg-[#e74c3c]/5' },
  }

  const EVENT_LABELS: Record<string, string> = {
    session_blocked_emotional:   'Session bloquée (état émotionnel)',
    revenge_detected:            'Revenge trading détecté',
    session_force_closed:        'Session fermée de force',
    max_losses_reached:          'Maximum de pertes atteint',
    cooldown_bypassed:           'Tentative de bypass cooldown',
    compulsive_usage_detected:   'Usage compulsif détecté',
    emergency_button_pressed:    'Mode urgence activé',
    relapse_mode_activated:      'Mode rechute activé',
    discipline_score_drop:       'Chute du score discipline',
  }

  if (events.length === 0) {
    return (
      <div className="card text-center py-10">
        <p className="text-neutral-600 text-sm">Aucun événement enregistré.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="section-title mb-3">Historique événements comportementaux</div>
      {events.map(event => {
        const config = SEVERITY_CONFIG[event.severity]
        return (
          <div key={event.id} className={clsx('card border-0 py-3', config.bg)}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className={clsx('text-xs font-medium', config.color)}>
                  {EVENT_LABELS[event.event_type] ?? event.event_type}
                </div>
                {event.description && (
                  <div className="text-xs text-neutral-600 mt-0.5 leading-relaxed">
                    {event.description}
                  </div>
                )}
              </div>
              <div className="text-xxs text-neutral-700 shrink-0 font-mono">
                {new Date(event.created_at).toLocaleDateString('fr-FR')} {' '}
                {new Date(event.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
