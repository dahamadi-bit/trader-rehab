'use client'

/**
 * Control Signal Summary — Display behavioral red flags
 * Shows which control-loss signals were detected for a trade:
 * - Revenge trade (re-entry <15 min same symbol)
 * - Emotion outside 6–9 (risk zone)
 * - 3 trades in 1 hour (compulsion)
 * - Manual "I lost control" flag
 *
 * Used in post-trade journal to make trader aware of patterns
 */

import { clsx } from 'clsx'

interface Signal {
  id: string
  label: string
  icon: string
  color: string
  description: string
}

interface ControlSignalSummaryProps {
  signals: {
    controlLoss: boolean
    revengeDetected: boolean
    emotionRisk: boolean
    threeInHour: boolean
  }
  compact?: boolean
}

const SIGNAL_DEFINITIONS: Record<string, Signal> = {
  controlLoss: {
    id: 'control_loss',
    label: 'Perte de contrôle',
    icon: '🚩',
    color: '#e74c3c',
    description: 'Vous avez auto-déclaré une perte de contrôle',
  },
  revengeDetected: {
    id: 'revenge',
    label: 'Revenge trade',
    icon: '⚡',
    color: '#e67e22',
    description: 'Re-entrée <15 min après un stop (même symbole)',
  },
  emotionRisk: {
    id: 'emotion_risk',
    label: 'Émotion à risque',
    icon: '⚠️',
    color: '#f39c12',
    description: 'Confiance <6 ou >9 (zone de risque)',
  },
  threeInHour: {
    id: 'three_in_hour',
    label: '3 trades en 1h',
    icon: '🔥',
    color: '#e74c3c',
    description: '3 trades fermés en moins de 60 minutes',
  },
}

export default function ControlSignalSummary({
  signals,
  compact = false,
}: ControlSignalSummaryProps) {
  const activeSignals = [
    signals.controlLoss && 'controlLoss',
    signals.revengeDetected && 'revengeDetected',
    signals.emotionRisk && 'emotionRisk',
    signals.threeInHour && 'threeInHour',
  ].filter(Boolean) as string[]

  if (activeSignals.length === 0) {
    return null
  }

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {activeSignals.map((key) => {
          const signal = SIGNAL_DEFINITIONS[key]
          return (
            <div
              key={signal.id}
              className="text-xs px-2 py-1 rounded flex items-center gap-1"
              style={{
                background: `${signal.color}22`,
                border: `1px solid ${signal.color}`,
                color: signal.color,
              }}
            >
              <span>{signal.icon}</span>
              <span>{signal.label}</span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-2 p-3 bg-[#1a1a1a] border border-[#e74c3c]/30 rounded-lg">
      <div className="text-xs font-semibold text-[#e74c3c] uppercase tracking-wider">
        Signaux détectés ({activeSignals.length})
      </div>
      <div className="space-y-2">
        {activeSignals.map((key) => {
          const signal = SIGNAL_DEFINITIONS[key]
          return (
            <div key={signal.id} className="flex gap-2 text-xs">
              <span style={{ color: signal.color }} className="flex-shrink-0">
                {signal.icon}
              </span>
              <div className="flex-1">
                <div style={{ color: signal.color }} className="font-medium">
                  {signal.label}
                </div>
                <div className="text-neutral-500">{signal.description}</div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="pt-2 border-t border-[#2a2a2a]">
        <p className="text-xs text-neutral-500">
          <strong>Recommandation :</strong> {
            activeSignals.length >= 2
              ? 'Fin de session recommandée — vous avez montré plusieurs signaux de perte de contrôle.'
              : activeSignals.length === 1
              ? 'Vigilance — monitorer le prochain trade attentivement.'
              : 'Statut normal.'
          }
        </p>
      </div>
    </div>
  )
}
