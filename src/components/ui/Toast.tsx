import { useState, useEffect, createContext, useContext, useCallback, type ReactNode } from 'react'

interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
  dismissing: boolean
}

interface ToastContextValue {
  showToast: (message: string, type?: Toast['type']) => void
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => { },
})

let toastId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = ++toastId
    setToasts((prev) => [{ id, message, type, dismissing: false }, ...prev])
  }, [])

  const startDismiss = useCallback((id: number) => {
    setToasts((prev) => {
      if (prev.length > 1) return prev.filter((t) => t.id !== id)
      return prev.map((t) => t.id === id ? { ...t, dismissing: true } : t)
    })
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-200 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onStartDismiss={startDismiss} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({
  toast,
  onStartDismiss,
  onRemove,
}: {
  toast: Toast
  onStartDismiss: (id: number) => void
  onRemove: (id: number) => void
}) {
  useEffect(() => {
    const timer = setTimeout(() => onStartDismiss(toast.id), 3000)
    return () => clearTimeout(timer)
  }, [toast.id, onStartDismiss])

  useEffect(() => {
    if (!toast.dismissing) return
    const timer = setTimeout(() => onRemove(toast.id), 350)
    return () => clearTimeout(timer)
  }, [toast.dismissing, toast.id, onRemove])

  const colors = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    info: 'bg-gray-800',
  }

  const animClass = toast.dismissing ? 'animate-slide-out-right' : 'animate-slide-in-right'

  return (
    <div
      className={`w-72 ${colors[toast.type]} text-white px-4 py-3 rounded-lg shadow-lg pointer-events-auto ${animClass}`}
    >
      {toast.message}
    </div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  return useContext(ToastContext)
}
