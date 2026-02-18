export const FRAC_SCALE = 1_000_000_000_000_000_000 // 10^18

export interface IntFrac {
  int: number
  frac: number
}

/** Convert decimal number to (int, frac) with floor convention */
export function toIntFrac(value: number): IntFrac {
  const int = Math.floor(value)
  const frac = Math.round((value - int) * FRAC_SCALE)
  return { int, frac }
}

/** Convert (int, frac) to decimal number */
export function fromIntFrac(int: number, frac: number): number {
  return int + (Number(frac) / Number(FRAC_SCALE))
}

/** Convert old single-integer amount to (int, frac) */
export function fromLegacy(oldValue: number, dp: number): IntFrac {
  const divisor = Math.pow(10, dp)
  return toIntFrac(oldValue / divisor)
}

/** Add two IntFrac values */
export function addIntFrac(a: IntFrac, b: IntFrac): IntFrac {
  const rawFrac = a.frac + b.frac
  const carry = Math.floor(rawFrac / FRAC_SCALE)
  return { int: a.int + b.int + carry, frac: rawFrac - carry * FRAC_SCALE }
}

/** Subtract b from a (floor convention for result) */
export function subIntFrac(a: IntFrac, b: IntFrac): IntFrac {
  const rawFrac = a.frac - b.frac
  const borrow = rawFrac < 0 ? 1 : 0
  return {
    int: a.int - b.int - borrow,
    frac: rawFrac + borrow * FRAC_SCALE,
  }
}
