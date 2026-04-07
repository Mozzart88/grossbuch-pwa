interface ChevronIconProps {
  expanded?: boolean
  rotate?: number
}

export function ChevronIcon({ expanded, rotate = 0 }: ChevronIconProps) {
  const rotation =
    expanded !== undefined
      ? expanded ? 90 : 0
      : rotate || 0

  return (
    <svg
      style={{ '--rotation-deg': `${rotation}deg` } as React.CSSProperties}
      className={`w-4 h-4 text-gray-400 transition-transform rotate-(--rotation-deg)`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  )
}
