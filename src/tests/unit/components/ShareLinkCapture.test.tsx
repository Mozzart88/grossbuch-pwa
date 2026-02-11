import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ShareLinkCapture } from '../../../components/ShareLinkCapture'
import { AUTH_STORAGE_KEYS } from '../../../types/auth'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('ShareLinkCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  const renderWithRouter = (initialEntry: string) => {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <ShareLinkCapture>
          <div data-testid="children">Child content</div>
        </ShareLinkCapture>
      </MemoryRouter>
    )
  }

  it('renders children on non-share paths', () => {
    renderWithRouter('/')
    expect(screen.getByTestId('children')).toBeInTheDocument()
  })

  it('renders children on other paths', () => {
    renderWithRouter('/settings')
    expect(screen.getByTestId('children')).toBeInTheDocument()
  })

  it('saves uuid to localStorage when on /share path', () => {
    renderWithRouter('/share?uuid=test-uuid-123')
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.SHARED_UUID)).toBe('test-uuid-123')
  })

  it('does not save to localStorage when uuid param is missing', () => {
    renderWithRouter('/share')
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.SHARED_UUID)).toBeNull()
  })

  it('redirects to / on /share path', () => {
    renderWithRouter('/share?uuid=test-uuid-123')
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
  })

  it('returns null on /share path', () => {
    const { container } = renderWithRouter('/share?uuid=test-uuid')
    expect(container.innerHTML).toBe('')
  })

  it('does not navigate on non-share paths', () => {
    renderWithRouter('/')
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('does not modify localStorage on non-share paths', () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.SHARED_UUID, 'existing-value')
    renderWithRouter('/settings')
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.SHARED_UUID)).toBe('existing-value')
  })
})
