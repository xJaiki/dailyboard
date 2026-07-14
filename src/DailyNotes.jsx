import { useEffect, useRef, useState } from 'react'
import { api } from './lib/api.js'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function DailyNotes({ onError }) {
  const [content, setContent] = useState('')
  const [saved, setSaved] = useState(false)
  const timerRef = useRef(null)
  const pendingRef = useRef(null) // { date, value } typed but not yet saved by the debounce
  // Starts on today (a call crossing midnight keeps writing to the day it loaded); the date picker navigates past days.
  const [date, setDate] = useState(todayISO)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  // The 1s debounce loses the last edit if the tab closes (or the date changes) first: flush it with a keepalive PUT.
  function flush() {
    if (pendingRef.current == null) return
    fetch(`/api/notes/${pendingRef.current.date}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: pendingRef.current.value }),
      keepalive: true,
    })
    pendingRef.current = null
  }

  useEffect(() => {
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [])

  useEffect(() => {
    api(`/api/notes/${date}`)
      .then((note) => setContent(note.content ?? ''))
      .catch(onError)
  }, [date]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(e) {
    const value = e.target.value
    setContent(value)
    pendingRef.current = { date, value }
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      try {
        await api(`/api/notes/${date}`, 'PUT', { content: value })
        if (pendingRef.current?.date === date && pendingRef.current?.value === value) pendingRef.current = null
        setSaved(true)
        setTimeout(() => setSaved(false), 1500)
      } catch (err) {
        onError(err)
      }
    }, 1000)
  }

  return (
    // ponytail: <details> gives open/close for free — no state, no outside-click handler.
    <details className="daily-notes">
      <summary className="daily-notes-toggle" aria-label="Appunti del daily">
        📝
      </summary>
      <div className="daily-notes-panel">
        <div className="daily-notes-head">
          <strong>Appunti del daily</strong>
          <input
            type="date"
            className="daily-notes-date"
            aria-label="Giorno degli appunti"
            value={date}
            max={todayISO()}
            onChange={(e) => {
              if (!e.target.value) return
              clearTimeout(timerRef.current)
              flush()
              setDate(e.target.value)
            }}
          />
          <span className="saved-indicator" role="status" aria-live="polite">
            {saved ? 'Salvato' : ''}
          </span>
        </div>
        <textarea value={content} onChange={handleChange} placeholder="Appunti del daily..." rows={8} aria-label="Appunti del daily" />
      </div>
    </details>
  )
}
