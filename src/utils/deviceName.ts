// Coarse device-type categories guessed from the user agent string. Exact model
// detection (e.g. "Samsung Galaxy S23") is not reliably obtainable from modern
// browsers, so this only distinguishes broad device classes.
export function guessDeviceName(userAgent: string): string {
  if (/iPad/.test(userAgent)) return 'iPad'
  if (/iPhone|iPod/.test(userAgent)) return 'iPhone'
  if (/Android/.test(userAgent)) {
    return /Mobile/.test(userAgent) ? 'Android Phone' : 'Android Tablet'
  }
  if (/Macintosh|Mac OS X/.test(userAgent)) return 'Mac'
  if (/Windows/.test(userAgent)) return 'Windows'
  if (/Linux/.test(userAgent)) return 'Linux'
  return 'Browser'
}
