/**
 * API Route : /api/ai-analysis
 * Analyse comportementale d'un trade via OpenAI
 */

import { NextRequest, NextResponse } from 'next/server'
import { analyzeTradeWithAI } from '@/lib/ai-coach'
import type { Trade } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const trade: Trade = body.trade

    if (!trade?.id) {
      return NextResponse.json({ error: 'Trade requis' }, { status: 400 })
    }

    const analysis = await analyzeTradeWithAI(trade)

    // Mise à jour du trade dans Supabase avec l'analyse
    // (le client côté serveur serait nécessaire ici — simplifié pour l'exemple)

    return NextResponse.json({ analysis })
  } catch (error) {
    console.error('[/api/ai-analysis] Error:', error)
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}
