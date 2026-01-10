import { describe, it, expect } from 'vitest'
import { formatCurrency, formatAmount, parseAmount } from '../../../utils/formatters'

describe('formatters', () => {
  describe('formatCurrency', () => {
    it('formats positive amount with dollar symbol', () => {
      const result = formatCurrency(1234.56, '$')
      expect(result).toMatch(/\$1,?234\.56/)
    })

    it('formats negative amount with sign and symbol', () => {
      const result = formatCurrency(-1234.56, '$')
      expect(result).toMatch(/-\$1,?234\.56/)
    })

    it('formats zero', () => {
      const result = formatCurrency(0, '$')
      expect(result).toMatch(/\$0\.00/)
    })

    it('handles different currency symbols', () => {
      expect(formatCurrency(100, '€')).toMatch(/€100\.00/)
      expect(formatCurrency(100, '£')).toMatch(/£100\.00/)
      expect(formatCurrency(100, '¥')).toMatch(/¥100\.00/)
    })

    it('respects decimal places parameter', () => {
      const result = formatCurrency(100.1234, '$', 4)
      expect(result).toMatch(/\$100\.1234/)
    })

    it('formats with 0 decimal places', () => {
      const result = formatCurrency(100.99, '$', 0)
      expect(result).toMatch(/\$101/)
    })

    it('handles very large numbers', () => {
      const result = formatCurrency(1234567890.12, '$')
      expect(result).toContain('$')
      expect(result).toContain('.')
    })

    it('handles very small positive amounts', () => {
      const result = formatCurrency(0.01, '$')
      expect(result).toMatch(/\$0\.01/)
    })

    it('handles very small negative amounts', () => {
      const result = formatCurrency(-0.01, '$')
      expect(result).toMatch(/-\$0\.01/)
    })

    it('default decimal places is 2', () => {
      const result = formatCurrency(100, '$')
      expect(result).toMatch(/100\.00/)
    })
  })

  describe('formatAmount', () => {
    it('formats positive number with default decimal places', () => {
      const result = formatAmount(1234.56)
      expect(result).toMatch(/1,?234\.56/)
    })

    it('formats negative number', () => {
      const result = formatAmount(-1234.56)
      expect(result).toMatch(/-1,?234\.56/)
    })

    it('formats zero', () => {
      expect(formatAmount(0)).toMatch(/0\.00/)
    })

    it('respects decimal places parameter', () => {
      expect(formatAmount(100.1234, 4)).toMatch(/100\.1234/)
    })

    it('formats with 0 decimal places', () => {
      const result = formatAmount(100.99, 0)
      expect(result).toBe('101')
    })

    it('handles very large numbers', () => {
      const result = formatAmount(9999999999.99)
      expect(result).toContain('.')
    })

    it('pads with zeros if needed', () => {
      const result = formatAmount(100.1, 2)
      expect(result).toMatch(/100\.10/)
    })

    it('handles 8 decimal places for crypto', () => {
      const result = formatAmount(0.00000001, 8)
      expect(result).toMatch(/0\.00000001/)
    })
  })

  describe('parseAmount', () => {
    it('parses simple number string', () => {
      expect(parseAmount('123.45')).toBe(123.45)
    })

    it('parses number with commas', () => {
      expect(parseAmount('1,234.56')).toBe(1234.56)
    })

    it('parses negative number', () => {
      expect(parseAmount('-123.45')).toBe(-123.45)
    })

    it('parses number with currency symbol', () => {
      expect(parseAmount('$123.45')).toBe(123.45)
      expect(parseAmount('€100.00')).toBe(100)
    })

    it('returns 0 for empty string', () => {
      expect(parseAmount('')).toBe(0)
    })

    it('returns 0 for non-numeric string', () => {
      expect(parseAmount('abc')).toBe(0)
    })

    it('returns 0 for NaN', () => {
      expect(parseAmount('not a number')).toBe(0)
    })

    it('parses integer', () => {
      expect(parseAmount('100')).toBe(100)
    })

    it('handles multiple currency symbols', () => {
      expect(parseAmount('$€£100')).toBe(100)
    })

    it('handles spaces', () => {
      expect(parseAmount('$ 123.45')).toBe(123.45)
    })

    it('handles leading zeros', () => {
      expect(parseAmount('00123.45')).toBe(123.45)
    })

    it('parses very small decimals', () => {
      expect(parseAmount('0.00001')).toBe(0.00001)
    })

    it('handles negative with currency symbol', () => {
      expect(parseAmount('-$123.45')).toBe(-123.45)
    })
  })
})
