import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { renderGoalNote } from '../../../../components/goals/goalNoteMarkdown'

describe('renderGoalNote', () => {
  it('renders bold text with ** and __', () => {
    const { container } = render(<>{renderGoalNote('This is **bold** and __also bold__')}</>)
    const strongs = container.querySelectorAll('strong')
    expect(strongs.length).toBe(2)
    expect(strongs[0].textContent).toBe('bold')
    expect(strongs[1].textContent).toBe('also bold')
  })

  it('renders italic text with * and _', () => {
    const { container } = render(<>{renderGoalNote('This is *italic* and _also italic_')}</>)
    const ems = container.querySelectorAll('em')
    expect(ems.length).toBe(2)
    expect(ems[0].textContent).toBe('italic')
    expect(ems[1].textContent).toBe('also italic')
  })

  it('renders an unordered list', () => {
    const { container } = render(<>{renderGoalNote('- first\n- second\n- third')}</>)
    const items = container.querySelectorAll('ul li')
    expect(items.length).toBe(3)
    expect(items[0].textContent).toBe('first')
  })

  it('renders an ordered list', () => {
    const { container } = render(<>{renderGoalNote('1. first\n2. second')}</>)
    const items = container.querySelectorAll('ol li')
    expect(items.length).toBe(2)
  })

  it('autodetects http(s) links and renders them as anchors', () => {
    const { container } = render(<>{renderGoalNote('Check https://example.com for details')}</>)
    const link = container.querySelector('a')
    expect(link).not.toBeNull()
    expect(link!.getAttribute('href')).toBe('https://example.com')
    expect(link!.getAttribute('target')).toBe('_blank')
  })

  it('renders plain paragraphs with no special syntax as-is', () => {
    const { container } = render(<>{renderGoalNote('Just a plain note.')}</>)
    expect(container.textContent).toContain('Just a plain note.')
  })

  it('skips blank lines between paragraphs', () => {
    const { container } = render(<>{renderGoalNote('First paragraph.\n\nSecond paragraph.')}</>)
    const paragraphs = container.querySelectorAll('p')
    expect(paragraphs.length).toBe(2)
  })

  it('handles a mix of bold, list, and a link in one note', () => {
    const { container } = render(<>{renderGoalNote('**Plan**\n- save https://example.com\n- spend less')}</>)
    expect(container.querySelector('strong')!.textContent).toBe('Plan')
    expect(container.querySelectorAll('ul li').length).toBe(2)
    expect(container.querySelector('a')).not.toBeNull()
  })
})
