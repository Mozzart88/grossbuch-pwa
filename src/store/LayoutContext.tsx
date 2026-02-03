import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react'

export interface ActionBarConfig {
  primaryLabel: string
  primaryAction: () => void
  cancelAction: () => void
  disabled?: boolean
  loading?: boolean
}

export interface PlusButtonConfig {
  onClick?: () => void
  to?: string
}

interface LayoutContextValue {
  actionBarConfig: ActionBarConfig | null
  setActionBarConfig: (config: ActionBarConfig | null) => void
  plusButtonConfig: PlusButtonConfig | null
  setPlusButtonConfig: (config: PlusButtonConfig | null) => void
}

const LayoutContext = createContext<LayoutContextValue | null>(null)

interface LayoutProviderProps {
  children: ReactNode
}

export function LayoutProvider({ children }: LayoutProviderProps) {
  const [actionBarConfig, setActionBarConfigState] = useState<ActionBarConfig | null>(null)
  const [plusButtonConfig, setPlusButtonConfigState] = useState<PlusButtonConfig | null>(null)

  const setActionBarConfig = useCallback((config: ActionBarConfig | null) => {
    setActionBarConfigState(config)
  }, [])

  const setPlusButtonConfig = useCallback((config: PlusButtonConfig | null) => {
    setPlusButtonConfigState(config)
  }, [])

  const value = useMemo(() => ({
    actionBarConfig,
    setActionBarConfig,
    plusButtonConfig,
    setPlusButtonConfig,
  }), [actionBarConfig, setActionBarConfig, plusButtonConfig, setPlusButtonConfig])

  return (
    <LayoutContext.Provider value={value}>
      {children}
    </LayoutContext.Provider>
  )
}

export function useLayoutContext(): LayoutContextValue {
  const context = useContext(LayoutContext)
  if (!context) {
    throw new Error('useLayoutContext must be used within a LayoutProvider')
  }
  return context
}

export function useLayoutContextSafe(): LayoutContextValue | null {
  return useContext(LayoutContext)
}
