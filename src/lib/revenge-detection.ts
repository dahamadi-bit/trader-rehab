/**
 * RevengeDetection — Détection du revenge trading
 *
 * Analyse le texte saisi par l'utilisateur pour détecter
 * des patterns cognitifs caractéristiques du tilt/revenge trading.
 *
 * Approche : dictionnaire de patterns linguistiques catégorisés
 * par niveau de risque. Aucune IA requise — règles déterministes.
 *
 * Catégories :
 *   1. REVENGE     — intention explicite de "récupérer"
 *   2. TILT        — état émotionnel altéré, perte de contrôle
 *   3. OVERCONFIDENCE — surconfiance, certitude irrationnelle
 *   4. FOMO        — peur de rater, impulsivité
 */

import type { RevengeDetectionResult } from '@/types'

// ============================================================
// DICTIONNAIRE DE PATTERNS
// ============================================================

interface PatternRule {
  patterns: RegExp[]
  weight: number    // Contribution au score (0-100)
  category: 'revenge' | 'tilt' | 'overconfidence' | 'fomo'
  label: string
}

const PATTERN_RULES: PatternRule[] = [
  // --- REVENGE TRADING (poids élevé) ---
  {
    category: 'revenge',
    label: 'Intention de récupération',
    weight: 40,
    patterns: [
      /je\s+vais?\s+(me\s+)?refaire/i,
      /il\s+faut\s+que\s+je\s+récupère/i,
      /je\s+dois\s+récupérer/i,
      /récupérer\s+(ma|les?|mes)\s+(pertes?|pips?|money)/i,
      /rattraper\s+(la\s+)?(perte|le\s+retard)/i,
      /rembourser\s+les?\s+pertes?/i,
      /compenser\s+(ce|la|les?)\s+(perte|trade|erreur)/i,
    ],
  },
  {
    category: 'revenge',
    label: 'Logique de revenge explicite',
    weight: 50,
    patterns: [
      /revenge\s+trade/i,
      /je\s+vais\s+le\s+faire\s+payer/i,
      /le\s+marché\s+(m'a|ma)\s+(volé|pris)/i,
      /il\s+m[''e]\s+a\s+touché\s+le\s+stop/i,
      /encore\s+un\s+stop\s+hunt/i,
    ],
  },

  // --- TILT (perte de contrôle) ---
  {
    category: 'tilt',
    label: 'Certitude irrationnelle',
    weight: 35,
    patterns: [
      /cette\s+fois\s+(c[''e]est\s+)?diff[eé]rent/i,
      /je\s+(le\s+)?sens/i,
      /j[''e]\s+en\s+suis\s+s[uû]r/i,
      /ça\s+(va\s+)?monter\s+forcément/i,
      /ça\s+(va\s+)?baisser\s+forcément/i,
      /c[''e]est\s+(certain|sûr|évident)/i,
      /impossible\s+que/i,
    ],
  },
  {
    category: 'tilt',
    label: 'État émotionnel négatif intense',
    weight: 25,
    patterns: [
      /je\s+suis\s+(trop\s+)?(en\s+col[eè]re|furieux|rage)/i,
      /c[''e]est\s+nul/i,
      /le\s+marché\s+(est\s+)?manipulé/i,
      /tout\s+contre\s+moi/i,
      /j[''e]\s+abandonne/i,
      /plus\s+rien\s+à\s+perdre/i,
      /j[''e]\s+en\s+ai\s+marre/i,
    ],
  },

  // --- OVERCONFIDENCE ---
  {
    category: 'overconfidence',
    label: 'Surconfiance / certitude excessive',
    weight: 30,
    patterns: [
      /c[''e]est\s+facile/i,
      /c[''e]est\s+un\s+trade\s+parfait/i,
      /cannot?\s+lose/i,
      /je\s+ne\s+peux\s+pas\s+perdre/i,
      /c[''e]est\s+évident/i,
      /le\s+marché\s+va\s+forcément/i,
      /100[%\s]+(sûr|certain)/i,
      /je\s+connais\s+(ce\s+)?marché/i,
    ],
  },
  {
    category: 'overconfidence',
    label: 'Augmentation de taille après gains',
    weight: 20,
    patterns: [
      /doubler\s+(la\s+)?mise/i,
      /on\s+va\s+(tout\s+)?doubler/i,
      /mise\s+(maximum|max)/i,
      /all[\s-]in/i,
      /martingale/i,
    ],
  },

  // --- FOMO ---
  {
    category: 'fomo',
    label: 'Peur de rater',
    weight: 20,
    patterns: [
      /je\s+(vais\s+)?rater\s+(ça|ce\s+mouvement|l[''e]opportunité)/i,
      /train\s+en\s+marche/i,
      /ça\s+part\s+(sans\s+moi|déjà)/i,
      /c[''e]est\s+(le\s+)?moment\s+ou\s+jamais/i,
      /vite\s+avant\s+que/i,
      /fomo/i,
      /dernier\s+train/i,
    ],
  },
]

// ============================================================
// FONCTION PRINCIPALE
// ============================================================

/**
 * Analyse un texte saisi par le trader et détecte les patterns
 * de revenge trading, tilt, FOMO ou surconfiance.
 *
 * @param text - Texte à analyser (justification, notes, etc.)
 * @returns RevengeDetectionResult avec score et détails
 */
export function analyzeRevengePatterns(text: string): RevengeDetectionResult {
  if (!text || text.trim().length < 3) {
    return { detected: false, flags: [], riskScore: 0, category: 'safe' }
  }

  const flags: string[] = []
  let totalScore = 0
  const matchedCategories = new Set<string>()

  for (const rule of PATTERN_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) {
        flags.push(rule.label)
        totalScore += rule.weight
        matchedCategories.add(rule.category)
        break  // Une seule fois par règle
      }
    }
  }

  // Cap à 100
  const riskScore = Math.min(totalScore, 100)

  // Catégorie dominante
  let category: RevengeDetectionResult['category'] = 'safe'
  if (matchedCategories.has('revenge')) {
    category = 'revenge'
  } else if (matchedCategories.has('tilt')) {
    category = 'tilt'
  } else if (riskScore >= 30) {
    category = 'concerning'
  }

  return {
    detected: riskScore >= 35 || category === 'revenge',
    flags: [...new Set(flags)],  // Dédupliqué
    riskScore,
    category,
  }
}

// ============================================================
// ANALYSE MULTI-CHAMPS
// ============================================================

/**
 * Analyse plusieurs champs du formulaire simultanément.
 * Retourne le résultat le plus sévère.
 */
export function analyzeTradeForm(fields: {
  plan_justification?: string
  emotion_before_note?: string
  temptation_notes?: string
  behavioral_notes?: string
}): RevengeDetectionResult {
  const results = Object.values(fields)
    .filter(Boolean)
    .map(text => analyzeRevengePatterns(text!))

  if (results.length === 0) {
    return { detected: false, flags: [], riskScore: 0, category: 'safe' }
  }

  // Retourner le résultat avec le score le plus élevé
  return results.reduce((worst, current) =>
    current.riskScore > worst.riskScore ? current : worst
  )
}

// ============================================================
// MESSAGES D'INTERVENTION
// ============================================================

/**
 * Retourne le message à afficher selon la catégorie détectée.
 * Ton : factuel, non culpabilisant, structurant.
 */
export function getInterventionMessage(result: RevengeDetectionResult): {
  title: string
  body: string
  action: 'warn' | 'block' | 'close'
} {
  switch (result.category) {
    case 'revenge':
      return {
        title: 'Session interrompue',
        body: 'Des indicateurs de revenge trading ont été détectés dans votre texte. La session est fermée. Ce n\'est pas une punition — c\'est une protection. Revenez quand l\'état émotionnel est neutre.',
        action: 'close',
      }

    case 'tilt':
      return {
        title: 'Alerte état émotionnel',
        body: 'Votre formulation suggère un état de tilt. Le tilt est un état cognitif altéré où les décisions sont statistiquement mauvaises. Pause recommandée.',
        action: 'block',
      }

    case 'concerning':
      return {
        title: 'Attention',
        body: 'Certaines formulations suggèrent une tension émotionnelle. Prenez un moment. Le trade sera encore disponible dans 10 minutes.',
        action: 'warn',
      }

    default:
      return {
        title: '',
        body: '',
        action: 'warn',
      }
  }
}
