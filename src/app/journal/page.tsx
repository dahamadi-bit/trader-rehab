'use client'

/**
 * Journal de Trading Thérapeutique
 *
 * Vue liste des trades + statistiques comportementales.
 * Graphiques : violations, émotions, score discipline, drawdown psychologique.
 *
 * Objectif : donner une vue objective sur les patterns comportementaux.
 * Pas de jugement. Que des données.
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import { clsx } from 'clsx'
import Navigation from '@/components/shared/Navigation'
import { calculateDisciplineScore, interpretDisciplineScore } from '@/lib/discipline-score'
import type { Trade, TradingAccount } from '@/types'

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================

export default function JournalPage() {
  const router = useRouter()
  const [trades, setTrades] = useState<Trade[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'list' | 'analytics' | 'export'>('list')
  const [filter, setFilter] = useState<'all' | 'win' | 'loss' | 'violation'>('all')
  const [accounts, setAccounts] = useState<TradingAccount[]>([])

  useEffect(() => {
    async function load() {
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const [tradesRes, accountsRes] = await Promise.all([
        supabase
          .from('trades')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('accounts')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('created_at'),
      ])

      setTrades(tradesRes.data ?? [])
      setAccounts(accountsRes.data ?? [])
      setIsLoading(false)
    }
    load()
  }, [router])

  const filteredTrades = trades.filter(t => {
    if (filter === 'win')       return t.result === 'win'
    if (filter === 'loss')      return t.result === 'loss'
    if (filter === 'violation') return !t.plan_respected || t.stop_moved || (t.revenge_flags?.length ?? 0) > 0
    return true
  })

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
      <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-base font-medium text-neutral-200">Journal de trading</h1>
          <Link href="/journal/new" className="btn-primary text-xs">
            + Ajouter trade
          </Link>
        </div>

        {/* Onglets */}
        <div className="flex gap-1 bg-[#141414] rounded p-1 w-fit">
          {([['list', 'Trades'], ['analytics', 'Analyse comportementale'], ['export', 'Export IA']] as const).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={clsx(
                'text-xs px-3 py-1.5 rounded transition-colors',
                activeTab === tab
                  ? 'bg-[#2a2a2a] text-neutral-200'
                  : 'text-neutral-500 hover:text-neutral-300'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'list' ? (
          <TradesList trades={filteredTrades} allTrades={trades} filter={filter} onFilterChange={setFilter} />
        ) : activeTab === 'analytics' ? (
          <BehavioralAnalytics trades={trades} />
        ) : (
          <ExportIA accounts={accounts} />
        )}

      </main>
    </div>
  )
}

// ============================================================
// LISTE DES TRADES
// ============================================================

function TradesList({
  trades, allTrades, filter, onFilterChange
}: {
  trades: Trade[]
  allTrades: Trade[]
  filter: string
  onFilterChange: (f: 'all' | 'win' | 'loss' | 'violation') => void
}) {
  const stats = {
    total:      allTrades.length,
    wins:       allTrades.filter(t => t.result === 'win').length,
    losses:     allTrades.filter(t => t.result === 'loss').length,
    violations: allTrades.filter(t => !t.plan_respected || t.stop_moved).length,
    winRate:    allTrades.length > 0
      ? Math.round(allTrades.filter(t => t.result === 'win').length / allTrades.filter(t => t.result !== 'open').length * 100)
      : 0,
  }

  return (
    <div className="space-y-4">
      {/* Statistiques rapides */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3">
        {[
          { label: 'Trades', value: stats.total },
          { label: 'Gains',  value: stats.wins },
          { label: 'Pertes', value: stats.losses },
          { label: 'Win rate', value: `${stats.winRate}%` },
          { label: 'Violations', value: stats.violations },
        ].map(({ label, value }) => (
          <div key={label} className="card py-3">
            <div className="text-xxs text-neutral-600 uppercase tracking-wider">{label}</div>
            <div className="text-xl font-mono text-neutral-300 mt-1">{value}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex gap-2">
        {([['all', 'Tous'], ['win', 'Gains'], ['loss', 'Pertes'], ['violation', 'Violations']] as const).map(([f, label]) => (
          <button
            key={f}
            onClick={() => onFilterChange(f)}
            className={clsx(
              'text-xs px-3 py-1 rounded border transition-colors',
              filter === f
                ? 'border-neutral-500 text-neutral-200'
                : 'border-[#2a2a2a] text-neutral-600 hover:text-neutral-400'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Liste */}
      {trades.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-neutral-600 text-sm">Aucun trade enregistré.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {trades.map(trade => <TradeRow key={trade.id} trade={trade} />)}
        </div>
      )}
    </div>
  )
}

function TradeRow({ trade }: { trade: Trade }) {
  const hasViolation = !trade.plan_respected || trade.stop_moved || (trade.revenge_flags?.length ?? 0) > 0

  return (
    <Link href={`/journal/${trade.id}`} className="block">
      <div className={clsx(
        'card hover:bg-[#1a1a1a] transition-colors cursor-pointer',
        hasViolation && 'border-l-2 border-l-[#e67e22]'
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Direction */}
            <span className={clsx(
              'text-xs font-mono uppercase tracking-wider px-2 py-0.5 rounded-sm',
              trade.direction === 'long'
                ? 'bg-neutral-700/30 text-neutral-400'
                : 'bg-neutral-700/30 text-neutral-400'
            )}>
              {trade.direction ?? '—'}
            </span>

            {/* Instrument */}
            <span className="text-sm text-neutral-200">{trade.symbol}</span>

            {/* Setup */}
            {trade.setup_name && (
              <span className="text-xs text-neutral-600">{trade.setup_name}</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 justify-end">
            {/* PnL */}
            <span className={clsx(
              'text-sm font-mono',
              trade.pnl === null ? 'text-neutral-600' :
              trade.pnl > 0 ? 'text-neutral-300' : 'text-neutral-500'
            )}>
              {trade.pnl !== null ? `${trade.pnl > 0 ? '+' : ''}${trade.pnl.toFixed(2)} $` : '—'}
            </span>

            {/* Résultat */}
            {trade.result && trade.result !== 'open' && (
              <span className={clsx(
                'text-xxs uppercase tracking-wider px-2 py-0.5 rounded-sm',
                trade.result === 'win'       ? 'bg-neutral-700/30 text-neutral-400' :
                trade.result === 'loss'      ? 'bg-neutral-700/30 text-neutral-500' :
                'bg-neutral-700/30 text-neutral-600'
              )}>
                {trade.result}
              </span>
            )}

            {/* Badges violations — détaillés */}
            {trade.plan_respected === false && (
              <span className="badge bg-[#e67e22]/10 text-[#e67e22]">plan violé</span>
            )}
            {trade.stop_moved && (
              <span className="badge bg-[#e67e22]/10 text-[#e67e22]">stop déplacé</span>
            )}
            {(trade.revenge_flags?.length ?? 0) > 0 && (
              <span className="badge bg-[#e74c3c]/10 text-[#e74c3c]">revenge</span>
            )}

            {/* Date */}
            <span className="hidden sm:inline text-xxs text-neutral-700">
              {new Date(trade.created_at).toLocaleDateString('fr-FR')}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

// ============================================================
// ANALYSE COMPORTEMENTALE — GRAPHIQUES
// ============================================================

function BehavioralAnalytics({ trades }: { trades: Trade[] }) {
  if (trades.length < 3) {
    return (
      <div className="card text-center py-10">
        <p className="text-neutral-600 text-sm">
          Minimum 3 trades requis pour l&rsquo;analyse comportementale.
        </p>
      </div>
    )
  }

  // Données pour le graphique PnL cumulatif
  const pnlData = trades
    .filter(t => t.pnl !== null)
    .reverse()
    .reduce<Array<{ index: number; cumPnl: number; result: string }>>((acc, t, i) => {
      const prev = acc[i - 1]?.cumPnl ?? 0
      acc.push({ index: i + 1, cumPnl: prev + (t.pnl ?? 0), result: t.result ?? '' })
      return acc
    }, [])

  // Données violations par semaine
  const violationsByEmotion = ['calm', 'excited', 'fearful', 'uncertain', 'frustrated', 'overconfident']
    .map(emotion => ({
      emotion: emotion.slice(0, 5),
      trades:     trades.filter(t => t.emotion_before === emotion).length,
      violations: trades.filter(t => t.emotion_before === emotion && (!t.plan_respected || t.stop_moved)).length,
    }))
    .filter(d => d.trades > 0)

  // Score discipline
  const scoreBreakdown = calculateDisciplineScore({
    trades,
    journalDaysLast30: Math.min(trades.length, 30),
    checkinDaysLast30: 20,
    routineLogs: [],
    violations: {
      revengeDetections: trades.filter(t => (t.revenge_flags?.length ?? 0) > 0).length,
      forcedSessionCloses: 0,
      planViolations: trades.filter(t => !t.plan_respected).length,
      stopMovements: trades.filter(t => t.stop_moved).length,
    },
  })
  const interpretation = interpretDisciplineScore(scoreBreakdown.total)

  // Erreurs récurrentes
  const errorCounts = trades
    .filter(t => t.main_error && t.main_error !== 'none')
    .reduce<Record<string, number>>((acc, t) => {
      const e = t.main_error!
      acc[e] = (acc[e] ?? 0) + 1
      return acc
    }, {})

  return (
    <div className="space-y-5">
      {/* Score discipline */}
      <div className="card">
        <div className="section-title mb-4">Score de discipline</div>
        <div className="flex items-center gap-6 mb-5">
          <div className="text-5xl font-mono font-medium text-neutral-200">
            {scoreBreakdown.total}
          </div>
          <div>
            <div className="text-sm text-neutral-400">{interpretation.label}</div>
            <div className="text-xs text-neutral-600 mt-0.5 max-w-sm leading-relaxed">
              {interpretation.description}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {[
            { label: 'Plan',       value: scoreBreakdown.planCompliance,   max: 30 },
            { label: 'Émotions',   value: scoreBreakdown.emotionalControl, max: 25 },
            { label: 'Risque',     value: scoreBreakdown.riskManagement,   max: 20 },
            { label: 'Régularité', value: scoreBreakdown.consistency,      max: 15 },
            { label: 'Vie',        value: scoreBreakdown.lifeRoutine,      max: 10 },
          ].map(({ label, value, max }) => (
            <div key={label} className="bg-[#1a1a1a] rounded p-3">
              <div className="text-xxs text-neutral-600 uppercase tracking-wider mb-1">{label}</div>
              <div className="text-sm font-mono text-neutral-300">{value}/{max}</div>
              <div className="mt-1.5 h-0.5 bg-[#2a2a2a] rounded">
                <div
                  className="h-0.5 bg-neutral-500 rounded transition-all duration-slow"
                  style={{ width: `${(value / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        {scoreBreakdown.penalties > 0 && (
          <div className="mt-3 text-xs text-neutral-600">
            Pénalités violations : −{scoreBreakdown.penalties} pts
          </div>
        )}
      </div>

      {/* PnL cumulatif */}
      <div className="card">
        <div className="section-title mb-4">PnL cumulatif</div>
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={pnlData}>
            <XAxis dataKey="index" tick={{ fontSize: 10, fill: '#4a4a4a' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#4a4a4a' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 4, fontSize: 11 }}
              formatter={(v: unknown) => [`${(v as number).toFixed(2)} $`, 'PnL cumulé']}
            />
            <Line
              type="monotone" dataKey="cumPnl"
              stroke="#4a4a4a" strokeWidth={1.5}
              dot={false} activeDot={{ r: 3, fill: '#9b9b9b' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Violations par émotion */}
      <div className="card">
        <div className="section-title mb-4">Violations par état émotionnel</div>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={violationsByEmotion} barSize={20}>
            <XAxis dataKey="emotion" tick={{ fontSize: 10, fill: '#4a4a4a' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#4a4a4a' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 4, fontSize: 11 }}
            />
            <Bar dataKey="trades" fill="#2a2a2a" name="Trades totaux" />
            <Bar dataKey="violations" name="Violations">
              {violationsByEmotion.map((_, i) => (
                <Cell key={i} fill="#3a3a3a" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xxs text-neutral-700 mt-2">
          Gris foncé = violations. Gris clair = trades totaux.
        </p>
      </div>

      {/* Erreurs récurrentes */}
      {Object.keys(errorCounts).length > 0 && (
        <div className="card">
          <div className="section-title mb-3">Erreurs récurrentes</div>
          <div className="space-y-2">
            {Object.entries(errorCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([error, count]) => (
                <div key={error} className="flex items-center gap-3">
                  <div className="text-xs text-neutral-400 w-28 capitalize">{error.replace('_', ' ')}</div>
                  <div className="flex-1 h-1 bg-[#1a1a1a] rounded">
                    <div
                      className="h-1 bg-neutral-600 rounded"
                      style={{ width: `${(count / trades.length) * 100}%` }}
                    />
                  </div>
                  <div className="text-xs font-mono text-neutral-500">{count}</div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// EXPORT IA — Rapport groupé pour analyse comportementale
// ============================================================

function ExportIA({ accounts }: { accounts: TradingAccount[] }) {
  const [accountId, setAccountId] = useState<string>('all')
  const [period, setPeriod] = useState<'week' | 'lastweek' | 'month' | 'lastmonth' | 'custom'>('week')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [exportTrades, setExportTrades] = useState<Trade[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [exportText, setExportText] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [hasGenerated, setHasGenerated] = useState(false)

  function getPeriodDates(): { from: Date; to: Date; label: string } {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    if (period === 'week') {
      const dow = today.getDay()
      const offset = dow === 0 ? -6 : 1 - dow
      const monday = new Date(today)
      monday.setDate(today.getDate() + offset)
      return { from: monday, to: new Date(), label: 'Cette semaine' }
    }
    if (period === 'lastweek') {
      const dow = today.getDay()
      const offset = dow === 0 ? -6 : 1 - dow
      const thisMonday = new Date(today)
      thisMonday.setDate(today.getDate() + offset)
      const lastMonday = new Date(thisMonday)
      lastMonday.setDate(thisMonday.getDate() - 7)
      const lastSunday = new Date(thisMonday)
      lastSunday.setDate(thisMonday.getDate() - 1)
      lastSunday.setHours(23, 59, 59, 999)
      return { from: lastMonday, to: lastSunday, label: 'Semaine dernière' }
    }
    if (period === 'month') {
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(), label: 'Ce mois' }
    }
    if (period === 'lastmonth') {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
      return { from: first, to: last, label: 'Mois dernier' }
    }
    // custom
    const from = dateFrom ? new Date(dateFrom) : new Date(today.getFullYear(), today.getMonth(), 1)
    const to = dateTo ? new Date(dateTo + 'T23:59:59') : new Date()
    return { from, to, label: `${from.toLocaleDateString('fr-FR')} → ${to.toLocaleDateString('fr-FR')}` }
  }

  async function generate() {
    setIsLoading(true)
    setHasGenerated(false)
    const { createClient } = await import('@/lib/supabase')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setIsLoading(false); return }

    const { from, to } = getPeriodDates()

    const baseQuery = supabase
      .from('trades')
      .select('*')
      .eq('user_id', user.id)
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString())
      .order('created_at', { ascending: true })

    const { data } = accountId !== 'all'
      ? await baseQuery.eq('account_id', accountId)
      : await baseQuery
    const loaded: Trade[] = (data ?? []).filter((t: Trade) => t.result && t.result !== 'open')
    setExportTrades(loaded)
    buildText(loaded, from, to)
    setIsLoading(false)
    setHasGenerated(true)
  }

  function buildText(trades: Trade[], from: Date, to: Date) {
    const accountLabel = accountId === 'all'
      ? 'Tous les comptes'
      : (accounts.find(a => a.id === accountId)?.name ?? accountId)

    const wins = trades.filter(t => t.result === 'win').length
    const losses = trades.filter(t => t.result === 'loss').length
    const pnlTotal = trades.reduce((s, t) => s + (t.pnl ?? 0), 0)
    const winRate = trades.length > 0 ? Math.round((wins / trades.length) * 100) : 0
    const violations = trades.filter(t => !t.plan_respected || t.stop_moved || (t.revenge_flags?.length ?? 0) > 0).length

    const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

    let txt = `RAPPORT TRADING — ${fmt(from)} → ${fmt(to)}
`
    txt += `Compte : ${accountLabel}
`
    txt += `${'═'.repeat(48)}

`
    txt += `RÉSUMÉ
`
    txt += `  Trades clôturés : ${trades.length} (${wins} gains · ${losses} pertes · Win rate ${winRate}%)
`
    txt += `  PnL total       : ${pnlTotal >= 0 ? '+' : ''}${pnlTotal.toFixed(2)} $
`
    txt += `  Violations      : ${violations} trade${violations !== 1 ? 's' : ''}

`
    txt += `${'─'.repeat(48)}

`

    trades.forEach((t, i) => {
      const date = new Date(t.created_at).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
      const resLabel = t.result === 'win' ? '✓ GAIN' : t.result === 'loss' ? '✗ PERTE' : '= NEUTRE'
      const pnlStr = t.pnl !== null ? `${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)} $` : 'N/R'

      txt += `TRADE ${i + 1} — ${t.symbol} ${(t.direction ?? '').toUpperCase()} — ${date} — ${resLabel} ${pnlStr}
`
      if (t.setup_name)        txt += `  Setup      : ${t.setup_name}
`
      if (t.market_context)    txt += `  Contexte   : ${t.market_context}
`
      if (t.plan_justification) txt += `  Justif.    : ${t.plan_justification}
`
      if (t.entry_price)       txt += `  Niveaux    : Entrée ${t.entry_price} | SL ${t.stop_loss ?? 'N/R'} | TP ${t.take_profit_1 ?? 'N/R'} | Risque ${t.risk_amount ?? 'N/R'} $
`
      if (t.emotion_before)    txt += `  Émotion    : ${t.emotion_before}${t.confidence_level ? ` | Confiance ${t.confidence_level}/10` : ''}
`

      const planOk = t.plan_respected === true ? 'Oui' : t.plan_respected === false ? 'Non ⚠' : 'N/R'
      txt += `  Plan resp. : ${planOk} | Stop déplacé : ${t.stop_moved ? `Oui — ${t.stop_moved_reason ?? ''}` : 'Non'}
`

      if (t.main_error && t.main_error !== 'none') txt += `  Erreur     : ${t.main_error}
`
      if (t.execution_quality) txt += `  Exec.      : ${t.execution_quality}/10
`
      if (t.behavioral_notes)  txt += `  Notes      : ${t.behavioral_notes}
`
      if ((t.revenge_flags?.length ?? 0) > 0) txt += `  ⚠ Revenge : ${t.revenge_flags?.join(', ')}
`
      txt += `
`
    })

    txt += `${'─'.repeat(48)}

`
    txt += `QUESTIONS POUR L'ANALYSE IA :
`
    txt += `1. Quels sont les patterns comportementaux dominants sur cette période ?
`
    txt += `2. Y a-t-il une corrélation émotion → violations / pertes ?
`
    txt += `3. Quels setups ont le mieux et le moins bien performé, et pourquoi ?
`
    txt += `4. Quel profil psychologique ressort (impulsivité, peur, surconfiance…) ?
`
    txt += `5. Donne 3 recommandations prioritaires et actionnables pour la semaine suivante.
`
    txt += `
Sois factuel, précis, non culpabilisant. Base-toi uniquement sur les données ci-dessus.
`

    setExportText(txt)
  }

  function copyAll() {
    if (!exportText) return
    navigator.clipboard.writeText(exportText)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="card space-y-4">
        <div className="section-title">Paramètres du rapport</div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="field-label">Période</label>
            <select
              value={period}
              onChange={e => setPeriod(e.target.value as typeof period)}
              className="input-field"
            >
              <option value="week">Cette semaine (lun → aujourd&apos;hui)</option>
              <option value="lastweek">Semaine dernière (lun → dim)</option>
              <option value="month">Ce mois</option>
              <option value="lastmonth">Mois dernier</option>
              <option value="custom">Personnalisé</option>
            </select>
          </div>
          <div>
            <label className="field-label">Compte</label>
            <select
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              className="input-field"
            >
              <option value="all">Tous les comptes</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.account_type === 'prop_firm' ? 'Prop Firm' : a.account_type === 'personal' ? 'Personnel' : 'Simulation'})
                </option>
              ))}
            </select>
          </div>
        </div>

        {period === 'custom' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="field-label">Du</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="input-field font-mono text-xs"
              />
            </div>
            <div>
              <label className="field-label">Au</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="input-field font-mono text-xs"
              />
            </div>
          </div>
        )}

        <button
          onClick={generate}
          disabled={isLoading}
          className="btn-primary w-full"
        >
          {isLoading ? 'Chargement…' : 'Générer le rapport'}
        </button>
      </div>

      {/* Rapport généré */}
      {hasGenerated && (
        <div className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="section-title">
              {exportTrades.length} trade{exportTrades.length !== 1 ? 's' : ''} — prêt à coller dans Claude
            </div>
            <button onClick={copyAll} className="btn-secondary text-xs">
              {copied ? '✓ Copié !' : 'Copier tout'}
            </button>
          </div>

          {exportTrades.length === 0 ? (
            <p className="text-xs text-neutral-600">Aucun trade clôturé sur cette période pour ce compte.</p>
          ) : (
            <pre className="text-xs text-neutral-500 leading-relaxed whitespace-pre-wrap font-mono bg-[#0d0d0d] rounded p-4 max-h-[480px] overflow-y-auto border border-[#2a2a2a]">
              {exportText}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
