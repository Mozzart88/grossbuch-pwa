/**
 * Safe math expression evaluator — no eval(), no Function().
 * Supports: integers, decimals, +, -, *, /, unary minus, parentheses, whitespace.
 */

const TT = {
  NUMBER: 0,
  PLUS: 1,
  MINUS: 2,
  STAR: 3,
  SLASH: 4,
  LPAREN: 5,
  RPAREN: 6,
  EOF: 7,
} as const
type TT = (typeof TT)[keyof typeof TT]

interface Token {
  type: TT
  value?: number
}

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = []
  let i = 0
  while (i < input.length) {
    const ch = input[i]
    if (ch === ' ' || ch === '\t' || ch === '\n') { i++; continue }
    if (ch === '+') { tokens.push({ type: TT.PLUS }); i++; continue }
    if (ch === '-') { tokens.push({ type: TT.MINUS }); i++; continue }
    if (ch === '*') { tokens.push({ type: TT.STAR }); i++; continue }
    if (ch === '/') { tokens.push({ type: TT.SLASH }); i++; continue }
    if (ch === '(') { tokens.push({ type: TT.LPAREN }); i++; continue }
    if (ch === ')') { tokens.push({ type: TT.RPAREN }); i++; continue }
    if (ch >= '0' && ch <= '9' || ch === '.') {
      let num = ''
      let dots = 0
      while (i < input.length && (input[i] >= '0' && input[i] <= '9' || input[i] === '.')) {
        if (input[i] === '.') dots++
        num += input[i++]
      }
      if (dots > 1) return null
      tokens.push({ type: TT.NUMBER, value: parseFloat(num) })
      continue
    }
    return null // unknown character
  }
  tokens.push({ type: TT.EOF })
  return tokens
}

class Parser {
  private tokens: Token[]
  private pos = 0

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  private peek(): Token { return this.tokens[this.pos] }
  private consume(): Token { return this.tokens[this.pos++] }

  parse(): number | null {
    const result = this.expression()
    if (result === null) return null
    if (this.peek().type !== TT.EOF) return null // trailing garbage
    return result
  }

  private expression(): number | null {
    let left = this.term()
    if (left === null) return null
    while (this.peek().type === TT.PLUS || this.peek().type === TT.MINUS) {
      const op = this.consume().type
      const right = this.term()
      if (right === null) return null
      left = op === TT.PLUS ? left + right : left - right
    }
    return left
  }

  private term(): number | null {
    let left = this.factor()
    if (left === null) return null
    while (this.peek().type === TT.STAR || this.peek().type === TT.SLASH) {
      const op = this.consume().type
      const right = this.factor()
      if (right === null) return null
      if (op === TT.SLASH) {
        if (right === 0) return null // division by zero
        left = left / right
      } else {
        left = left * right
      }
    }
    return left
  }

  private factor(): number | null {
    const t = this.peek()
    if (t.type === TT.MINUS) {
      this.consume()
      const val = this.factor()
      if (val === null) return null
      return -val
    }
    if (t.type === TT.LPAREN) {
      this.consume()
      const val = this.expression()
      if (val === null) return null
      if (this.peek().type !== TT.RPAREN) return null
      this.consume()
      return val
    }
    if (t.type === TT.NUMBER) {
      this.consume()
      return t.value!
    }
    return null
  }
}

/**
 * Returns true if the value looks like a math expression rather than a plain number.
 * Examples: "10+2" → true, "-5" → false, "1.5" → false, "" → false
 */
export function isExpression(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed === '') return false
  return isNaN(Number(trimmed))
}

/**
 * Evaluates a math expression string.
 * Returns the numeric result, or null if the expression is invalid or causes division by zero.
 */
export function evaluateExpression(expr: string): number | null {
  const tokens = tokenize(expr.trim())
  if (tokens === null) return null
  return new Parser(tokens).parse()
}
