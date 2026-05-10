'use client'

/**
 * Gestion des comptes de trading
 * Prop firm, personnel (Oanda, etc.), simulation
 * Chaque compte a ses propres paramètres de risque
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { clsx } from 'clsx'
import Navigation from '@/components/shared/Navigation'
import type { TradingAccount, AccountType } from '@/types'

interface AccountFormData {
  name: string
  broker: string
  account_type: AccountType
  account_balance: number
  starting_balance: number
  drawdown_floor: number
  max_risk_per_trade: number
  max_risk_per_day: number
  min_rr_ratio: number
  max_trades_per_session: number
  max_consecutive_losses: number
  notes: string
}

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  prop_firm:  'Prop Firm',
  personal:   'Personnel',
  simulation: 'Simulation',
}

const PRESETS: Record<AccountType, Partial<AccountFormData>> = {
  prop_firm: {
    max_risk_per_trade:    0.005,
    max_risk_per_day:      0.01,
    min_rr_ratio:          1.5,
    max_trades_per_session: 2,
    max_consecutive_losses: 2,
  },
  personal: {
    max_risk_per_trade:    0.01,
    max_risk_per_day:      0.02,
    min_rr_ratio:          1.5,
    max_trades_per_session: 3,
    max_consecutive_losses: 3,
  },
  simulation: {
    max_risk_per_trade:    0.01,
    max_risk_per_day:      0.05,
    min_rr_ratio:          1.0,
    max_trades_per_session: 5,
    max_consecutive_losses: 5,
  },
}

export default function AccountsPage() {
  const router = useRouter()
  const [accounts, setAccounts] = useState<TradingAccount[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<AccountFormData>({
    defaultValues: {
      account_type:           'prop_firm',
      account_balance:        10000,
      starting_balance:       10000,
      drawdown_floor:         9000,
      max_risk_per_trade:     0.005,
      max_risk_per_day:       0.01,
      min_rr_ratio:           1.5,
      max_trades_per_session: 2,
      max_consecutive_losses: 2,
    },
  })

  const accountType = watch('account_type')

  useEffect(() => {
    async function load() {
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const { data } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })

      setAccounts(data ?? [])
      setIsLoading(false)
    }
    load()
  }, [router])

  // Appliquer preset quand le type change
  function applyPreset(type: AccountType) {
    const preset = PRESETS[type]
    Object.entries(preset).forEach(([key, value]) => {
      setValue(key as keyof AccountFormData, value as never)
    })
  }

  function openNewForm() {
    reset({
      account_type:           'prop_firm',
      account_balance:        10000,
      starting_balance:       10000,
      drawdown_floor:         9000,
      max_risk_per_trade:     0.005,
      max_risk_per_day:       0.01,
      min_rr_ratio:           1.5,
      max_trades_per_session: 2,
      max_consecutive_losses: 2,
    })
    setEditingId(null)
    setShowForm(true)
  }

  function openEditForm(account: TradingAccount) {
    reset({
      name:                   account.name,
      broker:                 account.broker ?? '',
      account_type:           account.account_type,
      account_balance:        account.account_balance,
      starting_balance:       account.starting_balance,
      drawdown_floor:         account.drawdown_floor ?? 0,
      max_risk_per_trade:     account.max_risk_per_trade,
      max_risk_per_day:       account.max_risk_per_day,
      min_rr_ratio:           account.min_rr_ratio,
      max_trades_per_session: account.max_trades_per_session,
      max_consecutive_losses: account.max_consecutive_losses,
      notes:                  account.notes ?? '',
    })
    setEditingId(account.id)
    setShowForm(true)
  }

  async function onSubmit(data: AccountFormData) {
    setSaving(true)
    const { createClient } = await import('@/lib/supabase')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const payload = {
      user_id:                user.id,
      name:                   data.name,
      broker:                 data.broker || null,
      account_type:           data.account_type,
      account_balance:        data.account_balance,
      starting_balance:       data.starting_balance,
      drawdown_floor:         data.drawdown_floor || null,
      max_risk_per_trade:     data.max_risk_per_trade,
      max_risk_per_day:       data.max_risk_per_day,
      min_rr_ratio:           data.min_rr_ratio,
      max_trades_per_session: data.max_trades_per_session,
      max_consecutive_losses: data.max_consecutive_losses,
      notes:                  data.notes || null,
    }

    if (editingId) {
      const { data: updated } = await supabase
        .from('accounts')
        .update(payload)
        .eq('id', editingId)
        .select()
        .single()
      if (updated) {
        setAccounts(prev => prev.map(a => a.id === editingId ? updated : a))
      }
    } else {
      const isFirst = accounts.length === 0
      const { data: created } = await supabase
        .from('accounts')
        .insert({ ...payload, is_default: isFirst })
        .select()
        .single()
      if (created) {
        setAccounts(prev => [...prev, created])
      }
    }

    setSaving(false)
    setShowForm(false)
    setEditingId(null)
  }

  async function setDefault(accountId: string) {
    const { createClient } = await import('@/lib/supabase')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Retirer default des autres
    await supabase
      .from('accounts')
      .update({ is_default: false })
      .eq('user_id', user.id)

    // Définir le nouveau default
    await supabase
      .from('accounts')
      .update({ is_default: true })
      .eq('id', accountId)

    setAccounts(prev => prev.map(a => ({ ...a, is_default: a.id === accountId })))
  }

  async function toggleActive(account: TradingAccount) {
    const { createClient } = await import('@/lib/supabase')
    const supabase = createClient()
    await supabase
      .from('accounts')
      .update({ is_active: !account.is_active })
      .eq('id', account.id)
    setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, is_active: !a.is_active } : a))
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
          <div>
            <h1 className="text-base font-medium text-neutral-200">Comptes de trading</h1>
            <p className="text-xs text-neutral-600 mt-0.5">Prop firm, personnel, simulation — paramètres indépendants</p>
          </div>
          <button onClick={openNewForm} className="btn-primary text-xs">
            + Ajouter un compte
          </button>
        </div>

        {/* Liste des comptes */}
        {accounts.length === 0 && !showForm && (
          <div className="card text-center py-10">
            <p className="text-sm text-neutral-600 mb-4">Aucun compte configuré.</p>
            <button onClick={openNewForm} className="btn-secondary text-xs">
              Créer mon premier compte
            </button>
          </div>
        )}

        <div className="space-y-3">
          {accounts.map(account => (
            <div
              key={account.id}
              className={clsx(
                'card',
                !account.is_active && 'opacity-50',
                account.is_default && 'border-neutral-600'
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-neutral-200">{account.name}</span>
                    {account.is_default && (
                      <span className="badge bg-neutral-800 text-neutral-400">Par défaut</span>
                    )}
                    <span className={clsx(
                      'badge',
                      account.account_type === 'prop_firm'  ? 'bg-[#1a1a2e] text-blue-400' :
                      account.account_type === 'personal'   ? 'bg-[#1a2a1a] text-green-400' :
                                                              'bg-[#1a1a1a] text-neutral-500'
                    )}>
                      {ACCOUNT_TYPE_LABELS[account.account_type]}
                    </span>
                    {account.broker && (
                      <span className="text-xs text-neutral-600">{account.broker}</span>
                    )}
                  </div>

                  {/* Métriques clés */}
                  <div className="grid grid-cols-4 gap-3 mt-3">
                    {[
                      { label: 'Solde',         value: `${account.account_balance.toLocaleString('fr-FR')} $` },
                      { label: 'Risque/trade',  value: `${(account.max_risk_per_trade * 100).toFixed(1)}%` },
                      { label: 'Max trades',    value: `${account.max_trades_per_session}/session` },
                      { label: 'Pertes max',    value: `${account.max_consecutive_losses} consec.` },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-[#1a1a1a] rounded p-2">
                        <div className="text-xxs text-neutral-600 mb-0.5">{label}</div>
                        <div className="text-xs font-mono text-neutral-400">{value}</div>
                      </div>
                    ))}
                  </div>

                  {account.drawdown_floor && (
                    <div className="mt-2 text-xs text-neutral-700">
                      Plancher drawdown : {account.drawdown_floor.toLocaleString('fr-FR')} $
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 ml-4 shrink-0">
                  <button
                    onClick={() => openEditForm(account)}
                    className="text-xxs text-neutral-600 hover:text-neutral-400 text-right"
                  >
                    Modifier
                  </button>
                  {!account.is_default && (
                    <button
                      onClick={() => setDefault(account.id)}
                      className="text-xxs text-neutral-600 hover:text-neutral-400 text-right"
                    >
                      Définir défaut
                    </button>
                  )}
                  <button
                    onClick={() => toggleActive(account)}
                    className="text-xxs text-neutral-600 hover:text-neutral-400 text-right"
                  >
                    {account.is_active ? 'Désactiver' : 'Activer'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Formulaire */}
        {showForm && (
          <div className="card animate-slide-up">
            <div className="section-title mb-5">
              {editingId ? 'Modifier le compte' : 'Nouveau compte'}
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

              {/* Identification */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Nom du compte *</label>
                  <input
                    {...register('name', { required: true })}
                    placeholder="FTMO 100K, Oanda Personnel…"
                    className="input-field"
                  />
                  {errors.name && <p className="text-xxs text-[#e74c3c] mt-1">Nom requis</p>}
                </div>
                <div>
                  <label className="field-label">Broker</label>
                  <input
                    {...register('broker')}
                    placeholder="FTMO, Oanda, Darwinex…"
                    className="input-field"
                  />
                </div>
              </div>

              {/* Type */}
              <div>
                <label className="field-label">Type de compte</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['prop_firm', 'personal', 'simulation'] as AccountType[]).map(type => (
                    <label
                      key={type}
                      className={clsx(
                        'flex flex-col items-center justify-center p-3 rounded border cursor-pointer transition-colors text-center',
                        accountType === type
                          ? 'border-neutral-500 bg-[#1a1a1a] text-neutral-200'
                          : 'border-[#2a2a2a] text-neutral-600 hover:border-neutral-600'
                      )}
                    >
                      <input
                        type="radio"
                        {...register('account_type')}
                        value={type}
                        className="sr-only"
                        onChange={() => {
                          setValue('account_type', type)
                          applyPreset(type)
                        }}
                      />
                      <span className="text-sm font-medium">{ACCOUNT_TYPE_LABELS[type]}</span>
                      <span className="text-xxs mt-0.5">
                        {type === 'prop_firm'  ? 'Challenge / évaluation' :
                         type === 'personal'   ? 'Capital réel' :
                                                 'Entraînement'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Capital */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="field-label">Solde actuel ($)</label>
                  <input
                    {...register('account_balance', { valueAsNumber: true, required: true })}
                    type="number" step="100"
                    className="input-field font-mono"
                  />
                </div>
                <div>
                  <label className="field-label">Capital initial ($)</label>
                  <input
                    {...register('starting_balance', { valueAsNumber: true, required: true })}
                    type="number" step="100"
                    className="input-field font-mono"
                  />
                </div>
                <div>
                  <label className="field-label">Plancher drawdown ($)</label>
                  <input
                    {...register('drawdown_floor', { valueAsNumber: true })}
                    type="number" step="100"
                    placeholder="0 = aucun"
                    className="input-field font-mono"
                  />
                </div>
              </div>

              <div className="divider" />
              <div className="section-title">Règles de risque</div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Risque max / trade (%)</label>
                  <input
                    {...register('max_risk_per_trade', { valueAsNumber: true, required: true })}
                    type="number" step="0.001" min="0.001" max="0.1"
                    className="input-field font-mono"
                  />
                  <p className="text-xxs text-neutral-700 mt-1">
                    Ex: 0.005 = 0.5%
                  </p>
                </div>
                <div>
                  <label className="field-label">Risque max / jour (%)</label>
                  <input
                    {...register('max_risk_per_day', { valueAsNumber: true, required: true })}
                    type="number" step="0.001" min="0.001" max="0.2"
                    className="input-field font-mono"
                  />
                </div>
                <div>
                  <label className="field-label">RR minimum</label>
                  <input
                    {...register('min_rr_ratio', { valueAsNumber: true, required: true })}
                    type="number" step="0.1" min="0.5"
                    className="input-field font-mono"
                  />
                </div>
                <div>
                  <label className="field-label">Trades max / session</label>
                  <input
                    {...register('max_trades_per_session', { valueAsNumber: true, required: true })}
                    type="number" min="1" max="10"
                    className="input-field font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="field-label">Pertes consécutives max avant arrêt</label>
                <input
                  {...register('max_consecutive_losses', { valueAsNumber: true, required: true })}
                  type="number" min="1" max="5"
                  className="input-field font-mono w-32"
                />
              </div>

              <div>
                <label className="field-label">Notes</label>
                <textarea
                  {...register('notes')}
                  rows={2}
                  placeholder="Conditions du challenge, objectifs…"
                  className="textarea-field"
                />
              </div>

              <div className="flex gap-3">
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? 'Enregistrement…' : editingId ? 'Mettre à jour' : 'Créer le compte'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditingId(null) }}
                  className="btn-secondary flex-1"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        )}

      </main>
    </div>
  )
}
