# TRADER REHAB — Architecture Complète

## Vision
Application de réhabilitation comportementale pour traders.
**Objectif principal** : réduire la dépendance émotionnelle, créer une discipline externe,
transformer le trading en activité méthodique et émotionnellement neutre.

---

## Stack Technique

| Couche | Technologie | Justification |
|--------|-------------|---------------|
| Frontend | Next.js 14 (App Router) + TypeScript | SSR/SSG, routing, performance |
| Styles | Tailwind CSS | Utilitaire, cohérence, rapidité |
| State | Zustand | Léger, simple, persistable |
| Backend | Supabase | Auth + DB + Realtime + Storage intégrés |
| IA | OpenAI API (gpt-4o) | Analyse comportementale, coaching |
| PDF | @react-pdf/renderer | Export rapports hebdomadaires |
| Charts | Recharts | Graphiques discipline/émotions |
| PWA | next-pwa | Application mobile installable |
| Deploy | Vercel | Edge functions, CI/CD automatique |

---

## Architecture Applicative

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER / PWA                        │
├─────────────────────────────────────────────────────────────┤
│  Next.js App Router (src/app/)                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │Dashboard │ │ Session  │ │ Journal  │ │ Anti-Addict  │  │
│  │ /        │ │ /session │ │ /journal │ │ /anti-addict.│  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                    │
│  │Backtest  │ │Playbook  │ │ Weekly   │                    │
│  │/backtest │ │/playbook │ │ /weekly  │                    │
│  └──────────┘ └──────────┘ └──────────┘                    │
├─────────────────────────────────────────────────────────────┤
│  API Routes (src/app/api/)                                  │
│  /ai-analysis   /discipline-score   /weekly-report          │
│  /revenge-check                                             │
├─────────────────────────────────────────────────────────────┤
│  Core Libraries (src/lib/)                                  │
│  behavioral-engine.ts │ revenge-detection.ts                │
│  discipline-score.ts  │ pdf-export.ts                       │
│  supabase.ts          │ ai-coach.ts                         │
├─────────────────────────────────────────────────────────────┤
│                    SUPABASE                                 │
│  Auth │ PostgreSQL │ Storage │ Realtime │ Edge Functions    │
└─────────────────────────────────────────────────────────────┘
```

---

## Structure des Dossiers

```
trader-rehab/
├── src/
│   ├── app/
│   │   ├── layout.tsx                    # Layout racine + providers
│   │   ├── page.tsx                      # Landing / Auth
│   │   ├── dashboard/
│   │   │   └── page.tsx                  # Dashboard principal
│   │   ├── session/
│   │   │   └── page.tsx                  # Session trading encadrée
│   │   ├── journal/
│   │   │   ├── page.tsx                  # Liste trades
│   │   │   └── [id]/page.tsx             # Détail trade
│   │   ├── backtest/
│   │   │   └── page.tsx                  # Mode simulation
│   │   ├── playbook/
│   │   │   └── page.tsx                  # Setups autorisés
│   │   ├── weekly/
│   │   │   └── page.tsx                  # Bilan hebdomadaire
│   │   ├── anti-addiction/
│   │   │   └── page.tsx                  # Module thérapeutique
│   │   └── api/
│   │       ├── ai-analysis/route.ts      # Analyse IA comportementale
│   │       ├── discipline-score/route.ts # Calcul score discipline
│   │       ├── weekly-report/route.ts    # Génération rapport PDF
│   │       └── revenge-check/route.ts   # Détection revenge trading
│   ├── components/
│   │   ├── ui/                           # Design system primitifs
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Slider.tsx
│   │   │   ├── Modal.tsx
│   │   │   └── ProgressBar.tsx
│   │   ├── dashboard/
│   │   │   ├── EmotionalCheckIn.tsx      # Bilan émotionnel quotidien
│   │   │   ├── DisciplineStats.tsx       # Statistiques discipline
│   │   │   ├── DailyQuote.tsx            # Citation froide du jour
│   │   │   └── SessionGate.tsx           # Verrou accès session
│   │   ├── session/
│   │   │   ├── PreTradeForm.tsx          # Formulaire pré-trade
│   │   │   ├── SessionTimer.tsx          # Timer de session
│   │   │   ├── TradeLimit.tsx            # Compteur trades / pertes
│   │   │   └── CooldownTimer.tsx         # Cooldown post-gain
│   │   ├── journal/
│   │   │   ├── TradeEntryForm.tsx        # Saisie complète trade
│   │   │   ├── BehavioralAnalysis.tsx    # Analyse comportementale
│   │   │   └── JournalCharts.tsx         # Graphiques journal
│   │   ├── anti-addiction/
│   │   │   ├── EmergencyButton.tsx       # Bouton "Je vais craquer"
│   │   │   ├── BreathingExercise.tsx     # Respiration guidée
│   │   │   ├── RelapseMode.tsx           # Mode rechute
│   │   │   └── UsageMonitor.tsx          # Détection usage compulsif
│   │   └── shared/
│   │       ├── Navigation.tsx
│   │       └── FrictionModal.tsx         # Friction avant action risquée
│   ├── lib/
│   │   ├── supabase.ts                   # Client Supabase
│   │   ├── behavioral-engine.ts          # Moteur comportemental central
│   │   ├── revenge-detection.ts          # Détection revenge trading
│   │   ├── discipline-score.ts           # Calcul score discipline
│   │   ├── ai-coach.ts                   # Interface IA coaching
│   │   └── pdf-export.ts                 # Export rapports
│   ├── hooks/
│   │   ├── useEmotionalState.ts
│   │   ├── useSession.ts
│   │   ├── useDisciplineScore.ts
│   │   └── useAntiAddiction.ts
│   ├── stores/
│   │   ├── emotionalStore.ts             # Zustand état émotionnel
│   │   ├── sessionStore.ts               # Zustand session trading
│   │   └── disciplineStore.ts            # Zustand discipline
│   └── types/
│       └── index.ts                      # Types TypeScript globaux
├── supabase/
│   ├── schema.sql                        # Schéma complet DB
│   └── seed.sql                          # Données initiales
├── public/
│   ├── manifest.json                     # PWA manifest
│   └── icons/
├── .env.example
├── .env.local                            # (gitignored)
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## Flux de Données Principaux

### 1. Flux Dashboard → Session
```
Check-in émotionnel → BehavioralEngine.canStartSession()
  → si bloqué : afficher alternatives
  → si OK : activer bouton session → PreTradeForm → SessionActive
```

### 2. Flux Session → Détection Revenge
```
Input utilisateur → RevengeDetection.analyze(text)
  → si pattern détecté : fermer session immédiatement + log événement
  → si 2 pertes : arrêt automatique + cooldown forcé
  → si gain : cooldown 30min avant prochain trade
```

### 3. Flux Journal → Analyse IA
```
TradeEntry soumis → /api/ai-analysis
  → OpenAI analyse comportementale
  → DisciplineScore.recalculate()
  → Mise à jour statistiques utilisateur
```

### 4. Flux Anti-Addiction
```
UsageMonitor détecte comportement → BehavioralEngine.riskLevel()
  → Niveau 1 : écran recentrage
  → Niveau 2 : respiration guidée
  → Niveau 3 : fermeture forcée + suspension
  → Bouton urgence : verrouillage immédiat
```

---

## Règles Métier Critiques

| Règle | Condition | Action |
|-------|-----------|--------|
| Blocage session | fatigue/stress/euphorie ≥ 7 | Impossible de commencer |
| Max trades | 2 trades/session | Blocage automatique |
| Stop pertes | 2 pertes consécutives | Arrêt automatique session |
| Cooldown gain | Après chaque gain | 30min obligatoire |
| Revenge trading | Phrases-clés détectées | Fermeture immédiate |
| Setups autorisés | Playbook uniquement | Validation avant entrée |
| Capital perso | Conditions non remplies | Verrouillage |
| Rechute niveau 1 | 1 violation | Avertissement |
| Rechute niveau 2 | 3 violations | Suspension 24h |
| Rechute niveau 3 | 5 violations | Suspension 7j + sim only |

---

## Sécurité

- **Auth** : Supabase Auth (email/password + magic link)
- **RLS** : Row Level Security sur toutes les tables
- **Données** : Chiffrées au repos (Supabase AES-256)
- **API** : Rate limiting via Vercel Edge Middleware
- **Secrets** : Variables d'environnement uniquement, jamais en clair
- **HTTPS** : Forcé en production Vercel

---

## Roadmap

### V1 (MVP — 6 semaines)
- [x] Auth + Dashboard
- [x] Check-in émotionnel + blocages
- [x] Session encadrée + verrous
- [x] Journal de trading
- [x] Détection revenge trading
- [x] Score discipline
- [x] Bilan hebdomadaire
- [x] Mode urgence

### V2 (3 mois)
- [ ] Backtesting/simulation avancé
- [ ] Analyse IA profonde (patterns long terme)
- [ ] Intégration broker API (lecture seule)
- [ ] App mobile native (React Native)
- [ ] Accountability partner (mode duo)
- [ ] Séances guidées de pleine conscience
- [ ] Intégration wearable (fréquence cardiaque)

### V3 (6 mois)
- [ ] Thérapie TCC intégrée (modules guidés)
- [ ] Communauté anonyme entre traders
- [ ] Coach humain certifié on-demand
- [ ] Certifications discipline vérifiables
