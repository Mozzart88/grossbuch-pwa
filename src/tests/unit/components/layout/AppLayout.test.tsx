import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { AppLayout } from '../../../../components/layout/AppLayout'

// Mock TabBar component
vi.mock('../../../../components/ui', () => ({
  TabBar: () => <nav data-testid="tab-bar">TabBar</nav>,
}))

describe('AppLayout', () => {
  const renderLayout = (children: React.ReactNode = null) => {
    return render(
      <BrowserRouter>
        <AppLayout>{children}</AppLayout>
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

    it('has main element for content', () => {
      renderLayout(<p>Content</p>)

      expect(screen.getByRole('main')).toBeInTheDocument()
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

    it('main has safe area padding at top', () => {
      renderLayout()

      const main = screen.getByRole('main')
      expect(main.className).toContain('pt-safe')
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
    it('renders main before TabBar in DOM order', () => {
      const { container } = renderLayout(<div>Content</div>)

      const wrapper = container.firstChild as HTMLElement
      const main = wrapper.querySelector('main')
      const tabBar = wrapper.querySelector('[data-testid="tab-bar"]')

      // Check that main comes before nav in DOM
      expect(main).toBeTruthy()
      expect(tabBar).toBeTruthy()

      const children = Array.from(wrapper.children)
      const mainIndex = children.indexOf(main as Element)
      const tabBarIndex = children.indexOf(tabBar as Element)

      expect(mainIndex).toBeLessThan(tabBarIndex)
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
  })
})
