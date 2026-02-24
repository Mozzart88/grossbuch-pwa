import { useState } from 'react'
import type { ReactNode } from 'react'
import { TabBar } from '../ui'
import { ActionBar } from './ActionBar'
import { NavDrawer } from './NavDrawer'
import logo from '/dark-favicon.svg?url'

interface AppLayoutProps {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="min-h-full flex flex-col">
      {/* Global top bar */}
      <header className="flex items-center justify-between px-4 h-14 pt-safe bg-white dark:bg-gray-900
                         border-b border-gray-200 dark:border-gray-800 shrink-0">
        <div className='flex items-start gap-1'>
          <img src={logo} alt="Logo" className='w-7' />
          {/* <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">GrossBuch</span> */}
        </div>
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>

      <main className="flex-1 pb-20 overflow-y-auto">
        {children}
      </main>

      <TabBar />
      <ActionBar />
      <NavDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  )
}
