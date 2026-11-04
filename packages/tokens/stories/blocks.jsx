import { useState } from 'react'

// The building blocks of every page, laid out as the Figma file's Foundations
// pages are and styled in stories.css with the tokens themselves.

export function Page({ title, intro, children }) {
  return (
    <main className="page">
      <header className="page-header">
        <p className="page-overline">Foundations</p>
        <h1 className="page-title">{title}</h1>
        {intro && <p className="page-intro">{intro}</p>}
      </header>
      {children}
    </main>
  )
}

// A half of a page: its primitive tokens, named by what they are, or its
// semantic ones, named for their job. Its sections follow inside it.
export function Group({ title, intro, children }) {
  return (
    <section className="group">
      <h2 className="group-title">{title}</h2>
      {intro && <p className="group-intro">{intro}</p>}
      {children}
    </section>
  )
}

// `intro` is a line or a list of lines. `warning` is a rule to follow, on its own line under the intro with the warning icon.
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
      {warning && (
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
          {warning}
        </p>
      )}
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
export function Code({ children, copy: copyAs }) {
  const [isCopied, setIsCopied] = useState(false)
  const text = [children].flat().join('')
  const copy = async () => {
    await copyText(copyAs ?? text)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 1200)
  }
  return (
    <button type="button" className={isCopied ? 'code is-copied' : 'code'} title="Copy" onClick={copy}>
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
