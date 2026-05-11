'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { clsx } from 'clsx'

interface NavItem {
  href: string
  label: string
  shortLabel: string
  icon: string
  description: string
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard',      label: 'Tableau de bord',  shortLabel: 'Accueil',    icon: '◻', description: 'État du jour' },
  { href: '/session',        label: 'Session',           shortLabel: 'Session',    icon: '▷', description: 'Trading encadré' },
  { href: '/journal',        label: 'Journal',           shortLabel: 'Journal',    icon: '≡', description: 'Analyse comportementale' },
  { href: '/playbook',       label: 'Playbook',          shortLabel: 'Playbook',   icon: '□', description: 'Setups autorisés' },
  { href: '/accounts',       label: 'Comptes',           shortLabel: 'Comptes',    icon: '▣', description: 'Prop firm · Personnel' },
  { href: '/backtest',       label: 'Backtest',          shortLabel: 'Backtest',   icon: '↺', description: 'Mode simulation' },
  { href: '/weekly',         label: 'Bilan hebdo',       shortLabel: 'Bilan',      icon: '◑', description: 'Revue de semaine' },
  { href: '/anti-addiction', label: 'Discipline',        shortLabel: 'Discipline', icon: '◉', description: 'Module thérapeutique' },
]

// 5 onglets principaux affichés en bas sur mobile
const MOBILE_PRIMARY = ['/dashboard', '/session', '/journal', '/playbook', '/accounts']

interface NavigationProps {
  disciplineScore?: number
  consecutiveCleanDays?: number
}

export default function Navigation({ disciplineScore = 0, consecutiveCleanDays = 0 }: NavigationProps) {
  const pathname = usePathname()

  return (
    <>
      {/* ── SIDEBAR desktop ─────────────────────────────────────── */}
      <nav className="hidden md:flex w-56 shrink-0 flex-col h-full bg-[#0d0d0d] border-r border-[#1a1a1a]">
        <div className="px-4 py-5 border-b border-[#1a1a1a]">
          <div className="text-sm font-medium text-neutral-100 tracking-wide">TraderRehab</div>
          <div className="text-xs text-neutral-500 mt-0.5">Discipline comportementale</div>
        </div>

        <div className="flex-1 py-3 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors duration-200 group',
                  isActive ? 'text-neutral-100 bg-[#1a1a1a]' : 'text-neutral-500 hover:text-neutral-300 hover:bg-[#141414]'
                )}
              >
                <span className={clsx('text-base transition-colors', isActive ? 'text-neutral-300' : 'text-neutral-600 group-hover:text-neutral-400')}>
                  {item.icon}
                </span>
                <div className="flex flex-col">
                  <span className="leading-tight">{item.label}</span>
                  <span className="text-xxs text-neutral-600 group-hover:text-neutral-500">{item.description}</span>
                </div>
              </Link>
            )
          })}
        </div>

        <div className="p-4 border-t border-[#1a1a1a] space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xxs text-neutral-600 uppercase tracking-wider">Score discipline</span>
            <span className={clsx('text-xs font-mono font-medium',
              disciplineScore >= 70 ? 'text-neutral-300' : disciplineScore >= 50 ? 'text-neutral-400' : 'text-neutral-500'
            )}>{disciplineScore}/100</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xxs text-neutral-600 uppercase tracking-wider">Jours propres</span>
            <span className="text-xs font-mono text-neutral-400">{consecutiveCleanDays}</span>
          </div>
        </div>
      </nav>

      {/* ── BARRE BAS mobile ────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0d0d0d] border-t border-[#1a1a1a]">
        <div className="flex">
          {NAV_ITEMS.filter(i => MOBILE_PRIMARY.includes(i.href)).map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors',
                  isActive ? 'text-neutral-100' : 'text-neutral-600 active:text-neutral-400'
                )}
              >
                <span className={clsx('text-lg leading-none', isActive ? 'text-neutral-200' : 'text-neutral-600')}>
                  {item.icon}
                </span>
                <span className={clsx('text-[9px] uppercase tracking-wider', isActive ? 'text-neutral-300' : 'text-neutral-700')}>
                  {item.shortLabel}
                </span>
              </Link>
            )
          })}
          {/* Bouton "Plus" — pages secondaires */}
          <MobileMoreMenu pathname={pathname} />
        </div>
      </nav>
    </>
  )
}

function MobileMoreMenu({ pathname }: { pathname: string }) {
  const secondary = NAV_ITEMS.filter(i => !MOBILE_PRIMARY.includes(i.href))
  const isSecondaryActive = secondary.some(i => pathname.startsWith(i.href))

  return (
    <div className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 relative group">
      <span className={clsx('text-lg leading-none', isSecondaryActive ? 'text-neutral-200' : 'text-neutral-600')}>
        ···
      </span>
      <span className={clsx('text-[9px] uppercase tracking-wider', isSecondaryActive ? 'text-neutral-300' : 'text-neutral-700')}>
        Plus
      </span>
      {/* Menu déroulant au tap (via focus/active) */}
      <div className="absolute bottom-full right-0 mb-1 w-44 bg-[#141414] border border-[#2a2a2a] rounded-md overflow-hidden
                      opacity-0 pointer-events-none group-focus-within:opacity-100 group-focus-within:pointer-events-auto
                      transition-opacity duration-150 shadow-lg">
        {secondary.map(item => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 px-4 py-3 text-sm',
                isActive ? 'text-neutral-100 bg-[#1a1a1a]' : 'text-neutral-500'
              )}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
