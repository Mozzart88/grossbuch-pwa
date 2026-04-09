import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { AmountInput } from '../../../../components/ui/AmountInput'

// Helper: get the underlying <input> regardless of type/role
const getInput = (container: HTMLElement) => container.querySelector('input') as HTMLInputElement

describe('AmountInput', () => {
  it('renders an input element', () => {
    const { container } = render(<AmountInput />)
    expect(getInput(container)).toBeInTheDocument()
  })

  it('uses type="number" when unfocused for mobile numeric keyboard', () => {
    const { container } = render(<AmountInput />)
    expect(getInput(container)).toHaveAttribute('type', 'number')
  })

  it('switches to type="text" when focused to allow expression input', async () => {
    const { container } = render(<AmountInput />)
    const input = getInput(container)
    fireEvent.focus(input)
    await waitFor(() => expect(input).toHaveAttribute('type', 'text'))
    fireEvent.blur(input)
    await waitFor(() => expect(input).toHaveAttribute('type', 'number'))
  })

  it('renders with provided value', () => {
    const { container } = render(<AmountInput value="42" onChange={() => {}} />)
    expect(getInput(container)).toHaveValue(42)
  })

  it('calls onChange with the raw string on every keystroke', () => {
    const onChange = vi.fn()
    const { container } = render(<AmountInput value="" onChange={onChange} />)
    fireEvent.change(getInput(container), { target: { value: '5' } })
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
      expect(screen.getByLabelText('Amount')).toHaveAttribute('id', 'my-amount')
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
      expect(getInput(container)).toHaveClass('my-custom-class')
    })

    it('always includes focus:outline-none', () => {
      const { container } = render(<AmountInput />)
      expect(getInput(container)?.className).toContain('focus:outline-none')
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
      const { container } = render(<AmountInput value="42" onChange={() => {}} />)
      fireEvent.focus(getInput(container))
      expect(screen.queryByTestId('amount-expression-result')).not.toBeInTheDocument()
    })

    it('shows preview when input is focused and value is a valid expression', async () => {
      const { container } = render(<AmountInput value="10+5" onChange={() => {}} />)
      fireEvent.focus(getInput(container))
      await waitFor(() => {
        expect(screen.getByTestId('amount-expression-result')).toBeInTheDocument()
        expect(screen.getByTestId('amount-expression-result').textContent).toContain('15')
      })
    })

    it('does not show preview when input is not focused', () => {
      render(<AmountInput value="10+5" onChange={() => {}} />)
      expect(screen.queryByTestId('amount-expression-result')).not.toBeInTheDocument()
    })

    it('hides preview on blur', async () => {
      const { container } = render(<AmountInput value="10+5" onChange={() => {}} />)
      const input = getInput(container)
      fireEvent.focus(input)
      await waitFor(() => {
        expect(screen.getByTestId('amount-expression-result')).toBeInTheDocument()
      })
      fireEvent.blur(input)
      expect(screen.queryByTestId('amount-expression-result')).not.toBeInTheDocument()
    })

    it('does not show preview for invalid expression', async () => {
      const { container } = render(<AmountInput value="10+" onChange={() => {}} />)
      fireEvent.focus(getInput(container))
      expect(screen.queryByTestId('amount-expression-result')).not.toBeInTheDocument()
    })
  })

  describe('result preview click', () => {
    it('calls onChange with the resolved number string when preview is clicked', async () => {
      const onChange = vi.fn()
      const { container } = render(<AmountInput value="10+5" onChange={onChange} />)
      fireEvent.focus(getInput(container))
      await waitFor(() => {
        expect(screen.getByTestId('amount-expression-result')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByTestId('amount-expression-result'))
      expect(onChange).toHaveBeenCalledWith('15')
    })

    it('calls onChange with the string form of the result (multiplication)', async () => {
      const onChange = vi.fn()
      const { container } = render(<AmountInput value="3*4" onChange={onChange} />)
      fireEvent.focus(getInput(container))
      await waitFor(() => {
        expect(screen.getByTestId('amount-expression-result')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByTestId('amount-expression-result'))
      expect(onChange).toHaveBeenCalledWith('12')
    })
  })

  describe('isPositive', () => {
    it('shows expression preview for a positive result', async () => {
      const { container } = render(<AmountInput isPositive value="10-2" onChange={() => {}} />)
      fireEvent.focus(getInput(container))
      await waitFor(() => {
        expect(screen.getByTestId('amount-expression-result')).toBeInTheDocument()
      })
    })

    it('does not show expression preview when result is negative', async () => {
      const { container } = render(<AmountInput isPositive value="2-10" onChange={() => {}} />)
      fireEvent.focus(getInput(container))
      expect(screen.queryByTestId('amount-expression-result')).not.toBeInTheDocument()
    })

    it('does not show expression preview when result is zero', async () => {
      const { container } = render(<AmountInput isPositive value="5-5" onChange={() => {}} />)
      fireEvent.focus(getInput(container))
      expect(screen.queryByTestId('amount-expression-result')).not.toBeInTheDocument()
    })
  })

  describe('custom validity', () => {
    it('sets custom validity to empty string for a plain number', async () => {
      const { container } = render(<AmountInput value="42" onChange={() => {}} />)
      await waitFor(() => {
        expect(getInput(container).validity.customError).toBe(false)
      })
    })

    it('sets custom validity error for an invalid expression', async () => {
      const { container } = render(<AmountInput value="10+" onChange={() => {}} />)
      await waitFor(() => {
        expect(getInput(container).validity.customError).toBe(true)
      })
    })

    it('sets custom validity to empty for a valid expression', async () => {
      const { container } = render(<AmountInput value="10+5" onChange={() => {}} />)
      await waitFor(() => {
        expect(getInput(container).validity.customError).toBe(false)
      })
    })

    it('sets custom validity error when isPositive and plain negative value', async () => {
      const { container } = render(<AmountInput isPositive value="-5" onChange={() => {}} />)
      await waitFor(() => {
        expect(getInput(container).validity.customError).toBe(true)
      })
    })

    it('sets custom validity error when isPositive and expression result <= 0', async () => {
      const { container } = render(<AmountInput isPositive value="2-10" onChange={() => {}} />)
      await waitFor(() => {
        expect(getInput(container).validity.customError).toBe(true)
      })
    })
  })

  describe('required', () => {
    describe('non-required field (default)', () => {
      it('treats empty string as valid (omitted)', async () => {
        const { container } = render(<AmountInput isPositive value="" onChange={() => {}} />)
        await waitFor(() => {
          expect(getInput(container).validity.customError).toBe(false)
        })
      })

      it('treats "0" as valid (omitted)', async () => {
        const { container } = render(<AmountInput isPositive value="0" onChange={() => {}} />)
        await waitFor(() => {
          expect(getInput(container).validity.customError).toBe(false)
        })
      })

      it('treats "0.00" as valid (omitted)', async () => {
        const { container } = render(<AmountInput isPositive value="0.00" onChange={() => {}} />)
        await waitFor(() => {
          expect(getInput(container).validity.customError).toBe(false)
        })
      })

      it('still rejects negative values when isPositive', async () => {
        const { container } = render(<AmountInput isPositive value="-5" onChange={() => {}} />)
        await waitFor(() => {
          expect(getInput(container).validity.customError).toBe(true)
        })
      })

      it('does not show error text for empty value with isPositive', () => {
        render(<AmountInput isPositive value="" onChange={() => {}} />)
        expect(screen.queryByText('Value must be positive')).not.toBeInTheDocument()
      })

      it('does not show error text for "0" with isPositive', () => {
        render(<AmountInput isPositive value="0" onChange={() => {}} />)
        expect(screen.queryByText('Value must be positive')).not.toBeInTheDocument()
      })

      it('expressions that evaluate to 0 are still invalid when isPositive', async () => {
        const { container } = render(<AmountInput isPositive value="5-5" onChange={() => {}} />)
        await waitFor(() => {
          expect(getInput(container).validity.customError).toBe(true)
        })
      })
    })

    describe('required field', () => {
      it('treats "0" as invalid when isPositive', async () => {
        const { container } = render(
          <AmountInput isPositive required value="0" onChange={() => {}} />,
        )
        await waitFor(() => {
          expect(getInput(container).validity.customError).toBe(true)
        })
      })

      it('treats "0.00" as invalid when isPositive', async () => {
        const { container } = render(
          <AmountInput isPositive required value="0.00" onChange={() => {}} />,
        )
        await waitFor(() => {
          expect(getInput(container).validity.customError).toBe(true)
        })
      })

      it('accepts positive values', async () => {
        const { container } = render(
          <AmountInput isPositive required value="5" onChange={() => {}} />,
        )
        await waitFor(() => {
          expect(getInput(container).validity.customError).toBe(false)
        })
      })

      it('shows error text for "0" with isPositive when required', () => {
        render(<AmountInput isPositive required value="0" onChange={() => {}} />)
        expect(screen.getByText('Value must be positive')).toBeInTheDocument()
      })
    })
  })

  describe('form submit integration', () => {
    it('resolves valid expression and calls onChange on form submit', async () => {
      const onChange = vi.fn()
      const onSubmit = vi.fn((e: React.SyntheticEvent<HTMLFormElement>) => e.preventDefault())
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
      const onSubmit = vi.fn((e: React.SyntheticEvent<HTMLFormElement>) => e.preventDefault())
      const { container } = render(
        <form onSubmit={onSubmit}>
          <AmountInput value="10+" onChange={() => {}} />
          <button type="submit">Submit</button>
        </form>,
      )
      act(() => {
        fireEvent.submit(screen.getByRole('button', { name: 'Submit' }).closest('form')!)
      })
      expect(getInput(container).validity.customError).toBe(true)
    })

    it('prevents form submit for isPositive violation on expression', async () => {
      const onChange = vi.fn()
      const { container } = render(
        <form onSubmit={(e) => e.preventDefault()}>
          <AmountInput isPositive value="2-10" onChange={onChange} />
          <button type="submit">Submit</button>
        </form>,
      )
      act(() => {
        fireEvent.submit(screen.getByRole('button', { name: 'Submit' }).closest('form')!)
      })
      expect(onChange).not.toHaveBeenCalled()
      expect(getInput(container).validity.customError).toBe(true)
    })

    it('does not interfere with plain number values on form submit', async () => {
      const onChange = vi.fn()
      const onSubmit = vi.fn((e: React.SyntheticEvent<HTMLFormElement>) => e.preventDefault())
      render(
        <form onSubmit={onSubmit}>
          <AmountInput value="42" onChange={onChange} />
          <button type="submit">Submit</button>
        </form>,
      )
      act(() => {
        fireEvent.submit(screen.getByRole('button', { name: 'Submit' }).closest('form')!)
      })
      expect(onChange).not.toHaveBeenCalled()
    })
  })
})
