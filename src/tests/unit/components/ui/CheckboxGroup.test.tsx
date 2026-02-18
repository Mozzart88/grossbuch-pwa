import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CheckboxGroup } from '../../../../components/ui/CheckboxGroup'

const defaultOptions = [
  { value: 1, label: 'Option 1' },
  { value: 2, label: 'Option 2' },
  { value: 3, label: 'Option 3' },
]

describe('CheckboxGroup', () => {
  describe('rendering', () => {
    it('renders the label', () => {
      render(
        <CheckboxGroup label="Categories" options={defaultOptions} selected={[]} onChange={vi.fn()} />
      )

      expect(screen.getByText('Categories')).toBeInTheDocument()
    })

    it('renders the toggle button', () => {
      render(
        <CheckboxGroup label="Categories" options={defaultOptions} selected={[]} onChange={vi.fn()} />
      )

      expect(screen.getByRole('button', { name: /categories/i })).toBeInTheDocument()
    })
  })

  describe('collapsed state', () => {
    it('is collapsed by default', () => {
      render(
        <CheckboxGroup label="Categories" options={defaultOptions} selected={[]} onChange={vi.fn()} />
      )

      expect(screen.queryByText('Option 1')).not.toBeInTheDocument()
      expect(screen.queryByText('Option 2')).not.toBeInTheDocument()
      expect(screen.queryByText('Option 3')).not.toBeInTheDocument()
    })

    it('does not show Select All button when collapsed', () => {
      render(
        <CheckboxGroup label="Categories" options={defaultOptions} selected={[]} onChange={vi.fn()} />
      )

      expect(screen.queryByText('Select All')).not.toBeInTheDocument()
    })

    it('does not show checkboxes when collapsed', () => {
      render(
        <CheckboxGroup label="Categories" options={defaultOptions} selected={[]} onChange={vi.fn()} />
      )

      expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    })
  })

  describe('expanding and collapsing', () => {
    it('expands on click to show options', () => {
      render(
        <CheckboxGroup label="Categories" options={defaultOptions} selected={[]} onChange={vi.fn()} />
      )

      fireEvent.click(screen.getByRole('button', { name: /categories/i }))

      expect(screen.getByText('Option 1')).toBeInTheDocument()
      expect(screen.getByText('Option 2')).toBeInTheDocument()
      expect(screen.getByText('Option 3')).toBeInTheDocument()
    })

    it('shows checkboxes when expanded', () => {
      render(
        <CheckboxGroup label="Categories" options={defaultOptions} selected={[]} onChange={vi.fn()} />
      )

      fireEvent.click(screen.getByRole('button', { name: /categories/i }))

      expect(screen.getAllByRole('checkbox')).toHaveLength(3)
    })

    it('collapses on second click', () => {
      render(
        <CheckboxGroup label="Categories" options={defaultOptions} selected={[]} onChange={vi.fn()} />
      )

      const trigger = screen.getByRole('button', { name: /categories/i })

      fireEvent.click(trigger)
      expect(screen.getByText('Option 1')).toBeInTheDocument()

      fireEvent.click(trigger)
      expect(screen.queryByText('Option 1')).not.toBeInTheDocument()
    })

    it('applies rotate-180 class to chevron when open', () => {
      const { container } = render(
        <CheckboxGroup label="Categories" options={defaultOptions} selected={[]} onChange={vi.fn()} />
      )

      const svg = container.querySelector('svg')!
      expect(svg.className.baseVal).not.toContain('rotate-180')

      fireEvent.click(screen.getByRole('button', { name: /categories/i }))

      expect(svg.className.baseVal).toContain('rotate-180')
    })
  })

  describe('selected badge', () => {
    it('shows "N selected" badge when items are selected', () => {
      render(
        <CheckboxGroup label="Categories" options={defaultOptions} selected={[1, 2]} onChange={vi.fn()} />
      )

      expect(screen.getByText('2 selected')).toBeInTheDocument()
    })

    it('shows correct count for single selection', () => {
      render(
        <CheckboxGroup label="Categories" options={defaultOptions} selected={[3]} onChange={vi.fn()} />
      )

      expect(screen.getByText('1 selected')).toBeInTheDocument()
    })

    it('shows correct count when all selected', () => {
      render(
        <CheckboxGroup label="Categories" options={defaultOptions} selected={[1, 2, 3]} onChange={vi.fn()} />
      )

      expect(screen.getByText('3 selected')).toBeInTheDocument()
    })

    it('does not show badge when nothing is selected', () => {
      render(
        <CheckboxGroup label="Categories" options={defaultOptions} selected={[]} onChange={vi.fn()} />
      )

      expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
    })
  })

  describe('Select All / Clear button', () => {
    it('shows "Select All" when no items are selected', () => {
      render(
        <CheckboxGroup label="Categories" options={defaultOptions} selected={[]} onChange={vi.fn()} />
      )

      fireEvent.click(screen.getByRole('button', { name: /categories/i }))

      expect(screen.getByText('Select All')).toBeInTheDocument()
    })

    it('shows "Select All" when some items are selected (partial)', () => {
      render(
        <CheckboxGroup label="Categories" options={defaultOptions} selected={[1]} onChange={vi.fn()} />
      )

      fireEvent.click(screen.getByRole('button', { name: /categories/i }))

      expect(screen.getByText('Select All')).toBeInTheDocument()
    })

    it('shows "Clear" when all items are selected', () => {
      render(
        <CheckboxGroup label="Categories" options={defaultOptions} selected={[1, 2, 3]} onChange={vi.fn()} />
      )

      fireEvent.click(screen.getByRole('button', { name: /categories/i }))

      expect(screen.getByText('Clear')).toBeInTheDocument()
    })
  })

  describe('toggling individual checkboxes', () => {
    it('calls onChange to add a value when unchecked checkbox is clicked', () => {
      const onChange = vi.fn()
      render(
        <CheckboxGroup label="Categories" options={defaultOptions} selected={[1]} onChange={onChange} />
      )

      fireEvent.click(screen.getByRole('button', { name: /categories/i }))

      const checkboxes = screen.getAllByRole('checkbox')
      // Click on "Option 2" (index 1), which is currently unchecked
      fireEvent.click(checkboxes[1])

      expect(onChange).toHaveBeenCalledWith([1, 2])
    })

    it('calls onChange to remove a value when checked checkbox is clicked', () => {
      const onChange = vi.fn()
      render(
        <CheckboxGroup label="Categories" options={defaultOptions} selected={[1, 2]} onChange={onChange} />
      )

      fireEvent.click(screen.getByRole('button', { name: /categories/i }))

      const checkboxes = screen.getAllByRole('checkbox')
      // Click on "Option 1" (index 0), which is currently checked
      fireEvent.click(checkboxes[0])

      expect(onChange).toHaveBeenCalledWith([2])
    })

    it('marks checked checkboxes correctly', () => {
      render(
        <CheckboxGroup label="Categories" options={defaultOptions} selected={[1, 3]} onChange={vi.fn()} />
      )

      fireEvent.click(screen.getByRole('button', { name: /categories/i }))

      const checkboxes = screen.getAllByRole('checkbox')
      expect(checkboxes[0]).toBeChecked()     // value 1 selected
      expect(checkboxes[1]).not.toBeChecked() // value 2 not selected
      expect(checkboxes[2]).toBeChecked()     // value 3 selected
    })
  })

  describe('Select All action', () => {
    it('selects all options when none are selected', () => {
      const onChange = vi.fn()
      render(
        <CheckboxGroup label="Categories" options={defaultOptions} selected={[]} onChange={onChange} />
      )

      fireEvent.click(screen.getByRole('button', { name: /categories/i }))
      fireEvent.click(screen.getByText('Select All'))

      expect(onChange).toHaveBeenCalledWith([1, 2, 3])
    })

    it('selects all options when partially selected', () => {
      const onChange = vi.fn()
      render(
        <CheckboxGroup label="Categories" options={defaultOptions} selected={[2]} onChange={onChange} />
      )

      fireEvent.click(screen.getByRole('button', { name: /categories/i }))
      fireEvent.click(screen.getByText('Select All'))

      expect(onChange).toHaveBeenCalledWith([1, 2, 3])
    })
  })

  describe('Clear action', () => {
    it('clears all options when all are selected', () => {
      const onChange = vi.fn()
      render(
        <CheckboxGroup label="Categories" options={defaultOptions} selected={[1, 2, 3]} onChange={onChange} />
      )

      fireEvent.click(screen.getByRole('button', { name: /categories/i }))
      fireEvent.click(screen.getByText('Clear'))

      expect(onChange).toHaveBeenCalledWith([])
    })
  })

  describe('empty options list', () => {
    it('renders with no options when list is empty', () => {
      render(
        <CheckboxGroup label="Categories" options={[]} selected={[]} onChange={vi.fn()} />
      )

      fireEvent.click(screen.getByRole('button', { name: /categories/i }))

      expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    })

    it('shows "Select All" button even when options are empty', () => {
      render(
        <CheckboxGroup label="Categories" options={[]} selected={[]} onChange={vi.fn()} />
      )

      fireEvent.click(screen.getByRole('button', { name: /categories/i }))

      expect(screen.getByText('Select All')).toBeInTheDocument()
    })

    it('does not show badge when empty options and no selection', () => {
      render(
        <CheckboxGroup label="Categories" options={[]} selected={[]} onChange={vi.fn()} />
      )

      expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
    })

    it('allSelected is false when options are empty (even if selected is empty)', () => {
      render(
        <CheckboxGroup label="Categories" options={[]} selected={[]} onChange={vi.fn()} />
      )

      fireEvent.click(screen.getByRole('button', { name: /categories/i }))

      // With empty options, allSelected is false (options.length > 0 fails),
      // so the button should show "Select All" not "Clear"
      expect(screen.getByText('Select All')).toBeInTheDocument()
      expect(screen.queryByText('Clear')).not.toBeInTheDocument()
    })

    it('toggleAll with empty options and noneSelected calls onChange with empty array', () => {
      const onChange = vi.fn()
      render(
        <CheckboxGroup label="Categories" options={[]} selected={[]} onChange={onChange} />
      )

      fireEvent.click(screen.getByRole('button', { name: /categories/i }))
      fireEvent.click(screen.getByText('Select All'))

      // noneSelected is true, allSelected is false
      // toggleAll enters the (allSelected || noneSelected) branch
      // since allSelected is false, it maps options to values => []
      expect(onChange).toHaveBeenCalledWith([])
    })
  })

  describe('toggleAll logic edge cases', () => {
    it('when allSelected is true, onChange is called with empty array', () => {
      const onChange = vi.fn()
      render(
        <CheckboxGroup
          label="Categories"
          options={[{ value: 10, label: 'Only' }]}
          selected={[10]}
          onChange={onChange}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /categories/i }))
      fireEvent.click(screen.getByText('Clear'))

      expect(onChange).toHaveBeenCalledWith([])
    })

    it('when noneSelected is true, onChange is called with all option values', () => {
      const onChange = vi.fn()
      render(
        <CheckboxGroup
          label="Categories"
          options={[{ value: 10, label: 'A' }, { value: 20, label: 'B' }]}
          selected={[]}
          onChange={onChange}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /categories/i }))
      fireEvent.click(screen.getByText('Select All'))

      expect(onChange).toHaveBeenCalledWith([10, 20])
    })

    it('when partially selected (not all, not none), onChange selects all', () => {
      const onChange = vi.fn()
      render(
        <CheckboxGroup
          label="Categories"
          options={[{ value: 10, label: 'A' }, { value: 20, label: 'B' }, { value: 30, label: 'C' }]}
          selected={[20]}
          onChange={onChange}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /categories/i }))
      fireEvent.click(screen.getByText('Select All'))

      // Partial selection: neither allSelected nor noneSelected, goes to else branch
      expect(onChange).toHaveBeenCalledWith([10, 20, 30])
    })
  })
})
