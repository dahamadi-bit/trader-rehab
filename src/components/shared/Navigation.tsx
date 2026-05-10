'use client'

/**
 * Navigation — Barre de navigation latérale
 *
 * Design : minimaliste, sobre. Aucun indicateur de gamification.
 * Le score de discipline est affiché en texte froid, pas en barre colorée.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { clsx } from 'clsx'

interface NavItem {
  href: string
  label: string
  icon: string
  description: string
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard',       label: 'Tableau de bord',   icon: '◻', description: 'État du jour' },
  { href: '/session',         label: 'Session',            icon: '▷', description: 'Trading encadré' },
  { href: '/journal',         label: 'Journal',            icon: '≡', description: 'Analyse comportementale' },
  { href: '/backtest',        label: 'Backtest',           icon: '↺', description: 'Mode simulation' },
  { href: '/playbook',        label: 'Playbook',           icon: '□', description: 'Setups autorisés' },
  { href: '/weekly',          label: 'Bilan hebdo',        icon: '◑', description: 'Revue de semaine' },
  { href: '/anti-addiction',  label: 'Discipline',         icon: '◉', description: 'Module thérapeutique' },
  { href: '/accounts',        label: 'Comptes',            icon: '▣', description: 'Prop firm · Personnel' },
]

interface NavigationProps {
  disciplineScore?: number
  consecutiveCleanDays?: number
}

export default function Navigation({ disciplineScore = 0, consecutiveCleanDays = 0 }: NavigationProps) {
  const pathname = usePathname()

  return (
    <nav className="w-56 shrink-0 flex flex-col h-full bg-[#0d0d0d] border-r border-[#1a1a1a]">
      {/* Header */}
      <div className="px-4 py-5 border-b border-[#1a1a1a]">
        <div className="text-sm font-medium text-neutral-100 tracking-wide">TraderRehab</div>
        <div className="text-xs text-neutral-500 mt-0.5">Discipline comportementale</div>
      </div>

      {/* Links */}
      <div className="flex-1 py-3 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors duration-200 group',
                isActive
                  ? 'text-neutral-100 bg-[#1a1a1a]'
                  : 'text-neutral-500 hover:text-neutral-300 hover:bg-[#141414]'
              )}
            >
              <span className={clsx(
                'text-base transition-colors',
                isActive ? 'text-neutral-300' : 'text-neutral-600 group-hover:text-neutral-400'
              )}>
                {item.icon}
              </span>
              <div className="flex flex-col">
                <span className="leading-tight">{item.label}</span>
                <span className="text-xxs text-neutral-600 group-hover:text-neutral-500">
                  {item.description}
                </span>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Footer — Métriques froides */}
      <div className="p-4 border-t border-[#1a1a1a] space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-xxs text-neutral-600 uppercase tracking-wider">Score discipline</span>
          <span className={clsx(
            'text-xs font-mono font-medium',
            disciplineScore >= 70 ? 'text-neutral-300' :
            disciplineScore >= 50 ? 'text-neutral-400' :
            'text-neutral-500'
          )}>
            {disciplineScore}/100
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xxs text-neutral-600 uppercase tracking-wider">Jours propres</span>
          <span className="text-xs font-mono text-neutral-400">{consecutiveCleanDays}</span>
        </div>
      </div>
    </nav>
  )
}
