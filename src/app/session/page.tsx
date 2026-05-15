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
import { logBehavioralEvent, refreshDisciplineScore } from '@/lib/supabase'
import { checkHardStops, formatHardStopBanner } from '@/lib/hard-stops'
import { checkTwoConsecutiveLosses } from '@/lib/two-loss-blocker'
import { detectTradesPerHour, isInMandatoryPause, getRemainingPauseTime, formatPauseTimer } from '@/lib/trades-per-hour'
import { isEmotionInIdealRange, getEmotionWarning } from '@/lib/emotion-phrases'
import type { PlaybookSetup, ActiveSessionState, RevengeDetectionResult, TradingAccount, TradeEmotion } from '@/types'

// ============================================================
// SCHÉMA VALIDATION — Formulaire pré-trade
// ============================================================

const PreTradeSchema = z.object({
  symbol:              z.string().min(1, 'Instrument requis'),
  direction:           z.enum(['long', 'short']),
  playbook_setup_id:   z.string().min(1, 'Setup requis — trade non documenté interdit'),
  market_context:      z.string().optional(),
  entry_price:         z.number().positive('Prix entrée requis'),
  stop_loss:           z.number().positive('Stop loss requis'),
  take_profit_1:       z.number().positive('TP1 requis'),
  risk_amount:         z.number().positive('Risque requis'),
  plan_justification:  z.string().optional(),
})

type PreTradeFormData = z.infer<typeof PreTradeSchema>

// ============================================================
// ÉTATS DE LA SESSION
// ============================================================

type SessionPhase = 'loading' | 'blocked' | 'account_selection' | 'idle' | 'emotion_pick' | 'pre_trade' | 'active_trade' | 'cooldown' | 'ended'

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
  const [accounts, setAccounts] = useState<TradingAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState<TradingAccount | null>(null)
  const [quickEmotion, setQuickEmotion] = useState<{ emotion: TradeEmotion; confidence: number } | null>(null)
  const [hardStopBanner, setHardStopBanner] = useState<{ text: string; remaining: number } | null>(null)
  const [mandatoryPauseEndsAt, setMandatoryPauseEndsAt] = useState<Date | null>(null)
  const [pauseTimerRemaining, setPauseTimerRemaining] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pauseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

      const [checkin, { data: profileData }, { data: playbookData }, { data: accountsData }] = await Promise.all([
        getTodayCheckIn(),
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('playbook_setups').select('*').eq('user_id', user.id).eq('is_active', true),
        supabase.from('accounts').select('*').eq('user_id', user.id).eq('is_active', true).order('created_at'),
      ])

      if (accountsData && accountsData.length > 0) {
        setAccounts(accountsData)
        const defaultAcc = accountsData.find((a: TradingAccount) => a.is_default) ?? accountsData[0]
        setSelectedAccount(defaultAcc)
      }

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

      // Toujours passer par la sélection de compte
      setPhase('account_selection')
    }
    init()

    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [router, startTimer])

  // Confirmer le compte et charger la session associée
  async function confirmAccount(account: TradingAccount) {
    setSelectedAccount(account)
    const { createClient } = await import('@/lib/supabase')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Limites journalières cross-sessions
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { data: todayTrades } = await supabase
      .from('trades')
      .select('result')
      .eq('user_id', user.id)
      .eq('account_id', account.id)
      .neq('result', 'open')
      .gte('created_at', todayStart.toISOString())
    if (todayTrades && todayTrades.length > 0) {
      const maxDaily = (account.max_trades_per_session ?? 2) * 2
      if (todayTrades.length >= maxDaily) {
        setBlockMessage(`Limite journalière atteinte (${todayTrades.length} trades aujourd'hui). Reprenez demain.`)
        setPhase('blocked')
        return
      }
      // Pertes consécutives du jour (depuis la fin)
      let consecToday = 0
      for (let i = todayTrades.length - 1; i >= 0; i--) {
        if (todayTrades[i].result === 'loss') consecToday++
        else break
      }
      if (consecToday >= (account.max_consecutive_losses ?? 2)) {
        setBlockMessage(`Stop journalier : ${consecToday} pertes consécutives aujourd'hui. Revenez demain.`)
        setPhase('blocked')
        return
      }
    }

    // Challenge 2: Hard stops (−1% daily, +2% daily, −2.5% weekly)
    const today = new Date().toISOString().split('T')[0]
    const hardStops = await checkHardStops(supabase, account.id, today)
    if (!hardStops.canTrade) {
      setBlockMessage(hardStops.reason ?? 'Hard stop triggered')
      setPhase('blocked')
      return
    }
    // Show banner with daily remaining
    if (hardStops.dailyRemaining > 0) {
      setHardStopBanner({
        text: formatHardStopBanner(hardStops.dailyPnl, hardStops.dailyRemaining, hardStops.accountBalance),
        remaining: hardStops.dailyRemaining,
      })
    }

    // Chercher une session active - avec account_id si disponible
    let { data: activeSession, error: findSessErr } = await supabase
      .from('trading_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .eq('account_id', account.id)
      .maybeSingle()
    // Fallback si colonne account_id absente
    if (findSessErr?.code === '42703' || findSessErr?.message?.includes('account_id')) {
      ;({ data: activeSession } = await supabase
        .from('trading_sessions').select('*')
        .eq('user_id', user.id).eq('status', 'active').maybeSingle())
    }

    if (activeSession) {
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
      startTimer()
    }
    setPhase('idle')
  }

  // Démarrer une nouvelle session
  async function startSession() {
    const { createClient } = await import('@/lib/supabase')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const sessionType = selectedAccount?.account_type ?? 'simulation'
    const sessionPayload: Record<string, unknown> = {
      user_id: user.id,
      session_type: sessionType,
      ...(selectedAccount ? { account_id: selectedAccount.id } : {}),
    }
    let { data: newSession, error: sessInsertErr } = await supabase
      .from('trading_sessions').insert(sessionPayload).select().single()
    // Fallback si colonne account_id absente (migration non exécutée)
    if (sessInsertErr?.code === '42703' || sessInsertErr?.message?.includes('account_id')) {
      const { account_id: _drop, ...sessPayloadNoAcc } = sessionPayload
      ;({ data: newSession } = await supabase
        .from('trading_sessions').insert(sessPayloadNoAcc).select().single())
    }

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

    // Recalcul du score de discipline en arrière-plan
    refreshDisciplineScore().catch(() => {})
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
      <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 space-y-5">

        {/* Header session */}
        <div className="flex flex-wrap items-center justify-between gap-2">
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

        {/* Phase : sélection du compte */}
        {phase === 'account_selection' && (
          <div className="card">
            <div className="section-title mb-4">Choisir le compte</div>

            {accounts.length === 0 ? (
              <div className="space-y-4">
                <p className="text-xs text-neutral-500">Aucun compte configuré.</p>
                <a href="/accounts" className="btn-secondary text-xs inline-block">
                  Créer un compte →
                </a>
              </div>
            ) : (
              <div className="space-y-2">
                {accounts.map(acc => {
                  const isSelected = selectedAccount?.id === acc.id
                  return (
                    <button
                      key={acc.id}
                      onClick={() => setSelectedAccount(acc)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '12px',
                        borderRadius: '6px',
                        border: isSelected ? '1px solid #e8e8e8' : '1px solid #2a2a2a',
                        background: isSelected ? '#2a2a2a' : '#1a1a1a',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '12px', height: '12px', borderRadius: '50%',
                          border: isSelected ? '3px solid #e8e8e8' : '2px solid #4a4a4a',
                          background: isSelected ? '#e8e8e8' : 'transparent',
                          flexShrink: 0,
                        }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '14px', color: isSelected ? '#e8e8e8' : '#9b9b9b', fontWeight: isSelected ? 500 : 400 }}>
                              {acc.name}
                            </span>
                            <span style={{ fontSize: '12px', color: isSelected ? '#e8e8e8' : '#4a4a4a', fontFamily: 'monospace' }}>
                              {acc.account_balance.toLocaleString('fr-FR')} $
                            </span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#4a4a4a', marginTop: '2px' }}>
                            {acc.broker ?? acc.account_type} · Risque {(acc.max_risk_per_trade * 100).toFixed(1)}%/trade · Max {acc.max_trades_per_session} trades
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
                <button
                  onClick={() => selectedAccount && confirmAccount(selectedAccount)}
                  disabled={!selectedAccount}
                  className="btn-primary w-full"
                  style={{ marginTop: '12px' }}
                >
                  Continuer avec {selectedAccount?.name ?? '…'} →
                </button>
              </div>
            )}
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

            {/* Sélecteur de compte */}
            {accounts.length > 0 ? (
              <div className="mb-5">
                <label className="field-label">Compte actif</label>
                <div className="space-y-2">
                  {accounts.map(acc => {
                    const isSelected = selectedAccount?.id === acc.id
                    return (
                      <button
                        key={acc.id}
                        onClick={() => setSelectedAccount(acc)}
                        className={clsx(
                          'w-full text-left p-3 rounded border transition-all duration-150',
                          isSelected
                            ? 'border-neutral-300 bg-neutral-800'
                            : 'border-[#2a2a2a] bg-[#1a1a1a] hover:border-neutral-500'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={clsx(
                            'w-3 h-3 rounded-full border-2 shrink-0 transition-colors',
                            isSelected ? 'border-neutral-200 bg-neutral-200' : 'border-neutral-600'
                          )} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className={clsx('text-sm font-medium', isSelected ? 'text-neutral-100' : 'text-neutral-400')}>
                                {acc.name}
                              </span>
                              <span className={clsx('text-xs font-mono', isSelected ? 'text-neutral-200' : 'text-neutral-600')}>
                                {acc.account_balance.toLocaleString('fr-FR')} $
                              </span>
                            </div>
                            {acc.broker && (
                              <div className="text-xxs text-neutral-600 mt-0.5">
                                {acc.broker} · {acc.account_type === 'prop_firm' ? 'Prop Firm' : acc.account_type === 'personal' ? 'Personnel' : 'Simulation'}
                              </div>
                            )}
                          </div>
                        </div>
                        {isSelected && (
                          <div className="mt-2 ml-6 text-xxs text-neutral-500 space-y-0.5">
                            <span>Risque {(acc.max_risk_per_trade * 100).toFixed(1)}% / trade</span>
                            <span className="mx-2">·</span>
                            <span>Max {acc.max_trades_per_session} trades</span>
                            <span className="mx-2">·</span>
                            <span>{acc.max_consecutive_losses} pertes conséc. max</span>
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="mb-5 p-3 bg-[#1a1a1a] rounded text-xs text-neutral-500">
                Aucun compte configuré.{' '}
                <a href="/accounts" className="text-neutral-400 underline">Créer un compte →</a>
              </div>
            )}

            {/* Règles du compte sélectionné */}
            {selectedAccount && (
              <div className="space-y-1 text-xs text-neutral-600 mb-5">
                <p>— Maximum {selectedAccount.max_trades_per_session} trades par session</p>
                <p>— Arrêt automatique après {selectedAccount.max_consecutive_losses} pertes consécutives</p>
                <p>— Cooldown 30 min obligatoire après chaque gain</p>
                <p>— Tous les champs de justification sont obligatoires</p>
              </div>
            )}

            <button
              onClick={startSession}
              disabled={accounts.length > 0 && !selectedAccount}
              className="btn-primary w-full"
            >
              Démarrer session
            </button>
          </div>
        )}

        {/* Phase : session active */}
        {session && phase === 'idle' && (
          <>
            <SessionStatus session={session} maxTrades={selectedAccount?.max_trades_per_session ?? 2} maxLosses={selectedAccount?.max_consecutive_losses ?? 2} />

            {/* Hard stop banner */}
            {hardStopBanner && (
              <div className="p-3 bg-[#1a1a1a] border border-[#e67e22] rounded-lg">
                <p className="text-xs text-[#e67e22]">{hardStopBanner.text}</p>
              </div>
            )}

            {/* Mandatory pause timer */}
            {mandatoryPauseEndsAt && isInMandatoryPause(mandatoryPauseEndsAt) && (
              <div className="p-3 bg-[#1a1a1a] border border-[#e74c3c] rounded-lg">
                <p className="text-xs text-[#e74c3c]">
                  ⚠️ 30 min mandatory pause active. Next trade possible in: {formatPauseTimer(pauseTimerRemaining)}
                </p>
              </div>
            )}

            <button
              onClick={() => {
                // Check if in mandatory pause
                if (mandatoryPauseEndsAt && isInMandatoryPause(mandatoryPauseEndsAt)) {
                  setBlockMessage('30 min mandatory pause active. No new trades.')
                  return
                }

                const check = canOpenTrade(session, selectedAccount ?? undefined)
                if (check.allowed) {
                  setPhase('emotion_pick')
                } else {
                  setBlockMessage(check.reason ?? '')
                }
              }}
              disabled={!canOpenTrade(session, selectedAccount ?? undefined).allowed || (mandatoryPauseEndsAt ? isInMandatoryPause(mandatoryPauseEndsAt) : false)}
              className="btn-primary w-full"
            >
              Ouvrir un trade
            </button>
            {blockMessage && (
              <p className="text-xs text-[#e67e22] mt-2">{blockMessage}</p>
            )}
          </>
        )}

        {/* Phase : émotion rapide */}
        {phase === 'emotion_pick' && (
          <EmotionQuickPick
            onSelect={(emotion, confidence) => {
              setQuickEmotion({ emotion, confidence })
              setPhase('pre_trade')
            }}
            onCancel={() => setPhase('idle')}
          />
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
              accountBalance={selectedAccount?.account_balance ?? 10000}
              maxRiskPercent={selectedAccount?.max_risk_per_trade ?? 0.005}
              preEmotion={quickEmotion}
              onRevengeDetected={setRevengeAlert}
              onSubmit={async (data) => {
                const { createClient } = await import('@/lib/supabase')
                const supabase = createClient()
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) return

                const newCount = session.tradesCount + 1
                const maxTrades = selectedAccount?.max_trades_per_session ?? 2

                const tradePayload: Record<string, unknown> = {
                  user_id: user.id,
                  session_id: session.sessionId,
                  account_id: selectedAccount?.id ?? null,
                  ...data,
                  emotion_before: quickEmotion?.emotion ?? null,
                  session_type: selectedAccount?.account_type ?? 'simulation',
                  result: 'open',
                }
                let { error: tradeInsertError } = await supabase.from('trades').insert(tradePayload)
                // Fallback si colonne account_id absente (migration non exécutée)
                if (tradeInsertError?.code === '42703' || tradeInsertError?.message?.includes('account_id')) {
                  const { account_id: _drop, ...tradePayloadNoAcc } = tradePayload
                  ;({ error: tradeInsertError } = await supabase.from('trades').insert(tradePayloadNoAcc))
                }
                if (tradeInsertError) {
                  setBlockMessage(`Erreur enregistrement trade : ${tradeInsertError.message}`)
                  setPhase('idle')
                  return
                }

                // Mettre à jour trades_count en base
                await supabase.from('trading_sessions').update({
                  trades_count: newCount,
                }).eq('id', session.sessionId)

                setSession(prev => prev ? {
                  ...prev,
                  tradesCount: newCount,
                  canOpenTrade: newCount < maxTrades,
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
            onTradeClose={async (result, pnlAmount) => {
              const isLoss = result === 'loss'
              // Calcul depuis l'état courant (closure valide car re-render à chaque phase)
              const newConsecLosses = isLoss ? session.consecutiveLosses + 1 : 0
              const newPnl = session.pnl + pnlAmount

              // 1. Mise à jour état local IMMÉDIATE (avant les awaits)
              setSession(prev => prev ? {
                ...prev,
                consecutiveLosses: newConsecLosses,
                pnl: newPnl,
                cooldownActive: result === 'win',
                cooldownEndsAt: result === 'win' ? new Date(Date.now() + 30 * 60000) : null,
              } : null)

              // 2. Persistance Supabase
              const { createClient } = await import('@/lib/supabase')
              const supabase = createClient()

              const [{ error: sessErr }] = await Promise.all([
                supabase.from('trading_sessions').update({
                  pnl_session: newPnl,
                  consecutive_losses: newConsecLosses,
                }).eq('id', session.sessionId),
              ])
              if (sessErr) console.error('[session] update error:', sessErr.message)

              // 3. Fermer le trade ouvert avec résultat + PnL signé
              const { data: openTrades } = await supabase
                .from('trades')
                .select('id')
                .eq('session_id', session.sessionId)
                .eq('result', 'open')
                .order('created_at', { ascending: false })
                .limit(1)

              if (openTrades && openTrades[0]) {
                await supabase.from('trades').update({
                  result,
                  pnl: pnlAmount,
                }).eq('id', openTrades[0].id)
              }

              // 4. Mise à jour du solde du compte
              if (selectedAccount) {
                const newBalance = selectedAccount.account_balance + pnlAmount
                const { error: accErr } = await supabase
                  .from('accounts')
                  .update({ account_balance: newBalance })
                  .eq('id', selectedAccount.id)
                if (!accErr) {
                  setSelectedAccount(prev => prev ? { ...prev, account_balance: newBalance } : null)
                } else {
                  console.error('[account] balance update error:', accErr.message)
                }
              }

              // 5. Challenge 2: Detect 3 trades in last hour + activate 30-min pause
              const { detected: threeInHour, pauseUntil } = await detectTradesPerHour(supabase, session.sessionId)
              if (threeInHour && pauseUntil) {
                setMandatoryPauseEndsAt(pauseUntil)
                setPauseTimerRemaining(getRemainingPauseTime(pauseUntil))
                // Start pause timer
                if (pauseTimerRef.current) clearInterval(pauseTimerRef.current)
                pauseTimerRef.current = setInterval(() => {
                  setPauseTimerRemaining(prev => Math.max(0, prev - 1))
                }, 1000)
              }

              // 6. Challenge 2: Check two consecutive losses → block session
              const { blocked: twoLossesBlocked } = await checkTwoConsecutiveLosses(supabase, session.sessionId)
              if (twoLossesBlocked) {
                setBlockMessage('2 consecutive losses detected. Session ended for today.')
                closeSession('max_losses')
                return
              }

              // 7. Transition de phase
              if (newConsecLosses >= (selectedAccount?.max_consecutive_losses ?? 2)) {
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

function SessionStatus({ session, maxTrades, maxLosses }: { session: ActiveSessionState; maxTrades: number; maxLosses: number }) {
  return (
    <div className="card">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Trades',        value: `${session.tradesCount}/${maxTrades}` },
          { label: 'Pertes consec.', value: `${session.consecutiveLosses}/${maxLosses}` },
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
  session?: ActiveSessionState
  playbooks: PlaybookSetup[]
  accountBalance: number
  maxRiskPercent: number
  preEmotion: { emotion: TradeEmotion; confidence: number } | null
  onRevengeDetected: (result: RevengeDetectionResult) => void
  onSubmit: (data: PreTradeFormData) => Promise<void>
  onCancel: () => void
}

function PreTradeForm({ playbooks, accountBalance, maxRiskPercent, preEmotion, onRevengeDetected, onSubmit, onCancel }: Omit<PreTradeFormProps, 'session'>) {
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<PreTradeFormData>({
    resolver: zodResolver(PreTradeSchema),
  })

  const [riskCalc, setRiskCalc] = useState<{ riskAmount: number; stopPips: number; lotSize: number } | null>(null)
  const [justificationAnalysis, setJustificationAnalysis] = useState<RevengeDetectionResult | null>(null)
  const [confirmVisible, setConfirmVisible] = useState(false)
  const [showOptional, setShowOptional] = useState(false)

  // Calcul automatique du risque
  const entryPrice = watch('entry_price')
  const stopLoss   = watch('stop_loss')

  useEffect(() => {
    if (entryPrice > 0 && stopLoss > 0) {
      const calc = calculatePositionSize({
        accountBalance,
        riskPercent: maxRiskPercent,
        entryPrice, stopLoss,
      })
      setRiskCalc(calc)
      setValue('risk_amount', calc.riskAmount)
    }
  }, [entryPrice, stopLoss, setValue])

  // Analyse revenge en temps réel sur la justification
  const justification = watch('plan_justification')
  useEffect(() => {
    if ((justification?.length ?? 0) > 20 && justification) {
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
      <div className="section-title mb-5">Plan du trade</div>

      {preEmotion && (
        <div className="flex items-center gap-3 mb-4 px-3 py-2 bg-[#1a1a1a] rounded border border-[#2a2a2a]">
          <span className="text-xxs text-neutral-600 uppercase tracking-wider">Émotion</span>
          <span className="text-xs font-medium text-neutral-300">
            {preEmotion.emotion === 'calm' ? '😌 Calme' :
             preEmotion.emotion === 'excited' ? '⚡ Excité(e)' :
             preEmotion.emotion === 'fearful' ? '😰 Apeuré(e)' :
             preEmotion.emotion === 'uncertain' ? '🤔 Incertain(e)' :
             preEmotion.emotion === 'frustrated' ? '😤 Frustré(e)' : '🔥 Surconfiant(e)'}
          </span>
          <span className="ml-auto text-xxs text-neutral-600">
            {'●'.repeat(preEmotion.confidence)}{'○'.repeat(5 - preEmotion.confidence)}
          </span>
        </div>
      )}
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-5">
        {/* Instrument + Direction */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="field-label">Entrée</label>
            <input {...register('entry_price', { valueAsNumber: true })} type="number" step="0.00001" className="input-field font-mono" />
            {errors.entry_price && <p className="text-xxs text-[#e74c3c] mt-1">{errors.entry_price.message}</p>}
          </div>
          <div>
            <label className="field-label">Stop Loss</label>
            <input {...register('stop_loss', { valueAsNumber: true })} type="number" step="0.00001" className="input-field font-mono" />
            {errors.stop_loss && <p className="text-xxs text-[#e74c3c] mt-1">{errors.stop_loss.message}</p>}
          </div>
          <div>
            <label className="field-label">TP1</label>
            <input {...register('take_profit_1', { valueAsNumber: true })} type="number" step="0.00001" className="input-field font-mono" />
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

        {/* Contexte & justification — optionnel, collapsible */}
        <div>
          <button
            type="button"
            onClick={() => setShowOptional(v => !v)}
            className="text-xxs text-neutral-500 hover:text-neutral-300 transition-colors flex items-center gap-1"
          >
            {showOptional ? '▲' : '▼'} Contexte &amp; justification (optionnel)
          </button>
          {showOptional && (
            <div className="mt-3 space-y-4">
              <div>
                <label className="field-label">Contexte marché</label>
                <textarea
                  {...register('market_context')}
                  rows={2}
                  placeholder="Structure H4/H1, niveaux clés, biais directionnel…"
                  className="textarea-field"
                />
              </div>
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
                {justificationAnalysis && justificationAnalysis.riskScore > 20 && !justificationAnalysis.detected && (
                  <p className="text-xxs text-[#e67e22] mt-1">
                    ⚠ Formulation à risque : {justificationAnalysis.flags.join(', ')}
                  </p>
                )}
              </div>
            </div>
          )}
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
  onTradeClose: (result: 'win' | 'loss' | 'breakeven', pnl: number) => void
}) {
  const [notes, setNotes] = useState('')
  const [pnlInput, setPnlInput] = useState<string>('')
  const [pendingResult, setPendingResult] = useState<'win' | 'loss' | 'breakeven' | null>(null)

  function handleResultClick(result: 'win' | 'loss' | 'breakeven') {
    setPendingResult(result)
  }

  function confirmClose() {
    if (!pendingResult) return
    let pnlValue = parseFloat(pnlInput) || 0
    // Auto-signe : perte → négatif, gain → positif (même si l'utilisateur oublie le -)
    if (pendingResult === 'loss' && pnlValue > 0) pnlValue = -pnlValue
    if (pendingResult === 'win'  && pnlValue < 0) pnlValue = Math.abs(pnlValue)
    onTradeClose(pendingResult, pnlValue)
  }

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
      {!pendingResult ? (
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
                onClick={() => handleResultClick(result)}
                className="btn-secondary text-sm py-3"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-xs text-neutral-400">
            Résultat sélectionné : <span className="font-medium text-neutral-200">{pendingResult === 'win' ? 'Gain' : pendingResult === 'loss' ? 'Perte' : 'Neutre'}</span>
          </div>
          <div>
            <label className="field-label">PnL réalisé ($)</label>
            <input
              type="number"
              step="0.01"
              value={pnlInput}
              onChange={e => setPnlInput(e.target.value)}
              placeholder={pendingResult === 'loss' ? '-50.00' : '75.00'}
              className="input-field font-mono"
            />
            <p className="text-xxs text-neutral-700 mt-1">
              Entrez un montant négatif pour une perte (ex: -50)
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={confirmClose} className="btn-primary flex-1 text-sm">
              Confirmer la clôture
            </button>
            <button onClick={() => setPendingResult(null)} className="btn-secondary flex-1 text-sm">
              Revenir
            </button>
          </div>
        </div>
      )}

      <p className="text-xxs text-neutral-700 mt-4">
        Après clôture, complétez l&rsquo;analyse comportementale dans le journal.
      </p>
    </div>
  )
}

// ============================================================
// EMOTION QUICK-PICK
// ============================================================

const EMOTIONS: { value: TradeEmotion; label: string; emoji: string; color: string }[] = [
  { value: 'calm',          label: 'Calme',          emoji: '😌', color: '#27ae60' },
  { value: 'uncertain',     label: 'Incertain(e)',    emoji: '🤔', color: '#f39c12' },
  { value: 'excited',       label: 'Excité(e)',       emoji: '⚡', color: '#e67e22' },
  { value: 'fearful',       label: 'Apeuré(e)',       emoji: '😰', color: '#e74c3c' },
  { value: 'frustrated',    label: 'Frustré(e)',      emoji: '😤', color: '#c0392b' },
  { value: 'overconfident', label: 'Surconfiant(e)',  emoji: '🔥', color: '#8e44ad' },
]

function EmotionQuickPick({
  onSelect,
  onCancel,
}: {
  onSelect: (emotion: TradeEmotion, confidence: number) => void
  onCancel: () => void
}) {
  const [selected, setSelected] = useState<TradeEmotion | null>(null)
  const [confidence, setConfidence] = useState(3)
  const chosenEmotion = EMOTIONS.find(e => e.value === selected)

  return (
    <div className="card animate-slide-up">
      <div className="section-title mb-1">Comment tu te sens ?</div>
      <p className="text-xxs text-neutral-600 mb-5">
        État émotionnel avant d&rsquo;entrer — 5 secondes, pas plus.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {EMOTIONS.map(({ value, label, emoji, color }) => (
          <button
            key={value}
            type="button"
            onClick={() => setSelected(value)}
            style={{
              padding: '14px 12px',
              borderRadius: '8px',
              border: selected === value ? `2px solid ${color}` : '1px solid #2a2a2a',
              background: selected === value ? `${color}22` : '#1a1a1a',
              cursor: 'pointer',
              transition: 'all 0.15s',
              textAlign: 'center' as const,
            }}
          >
            <div style={{ fontSize: '26px', marginBottom: '4px' }}>{emoji}</div>
            <div style={{
              fontSize: '12px',
              color: selected === value ? color : '#5a5a5a',
              fontWeight: selected === value ? 600 : 400,
            }}>
              {label}
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <div className="mb-6">
          <div className="text-xxs text-neutral-600 uppercase tracking-wider mb-3">
            Confiance dans cette lecture
          </div>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map(dot => (
              <button
                key={dot}
                type="button"
                onClick={() => setConfidence(dot)}
                style={{
                  width: '38px', height: '38px', borderRadius: '50%',
                  border: `2px solid ${dot <= confidence ? (chosenEmotion?.color ?? '#e8e8e8') : '#2a2a2a'}`,
                  background: dot <= confidence ? (chosenEmotion?.color ?? '#e8e8e8') + '33' : '#1a1a1a',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  fontSize: '13px',
                  color: dot <= confidence ? (chosenEmotion?.color ?? '#e8e8e8') : '#4a4a4a',
                  fontWeight: 600,
                }}
              >
                {dot}
              </button>
            ))}
            <span className="text-xxs text-neutral-500 ml-2">
              {confidence === 1 ? 'Pas sûr' : confidence === 2 ? 'Vague' : confidence === 3 ? 'Assez clair' : confidence === 4 ? 'Clair' : 'Très clair'}
            </span>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          disabled={!selected}
          onClick={() => selected && onSelect(selected, confidence)}
          className="btn-primary flex-1"
          style={{ opacity: selected ? 1 : 0.45 }}
        >
          Continuer →
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          Annuler
        </button>
      </div>
    </div>
  )
}
