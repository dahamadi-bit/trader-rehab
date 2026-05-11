'use client'

/**
 * Playbook — Setups autorisés
 * L'utilisateur ne peut trader que des setups documentés ici.
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { clsx } from 'clsx'
import Navigation from '@/components/shared/Navigation'
import type { PlaybookSetup } from '@/types'

interface SetupFormData {
  name: string
  pattern_type: string
  description: string
  entry_conditions: string
  invalidation: string
  target_description: string
}

export default function PlaybookPage() {
  const router = useRouter()
  const [setups, setSetups] = useState<PlaybookSetup[]>([])
  const [showForm, setShowForm] = useState(false)
  const [selected, setSelected] = useState<PlaybookSetup | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [editingSetup, setEditingSetup] = useState<PlaybookSetup | null>(null)

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<SetupFormData>()

  useEffect(() => {
    async function load() {
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const { data } = await supabase
        .from('playbook_setups')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      setSetups(data ?? [])
      setIsLoading(false)
    }
    load()
  }, [router])

  async function onSubmit(data: SetupFormData) {
    const { createClient } = await import('@/lib/supabase')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (editingSetup) {
      // Mise à jour
      const { data: updated } = await supabase
        .from('playbook_setups')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', editingSetup.id)
        .select()
        .single()
      if (updated) {
        setSetups(prev => prev.map(s => s.id === updated.id ? updated : s))
        setSelected(updated)
      }
    } else {
      // Création
      const { data: newSetup } = await supabase
        .from('playbook_setups')
        .insert({ user_id: user.id, ...data })
        .select()
        .single()
      if (newSetup) setSetups(prev => [newSetup, ...prev])
    }

    reset()
    setShowForm(false)
    setEditingSetup(null)
  }

  function startEdit(setup: PlaybookSetup) {
    setEditingSetup(setup)
    reset({
      name: setup.name,
      pattern_type: setup.pattern_type,
      description: setup.description ?? '',
      entry_conditions: setup.entry_conditions,
      invalidation: setup.invalidation,
      target_description: setup.target_description ?? '',
    })
    setShowForm(true)
    setSelected(null)
  }

  async function toggleActive(setup: PlaybookSetup) {
    const { createClient } = await import('@/lib/supabase')
    const supabase = createClient()
    const { data: updated } = await supabase
      .from('playbook_setups')
      .update({ is_active: !setup.is_active })
      .eq('id', setup.id)
      .select()
      .single()
    if (updated) setSetups(prev => prev.map(s => s.id === updated.id ? updated : s))
  }

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center"><div className="text-neutral-600 text-sm">Chargement…</div></div>
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Navigation />
      <main className="flex-1 overflow-y-auto p-6 space-y-5">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-medium text-neutral-200">Playbook</h1>
            <p className="text-xs text-neutral-600 mt-0.5">Seuls les setups documentés ici sont autorisés en session.</p>
          </div>
          <button onClick={() => { setShowForm(!showForm); setEditingSetup(null); reset() }} className="btn-secondary text-xs">
            {showForm ? 'Fermer' : '+ Nouveau setup'}
          </button>
        </div>

        {setups.length === 0 && !showForm && (
          <div className="card text-center py-12">
            <p className="text-neutral-600 text-sm mb-3">Aucun setup documenté.</p>
            <p className="text-xs text-neutral-700">
              Vous ne pouvez pas trader sans setup enregistré.<br />
              Documentez vos configurations avant toute session.
            </p>
          </div>
        )}

        {/* Formulaire nouveau setup */}
        {showForm && (
          <div className="card animate-slide-up">
            <div className="section-title mb-5">{editingSetup ? `Modifier : ${editingSetup.name}` : 'Documenter un setup'}</div>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Nom du setup</label>
                  <input {...register('name', { required: true })} placeholder="Ex: BOS + FVG H1" className="input-field" />
                </div>
                <div>
                  <label className="field-label">Type de pattern</label>
                  <select {...register('pattern_type', { required: true })} className="input-field">
                    <option value="">—</option>
                    <option value="BOS">BOS (Break of Structure)</option>
                    <option value="CHoCH">CHoCH (Change of Character)</option>
                    <option value="FVG">FVG (Fair Value Gap)</option>
                    <option value="Order Block">Order Block</option>
                    <option value="Double Bottom">Double Bottom (W)</option>
                    <option value="Double Top">Double Top (M)</option>
                    <option value="H&S">Head & Shoulders</option>
                    <option value="Flag">Flag haussier/baissier</option>
                    <option value="Triangle">Triangle</option>
                    <option value="Liquidity Sweep">Liquidity Sweep</option>
                    <option value="Custom">Custom</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="field-label">Description du contexte</label>
                <textarea {...register('description')} rows={2} placeholder="Dans quel contexte marché ce setup est-il valide ?" className="textarea-field" />
              </div>

              <div>
                <label className="field-label">Conditions d&rsquo;entrée (précises)</label>
                <textarea {...register('entry_conditions', { required: true })} rows={3}
                  placeholder="1. Structure H4 haussière (HH/HL)&#10;2. FVG visible sur H1&#10;3. Entrée sur retest du FVG avec confirmation bougie englobante…"
                  className="textarea-field" />
              </div>

              <div>
                <label className="field-label">Invalidation</label>
                <textarea {...register('invalidation', { required: true })} rows={2}
                  placeholder="Le setup est invalidé si… (ex: clôture H4 sous le dernier HL)"
                  className="textarea-field" />
              </div>

              <div>
                <label className="field-label">Cible (description)</label>
                <textarea {...register('target_description')} rows={2}
                  placeholder="TP1 : prochain niveau de liquidité. TP2 : extension Fibonacci 1.618…"
                  className="textarea-field" />
              </div>

              <div className="flex gap-3">
                <button type="submit" disabled={isSubmitting} className="btn-primary flex-1">
                  {isSubmitting ? 'Enregistrement…' : editingSetup ? 'Mettre à jour' : 'Enregistrer le setup'}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setEditingSetup(null); reset() }} className="btn-secondary flex-1">
                  Annuler
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Liste des setups */}
        <div className="grid grid-cols-1 gap-3">
          {setups.map(setup => (
            <div
              key={setup.id}
              onClick={() => setSelected(selected?.id === setup.id ? null : setup)}
              className={clsx(
                'card cursor-pointer transition-colors',
                selected?.id === setup.id ? 'border-neutral-600' : 'hover:bg-[#1a1a1a]',
                !setup.is_active && 'opacity-50'
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="badge bg-[#2a2a2a] text-neutral-500">{setup.pattern_type}</span>
                  <span className="text-sm text-neutral-200">{setup.name}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-neutral-600">
                  {setup.trades_count > 0 && (
                    <>
                      <span className="font-mono">{setup.win_rate.toFixed(0)}% WR</span>
                      <span className="font-mono">{setup.avg_rr.toFixed(1)} RR moyen</span>
                      <span className="font-mono">{setup.trades_count} trades</span>
                    </>
                  )}
                  <span>{selected?.id === setup.id ? '▲' : '▼'}</span>
                </div>
              </div>

              {selected?.id === setup.id && (
                <div className="mt-4 pt-4 border-t border-[#1a1a1a] space-y-3 animate-fade-in">
                  {setup.description && (
                    <div>
                      <div className="text-xxs text-neutral-600 uppercase tracking-wider mb-1">Contexte</div>
                      <p className="text-xs text-neutral-500 leading-relaxed">{setup.description}</p>
                    </div>
                  )}
                  <div>
                    <div className="text-xxs text-neutral-600 uppercase tracking-wider mb-1">Conditions d&rsquo;entrée</div>
                    <pre className="text-xs text-neutral-500 leading-relaxed whitespace-pre-wrap font-sans">{setup.entry_conditions}</pre>
                  </div>
                  <div>
                    <div className="text-xxs text-neutral-600 uppercase tracking-wider mb-1">Invalidation</div>
                    <p className="text-xs text-neutral-500 leading-relaxed">{setup.invalidation}</p>
                  </div>
                  {setup.target_description && (
                    <div>
                      <div className="text-xxs text-neutral-600 uppercase tracking-wider mb-1">Cible</div>
                      <p className="text-xs text-neutral-500 leading-relaxed">{setup.target_description}</p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => startEdit(setup)}
                      className="btn-secondary text-xs flex-1"
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => toggleActive(setup)}
                      className={clsx('text-xs px-3 py-1.5 rounded text-xxs uppercase tracking-wider',
                        setup.is_active
                          ? 'bg-neutral-800 text-neutral-500 hover:bg-[#e74c3c]/10 hover:text-[#e74c3c]'
                          : 'bg-neutral-800 text-neutral-600 hover:bg-neutral-700'
                      )}
                    >
                      {setup.is_active ? 'Désactiver' : 'Réactiver'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
