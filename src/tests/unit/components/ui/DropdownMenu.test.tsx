import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { DropdownMenu } from '../../../../components/ui/DropdownMenu'
import type { DropdownMenuItem } from '../../../../components/ui/DropdownMenu'

describe('DropdownMenu', () => {
  const mockItems: DropdownMenuItem[] = [
    { label: 'Edit', onClick: vi.fn() },
    { label: 'Delete', onClick: vi.fn(), variant: 'danger' },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders trigger button', () => {
    render(<DropdownMenu items={mockItems} />)

    expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument()
  })

  it('opens menu on trigger click', () => {
    render(<DropdownMenu items={mockItems} />)

    const trigger = screen.getByRole('button', { expanded: false })
    fireEvent.click(trigger)

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('closes menu on trigger click when open', () => {
    render(<DropdownMenu items={mockItems} />)

    const trigger = screen.getByRole('button', { expanded: false })
    fireEvent.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.click(trigger)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('calls onClick handler when item clicked', () => {
    const onClick = vi.fn()
    const items: DropdownMenuItem[] = [{ label: 'Test Action', onClick }]

    render(<DropdownMenu items={items} />)

    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByText('Test Action'))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('closes menu after item click', () => {
    render(<DropdownMenu items={mockItems} />)

    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Edit'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes menu on click outside', () => {
    render(
      <div>
        <div data-testid="outside">Outside element</div>
        <DropdownMenu items={mockItems} />
      </div>
    )

    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes menu on Escape key', () => {
    render(<DropdownMenu items={mockItems} />)

    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('applies danger variant styling', () => {
    const items: DropdownMenuItem[] = [
      { label: 'Danger Action', onClick: vi.fn(), variant: 'danger' },
    ]

    render(<DropdownMenu items={items} />)

    fireEvent.click(screen.getByRole('button'))
    const dangerItem = screen.getByText('Danger Action')

    expect(dangerItem.className).toContain('text-red-600')
  })

  it('disables item when disabled prop is true', () => {
    const onClick = vi.fn()
    const items: DropdownMenuItem[] = [
      { label: 'Disabled Action', onClick, disabled: true },
    ]

    render(<DropdownMenu items={items} />)

    fireEvent.click(screen.getByRole('button'))
    const disabledItem = screen.getByText('Disabled Action')

    expect(disabledItem).toBeDisabled()
    expect(disabledItem.className).toContain('disabled:opacity-50')
  })

  it('has correct ARIA attributes', () => {
    render(<DropdownMenu items={mockItems} />)

    const trigger = screen.getByRole('button')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')

    fireEvent.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getAllByRole('menuitem')).toHaveLength(2)
  })

  it('applies custom className', () => {
    const { container } = render(<DropdownMenu items={mockItems} className="custom-class" />)

    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain('custom-class')
  })

  it('cleans up event listeners on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener')

    const { unmount } = render(<DropdownMenu items={mockItems} />)

    // Open the menu to attach listeners
    fireEvent.click(screen.getByRole('button'))

    unmount()

    // Check that both mousedown and keydown listeners were removed
    expect(removeEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function))
    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function))

    removeEventListenerSpy.mockRestore()
  })

  it('renders all menu items', () => {
    const items: DropdownMenuItem[] = [
      { label: 'Item 1', onClick: vi.fn() },
      { label: 'Item 2', onClick: vi.fn() },
      { label: 'Item 3', onClick: vi.fn() },
    ]

    render(<DropdownMenu items={items} />)

    fireEvent.click(screen.getByRole('button'))

    expect(screen.getAllByRole('menuitem')).toHaveLength(3)
  })
})
