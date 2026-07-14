import { useEffect, useRef, useState } from 'react'
import { api } from './lib/api.js'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function DailyNotes({ onError }) {
  const [content, setContent] = useState('')
  const [saved, setSaved] = useState(false)
  const timerRef = useRef(null)
  // Fixed at mount: a call crossing midnight keeps writing to the day it loaded.
  const [date] = useState(todayISO)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  useEffect(() => {
    api(`/api/notes/${date}`)
      .then((note) => setContent(note.content ?? ''))
      .catch(onError)
  }, [date]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(e) {
    const value = e.target.value
    setContent(value)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      try {
        await api(`/api/notes/${date}`, 'PUT', { content: value })
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
          <span className="saved-indicator" role="status" aria-live="polite">
            {saved ? 'Salvato' : ''}
          </span>
        </div>
        <textarea value={content} onChange={handleChange} placeholder="Appunti del daily..." rows={8} aria-label="Appunti del daily" />
      </div>
    </details>
  )
}
