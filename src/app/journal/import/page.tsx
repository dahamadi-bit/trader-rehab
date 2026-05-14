'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Navigation from '@/components/shared/Navigation'
import type { TradingAccount } from '@/types'

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
  volume: number | null
  open_time: string | null
  close_time: string | null
  isDuplicate: boolean
}

interface ColumnMap {
  symbol?: string
  type?: string
  entry_price?: string
  stop_loss?: string
  take_profit?: string
  profit?: string
  commission?: string
  swap?: string
  open_time?: string
  close_time?: string
  volume?: string
}

interface ExistingTrade {
  symbol: string
  created_at: string
}

function findCol(headers: string[], candidates: string[]): string | undefined {
  for (const c of candidates) {
    const found = headers.find(h => h === c || h.includes(c))
    if (found !== undefined) return found
  }
  return undefined
}

function detectFormat(headers: string[]): { format: DetectedFormat; map: ColumnMap } {
  const h = headers.map(s => s.toLowerCase().trim())
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
        swap:        findCol(h, ['swap']),
        open_time:   findCol(h, ['open time', 'opentime']),
        close_time:  findCol(h, ['close time', 'closetime']),
        volume:      findCol(h, ['volume', 'lots']),
      },
    }
  }
  return {
    format: 'generic',
    map: {
      symbol:      findCol(h, ['symbol', 'instrument', 'pair', 'asset']),
      type:        findCol(h, ['type', 'direction', 'side', 'action']),
      entry_price: findCol(h, ['entry', 'price', 'open', 'entry_price']),
      stop_loss:   findCol(h, ['sl', 'stop', 'stoploss']),
      take_profit: findCol(h, ['tp', 'target', 'takeprofit']),
      profit:      findCol(h, ['profit', 'pnl', 'gain']),
      open_time:   findCol(h, ['date', 'time', 'open_time', 'datetime']),
      close_time:  findCol(h, ['close_time', 'close date', 'exit_time']),
      volume:      findCol(h, ['volume', 'size', 'lots', 'quantity']),
    },
  }
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }
  const firstLine = lines[0]
  const delimiter = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ','
  function splitLine(line: string): string[] {
    const result: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { inQuotes = !inQuotes }
      else if (ch === delimiter && !inQuotes) { result.push(cur.trim()); cur = '' }
      else { cur += ch }
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

function parseDateTime(raw: string): string {
  const cleaned = raw.replace(/\./g, '-')
  const d = new Date(cleaned)
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

function parseTrades(
  rows: Record<string, string>[],
  map: ColumnMap,
  headers: string[],
  existing: ExistingTrade[]
): ParsedTrade[] {
  return rows.map(row => {
    const get = (col: string | undefined): string => {
      if (!col) return ''
      return row[col] ?? row[headers.find(h => h.toLowerCase().trim() === col.toLowerCase().trim()) ?? ''] ?? ''
    }
    const rawProfit = parseFloat(get(map.profit)?.replace(',', '.'))    || 0
    const rawComm   = parseFloat(get(map.commission)?.replace(',', '.')) || 0
    const rawSwap   = parseFloat(get(map.swap)?.replace(',', '.'))      || 0
    const totalPnl  = rawProfit + rawComm + rawSwap
    const rawType   = get(map.type)?.toLowerCase().trim() ?? ''
    const direction: Direction = rawType.includes('sell') || rawType === 'short' || rawType === 's' ? 'short' : 'long'
    const result: TradeResult  = totalPnl > 0 ? 'win' : totalPnl < 0 ? 'loss' : 'breakeven'
    const sym      = (get(map.symbol) || 'UNKNOWN').toUpperCase()
    const openTime = get(map.open_time) || null
    let isDuplicate = false
    if (openTime) {
      const importTs = new Date(parseDateTime(openTime)).getTime()
      isDuplicate = existing.some(ex => {
        if (ex.symbol.toUpperCase() !== sym) return false
        return Math.abs(new Date(ex.created_at).getTime() - importTs) < 5 * 60 * 1000
      })
    }
    return {
      symbol:        sym,
      direction,
      entry_price:   parseFloat(get(map.entry_price)?.replace(',', '.'))  || 0,
      stop_loss:     parseFloat(get(map.stop_loss)?.replace(',', '.'))    || null,
      take_profit_1: parseFloat(get(map.take_profit)?.replace(',', '.')) || null,
      pnl:           Math.round(totalPnl * 100) / 100,
      result,
      risk_amount:   Math.abs(totalPnl),
      volume:        parseFloat(get(map.volume)?.replace(',', '.'))       || null,
      open_time:     openTime,
      close_time:    get(map.close_time) || null,
      isDuplicate,
    }
  }).filter(t => t.symbol !== 'UNKNOWN' || t.entry_price > 0)
}

type Step = 'account' | 'upload' | 'preview' | 'importing' | 'done'

export default function ImportPage() {
  const router = useRouter()
  const [step, setStep]               = useState<Step>('account')
  const [dragging, setDragging]       = useState(false)
  const [fileName, setFileName]       = useState('')
  const [format, setFormat]           = useState<DetectedFormat>(null)
  const [columnMap, setColumnMap]     = useState<ColumnMap>({})
  const [allHeaders, setAllHeaders]   = useState<string[]>([])
  const [trades, setTrades]           = useState<ParsedTrade[]>([])
  const [selected, setSelected]       = useState<Set<number>>(new Set())
  const [accounts, setAccounts]       = useState<TradingAccount[]>([])
  const [accountId, setAccountId]     = useState<string>('')
  const [existing, setExisting]       = useState<ExistingTrade[]>([])
  const [importResult, setImportResult] = useState<{ ok: number; err: number; dupes: number } | null>(null)
  const [error, setError]             = useState('')
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      const { data } = await supabase.from('accounts').select('*').eq('user_id', user.id).eq('is_active', true).order('created_at')
      if (data && data.length > 0) {
        setAccounts(data)
        const def = data.find((a: TradingAccount) => a.is_default) ?? data[0]
        setAccountId(def.id)
      }
      setLoadingAccounts(false)
    }
    load()
  }, [router])

  const confirmAccount = useCallback(async () => {
    if (!accountId) return
    const { createClient } = await import('@/lib/supabase')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('trades').select('symbol, created_at').eq('user_id', user.id).eq('account_id', accountId).order('created_at', { ascending: false }).limit(500)
    setExisting(data ?? [])
    setStep('upload')
  }, [accountId])

  function processFile(file: File) {
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
      setError('Format non supporte. Exportez votre historique en .csv depuis votre broker.')
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
      const parsed = parseTrades(rows, map, headers, existing)
      setTrades(parsed)
      setSelected(new Set(parsed.map((t, i) => t.isDuplicate ? -1 : i).filter(i => i >= 0)))
      setStep('preview')
    }
    reader.readAsText(file, 'utf-8')
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  async function runImport() {
    if (!accountId) { setError('Selectionnez un compte.'); return }
    setStep('importing')
    const { createClient } = await import('@/lib/supabase')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Non connecte.'); setStep('preview'); return }
    const account = accounts.find(a => a.id === accountId)
    const toImport = trades.filter((_, i) => selected.has(i))
    const dupesSkipped = trades.filter(t => t.isDuplicate).length
    let ok = 0, err = 0
    for (const t of toImport) {
      const payload = {
        user_id: user.id, account_id: accountId, session_id: null,
        symbol: t.symbol, direction: t.direction,
        entry_price: t.entry_price, stop_loss: t.stop_loss, take_profit_1: t.take_profit_1,
        pnl: t.pnl, result: t.result, risk_amount: t.risk_amount,
        session_type: account?.account_type ?? 'personal',
        market_context: null, plan_justification: null, emotion_before: null,
        ...(t.open_time ? { created_at: parseDateTime(t.open_time) } : {}),
      }
      const { error: insErr } = await supabase.from('trades').insert(payload)
      if (insErr) { err++; console.error('[import]', insErr.message) } else ok++
    }
    if (ok > 0 && account) {
      const totalPnl = toImport.reduce((s, t) => s + t.pnl, 0)
      await supabase.from('accounts').update({ account_balance: account.account_balance + totalPnl }).eq('id', accountId)
    }
    setImportResult({ ok, err, dupes: dupesSkipped })
    setStep('done')
  }

  const nonDupeIndexes = trades.map((t, i) => t.isDuplicate ? -1 : i).filter(i => i >= 0)
  const toggleAll = () => { selected.size === nonDupeIndexes.length ? setSelected(new Set()) : setSelected(new Set(nonDupeIndexes)) }
  const toggleRow = (i: number) => { setSelected(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n }) }

  const selectedAccount = accounts.find(a => a.id === accountId)
  const dupesCount = trades.filter(t => t.isDuplicate).length
  const newCount   = trades.filter(t => !t.isDuplicate).length

  return (
    <div className="flex h-screen overflow-hidden">
      <Navigation />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 space-y-5">

        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/journal')} className="text-neutral-600 hover:text-neutral-300 text-sm transition-colors">
            &larr; Journal
          </button>
          <h1 className="text-base font-medium text-neutral-200">Import CSV Broker</h1>
        </div>

        {error && (
          <div className="px-4 py-3 bg-[#e74c3c]/10 border border-[#e74c3c]/30 rounded text-sm text-[#e74c3c]">{error}</div>
        )}

        {/* STEP 1 — Choisir le journal (compte) */}
        {step === 'account' && (
          <div className="card">
            <div className="section-title mb-1">Choisir le journal</div>
            <p className="text-xs text-neutral-600 mb-5">
              Chaque compte est un journal ind&eacute;pendant. S&eacute;lectionnez celui vers lequel importer les trades du broker.
            </p>
            {loadingAccounts ? (
              <p className="text-xs text-neutral-600">Chargement&hellip;</p>
            ) : accounts.length === 0 ? (
              <div className="space-y-3">
                <p className="text-xs text-neutral-500">Aucun compte configur&eacute;.</p>
                <a href="/accounts" className="btn-primary text-xs inline-block">Cr&eacute;er un compte &rarr;</a>
              </div>
            ) : (
              <div className="space-y-3">
                {accounts.map(acc => {
                  const isSel = accountId === acc.id
                  return (
                    <button key={acc.id} onClick={() => setAccountId(acc.id)} style={{
                      width: '100%', textAlign: 'left', padding: '14px 16px', borderRadius: '8px',
                      border: isSel ? '1px solid #e8e8e8' : '1px solid #2a2a2a',
                      background: isSel ? '#1e1e1e' : '#141414', cursor: 'pointer', transition: 'all 0.15s',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '14px', height: '14px', borderRadius: '50%', flexShrink: 0, border: isSel ? '4px solid #e8e8e8' : '2px solid #4a4a4a' }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '14px', color: isSel ? '#e8e8e8' : '#8a8a8a', fontWeight: isSel ? 600 : 400 }}>{acc.name}</span>
                            <span style={{ fontSize: '12px', fontFamily: 'monospace', color: isSel ? '#e8e8e8' : '#4a4a4a' }}>{acc.account_balance.toLocaleString('fr-FR')} $</span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#4a4a4a', marginTop: '3px' }}>
                            {acc.broker ?? acc.account_type} &middot; {acc.account_type === 'prop_firm' ? 'Prop Firm' : acc.account_type === 'personal' ? 'Personnel' : 'Simulation'}
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
                <button onClick={confirmAccount} disabled={!accountId} className="btn-primary w-full" style={{ marginTop: '8px' }}>
                  Importer dans {selectedAccount?.name ?? '&hellip;'} &rarr;
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 2 — Upload fichier */}
        {step === 'upload' && (
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <div className="section-title">Charger le fichier CSV</div>
              <button onClick={() => setStep('account')} className="text-xxs text-neutral-600 hover:text-neutral-400">&larr; Changer compte</button>
            </div>
            <div className="flex items-center gap-2 mb-5 px-3 py-2 bg-[#1a1a1a] rounded text-xs">
              <span className="text-neutral-600">Journal :</span>
              <span className="text-neutral-300 font-medium">{selectedAccount?.name}</span>
              <span className="text-neutral-600 ml-auto font-mono">{selectedAccount?.account_balance.toLocaleString('fr-FR')} $</span>
            </div>
            <div onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              style={{ border: `2px dashed ${dragging ? '#e8e8e8' : '#2a2a2a'}`, borderRadius: '8px', padding: '48px 24px', textAlign: 'center', cursor: 'pointer', background: dragging ? '#1a1a1a' : 'transparent', transition: 'all 0.15s' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>&#128194;</div>
              <p className="text-sm text-neutral-400">Glissez votre fichier .csv ici</p>
              <p className="text-xxs text-neutral-600 mt-1">ou cliquez pour choisir</p>
              <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f) }} />
            </div>
            <div className="mt-5 space-y-1.5">
              <div className="text-xxs text-neutral-600 uppercase tracking-wider mb-2">Formats support&eacute;s</div>
              {[['FTMO', 'Export .csv depuis le dashboard FTMO (History)'], ['MT4 / MT5', 'Account statement export'], ['G&eacute;n&eacute;rique', 'Tout CSV avec symbol, type, price, profit']].map(([n, d]) => (
                <div key={n} className="flex gap-3 text-xs">
                  <span className="text-neutral-500 font-medium w-20 shrink-0" dangerouslySetInnerHTML={{ __html: n }} />
                  <span className="text-neutral-700" dangerouslySetInnerHTML={{ __html: d }} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 3 — Preview */}
        {step === 'preview' && (
          <>
            <div className="card">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <div className="section-title mb-0.5">{fileName}</div>
                  <div className="text-xxs text-neutral-600">
                    Format&nbsp;: <span className="text-neutral-400 uppercase">{format ?? '&mdash;'}</span>
                    &nbsp;&middot;&nbsp;Journal&nbsp;: <span className="text-neutral-400">{selectedAccount?.name}</span>
                  </div>
                </div>
                <button onClick={() => setStep('upload')} className="btn-secondary text-xs">&larr; Changer fichier</button>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                {([['Total CSV', trades.length, '#7a7a7a'], ['Nouveaux', newCount, '#27ae60'], ['Doublons session', dupesCount, '#e67e22']] as const).map(([label, value, color]) => (
                  <div key={label} className="bg-[#1a1a1a] rounded p-3 text-center">
                    <div style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: 700, color }}>{value}</div>
                    <div className="text-xxs text-neutral-600 mt-1">{label}</div>
                  </div>
                ))}
              </div>

              {dupesCount > 0 && (
                <div className="px-3 py-2 bg-[#e67e22]/10 border border-[#e67e22]/20 rounded text-xxs text-[#e67e22] mb-3">
                  {dupesCount} trade{dupesCount > 1 ? 's' : ''} d&eacute;j&agrave; dans le journal (trades de session avec &eacute;motions) &mdash; d&eacute;coch&eacute;s automatiquement.
                </div>
              )}

              <details className="text-xs text-neutral-600">
                <summary className="cursor-pointer hover:text-neutral-400 transition-colors">Mapping colonnes d&eacute;tect&eacute; &#9660;</summary>
                <div className="mt-2 grid grid-cols-2 gap-1 text-xxs">
                  {Object.entries(columnMap).filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} className="flex gap-2"><span className="text-neutral-600 w-24">{k}</span><span className="text-neutral-400">&rarr; {v}</span></div>
                  ))}
                </div>
              </details>
            </div>

            <div className="card overflow-x-auto p-0">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #2a2a2a', background: '#111' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', color: '#4a4a4a', fontWeight: 500 }}>
                      <input type="checkbox" checked={selected.size === newCount && newCount > 0} onChange={toggleAll} style={{ cursor: 'pointer' }} />
                    </th>
                    {['Symbole', 'Dir.', 'Entrée', 'SL', 'TP', 'PnL', 'Résultat', 'Date', 'Statut'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: '#4a4a4a', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t, i) => {
                    const isSel = selected.has(i)
                    return (
                      <tr key={i} onClick={() => !t.isDuplicate && toggleRow(i)} style={{
                        borderBottom: '1px solid #1a1a1a',
                        background: t.isDuplicate ? '#161210' : isSel ? '#1a1a1a' : 'transparent',
                        cursor: t.isDuplicate ? 'default' : 'pointer',
                        opacity: t.isDuplicate ? 0.4 : isSel ? 1 : 0.5, transition: 'opacity 0.1s',
                      }}>
                        <td style={{ padding: '8px 12px' }}>
                          {t.isDuplicate
                            ? <span style={{ fontSize: '10px', color: '#e67e22' }}>&oslash;</span>
                            : <input type="checkbox" checked={isSel} onChange={() => toggleRow(i)} onClick={e => e.stopPropagation()} />}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#c8c8c8', fontWeight: 500 }}>{t.symbol}</td>
                        <td style={{ padding: '8px 12px', color: t.direction === 'long' ? '#27ae60' : '#e74c3c', fontWeight: 600 }}>{t.direction === 'long' ? '↑ L' : '↓ S'}</td>
                        <td style={{ padding: '8px 12px', color: '#7a7a7a', fontFamily: 'monospace' }}>{t.entry_price > 0 ? t.entry_price.toFixed(4) : '—'}</td>
                        <td style={{ padding: '8px 12px', color: '#5a5a5a', fontFamily: 'monospace' }}>{t.stop_loss ? t.stop_loss.toFixed(4) : '—'}</td>
                        <td style={{ padding: '8px 12px', color: '#5a5a5a', fontFamily: 'monospace' }}>{t.take_profit_1 ? t.take_profit_1.toFixed(4) : '—'}</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 600, color: t.pnl > 0 ? '#27ae60' : t.pnl < 0 ? '#e74c3c' : '#6a6a6a' }}>
                          {t.pnl > 0 ? '+' : ''}{t.pnl.toFixed(2)} $
                        </td>
                        <td style={{ padding: '8px 12px', color: '#5a5a5a' }}>{t.result === 'win' ? '✓' : t.result === 'loss' ? '✗' : '⊘'}</td>
                        <td style={{ padding: '8px 12px', color: '#4a4a4a', fontSize: '11px', whiteSpace: 'nowrap' }}>{t.open_time?.slice(0, 16) ?? '—'}</td>
                        <td style={{ padding: '8px 12px' }}>
                          {t.isDuplicate
                            ? <span style={{ fontSize: '10px', color: '#e67e22', background: '#e67e2215', padding: '2px 6px', borderRadius: '4px' }}>session</span>
                            : <span style={{ fontSize: '10px', color: '#27ae60', background: '#27ae6015', padding: '2px 6px', borderRadius: '4px' }}>nouveau</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="card">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1 text-xs">
                  <div className="text-neutral-400"><span className="font-medium">{selected.size}</span> trades &agrave; importer</div>
                  {selected.size > 0 && (() => {
                    const sel = trades.filter((_, i) => selected.has(i))
                    const totalPnl = sel.reduce((s, t) => s + t.pnl, 0)
                    const wins = sel.filter(t => t.result === 'win').length
                    const losses = sel.filter(t => t.result === 'loss').length
                    return (
                      <div className="text-neutral-600 space-x-3">
                        <span>{wins}W / {losses}L</span><span>&middot;</span>
                        <span style={{ color: totalPnl >= 0 ? '#27ae60' : '#e74c3c', fontWeight: 600 }}>{totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)} $ net</span>
                      </div>
                    )
                  })()}
                </div>
                <button onClick={runImport} disabled={selected.size === 0} className="btn-primary" style={{ opacity: selected.size === 0 ? 0.4 : 1 }}>
                  Importer {selected.size} trade{selected.size > 1 ? 's' : ''} &rarr;
                </button>
              </div>
            </div>
          </>
        )}

        {/* STEP — Import en cours */}
        {step === 'importing' && (
          <div className="card flex flex-col items-center gap-4 py-14">
            <div className="text-3xl animate-pulse">&#9203;</div>
            <p className="text-sm text-neutral-400">Import en cours&hellip;</p>
            <p className="text-xxs text-neutral-600">Ne fermez pas cette page</p>
          </div>
        )}

        {/* STEP — Terminé */}
        {step === 'done' && importResult && (
          <div className="card">
            <div className="section-title mb-5">Import terminé</div>
            <div className="grid grid-cols-3 gap-3 mb-6">
              {([['Importés', importResult.ok, '#27ae60'], ['Doublons ignorés', importResult.dupes, '#e67e22'], ['Erreurs', importResult.err, '#e74c3c']] as const).map(([label, value, color]) =>
                value > 0 || label === 'Importés' ? (
                  <div key={label} className="bg-[#1a1a1a] rounded p-4 text-center">
                    <div style={{ fontSize: '24px', fontFamily: 'monospace', fontWeight: 700, color }}>{value}</div>
                    <div className="text-xxs text-neutral-600 mt-1">{label}</div>
                  </div>
                ) : null
              )}
            </div>
            <p className="text-xs text-neutral-600 mb-5">
              Journal <strong className="text-neutral-400">{selectedAccount?.name}</strong> mis &agrave; jour. Utilisez l&rsquo;Export IA pour analyser la semaine en bloc.
            </p>
            <div className="flex gap-3 flex-wrap">
              <button onClick={() => router.push('/journal')} className="btn-primary text-xs">Voir le journal &rarr;</button>
              <button onClick={() => { setStep('upload'); setTrades([]); setSelected(new Set()); setFileName('') }} className="btn-secondary text-xs">Importer un autre fichier</button>
              <button onClick={() => setStep('account')} className="btn-secondary text-xs">Changer de compte</button>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
