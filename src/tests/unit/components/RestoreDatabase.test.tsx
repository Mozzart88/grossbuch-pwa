import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
