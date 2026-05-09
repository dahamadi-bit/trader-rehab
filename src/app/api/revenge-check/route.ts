/**
 * API Route : /api/revenge-check
 * Détection revenge trading sur un texte
 */

import { NextRequest, NextResponse } from 'next/server'
import { analyzeRevengePatterns, analyzeTradeForm } from '@/lib/revenge-detection'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    let result
    if (body.text) {
      // Analyse d'un seul champ
      result = analyzeRevengePatterns(body.text)
    } else if (body.fields) {
      // Analyse multi-champs du formulaire
      result = analyzeTradeForm(body.fields)
    } else {
      return NextResponse.json({ error: 'text ou fields requis' }, { status: 400 })
    }

    return NextResponse.json({ result })
  } catch (error) {
    console.error('[/api/revenge-check] Error:', error)
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}
