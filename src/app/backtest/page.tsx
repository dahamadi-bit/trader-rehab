'use client'

/**
 * Mode Backtest / Simulation
 *
 * Objectif : remplacer le besoin compulsif de trader réel
 * en offrant un environnement analytique structuré.
 *
 * Badge "Session analytique" — différencié visuellement du trading réel.
 */

import { useState } from 'react'
import Navigation from '@/components/shared/Navigation'
import { clsx } from 'clsx'

interface BacktestSession {
  id: string
  instrument: string
  setupName: string
  entries: BacktestEntry[]
  startedAt: Date
}

interface BacktestEntry {
  id: string
  direction: 'long' | 'short'
  entryPrice: number
  stopLoss: number
  takeProfit: number
  result: 'win' | 'loss' | 'be' | null
  rr: number
  notes: string
}

export default function BacktestPage() {
  const [sessions, setSessions] = useState<BacktestSession[]>([])
  const [activeSession, setActiveSession] = useState<BacktestSession | null>(null)
  const [showNewSession, setShowNewSession] = useState(false)
  const [newInstrument, setNewInstrument] = useState('')
  const [newSetup, setNewSetup] = useState('')

  function startSession() {
    if (!newInstrument || !newSetup) return
    const session: BacktestSession = {
      id: crypto.randomUUID(),
      instrument: newInstrument,
      setupName: newSetup,
      entries: [],
      startedAt: new Date(),
    }
    setSessions(prev => [session, ...prev])
    setActiveSession(session)
    setShowNewSession(false)
    setNewInstrument('')
    setNewSetup('')
  }

  // Statistiques agrégées
  const allEntries = sessions.flatMap(s => s.entries).filter(e => e.result !== null)
  const wins  = allEntries.filter(e => e.result === 'win').length
  const total = allEntries.length
  const winRate = total > 0 ? Math.round(wins / total * 100) : 0
  const avgRR  = total > 0 ? allEntries.reduce((a, e) => a + e.rr, 0) / total : 0

  return (
    <div className="flex h-screen overflow-hidden">
      <Navigation />
      <main className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* Header avec badge analytique */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-medium text-neutral-200">Mode Backtest</h1>
            <span className="badge bg-[#1a1a1a] text-neutral-500 border border-[#2a2a2a]">
              Session analytique
            </span>
          </div>
          <button onClick={() => setShowNewSession(!showNewSession)} className="btn-secondary text-xs">
            + Nouvelle session
          </button>
        </div>

        {/* Information */}
        <div className="card border-l-2 border-l-neutral-700">
          <p className="text-xs text-neutral-500 leading-relaxed">
            Le backtest permet d&rsquo;analyser des setups sur données historiques sans capital réel.
            C&rsquo;est une activité analytique. Aucun capital n&rsquo;est engagé.
            Utilisez ce mode quand l&rsquo;état émotionnel bloque la session réelle.
          </p>
        </div>

        {/* Statistiques globales */}
        {total > 0 && (
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Trades backtestés', value: String(total) },
              { label: 'Win rate',           value: `${winRate}%` },
              { label: 'RR moyen',           value: avgRR.toFixed(2) },
              { label: 'Sessions',           value: String(sessions.length) },
            ].map(({ label, value }) => (
              <div key={label} className="card py-3">
                <div className="text-xxs text-neutral-700 uppercase tracking-wider">{label}</div>
                <div className="text-xl font-mono text-neutral-400 mt-1">{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Nouvelle session */}
        {showNewSession && (
          <div className="card animate-slide-up">
            <div className="section-title mb-4">Nouvelle session backtest</div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="field-label">Instrument</label>
                <input
                  value={newInstrument}
                  onChange={e => setNewInstrument(e.target.value)}
                  placeholder="DAX, EUR/USD, BTC…"
                  className="input-field"
                />
              </div>
              <div>
                <label className="field-label">Setup à tester</label>
                <input
                  value={newSetup}
                  onChange={e => setNewSetup(e.target.value)}
                  placeholder="BOS + FVG, Double Bottom…"
                  className="input-field"
                />
              </div>
            </div>
            <button onClick={startSession} className="btn-primary text-xs">
              Démarrer la session analytique
            </button>
          </div>
        )}

        {/* Session active */}
        {activeSession && (
          <ActiveBacktestSession
            session={activeSession}
            onAddEntry={(entry) => {
              setActiveSession(prev => prev ? { ...prev, entries: [...prev.entries, entry] } : null)
              setSessions(prev => prev.map(s =>
                s.id === activeSession.id ? { ...s, entries: [...s.entries, entry] } : s
              ))
            }}
            onClose={() => setActiveSession(null)}
          />
        )}

        {/* Historique sessions */}
        {sessions.filter(s => s.id !== activeSession?.id).length > 0 && (
          <div>
            <div className="section-title mb-3">Sessions précédentes</div>
            <div className="space-y-2">
              {sessions.filter(s => s.id !== activeSession?.id).map(s => {
                const sEntries = s.entries.filter(e => e.result !== null)
                const sWins = sEntries.filter(e => e.result === 'win').length
                return (
                  <div
                    key={s.id}
                    onClick={() => setActiveSession(s)}
                    className="card hover:bg-[#1a1a1a] cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm text-neutral-300">{s.instrument}</span>
                        <span className="text-xs text-neutral-600 ml-3">{s.setupName}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-neutral-600">
                        <span className="font-mono">{sEntries.length} trades</span>
                        <span className="font-mono">
                          {sEntries.length > 0 ? `${Math.round(sWins / sEntries.length * 100)}% WR` : '—'}
                        </span>
                        <span>{s.startedAt.toLocaleDateString('fr-FR')}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {sessions.length === 0 && !showNewSession && (
          <div className="card text-center py-12">
            <p className="text-neutral-600 text-sm">Aucune session backtest.</p>
            <p className="text-xs text-neutral-700 mt-2">
              Commencez par créer une session pour tester vos setups.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}

// ============================================================
// SESSION BACKTEST ACTIVE
// ============================================================

function ActiveBacktestSession({
  session, onAddEntry, onClose
}: {
  session: BacktestSession
  onAddEntry: (entry: BacktestEntry) => void
  onClose: () => void
}) {
  const [entry, setEntry] = useState<{
    direction: 'long' | 'short'
    entryPrice: number
    stopLoss: number
    takeProfit: number
    notes: string
  }>({
    direction: 'long',
    entryPrice: 0,
    stopLoss: 0,
    takeProfit: 0,
    notes: '',
  })

  function addEntry(result: 'win' | 'loss' | 'be') {
    const rr = entry.takeProfit > 0 && entry.stopLoss > 0 && entry.entryPrice > 0
      ? Math.abs(entry.takeProfit - entry.entryPrice) / Math.abs(entry.entryPrice - entry.stopLoss)
      : 0

    onAddEntry({
      id: crypto.randomUUID(),
      ...entry,
      result,
      rr,
    })
    setEntry(prev => ({ ...prev, entryPrice: 0, stopLoss: 0, takeProfit: 0, notes: '' }))
  }

  const completedEntries = session.entries.filter(e => e.result !== null)
  const wins = completedEntries.filter(e => e.result === 'win').length

  return (
    <div className="card border border-neutral-700/40">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm text-neutral-200">{session.instrument} — {session.setupName}</div>
          <div className="text-xs text-neutral-600 mt-0.5">
            {completedEntries.length} trade(s) · {completedEntries.length > 0 ? `${Math.round(wins/completedEntries.length*100)}% WR` : '—'}
          </div>
        </div>
        <button onClick={onClose} className="text-xs text-neutral-600 hover:text-neutral-400">
          Clore session
        </button>
      </div>

      {/* Formulaire trade backtest */}
      <div className="bg-[#1a1a1a] rounded p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Direction</label>
            <select
              value={entry.direction}
              onChange={e => setEntry(prev => ({ ...prev, direction: e.target.value as 'long' | 'short' }))}
              className="input-field"
            >
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </div>
          <div>
            <label className="field-label">Prix entrée</label>
            <input type="number" step="0.01" value={entry.entryPrice || ''}
              onChange={e => setEntry(p => ({ ...p, entryPrice: Number(e.target.value) }))}
              className="input-field font-mono" />
          </div>
          <div>
            <label className="field-label">Stop Loss</label>
            <input type="number" step="0.01" value={entry.stopLoss || ''}
              onChange={e => setEntry(p => ({ ...p, stopLoss: Number(e.target.value) }))}
              className="input-field font-mono" />
          </div>
          <div>
            <label className="field-label">Take Profit</label>
            <input type="number" step="0.01" value={entry.takeProfit || ''}
              onChange={e => setEntry(p => ({ ...p, takeProfit: Number(e.target.value) }))}
              className="input-field font-mono" />
          </div>
        </div>

        {/* RR calculé */}
        {entry.entryPrice > 0 && entry.stopLoss > 0 && entry.takeProfit > 0 && (
          <div className="text-xs text-neutral-600 font-mono">
            RR : {(Math.abs(entry.takeProfit - entry.entryPrice) / Math.abs(entry.entryPrice - entry.stopLoss)).toFixed(2)}
          </div>
        )}

        <div>
          <label className="field-label">Notes</label>
          <textarea value={entry.notes} onChange={e => setEntry(p => ({ ...p, notes: e.target.value }))}
            rows={1} placeholder="Observations…" className="textarea-field" />
        </div>

        <div className="flex gap-2">
          {(['win', 'loss', 'be'] as const).map(result => (
            <button
              key={result}
              onClick={() => addEntry(result)}
              className="btn-secondary flex-1 text-xs capitalize"
            >
              {result === 'be' ? 'Neutre' : result === 'win' ? 'Gain' : 'Perte'}
            </button>
          ))}
        </div>
      </div>

      {/* Historique entries */}
      {session.entries.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {session.entries.map((e, i) => (
            <div key={e.id} className="flex items-center justify-between text-xs py-1.5 border-b border-[#1a1a1a] last:border-0">
              <span className="text-neutral-600">#{i + 1}</span>
              <span className={clsx('uppercase text-xxs tracking-wider', e.direction === 'long' ? 'text-neutral-500' : 'text-neutral-600')}>{e.direction}</span>
              <span className="font-mono text-neutral-600">{e.entryPrice}</span>
              <span className="font-mono text-neutral-600">RR {e.rr.toFixed(2)}</span>
              <span className={clsx('text-xxs font-medium',
                e.result === 'win' ? 'text-neutral-400' : e.result === 'loss' ? 'text-neutral-600' : 'text-neutral-700'
              )}>
                {e.result === 'win' ? 'G' : e.result === 'loss' ? 'P' : 'N'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
