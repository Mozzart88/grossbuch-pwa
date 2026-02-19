import { Button, Card } from '../components/ui'
import { useInstallation } from '../hooks/useInstallation'

export function InstallPage() {
  const { isIOS, canPromptInstall, promptInstall } = useInstallation()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <svg className="w-10 h-10 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            GrossBuch
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Personal Expense Tracker
          </p>
        </div>

        <Card className="p-6">
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Install App
              </h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                GrossBuch works best as an installed app
              </p>
            </div>

            {canPromptInstall && (
              <Button onClick={promptInstall} className="w-full">
                Install GrossBuch
              </Button>
            )}

            {isIOS ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  To install on iOS:
                </p>
                <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                  <li className="flex gap-2">
                    <span className="font-semibold text-gray-900 dark:text-gray-100 shrink-0">1.</span>
                    <span>Tap the <strong>Share</strong> button <span className="inline-block align-middle text-lg leading-none">&#x2B06;&#xFE0E;</span> in Safari's toolbar</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-gray-900 dark:text-gray-100 shrink-0">2.</span>
                    <span>Scroll down and tap <strong>Add to Home Screen</strong></span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-gray-900 dark:text-gray-100 shrink-0">3.</span>
                    <span>Tap <strong>Add</strong> to confirm</span>
                  </li>
                </ol>
              </div>
            ) : !canPromptInstall ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  To install:
                </p>
                <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                  <li className="flex gap-2">
                    <span className="font-semibold text-gray-900 dark:text-gray-100 shrink-0">1.</span>
                    <span>Look for the <strong>install icon</strong> in your browser's address bar</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-gray-900 dark:text-gray-100 shrink-0">2.</span>
                    <span>Or open the browser menu and select <strong>Install app</strong></span>
                  </li>
                </ol>
              </div>
            ) : null}

            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
              <p className="text-xs text-blue-800 dark:text-blue-200">
                Installing the app enables offline access and keeps your data secure with encrypted local storage.
              </p>
            </div>
          </div>
        </Card>

        <p className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
          All data is stored locally and encrypted on your device
        </p>
      </div>
    </div>
  )
}
