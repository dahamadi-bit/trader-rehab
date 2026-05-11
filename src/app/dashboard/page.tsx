'use client'

/**
 * Dashboard Principal — TraderRehab
 *
 * Centre de contrôle quotidien. Avant tout accès à une session,
 * l'utilisateur doit compléter le check-in émotionnel.
 *
 * Logique centrale :
 *   - Afficher l'état du jour
 *   - Évaluer si la session peut commencer
 *   - Proposer des alternatives si bloqué
 *   - Montrer les statistiques de discipline de manière sobre
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { clsx } from 'clsx'
import Navigation from '@/components/shared/Navigation'
import { evaluateEmotionalState, getDailyQuote, TRADING_ALTERNATIVES } from '@/lib/behavioral-engine'
import { refreshDisciplineScore } from '@/lib/supabase'
import type { DailyCheckIn, EmotionalAssessment, Profile } from '@/types'

// Date locale (évite le décalage UTC pour les fuseaux UTC+X)
function getLocalDateStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}


// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================

export default function DashboardPage() {
  const router = useRouter()
  const [checkin, setCheckin] = useState<DailyCheckIn | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [assessment, setAssessment] = useState<EmotionalAssessment | null>(null)
  const [showCheckinForm, setShowCheckinForm] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const quote = getDailyQuote()

  // Chargement des données
  useEffect(() => {
    async function loadData() {
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const [{ data: profileData }, { data: checkinData }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('daily_checkins')
          .select('*')
          .eq('user_id', user.id)
          .eq('checkin_date', getLocalDateStr())
          .maybeSingle()
      ])

      setProfile(profileData)
      if (checkinData) {
        setCheckin(checkinData)
        setAssessment(evaluateEmotionalState(checkinData))
      } else {
        setShowCheckinForm(true)
      }
      setIsLoading(false)
    }
    loadData()
  }, [router])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0d0d0d]">
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

      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-medium text-neutral-200">
              {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h1>
            <p className="text-xs text-neutral-600 mt-0.5">
              {profile?.challenge_type === 'prop_firm' ? 'Prop Firm' :
               profile?.challenge_type === 'real' ? 'Capital réel' : 'Simulation'}
              {' · '}
              Balance : <span className="font-mono">{profile?.account_balance?.toLocaleString('fr-FR')} $</span>
            </p>
          </div>
        </div>

        {/* Citation du jour */}
        <div className="card border-l-2 border-l-neutral-600">
          <p className="text-sm text-neutral-300 leading-relaxed italic">
            &ldquo;{quote.text}&rdquo;
          </p>
          <p className="text-xs text-neutral-600 mt-2">— {quote.author}</p>
        </div>

        {/* Check-in ou état du jour */}
        {showCheckinForm ? (
          <CheckInForm
            onComplete={(data) => {
              setCheckin(data)
              setAssessment(evaluateEmotionalState(data))
              setShowCheckinForm(false)
            }}
            userId={profile?.id ?? ''}
            existing={checkin}
          />
        ) : checkin && assessment ? (
          <EmotionalStateCard
            checkin={checkin}
            assessment={assessment}
            onEdit={() => setShowCheckinForm(true)}
          />
        ) : null}

        {/* Accès Session */}
        {assessment && (
          <SessionGate assessment={assessment} />
        )}

        {/* Statistiques */}
        {profile && (
          <DisciplineStats profile={profile} />
        )}
      </main>
    </div>
  )
}

// ============================================================
// FORMULAIRE CHECK-IN QUOTIDIEN
// ============================================================

interface CheckInFormProps {
  onComplete: (checkin: DailyCheckIn) => void
  userId: string
  existing?: DailyCheckIn | null
}

function CheckInForm({ onComplete, userId, existing }: CheckInFormProps) {
  const [values, setValues] = useState({
    fatigue:        existing?.fatigue        ?? 3,
    stress:         existing?.stress         ?? 3,
    euphoria:       existing?.euphoria       ?? 3,
    frustration:    existing?.frustration    ?? 3,
    motivation:     existing?.motivation     ?? 5,
    sleep_quality:  existing?.sleep_quality  ?? 5,
    sleep_hours:    existing?.sleep_hours    ?? 7,
    exercise_done:  existing?.exercise_done  ?? false,
    meditation_done:existing?.meditation_done?? false,
    notes:          existing?.notes          ?? '',
  })
  const [saving, setSaving] = useState(false)

  const metrics: Array<{ key: keyof typeof values; label: string; description: string }> = [
    { key: 'fatigue',    label: 'Fatigue',    description: 'Votre niveau d\'énergie physique et mentale' },
    { key: 'stress',     label: 'Stress',     description: 'Pression ressentie (vie perso, marché, argent)' },
    { key: 'euphoria',   label: 'Euphorie',   description: 'Excitation, impatience de trader' },
    { key: 'frustration',label: 'Frustration',description: 'Frustrations liées au trading ou à la vie' },
    { key: 'motivation', label: 'Motivation', description: 'Énergie disponible pour travailler' },
    { key: 'sleep_quality', label: 'Sommeil (qualité)', description: 'Qualité du sommeil cette nuit' },
  ]

  async function handleSubmit() {
    setSaving(true)
    const { createClient } = await import('@/lib/supabase')
    const supabase = createClient()

    let data, error
    if (existing?.id) {
      // Mise à jour du check-in existant
      const res = await supabase
        .from('daily_checkins')
        .update(values)
        .eq('id', existing.id)
        .select()
        .single()
      data = res.data; error = res.error
    } else {
      // Nouveau check-in
      const res = await supabase
        .from('daily_checkins')
        .insert({ user_id: userId, ...values })
        .select()
        .single()
      data = res.data; error = res.error
    }

    if (data && !error) {
      onComplete(data)
      refreshDisciplineScore().catch(() => {})
    }
    setSaving(false)
  }

  return (
    <div className="card animate-fade-in">
      <div className="section-title mb-4">Check-in quotidien</div>
      <p className="text-xs text-neutral-500 mb-5 leading-relaxed">
        Évaluez honnêtement votre état. Ces données restent privées et servent uniquement
        à protéger votre capital et votre discipline.
      </p>

      <div className="space-y-5">
        {metrics.map(({ key, label, description }) => {
          const val = values[key] as number
          const isBlocking = (key === 'fatigue' || key === 'stress' || key === 'euphoria') && val >= 7
          return (
            <div key={key}>
              <div className="flex justify-between items-center mb-1.5">
                <div>
                  <label className={clsx('text-sm', isBlocking ? 'text-[#e74c3c]' : 'text-neutral-300')}>
                    {label}
                    {isBlocking && <span className="ml-2 text-xs text-[#e74c3c]">⚠ Blocage session</span>}
                  </label>
                  <p className="text-xs text-neutral-600">{description}</p>
                </div>
                <span className={clsx('font-mono text-sm ml-4', isBlocking ? 'text-[#e74c3c]' : 'text-neutral-400')}>
                  {val}/10
                </span>
              </div>
              <input
                type="range" min={0} max={10} step={1}
                value={val}
                onChange={e => setValues(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                className={clsx(
                  'w-full h-1 rounded-full appearance-none cursor-pointer',
                  isBlocking ? 'accent-[#e74c3c]' : 'accent-neutral-400'
                )}
              />
              <div className="flex justify-between text-xxs text-neutral-700 mt-0.5">
                <span>Très bas</span><span>Moyen</span><span>Très élevé</span>
              </div>
            </div>
          )
        })}

        {/* Sommeil heures */}
        <div>
          <label className="field-label">Heures de sommeil</label>
          <input
            type="number" min={0} max={12} step={0.5}
            value={values.sleep_hours}
            onChange={e => setValues(prev => ({ ...prev, sleep_hours: Number(e.target.value) }))}
            className="input-field w-24 font-mono"
          />
        </div>

        {/* Activités */}
        <div className="flex gap-6">
          {[
            { key: 'exercise_done',   label: 'Activité physique' },
            { key: 'meditation_done', label: 'Méditation' },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={values[key as 'exercise_done' | 'meditation_done']}
                onChange={e => setValues(prev => ({ ...prev, [key]: e.target.checked }))}
                className="w-3.5 h-3.5 rounded-sm border border-[#2a2a2a] accent-neutral-300"
              />
              <span className="text-sm text-neutral-400 group-hover:text-neutral-300">{label}</span>
            </label>
          ))}
        </div>

        {/* Notes optionnelles */}
        <div>
          <label className="field-label">Notes (optionnel)</label>
          <textarea
            value={values.notes}
            onChange={e => setValues(prev => ({ ...prev, notes: e.target.value }))}
            placeholder="Contexte particulier du jour…"
            rows={2}
            className="textarea-field"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="btn-primary flex-1"
          >
            {saving ? 'Enregistrement…' : existing ? 'Mettre à jour' : 'Valider le check-in'}
          </button>
          {existing && (
            <button
              type="button"
              onClick={() => onComplete(existing)}
              className="btn-secondary flex-1"
            >
              Annuler
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// CARTE ÉTAT ÉMOTIONNEL
// ============================================================

function EmotionalStateCard({ checkin, assessment, onEdit }: { checkin: DailyCheckIn; assessment: EmotionalAssessment; onEdit: () => void }) {
  const metrics = [
    { label: 'Fatigue',     value: checkin.fatigue,     blocking: checkin.fatigue >= 7 },
    { label: 'Stress',      value: checkin.stress,      blocking: checkin.stress >= 7 },
    { label: 'Euphorie',    value: checkin.euphoria,    blocking: checkin.euphoria >= 7 },
    { label: 'Frustration', value: checkin.frustration, blocking: false },
    { label: 'Motivation',  value: checkin.motivation,  blocking: false },
    { label: 'Sommeil',     value: checkin.sleep_quality, blocking: false },
  ]

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="section-title">État du jour</div>
        <button onClick={onEdit} className="text-xxs text-neutral-600 hover:text-neutral-400 transition-colors">
          Modifier
        </button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {metrics.map(({ label, value, blocking }) => (
          <div key={label} className={clsx('rounded p-3', blocking ? 'bg-[#e74c3c]/5 border border-[#e74c3c]/20' : 'bg-[#1a1a1a]')}>
            <div className="text-xxs text-neutral-600 uppercase tracking-wider mb-1">{label}</div>
            <div className={clsx('text-xl font-mono font-medium', blocking ? 'text-[#e74c3c]' : 'text-neutral-300')}>
              {value}<span className="text-xs text-neutral-600">/10</span>
            </div>
          </div>
        ))}
      </div>
      {assessment.riskLevel !== 'low' && (
        <div className="mt-4 pt-4 border-t border-[#1a1a1a]">
          <p className="text-xs text-neutral-500">
            Niveau de risque comportemental : <span className={clsx(
              'font-medium',
              assessment.riskLevel === 'critical' ? 'text-[#e74c3c]' :
              assessment.riskLevel === 'high'     ? 'text-[#e67e22]' : 'text-[#f39c12]'
            )}>{assessment.riskLevel}</span>
          </p>
        </div>
      )}
    </div>
  )
}

// ============================================================
// PORTAIL D'ACCÈS SESSION
// ============================================================

function SessionGate({ assessment }: { assessment: EmotionalAssessment }) {
  const router = useRouter()
  const [showAlternatives, setShowAlternatives] = useState(false)

  if (assessment.canStartSession) {
    return (
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-neutral-200">Session disponible</div>
            <p className="text-xs text-neutral-500 mt-0.5">
              État émotionnel acceptable. Vérifiez votre playbook avant d&rsquo;entrer.
            </p>
          </div>
          <button
            onClick={() => router.push('/session')}
            className="btn-secondary text-xs"
          >
            Commencer session →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={clsx('card border border-[#e74c3c]/20 bg-[#e74c3c]/5 shadow-glow-danger')}>
      <div className="section-title text-[#e74c3c] mb-3">Session bloquée</div>
      <div className="space-y-1 mb-4">
        {assessment.blockReasons.map(reason => (
          <div key={reason} className="flex items-center gap-2 text-sm text-neutral-400">
            <span className="text-[#e74c3c] text-xs">—</span>
            <span>
              {reason === 'fatigue'  ? 'Fatigue ≥ 7/10' :
               reason === 'stress'   ? 'Stress ≥ 7/10' :
               'Euphorie ≥ 7/10'}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-neutral-600 mb-4 leading-relaxed">
        Trader dans cet état est statistiquement contre-productif.
        La session est désactivée. Ce n&rsquo;est pas une sanction.
      </p>
      <button
        onClick={() => setShowAlternatives(!showAlternatives)}
        className="btn-secondary text-xs"
      >
        {showAlternatives ? 'Masquer' : 'Voir alternatives'}
      </button>

      {showAlternatives && (
        <div className="mt-4 pt-4 border-t border-[#2a2a2a] grid grid-cols-2 gap-2">
          {TRADING_ALTERNATIVES.map(alt => (
            <div key={alt.id} className="bg-[#1a1a1a] rounded p-3">
              <div className="text-sm text-neutral-300">{alt.icon} {alt.label}</div>
              <div className="text-xs text-neutral-600 mt-0.5 leading-relaxed">{alt.description}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================
// STATISTIQUES DISCIPLINE
// ============================================================

function DisciplineStats({ profile }: { profile: Profile }) {
  const stats = [
    { label: 'Score discipline',  value: `${profile.discipline_score}/100`, mono: true },
    { label: 'Jours propres',     value: String(profile.consecutive_clean_days), mono: true },
    { label: 'Violations totales',value: String(profile.total_violations), mono: true },
    { label: 'Mode',              value: profile.relapse_mode === 'none' ? 'Actif' : profile.relapse_mode, mono: false },
  ]

  return (
    <div className="card">
      <div className="section-title mb-4">Discipline</div>
      <div className="grid grid-cols-4 gap-4">
        {stats.map(({ label, value, mono }) => (
          <div key={label} className="bg-[#1a1a1a] rounded p-3">
            <div className="text-xxs text-neutral-600 uppercase tracking-wider mb-1.5">{label}</div>
            <div className={clsx('text-lg text-neutral-300', mono && 'font-mono font-medium')}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Capital unlock progress */}
      <div className="mt-4 pt-4 border-t border-[#1a1a1a]">
        <div className="section-title mb-3">Capital personnel</div>
        {profile.personal_capital_unlocked ? (
          <p className="text-xs text-neutral-400">Capital déverrouillé.</p>
        ) : (
          <div className="space-y-2">
            {[
              { label: `Journal — ${profile.journal_days_completed}/30 jours`, done: profile.journal_days_completed >= 30 },
              { label: 'Prop firm validée', done: profile.prop_firm_validated },
              { label: `${profile.days_without_discomfort}/7 jours sans inconfort hors trading`, done: profile.days_without_discomfort >= 7 },
              { label: `Score discipline ≥ 70 (actuel : ${profile.discipline_score})`, done: profile.discipline_score >= 70 },
            ].map(({ label, done }) => (
              <div key={label} className="flex items-center gap-2">
                <span className={clsx('text-xs', done ? 'text-[#27ae60]' : 'text-neutral-600')}>
                  {done ? '✓' : '○'}
                </span>
                <span className={clsx('text-xs', done ? 'text-neutral-400' : 'text-neutral-600')}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
