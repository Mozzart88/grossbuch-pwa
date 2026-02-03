import { useLayoutContextSafe } from '../../store/LayoutContext'

export function TestPlusButton() {
  const layoutContext = useLayoutContextSafe()
  if (!layoutContext?.plusButtonConfig?.onClick) return null
  return (
    <button onClick={layoutContext.plusButtonConfig.onClick}>
      Add
    </button>
  )
}
