import type { ReactNode } from 'react'
import { TabBar } from '../ui'

interface AppLayoutProps {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-full flex flex-col">
      <main className="flex-1 pb-20 pt-safe">
        {children}
      </main>
      <TabBar />
    </div>
  )
}
