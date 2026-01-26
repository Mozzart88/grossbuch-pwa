import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PageTabs } from '../../../../components/ui/PageTabs'

describe('PageTabs', () => {
  const tabs = [
    { id: 'tab1', label: 'Tab 1' },
    { id: 'tab2', label: 'Tab 2' },
    { id: 'tab3', label: 'Tab 3' },
  ]

  it('renders all tabs', () => {
    render(<PageTabs tabs={tabs} activeTab="tab1" onChange={() => {}} />)

    expect(screen.getByText('Tab 1')).toBeInTheDocument()
    expect(screen.getByText('Tab 2')).toBeInTheDocument()
    expect(screen.getByText('Tab 3')).toBeInTheDocument()
  })

  it('highlights the active tab', () => {
    render(<PageTabs tabs={tabs} activeTab="tab2" onChange={() => {}} />)

    const activeButton = screen.getByText('Tab 2').closest('button')
    expect(activeButton?.className).toContain('text-primary-600')
  })

  it('applies inactive styles to non-active tabs', () => {
    render(<PageTabs tabs={tabs} activeTab="tab1" onChange={() => {}} />)

    const inactiveButton = screen.getByText('Tab 2').closest('button')
    expect(inactiveButton?.className).toContain('text-gray-500')
  })

  it('calls onChange when a tab is clicked', () => {
    const onChange = vi.fn()
    render(<PageTabs tabs={tabs} activeTab="tab1" onChange={onChange} />)

    fireEvent.click(screen.getByText('Tab 2'))

    expect(onChange).toHaveBeenCalledWith('tab2')
  })

  it('shows active indicator under active tab', () => {
    const { container } = render(<PageTabs tabs={tabs} activeTab="tab1" onChange={() => {}} />)

    const activeIndicator = container.querySelector('.bg-primary-600')
    expect(activeIndicator).toBeInTheDocument()
  })

  it('renders with correct container styles', () => {
    const { container } = render(<PageTabs tabs={tabs} activeTab="tab1" onChange={() => {}} />)

    const tabContainer = container.firstChild
    expect(tabContainer).toHaveClass('flex')
    expect(tabContainer).toHaveClass('border-b')
  })

  it('handles single tab', () => {
    const singleTab = [{ id: 'only', label: 'Only Tab' }]
    render(<PageTabs tabs={singleTab} activeTab="only" onChange={() => {}} />)

    expect(screen.getByText('Only Tab')).toBeInTheDocument()
  })

  it('handles tab click on already active tab', () => {
    const onChange = vi.fn()
    render(<PageTabs tabs={tabs} activeTab="tab1" onChange={onChange} />)

    fireEvent.click(screen.getByText('Tab 1'))

    expect(onChange).toHaveBeenCalledWith('tab1')
  })
})
