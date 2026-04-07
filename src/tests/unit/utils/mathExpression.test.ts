import { describe, it, expect } from 'vitest'
import { isExpression, evaluateExpression } from '../../../utils/mathExpression'

describe('isExpression', () => {
  it('returns false for empty string', () => {
    expect(isExpression('')).toBe(false)
  })

  it('returns false for whitespace', () => {
    expect(isExpression('   ')).toBe(false)
  })

  it('returns false for plain integer', () => {
    expect(isExpression('42')).toBe(false)
  })

  it('returns false for decimal number', () => {
    expect(isExpression('1.5')).toBe(false)
  })

  it('returns false for negative number', () => {
    expect(isExpression('-5')).toBe(false)
  })

  it('returns false for negative decimal', () => {
    expect(isExpression('-3.14')).toBe(false)
  })

  it('returns false for zero', () => {
    expect(isExpression('0')).toBe(false)
  })

  it('returns true for addition expression', () => {
    expect(isExpression('10+2')).toBe(true)
  })

  it('returns true for subtraction expression', () => {
    expect(isExpression('10 - 3')).toBe(true)
  })

  it('returns true for multiplication expression', () => {
    expect(isExpression('4*5')).toBe(true)
  })

  it('returns true for division expression', () => {
    expect(isExpression('10/2')).toBe(true)
  })

  it('returns true for expression with parentheses', () => {
    expect(isExpression('(1+2)*3')).toBe(true)
  })

  it('returns true for complex expression', () => {
    expect(isExpression('(10 + 1 - 2) * 1 / -2')).toBe(true)
  })
})

describe('evaluateExpression', () => {
  describe('basic arithmetic', () => {
    it('adds two numbers', () => {
      expect(evaluateExpression('1+2')).toBe(3)
    })

    it('subtracts', () => {
      expect(evaluateExpression('10 - 3')).toBe(7)
    })

    it('multiplies', () => {
      expect(evaluateExpression('4 * 5')).toBe(20)
    })

    it('divides', () => {
      expect(evaluateExpression('10 / 4')).toBe(2.5)
    })
  })

  describe('operator precedence', () => {
    it('applies * before +', () => {
      expect(evaluateExpression('2 + 3 * 4')).toBe(14)
    })

    it('applies / before -', () => {
      expect(evaluateExpression('10 - 6 / 2')).toBe(7)
    })

    it('handles mixed operators left-to-right', () => {
      expect(evaluateExpression('10 + 1 - 2')).toBe(9)
    })
  })

  describe('parentheses', () => {
    it('overrides precedence with parentheses', () => {
      expect(evaluateExpression('(2 + 3) * 4')).toBe(20)
    })

    it('handles nested parentheses', () => {
      expect(evaluateExpression('((1 + 2) * (3 + 4))')).toBe(21)
    })

    it('handles outer parentheses', () => {
      expect(evaluateExpression('(10 + 1 - 2) * 1 / -2')).toBe(-4.5)
    })
  })

  describe('unary minus', () => {
    it('negates a number', () => {
      expect(evaluateExpression('-5')).toBe(-5)
    })

    it('negates a parenthesised expression', () => {
      expect(evaluateExpression('-(1 + 2)')).toBe(-3)
    })

    it('handles double negation', () => {
      expect(evaluateExpression('--5')).toBe(5)
    })

    it('handles unary minus in the middle', () => {
      expect(evaluateExpression('10 * -2')).toBe(-20)
    })
  })

  describe('decimal numbers', () => {
    it('handles decimal operands', () => {
      expect(evaluateExpression('1.5 + 2.5')).toBe(4)
    })

    it('handles decimal multiplication', () => {
      expect(evaluateExpression('0.1 * 10')).toBeCloseTo(1)
    })
  })

  describe('whitespace', () => {
    it('ignores leading and trailing whitespace', () => {
      expect(evaluateExpression('  3 + 4  ')).toBe(7)
    })

    it('ignores internal whitespace', () => {
      expect(evaluateExpression('10   +   5')).toBe(15)
    })
  })

  describe('error cases', () => {
    it('returns null for division by zero', () => {
      expect(evaluateExpression('10 / 0')).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(evaluateExpression('')).toBeNull()
    })

    it('returns null for letters', () => {
      expect(evaluateExpression('abc')).toBeNull()
    })

    it('returns null for unmatched parenthesis', () => {
      expect(evaluateExpression('(1 + 2')).toBeNull()
    })

    it('returns null for trailing operator', () => {
      expect(evaluateExpression('1 +')).toBeNull()
    })

    it('returns null for double decimal point', () => {
      expect(evaluateExpression('1..2')).toBeNull()
    })

    it('returns null for unknown characters', () => {
      expect(evaluateExpression('1 % 2')).toBeNull()
    })
  })
})
