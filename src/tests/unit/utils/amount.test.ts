import { describe, it, expect } from 'vitest'
import { FRAC_SCALE, toIntFrac, fromIntFrac, fromLegacy, addIntFrac, subIntFrac } from '../../../utils/amount'

describe('amount utils', () => {
  describe('toIntFrac', () => {
    it('converts positive integer', () => {
      expect(toIntFrac(5)).toEqual({ int: 5, frac: 0 })
    })

    it('converts positive decimal', () => {
      const result = toIntFrac(123.456)
      expect(result.int).toBe(123)
      expect(result.frac).toBeCloseTo(0.456 * FRAC_SCALE, -4)
    })

    it('converts zero', () => {
      expect(toIntFrac(0)).toEqual({ int: 0, frac: 0 })
    })

    it('converts negative with floor convention', () => {
      // -1.5 → int=-2, frac=0.5*FRAC_SCALE
      const result = toIntFrac(-1.5)
      expect(result.int).toBe(-2)
      expect(result.frac).toBeCloseTo(0.5 * FRAC_SCALE, -3)
    })

    it('converts -0.3 with floor convention', () => {
      // -0.3 → int=-1, frac=0.7*FRAC_SCALE
      const result = toIntFrac(-0.3)
      expect(result.int).toBe(-1)
      expect(result.frac).toBeCloseTo(0.7 * FRAC_SCALE, -3)
    })

    it('frac is always >= 0', () => {
      const values = [-5.5, -0.1, -100.99, -0.001]
      for (const v of values) {
        const result = toIntFrac(v)
        expect(result.frac).toBeGreaterThanOrEqual(0)
      }
    })
  })

  describe('fromIntFrac', () => {
    it('converts positive integer', () => {
      expect(fromIntFrac(5, 0)).toBe(5)
    })

    it('converts positive with frac', () => {
      const frac = Math.round(0.5 * FRAC_SCALE)
      expect(fromIntFrac(123, frac)).toBeCloseTo(123.5)
    })

    it('converts zero', () => {
      expect(fromIntFrac(0, 0)).toBe(0)
    })

    it('converts negative (floor convention)', () => {
      // -1.5 = int=-2, frac=0.5*FRAC_SCALE → -2 + 0.5 = -1.5
      const frac = Math.round(0.5 * FRAC_SCALE)
      expect(fromIntFrac(-2, frac)).toBeCloseTo(-1.5)
    })

    it('round-trips correctly', () => {
      const values = [0, 1, -1, 123.456, -0.3, -1.5, 0.001, 99999.99]
      for (const v of values) {
        const { int, frac } = toIntFrac(v)
        expect(fromIntFrac(int, frac)).toBeCloseTo(v, 10)
      }
    })
  })

  describe('fromLegacy', () => {
    it('converts old integer amount with 2 dp', () => {
      // 150 with dp=2 → 1.50
      const result = fromLegacy(150, 2)
      expect(fromIntFrac(result.int, result.frac)).toBeCloseTo(1.5)
    })

    it('converts old integer amount with 0 dp', () => {
      const result = fromLegacy(100, 0)
      expect(fromIntFrac(result.int, result.frac)).toBeCloseTo(100)
    })

    it('converts old integer amount with 8 dp (crypto)', () => {
      // 100000000 with dp=8 → 1.0
      const result = fromLegacy(100000000, 8)
      expect(fromIntFrac(result.int, result.frac)).toBeCloseTo(1.0)
    })
  })

  describe('addIntFrac', () => {
    it('adds two positive values', () => {
      const a = toIntFrac(1.5)
      const b = toIntFrac(2.3)
      const result = addIntFrac(a, b)
      expect(fromIntFrac(result.int, result.frac)).toBeCloseTo(3.8)
    })

    it('handles carry', () => {
      const a = toIntFrac(0.7)
      const b = toIntFrac(0.6)
      const result = addIntFrac(a, b)
      expect(fromIntFrac(result.int, result.frac)).toBeCloseTo(1.3)
    })

    it('adds zero', () => {
      const a = toIntFrac(5.5)
      const b = toIntFrac(0)
      const result = addIntFrac(a, b)
      expect(fromIntFrac(result.int, result.frac)).toBeCloseTo(5.5)
    })
  })

  describe('subIntFrac', () => {
    it('subtracts two positive values', () => {
      const a = toIntFrac(5.5)
      const b = toIntFrac(2.3)
      const result = subIntFrac(a, b)
      expect(fromIntFrac(result.int, result.frac)).toBeCloseTo(3.2)
    })

    it('handles borrow', () => {
      const a = toIntFrac(1.2)
      const b = toIntFrac(0.7)
      const result = subIntFrac(a, b)
      expect(fromIntFrac(result.int, result.frac)).toBeCloseTo(0.5)
    })

    it('produces negative result', () => {
      const a = toIntFrac(1.0)
      const b = toIntFrac(3.5)
      const result = subIntFrac(a, b)
      expect(fromIntFrac(result.int, result.frac)).toBeCloseTo(-2.5)
    })
  })
})
