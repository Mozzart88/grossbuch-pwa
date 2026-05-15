import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NotificationDrawer } from '../../../../components/layout/NotificationDrawer'
import type { Notification } from '../../../../types'

const {
  mockNavigate,
  mockOnDbWrite,
  mockUnsubscribe,
  mockNotificationRepository,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockOnDbWrite: vi.fn(),
  mockUnsubscribe: vi.fn(),
  mockNotificationRepository: {
    findAll: vi.fn(),
    unreadCount: vi.fn(),
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

vi.mock('../../../../services/database/connection', () => ({
  onDbWrite: (callback: () => void) => mockOnDbWrite(callback),
}))

vi.mock('../../../../services/repositories', () => ({
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
      title: 'System message',
      body: 'Read this',
    },
    ...overrides,
  } as Notification
}

function renderDrawer(props: Partial<React.ComponentProps<typeof NotificationDrawer>> = {}) {
  return render(
    <MemoryRouter>
      <NotificationDrawer
        isOpen
        onClose={vi.fn()}
        {...props}
      />
    </MemoryRouter>
  )
}

describe('NotificationDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUnsubscribe.mockClear()
    mockOnDbWrite.mockReturnValue(mockUnsubscribe)
    mockNotificationRepository.findAll.mockResolvedValue([])
    mockNotificationRepository.unreadCount.mockResolvedValue(0)
    mockNotificationRepository.markReaded.mockResolvedValue(undefined)
  })

  it('loads notifications, reports unread count, and subscribes to database writes', async () => {
    const onUnreadCountChange = vi.fn()
    mockNotificationRepository.findAll.mockResolvedValue([
      notification(),
    ])
    mockNotificationRepository.unreadCount.mockResolvedValue(1)

    const { unmount } = renderDrawer({ onUnreadCountChange })

    expect(await screen.findByText('System message')).toBeInTheDocument()
    expect(screen.getByText('New')).toBeInTheDocument()
    expect(onUnreadCountChange).toHaveBeenCalledWith(1)
    expect(mockOnDbWrite).toHaveBeenCalledWith(expect.any(Function))

    unmount()
    expect(mockUnsubscribe).toHaveBeenCalled()
  })

  it('reloads when the drawer opens and renders an empty state', async () => {
    const { rerender } = render(
      <MemoryRouter>
        <NotificationDrawer isOpen={false} onClose={vi.fn()} />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('No notifications')).toBeInTheDocument()
    })

    rerender(
      <MemoryRouter>
        <NotificationDrawer isOpen onClose={vi.fn()} />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(mockNotificationRepository.findAll).toHaveBeenCalledTimes(2)
    })
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument()
  })

  it('marks plain notifications readed and navigates to the detail page', async () => {
    const onClose = vi.fn()
    mockNotificationRepository.findAll.mockResolvedValue([
      notification({ id: new Uint8Array([10, 11]) }),
    ])

    renderDrawer({ onClose })

    fireEvent.click(await screen.findByText('System message'))

    await waitFor(() => {
      expect(mockNotificationRepository.markReaded).toHaveBeenCalledWith(new Uint8Array([10, 11]))
      expect(onClose).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/notifications/0a0b')
    })
  })

  it('marks transaction notifications readed and navigates to the add transaction flow', async () => {
    mockNotificationRepository.findAll.mockResolvedValue([
      notification({
        id: new Uint8Array([12, 13]),
        type: 'transaction',
        status: 'readed',
        payload: {
          title: 'Draft transaction',
          mode: 'expense',
          draft: {
            timestamp: 1700000000,
            lines: [],
          },
        },
      }),
    ])

    renderDrawer()

    fireEvent.click(await screen.findByText('Draft transaction'))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/add?notification=0c0d')
    })
    expect(screen.queryByText('New')).not.toBeInTheDocument()
  })

  it('closes when the overlay and close button are clicked', async () => {
    const onClose = vi.fn()
    const { container } = renderDrawer({ onClose })

    await screen.findByText('No notifications')

    fireEvent.click(container.querySelector('.bg-black\\/50') as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'Close notifications' }))

    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
