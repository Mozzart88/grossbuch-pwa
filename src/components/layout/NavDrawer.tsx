import { useNavigate } from 'react-router-dom'

interface NavDrawerProps {
  isOpen: boolean
  onClose: () => void
}

const navItems = [
  { to: '/settings/tags', label: 'Tags', icon: '🏷️' },
  { to: '/settings/counterparties', label: 'Counterparties', icon: '👥' },
  { to: '/settings/exchange-rates', label: 'Exchanges', icon: '📈' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

export function NavDrawer({ isOpen, onClose }: NavDrawerProps) {
  const navigate = useNavigate()

  const handleNav = (to: string) => {
    onClose()
    navigate(to)
  }

  return (
    <div
      className={`fixed inset-0 z-50 ${isOpen ? '' : 'pointer-events-none'}`}
      aria-hidden={!isOpen}
    >
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/50 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-64 bg-white dark:bg-gray-900 shadow-xl flex flex-col
                    transform transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        {/* Close button */}
        <div className="flex items-center justify-end px-4 h-14 shrink-0 border-b border-gray-200 dark:border-gray-800">
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto py-2">
          {navItems.map((item) => (
            <button
              key={item.to}
              onClick={() => handleNav(item.to)}
              className="flex items-center gap-3 w-full px-6 py-4 text-gray-700 dark:text-gray-300
                         hover:bg-gray-100 dark:hover:bg-gray-800 text-left"
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}
