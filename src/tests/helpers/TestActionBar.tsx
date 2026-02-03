import { useLayoutContextSafe } from '../../store/LayoutContext'

export function TestActionBar() {
  const layoutContext = useLayoutContextSafe()
  const config = layoutContext?.actionBarConfig

  if (!config) {
    return null
  }

  return (
    <div>
      <button onClick={config.cancelAction}>
        Cancel
      </button>
      <button
        onClick={config.primaryAction}
        disabled={config.disabled || config.loading}
      >
        {config.loading ? 'Saving...' : config.primaryLabel}
      </button>
    </div>
  )
}
