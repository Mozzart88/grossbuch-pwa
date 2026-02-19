import { describe, it, expect } from 'vitest'
import { formatCurrency, formatCurrencyValue, formatAmount, formatAmountValue, parseAmount } from '../../../utils/formatters'
import { toIntFrac } from '../../../utils/amount'

describe('formatters', () => {
  describe('formatCurrency (int, frac)', () => {
    it('formats positive amount with dollar symbol', () => {
      const { int, frac } = toIntFrac(1234.56)
      const result = formatCurrency(int, frac, '$')
      expect(result).toMatch(/\$1,?234\.56/)
    })

    it('formats negative amount (floor convention)', () => {
      const { int, frac } = toIntFrac(-1234.56)
      const result = formatCurrency(int, frac, '$')
      expect(result).toMatch(/\$1,?234\.56/)
    })

    it('formats zero', () => {
      const result = formatCurrency(0, 0, '$')
      expect(result).toMatch(/\$0\.00/)
    })

    it('handles different currency symbols', () => {
      const { int, frac } = toIntFrac(100)
      expect(formatCurrency(int, frac, '€')).toMatch(/€100\.00/)
      expect(formatCurrency(int, frac, '£')).toMatch(/£100\.00/)
      expect(formatCurrency(int, frac, '¥')).toMatch(/¥100\.00/)
    })

    it('respects decimal places parameter', () => {
      const { int, frac } = toIntFrac(100.1234)
      const result = formatCurrency(int, frac, '$', 4)
      expect(result).toMatch(/\$100\.1234/)
    })

    it('formats with 0 decimal places', () => {
      const { int, frac } = toIntFrac(100.99)
      const result = formatCurrency(int, frac, '$', 0)
      expect(result).toMatch(/\$101/)
    })

    it('handles very small positive amounts', () => {
      const { int, frac } = toIntFrac(0.01)
      const result = formatCurrency(int, frac, '$')
      expect(result).toMatch(/\$0\.01/)
    })

    it('default decimal places is 2', () => {
      const { int, frac } = toIntFrac(100)
      const result = formatCurrency(int, frac, '$')
      expect(result).toMatch(/100\.00/)
    })
  })

  describe('formatCurrencyValue (float)', () => {
    it('formats positive amount with dollar symbol', () => {
      const result = formatCurrencyValue(1234.56, '$')
      expect(result).toMatch(/\$1,?234\.56/)
    })

    it('formats negative amount with sign and symbol', () => {
      const result = formatCurrencyValue(-1234.56, '$')
      expect(result).toMatch(/-\$1,?234\.56/)
    })

    it('formats zero', () => {
      const result = formatCurrencyValue(0, '$')
      expect(result).toMatch(/\$0\.00/)
    })

    it('handles different currency symbols', () => {
      expect(formatCurrencyValue(100, '€')).toMatch(/€100\.00/)
      expect(formatCurrencyValue(100, '£')).toMatch(/£100\.00/)
      expect(formatCurrencyValue(100, '¥')).toMatch(/¥100\.00/)
    })

    it('respects decimal places parameter', () => {
      const result = formatCurrencyValue(100.1234, '$', 4)
      expect(result).toMatch(/\$100\.1234/)
    })

    it('formats with 0 decimal places', () => {
      const result = formatCurrencyValue(100.99, '$', 0)
      expect(result).toMatch(/\$101/)
    })

    it('handles very large numbers', () => {
      const result = formatCurrencyValue(1234567890.12, '$')
      expect(result).toContain('$')
      expect(result).toContain('.')
    })

    it('handles very small positive amounts', () => {
      const result = formatCurrencyValue(0.01, '$')
      expect(result).toMatch(/\$0\.01/)
    })

    it('handles very small negative amounts', () => {
      const result = formatCurrencyValue(-0.01, '$')
      expect(result).toMatch(/\$0\.01/)
    })

    it('default decimal places is 2', () => {
      const result = formatCurrencyValue(100, '$')
      expect(result).toMatch(/100\.00/)
    })
  })

  describe('formatAmount (int, frac)', () => {
    it('formats positive number with default decimal places', () => {
      const { int, frac } = toIntFrac(1234.56)
      const result = formatAmount(int, frac)
      expect(result).toMatch(/1,?234\.56/)
    })

    it('formats negative number', () => {
      const { int, frac } = toIntFrac(-1234.56)
      const result = formatAmount(int, frac)
      expect(result).toMatch(/-1,?234\.56/)
    })

    it('formats zero', () => {
      expect(formatAmount(0, 0)).toMatch(/0\.00/)
    })

    it('respects decimal places parameter', () => {
      const { int, frac } = toIntFrac(100.1234)
      expect(formatAmount(int, frac, 4)).toMatch(/100\.1234/)
    })

    it('formats with 0 decimal places', () => {
      const { int, frac } = toIntFrac(100.99)
      const result = formatAmount(int, frac, 0)
      expect(result).toBe('101')
    })
  })

  describe('formatAmountValue (float)', () => {
    it('formats positive number with default decimal places', () => {
      const result = formatAmountValue(1234.56)
      expect(result).toMatch(/1,?234\.56/)
    })

    it('formats negative number', () => {
      const result = formatAmountValue(-1234.56)
      expect(result).toMatch(/-1,?234\.56/)
    })

    it('formats zero', () => {
      expect(formatAmountValue(0)).toMatch(/0\.00/)
    })

    it('respects decimal places parameter', () => {
      expect(formatAmountValue(100.1234, 4)).toMatch(/100\.1234/)
    })

    it('formats with 0 decimal places', () => {
      const result = formatAmountValue(100.99, 0)
      expect(result).toBe('101')
    })

    it('handles very large numbers', () => {
      const result = formatAmountValue(9999999999.99)
      expect(result).toContain('.')
    })

    it('pads with zeros if needed', () => {
      const result = formatAmountValue(100.1, 2)
      expect(result).toMatch(/100\.10/)
    })

    it('handles 8 decimal places for crypto', () => {
      const result = formatAmountValue(0.00000001, 8)
      expect(result).toMatch(/0\.00000001/)
    })
  })

  describe('parseAmount', () => {
    it('parses simple number string to IntFrac', () => {
      const result = parseAmount('123.45')
      expect(result.int).toBe(123)
      expect(result.frac).toBeGreaterThan(0)
    })

    it('parses number with commas', () => {
      const result = parseAmount('1,234.56')
      expect(result.int).toBe(1234)
      expect(result.frac).toBeGreaterThan(0)
    })

    it('always returns positive (abs)', () => {
      const result = parseAmount('-123.45')
      expect(result.int).toBe(123)
      expect(result.frac).toBeGreaterThan(0)
    })

    it('parses number with currency symbol', () => {
      const r1 = parseAmount('$123.45')
      expect(r1.int).toBe(123)
      const r2 = parseAmount('€100.00')
      expect(r2.int).toBe(100)
      expect(r2.frac).toBe(0)
    })

    it('returns {0,0} for empty string', () => {
      const result = parseAmount('')
      expect(result).toEqual({ int: 0, frac: 0 })
    })

    it('returns {0,0} for non-numeric string', () => {
      expect(parseAmount('abc')).toEqual({ int: 0, frac: 0 })
    })

    it('returns {0,0} for NaN', () => {
      expect(parseAmount('not a number')).toEqual({ int: 0, frac: 0 })
    })

    it('parses integer', () => {
      const result = parseAmount('100')
      expect(result.int).toBe(100)
      expect(result.frac).toBe(0)
    })

    it('handles spaces', () => {
      const result = parseAmount('$ 123.45')
      expect(result.int).toBe(123)
    })

    it('handles leading zeros', () => {
      const result = parseAmount('00123.45')
      expect(result.int).toBe(123)
    })
  })
})
