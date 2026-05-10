'use client'

/**
 * Détail d'un trade — Analyse comportementale complète
 * Formulaire AVANT / PENDANT / APRÈS + analyse IA
 */

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { clsx } from 'clsx'
import Navigation from '@/components/shared/Navigation'
import type { Trade } from '@/types'

export default function TradeDetailPage() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()
  const [trade, setTrade] = useState<Trade | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [isNew, setIsNew] = useState(id === 'new')

  const { register, handleSubmit, reset } = useForm<Partial<Trade>>()

  useEffect(() => {
    if (id === 'new') {
      setIsLoading(false)
      setEditMode(true)
      return
    }
    async function load() {
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      const { data } = await supabase.from('trades').select('*').eq('id', id).single()
      setTrade(data)
      if (data) reset(data)
      setIsLoading(false)
    }
    load()
  }, [id, reset])

  async function onSubmit(data: Partial<Trade>) {
    const { createClient } = await import('@/lib/supabase')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (isNew) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, created_at: _ca, updated_at: _ua, user_id: _uid, ...insertData } = data as Trade
      const { data: created } = await supabase
        .from('trades')
        .insert({ user_id: user.id, ...insertData })
        .select().single()
      if (created) { setTrade(created); setIsNew(false); setEditMode(false) }
    } else {
      const { data: updated } = await supabase
        .from('trades')
        .update(data)
        .eq('id', id)
        .select().single()
      if (updated) { setTrade(updated); setEditMode(false) }
    }
  }

  async function deleteTrade() {
    if (!trade) return
    const { createClient } = await import('@/lib/supabase')
    const supabase = createClient()

    const sessionId = trade.session_id

    // Supprimer le trade
    await supabase.from('trades').delete().eq('id', trade.id)

    // Recalculer les métriques de la session si ce trade y était rattaché
    if (sessionId) {
      const { data: remaining } = await supabase
        .from('trades')
        .select('result, pnl')
        .eq('session_id', sessionId)

      if (remaining) {
        const closedTrades = remaining.filter(t => t.result && t.result !== 'open')
        const tradesCount = closedTrades.length
        const pnlSession = closedTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0)

        // Recalculer pertes consécutives (depuis la fin)
        let consecutiveLosses = 0
        for (let i = closedTrades.length - 1; i >= 0; i--) {
          if (closedTrades[i].result === 'loss') consecutiveLosses++
          else break
        }

        await supabase.from('trading_sessions').update({
          trades_count: tradesCount,
          pnl_session: pnlSession,
          consecutive_losses: consecutiveLosses,
        }).eq('id', sessionId)
      }
    }

    router.push('/journal')
  }

  function copyTradeForAnalysis() {
    if (!trade) return
    const text = `ANALYSE DE TRADE — ${trade.symbol} ${trade.direction ?? ''} — ${new Date(trade.created_at).toLocaleDateString('fr-FR')}

PLAN
  Setup : ${trade.setup_name ?? 'N/R'}
  Contexte : ${trade.market_context ?? 'N/R'}
  Justification : ${trade.plan_justification ?? 'N/R'}
  Entrée : ${trade.entry_price ?? 'N/R'} | SL : ${trade.stop_loss ?? 'N/R'} | TP : ${trade.take_profit_1 ?? 'N/R'}
  Risque : ${trade.risk_amount ?? 'N/R'} $ | RR : ${trade.rr_ratio ?? 'N/R'}
  Émotion avant : ${trade.emotion_before ?? 'N/R'} | Confiance : ${trade.confidence_level ?? 'N/R'}/10

PENDANT
  Plan respecté : ${trade.plan_respected === true ? 'Oui' : trade.plan_respected === false ? 'Non' : 'N/R'}
  Stop déplacé : ${trade.stop_moved ? 'Oui — ' + (trade.stop_moved_reason ?? '') : 'Non'}
  Notes : ${trade.temptation_notes ?? 'Aucune'}

RÉSULTAT
  Résultat : ${trade.result ?? 'N/R'} | PnL : ${trade.pnl !== null ? (trade.pnl >= 0 ? '+' : '') + trade.pnl.toFixed(2) + ' $' : 'N/R'}
  Erreur principale : ${trade.main_error ?? 'aucune'}
  Qualité exécution : ${trade.execution_quality ?? 'N/R'}/10
  Notes comportementales : ${trade.behavioral_notes ?? 'Aucune'}
  Flags revenge : ${(trade.revenge_flags?.length ?? 0) > 0 ? trade.revenge_flags?.join(', ') : 'aucun'}

---
Analyse ce trade comportementalement. Identifie le pattern principal, ce qui a bien fonctionné dans l'exécution, et donne une recommandation concrète pour le prochain trade similaire. Sois factuel et non culpabilisant.`

    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center"><div className="text-neutral-600 text-sm">Chargement…</div></div>
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Navigation />
      <main className="flex-1 overflow-y-auto p-6 space-y-5">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/journal')} className="text-xs text-neutral-600 hover:text-neutral-400">
              ← Journal
            </button>
            <h1 className="text-base font-medium text-neutral-200">
              {isNew ? 'Nouveau trade' : `${trade?.symbol ?? ''} — ${new Date(trade?.created_at ?? '').toLocaleDateString('fr-FR')}`}
            </h1>
          </div>
          {!isNew && !editMode && (
            <div className="flex gap-2">
            <button onClick={copyTradeForAnalysis} className="btn-secondary text-xs">
              {copied ? '✓ Copié' : 'Copier pour Claude'}
            </button>
            <button onClick={() => setEditMode(true)} className="btn-secondary text-xs">Modifier</button>
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)} className="btn-danger text-xs">
                Supprimer
              </button>
            ) : (
              <div className="flex gap-1">
                <button onClick={deleteTrade} className="btn-danger text-xs">Confirmer</button>
                <button onClick={() => setConfirmDelete(false)} className="btn-secondary text-xs">Annuler</button>
              </div>
            )}
          </div>
          )}
        </div>

        {editMode ? (
          <TradeForm
            trade={trade}
            register={register}
            handleSubmit={handleSubmit}
            onSubmit={onSubmit}
            onCancel={() => { setEditMode(false); if (isNew) router.push('/journal') }}
          />
        ) : trade ? (
          <TradeView trade={trade} />
        ) : null}
      </main>
    </div>
  )
}

// ——— Vue lecture ———
function TradeView({ trade }: { trade: Trade }) {
  const sections = [
    {
      title: 'AVANT — Plan',
      fields: [
        { label: 'Instrument', value: `${trade.symbol} ${trade.direction ?? ''}` },
        { label: 'Setup', value: trade.setup_name },
        { label: 'Contexte marché', value: trade.market_context },
        { label: 'Justification', value: trade.plan_justification },
        { label: 'Entrée / SL / TP1', value: trade.entry_price ? `${trade.entry_price} / ${trade.stop_loss} / ${trade.take_profit_1}` : null },
        { label: 'Risque', value: trade.risk_amount ? `${trade.risk_amount} $ (RR ${trade.rr_ratio})` : null },
        { label: 'Émotion avant', value: trade.emotion_before },
        { label: 'Niveau de confiance', value: trade.confidence_level ? `${trade.confidence_level}/10` : null },
      ],
    },
    {
      title: 'PENDANT',
      fields: [
        { label: 'Plan respecté', value: trade.plan_respected === null ? null : trade.plan_respected ? 'Oui' : 'Non' },
        { label: 'Stop déplacé', value: trade.stop_moved ? `Oui — ${trade.stop_moved_reason ?? ''}` : 'Non' },
        { label: 'Émotion pendant', value: trade.emotion_during },
        { label: 'Tentations notées', value: trade.temptation_notes },
      ],
    },
    {
      title: 'APRÈS — Résultat',
      fields: [
        { label: 'Résultat', value: trade.result },
        { label: 'PnL', value: trade.pnl !== null ? `${trade.pnl > 0 ? '+' : ''}${trade.pnl.toFixed(2)} $` : null },
        { label: 'Erreur principale', value: trade.main_error },
        { label: 'Qualité exécution', value: trade.execution_quality ? `${trade.execution_quality}/10` : null },
        { label: 'Notes comportementales', value: trade.behavioral_notes },
      ],
    },
  ]

  return (
    <div className="space-y-5">
      {/* Badges violations */}
      {((trade.revenge_flags?.length ?? 0) > 0 || !trade.plan_respected || trade.stop_moved) && (
        <div className="card border border-[#e67e22]/20 bg-[#e67e22]/5">
          <div className="section-title text-[#e67e22] mb-2">Violations détectées</div>
          <div className="space-y-1">
            {!trade.plan_respected && <div className="text-xs text-neutral-500">— Plan non respecté</div>}
            {trade.stop_moved && <div className="text-xs text-neutral-500">— Stop déplacé</div>}
            {(trade.revenge_flags?.length ?? 0) > 0 && (
              <div className="text-xs text-neutral-500">— Patterns revenge : {trade.revenge_flags?.join(', ')}</div>
            )}
          </div>
        </div>
      )}

      {/* Sections */}
      {sections.map(({ title, fields }) => (
        <div key={title} className="card">
          <div className="section-title mb-4">{title}</div>
          <div className="space-y-3">
            {fields.filter(f => f.value).map(({ label, value }) => (
              <div key={label} className="grid grid-cols-3 gap-3">
                <div className="text-xs text-neutral-600">{label}</div>
                <div className="col-span-2 text-xs text-neutral-400 leading-relaxed">{value}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Analyse sauvegardée si existante */}
      {trade.ai_analysis && (
        <div className="card">
          <div className="section-title mb-3">Notes d'analyse</div>
          <pre className="text-xs text-neutral-500 leading-relaxed whitespace-pre-wrap font-sans">
            {trade.ai_analysis}
          </pre>
        </div>
      )}
    </div>
  )
}

// ——— Formulaire saisie/modification ———
function TradeForm({ trade, register, handleSubmit, onSubmit, onCancel }: {
  trade: Trade | null
  register: ReturnType<typeof useForm<Partial<Trade>>>['register']
  handleSubmit: ReturnType<typeof useForm<Partial<Trade>>>['handleSubmit']
  onSubmit: (data: Partial<Trade>) => Promise<void>
  onCancel: () => void
}) {
  return (
    <div className="card">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="section-title mb-2">AVANT — Plan</div>

        <div className="grid grid-cols-2 gap-4">
          <div><label className="field-label">Instrument</label>
            <input {...register('symbol')} defaultValue={trade?.symbol ?? ''} className="input-field" /></div>
          <div><label className="field-label">Direction</label>
            <select {...register('direction')} defaultValue={trade?.direction ?? ''} className="input-field">
              <option value="">—</option><option value="long">Long</option><option value="short">Short</option>
            </select></div>
        </div>

        <div><label className="field-label">Contexte marché</label>
          <textarea {...register('market_context')} defaultValue={trade?.market_context ?? ''} rows={2} className="textarea-field" /></div>

        <div><label className="field-label">Justification plan</label>
          <textarea {...register('plan_justification')} defaultValue={trade?.plan_justification ?? ''} rows={2}
            placeholder="Ce trade respecte mon plan parce que…" className="textarea-field" /></div>

        <div className="grid grid-cols-3 gap-4">
          <div><label className="field-label">Entrée</label><input {...register('entry_price', { valueAsNumber: true })} type="number" step="0.01" className="input-field font-mono" /></div>
          <div><label className="field-label">SL</label><input {...register('stop_loss', { valueAsNumber: true })} type="number" step="0.01" className="input-field font-mono" /></div>
          <div><label className="field-label">TP1</label><input {...register('take_profit_1', { valueAsNumber: true })} type="number" step="0.01" className="input-field font-mono" /></div>
        </div>

        <div><label className="field-label">Émotion avant</label>
          <select {...register('emotion_before')} defaultValue={trade?.emotion_before ?? ''} className="input-field">
            <option value="">—</option>
            <option value="calm">Calme</option><option value="uncertain">Incertain</option>
            <option value="excited">Excité</option><option value="fearful">Apeuré</option>
            <option value="frustrated">Frustré</option><option value="overconfident">Surconfiant</option>
          </select></div>

        <div className="divider" />
        <div className="section-title">PENDANT</div>

        <div className="grid grid-cols-2 gap-4">
          <div><label className="field-label">Plan respecté</label>
            <select {...register('plan_respected', { setValueAs: (v: string) => v === '' ? null : v === 'true' })} className="input-field">
              <option value="">—</option><option value="true">Oui</option><option value="false">Non</option>
            </select></div>
          <div><label className="field-label">Stop déplacé</label>
            <select {...register('stop_moved', { setValueAs: (v: string) => v === 'true' })} className="input-field">
              <option value="false">Non</option><option value="true">Oui</option>
            </select></div>
        </div>

        <div><label className="field-label">Tentations / notes</label>
          <textarea {...register('temptation_notes')} rows={2} className="textarea-field" /></div>

        <div className="divider" />
        <div className="section-title">APRÈS</div>

        <div cla