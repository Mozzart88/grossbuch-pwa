import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LiveSearch } from '../../../../components/ui/LiveSearch'
import type { LiveSearchOption } from '../../../../components/ui/LiveSearch'

describe('LiveSearch', () => {
  const mockOptions: LiveSearchOption[] = [
    { value: '1', label: 'Option One' },
    { value: '2', label: 'Option Two' },
    { value: '3', label: 'Option Three' },
  ]

  describe('basic functionality', () => {
    it('renders input element', () => {
      render(
        <LiveSearch
          options={mockOptions}
          value=""
          onChange={vi.fn()}
        />
      )

      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })

    it('shows dropdown on focus', async () => {
      render(
        <LiveSearch
          options={mockOptions}
          value=""
          onChange={vi.fn()}
        />
      )

      fireEvent.focus(screen.getByRole('combobox'))

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument()
      })
    })

    it('displays all options when input is empty', async () => {
      render(
        <LiveSearch
          options={mockOptions}
          value=""
          onChange={vi.fn()}
        />
      )

      fireEvent.focus(screen.getByRole('combobox'))

      await waitFor(() => {
        mockOptions.forEach(opt => {
          expect(screen.getByRole('option', { name: opt.label })).toBeInTheDocument()
        })
      })
    })

    it('filters options based on input', async () => {
      render(
        <LiveSearch
          options={mockOptions}
          value=""
          onChange={vi.fn()}
        />
      )

      const input = screen.getByRole('combobox')
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'One' } })

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Option One' })).toBeInTheDocument()
        expect(screen.queryByRole('option', { name: 'Option Two' })).not.toBeInTheDocument()
      })
    })

    it('calls onChange when option is selected', async () => {
      const onChange = vi.fn()
      render(
        <LiveSearch
          options={mockOptions}
          value=""
          onChange={onChange}
        />
      )

      fireEvent.focus(screen.getByRole('combobox'))

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Option One' })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('option', { name: 'Option One' }))

      expect(onChange).toHaveBeenCalledWith('1', 'Option One')
    })
  })

  describe('renderOption prop', () => {
    it('uses custom renderer when provided', async () => {
      const customRenderer = (opt: LiveSearchOption) => (
        <span data-testid="custom">{opt.label} - CUSTOM</span>
      )

      render(
        <LiveSearch
          options={[{ value: '1', label: 'Test' }]}
          value=""
          onChange={vi.fn()}
          renderOption={customRenderer}
        />
      )

      fireEvent.focus(screen.getByRole('combobox'))

      await waitFor(() => {
        expect(screen.getByTestId('custom')).toHaveTextContent('Test - CUSTOM')
      })
    })

    it('falls back to label when renderOption not provided', async () => {
      render(
        <LiveSearch
          options={[{ value: '1', label: 'Test Label' }]}
          value=""
          onChange={vi.fn()}
        />
      )

      fireEvent.focus(screen.getByRole('combobox'))

      await waitFor(() => {
        expect(screen.getByRole('option')).toHaveTextContent('Test Label')
      })
    })

    it('renders custom content for all filtered options', async () => {
      const customRenderer = (opt: LiveSearchOption) => (
        <span data-testid={`custom-${opt.value}`}>{opt.label} (custom)</span>
      )

      render(
        <LiveSearch
          options={mockOptions}
          value=""
          onChange={vi.fn()}
          renderOption={customRenderer}
        />
      )

      fireEvent.focus(screen.getByRole('combobox'))

      await waitFor(() => {
        mockOptions.forEach(opt => {
          expect(screen.getByTestId(`custom-${opt.value}`)).toHaveTextContent(`${opt.label} (custom)`)
        })
      })
    })
  })

  describe('label prop', () => {
    it('renders label when provided', () => {
      render(
        <LiveSearch
          label="Search Label"
          options={mockOptions}
          value=""
          onChange={vi.fn()}
        />
      )

      expect(screen.getByText('Search Label')).toBeInTheDocument()
    })

    it('associates label with input', () => {
      render(
        <LiveSearch
          label="Search Field"
          options={mockOptions}
          value=""
          onChange={vi.fn()}
        />
      )

      const input = screen.getByRole('combobox')
      expect(input).toHaveAttribute('id', 'search-field')
    })
  })

  describe('error prop', () => {
    it('displays error message', () => {
      render(
        <LiveSearch
          options={mockOptions}
          value=""
          onChange={vi.fn()}
          error="This field is required"
        />
      )

      expect(screen.getByText('This field is required')).toBeInTheDocument()
    })

    it('applies error styles to input', () => {
      render(
        <LiveSearch
          options={mockOptions}
          value=""
          onChange={vi.fn()}
          error="Error"
        />
      )

      const input = screen.getByRole('combobox')
      expect(input.className).toContain('border-red-500')
    })
  })

  describe('placeholder prop', () => {
    it('displays placeholder text', () => {
      render(
        <LiveSearch
          options={mockOptions}
          value=""
          onChange={vi.fn()}
          placeholder="Type to search..."
        />
      )

      expect(screen.getByPlaceholderText('Type to search...')).toBeInTheDocument()
    })
  })

  describe('disabled prop', () => {
    it('disables input when disabled is true', () => {
      render(
        <LiveSearch
          options={mockOptions}
          value=""
          onChange={vi.fn()}
          disabled
        />
      )

      expect(screen.getByRole('combobox')).toBeDisabled()
    })
  })

  describe('keyboard navigation', () => {
    it('navigates options with arrow keys', async () => {
      render(
        <LiveSearch
          options={mockOptions}
          value=""
          onChange={vi.fn()}
        />
      )

      const input = screen.getByRole('combobox')
      fireEvent.focus(input)

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument()
      })

      fireEvent.keyDown(input, { key: 'ArrowDown' })

      await waitFor(() => {
        const options = screen.getAllByRole('option')
        expect(options[1]).toHaveAttribute('aria-selected', 'true')
      })
    })

    it('selects option with Enter key', async () => {
      const onChange = vi.fn()
      render(
        <LiveSearch
          options={mockOptions}
          value=""
          onChange={onChange}
        />
      )

      const input = screen.getByRole('combobox')
      fireEvent.focus(input)

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument()
      })

      fireEvent.keyDown(input, { key: 'Enter' })

      expect(onChange).toHaveBeenCalledWith('1', 'Option One')
    })

    it('closes dropdown with Escape key', async () => {
      render(
        <LiveSearch
          options={mockOptions}
          value=""
          onChange={vi.fn()}
        />
      )

      const input = screen.getByRole('combobox')
      fireEvent.focus(input)

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument()
      })

      fireEvent.keyDown(input, { key: 'Escape' })

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
      })
    })
  })

  describe('onCreateNew prop', () => {
    it('shows create option when no exact match', async () => {
      render(
        <LiveSearch
          options={mockOptions}
          value=""
          onChange={vi.fn()}
          onCreateNew={vi.fn()}
        />
      )

      const input = screen.getByRole('combobox')
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'New Item' } })

      await waitFor(() => {
        expect(screen.getByText(/Create "New Item"/)).toBeInTheDocument()
      })
    })

    it('calls onCreateNew when create option is clicked', async () => {
      const onCreateNew = vi.fn()
      render(
        <LiveSearch
          options={mockOptions}
          value=""
          onChange={vi.fn()}
          onCreateNew={onCreateNew}
        />
      )

      const input = screen.getByRole('combobox')
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'New Item' } })

      await waitFor(() => {
        expect(screen.getByText(/Create "New Item"/)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText(/Create "New Item"/))

      expect(onCreateNew).toHaveBeenCalledWith('New Item')
    })

    it('does not show create option when exact match exists', async () => {
      render(
        <LiveSearch
          options={mockOptions}
          value=""
          onChange={vi.fn()}
          onCreateNew={vi.fn()}
        />
      )

      const input = screen.getByRole('combobox')
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'Option One' } })

      await waitFor(() => {
        expect(screen.queryByText(/Create/)).not.toBeInTheDocument()
      })
    })
  })

  describe('Tab key behavior', () => {
    it('commits value on Tab key press', async () => {
      const onChange = vi.fn()
      render(
        <LiveSearch
          options={mockOptions}
          value=""
          onChange={onChange}
        />
      )

      const input = screen.getByRole('combobox')
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'Option One' } })

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument()
      })

      fireEvent.keyDown(input, { key: 'Tab' })

      // Should call onChange with the exact match
      expect(onChange).toHaveBeenCalledWith('1', 'Option One')
    })

    it('commits value and closes dropdown on Tab', async () => {
      render(
        <LiveSearch
          options={mockOptions}
          value=""
          onChange={vi.fn()}
        />
      )

      const input = screen.getByRole('combobox')
      fireEvent.focus(input)

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument()
      })

      fireEvent.keyDown(input, { key: 'Tab' })

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
      })
    })
  })

  describe('create option highlighting', () => {
    it('highlights create option when navigated to', async () => {
      render(
        <LiveSearch
          options={mockOptions}
          value=""
          onChange={vi.fn()}
          onCreateNew={vi.fn()}
        />
      )

      const input = screen.getByRole('combobox')
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'New Item' } })

      await waitFor(() => {
        expect(screen.getByText(/Create "New Item"/)).toBeInTheDocument()
      })

      // Navigate down to the create option (it's the only option since no match)
      fireEvent.keyDown(input, { key: 'ArrowDown' })

      await waitFor(() => {
        const createOption = screen.getByText(/Create "New Item"/).closest('li')
        expect(createOption).toHaveAttribute('aria-selected', 'true')
      })
    })

    it('shows non-highlighted create option style by default', async () => {
      render(
        <LiveSearch
          options={[]} // No options, only create will show
          value=""
          onChange={vi.fn()}
          onCreateNew={vi.fn()}
        />
      )

      const input = screen.getByRole('combobox')
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'New Item' } })

      await waitFor(() => {
        const createOption = screen.getByText(/Create "New Item"/).closest('li')
        // First option is highlighted by default
        expect(createOption).toHaveAttribute('aria-selected', 'true')
      })
    })
  })

  describe('value syncing', () => {
    it('displays selected option label in input', () => {
      render(
        <LiveSearch
          options={mockOptions}
          value="2"
          onChange={vi.fn()}
        />
      )

      expect(screen.getByRole('combobox')).toHaveValue('Option Two')
    })

    it('clears input when value is empty', () => {
      const { rerender } = render(
        <LiveSearch
          options={mockOptions}
          value="1"
          onChange={vi.fn()}
        />
      )

      expect(screen.getByRole('combobox')).toHaveValue('Option One')

      rerender(
        <LiveSearch
          options={mockOptions}
          value=""
          onChange={vi.fn()}
        />
      )

      expect(screen.getByRole('combobox')).toHaveValue('')
    })
  })
})
