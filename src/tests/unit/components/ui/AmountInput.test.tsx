import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { AmountInput } from '../../../../components/ui/AmountInput'

describe('AmountInput', () => {
  it('renders an input element', () => {
    render(<AmountInput />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('uses inputMode="numeric" for mobile keyboard', () => {
    const { container } = render(<AmountInput />)
    expect(container.querySelector('input')).toHaveAttribute('inputmode', 'numeric')
  })

  it('renders with provided value', () => {
    render(<AmountInput value="42" onChange={() => {}} />)
    expect(screen.getByRole('textbox')).toHaveValue('42')
  })

  it('calls onChange with the raw string on every keystroke', () => {
    const onChange = vi.fn()
    render(<AmountInput value="" onChange={onChange} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '5' } })
    expect(onChange).toHaveBeenCalledWith('5')
  })

  describe('label', () => {
    it('renders label when provided', () => {
      render(<AmountInput label="Amount" />)
      expect(screen.getByText('Amount')).toBeInTheDocument()
    })

    it('associates label with input', () => {
      render(<AmountInput label="Amount" />)
      expect(screen.getByLabelText('Amount')).toBeInTheDocument()
    })

    it('uses provided id over generated one', () => {
      render(<AmountInput label="Amount" id="my-amount" />)
      expect(screen.getByRole('textbox')).toHaveAttribute('id', 'my-amount')
    })
  })

  describe('placeholder', () => {
    it('renders placeholder when provided', () => {
      render(<AmountInput placeholder="0.00" />)
      expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument()
    })
  })

  describe('className', () => {
    it('forwards className to the input element', () => {
      const { container } = render(<AmountInput className="my-custom-class" />)
      expect(container.querySelector('input')).toHaveClass('my-custom-class')
    })

    it('always includes focus:outline-none', () => {
      const { container } = render(<AmountInput />)
      expect(container.querySelector('input')?.className).toContain('focus:outline-none')
    })
  })

  describe('error display', () => {
    it('shows external error from parent', () => {
      render(<AmountInput error="Required field" />)
      expect(screen.getByText('Required field')).toBeInTheDocument()
    })

    it('does not show error when none provided and value is empty', () => {
      render(<AmountInput value="" />)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('expression result preview', () => {
    it('does not show preview for plain numbers', async () => {
      render(<AmountInput value="42" onChange={() => {}} />)
      fireEvent.focus(screen.getByRole('textbox'))
      expect(screen.queryByTestId('amount-expression-result')).not.toBeInTheDocument()
    })

    it('shows preview when input is focused and value is a valid expression', async () => {
      render(<AmountInput value="10+5" onChange={() => {}} />)
      fireEvent.focus(screen.getByRole('textbox'))
      await waitFor(() => {
        expect(screen.getByTestId('amount-expression-result')).toBeInTheDocument()
        expect(screen.getByTestId('amount-expression-result').textContent).toContain('15')
      })
    })

    it('does not show preview when input is not focused', () => {
      render(<AmountInput value="10+5" onChange={() => {}} />)
      // No focus event — preview should not be shown
      expect(screen.queryByTestId('amount-expression-result')).not.toBeInTheDocument()
    })

    it('hides preview on blur', async () => {
      render(<AmountInput value="10+5" onChange={() => {}} />)
      fireEvent.focus(screen.getByRole('textbox'))
      await waitFor(() => {
        expect(screen.getByTestId('amount-expression-result')).toBeInTheDocument()
      })
      fireEvent.blur(screen.getByRole('textbox'))
      expect(screen.queryByTestId('amount-expression-result')).not.toBeInTheDocument()
    })

    it('does not show preview for invalid expression', async () => {
      render(<AmountInput value="10+" onChange={() => {}} />)
      fireEvent.focus(screen.getByRole('textbox'))
      expect(screen.queryByTestId('amount-expression-result')).not.toBeInTheDocument()
    })
  })

  describe('result preview click', () => {
    it('calls onChange with the resolved number string when preview is clicked', async () => {
      const onChange = vi.fn()
      render(<AmountInput value="10+5" onChange={onChange} />)
      fireEvent.focus(screen.getByRole('textbox'))
      await waitFor(() => {
        expect(screen.getByTestId('amount-expression-result')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByTestId('amount-expression-result'))
      expect(onChange).toHaveBeenCalledWith('15')
    })

    it('calls onChange with the string form of the result (multiplication)', async () => {
      const onChange = vi.fn()
      render(<AmountInput value="3*4" onChange={onChange} />)
      fireEvent.focus(screen.getByRole('textbox'))
      await waitFor(() => {
        expect(screen.getByTestId('amount-expression-result')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByTestId('amount-expression-result'))
      expect(onChange).toHaveBeenCalledWith('12')
    })
  })

  describe('isPositive', () => {
    it('shows expression preview for a positive result', async () => {
      render(<AmountInput isPositive value="10-2" onChange={() => {}} />)
      fireEvent.focus(screen.getByRole('textbox'))
      await waitFor(() => {
        expect(screen.getByTestId('amount-expression-result')).toBeInTheDocument()
      })
    })

    it('does not show expression preview when result is negative', async () => {
      render(<AmountInput isPositive value="2-10" onChange={() => {}} />)
      fireEvent.focus(screen.getByRole('textbox'))
      expect(screen.queryByTestId('amount-expression-result')).not.toBeInTheDocument()
    })

    it('does not show expression preview when result is zero', async () => {
      render(<AmountInput isPositive value="5-5" onChange={() => {}} />)
      fireEvent.focus(screen.getByRole('textbox'))
      expect(screen.queryByTestId('amount-expression-result')).not.toBeInTheDocument()
    })
  })

  describe('custom validity', () => {
    it('sets custom validity to empty string for a plain number', async () => {
      render(<AmountInput value="42" onChange={() => {}} />)
      const input = screen.getByRole('textbox') as HTMLInputElement
      await waitFor(() => {
        expect(input.validity.customError).toBe(false)
      })
    })

    it('sets custom validity error for an invalid expression', async () => {
      render(<AmountInput value="10+" onChange={() => {}} />)
      const input = screen.getByRole('textbox') as HTMLInputElement
      await waitFor(() => {
        expect(input.validity.customError).toBe(true)
      })
    })

    it('sets custom validity to empty for a valid expression', async () => {
      render(<AmountInput value="10+5" onChange={() => {}} />)
      const input = screen.getByRole('textbox') as HTMLInputElement
      await waitFor(() => {
        expect(input.validity.customError).toBe(false)
      })
    })

    it('sets custom validity error when isPositive and plain negative value', async () => {
      render(<AmountInput isPositive value="-5" onChange={() => {}} />)
      const input = screen.getByRole('textbox') as HTMLInputElement
      await waitFor(() => {
        expect(input.validity.customError).toBe(true)
      })
    })

    it('sets custom validity error when isPositive and expression result <= 0', async () => {
      render(<AmountInput isPositive value="2-10" onChange={() => {}} />)
      const input = screen.getByRole('textbox') as HTMLInputElement
      await waitFor(() => {
        expect(input.validity.customError).toBe(true)
      })
    })
  })

  describe('form submit integration', () => {
    it('resolves valid expression and calls onChange on form submit', async () => {
      const onChange = vi.fn()
      const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
      render(
        <form onSubmit={onSubmit}>
          <AmountInput value="10+5" onChange={onChange} />
          <button type="submit">Submit</button>
        </form>,
      )
      act(() => {
        fireEvent.submit(screen.getByRole('button', { name: 'Submit' }).closest('form')!)
      })
      expect(onChange).toHaveBeenCalledWith('15')
    })

    it('prevents form submit and sets validity for invalid expression', async () => {
      const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
      render(
        <form onSubmit={onSubmit}>
          <AmountInput value="10+" onChange={() => {}} />
          <button type="submit">Submit</button>
        </form>,
      )
      const input = screen.getByRole('textbox') as HTMLInputElement
      act(() => {
        fireEvent.submit(screen.getByRole('button', { name: 'Submit' }).closest('form')!)
      })
      expect(input.validity.customError).toBe(true)
    })

    it('prevents form submit for isPositive violation on expression', async () => {
      const onChange = vi.fn()
      render(
        <form onSubmit={(e) => e.preventDefault()}>
          <AmountInput isPositive value="2-10" onChange={onChange} />
          <button type="submit">Submit</button>
        </form>,
      )
      const input = screen.getByRole('textbox') as HTMLInputElement
      act(() => {
        fireEvent.submit(screen.getByRole('button', { name: 'Submit' }).closest('form')!)
      })
      expect(onChange).not.toHaveBeenCalled()
      expect(input.validity.customError).toBe(true)
    })

    it('does not interfere with plain number values on form submit', async () => {
      const onChange = vi.fn()
      const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
      render(
        <form onSubmit={onSubmit}>
          <AmountInput value="42" onChange={onChange} />
          <button type="submit">Submit</button>
        </form>,
      )
      act(() => {
        fireEvent.submit(screen.getByRole('button', { name: 'Submit' }).closest('form')!)
      })
      expect(onChange).not.toHaveBeenCalled() // plain number — no resolution needed
    })
  })
})
