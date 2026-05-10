'use client'

/**
 * Bilan Hebdomadaire Thérapeutique
 * Formulaire dimanche + génération rapport comportemental + export PDF
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { clsx } from 'clsx'
import Navigation from '@/components/shared/Navigation'
import type { WeeklyReview } from '@/types'

interface WeeklyFormData {
  plan_respect_score: number
  dominant_emotion: string
  main_errors: string
  triggers: string
  discipline_quality: number
  revenge_trading_urge: number
  market_avoidance_difficulty: number
  sleep_avg: number
  exercise_days: number
  meditation_days: number
  other_activities: string
}

export default function WeeklyPage() {
  const router = useRouter()
  const [reviews, setReviews] = useState<WeeklyReview[]>([])
  const [showForm, setShowForm] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [report, setReport] = useState<{
    disciplineScore: number
    emotionalScore: number
    aiReport: string
    recommendations: string[]
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedReview, setSelectedReview] = useState<WeeklyReview | null>(null)

  const { register, handleSubmit, watch } = useForm<WeeklyFormData>({
    defaultValues: {
      plan_respect_score: 5,
      discipline_quality: 5,
      revenge_trading_urge: 3,
      market_avoidance_difficulty: 3,
      sleep_avg: 7,
      exercise_days: 3,
      meditation_days: 2,
    },
  })

  useEffect(() => {
    async function load() {
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const { data } = await supabase
        .from('weekly_reviews')
        .select('*')
        .eq('user_id', user.id)
        .order('week_start', { ascending: false })
        .limit(10)

      setReviews(data ?? [])
      setIsLoading(false)
    }
    load()
  }, [router])

  async function onSubmit(formData: WeeklyFormData) {
    setGenerating(true)
    const { createClient } = await import('@/lib/supabase')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Récupérer les trades de la semaine
    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - 7)
    const { data: trades } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', user.id)
      .gte('created_at', weekStart.toISOString())

    // Insérer le bilan
    const { data: reviewData } = await supabase
      .from('weekly_reviews')
      .insert({
        user_id: user.id,
        week_start: weekStart.toISOString().split('T')[0],
        week_end: new Date().toISOString().split('T')[0],
        ...formData,
      })
      .select()
      .single()

    // Générer le rapport
    const res = await fetch('/api/weekly-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ review: reviewData, trades: trades ?? [] }),
    })
    const reportData = await res.json()
    setReport(reportData)
    setGenerating(false)
    setShowForm(false)

    // Recharger la liste
    const { data: updated } = await supabase
      .from('weekly_reviews')
      .select('*')
      .eq('user_id', user.id)
      .order('week_start', { ascending: false })
      .limit(10)
    setReviews(updated ?? [])
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-neutral-600 text-sm">Chargement…</div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Navigation />
      <main className="flex-1 overflow-y-auto p-6 space-y-5">

        <div className="flex items-center justify-between">
          <h1 className="text-base font-medium text-neutral-200">Bilan hebdomadaire</h1>
          <button onClick={() => setShowForm(!showForm)} className="btn-secondary text-xs">
            {showForm ? 'Fermer' : 'Nouveau bilan'}
          </button>
        </div>

        {/* Rapport généré */}
        {report && (
          <div className="card border border-neutral-700/30 animate-fade-in">
            <div className="section-title mb-4">Rapport généré</div>
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div className="bg-[#1a1a1a] rounded p-4">
                <div className="text-xxs text-neutral-600 uppercase tracking-wider mb-1">Score discipline</div>
                <div className="text-3xl font-mono text-neutral-300">{report.disciplineScore}</div>
              </div>
              <div className="bg-[#1a1a1a] rounded p-4">
                <div className="text-xxs text-neutral-600 uppercase tracking-wider mb-1">Score émotionnel</div>
                <div className="text-3xl font-mono text-neutral-300">{report.emotionalScore}</div>
              </div>
            </div>

            {report.recommendations.length > 0 && (
              <div className="mb-4">
                <div className="text-xs text-neutral-500 font-medium mb-2">Recommandations</div>
                <div className="space-y-2">
                  {report.recommendations.map((rec, i) => (
                    <div key={i} className="text-xs text-neutral-600 flex gap-2">
                      <span className="text-neutral-700 shrink-0">—</span>
                      <span>{rec}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {report.aiReport && (
              <div className="pt-4 border-t border-[#1a1a1a]">
                <div className="text-xs text-neutral-500 font-medium mb-2">Analyse comportementale</div>
                <pre className="text-xs text-neutral-600 leading-relaxed whitespace-pre-wrap font-sans">
                  {report.aiReport}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Formulaire bilan */}
        {showForm && (
          <div className="card animate-slide-up">
            <div className="section-title mb-5">Bilan de la semaine</div>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

              {/* Questions scored */}
              {[
                { key: 'plan_respect_score',          label: 'Respect du plan (0-10)' },
                { key: 'discipline_quality',           label: 'Qualité discipline ressentie (0-10)' },
                { key: 'revenge_trading_urge',         label: 'Envie de revenge trading (0=aucune, 10=forte)' },
                { key: 'market_avoidance_difficulty',  label: 'Difficulté à ne pas regarder les marchés (0-10)' },
              ].map(({ key, label }) => {
                const val = watch(key as keyof WeeklyFormData) as number
                return (
                  <div key={key}>
                    <div className="flex justify-between mb-1.5">
                      <label className="text-sm text-neutral-400">{label}</label>
                      <span className="text-sm font-mono text-neutral-400">{val}/10</span>
                    </div>
                    <input
                      {...register(key as keyof WeeklyFormData, { valueAsNumber: true })}
                      type="range" min={0} max={10} step={1}
                      className="w-full h-1 rounded appearance-none accent-neutral-400"
                    />
                  </div>
                )
              })}

              <div className="divider" />

              {/* Questions texte */}
              {[
                { key: 'dominant_emotion', label: 'Émotion dominante de la semaine', placeholder: 'Ex: frustration, calme, anxiété…' },
                { key: 'main_errors',      label: 'Erreurs principales identifiées',  placeholder: 'Ex: entré sans confirmation, stop trop serré…' },
                { key: 'triggers',         label: 'Déclencheurs identifiés',          placeholder: 'Ex: après une mauvaise journée, le matin sans café…' },
                { key: 'other_activities', label: 'Autres activités pratiquées',      placeholder: 'Guitare, lecture, méditation, sport…' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="field-label">{label}</label>
                  <textarea
                    {...register(key as keyof WeeklyFormData)}
                    rows={2}
                    placeholder={placeholder}
                    className="textarea-field"
                  />
                </div>
              ))}

              {/* Vie quotidienne */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="field-label">Sommeil moyen (h)</label>
                  <input {...register('sleep_avg', { valueAsNumber: true })} type="number" step="0.5" className="input-field font-mono" />
                </div>
                <div>
                  <label className="field-label">Jours sport</label>
                  <input {...register('exercise_days', { valueAsNumber: true })} type="number" min={0} max={7} className="input-field font-mono" />
                </div>
                <div>
                  <label className="field-label">Jours méditation</label>
                  <input {...register('meditation_days', { valueAsNumber: true })} type="number" min={0} max={7} className="input-field font-mono" />
                </div>
              </div>

              <button type="submit" disabled={generating} className="btn-primary w-full">
                {generating ? 'Génération du rapport…' : 'Générer le rapport comportemental'}
              </button>
            </form>
          </div>
        )}

        {/* Détail d'un bilan sélectionné */}
        {selectedReview && (
          <div className="card border border-neutral-700/30 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <div className="section-title">
                Semaine du {new Date(selectedReview.week_start).toLocaleDateString('fr-FR')}
              </div>
              <button
                onClick={() => setSelectedReview(null)}
                className="text-xs text-neutral-600 hover:text-neutral-400"
              >
                ✕ Fermer
              </button>
            </div>

            {/* Scores */}
            {(selectedReview.discipline_score_week !== null || selectedReview.emotional_score_week !== null) && (
              <div className="grid grid-cols-2 gap-4 mb-5">
                {selectedReview.discipline_score_week !== null && (
                  <div className="bg-[#1a1a1a] rounded p-4">
                    <div className="text-xxs text-neutral-600 uppercase tracking-wider mb-1">Score discipline</div>
                    <div className="text-3xl font-mono text-neutral-300">{selectedReview.discipline_score_week}</div>
                  </div>
                )}
                {selectedReview.emotional_score_week !== null && (
                  <div className="bg-[#1a1a1a] rounded p-4">
                    <div className="text-xxs text-neutral-600 uppercase tracking-wider mb-1">Score émotionnel</div>
                    <div className="text-3xl font-mono text-neutral-300">{selectedReview.emotional_score_week}</div>
                  </div>
                )}
              </div>
            )}

            {/* Champs texte */}
            {[
              { label: 'Émotion dominante',      value: selectedReview.dominant_emotion },
              { label: 'Erreurs principales',     value: selectedReview.main_errors },
              { label: 'Déclencheurs',            value: selectedReview.triggers },
              { label: 'Autres activités',        value: selectedReview.other_activities },
            ].filter(f => f.value).map(({ label, value }) => (
              <div key={label} className="mb-3">
                <div className="text-xxs text-neutral-600 uppercase tracking-wider mb-1">{label}</div>
                <div className="text-xs text-neutral-400 leading-relaxed">{value}</div>
              </div>
            ))}

            {/* Scores chiffrés */}
            <div className="grid grid-cols-2 gap-3 mt-3 mb-4">
              {[
                { label: 'Respect du plan',           value: selectedReview.plan_respect_score },
                { label: 'Qualité discipline',         value: selectedReview.discipline_quality },
                { label: 'Envie revenge trading',      value: selectedReview.revenge_trading_urge },
                { label: 'Difficulté à décrocher',     value: selectedReview.market_avoidance_difficulty },
              ].filter(f => f.value !== null).map(({ label, value }) => (
                <div key={label} className="bg-[#1a1a1a] rounded p-3">
                  <div className="text-xxs text-neutral-600 mb-1">{label}</div>
                  <div className="text-sm font-mono text-neutral-400">{value}/10</div>
                </div>
              ))}
            </div>

            {/* Rapport IA */}
            {selectedReview.ai_report && (
              <div className="pt-4 border-t border-[#1a1a1a]">
                <div className="text-xs text-neutral-500 font-medium mb-2">Analyse comportementale</div>
                <pre className="text-xs text-neutral-600 leading-relaxed whitespace-pre-wrap font-sans">
                  {selectedReview.ai_report}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Historique bilans */}
        {reviews.length > 0 && (
          <div>
            <div className="section-title mb-3">Historique</div>
            <div className="space-y-2">
              {reviews.map(r => (
                <button
                  key={r.id}
                  onClick={() => setSelectedReview(selectedReview?.id === r.id ? null : r)}
                  className={clsx(
                    'card py-3 flex items-center justify-between w-full text-left transition-colors',
                    selectedReview?.id === r.id
                      ? 'border-neutral-600'
                      : 'hover:border-neutral-700 cursor-pointer'
                  )}
                >
                  <div>
                    <div className="text-sm text-neutral-300">
                      Semaine du {new Date(r.week_start).toLocaleDateString('fr-FR')}
                    </div>
                    {r.dominant_emotion && (
                      <div className="text-xs text-neutral-600 mt-0.5">Émotion : {r.dominant_emotion}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    {r.discipline_score_week !== null && (
                      <div className="text-right">
                        <div className="text-xxs text-neutral-700">Discipline</div>
                        <div className="text-sm font-mono text-neutral-400">{r.discipline_score_week}</div>
                      </div>
                    )}
                    {r.emotional_score_week !== null && (
                      <div className="text-right">
                        <div className="text-xxs text-neutral-700">Émotionnel</div>
                        <div className="text-sm font-mono text-neutral-400">{r.emotional_score_week}</div>
                      </div>
                    )}
                    <div className="text-neutral-700 text-xs">→</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
