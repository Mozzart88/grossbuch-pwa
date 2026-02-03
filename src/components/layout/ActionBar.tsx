import { useLayoutContextSafe } from '../../store/LayoutContext'
import { Button } from '../ui'

export function ActionBar() {
  const layoutContext = useLayoutContextSafe()
  const config = layoutContext?.actionBarConfig

  if (!config) {
    return null
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 pb-safe">
      <div className="flex items-center gap-3 p-4">
        <Button
          type="button"
          variant="secondary"
          onClick={config.cancelAction}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={config.primaryAction}
          disabled={config.disabled || config.loading}
          className="flex-1"
        >
          {config.loading ? 'Saving...' : config.primaryLabel}
        </Button>
      </div>
    </div>
  )
}
