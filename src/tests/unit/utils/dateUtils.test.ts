import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getCurrentMonth,
  getPreviousMonth,
  getNextMonth,
  formatMonth,
  formatDate,
  formatTime,
  formatDateTime,
  toLocalDateTime,
  toDateTimeLocal,
  fromDateTimeLocal,
  groupByDate,
} from '../../../utils/dateUtils'

describe('dateUtils', () => {
  describe('getCurrentMonth', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns current month in YYYY-MM format', () => {
      vi.setSystemTime(new Date(2025, 0, 15)) // January 15, 2025
      expect(getCurrentMonth()).toBe('2025-01')
    })

    it('pads single-digit months with leading zero', () => {
      vi.setSystemTime(new Date(2025, 4, 1)) // May 1, 2025
      expect(getCurrentMonth()).toBe('2025-05')
    })

    it('handles December correctly', () => {
      vi.setSystemTime(new Date(2025, 11, 31)) // December 31, 2025
      expect(getCurrentMonth()).toBe('2025-12')
    })

    it('handles year transitions', () => {
      vi.setSystemTime(new Date(2026, 0, 1)) // January 1, 2026
      expect(getCurrentMonth()).toBe('2026-01')
    })
  })

  describe('getPreviousMonth', () => {
    it('returns previous month for middle of year', () => {
      expect(getPreviousMonth('2025-06')).toBe('2025-05')
    })

    it('handles year rollback from January to December', () => {
      expect(getPreviousMonth('2025-01')).toBe('2024-12')
    })

    it('handles February to January', () => {
      expect(getPreviousMonth('2025-02')).toBe('2025-01')
    })

    it('handles December to November', () => {
      expect(getPreviousMonth('2025-12')).toBe('2025-11')
    })

    it('handles multiple year transitions', () => {
      expect(getPreviousMonth('2000-01')).toBe('1999-12')
    })
  })

  describe('getNextMonth', () => {
    it('returns next month for middle of year', () => {
      expect(getNextMonth('2025-06')).toBe('2025-07')
    })

    it('handles year rollforward from December to January', () => {
      expect(getNextMonth('2025-12')).toBe('2026-01')
    })

    it('handles January to February', () => {
      expect(getNextMonth('2025-01')).toBe('2025-02')
    })

    it('handles November to December', () => {
      expect(getNextMonth('2025-11')).toBe('2025-12')
    })

    it('handles multiple year transitions', () => {
      expect(getNextMonth('1999-12')).toBe('2000-01')
    })
  })

  describe('formatMonth', () => {
    it('formats month with full month name and year', () => {
      const result = formatMonth('2025-01')
      expect(result).toMatch(/January.*2025|2025.*January/)
    })

    it('handles all months', () => {
      const months = [
        '2025-01', '2025-02', '2025-03', '2025-04',
        '2025-05', '2025-06', '2025-07', '2025-08',
        '2025-09', '2025-10', '2025-11', '2025-12',
      ]
      months.forEach((month) => {
        const result = formatMonth(month)
        expect(result).toContain('2025')
        expect(result.length).toBeGreaterThan(4) // Should include month name
      })
    })

    it('handles different years', () => {
      const result = formatMonth('2030-06')
      expect(result).toContain('2030')
    })
  })

  describe('formatDate', () => {
    it('formats database date string correctly', () => {
      const result = formatDate('2025-01-09 14:30:00')
      expect(result).toMatch(/9|09/)
      expect(result).toMatch(/Jan/)
      expect(result).toMatch(/2025/)
    })

    it('formats Date object correctly', () => {
      const date = new Date(2025, 0, 9, 14, 30, 0)
      const result = formatDate(date)
      expect(result).toMatch(/9|09/)
      expect(result).toMatch(/Jan/)
      expect(result).toMatch(/2025/)
    })

    it('handles different months', () => {
      const result = formatDate('2025-12-25 08:00:00')
      expect(result).toMatch(/25/)
      expect(result).toMatch(/Dec/)
    })

    it('handles first day of month', () => {
      const result = formatDate('2025-03-01 00:00:00')
      expect(result).toMatch(/1|01/)
      expect(result).toMatch(/Mar/)
    })
  })

  describe('formatTime', () => {
    it('extracts time from database date string', () => {
      expect(formatTime('2025-01-09 14:30:00')).toBe('14:30')
    })

    it('handles midnight', () => {
      expect(formatTime('2025-01-09 00:00:00')).toBe('00:00')
    })

    it('handles end of day', () => {
      expect(formatTime('2025-01-09 23:59:00')).toBe('23:59')
    })

    it('formats Date object correctly', () => {
      const date = new Date(2025, 0, 9, 14, 30, 0)
      const result = formatTime(date)
      expect(result).toMatch(/14:30|2:30/)
    })

    it('handles morning hours', () => {
      expect(formatTime('2025-01-09 09:05:00')).toBe('09:05')
    })
  })

  describe('formatDateTime', () => {
    it('combines date and time formatting', () => {
      const result = formatDateTime('2025-01-09 14:30:00')
      expect(result).toMatch(/9|09/)
      expect(result).toMatch(/Jan/)
      expect(result).toMatch(/2025/)
      expect(result).toMatch(/14:30/)
    })

    it('handles Date object', () => {
      const date = new Date(2025, 0, 9, 14, 30, 0)
      const result = formatDateTime(date)
      expect(result).toMatch(/Jan/)
      expect(result).toMatch(/2025/)
    })
  })

  describe('toLocalDateTime', () => {
    it('formats Date to local datetime string', () => {
      const date = new Date(2025, 0, 9, 14, 30, 45)
      expect(toLocalDateTime(date)).toBe('2025-01-09 14:30:45')
    })

    it('pads single digit values', () => {
      const date = new Date(2025, 0, 1, 5, 3, 7)
      expect(toLocalDateTime(date)).toBe('2025-01-01 05:03:07')
    })

    it('handles midnight', () => {
      const date = new Date(2025, 0, 1, 0, 0, 0)
      expect(toLocalDateTime(date)).toBe('2025-01-01 00:00:00')
    })

    it('handles end of year', () => {
      const date = new Date(2025, 11, 31, 23, 59, 59)
      expect(toLocalDateTime(date)).toBe('2025-12-31 23:59:59')
    })
  })

  describe('toDateTimeLocal', () => {
    it('converts database format to HTML5 datetime-local format', () => {
      expect(toDateTimeLocal('2025-01-09 14:30:00')).toBe('2025-01-09T14:30')
    })

    it('converts Date object to datetime-local format', () => {
      const date = new Date(2025, 0, 9, 14, 30, 0)
      expect(toDateTimeLocal(date)).toBe('2025-01-09T14:30')
    })

    it('pads single digit values', () => {
      const date = new Date(2025, 0, 1, 5, 3, 0)
      expect(toDateTimeLocal(date)).toBe('2025-01-01T05:03')
    })

    it('handles midnight', () => {
      expect(toDateTimeLocal('2025-01-09 00:00:00')).toBe('2025-01-09T00:00')
    })
  })

  describe('fromDateTimeLocal', () => {
    it('converts datetime-local to database format', () => {
      expect(fromDateTimeLocal('2025-01-09T14:30')).toBe('2025-01-09 14:30:00')
    })

    it('handles midnight', () => {
      expect(fromDateTimeLocal('2025-01-09T00:00')).toBe('2025-01-09 00:00:00')
    })

    it('handles end of day', () => {
      expect(fromDateTimeLocal('2025-01-09T23:59')).toBe('2025-01-09 23:59:00')
    })
  })

  describe('groupByDate', () => {
    it('groups items by date', () => {
      const items = [
        { date_time: '2025-01-09 14:30:00', id: 1 },
        { date_time: '2025-01-09 16:00:00', id: 2 },
        { date_time: '2025-01-10 08:00:00', id: 3 },
      ]
      const groups = groupByDate(items)

      expect(groups.size).toBe(2)
      expect(groups.get('2025-01-09')).toHaveLength(2)
      expect(groups.get('2025-01-10')).toHaveLength(1)
    })

    it('returns empty map for empty array', () => {
      const groups = groupByDate([])
      expect(groups.size).toBe(0)
    })

    it('handles single item', () => {
      const items = [{ date_time: '2025-01-09 14:30:00', id: 1 }]
      const groups = groupByDate(items)

      expect(groups.size).toBe(1)
      expect(groups.get('2025-01-09')).toHaveLength(1)
    })

    it('preserves item references', () => {
      const item = { date_time: '2025-01-09 14:30:00', id: 1, extra: 'data' }
      const items = [item]
      const groups = groupByDate(items)

      expect(groups.get('2025-01-09')?.[0]).toBe(item)
    })

    it('handles items across multiple months', () => {
      const items = [
        { date_time: '2025-01-31 23:59:00', id: 1 },
        { date_time: '2025-02-01 00:01:00', id: 2 },
      ]
      const groups = groupByDate(items)

      expect(groups.size).toBe(2)
      expect(groups.get('2025-01-31')).toHaveLength(1)
      expect(groups.get('2025-02-01')).toHaveLength(1)
    })
  })
})
