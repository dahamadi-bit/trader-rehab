'use client'

/**
 * Page d'accueil / Authentification
 * Design sobre. Pas de marketing. Pas de promesse.
 * Texte direct et factuel sur l'objectif de l'application.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'

interface AuthFormData {
  email: string
  password: string
  displayName?: string
}

export default function HomePage() {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<AuthFormData>()

  async function onSubmit(data: AuthFormData) {
    setLoading(true)
    setError('')

    const { createClient } = await import('@/lib/supabase')
    const supabase = createClient()

    if (mode === 'login') {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })
      if (authError) { setError(authError.message); setLoading(false); return }
    } else {
      const { error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: { data: { display_name: data.displayName ?? data.email.split('@')[0] } },
      })
      if (authError) { setError(authError.message); setLoading(false); return }
    }

    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="mb-10">
          <div className="text-sm font-medium text-neutral-300 mb-1">TraderRehab</div>
          <p className="text-xs text-neutral-700 leading-relaxed">
            Outil de réhabilitation comportementale pour traders.<br />
            Objectif : discipline, pas performance.
          </p>
        </div>

        {/* Formulaire */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          {mode === 'register' && (
            <div>
              <label className="field-label">Prénom ou pseudo</label>
              <input
                {...register('displayName')}
                placeholder="Comment vous appeler ?"
                className="input-field"
              />
            </div>
          )}

          <div>
            <label className="field-label">Email</label>
            <input
              {...register('email', { required: true })}
              type="email"
              placeholder="votre@email.com"
              className="input-field"
            />
          </div>

          <div>
            <label className="field-label">Mot de passe</label>
            <input
              {...register('password', { required: true, minLength: 8 })}
              type="password"
              placeholder="8 caractères minimum"
              className="input-field"
            />
            {errors.password && (
              <p className="text-xxs text-[#e74c3c] mt-1">8 caractères minimum</p>
            )}
          </div>

          {error && (
            <p className="text-xs text-[#e74c3c]">{error}</p>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full mt-5">
            {loading
              ? 'Connexion…'
              : mode === 'login' ? 'Se connecter' : 'Créer le compte'
            }
          </button>
        </form>

        <button
          onClick={() => setMode(m => m === 'login' ? 'register' : 'login')}
          className="text-xs text-neutral-600 hover:text-neutral-400 mt-4 w-full text-center transition-colors"
        >
          {mode === 'login' ? 'Créer un compte' : 'J\'ai déjà un compte'}
        </button>

        {/* Disclaimer */}
        <p className="text-xxs text-neutral-800 mt-10 leading-relaxed text-center">
          Cette application n&rsquo;est pas un outil de conseil financier.<br />
          Elle ne garantit aucune performance de trading.
        </p>
      </div>
    </div>
  )
}
