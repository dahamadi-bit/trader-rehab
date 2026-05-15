'use client'

/**
 * Post-Trade Journal Modal — Behavioral tracking
 * Shown after every trade close to capture:
 * 1. Emotion after close (picker + phrase template)
 * 2. Thesis correctness (yes/partially/no)
 * 3. Reflection notes (what would you do differently)
 * 4. Control loss flag (optional self-report)
 *
 * Design: Friction + reflection = prevents reactive re-trading
 */

import { useState } from 'react'
import { clsx } from 'clsx'
import type { TradeEmotion, Trade } from '@/types'
import { EMOTION_PHRASES, getPhrases } from '@/lib/emotion-phrases'

const EMOTIONS_ARRAY = [
  { value: 'calm' as TradeEmotion,          label: 'Calme',          emoji: '😌', color: '#27ae60' },
  { value: 'uncertain' as TradeEmotion,     label: 'Incertain',      emoji: '🤔', color: '#f39c12' },
  { value: 'excited' as TradeEmotion,       label: 'Excité',         emoji: '⚡', color: '#e67e22' },
  { value: 'fearful' as TradeEmotion,       label: 'Apeuré',         emoji: '😰', color: '#e74c3c' },
  { value: 'frustrated' as TradeEmotion,    label: 'Frustré',        emoji: '😤', color: '#c0392b' },
  { value: 'overconfident' as TradeEmotion, label: 'Surconfiant',     emoji: '🔥', color: '#8e44ad' },
]

export interface TradeJournalModalProps {
  trade: Partial<Trade>
  result: 'win' | 'loss' | 'breakeven'
  pnl: number
  controlSignals: {
    controlLoss: boolean
    revengeDetected: boolean
    emotionRisk: boolean
    threeInHour: boolean
  }
  onSubmit: (data: {
    emotion_after: TradeEmotion
    emotion_after_note: string
    thesis_correct: 'yes' | 'partially' | 'no'
    reflection_note: string
    control_loss_detected: boolean
  }) => Promise<void>
  onClose: () => void
}

export default function TradeJournalModal({
  trade,
  result,
  pnl,
  controlSignals,
  onSubmit,
  onClose,
}: TradeJournalModalProps) {
  const [emotion, setEmotion] = useState<TradeEmotion | null>(null)
  const [emotionNote, setEmotionNote] = useState('')
  const [thesisCorrect, setThesisCorrect] = useState<'yes' | 'partially' | 'no' | null>(null)
  const [reflection, setReflection] = useState('')
  const [controlLoss, setControlLoss] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const emotionObj = emotion ? EMOTIONS_ARRAY.find(e => e.value === emotion) : null
  const emotionPhrases = emotion ? getPhrases(emotion, 'post') : []

  async function handleSubmit() {
    if (!emotion || !thesisCorrect) return
    setIsSubmitting(true)
    try {
      await onSubmit({
        emotion_after: emotion,
        emotion_after_note: emotionNote,
        thesis_correct: thesisCorrect,
        reflection_note: reflection,
        control_loss_detected: controlLoss,
      })
      onClose()
    } catch (error) {
      console.error('Error submitting journal:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4 md:p-0">
      <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-5 md:p-6 space-y-5">
          {/* Header */}
          <div>
            <h2 className="text-lg font-medium text-neutral-200 mb-1">Analyse du Trade</h2>
            <p className="text-xs text-neutral-500">Après chaque trade : émotion, justesse de thèse, réflexion</p>
          </div>

          {/* Trade result summary */}
          <div className={clsx(
            'p-3 rounded-lg',
            result === 'win' ? 'bg-[#27ae60]/10 border border-[#27ae60]/30' :
            result === 'loss' ? 'bg-[#e74c3c]/10 border border-[#e74c3c]/30' :
            'bg-[#f39c12]/10 border border-[#f39c12]/30'
          )}>
            <div className="grid grid-cols-3 gap-3 text-center text-xs">
              <div>
                <div className="text-neutral-600">Résultat</div>
                <div className={clsx(
                  'font-semibold mt-1',
                  result === 'win' ? 'text-[#27ae60]' :
                  result === 'loss' ? 'text-[#e74c3c]' :
                  'text-[#f39c12]'
                )}>
                  {result === 'win' ? 'Gain' : result === 'loss' ? 'Perte' : 'Neutre'}
                </div>
              </div>
              <div>
                <div className="text-neutral-600">P&L</div>
                <div className={clsx(
                  'font-semibold mt-1',
                  pnl >= 0 ? 'text-[#27ae60]' : 'text-[#e74c3c]'
                )}>
                  {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} $
                </div>
              </div>
              <div>
                <div className="text-neutral-600">Setup</div>
                <div className="font-semibold mt-1 text-neutral-300">{trade.symbol ?? '—'}</div>
              </div>
            </div>
          </div>

          {/* Control signals warning */}
          {(controlSignals.revengeDetected || controlSignals.emotionRisk || controlSignals.threeInHour || controlSignals.controlLoss) && (
            <div className="p-3 bg-[#e74c3c]/10 border border-[#e74c3c]/30 rounded-lg">
              <div className="text-xs text-[#e74c3c] space-y-1">
                {controlSignals.revengeDetected && <p>🚩 Revenge trade detected</p>}
                {controlSignals.emotionRisk && <p>⚠️ Emotion outside 6–9 range</p>}
                {controlSignals.threeInHour && <p>⚠️ 3 trades in 60 min</p>}
                {controlSignals.controlLoss && <p>🚩 Control loss flagged</p>}
              </div>
            </div>
          )}

          {/* 1. Emotion After */}
          <div>
            <label className="field-label">Comment tu te sens maintenant ?</label>
            <div className="grid grid-cols-2 gap-3 mt-3">
              {EMOTIONS_ARRAY.map(({ value, label, emoji, color }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setEmotion(value)
                    setEmotionNote('')
                  }}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    border: emotion === value ? `2px solid ${color}` : '1px solid #2a2a2a',
                    background: emotion === value ? `${color}22` : '#1a1a1a',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    textAlign: 'center' as const,
                  }}
                >
                  <div style={{ fontSize: '22px', marginBottom: '4px' }}>{emoji}</div>
                  <div style={{
                    fontSize: '11px',
                    color: emotion === value ? color : '#5a5a5a',
                    fontWeight: emotion === value ? 600 : 400,
                  }}>
                    {label}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Emotion phrase suggestions */}
          {emotion && emotionPhrases.length > 0 && (
            <div>
              <label className="field-label text-xs">Phrases suggérées</label>
              <div className="space-y-2 mt-2">
                {emotionPhrases.slice(0, 3).map((phrase, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setEmotionNote(phrase)}
                    className={clsx(
                      'w-full text-left text-xs p-2 rounded border transition-all',
                      emotionNote === phrase
                        ? `border-[${emotionObj?.color}] bg-[${emotionObj?.color}]/10`
                        : 'border-[#2a2a2a] bg-[#1a1a1a] hover:border-[#3a3a3a]'
                    )}
                  >
                    {phrase}
                  </button>
                ))}
              </div>

              {/* Custom note option */}
              <textarea
                value={emotionNote}
                onChange={(e) => setEmotionNote(e.target.value)}
                placeholder="Ou écris ta propre note…"
                rows={2}
                className="textarea-field mt-3 text-xs"
              />
            </div>
          )}

          {/* 2. Thesis Correctness */}
          <div>
            <label className="field-label">Ta thèse était-elle correcte ?</label>
            <div className="grid grid-cols-3 gap-3 mt-3">
              {[
                { value: 'yes', label: 'Correcte ✓', color: '#27ae60' },
                { value: 'partially', label: 'Partiellement', color: '#f39c12' },
                { value: 'no', label: 'Incorrecte ✗', color: '#e74c3c' },
              ].map(({ value, label, color }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setThesisCorrect(value as 'yes' | 'partially' | 'no')}
                  style={{
                    padding: '10px',
                    borderRadius: '6px',
                    border: thesisCorrect === value ? `2px solid ${color}` : '1px solid #2a2a2a',
                    background: thesisCorrect === value ? `${color}22` : '#1a1a1a',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: thesisCorrect === value ? 600 : 400,
                    color: thesisCorrect === value ? color : '#5a5a5a',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Reflection */}
          <div>
            <label className="field-label">Qu'aurais-tu fait différemment ?</label>
            <textarea
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              rows={3}
              placeholder="Ex: Sortir plus tôt sur TP1 / Respecter le stop / Pas ajouter à la position…"
              className="textarea-field mt-2 text-xs"
            />
          </div>

          {/* 4. Control Loss Flag */}
          <label className="flex items-center gap-2 p-2 border border-[#2a2a2a] rounded-lg cursor-pointer hover:bg-[#1a1a1a] transition">
            <input
              type="checkbox"
              checked={controlLoss}
              onChange={(e) => setControlLoss(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-xs text-neutral-400">
              Je suis perdu de contrôle pendant ce trade
            </span>
          </label>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSubmit}
              disabled={!emotion || !thesisCorrect || isSubmitting}
              style={{ opacity: (!emotion || !thesisCorrect) ? 0.45 : 1 }}
              className="btn-primary flex-1 text-sm"
            >
              {isSubmitting ? 'Sauvegarde…' : 'Sauvegarder'}
            </button>
            <button
              onClick={onClose}
              className="btn-secondary text-sm"
            >
              Annuler
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
