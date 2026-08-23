import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LinkedDeviceCard } from '../../../../components/ui/LinkedDeviceCard'

function kebabButton(container: HTMLElement) {
  return container.querySelector('[aria-haspopup="menu"]') as HTMLButtonElement
}

describe('LinkedDeviceCard', () => {
  const onRename = vi.fn()
  const onUnlink = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    onRename.mockResolvedValue(undefined)
  })

  it('renders the name and abbreviated installation id', () => {
    render(<LinkedDeviceCard name="My Phone" installationId="abcdef1234567890" onRename={onRename} />)

    expect(screen.getByText('My Phone')).toBeInTheDocument()
    expect(screen.getByText('abcdef12…')).toBeInTheDocument()
  })

  it('renders a subtitle when provided', () => {
    render(<LinkedDeviceCard name="My Phone" installationId="abc" subtitle="Waiting for confirmation…" onRename={onRename} />)

    expect(screen.getByText('Waiting for confirmation…')).toBeInTheDocument()
  })

  it('shows Rename on the self card (no onUnlink) and hides Unlink', () => {
    const { container } = render(<LinkedDeviceCard name="My Phone" installationId="abc" onRename={onRename} />)

    fireEvent.click(kebabButton(container))

    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Unlink/i })).not.toBeInTheDocument()
  })

  it('shows both Rename and Unlink on a peer card', () => {
    const { container } = render(
      <LinkedDeviceCard name="Peer Phone" installationId="abc" onRename={onRename} onUnlink={onUnlink} />
    )

    fireEvent.click(kebabButton(container))

    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Unlink' })).toBeInTheDocument()
  })

  it('uses a custom unlinkLabel (e.g. Force Unlink) when provided', () => {
    const { container } = render(
      <LinkedDeviceCard name="Peer" installationId="abc" onRename={onRename} onUnlink={onUnlink} unlinkLabel="Force Unlink" />
    )

    fireEvent.click(kebabButton(container))

    expect(screen.getByRole('menuitem', { name: 'Force Unlink' })).toBeInTheDocument()
  })

  it('calls onUnlink when the Unlink menu item is clicked', () => {
    const { container } = render(
      <LinkedDeviceCard name="Peer" installationId="abc" onRename={onRename} onUnlink={onUnlink} />
    )

    fireEvent.click(kebabButton(container))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Unlink' }))

    expect(onUnlink).toHaveBeenCalledTimes(1)
  })

  it('disables the Unlink menu item when unlinkDisabled is true', () => {
    const { container } = render(
      <LinkedDeviceCard name="Peer" installationId="abc" onRename={onRename} onUnlink={onUnlink} unlinkDisabled />
    )

    fireEvent.click(kebabButton(container))

    expect(screen.getByRole('menuitem', { name: 'Unlink' })).toBeDisabled()
  })

  it('opens a rename modal prefilled with the current name', () => {
    const { container } = render(<LinkedDeviceCard name="My Phone" installationId="abc" onRename={onRename} />)

    fireEvent.click(kebabButton(container))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))

    expect(screen.getByText('Rename device')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('My Phone')
  })

  it('calls onRename with the trimmed new name on submit and closes the modal', async () => {
    const { container } = render(<LinkedDeviceCard name="My Phone" installationId="abc" onRename={onRename} />)

    fireEvent.click(kebabButton(container))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  New Name  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(onRename).toHaveBeenCalledWith('New Name')
      expect(screen.queryByText('Rename device')).not.toBeInTheDocument()
    })
  })

  it('closes the modal without calling onRename when Cancel is clicked', () => {
    const { container } = render(<LinkedDeviceCard name="My Phone" installationId="abc" onRename={onRename} />)

    fireEvent.click(kebabButton(container))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText('Rename device')).not.toBeInTheDocument()
    expect(onRename).not.toHaveBeenCalled()
  })

  it('does not submit an empty or whitespace-only name', () => {
    const { container } = render(<LinkedDeviceCard name="My Phone" installationId="abc" onRename={onRename} />)

    fireEvent.click(kebabButton(container))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '   ' } })

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('keeps the modal open and re-enables the form when onRename rejects', async () => {
    onRename.mockRejectedValueOnce(new Error('network error'))
    const { container } = render(<LinkedDeviceCard name="My Phone" installationId="abc" onRename={onRename} />)

    fireEvent.click(kebabButton(container))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onRename).toHaveBeenCalled())
    expect(screen.getByText('Rename device')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
  })
})
