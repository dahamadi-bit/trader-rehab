'use client'

/**
 * Session Trading — Page encadrée
 *
 * Workflow strict :
 *   1. Vérification état émotionnel du jour
 *   2. Formulaire pré-trade obligatoire (tous champs requis)
 *   3. Détection revenge trading en temps réel
 *   4. Timer + limites automatiques
 *   5. Fermeture forcée si conditions déclenchées
 *
 * Friction intentionnelle : chaque étape ralentit la décision impulsive.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { clsx } from 'clsx'
import Navigation from '@/components/shared/Navigation'
import { analyzeRevengePatterns, getInterventionMessage } from '@/lib/revenge-detection'
import { calculatePositionSize, canOpenTrade } from '@/lib/behavioral-engine'
import { logBehavioralEvent } from '@/lib/supabase'
import type { PlaybookSetup, ActiveSessionState, RevengeDetectionResult } from '@/types'

// ============================================================
// SCHÉMA VALIDATION — Formulaire pré-trade
// ============================================================

const PreTradeSchema = z.object({
  symbol:              z.string().min(1, 'Instrument requis'),
  direction:           z.enum(['long', 'short']),
  playbook_setup_id:   z.string().min(1, 'Setup requis — trade non documenté interdit'),
  market_context:      z.string().min(30, 'Contexte marché requis (min. 30 caractères)'),
  entry_price:         z.number().positive('Prix entrée requis'),
  stop_loss:           z.number().positive('Stop loss requis'),
  take_profit_1:       z.number().positive('TP1 requis'),
  risk_amount:         z.number().positive('Risque requis'),
  emotion_before:      z.enum(['calm', 'excited', 'fearful', 'uncertain', 'frustrated', 'overconfident']),
  plan_justification:  z.string().min(40, 'Justification requise (min. 40 caractères) : "Ce trade respecte mon plan parce que…"'),
})

type PreTradeFormData = z.infer<typeof PreTradeSchema>

// ============================================================
// ÉTATS DE LA SESSION
// ============================================================

type SessionPhase = 'loading' | 'blocked' | 'idle' | 'pre_trade' | 'active_trade' | 'cooldown' | 'ended'

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================

export default function SessionPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<SessionPhase>('loading')
  const [blockMessage, setBlockMessage] = useState('')
  const [session, setSession] = useState<ActiveSessionState | null>(null)
  const [playbooks, setPlaybooks] = useState<PlaybookSetup[]>([])
  const [revengeAlert, setRevengeAlert] = useState<RevengeDetectionResult | null>(null)
  const [sessionMinutes, setSessionMinutes] = useState(0)
  const [cooldownRemaining, setCooldownRemaining] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setSessionMinutes(m => m + 1)
    }, 60000)
  }, [])

  // Chargement et vérification accès session
  useEffect(() => {
    async function init() {
      const { createClient, getTodayCheckIn } = await import('@/lib/supabase')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const [checkin, { data: profileData }, { data: playbookData }] = await Promise.all([
        getTodayCheckIn(),
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('playbook_setups').select('*').eq('user_id', user.id).eq('is_active', true),
      ])

      // Vérification suspension
      if (profileData?.relapse_mode === 'suspended_24h' || profileData?.relapse_mode === 'suspended_7d') {
        setBlockMessage(`Compte suspendu (${profileData.relapse_mode}). Accès limité à la simulation.`)
        setPhase('blocked')
        return
      }

      // Vérification check-in
      if (!checkin) {
        setBlockMessage('Check-in émotionnel non complété. Retournez au tableau de bord.')
        setPhase('blocked')
        return
      }

      // Vérification état émotionnel
      const { evaluateEmotionalState } = await import('@/lib/behavioral-engine')
      const assessment = evaluateEmotionalState(checkin)
      if (!assessment.canStartSession) {
        setBlockMessage(`Session bloquée : ${assessment.blockReasons.join(', ')}. ${assessment.suggestions[0] ?? ''}`)
        setPhase('blocked')
        return
      }

      if (playbookData) setPlaybooks(playbookData)

      // Session déjà active ?
      const { data: activeSession } = await supabase
        .from('trading_sessions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle()

      if (activeSession) {
        // Reconstruire l'état
        const state: ActiveSessionState = {
          sessionId: activeSession.id,
          startedAt: new Date(activeSession.started_at),
          tradesCount: activeSession.trades_count,
          consecutiveLosses: activeSession.consecutive_losses,
          pnl: activeSession.pnl_session,
          cooldownActive: false,
          cooldownEndsAt: null,
          canOpenTrade: true,
          blockReason: null,
        }
        setSession(state)
        setPhase('idle')
        startTimer()
      } else {
        setPhase('idle')
      }
    }
    init()

    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [router, startTimer])

  // Démarrer une nouvelle session
  async function startSession() {
    const { createClient } = await import('@/lib/supabase')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: newSession } = await supabase
      .from('trading_sessions')
      .insert({ user_id: user.id, session_type: 'prop_firm' })
      .select()
      .single()

    if (newSession) {
      setSession({
        sessionId: newSession.id,
        startedAt: new Date(),
        tradesCount: 0,
        consecutiveLosses: 0,
        pnl: 0,
        cooldownActive: false,
        cooldownEndsAt: null,
        canOpenTrade: true,
        blockReason: null,
      })
      startTimer()
    }
  }

  // Fermeture de session
  async function closeSession(reason: 'manual' | 'revenge_detected' | 'max_losses' | 'timeout' | 'force_closed' = 'manual') {
    if (!session) return
    const { createClient } = await import('@/lib/supabase')
    const supabase = createClient()

    await supabase.from('trading_sessions').update({
      status: reason === 'manual' ? 'completed' : 'force_closed',
      close_reason: reason,
      ended_at: new Date().toISOString(),
      duration_minutes: sessionMinutes,
    }).eq('id', session.sessionId)

    if (timerRef.current) clearInterval(timerRef.current)
    setSession(null)
    setPhase('ended')
  }

  // ————————————————————————————————————————
  // RENDU PAR PHASE
  // ————————————————————————————————————————

  if (phase === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0d0d0d]">
        <div className="text-neutral-600 text-sm">Vérification accès…</div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Navigation />
      <main className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* Header session */}
        <div className="flex items-center justify-between">
          <h1 className="text-base font-medium text-neutral-200">Session Trading</h1>
          {session && (
            <div className="flex items-center gap-4">
              <div className="text-xs text-neutral-500 font-mono">
                Durée : {sessionMinutes}min
              </div>
              <div className={clsx(
                'text-xs font-mono font-medium',
                session.pnl > 0 ? 'text-neutral-400' : session.pnl < 0 ? 'text-neutral-500' : 'text-neutral-600'
              )}>
                PnL : {session.pnl > 0 ? '+' : ''}{session.pnl.toFixed(2)} $
              </div>
              <button onClick={() => closeSession('manual')} className="btn-danger text-xs">
                Clore session
              </button>
            </div>
          )}
        </div>

        {/* Phase : bloqué */}
        {phase === 'blocked' && (
          <div className="card border border-[#e74c3c]/20 bg-[#e74c3c]/5">
            <div className="section-title text-[#e74c3c] mb-2">Accès refusé</div>
            <p className="text-sm text-neutral-400">{blockMessage}</p>
            <button onClick={() => router.push('/dashboard')} className="btn-secondary text-xs mt-4">
              ← Retour tableau de bord
            </button>
          </div>
        )}

        {/* Phase : session terminée */}
        {phase === 'ended' && (
          <div className="card">
            <div className="section-title mb-2">Session terminée</div>
            <p className="text-sm text-neutral-400 mb-4">
              Durée : {sessionMinutes} min. Complétez l&rsquo;analyse dans le journal.
            </p>
            <div className="flex gap-3">
              <button onClick={() => router.push('/journal')} className="btn-primary text-xs">
                Ouvrir le journal →
              </button>
              <button onClick={() => router.push('/dashboard')} className="btn-secondary text-xs">
                Tableau de bord
              </button>
            </div>
          </div>
        )}

        {/* Phase : pas de session active */}
        {phase === 'idle' && !session && (
          <div className="card">
            <div className="section-title mb-3">Démarrer une session</div>
            <div className="space-y-2 text-xs text-neutral-500 mb-5">
              <p>— Maximum {2} trades par session</p>
              <p>— Arrêt automatique après 2 pertes consécutives</p>
              <p>— Cooldown 30 min obligatoire après chaque gain</p>
              <p>— Tous les champs de justification sont obligatoires</p>
            </div>
            <button onClick={startSession} className="btn-primary">
              Démarrer session
            </button>
          </div>
        )}

        {/* Phase : session active */}
        {session && phase === 'idle' && (
          <>
            <SessionStatus session={session} />
            <button
              onClick={() => {
                const check = canOpenTrade(session)
                if (check.allowed) {
                  setPhase('pre_trade')
                } else {
                  setBlockMessage(check.reason ?? '')
                }
              }}
              disabled={!canOpenTrade(session).allowed}
              className="btn-primary w-full"
            >
              Ouvrir un trade
            </button>
            {blockMessage && (
              <p className="text-xs text-[#e67e22] mt-2">{blockMessage}</p>
            )}
          </>
        )}

        {/* Phase : formulaire pré-trade */}
        {phase === 'pre_trade' && session && (
          <>
            {revengeAlert && revengeAlert.detected && (
              <RevengeAlert
                result={revengeAlert}
                onClose={() => {
                  const msg = getInterventionMessage(revengeAlert)
                  if (msg.action === 'close') closeSession('revenge_detected')
                  setRevengeAlert(null)
                  setPhase('idle')
                }}
              />
            )}
            <PreTradeForm
              playbooks={playbooks}
              onRevengeDetected={setRevengeAlert}
              onSubmit={async (data) => {
                const { createClient } = await import('@/lib/supabase')
                const supabase = createClient()
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) return

                await supabase.from('trades').insert({
                  user_id: user.id,
                  session_id: session.sessionId,
                  ...data,
                  session_type: 'prop_firm',
                  result: 'open',
                })

                setSession(prev => prev ? {
                  ...prev,
                  tradesCount: prev.tradesCount + 1,
                  canOpenTrade: prev.tradesCount + 1 < 2,
                } : null)

                setPhase('active_trade')
              }}
              onCancel={() => setPhase('idle')}
            />
          </>
        )}

        {/* Phase : trade actif */}
        {phase === 'active_trade' && session && (
          <ActiveTradePanel
            onTradeClose={(result) => {
              const isLoss = result === 'loss'
              const newConsecLosses = isLoss ? session.consecutiveLosses + 1 : 0

              setSession(prev => prev ? {
                ...prev,
                consecutiveLosses: newConsecLosses,
                cooldownActive: result === 'win',
                cooldownEndsAt: result === 'win' ? new Date(Date.now() + 30 * 60000) : null,
              } : null)

              if (newConsecLosses >= 2) {
                closeSession('max_losses')
              } else {
                setPhase('idle')
              }
            }}
          />
        )}

      </main>
    </div>
  )
}

// ============================================================
// SESSION STATUS
// ============================================================

function SessionStatus({ session }: { session: ActiveSessionState }) {
  return (
    <div className="card">
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Trades',        value: `${session.tradesCount}/2` },
          { label: 'Pertes consec.', value: `${session.consecutiveLosses}/2` },
          { label: 'PnL session',   value: `${session.pnl >= 0 ? '+' : ''}${session.pnl.toFixed(0)} $` },
          { label: 'Statut',        value: session.cooldownActive ? 'Cooldown' : 'Actif' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[#1a1a1a] rounded p-3">
            <div className="text-xxs text-neutral-600 uppercase tracking-wider mb-1">{label}</div>
            <div className="text-base font-mono text-neutral-300">{value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// FORMULAIRE PRÉ-TRADE
// ============================================================

interface PreTradeFormProps {
  session: ActiveSessionState
  playbooks: PlaybookSetup[]
  onRevengeDetected: (result: RevengeDetectionResult) => void
  onSubmit: (data: PreTradeFormData) => Promise<void>
  onCancel: () => void
}

function PreTradeForm({ playbooks, onRevengeDetected, onSubmit, onCancel }: Omit<PreTradeFormProps, 'session'>) {
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<PreTradeFormData>({
    resolver: zodResolver(PreTradeSchema),
  })

  const [riskCalc, setRiskCalc] = useState<{ riskAmount: number; stopPips: number; lotSize: number } | null>(null)
  const [justificationAnalysis, setJustificationAnalysis] = useState<RevengeDetectionResult | null>(null)
  const [confirmVisible, setConfirmVisible] = useState(false)

  // Calcul automatique du risque
  const entryPrice = watch('entry_price')
  const stopLoss   = watch('stop_loss')

  useEffect(() => {
    if (entryPrice > 0 && stopLoss > 0) {
      const calc = calculatePositionSize({
        accountBalance: 10000,  // TODO: récupérer depuis profil
        riskPercent: 0.005,
        entryPrice, stopLoss,
      })
      setRiskCalc(calc)
      setValue('risk_amount', calc.riskAmount)
    }
  }, [entryPrice, stopLoss, setValue])

  // Analyse revenge en temps réel sur la justification
  const justification = watch('plan_justification')
  useEffect(() => {
    if (justification?.length > 20) {
      const result = analyzeRevengePatterns(justification)
      setJustificationAnalysis(result)
      if (result.detected) onRevengeDetected(result)
    }
  }, [justification, onRevengeDetected])

  async function handleFormSubmit(data: PreTradeFormData) {
    // Friction intentionnelle : confirmation finale
    if (!confirmVisible) {
      setConfirmVisible(true)
      return
    }
    await onSubmit(data)
  }

  return (
    <div className="card animate-slide-up">
      <div className="section-title mb-5">Plan du trade — tous les champs sont obligatoires</div>

      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-5">
        {/* Instrument + Direction */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="field-label">Instrument</label>
            <input {...register('symbol')} placeholder="DAX, EUR/USD…" className="input-field" />
            {errors.symbol && <p className="text-xxs text-[#e74c3c] mt-1">{errors.symbol.message}</p>}
          </div>
          <div>
            <label className="field-label">Direction</label>
            <select {...register('direction')} className="input-field">
              <option value="">—</option>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
            {errors.direction && <p className="text-xxs text-[#e74c3c] mt-1">{errors.direction.message}</p>}
          </div>
        </div>

        {/* Setup depuis Playbook */}
        <div>
          <label className="field-label">Setup (Playbook uniquement)</label>
          <select {...register('playbook_setup_id')} className="input-field">
            <option value="">— Sélectionner un setup documenté —</option>
            {playbooks.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.pattern_type})</option>
            ))}
          </select>
          {errors.playbook_setup_id && <p className="text-xxs text-[#e74c3c] mt-1">{errors.playbook_setup_id.message}</p>}
          {playbooks.length === 0 && (
            <p className="text-xxs text-[#e67e22] mt-1">
              Aucun setup dans votre Playbook. Documentez vos setups avant de trader.
            </p>
          )}
        </div>

        {/* Prix */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="field-label">Entrée</label>
            <input {...register('entry_price', { valueAsNumber: true })} type="number" step="0.01" className="input-field font-mono" />
            {errors.entry_price && <p className="text-xxs text-[#e74c3c] mt-1">{errors.entry_price.message}</p>}
          </div>
          <div>
            <label className="field-label">Stop Loss</label>
            <input {...register('stop_loss', { valueAsNumber: true })} type="number" step="0.01" className="input-field font-mono" />
            {errors.stop_loss && <p className="text-xxs text-[#e74c3c] mt-1">{errors.stop_loss.message}</p>}
          </div>
          <div>
            <label className="field-label">TP1</label>
            <input {...register('take_profit_1', { valueAsNumber: true })} type="number" step="0.01" className="input-field font-mono" />
          </div>
        </div>

        {/* Calcul risque */}
        {riskCalc && (
          <div className="bg-[#1a1a1a] rounded p-3 grid grid-cols-3 gap-3">
            {[
              { label: 'Risque ($)', value: riskCalc.riskAmount.toFixed(2) },
              { label: 'SL (pips)',  value: riskCalc.stopPips.toFixed(1) },
              { label: 'Lot size',   value: riskCalc.lotSize.toFixed(2) },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-xxs text-neutral-600">{label}</div>
                <div className="text-sm font-mono text-neutral-300">{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Contexte marché */}
        <div>
          <label className="field-label">Contexte marché</label>
          <textarea
            {...register('market_context')}
            rows={2}
            placeholder="Structure H4/H1, niveaux clés, biais directionnel…"
            className="textarea-field"
          />
          {errors.market_context && <p className="text-xxs text-[#e74c3c] mt-1">{errors.market_context.message}</p>}
        </div>

        {/* Justification — zone de détection revenge */}
        <div>
          <label className="field-label">
            Justification — &ldquo;Ce trade respecte mon plan parce que…&rdquo;
          </label>
          <textarea
            {...register('plan_justification')}
            rows={3}
            placeholder="Ce trade respecte mon plan parce que…"
            className={clsx(
              'textarea-field',
              justificationAnalysis?.detected && 'border-[#e74c3c]/60 bg-[#e74c3c]/5'
            )}
          />
          {errors.plan_justification && (
            <p className="text-xxs text-[#e74c3c] mt-1">{errors.plan_justification.message}</p>
          )}
          {justificationAnalysis && justificationAnalysis.riskScore > 20 && !justificationAnalysis.detected && (
            <p className="text-xxs text-[#e67e22] mt-1">
              ⚠ Formulation à risque détectée : {justificationAnalysis.flags.join(', ')}
            </p>
          )}
        </div>

        {/* Émotion avant */}
        <div>
          <label className="field-label">Émotion avant l&rsquo;entrée</label>
          <select {...register('emotion_before')} className="input-field">
            <option value="">—</option>
            <option value="calm">Calme</option>
            <option value="uncertain">Incertain(e)</option>
            <option value="excited">Excité(e)</option>
            <option value="fearful">Apeuré(e)</option>
            <option value="frustrated">Frustré(e)</option>
            <option value="overconfident">Surconfiant(e)</option>
          </select>
          {errors.emotion_before && <p className="text-xxs text-[#e74c3c] mt-1">{errors.emotion_before.message}</p>}
        </div>

        {/* Friction finale */}
        {!confirmVisible ? (
          <button type="submit" className="btn-primary w-full" disabled={playbooks.length === 0}>
            Passer en revue →
          </button>
        ) : (
          <div className="bg-[#1a1a1a] rounded p-4 space-y-3">
            <p className="text-sm text-neutral-300">
              Confirmez : ce trade est dans votre playbook, le risque est défini, et vous êtes dans un état calme.
            </p>
            <div className="flex gap-3">
              <button type="submit" disabled={isSubmitting} className="btn-primary flex-1">
                {isSubmitting ? 'Enregistrement…' : 'Confirmer et entrer'}
              </button>
              <button type="button" onClick={() => setConfirmVisible(false)} className="btn-secondary flex-1">
                Revérifier
              </button>
            </div>
          </div>
        )}

        <button type="button" onClick={onCancel} className="btn-secondary w-full text-xs">
          Annuler — pas de trade
        </button>
      </form>
    </div>
  )
}

// ============================================================
// ALERTE REVENGE TRADING
// ============================================================

function RevengeAlert({ result, onClose }: { result: RevengeDetectionResult; onClose: () => void }) {
  const msg = getInterventionMessage(result)
  return (
    <div className="card border border-[#e74c3c]/40 bg-[#e74c3c]/5 shadow-glow-danger animate-fade-in">
      <div className="text-sm font-medium text-[#e74c3c] mb-2">{msg.title}</div>
      <p className="text-sm text-neutral-400 leading-relaxed mb-4">{msg.body}</p>
      {result.flags.length > 0 && (
        <div className="mb-4">
          <div className="text-xxs text-neutral-600 mb-1">Éléments détectés :</div>
          {result.flags.map(f => (
            <div key={f} className="text-xs text-neutral-500">— {f}</div>
          ))}
        </div>
      )}
      <button onClick={onClose} className="btn-secondary text-xs">
        Compris — fermer
      </button>
    </div>
  )
}

// ============================================================
// PANEL TRADE ACTIF
// ============================================================

function ActiveTradePanel({
  onTradeClose,
}: {
  onTradeClose: (result: 'win' | 'loss' | 'breakeven') => void
}) {
  const [notes, setNotes] = useState('')

  return (
    <div className="card">
      <div className="section-title mb-4">Trade en cours</div>
      <p className="text-xs text-neutral-500 mb-5 leading-relaxed">
        Respectez votre plan. Ne déplacez pas votre stop. Le marché fait ce qu&rsquo;il fait.
      </p>

      {/* Notes pendant */}
      <div className="mb-5">
        <label className="field-label">Observations pendant le trade (optionnel)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          placeholder="Émotions, tentation de modifier le stop…"
          className="textarea-field"
        />
      </div>

      {/* Clôture avec friction */}
      <div>
        <div className="text-xxs text-neutral-600 mb-3 uppercase tracking-wider">Résultat du trade</div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { result: 'win'       as const, label: 'Gain' },
            { result: 'loss'      as const, label: 'Perte' },
            { result: 'breakeven' as const, label: 'Neutre' },
          ].map(({ result, label }) => (
            <button
              key={result}
              onClick={() => onTradeClose(result)}
              className="btn-secondary text-sm py-3"
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xxs text-neutral-700 mt-3">
          Après clôture, complétez l&rsquo;analyse comportementale dans le journal.
        </p>
      </div>
    </div>
  )
}
