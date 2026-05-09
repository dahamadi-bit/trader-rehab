# TraderRehab — Guide d'installation

Application de réhabilitation comportementale pour traders.
**Objectif : discipline et neutralité émotionnelle, pas performance.**

---

## Prérequis

- Node.js >= 18
- Compte Supabase (gratuit)
- Clé API OpenAI (GPT-4o)
- Compte Vercel (déploiement)

---

## Installation locale

```bash
# 1. Cloner / ouvrir le dossier
cd trader-rehab

# 2. Installer les dépendances
npm install

# 3. Copier les variables d'environnement
cp .env.example .env.local
# → Remplir .env.local avec vos clés

# 4. Configurer Supabase
# Aller sur supabase.com → Nouveau projet
# SQL Editor → Coller le contenu de supabase/schema.sql → Exécuter

# 5. Lancer en développement
npm run dev
# → http://localhost:3000
```

---

## Variables d'environnement requises

| Variable | Description | Où trouver |
|----------|-------------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL de votre projet Supabase | Dashboard Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique Supabase | Dashboard Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service Supabase (privée) | Dashboard Supabase → Settings → API |
| `OPENAI_API_KEY` | Clé API OpenAI | platform.openai.com |
| `API_SECRET_KEY` | Clé secrète interne | Générer : `openssl rand -hex 32` |

---

## Configuration Supabase

### 1. Créer le projet
Aller sur [supabase.com](https://supabase.com) → New Project.

### 2. Exécuter le schéma
SQL Editor → Coller `supabase/schema.sql` → Run.

### 3. Configurer l'authentification
Authentication → Settings :
- Enable Email Auth ✓
- Disable email confirmations (optionnel en dev)

### 4. Storage (captures d'écran trades)
Storage → Create bucket `trade-screenshots` → Public: false.

---

## Déploiement Vercel

```bash
# Installer Vercel CLI
npm i -g vercel

# Déployer
vercel

# Variables d'environnement Vercel
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add OPENAI_API_KEY
vercel env add API_SECRET_KEY

# Déploiement production
vercel --prod
```

### Configuration Vercel Dashboard
- Framework : Next.js (auto-détecté)
- Root directory : `trader-rehab/`
- Build command : `npm run build`
- Output directory : `.next`

---

## Structure des modules

| Module | Route | Rôle |
|--------|-------|------|
| Auth | `/` | Connexion / inscription |
| Dashboard | `/dashboard` | Check-in + accès session |
| Session | `/session` | Trading encadré avec verrous |
| Journal | `/journal` | Analyse comportementale des trades |
| Backtest | `/backtest` | Simulation analytique |
| Playbook | `/playbook` | Setups autorisés |
| Bilan hebdo | `/weekly` | Revue thérapeutique + rapport IA |
| Anti-addiction | `/anti-addiction` | Module urgence + respiration |

---

## Sécurité

- Toutes les tables ont RLS (Row Level Security) activé
- Les clés de service ne sont jamais exposées au client
- Les headers de sécurité sont configurés dans `next.config.ts`
- Les données utilisateur sont chiffrées au repos par Supabase (AES-256)

---

## Ajout TypeScript

Le fichier `src/lib/database.types.ts` doit être généré depuis Supabase :

```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/database.types.ts
```

---

## Roadmap

- **V1** (actuelle) : Dashboard, session, journal, anti-addiction
- **V2** : Backtesting avancé, intégration broker (lecture seule), app mobile
- **V3** : TCC intégrée, communauté anonyme, coach humain on-demand
