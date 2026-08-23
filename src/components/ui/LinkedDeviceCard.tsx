import { useState } from 'react'
import { Modal } from './Modal'
import { Input } from './Input'
import { Button } from './Button'
import { DropdownMenu, type DropdownMenuItem } from './DropdownMenu'
import { guessDeviceName } from '../../utils/deviceName'

export interface LinkedDeviceCardProps {
  name: string
  installationId: string
  subtitle?: string
  onRename: (name: string) => Promise<void>
  /** Omit to hide the Unlink menu item entirely (used for the "This device" card). */
  onUnlink?: () => void
  unlinkLabel?: string
  unlinkDisabled?: boolean
}

export function LinkedDeviceCard({
  name,
  installationId,
  subtitle,
  onRename,
  onUnlink,
  unlinkLabel = 'Unlink',
  unlinkDisabled = false,
}: LinkedDeviceCardProps) {
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState(name)
  const [submitting, setSubmitting] = useState(false)

  const openRename = () => {
    setRenameValue(name)
    setRenameOpen(true)
  }

  const handleRenameSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    const trimmed = renameValue.trim()
    if (!trimmed) return

    setSubmitting(true)
    try {
      await onRename(trimmed)
      setRenameOpen(false)
    } catch {
      // Keep the modal open so the user can retry; the caller surfaces the
      // actual error to the user (e.g. a toast), see LinkedDevicesPage.
    } finally {
      setSubmitting(false)
    }
  }

  const menuItems: DropdownMenuItem[] = [
    { label: 'Rename', onClick: openRename },
  ]
  if (onUnlink) {
    menuItems.push({ label: unlinkLabel, onClick: onUnlink, variant: 'danger', disabled: unlinkDisabled })
  }

  return (
    <div className="flex items-start justify-between p-4">
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{name}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">
          {installationId.slice(0, 8)}…
        </p>
        {subtitle && (
          <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
        )}
      </div>

      <DropdownMenu items={menuItems} />

      <Modal isOpen={renameOpen} onClose={() => setRenameOpen(false)} title="Rename device">
        <form onSubmit={handleRenameSubmit} className="space-y-4">
          <Input
            label="Name"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder={guessDeviceName(navigator.userAgent)}
            disabled={submitting}
            autoFocus
            required
          />
          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => setRenameOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={submitting || !renameValue.trim()}>
              {submitting ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
