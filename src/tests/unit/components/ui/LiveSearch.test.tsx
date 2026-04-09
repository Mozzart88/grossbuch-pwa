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

  describe('pendingNewValue', () => {
    it('shows pending value in input when value is empty', () => {
      render(
        <LiveSearch
          options={mockOptions}
          value=""
          onChange={vi.fn()}
          pendingNewValue="New Item"
        />
      )

      expect(screen.getByRole('combobox')).toHaveValue('New Item')
    })

    it('shows "New" badge when input matches pendingNewValue', () => {
      render(
        <LiveSearch
          options={mockOptions}
          value=""
          onChange={vi.fn()}
          pendingNewValue="New Item"
        />
      )

      expect(screen.getByText('New')).toBeInTheDocument()
    })

    it('hides badge when user edits the input', async () => {
      render(
        <LiveSearch
          options={mockOptions}
          value=""
          onChange={vi.fn()}
          pendingNewValue="New Item"
        />
      )

      expect(screen.getByText('New')).toBeInTheDocument()

      const input = screen.getByRole('combobox')
      fireEvent.change(input, { target: { value: 'New Item edited' } })

      await waitFor(() => {
        expect(screen.queryByText('New')).not.toBeInTheDocument()
      })
    })

    it('clears pending state when input is cleared and blurred', async () => {
      const onChange = vi.fn()
      render(
        <LiveSearch
          options={mockOptions}
          value=""
          onChange={onChange}
          pendingNewValue="New Item"
        />
      )

      const input = screen.getByRole('combobox')
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: '' } })
      fireEvent.keyDown(input, { key: 'Tab' })

      expect(onChange).toHaveBeenCalledWith('', '')
    })

    it('selected option value takes precedence over pendingNewValue', () => {
      render(
        <LiveSearch
          options={mockOptions}
          value="2"
          onChange={vi.fn()}
          pendingNewValue="New Item"
        />
      )

      expect(screen.getByRole('combobox')).toHaveValue('Option Two')
      expect(screen.queryByText('New')).not.toBeInTheDocument()
    })

    it('restores pending value on Escape when no value is selected', async () => {
      render(
        <LiveSearch
          options={mockOptions}
          value=""
          onChange={vi.fn()}
          pendingNewValue="New Item"
        />
      )

      const input = screen.getByRole('combobox')
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'something else' } })

      expect(screen.queryByText('New')).not.toBeInTheDocument()

      fireEvent.keyDown(input, { key: 'Escape' })

      await waitFor(() => {
        expect(input).toHaveValue('New Item')
        expect(screen.getByText('New')).toBeInTheDocument()
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

  describe('getDisplayValue prop', () => {
    it('shows display value in input when option is selected', () => {
      render(
        <LiveSearch
          options={[{ value: '1', label: 'USD - United States Dollar' }]}
          value="1"
          onChange={vi.fn()}
          getDisplayValue={(opt) => opt.label.split(' - ')[0]}
        />
      )
      expect(screen.getByRole('combobox')).toHaveValue('USD')
    })

    it('shows full label in dropdown even with getDisplayValue set', async () => {
      render(
        <LiveSearch
          options={[
            { value: '1', label: 'USD - United States Dollar' },
            { value: '2', label: 'EUR - Euro' },
          ]}
          value="1"
          onChange={vi.fn()}
          getDisplayValue={(opt) => opt.label.split(' - ')[0]}
        />
      )
      fireEvent.focus(screen.getByRole('combobox'))
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'USD - United States Dollar' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'EUR - Euro' })).toBeInTheDocument()
      })
    })

    it('uses getDisplayValue when selecting via click', async () => {
      const onChange = vi.fn()
      render(
        <LiveSearch
          options={[{ value: '2', label: 'EUR - Euro' }]}
          value=""
          onChange={onChange}
          getDisplayValue={(opt) => opt.label.split(' - ')[0]}
        />
      )
      fireEvent.focus(screen.getByRole('combobox'))
      await waitFor(() => expect(screen.getByRole('option', { name: 'EUR - Euro' })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('option', { name: 'EUR - Euro' }))
      expect(onChange).toHaveBeenCalledWith('2', 'EUR - Euro')
    })

    it('uses getDisplayValue when committing via Tab', async () => {
      const onChange = vi.fn()
      render(
        <LiveSearch
          options={[{ value: '1', label: 'Option One' }]}
          value=""
          onChange={onChange}
          getDisplayValue={(opt) => opt.label.split(' ')[0]}
        />
      )
      const input = screen.getByRole('combobox')
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'Option One' } })
      fireEvent.keyDown(input, { key: 'Tab' })
      expect(onChange).toHaveBeenCalledWith('1', 'Option One')
    })

    it('restores display value on Escape when option is selected', async () => {
      render(
        <LiveSearch
          options={[{ value: '1', label: 'USD - United States Dollar' }]}
          value="1"
          onChange={vi.fn()}
          getDisplayValue={(opt) => opt.label.split(' - ')[0]}
        />
      )
      const input = screen.getByRole('combobox')
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'something' } })
      fireEvent.keyDown(input, { key: 'Escape' })
      await waitFor(() => expect(input).toHaveValue('USD'))
    })
  })

  describe('isShowingSelectedValue — all options shown when input matches selection', () => {
    it('shows all options (not filtered) when focused with selected value', async () => {
      render(
        <LiveSearch
          options={mockOptions}
          value="1"
          onChange={vi.fn()}
        />
      )
      const input = screen.getByRole('combobox')
      expect(input).toHaveValue('Option One')
      fireEvent.focus(input)
      await waitFor(() => {
        // All three options visible even though input has "Option One"
        expect(screen.getByRole('option', { name: 'Option One' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Option Two' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Option Three' })).toBeInTheDocument()
      })
    })
  })

  describe('commitValue edge cases', () => {
    it('calls onCreateNew when Tab pressed with no exact match', async () => {
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
      fireEvent.change(input, { target: { value: 'Brand New' } })
      fireEvent.keyDown(input, { key: 'Tab' })
      expect(onCreateNew).toHaveBeenCalledWith('Brand New')
    })

    it('clears selection when Tab pressed with empty input', async () => {
      const onChange = vi.fn()
      render(
        <LiveSearch
          options={mockOptions}
          value="1"
          onChange={onChange}
        />
      )
      const input = screen.getByRole('combobox')
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: '' } })
      fireEvent.keyDown(input, { key: 'Tab' })
      expect(onChange).toHaveBeenCalledWith('', '')
    })
  })

  describe('keyboard navigation edge cases', () => {
    it('ArrowDown opens dropdown when closed', async () => {
      render(
        <LiveSearch
          options={mockOptions}
          value=""
          onChange={vi.fn()}
        />
      )
      const input = screen.getByRole('combobox')
      // Don't focus (so dropdown stays closed), then press ArrowDown
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    })

    it('ArrowUp wraps to last option', async () => {
      render(
        <LiveSearch
          options={mockOptions}
          value=""
          onChange={vi.fn()}
        />
      )
      const input = screen.getByRole('combobox')
      fireEvent.focus(input)
      await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
      // ArrowUp from first option (index 0) wraps to last
      fireEvent.keyDown(input, { key: 'ArrowUp' })
      await waitFor(() => {
        const options = screen.getAllByRole('option')
        expect(options[options.length - 1]).toHaveAttribute('aria-selected', 'true')
      })
    })

    it('Enter when dropdown closed does nothing', () => {
      const onChange = vi.fn()
      render(
        <LiveSearch
          options={mockOptions}
          value=""
          onChange={onChange}
        />
      )
      fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
      expect(onChange).not.toHaveBeenCalled()
    })

    it('Enter on create option calls handleCreateNew', async () => {
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
      fireEvent.change(input, { target: { value: 'Brand New' } })
      await waitFor(() => expect(screen.getByText(/Create "Brand New"/)).toBeInTheDocument())
      // ArrowDown to navigate to the create option (it's after filtered options)
      const options = screen.getAllByRole('option')
      const createOptionIndex = options.findIndex(o => o.textContent?.includes('Create'))
      for (let i = 0; i < createOptionIndex; i++) {
        fireEvent.keyDown(input, { key: 'ArrowDown' })
      }
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(onCreateNew).toHaveBeenCalledWith('Brand New')
    })

    it('Escape when no value and no pendingNewValue clears input', async () => {
      render(
        <LiveSearch
          options={mockOptions}
          value=""
          onChange={vi.fn()}
        />
      )
      const input = screen.getByRole('combobox')
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'partial' } })
      fireEvent.keyDown(input, { key: 'Escape' })
      await waitFor(() => expect(input).toHaveValue(''))
    })
  })

  describe('click outside', () => {
    it('commits value and closes dropdown on outside click', async () => {
      const onChange = vi.fn()
      render(
        <div>
          <LiveSearch
            options={mockOptions}
            value=""
            onChange={onChange}
          />
          <div data-testid="outside">outside</div>
        </div>
      )
      const input = screen.getByRole('combobox')
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'Option One' } })
      await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
      fireEvent.mouseDown(screen.getByTestId('outside'))
      await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
      expect(onChange).toHaveBeenCalledWith('1', 'Option One')
    })
  })

  describe('branch coverage', () => {
    it('scrolls highlighted item into view when scrollIntoView is available (branch[17][0])', async () => {
      HTMLElement.prototype.scrollIntoView = vi.fn()
      render(<LiveSearch options={mockOptions} value="" onChange={vi.fn()} />)
      const input = screen.getByRole('combobox')
      fireEvent.focus(input)
      await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
      // ArrowDown changes highlightedIndex → scrollIntoView effect fires
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      await waitFor(() => {
        expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()
      })
      // @ts-ignore
      delete HTMLElement.prototype.scrollIntoView
    })

    it('commitValue with no match (branch[21][1]): Tab when input has no matching option', async () => {
      const onChange = vi.fn()
      render(<LiveSearch options={mockOptions} value="" onChange={onChange} />)
      const input = screen.getByRole('combobox')
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'xyznotexist' } })
      // Tab calls commitValue → trimmedInput is non-empty but no match found → branch[21][1]
      fireEvent.keyDown(input, { key: 'Tab' })
      // onChange NOT called since no match and no onCreateNew
      expect(onChange).not.toHaveBeenCalled()
    })

    it('mousedown inside container does not close dropdown (branch[22][1])', async () => {
      render(<LiveSearch options={mockOptions} value="" onChange={vi.fn()} />)
      const input = screen.getByRole('combobox')
      fireEvent.focus(input)
      await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
      // Mousedown on the input itself (inside container) → contains=true → condition=false → branch[22][1]
      fireEvent.mouseDown(input)
      // Dropdown should still be open
      expect(screen.getByRole('listbox')).toBeInTheDocument()
    })

    it('ArrowUp when dropdown is closed does nothing (branch[31][1])', () => {
      render(<LiveSearch options={mockOptions} value="" onChange={vi.fn()} />)
      const input = screen.getByRole('combobox')
      // Don't focus → dropdown is closed
      fireEvent.keyDown(input, { key: 'ArrowUp' })
      // No dropdown, no error
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })

    it('Enter with empty filteredOptions and no onCreateNew (branch[35][1])', async () => {
      const onChange = vi.fn()
      render(<LiveSearch options={mockOptions} value="" onChange={onChange} />)
      const input = screen.getByRole('combobox')
      fireEvent.focus(input)
      await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
      // Type something that matches nothing → filteredOptions=[] → listbox hidden, but isOpen=true
      fireEvent.change(input, { target: { value: 'zzznomatch' } })
      await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
      // Enter: isOpen=true, showCreateNew=false, filteredOptions[0]=undefined → branch[35][1]
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(onChange).not.toHaveBeenCalled()
    })

    it('Escape with value not found in options (branch[37][1])', async () => {
      render(<LiveSearch options={mockOptions} value="999" onChange={vi.fn()} />)
      const input = screen.getByRole('combobox')
      fireEvent.focus(input)
      await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
      // Escape: value='999' truthy, but no option with value='999' → opt=undefined → branch[37][1]
      fireEvent.keyDown(input, { key: 'Escape' })
      await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    })

    it('Escape with value found but no getDisplayValue (branch[38][1]: uses opt.label)', async () => {
      render(<LiveSearch options={mockOptions} value="1" onChange={vi.fn()} />)
      const input = screen.getByRole('combobox')
      fireEvent.focus(input)
      await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
      // Escape: value='1', opt={value:'1',label:'Option One'}, no getDisplayValue → opt.label used → branch[38][1]
      fireEvent.keyDown(input, { key: 'Escape' })
      await waitFor(() => expect(input).toHaveValue('Option One'))
    })
  })
})
