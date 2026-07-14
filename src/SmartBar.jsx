import { useEffect, useRef, useState } from 'react'
import { parseSmartInput } from './lib/parseSmartInput.js'
import { api } from './lib/api.js'

const TOKEN_RE = /(^|\s)([@[])([\w-]*)$/

// Known assignees/categories survive an emptied DB: union of current tasks and what localStorage remembers.
function knownValues(tasks, key, pick) {
  let stored = []
  try {
    stored = JSON.parse(localStorage.getItem(key)) ?? []
  } catch {
    /* corrupt entry: start over */
  }
  const all = [...new Set([...stored, ...tasks.flatMap(pick).filter(Boolean)])]
  if (all.length > stored.length) localStorage.setItem(key, JSON.stringify(all))
  return all
}

function getSuggestions(value, target, tasks) {
  if (target) return { kind: null, items: [] }
  if (value.startsWith('>')) {
    const q = value.slice(1).trim().toLowerCase()
    return { kind: 'task', items: tasks.filter((t) => t.title.toLowerCase().includes(q)).slice(0, 6) }
  }
  const m = value.match(TOKEN_RE)
  if (!m) return { kind: null, items: [] }
  const q = m[3].toLowerCase()
  if (m[2] === '@') {
    const names = knownValues(tasks, 'knownAssignees', (t) => [t.assignee, ...t.notes.map((n) => n.assignee)])
    return { kind: 'assignee', items: names.filter((n) => n.startsWith(q) && n !== q) }
  }
  const cats = knownValues(tasks, 'knownCategories', (t) => [t.category, ...t.notes.map((n) => n.category)])
  return { kind: 'category', items: cats.filter((c) => c.toLowerCase().startsWith(q) && c.toLowerCase() !== q) }
}

export default function SmartBar({ tasks, onTaskSaved, onError, inputRef }) {
  const [value, setValue] = useState('')
  const [target, setTarget] = useState(null)
  const [highlight, setHighlight] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const busyRef = useRef(false)

  const { kind, items } = getSuggestions(value, target, tasks)
  const open = items.length > 0 && !dismissed
  const active = open ? Math.min(highlight, items.length - 1) : 0

  // Live preview of what the smart syntax will produce, before Enter.
  const preview = !target && !value.startsWith('>') ? parseSmartInput(value) : null
  const previewChips = preview
    ? [
        preview.category && ['categoria', preview.category],
        preview.assignee && ['assignee', `@${preview.assignee}`],
        preview.sprint && ['sprint', `#${preview.sprint}`],
      ].filter(Boolean)
    : []

  function applySuggestion(item) {
    if (kind === 'task') {
      setTarget(item)
      setValue('')
    } else if (kind === 'assignee') {
      setValue(value.replace(TOKEN_RE, `$1@${item} `))
    } else {
      setValue(value.replace(TOKEN_RE, `$1[${item}] `))
    }
    setHighlight(0)
  }

  async function submit() {
    const text = value.trim()
    if (busyRef.current) return
    busyRef.current = true
    try {
      if (target) {
        const parsed = parseSmartInput(text)
        if (!parsed.title) return
        onTaskSaved(await api(`/api/tasks/${target.id}/notes`, 'POST', { content: parsed.title, category: parsed.category, assignee: parsed.assignee }))
        setTarget(null)
      } else {
        const parsed = parseSmartInput(text)
        if (!parsed.title) return
        onTaskSaved(await api('/api/tasks', 'POST', parsed), true)
      }
      setValue('')
    } catch (err) {
      onError(err)
    } finally {
      busyRef.current = false
    }
  }

  function handleKeyDown(e) {
    if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      setHighlight((h) => (h + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length)
    } else if (open && e.key === 'Tab') {
      e.preventDefault()
      applySuggestion(items[active])
    } else if (e.key === 'Enter') {
      e.preventDefault()
      // Enter always accepts the highlighted suggestion when the listbox is
      // open — never submits through it (typo-assignees were minted that way).
      if (open) applySuggestion(items[active])
      else submit()
    } else if (e.key === 'Escape') {
      if (open) setDismissed(true)
      else if (target) setTarget(null)
      else if (value) setValue('')
      else e.target.blur()
    }
  }

  return (
    <div className="smart-bar">
      {target && <span className="target-chip">↳ {target.title}</span>}
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls="smartbar-suggestions"
        aria-activedescendant={open ? `smartbar-option-${active}` : undefined}
        aria-autocomplete="list"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setHighlight(0)
          setDismissed(false)
        }}
        onKeyDown={handleKeyDown}
        placeholder={target ? 'Nota per il task selezionato… (Esc annulla)' : '[FE] Titolo @assignee #sprint  ·  >cerca task per nota'}
        aria-label={target ? `Nota per ${target.title}` : 'Nuovo task'}
        autoFocus
      />
      {previewChips.length > 0 && (
        <div className="parse-preview" aria-hidden="true">
          {previewChips.map(([label, val]) => (
            <span key={label} className="parse-chip">
              <span className="parse-chip-label">{label}</span> {val}
            </span>
          ))}
        </div>
      )}
      {open && (
        <ul className="suggestions" id="smartbar-suggestions" role="listbox">
          {items.map((item, i) => (
            <li
              key={kind === 'task' ? item.id : item}
              id={`smartbar-option-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseDown={(e) => {
                e.preventDefault()
                applySuggestion(item)
              }}
            >
              {kind === 'task' ? item.title : item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
