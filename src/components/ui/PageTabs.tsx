interface Tab {
  id: string
  label: string
}

interface PageTabsProps {
  tabs: Tab[]
  activeTab: string
  onChange: (id: string) => void
}

export function PageTabs({ tabs, activeTab, onChange }: PageTabsProps) {
  return (
    <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative
            ${activeTab === tab.id
              ? 'text-primary-600 dark:text-primary-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }
          `}
        >
          {tab.label}
          {activeTab === tab.id && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600 dark:bg-primary-400" />
          )}
        </button>
      ))}
    </div>
  )
}
