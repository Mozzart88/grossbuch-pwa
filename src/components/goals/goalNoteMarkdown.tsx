import type { ReactNode } from 'react'

// Minimal, hand-rolled markdown for a goal's note: bold, italic, unordered/
// ordered lists, and autodetected http(s):// links. No other syntax renders
// specially, and no new dependency is introduced (see design.md / spec.md).

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)'"\]])/g
const INLINE_RE = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3/g

function linkify(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let idx = 0
  const re = new RegExp(URL_RE)
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    parts.push(
      <a
        key={`${keyPrefix}-l${idx++}`}
        href={match[0]}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary-600 dark:text-primary-400 underline"
      >
        {match[0]}
      </a>
    )
    lastIndex = re.lastIndex
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let idx = 0
  const re = new RegExp(INLINE_RE)
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(...linkify(text.slice(lastIndex, match.index), `${keyPrefix}-t${idx++}`))
    }
    if (match[1]) {
      nodes.push(<strong key={`${keyPrefix}-b${idx++}`}>{linkify(match[2], `${keyPrefix}-bi${idx}`)}</strong>)
    } else if (match[3]) {
      nodes.push(<em key={`${keyPrefix}-i${idx++}`}>{linkify(match[4], `${keyPrefix}-ii${idx}`)}</em>)
    }
    lastIndex = re.lastIndex
  }
  if (lastIndex < text.length) {
    nodes.push(...linkify(text.slice(lastIndex), `${keyPrefix}-t${idx}`))
  }
  return nodes
}

export function renderGoalNote(note: string): ReactNode {
  const lines = note.split('\n')
  const blocks: ReactNode[] = []
  let listBuffer: { type: 'ul' | 'ol'; items: string[] } | null = null

  const flushList = (key: string) => {
    if (!listBuffer) return
    const items = listBuffer.items
    const isOrdered = listBuffer.type === 'ol'
    blocks.push(
      isOrdered ? (
        <ol key={key} className="list-decimal list-inside">
          {items.map((item, i) => <li key={i}>{renderInline(item, `${key}-${i}`)}</li>)}
        </ol>
      ) : (
        <ul key={key} className="list-disc list-inside">
          {items.map((item, i) => <li key={i}>{renderInline(item, `${key}-${i}`)}</li>)}
        </ul>
      )
    )
    listBuffer = null
  }

  lines.forEach((line, i) => {
    const ulMatch = /^\s*[-*]\s+(.*)$/.exec(line)
    const olMatch = /^\s*\d+\.\s+(.*)$/.exec(line)
    if (ulMatch) {
      if (!listBuffer || listBuffer.type !== 'ul') {
        flushList(`list-${i}`)
        listBuffer = { type: 'ul', items: [] }
      }
      listBuffer.items.push(ulMatch[1])
    } else if (olMatch) {
      if (!listBuffer || listBuffer.type !== 'ol') {
        flushList(`list-${i}`)
        listBuffer = { type: 'ol', items: [] }
      }
      listBuffer.items.push(olMatch[1])
    } else {
      flushList(`list-${i}`)
      if (line.trim()) {
        blocks.push(<p key={`p-${i}`}>{renderInline(line, `p-${i}`)}</p>)
      }
    }
  })
  flushList('list-end')

  return <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">{blocks}</div>
}
