import { useState } from 'react'
import type { ReactNode } from 'react'
import { TabBar } from '../ui'
import { ActionBar } from './ActionBar'
import { NavDrawer } from './NavDrawer'
import { NotificationDrawer } from './NotificationDrawer'
import logoDark from '/dark-favicon.svg?url'
import logoLight from '/favicon.svg?url'
import { useTheme } from '../../store/ThemeContext'

interface AppLayoutProps {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [notificationDrawerOpen, setNotificationDrawerOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const { isDark } = useTheme()
  const logo = isDark ? logoDark : logoLight

  return (
    <div className="min-h-full flex flex-col">
      {/* Global top bar */}
      <header className="flex items-center justify-between px-4 h-14 pt-safe bg-white dark:bg-gray-900
                         border-b border-gray-200 dark:border-gray-800 shrink-0">
        <div className='flex items-start gap-1'>
          <img src={logo} alt="Logo" className='w-7' />
          {/* <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">GrossBuh</span> */}
        </div>
        <div className="flex items-center">
          <button
            onClick={() => setNotificationDrawerOpen(true)}
            aria-label="Open notifications"
            className="relative p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0a3 3 0 0 1-6 0m6 0H9" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-red-600 ring-2 ring-white dark:ring-gray-900" />
            )}
          </button>
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </header>

      <main className="flex-1 pb-20 overflow-y-auto">
        {children}
      </main>

      <TabBar />
      <ActionBar />
      <NotificationDrawer
        isOpen={notificationDrawerOpen}
        onClose={() => setNotificationDrawerOpen(false)}
        onUnreadCountChange={setUnreadCount}
      />
      <NavDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  )
}
