import { useEffect, useMemo, useRef, useState } from 'react'
import SmartBar from './SmartBar.jsx'
import TaskCard from './TaskCard.jsx'
import DailyNotes from './DailyNotes.jsx'
import { api } from './lib/api.js'

const UNDO_MS = 5000

function App() {
  const [tasks, setTasks] = useState(null) // null = loading
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null) // { task, index }
  const [liveMessage, setLiveMessage] = useState('')
  const [horizontal, setHorizontal] = useState(() => localStorage.getItem('view') === 'horizontal')
  const [sprintOrder, setSprintOrder] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('sprintOrder')) ?? []
    } catch {
      return []
    }
  })
  const dragSprint = useRef(null)
  const barRef = useRef(null)
  const cardRefs = useRef(new Map())
  const errorTimer = useRef(null)
  const deleteTimer = useRef(null)

  function showError(message) {
    setError(message)
    clearTimeout(errorTimer.current)
    errorTimer.current = setTimeout(() => setError(null), 6000)
  }

  function announce(message) {
    setLiveMessage(message)
  }

  useEffect(() => {
    localStorage.setItem('view', horizontal ? 'horizontal' : 'vertical')
  }, [horizontal])

  useEffect(() => {
    localStorage.setItem('sprintOrder', JSON.stringify(sprintOrder))
  }, [sprintOrder])

  // Unlisted sprints keep their natural numeric order after the ones the user pinned; "no sprint" is always last.
  function sprintRank(sprint) {
    if (!sprint) return Infinity
    const key = String(sprint)
    const i = sprintOrder.indexOf(key)
    return i === -1 ? sprintOrder.length + Number(key) : i
  }

  const orderedTasks = useMemo(
    () => (tasks ? [...tasks].sort((a, b) => sprintRank(a.sprint) - sprintRank(b.sprint)) : tasks),
    [tasks, sprintOrder]
  ) // eslint-disable-line react-hooks/exhaustive-deps

  // All sprint numbers present, in current display order — the draggable pill row.
  const sprintKeys = useMemo(() => {
    const set = new Set()
    ;(tasks ?? []).forEach((t) => t.sprint && set.add(String(t.sprint)))
    return [...set].sort((a, b) => sprintRank(a) - sprintRank(b))
  }, [tasks, sprintOrder]) // eslint-disable-line react-hooks/exhaustive-deps

  function moveSprint(key, toIndex) {
    const order = sprintKeys.filter((k) => k !== key)
    order.splice(toIndex, 0, key)
    setSprintOrder(order)
  }

  function moveSprintBy(key, dir) {
    const i = sprintKeys.indexOf(key)
    const j = i + dir
    if (j < 0 || j >= sprintKeys.length) return
    moveSprint(key, j)
  }

  useEffect(() => {
    api('/api/tasks')
      .then(setTasks)
      .catch(() => {
        setTasks([])
        showError('Impossibile caricare i task — il server risponde?')
      })
  }, [])

  function upsert(task, isNew = false) {
    setTasks((prev) => (isNew ? [task, ...prev] : prev.map((t) => (t.id === task.id ? task : t))))
    announce(isNew ? `Task aggiunto: ${task.title}` : `Aggiornato: ${task.title}`)
  }

  function patchLocal(id, fields) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...fields } : t)))
  }

  // Optimistic write: apply locally, PUT in background, roll back on failure.
  function updateTask(task, fields, undoFields) {
    patchLocal(task.id, fields)
    api(`/api/tasks/${task.id}`, 'PUT', fields)
      .then((updated) => patchLocal(task.id, updated))
      .catch(() => {
        patchLocal(task.id, undoFields)
        showError('Non salvato — riprova')
      })
  }

  function toggleTask(task) {
    const done = task.is_completed ? 0 : 1
    updateTask(task, { is_completed: done }, { is_completed: task.is_completed })
    announce(done ? `Fatto: ${task.title}` : `Da fare: ${task.title}`)
  }

  function changeTitle(task, title) {
    updateTask(task, { title }, { title: task.title })
  }

  // Optimistic like updateTask: patch the note locally, PUT in background, roll back on failure.
  function updateNote(task, noteId, fields) {
    const prevNotes = task.notes
    patchLocal(task.id, { notes: prevNotes.map((n) => (n.id === noteId ? { ...n, ...fields } : n)) })
    api(`/api/tasks/${task.id}/notes/${noteId}`, 'PUT', fields)
      .then((updated) => patchLocal(task.id, updated))
      .catch(() => {
        patchLocal(task.id, { notes: prevNotes })
        showError('Nota non salvata — riprova')
      })
  }

  // Optimistic like updateTask: remove locally, DELETE in background, roll back on failure.
  function deleteNote(task, noteId) {
    const prevNotes = task.notes
    patchLocal(task.id, { notes: prevNotes.filter((n) => n.id !== noteId) })
    api(`/api/tasks/${task.id}/notes/${noteId}`, 'DELETE')
      .then((updated) => patchLocal(task.id, updated))
      .catch(() => {
        patchLocal(task.id, { notes: prevNotes })
        showError('Nota non eliminata — riprova')
      })
    announce('Nota eliminata')
  }

  function commitPendingDelete(pd) {
    api(`/api/tasks/${pd.task.id}`, 'DELETE').catch(() => {
      setTasks((prev) => {
        const next = [...prev]
        next.splice(Math.min(pd.index, next.length), 0, pd.task)
        return next
      })
      showError(`"${pd.task.title}" non eliminato — riprova`)
    })
  }

  function deleteTask(id) {
    const index = tasks.findIndex((t) => t.id === id)
    if (index < 0) return
    const task = tasks[index]

    // One undo slot: a new delete commits the previous one immediately.
    if (pendingDelete) {
      clearTimeout(deleteTimer.current)
      commitPendingDelete(pendingDelete)
    }

    setTasks((prev) => prev.filter((t) => t.id !== id))
    const next = tasks[index + 1] ?? tasks[index - 1]
    setSelectedId(next?.id ?? null)
    const pd = { task, index }
    setPendingDelete(pd)
    announce(`Eliminato: ${task.title}. Premi Z per annullare.`)
    deleteTimer.current = setTimeout(() => {
      commitPendingDelete(pd)
      setPendingDelete(null)
    }, UNDO_MS)
  }

  function undoDelete() {
    if (!pendingDelete) return
    clearTimeout(deleteTimer.current)
    const { task, index } = pendingDelete
    setTasks((prev) => {
      const next = [...prev]
      next.splice(Math.min(index, next.length), 0, task)
      return next
    })
    setSelectedId(task.id)
    setPendingDelete(null)
    announce(`Ripristinato: ${task.title}`)
  }

  function selectAndFocus(id) {
    setSelectedId(id)
    cardRefs.current.get(id)?.focus()
  }

  useEffect(() => {
    function onKeyDown(e) {
      const el = document.activeElement
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || el?.isContentEditable) return
      if (e.key === '/') {
        e.preventDefault()
        barRef.current?.focus()
        return
      }
      if ((e.key === 'z' || e.key === 'Z') && pendingDelete) {
        e.preventDefault()
        undoDelete()
        return
      }
      if (!orderedTasks?.length) return
      const idx = orderedTasks.findIndex((t) => t.id === selectedId)
      const selected = idx >= 0 ? orderedTasks[idx] : null
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        selectAndFocus(orderedTasks[Math.min(idx + 1, orderedTasks.length - 1)].id)
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        selectAndFocus(orderedTasks[Math.max(idx - 1, 0)].id)
      } else if (selected && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        toggleTask(selected)
      } else if (selected && (e.key === 'Backspace' || e.key === 'Delete' || e.key === 'x')) {
        e.preventDefault()
        deleteTask(selected.id)
      } else if (selected && e.key === 'e') {
        e.preventDefault()
        setEditingId(selected.id)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [orderedTasks, selectedId, pendingDelete])

  return (
    <div className="app">
      <div className="visually-hidden" role="status" aria-live="polite">
        {liveMessage}
      </div>
      {error && (
        <div className="error-banner" role="alert">
          ⚠ {error}
          <button className="error-dismiss" aria-label="Chiudi avviso" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}
      <h1>DailyBoard</h1>
      <SmartBar tasks={tasks ?? []} onTaskSaved={upsert} onError={() => showError('Non salvato — riprova')} inputRef={barRef} />
      <DailyNotes onError={() => showError('Appunti non salvati — riprova')} />

      <div className="view-toggle" role="group" aria-label="Orientamento vista">
        <button type="button" aria-pressed={!horizontal} onClick={() => setHorizontal(false)}>
          Verticale
        </button>
        <button type="button" aria-pressed={horizontal} onClick={() => setHorizontal(true)}>
          Orizzontale
        </button>
      </div>

      {sprintKeys.length > 1 && (
        <div className="sprint-order" role="list" aria-label="Ordine sprint — trascina o usa le frecce per riordinare">
          <span className="sprint-order-label">Ordine sprint</span>
          {sprintKeys.map((key, i) => (
            <span
              key={key}
              role="listitem"
              className="sprint-pill"
              draggable
              onDragStart={() => (dragSprint.current = key)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                if (dragSprint.current && dragSprint.current !== key) moveSprint(dragSprint.current, i)
                dragSprint.current = null
              }}
            >
              <button
                type="button"
                aria-label={`Sposta sprint ${key} a sinistra`}
                disabled={i === 0}
                onClick={() => moveSprintBy(key, -1)}
              >
                ‹
              </button>
              #{key}
              <button
                type="button"
                aria-label={`Sposta sprint ${key} a destra`}
                disabled={i === sprintKeys.length - 1}
                onClick={() => moveSprintBy(key, 1)}
              >
                ›
              </button>
            </span>
          ))}
        </div>
      )}

      {tasks === null ? (
        <p className="hint">Caricamento…</p>
      ) : tasks.length === 0 ? (
        <p className="hint">Nessun task — scrivi nella barra e premi Invio.</p>
      ) : horizontal ? (
        <div className="board" role="list" aria-label="Task per sprint">
          {Object.entries(
            orderedTasks.reduce((groups, t) => {
              const key = t.sprint ? `#${t.sprint}` : 'Senza sprint'
              ;(groups[key] ??= []).push(t)
              return groups
            }, {})
          ).map(([sprint, sprintTasks]) => (
            <div className="board-column" key={sprint}>
              <div className={`board-column-header${sprint === 'Senza sprint' ? ' no-sprint' : ''}`}>{sprint}</div>
              {sprintTasks.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  selected={t.id === selectedId}
                  editing={t.id === editingId}
                  cardRef={(node) => {
                    if (node) cardRefs.current.set(t.id, node)
                    else cardRefs.current.delete(t.id)
                  }}
                  onSelect={setSelectedId}
                  onStartEdit={setEditingId}
                  onEndEdit={() => setEditingId(null)}
                  onToggle={toggleTask}
                  onDelete={deleteTask}
                  onTitleChange={changeTitle}
                  onDeleteNote={deleteNote}
                  onUpdateNote={updateNote}
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="feed" role="list" aria-label="Task">
          {orderedTasks.map((t, i) => {
            const prevSprint = i > 0 ? orderedTasks[i - 1].sprint : undefined
            const showDivider = t.sprint !== prevSprint
            return (
              <div key={t.id}>
                {showDivider && (
                  <div className={`sprint-divider${t.sprint ? '' : ' no-sprint'}`}>
                    <span className="sprint-label">{t.sprint ? `#${t.sprint}` : 'Senza sprint'}</span>
                    <span className="sprint-line" />
                  </div>
                )}
                <TaskCard
                  task={t}
                  selected={t.id === selectedId}
                  editing={t.id === editingId}
                  cardRef={(node) => {
                    if (node) cardRefs.current.set(t.id, node)
                    else cardRefs.current.delete(t.id)
                  }}
                  onSelect={setSelectedId}
                  onStartEdit={setEditingId}
                  onEndEdit={() => setEditingId(null)}
                  onToggle={toggleTask}
                  onDelete={deleteTask}
                  onTitleChange={changeTitle}
                  onDeleteNote={deleteNote}
                  onUpdateNote={updateNote}
                />
              </div>
            )
          })}
        </div>
      )}

      {pendingDelete && (
        <div className="undo-toast">
          <span className="undo-title">Eliminato: {pendingDelete.task.title}</span>
          <button onClick={undoDelete}>
            Annulla <kbd>Z</kbd>
          </button>
        </div>
      )}

      <p className="hint kbd-hints">
        <kbd>/</kbd> barra · <kbd>↑↓</kbd> naviga · <kbd>Invio</kbd> fatto · <kbd>⌫</kbd> elimina · <kbd>e</kbd> modifica · <kbd>&gt;</kbd> nota su task
      </p>
    </div>
  )
}

export default App
