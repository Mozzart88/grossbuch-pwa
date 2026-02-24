import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { AppLayout } from '../../../../components/layout/AppLayout'
import { LayoutProvider } from '../../../../store/LayoutContext'

// Mock TabBar component
vi.mock('../../../../components/ui', () => ({
  TabBar: () => <nav data-testid="tab-bar">TabBar</nav>,
}))

// Mock ActionBar component
vi.mock('../../../../components/layout/ActionBar', () => ({
  ActionBar: () => <div data-testid="action-bar">ActionBar</div>,
}))

// Mock NavDrawer component
vi.mock('../../../../components/layout/NavDrawer', () => ({
  NavDrawer: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => (
    <div data-testid="nav-drawer" data-open={isOpen}>
      <button onClick={onClose}>Close drawer</button>
    </div>
  ),
}))

describe('AppLayout', () => {
  const renderLayout = (children: React.ReactNode = null) => {
    return render(
      <BrowserRouter>
        <LayoutProvider>
          <AppLayout>{children}</AppLayout>
        </LayoutProvider>
      </BrowserRouter>
    )
  }

  describe('Structure', () => {
    it('renders children content', () => {
      renderLayout(<div data-testid="child-content">Child Content</div>)

      expect(screen.getByTestId('child-content')).toBeInTheDocument()
      expect(screen.getByText('Child Content')).toBeInTheDocument()
    })

    it('renders TabBar component', () => {
      renderLayout()

      expect(screen.getByTestId('tab-bar')).toBeInTheDocument()
    })

    it('renders ActionBar component', () => {
      renderLayout()

      expect(screen.getByTestId('action-bar')).toBeInTheDocument()
    })

    it('has main element for content', () => {
      renderLayout(<p>Content</p>)

      expect(screen.getByRole('main')).toBeInTheDocument()
    })
  })

  describe('Global top bar', () => {
    it('renders the app logo', () => {
      renderLayout()

      expect(screen.getByRole('img', { name: 'Logo' })).toBeInTheDocument()
    })

    it('renders the hamburger menu button', () => {
      renderLayout()

      expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument()
    })

    it('renders a header element', () => {
      renderLayout()

      expect(screen.getByRole('banner')).toBeInTheDocument()
    })

    it('opens drawer when hamburger is clicked', () => {
      renderLayout()

      const drawer = screen.getByTestId('nav-drawer')
      expect(drawer).toHaveAttribute('data-open', 'false')

      const hamburger = screen.getByRole('button', { name: /open menu/i })
      fireEvent.click(hamburger)

      expect(drawer).toHaveAttribute('data-open', 'true')
    })

    it('closes drawer when onClose is called', () => {
      renderLayout()

      const hamburger = screen.getByRole('button', { name: /open menu/i })
      fireEvent.click(hamburger)

      const drawer = screen.getByTestId('nav-drawer')
      expect(drawer).toHaveAttribute('data-open', 'true')

      const closeButton = screen.getByRole('button', { name: /close drawer/i })
      fireEvent.click(closeButton)

      expect(drawer).toHaveAttribute('data-open', 'false')
    })
  })

  describe('Layout structure', () => {
    it('uses flex column layout', () => {
      const { container } = renderLayout()

      const wrapper = container.firstChild as HTMLElement
      expect(wrapper.className).toContain('flex')
      expect(wrapper.className).toContain('flex-col')
    })

    it('has min-height full', () => {
      const { container } = renderLayout()

      const wrapper = container.firstChild as HTMLElement
      expect(wrapper.className).toContain('min-h-full')
    })

    it('main has flex-1 for flexible content area', () => {
      renderLayout()

      const main = screen.getByRole('main')
      expect(main.className).toContain('flex-1')
    })

    it('main has bottom padding for TabBar', () => {
      renderLayout()

      const main = screen.getByRole('main')
      expect(main.className).toContain('pb-20')
    })
  })

  describe('Content rendering', () => {
    it('renders text content', () => {
      renderLayout(<span>Hello World</span>)

      expect(screen.getByText('Hello World')).toBeInTheDocument()
    })

    it('renders multiple children', () => {
      renderLayout(
        <>
          <div>First</div>
          <div>Second</div>
          <div>Third</div>
        </>
      )

      expect(screen.getByText('First')).toBeInTheDocument()
      expect(screen.getByText('Second')).toBeInTheDocument()
      expect(screen.getByText('Third')).toBeInTheDocument()
    })

    it('renders complex nested content', () => {
      renderLayout(
        <div data-testid="parent">
          <h1>Title</h1>
          <p>Description</p>
          <button>Click me</button>
        </div>
      )

      expect(screen.getByTestId('parent')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument()
      expect(screen.getByText('Description')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
    })

    it('handles null children', () => {
      renderLayout(null)

      // Should still render layout structure
      expect(screen.getByRole('main')).toBeInTheDocument()
      expect(screen.getByTestId('tab-bar')).toBeInTheDocument()
    })

    it('handles undefined children', () => {
      renderLayout(undefined)

      expect(screen.getByRole('main')).toBeInTheDocument()
    })
  })

  describe('Order of elements', () => {
    it('renders header before main in DOM order', () => {
      const { container } = renderLayout(<div>Content</div>)

      const wrapper = container.firstChild as HTMLElement
      const header = wrapper.querySelector('header')
      const main = wrapper.querySelector('main')

      expect(header).toBeTruthy()
      expect(main).toBeTruthy()

      const children = Array.from(wrapper.children)
      const headerIndex = children.indexOf(header as Element)
      const mainIndex = children.indexOf(main as Element)

      expect(headerIndex).toBeLessThan(mainIndex)
    })

    it('renders main before TabBar in DOM order', () => {
      const { container } = renderLayout(<div>Content</div>)

      const wrapper = container.firstChild as HTMLElement
      const main = wrapper.querySelector('main')
      const tabBar = wrapper.querySelector('[data-testid="tab-bar"]')

      expect(main).toBeTruthy()
      expect(tabBar).toBeTruthy()

      const children = Array.from(wrapper.children)
      const mainIndex = children.indexOf(main as Element)
      const tabBarIndex = children.indexOf(tabBar as Element)

      expect(mainIndex).toBeLessThan(tabBarIndex)
    })

    it('renders ActionBar after TabBar in DOM order', () => {
      const { container } = renderLayout(<div>Content</div>)

      const wrapper = container.firstChild as HTMLElement
      const tabBar = wrapper.querySelector('[data-testid="tab-bar"]')
      const actionBar = wrapper.querySelector('[data-testid="action-bar"]')

      expect(tabBar).toBeTruthy()
      expect(actionBar).toBeTruthy()

      const children = Array.from(wrapper.children)
      const tabBarIndex = children.indexOf(tabBar as Element)
      const actionBarIndex = children.indexOf(actionBar as Element)

      expect(tabBarIndex).toBeLessThan(actionBarIndex)
    })
  })

  describe('Accessibility', () => {
    it('uses semantic main element', () => {
      renderLayout(<p>Accessible content</p>)

      expect(screen.getByRole('main')).toBeInTheDocument()
    })

    it('content is within main element', () => {
      renderLayout(<div data-testid="content">Test</div>)

      const main = screen.getByRole('main')
      const content = screen.getByTestId('content')

      expect(main).toContainElement(content)
    })

    it('hamburger button has aria-label', () => {
      renderLayout()

      const button = screen.getByRole('button', { name: /open menu/i })
      expect(button).toHaveAttribute('aria-label', 'Open menu')
    })
  })
})
