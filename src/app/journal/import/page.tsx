'use client'

/**
 * Import CSV Broker — Journal
 *
 * Workflow :
 *   1. Upload CSV (FTMO / MT4 / format générique)
 *   2. Détection automatique du format + mapping colonnes
 *   3. Prévisualisation des trades parsés
 *   4. Sélection du compte cible
 *   5. Import en base Supabase (trades)
 */

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Navigation from '@/components/shared/Navigation'
import type { TradingAccount } from '@/types'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type Direction = 'long' | 'short'
type TradeResult = 'win' | 'loss' | 'breakeven'
type DetectedFormat = 'ftmo' | 'mt4' | 'generic' | null

interface ParsedTrade {
  symbol: string
  direction: Direction
  entry_price: number
  stop_loss: number | null
  take_profit_1: number | null
  pnl: number
  result: TradeResult
  risk_amount: number
  open_time: string | null
  close_time: string | null
  volume: number | null
  raw: Record<string, string>   // ligne brute pour debug
}

interface ColumnMap {
  symbol: string
  type: string
  entry_price: string
  stop_loss: string
  take_profit: string
  profit: string
  commission: string
  swap: string
  open_time: string
  close_time: string
  volume: string
}

// ─────────────────────────────────────────────────────────────
// Détection de format
// ─────────────────────────────────────────────────────────────

function detectFormat(headers: string[]): { format: DetectedFormat; map: Partial<ColumnMap> } {
  const h = headers.map(s => s.toLowerCase().trim())

  // FTMO — a "commission" column et "profit" distinct
  if (h.includes('commission') && h.includes('profit')) {
    return {
      format: 'ftmo',
      map: {
        symbol:      findCol(h, ['symbol', 'instrument']),
        type:        findCol(h, ['type', 'direction', 'side']),
        entry_price: findCol(h, ['price', 'open price', 'entry', 'openprice']),
        stop_loss:   findCol(h, ['s/l', 'sl', 'stop loss', 'stoploss']),
        take_profit: findCol(h, ['t/p', 'tp', 'take profit', 'takeprofit']),
        profit:      findCol(h, ['profit']),
        commission:  findCol(h, ['commission']),
        swap:        findCol(h, ['swap']),
        open_time:   findCol(h, ['open time', 'opentime', 'open_time', 'time']),
        close_time:  findCol(h, ['close time', 'closetime', 'close_time']),
        volume:      findCol(h, ['volume', 'lots', 'size']),
      },
    }
  }

  // MT4 classique
  if (h.includes('ticket') || h.some(c => c.includes('open time'))) {
    return {
      format: 'mt4',
      map: {
        symbol:      findCol(h, ['symbol', 'instrument']),
        type:        findCol(h, ['type', 'direction']),
        entry_price: findCol(h, ['price', 'open price', 'openprice']),
        stop_loss:   findCol(h, ['s/l', 'sl', 'stoploss']),
        take_profit: findCol(h, ['t/p', 'tp', 'takeprofit']),
        profit:      findCol(h, ['profit', 'pnl']),
        commission:  undefined,
        swap:        findCol(h, ['swap']),
        open_time:   findCol(h, ['open time', 'opentime']),
        close_time:  findCol(h, ['close time', 'closetime']),
        volume:      findCol(h, ['volume', 'lots']),
      },
    }
  }

  // Format générique
  return {
    format: 'generic',
    map: {
      symbol:      findCol(h, ['symbol', 'instrument', 'pair', 'asset']),
      type:        findCol(h, ['type', 'direction', 'side', 'action']),
      entry_price: findCol(h, ['entry', 'price', 'open', 'entry_price']),
      stop_loss:   findCol(h, ['sl', 'stop', 'stoploss']),
      take_profit: findCol(h, ['tp', 'target', 'takeprofit']),
      profit:      findCol(h, ['profit', 'pnl', 'gain', 'result']),
      open_time:   findCol(h, ['date', 'time', 'open_time', 'datetime']),
      close_time:  findCol(h, ['close_time', 'close date', 'exit_time']),
      volume:      findCol(h, ['volume', 'size', 'lots', 'quantity']),
    },
  }
}

function findCol(headers: string[], candidates: string[]): string | undefined {
  for (const c of candidates) {
    const found = headers.find(h => h === c || h.includes(c))
    if (found !== undefined) return found
  }
  return undefined
}

// ─────────────────────────────────────────────────────────────
// Parser CSV
// ─────────────────────────────────────────────────────────────

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }

  // Detect delimiter
  const firstLine = lines[0]
  const delimiter = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ','

  function splitLine(line: string): string[] {
    const result: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        inQuotes = !inQuotes
      } else if (ch === delimiter && !inQuotes) {
        result.push(cur.trim())
        cur = ''
      } else {
        cur += ch
      }
    }
    result.push(cur.trim())
    return result
  }

  const headers = splitLine(lines[0])
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i])
    if (cells.length < 2) continue
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = cells[idx] ?? '' })
    rows.push(row)
  }

  return { headers, rows }
}

function parseTrades(rows: Record<string, string>[], map: Partial<ColumnMap>, headers: string[]): ParsedTrade[] {
  return rows.map(row => {
    const get = (col: string | undefined): string => col ? (row[col] ?? row[headers.find(h => h.toLowerCase().trim() === col?.toLowerCase().trim()) ?? ''] ?? '') : ''

    const rawProfit   = parseFloat(get(map.profit)?.replace(',', '.'))  || 0
    const rawComm     = parseFloat(get(map.commission)?.replace(',', '.')) || 0
    const rawSwap     = parseFloat(get(map.swap)?.replace(',', '.'))    || 0
    const totalPnl    = rawProfit + rawComm + rawSwap

    const rawType = get(map.type)?.toLowerCase().trim() ?? ''
    const direction: Direction = rawType.includes('sell') || rawType === 'short' || rawType === 's'
      ? 'short'
      : 'long'

    const result: TradeResult = totalPnl > 0 ? 'win' : totalPnl < 0 ? 'loss' : 'breakeven'

    return {
      symbol:       (get(map.symbol) || 'UNKNOWN').toUpperCase(),
      direction,
      entry_price:  parseFloat(get(map.entry_price)?.replace(',', '.')) || 0,
      stop_loss:    parseFloat(get(map.stop_loss)?.replace(',', '.'))   || null,
      take_profit_1: parseFloat(get(map.take_profit)?.replace(',', '.')) || null,
      pnl:          Math.round(totalPnl * 100) / 100,
      result,
      risk_amount:  Math.abs(totalPnl),
      volume:       parseFloat(get(map.volume)?.replace(',', '.'))      || null,
      open_time:    get(map.open_time) || null,
      close_time:   get(map.close_time) || null,
      raw: row,
    }
  }).filter(t => t.symbol !== 'UNKNOWN' || t.entry_price > 0)
}

// ─────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────

type Step = 'upload' | 'preview' | 'importing' | 'done'

export default function ImportPage() {
  const router = useRouter()

  const [step, setStep] = useState<Step>('upload')
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState('')
  const [format, setFormat] = useState<DetectedFormat>(null)
  const [columnMap, setColumnMap] = useState<Partial<ColumnMap>>({})
  const [allHeaders, setAllHeaders] = useState<string[]>([])
  const [trades, setTrades] = useState<ParsedTrade[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [accounts, setAccounts] = useState<TradingAccount[]>([])
  const [accountId, setAccountId] = useState<string>('')
  const [importResult, setImportResult] = useState<{ ok: number; err: number } | null>(null)
  const [error, setError] = useState('')

  const fileRef = useRef<HTMLInputElement>(null)

  // Charger comptes
  const loadAccounts = useCallback(async () => {
    const { createClient } = await import('@/lib/supabase')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('accounts').select('*').eq('user_id', user.id).eq('is_active', true)
    if (data) {
      setAccounts(data)
      const def = data.find((a: TradingAccount) => a.is_default) ?? data[0]
      if (def) setAccountId(def.id)
    }
  }, [])

  // Parser un fichier
  function processFile(file: File) {
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
      setError('Format non supporté. Exportez votre historique en .csv depuis votre broker.')
      return
    }
    setFileName(file.name)
    setError('')

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const { headers, rows } = parseCSV(text)
      if (rows.length === 0) { setError('Fichier vide ou format non reconnu.'); return }

      const { format: fmt, map } = detectFormat(headers)
      setFormat(fmt)
      setColumnMap(map)
      setAllHeaders(headers)

      const parsed = parseTrades(rows, map, headers)
      setTrades(parsed)
      setSelected(new Set(parsed.map((_, i) => i)))
      setStep('preview')
      loadAccounts()
    }
    reader.readAsText(file, 'utf-8')
  }

  // Drag & drop handlers
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  // Import en base
  async function runImport() {
    if (!accountId) { setError('Sélectionnez un compte.'); return }
    setStep('importing')

    const { createClient } = await import('@/lib/supabase')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Non connecté.'); setStep('preview'); return }

    const account = accounts.find(a => a.id === accountId)
    const toImport = trades.filter((_, i) => selected.has(i))

    let ok = 0, err = 0

    for (const t of toImport) {
      const payload = {
        user_id:       user.id,
        account_id:    accountId,
        session_id:    null,
        symbol:        t.symbol,
        direction:     t.direction,
        entry_price:   t.entry_price,
        stop_loss:     t.stop_loss,
        take_profit_1: t.take_profit_1,
        pnl:           t.pnl,
        result:        t.result,
        risk_amount:   t.risk_amount,
        session_type:  account?.account_type ?? 'personal',
        market_context: null,
        plan_justification: null,
        emotion_before: null,
        ...(t.open_time ? { created_at: parseDateTime(t.open_time) } : {}),
      }

      const { error: insErr } = await supabase.from('trades').insert(payload)
      if (insErr) { err++; console.error('[import]', insErr.message, t.symbol) }
      else ok++
    }

    // Mise à jour du solde compte si trades fermés
    if (ok > 0 && account) {
      const totalPnl = toImport
        .filter((_, i) => selected.has(i))
        .reduce((sum, t) => sum + t.pnl, 0)
      const newBalance = account.account_balance + totalPnl
      await supabase.from('accounts').update({ account_balance: newBalance }).eq('id', accountId)
    }

    setImportResult({ ok, err })
    setStep('done')
  }

  function parseDateTime(raw: string): string {
    // Essaie de parser "2024.01.15 09:30:00" ou "2024-01-15 09:30" ou ISO
    const cleaned = raw.replace(/\./g, '-')
    const d = new Date(cleaned)
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
  }

  const toggleAll = () => {
    if (selected.size === trades.length) setSelected(new Set())
    else setSelected(new Set(trades.map((_, i) => i)))
  }

  const toggleRow = (i: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  // ─── RENDER ────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden">
      <Navigation />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/journal')} className="text-neutral-600 hover:text-neutral-300 text-sm transition-colors">
            ← Journal
          </button>
          <h1 className="text-base font-medium text-neutral-200">Import CSV Broker</h1>
        </div>

        {error && (
          <div className="px-4 py-3 bg-[#e74c3c]/10 border border-[#e74c3c]/30 rounded text-sm text-[#e74c3c]">
            {error}
          </div>
        )}

        {/* ── Étape 1 : Upload ── */}
        {step === 'upload' && (
          <div className="card">
            <div className="section-title mb-2">Importer un historique broker</div>
            <p className="text-xs text-neutral-600 mb-6">
              Téléchargez votre historique de trades depuis votre broker (FTMO, MT4, MT5…) et importez-le pour analyse IA.
            </p>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? '#e8e8e8' : '#2a2a2a'}`,
                borderRadius: '8px',
                padding: '40px 24px',
                textAlign: 'center',
                cursor: 'pointer',
                background: dragging ? '#1a1a1a' : 'transparent',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>📂</div>
              <p className="text-sm text-neutral-400">Glissez votre fichier .csv ici</p>
              <p className="text-xxs text-neutral-600 mt-1">ou cliquez pour choisir</p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f) }}
              />
            </div>

            {/* Formats supportés */}
            <div className="mt-6 space-y-2">
              <div className="text-xxs text-neutral-600 uppercase tracking-wider mb-2">Formats détectés automatiquement</div>
              {[
                { name: 'FTMO', desc: 'Export history .csv depuis le dashboard FTMO' },
                { name: 'MT4 / MT5', desc: 'Statement → Save as .html puis convertir, ou export direct csv' },
                { name: 'Générique', desc: 'Tout CSV avec colonnes symbol, type/direction, price, profit' },
              ].map(({ name, desc }) => (
                <div key={name} className="flex gap-3 text-xs">
                  <span className="text-neutral-500 font-medium w-20 shrink-0">{name}</span>
                  <span className="text-neutral-700">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Étape 2 : Prévisualisation ── */}
        {step === 'preview' && (
          <>
            {/* Infos détection */}
            <div className="card">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <div className="section-title mb-0.5">Aperçu — {fileName}</div>
                  <div className="text-xxs text-neutral-600">
                    Format détecté : <span className="text-neutral-400 uppercase">{format ?? '—'}</span>
                    {' · '}{trades.length} trades parsés
                  </div>
                </div>
                <button onClick={() => setStep('upload')} className="btn-secondary text-xs">
                  ← Changer fichier
                </button>
              </div>

              {/* Sélecteur de compte */}
              <div className="mb-4">
                <label className="field-label">Compte cible</label>
                <select
                  value={accountId}
                  onChange={e => setAccountId(e.target.value)}
                  className="input-field"
                >
                  <option value="">— Choisir un compte —</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.account_balance.toLocaleString('fr-FR')} $)
                    </option>
                  ))}
                </select>
              </div>

              {/* Mapping colonnes (compact) */}
              <details className="text-xs text-neutral-600 mt-2">
                <summary className="cursor-pointer hover:text-neutral-400 transition-colors">
                  Mapping colonnes détecté ▾
                </summary>
                <div className="mt-2 grid grid-cols-2 gap-1 text-xxs">
                  {Object.entries(columnMap).filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="text-neutral-600 w-24">{k}</span>
                      <span className="text-neutral-400">→ {v}</span>
                    </div>
                  ))}
                </div>
              </details>
            </div>

            {/* Table des trades */}
            <div className="card overflow-x-auto p-0">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #2a2a2a', background: '#111' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', color: '#4a4a4a', fontWeight: 500 }}>
                      <input
                        type="checkbox"
                        checked={selected.size === trades.length}
                        onChange={toggleAll}
                        style={{ cursor: 'pointer' }}
                      />
                    </th>
                    {['Symbole', 'Dir.', 'Entrée', 'SL', 'TP', 'PnL', 'Résultat', 'Date'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: '#4a4a4a', fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t, i) => {
                    const isSelected = selected.has(i)
                    return (
                      <tr
                        key={i}
                        onClick={() => toggleRow(i)}
                        style={{
                          borderBottom: '1px solid #1a1a1a',
                          background: isSelected ? '#1a1a1a' : 'transparent',
                          cursor: 'pointer',
                          opacity: isSelected ? 1 : 0.4,
                          transition: 'all 0.1s',
                        }}
                      >
                        <td style={{ padding: '8px 12px' }}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleRow(i)} onClick={e => e.stopPropagation()} />
                        </td>
                        <td style={{ padding: '8px 12px', color: '#c8c8c8', fontWeight: 500 }}>{t.symbol}</td>
                        <td style={{ padding: '8px 12px', color: t.direction === 'long' ? '#27ae60' : '#e74c3c', fontWeight: 500 }}>
                          {t.direction === 'long' ? '↑ L' : '↓ S'}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#7a7a7a', fontFamily: 'monospace' }}>
                          {t.entry_price > 0 ? t.entry_price.toFixed(4) : '—'}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#5a5a5a', fontFamily: 'monospace' }}>
                          {t.stop_loss ? t.stop_loss.toFixed(4) : '—'}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#5a5a5a', fontFamily: 'monospace' }}>
                          {t.take_profit_1 ? t.take_profit_1.toFixed(4) : '—'}
                        </td>
                        <td style={{
                          padding: '8px 12px',
                          fontFamily: 'monospace',
                          fontWeight: 600,
                          color: t.pnl > 0 ? '#27ae60' : t.pnl < 0 ? '#e74c3c' : '#6a6a6a',
                        }}>
                          {t.pnl > 0 ? '+' : ''}{t.pnl.toFixed(2)} $
                        </td>
                        <td style={{ padding: '8px 12px', color: '#5a5a5a' }}>
                          {t.result === 'win' ? '✓ Gain' : t.result === 'loss' ? '✗ Perte' : '⊘ Neutre'}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#4a4a4a', fontSize: '11px', whiteSpace: 'nowrap' }}>
                          {t.open_time?.slice(0, 16) ?? '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Résumé + bouton import */}
            <div className="card">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1 text-xs">
                  <div className="text-neutral-400">
                    <span className="font-medium">{selected.size}</span> trades sélectionnés sur {trades.length}
                  </div>
                  {selected.size > 0 && (() => {
                    const sel = trades.filter((_, i) => selected.has(i))
                    const totalPnl = sel.reduce((s, t) => s + t.pnl, 0)
                    const wins = sel.filter(t => t.result === 'win').length
                    const losses = sel.filter(t => t.result === 'loss').length
                    return (
                      <div className="text-neutral-600 space-x-3">
                        <span>{wins}W / {losses}L</span>
                        <span>·</span>
                        <span style={{ color: totalPnl >= 0 ? '#27ae60' : '#e74c3c', fontWeight: 600 }}>
                          {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)} $ net
                        </span>
                      </div>
                    )
                  })()}
                </div>
                <button
                  onClick={runImport}
                  disabled={selected.size === 0 || !accountId}
                  className="btn-primary"
                  style={{ opacity: (selected.size === 0 || !accountId) ? 0.4 : 1 }}
                >
                  Importer {selected.size} trade{selected.size > 1 ? 's' : ''} →
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Étape 3 : Import en cours ── */}
        {step === 'importing' && (
          <div className="card flex flex-col items-center gap-4 py-12">
            <div className="text-2xl animate-pulse">⏳</div>
            <p className="text-sm text-neutral-400">Import en cours…</p>
            <p className="text-xxs text-neutral-600">Ne fermez pas cette page</p>
          </div>
        )}

        {/* ── Étape 4 : Terminé ── */}
        {step === 'done' && importResult && (
          <div className="card">
            <div className="section-title mb-4">Import terminé</div>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-[#1a1a1a] rounded p-4 text-center">
                <div className="text-2xl font-mono text-[#27ae60]">{importResult.ok}</div>
                <div className="text-xxs text-neutral-600 mt-1">Trades importés</div>
              </div>
              {importResult.err > 0 && (
                <div className="bg-[#1a1a1a] rounded p-4 text-center">
                  <div className="text-2xl font-mono text-[#e74c3c]">{importResult.err}</div>
                  <div className="text-xxs text-neutral-600 mt-1">Erreurs</div>
                </div>
              )}
            </div>
            <p className="text-xs text-neutral-600 mb-5">
              Vos trades sont maintenant dans le journal. Utilisez l&rsquo;Export IA pour les analyser en bloc.
            </p>
            <div className="flex gap-3">
              <button onClick={() => router.push('/journal')} className="btn-primary text-xs">
                Voir le journal →
              </button>
              <button
                onClick={() => { setStep('upload'); setTrades([]); setSelected(new Set()); setFileName('') }}
                className="btn-secondary text-xs"
              >
                Importer un autre fichier
              </button>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
