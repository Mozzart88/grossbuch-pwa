import { NavLink, useNavigate } from 'react-router-dom'
import { useLayoutContextSafe } from '../../store/LayoutContext'

const tabs = [
  {
    to: '/',
    label: 'Transactions',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
]

const plusIcon = (
  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
)

export function TabBar() {
  const navigate = useNavigate()
  const layoutContext = useLayoutContextSafe()
  const plusButtonConfig = layoutContext?.plusButtonConfig

  const handlePlusClick = () => {
    if (plusButtonConfig?.onClick) {
      plusButtonConfig.onClick()
    } else if (plusButtonConfig?.to) {
      navigate(plusButtonConfig.to)
    } else {
      navigate('/add')
    }
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 pb-safe z-40">
      <div className="flex items-center justify-around h-16">
        {/* Transactions tab */}
        <NavLink
          to={tabs[0].to}
          className={({ isActive }) => `
            flex flex-col items-center justify-center flex-1 h-full
            ${isActive
              ? 'text-primary-600 dark:text-primary-400'
              : 'text-gray-500 dark:text-gray-400'
            }
          `}
        >
          {({ isActive }) => (
            <>
              {tabs[0].icon}
              <span className={`text-xs mt-1 ${isActive ? 'font-medium' : ''}`}>
                {tabs[0].label}
              </span>
            </>
          )}
        </NavLink>

        {/* Plus button */}
        <button
          type="button"
          onClick={handlePlusClick}
          className="flex flex-col items-center justify-center flex-1 h-full text-white"
          aria-label="Add"
        >
          <div className="flex items-center justify-center w-12 h-12 -mt-4 bg-primary-600 rounded-full shadow-lg">
            {plusIcon}
          </div>
        </button>

        {/* Settings tab */}
        <NavLink
          to={tabs[1].to}
          className={({ isActive }) => `
            flex flex-col items-center justify-center flex-1 h-full
            ${isActive
              ? 'text-primary-600 dark:text-primary-400'
              : 'text-gray-500 dark:text-gray-400'
            }
          `}
        >
          {({ isActive }) => (
            <>
              {tabs[1].icon}
              <span className={`text-xs mt-1 ${isActive ? 'font-medium' : ''}`}>
                {tabs[1].label}
              </span>
            </>
          )}
        </NavLink>
      </div>
    </nav>
  )
}
