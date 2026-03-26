'use client'

import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Home, BarChart3, GraduationCap, Settings } from 'lucide-react'

const tabs = [
  { name: 'Home', href: '/active-recall', icon: Home },
  { name: 'Insights', href: '/active-recall/insights', icon: BarChart3 },
  { name: 'Exams', href: '/active-recall/exams', icon: GraduationCap },
  { name: 'Settings', href: '/active-recall/settings', icon: Settings },
]

export function ARTabNav() {
  const pathname = usePathname()

  return (
    <nav className="flex items-center gap-1 border-b border-border px-6 overflow-x-auto scrollbar-none">
      {tabs.map((tab) => {
        const isActive =
          tab.href === '/active-recall'
            ? pathname === '/active-recall'
            : pathname?.startsWith(tab.href)
        const Icon = tab.icon

        return (
          <button
            key={tab.name}
            onClick={() => {
              window.location.href = tab.href
            }}
            className={cn(
              'relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap',
              'hover:text-foreground',
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.name}
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        )
      })}
    </nav>
  )
}
