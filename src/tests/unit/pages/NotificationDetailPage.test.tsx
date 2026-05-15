import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { NotificationDetailPage } from '../../../pages/NotificationDetailPage'
import type { Notification } from '../../../types'

const {
  mockNavigate,
  mockNotificationRepository,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockNotificationRepository: {
    findByHexId: vi.fn(),
    markReaded: vi.fn(),
  },
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('../../../services/repositories', () => ({
  notificationRepository: mockNotificationRepository,
}))

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: new Uint8Array([1, 2, 3]),
    type: 'plain',
    status: 'new',
    timestamp: 1700000000,
    readed_at: null,
    updated_at: 1700000000,
    payload: {
      title: 'Plain title',
      body: 'Full plain body',
    },
    ...overrides,
  } as Notification
}

function renderPage(initialEntry = '/notifications/010203', path = '/notifications/:id') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path={path} element={<NotificationDetailPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('NotificationDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNotificationRepository.findByHexId.mockResolvedValue(notification())
    mockNotificationRepository.markReaded.mockResolvedValue(undefined)
  })

  it('loads a plain notification, marks it readed, and displays the body', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Plain title' })).toBeInTheDocument()
    expect(screen.getByText('Full plain body')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Notification' })).toBeInTheDocument()
    expect(mockNotificationRepository.findByHexId).toHaveBeenCalledWith('010203')
    expect(mockNotificationRepository.markReaded).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]))
  })

  it('shows not found when the notification is missing', async () => {
    mockNotificationRepository.findByHexId.mockResolvedValue(null)

    renderPage()

    expect(await screen.findByText('Notification not found')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Go Back' }))
    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  it('shows not found for transaction notifications', async () => {
    mockNotificationRepository.findByHexId.mockResolvedValue(notification({
      type: 'transaction',
      payload: {
        title: 'Draft transaction',
        mode: 'expense',
        draft: {
          timestamp: 1700000000,
          lines: [],
        },
      },
    }))

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Notification not found')).toBeInTheDocument()
    })
    expect(mockNotificationRepository.markReaded).not.toHaveBeenCalled()
  })

  it('handles a route without an id parameter', async () => {
    renderPage('/', '/')

    expect(await screen.findByText('Notification not found')).toBeInTheDocument()
    expect(mockNotificationRepository.findByHexId).not.toHaveBeenCalled()
  })
})
