import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
const service = vi.hoisted(() => ({ inspectDatabaseRestore: vi.fn(), restoreDatabases: vi.fn() }))
vi.mock('../../../services/restore/restoreService', () => service)
import { RestoreDatabase } from '../../../components/RestoreDatabase'
beforeEach(() => { service.inspectDatabaseRestore.mockReset(); service.restoreDatabases.mockReset() })
it('previews partial replacements and submits once despite repeated clicks', async () => {
  service.inspectDatabaseRestore.mockResolvedValue({ plan: { mode: 'partial', files: [{ destination: 'workspace-1.db' }], retained: ['main.db', 'shared.db'], findings: [] } })
  let finish!: () => void
  service.restoreDatabases.mockImplementation(() => new Promise<void>(resolve => { finish = resolve }))
  render(<RestoreDatabase />)
  fireEvent.change(screen.getByLabelText('Decrypted database files'), { target: { files: [new File(['db'], 'workspace-1.db')] } })
  await screen.findByText('Partial restore')
  const confirm = screen.getByRole('button', { name: 'Restore selected databases' })
  fireEvent.click(confirm); fireEvent.click(confirm)
  await waitFor(() => expect(service.restoreDatabases).toHaveBeenCalledTimes(1))
  finish()
  await screen.findByText('Database restore completed.')
})
it('requires matching new PINs for a full restore and supports cancellation', async () => {
  service.inspectDatabaseRestore.mockResolvedValue({ plan: { mode: 'full', files: [{ destination: 'main.db' }], retained: [], findings: ['Historical missing tag'] } })
  render(<RestoreDatabase />)
  fireEvent.change(screen.getByLabelText('Decrypted database files'), { target: { files: [new File(['db'], 'main.db')] } })
  await screen.findByText('Full restore')
  expect(screen.getByText('Historical missing tag')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('New PIN'), { target: { value: '123456' } })
  fireEvent.change(screen.getByLabelText('Confirm new PIN'), { target: { value: '654321' } })
  fireEvent.click(screen.getByRole('button', { name: 'Restore selected databases' }))
  expect(await screen.findByText('PINs must match and contain 6 to 12 digits.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByText('Full restore')).not.toBeInTheDocument()
  expect(service.restoreDatabases).not.toHaveBeenCalled()
})

it.each([new Error('Unreadable workspace'), 'unavailable'])('shows inspection failure and allows another selection', async failure => {
  service.inspectDatabaseRestore.mockRejectedValueOnce(failure).mockResolvedValueOnce({ plan: { mode: 'partial', files: [{ destination: 'shared.db' }], retained: ['main.db'], findings: [] } })
  render(<RestoreDatabase />)
  const input = screen.getByLabelText('Decrypted database files')
  fireEvent.change(input, { target: { files: [new File(['db'], 'shared.db')] } })
  expect(await screen.findByRole('alert')).toHaveTextContent(failure instanceof Error ? failure.message : 'Unable to inspect databases')
  fireEvent.change(input, { target: { files: [new File(['db'], 'shared.db')] } })
  await screen.findByText('Partial restore')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
it('ignores empty fallback selection and opens the fallback input when native picker is unavailable', () => {
  render(<RestoreDatabase />)
  const input = screen.getByLabelText('Decrypted database files')
  const click = vi.spyOn(input, 'click')
  fireEvent.click(screen.getByRole('button', { name: 'Select database files' }))
  expect(click).toHaveBeenCalledOnce()
  fireEvent.change(input, { target: { files: null } })
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(service.inspectDatabaseRestore).not.toHaveBeenCalled()
})
it('uses all files from the native picker to produce a full-set preview', async () => {
  const files = [new File(['main'], 'main.db'), new File(['shared'], 'shared.db')]
  Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: async () => files.map(file => ({ getFile: async () => file })) })
  service.inspectDatabaseRestore.mockImplementation(async selected => {
    if (selected.length !== 2 || selected[0].name !== 'main.db' || selected[1].name !== 'shared.db') throw new Error('Incomplete selection')
    return { plan: { mode: 'full', files: selected.map((file: File) => ({ destination: file.name })), retained: [], findings: [] } }
  })
  try {
    render(<RestoreDatabase />)
    fireEvent.click(screen.getByRole('button', { name: 'Select database files' }))
    await screen.findByText('Full restore')
    expect(screen.getByText('shared.db')).toBeInTheDocument()
  } finally { delete window.showOpenFilePicker }
})
it.each([new DOMException('Cancelled', 'AbortError'), new DOMException('Denied', 'NotAllowedError'), new Error('Picker unavailable')])('handles native picker cancellation and errors', async failure => {
  Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: async () => { throw failure } })
  try {
    render(<RestoreDatabase />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Select database files' })) })
    if (failure.name === 'AbortError') expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    else expect(screen.getByRole('alert')).toHaveTextContent('Unable to select database files')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  } finally { delete window.showOpenFilePicker }
})
it.each([new Error('Reload to finish recovery'), 'unexpected failure'])('keeps the preview available after an installation error', async failure => {
  service.inspectDatabaseRestore.mockResolvedValue({ plan: { mode: 'partial', files: [{ destination: 'workspace-1.db' }], retained: ['main.db'], findings: [] } })
  service.restoreDatabases.mockRejectedValue(failure)
  render(<RestoreDatabase />)
  fireEvent.change(screen.getByLabelText('Decrypted database files'), { target: { files: [new File(['db'], 'workspace-1.db')] } })
  await screen.findByText('Partial restore')
  fireEvent.click(screen.getByRole('button', { name: 'Restore selected databases' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(failure instanceof Error ? failure.message : 'Database restore failed')
  expect(screen.getByRole('button', { name: 'Restore selected databases' })).toBeEnabled()
  expect(screen.queryByText('Database restore completed.')).not.toBeInTheDocument()
  if (failure instanceof Error) expect(screen.getByRole('button', { name: 'Reload and recover' })).toBeEnabled()
})
