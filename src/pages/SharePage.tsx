import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button, Card, Spinner } from '../components/ui'
import { settingsRepository } from '../services/repositories'

export function SharePage() {
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    loadInstallationId()
  }, [])

  const loadInstallationId = async () => {
    try {
      const existing = await settingsRepository.get('installation_id')
      if (existing) {
        const parsed = typeof existing === 'string' ? JSON.parse(existing) : existing
        if (parsed.id) {
          setShareUrl(`${window.location.origin}/share?uuid=${parsed.id}`)
        }
      }
    } catch (error) {
      console.error('Failed to load installation ID:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      console.error('Failed to copy to clipboard')
    }
  }

  const handleShare = async () => {
    if (!shareUrl) return
    try {
      await navigator.share({
        title: 'GrossBuch',
        text: 'Install GrossBuch on your device',
        url: shareUrl,
      })
    } catch {
      // User cancelled or share failed
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Share" showBack />
        <div className="flex items-center justify-center p-12">
          <Spinner size="lg" />
        </div>
      </div>
    )
  }

  if (!shareUrl) {
    return (
      <div>
        <PageHeader title="Share" showBack />
        <div className="p-4">
          <Card className="p-6 text-center">
            <p className="text-gray-600 dark:text-gray-400">
              Registration not complete. Please wait for installation to finish and try again.
            </p>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Share" showBack />
      <div className="p-4 space-y-4">
        <Card className="p-6 flex flex-col items-center gap-4">
          <div className="bg-white p-4 rounded-lg">
            <QRCodeSVG value={shareUrl} size={200} level="M" />
          </div>
          <p className="text-xs font-mono text-gray-500 dark:text-gray-400 break-all text-center">
            {shareUrl}
          </p>
        </Card>

        <div className="space-y-3">
          <Button
            variant="secondary"
            className="w-full"
            onClick={handleCopy}
          >
            {copied ? 'Copied!' : 'Copy Link'}
          </Button>

          {typeof navigator.share === 'function' && (
            <Button
              variant="primary"
              className="w-full"
              onClick={handleShare}
            >
              Share
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
