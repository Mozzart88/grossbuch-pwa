import { useState, useEffect } from 'react'

const listeners = new Set<() => void>()

export function notifyDataRefresh(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function useDataRefresh(): number {
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const listener = () => setVersion(v => v + 1)
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])

  return version
}
