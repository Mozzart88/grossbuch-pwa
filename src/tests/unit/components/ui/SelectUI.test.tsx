import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { SelectUI } from '../../../../components/ui/SelectUI'
import type { SelectUIOption } from '../../../../components/ui/SelectUI'
import { Badge } from '../../../../components/ui'

const options: SelectUIOption[] = [
  { value: '1', label: 'Cash:USD' },
  { value: '2', label: 'Cash:USD Savings' },
]

describe('SelectUI', () => {
  it('opens and closes the dropdown', () => {
    render(<SelectUI options={options} value="" onChange={vi.fn()} placeholder="Account" />)

    fireEvent.click(screen.getByRole('button', { name: 'Account' }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('selects an option', () => {
    const onChange = vi.fn()
    render(<SelectUI options={options} value="" onChange={onChange} placeholder="Account" />)

    fireEvent.click(screen.getByRole('button', { name: 'Account' }))
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Cash:USD Savings' }))

    expect(onChange).toHaveBeenCalledWith('2', 'Cash:USD Savings')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('renders an option with a badge', () => {
    render(
      <SelectUI
        options={options}
        value=""
        onChange={vi.fn()}
        placeholder="Account"
        renderOption={(option) => (
          <span>
            {option.label}
            {option.value === '2' && <Badge variant="secondary">Savings</Badge>}
          </span>
        )}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Account' }))

    expect(within(screen.getByRole('listbox')).getByRole('option', { name: /Cash:USD Savings/ })).toBeInTheDocument()
    expect(screen.getByText('Savings')).toBeInTheDocument()
  })

  it('renders a selected badge', () => {
    render(
      <SelectUI
        options={options}
        value="2"
        onChange={vi.fn()}
        renderSelectedBadge={() => <Badge variant="secondary" className="ml-0">Savings</Badge>}
      />
    )

    expect(screen.getByRole('button', { name: /Cash:USD Savings/ })).toBeInTheDocument()
    expect(screen.getByText('Savings')).toBeInTheDocument()
  })

  it('keeps a native select value contract', () => {
    const onChange = vi.fn()
    render(<SelectUI options={options} value="1" onChange={onChange} />)

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } })

    expect(onChange).toHaveBeenCalledWith('2', 'Cash:USD Savings')
  })
})
