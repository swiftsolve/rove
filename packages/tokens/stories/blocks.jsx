import { useRef, useState } from 'react'

// The building blocks of every page, laid out as the Figma file's Foundations
// pages are and styled with the tokens themselves: stories.css for what pages
// share, and a CSS file per page beside its stories.

export function Page({ title, intro, children }) {
  return (
    <main className="page">
      <header className="page-header">
        <p className="page-label">Foundations</p>
        <h1 className="page-title">{title}</h1>
        {intro && <p className="page-intro">{intro}</p>}
      </header>
      {children}
    </main>
  )
}

// A rule to follow, on its own line with the warning icon.
function Warning({ children }) {
  return (
    <p className="section-warning">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>
      {children}
    </p>
  )
}

// A half of a page: its primitive tokens, named by what they are, or its
// semantic ones, named for their job. Its sections follow inside it.
export function Group({ title, intro, warning, children }) {
  return (
    <section className="group">
      <h2 className="group-title">{title}</h2>
      {intro && <p className="group-intro">{intro}</p>}
      {warning && <Warning>{warning}</Warning>}
      {children}
    </section>
  )
}

// `intro` is a line or a list of lines; `warning`, a rule to follow under it.
export function Section({ title, intro, warning, children }) {
  return (
    <section className="section">
      <h2 className="section-title">{title}</h2>
      {[intro]
        .flat()
        .filter(Boolean)
        .map((line) => (
          <p key={line} className="section-intro">
            {line}
          </p>
        ))}
      {warning && <Warning>{warning}</Warning>}
      {children && <div className="section-body">{children}</div>}
    </section>
  )
}

// A table with Figma's column widths: `columns` is `[['Token', '2.5fr'], …]`.
export function Table({ columns, children }) {
  const style = { '--columns': columns.map(([, width]) => width).join(' ') }
  return (
    <div className="table" role="table" style={style}>
      <div className="table-row table-head" role="row">
        {columns.map(([label]) => (
          <span key={label} role="columnheader">
            {label}
          </span>
        ))}
      </div>
      {children}
    </div>
  )
}

export function TableRow({ children }) {
  return (
    <div className="table-row" role="row">
      {children.map((cell, index) => (
        <div key={index} className="table-cell" role="cell">
          {cell}
        </div>
      ))}
    </div>
  )
}

// A token's name over its description, as each table's first column.
export function Name({ name, description }) {
  return (
    <span className="name">
      <span className="name-title">{name}</span>
      {description && <span className="name-description">{description}</span>}
    </span>
  )
}

// Copies text, with a fallback for when the Clipboard API is blocked in the preview iframe.
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const field = document.createElement('textarea')
    field.value = text
    document.body.append(field)
    field.select()
    document.execCommand('copy')
    field.remove()
  }
}

// A code chip that copies itself on click, or `copy` when that differs from
// what it shows: `.type-heading-large` copies the class name alone.
// "Copied" stays until the pointer or focus leaves, never flipping back to "Copy"
// under the pointer; a tap gets it for at least COPIED_MIN_MS. It resets once the
// tooltip has faded out.
const COPIED_MIN_MS = 900
const TIP_FADE_MS = 200

export function Code({ children, copy: copyAs }) {
  // idle, then copied, then leaving (the tooltip fades with "Copied" still in it).
  const [state, setState] = useState('idle')
  const copiedAt = useRef(0)
  const timer = useRef(0)
  const text = [children].flat().join('')
  const copy = async () => {
    await copyText(copyAs ?? text)
    clearTimeout(timer.current)
    copiedAt.current = Date.now()
    setState('copied')
  }
  const leave = () => {
    if (state !== 'copied') return
    const wait = Math.max(0, COPIED_MIN_MS - (Date.now() - copiedAt.current))
    timer.current = setTimeout(() => {
      setState('leaving')
      timer.current = setTimeout(() => setState('idle'), TIP_FADE_MS)
    }, wait)
  }
  const isCopied = state !== 'idle'
  const className = ['code', isCopied && 'is-copied', state === 'leaving' && 'is-leaving'].filter(Boolean).join(' ')
  return (
    // The tooltip says what a click does, then that it did it: both labels sit in
    // one place and crossfade, so the text never swaps mid-frame.
    <button
      type="button"
      className={className}
      aria-label={`Copy ${copyAs ?? text}`}
      onClick={copy}
      onPointerLeave={leave}
      onBlur={leave}
    >
      <span className="code-tip" aria-hidden="true">
        <span className="code-tip-label code-tip-copy">
          <svg viewBox="0 0 24 24">
            <rect x="8" y="8" width="14" height="14" rx="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </svg>
          Copy
        </span>
        <span className="code-tip-label code-tip-copied">
          <svg viewBox="0 0 24 24">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          Copied
        </span>
      </span>
      <code>{text}</code>
      <span className="visually-hidden" aria-live="polite">
        {isCopied ? 'Copied' : ''}
      </span>
    </button>
  )
}

export function Codes({ names }) {
  return (
    <span className="codes">
      {names.map((name) => (
        <Code key={name}>{name}</Code>
      ))}
    </span>
  )
}

// A real dot between values, as Figma's Dot separator, never a typed "·".
export function Joined({ parts }) {
  return (
    <span className="joined">
      {parts.map((part, index) => (
        <span key={index} className="joined-part">
          {index > 0 && <span className="dot" aria-hidden="true" />}
          {part}
        </span>
      ))}
    </span>
  )
}
