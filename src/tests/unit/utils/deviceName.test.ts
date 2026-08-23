import { describe, it, expect } from 'vitest'
import { guessDeviceName } from '../../../utils/deviceName'

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  ipod: 'Mozilla/5.0 (iPod touch; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  androidPhone: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  unknown: 'SomeWeirdBot/1.0',
}

describe('guessDeviceName', () => {
  it('recognizes an iPhone', () => {
    expect(guessDeviceName(UA.iphone)).toBe('iPhone')
  })

  it('recognizes an iPod as an iPhone-class device', () => {
    expect(guessDeviceName(UA.ipod)).toBe('iPhone')
  })

  it('recognizes an iPad', () => {
    expect(guessDeviceName(UA.ipad)).toBe('iPad')
  })

  it('recognizes an Android phone (Mobile token present)', () => {
    expect(guessDeviceName(UA.androidPhone)).toBe('Android Phone')
  })

  it('recognizes an Android tablet (no Mobile token)', () => {
    expect(guessDeviceName(UA.androidTablet)).toBe('Android Tablet')
  })

  it('recognizes a Mac', () => {
    expect(guessDeviceName(UA.mac)).toBe('Mac')
  })

  it('recognizes Windows', () => {
    expect(guessDeviceName(UA.windows)).toBe('Windows')
  })

  it('recognizes Linux', () => {
    expect(guessDeviceName(UA.linux)).toBe('Linux')
  })

  it('falls back to a generic name for an unrecognized user agent', () => {
    expect(guessDeviceName(UA.unknown)).toBe('Browser')
  })

  it('falls back to a generic name for an empty user agent', () => {
    expect(guessDeviceName('')).toBe('Browser')
  })
})
