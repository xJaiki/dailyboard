import { useEffect, useMemo, useRef, useState } from 'react'
import SmartBar from './SmartBar.jsx'
import TaskCard from './TaskCard.jsx'
import DailyNotes from './DailyNotes.jsx'
import { api } from './lib/api.js'
import { parseSmartInput } from './lib/parseSmartInput.js'

function readJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}

const UNDO_MS = 5000

function App() {
  const [tasks, setTasks] = useState(null) // null = loading
  const [error, setError] = useState(null) // { message, retry }
  const [selectedId, setSelectedId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [pendingDeletes, setPendingDeletes] = useState([]) // [{ task, index, timer }] — Z undoes the last one
  const [showHelp, setShowHelp] = useState(false)
  const [liveMessage, setLiveMessage] = useState('')
  const [horizontal, setHorizontal] = useState(() => localStorage.getItem('view') === 'horizontal')
  const [query, setQuery] = useState('')
  const [hideDone, setHideDone] = useState(() => localStorage.getItem('hideDone') === '1')
  const [lastEdit, setLastEdit] = useState(null) // { undo } — one slot, Z restores the last title/note edit
  const [sprintOrder, setSprintOrder] = useState(() => readJSON('sprintOrder', []))
  const [taskOrder, setTaskOrder] = useState(() => readJSON('taskOrder', {})) // { sprintKey: [taskId] } manual order within a sprint
  const dragSprint = useRef(null)
  const barRef = useRef(null)
  const cardRefs = useRef(new Map())
  const errorTimer = useRef(null)

  function showError(message, retry = null)  {
    setError({ message, retry })
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

  useEffect(() => {
    localStorage.setItem('taskOrder', JSON.stringify(taskOrder))
  }, [taskOrder])

  useEffect(() => {
    localStorage.setItem('hideDone', hideDone ? '1' : '0')
  }, [hideDone])

  // Pinned sprints first (in user order), the rest in natural order (numeric-aware, so #2 < #10 and #alpha works); "no sprint" is always last.
  function sprintCompare(a, b) {
    if (!a || !b) return (a ? 0 : 1) - (b ? 0 : 1)
    const ka = String(a)
    const kb = String(b)
    const ia = sprintOrder.indexOf(ka)
    const ib = sprintOrder.indexOf(kb)
    if (ia !== -1 || ib !== -1) {
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    }
    return ka.localeCompare(kb, undefined, { numeric: true })
  }

  // Manual position within a sprint; tasks never moved keep their natural (created_at) order — stable sort + equal ranks.
  function taskRank(t) {
    const i = (taskOrder[String(t.sprint ?? '')] ?? []).indexOf(t.id)
    return i === -1 ? Infinity : i
  }

  const orderedTasks = useMemo(
    () =>
      tasks
        ? [...tasks].sort((a, b) => {
            const bySprint = sprintCompare(a.sprint, b.sprint)
            if (bySprint) return bySprint
            const ra = taskRank(a)
            const rb = taskRank(b)
            return ra === rb ? 0 : ra - rb
          })
        : tasks,
    [tasks, sprintOrder, taskOrder]
  ) // eslint-disable-line react-hooks/exhaustive-deps

  const visibleTasks = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (orderedTasks ?? []).filter(
      (t) =>
        (!hideDone || !t.is_completed) &&
        (!q ||
          [t.title, t.category, t.assignee, t.sprint && `#${t.sprint}`, ...t.notes.map((n) => n.content)].some(
            (v) => v && String(v).toLowerCase().includes(q)
          ))
    )
  }, [orderedTasks, query, hideDone])

  // Sprint groups drive both views: [label, tasks][] in display order.
  const groups = useMemo(
    () =>
      Object.entries(
        visibleTasks.reduce((acc, t) => {
          const key = t.sprint ? `#${t.sprint}` : 'Senza sprint'
          ;(acc[key] ??= []).push(t)
          return acc
        }, {})
      ),
    [visibleTasks]
  )

  // All sprint numbers present, in current display order — the draggable pill row.
  const sprintKeys = useMemo(() => {
    const set = new Set()
    ;(tasks ?? []).forEach((t) => t.sprint && set.add(String(t.sprint)))
    return [...set].sort(sprintCompare)
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

  function loadTasks() {
    api('/api/tasks')
      .then(setTasks)
      .catch(() => {
        setTasks((prev) => prev ?? [])
        showError('Impossibile caricare i task — il server risponde?', loadTasks)
      })
  }

  useEffect(loadTasks, [])

  // ponytail: sync between clients = refetch on window focus; move to SSE/polling if live sync matters.
  useEffect(() => {
    if (pendingDeletes.length) return // a refetch would resurrect the optimistically-deleted tasks
    const onFocus = () => loadTasks()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [pendingDeletes]) // eslint-disable-line react-hooks/exhaustive-deps

  // Dead sprints leave localStorage when the tasks confirm they are gone.
  useEffect(() => {
    if (!tasks) return
    const keys = new Set(tasks.map((t) => String(t.sprint ?? '')))
    setSprintOrder((o) => (o.every((k) => keys.has(k)) ? o : o.filter((k) => keys.has(k))))
    setTaskOrder((o) => {
      const dead = Object.keys(o).filter((k) => !keys.has(k))
      if (!dead.length) return o
      const next = { ...o }
      dead.forEach((k) => delete next[k])
      return next
    })
  }, [tasks])

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
        showError('Non salvato', () => updateTask(task, fields, undoFields))
      })
  }

  function toggleTask(task) {
    const done = task.is_completed ? 0 : 1
    updateTask(task, { is_completed: done }, { is_completed: task.is_completed })
    announce(done ? `Fatto: ${task.title}` : `Da fare: ${task.title}`)
  }

  // The editor is prefilled with "[cat] titolo @assignee #sprint": what comes back is the whole truth,
  // so a tag deleted from the input clears that field.
  function changeTitle(task, raw) {
    const parsed = parseSmartInput(raw)
    if (!parsed.title) return
    const fields = { title: parsed.title, category: parsed.category, assignee: parsed.assignee, sprint: parsed.sprint }
    const undoFields = { title: task.title, category: task.category, assignee: task.assignee, sprint: task.sprint }
    updateTask(task, fields, undoFields)
    setLastEdit({ undo: () => updateTask(task, undoFields, fields) })
  }

  function setProgress(task, pct) {
    updateTask(task, { progress_percent: pct }, { progress_percent: task.progress_percent })
    announce(`Avanzamento ${pct}%: ${task.title}`)
  }

  function moveTaskBy(task, dir) {
    const key = String(task.sprint ?? '')
    const ids = orderedTasks.filter((t) => String(t.sprint ?? '') === key).map((t) => t.id)
    const i = ids.indexOf(task.id)
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    ids.splice(i, 1)
    ids.splice(j, 0, task.id)
    setTaskOrder((o) => ({ ...o, [key]: ids }))
    announce(`Spostato ${dir > 0 ? 'giù' : 'su'}: ${task.title}`)
  }

  function completeAll(groupTasks) {
    groupTasks.filter((t) => !t.is_completed).forEach(toggleTask)
  }

  function deleteGroup(label, groupTasks) {
    if (!window.confirm(`Eliminare ${groupTasks.length} task (${label})? Non annullabile.`)) return
    const ids = new Set(groupTasks.map((t) => t.id))
    setTasks((prev) => prev.filter((t) => !ids.has(t.id)))
    Promise.all(groupTasks.map((t) => api(`/api/tasks/${t.id}`, 'DELETE'))).catch(() => {
      loadTasks()
      showError('Eliminazione non completata', () => deleteGroup(label, groupTasks))
    })
    announce(`Eliminati ${groupTasks.length} task (${label})`)
  }

  // Notes speak the same smart syntax: "[FE] testo @luca".
  function addNote(task, raw) {
    const parsed = parseSmartInput(raw)
    if (!parsed.title) return
    api(`/api/tasks/${task.id}/notes`, 'POST', { content: parsed.title, category: parsed.category, assignee: parsed.assignee })
      .then((updated) => {
        patchLocal(task.id, updated)
        announce('Nota aggiunta')
      })
      .catch(() => showError('Nota non salvata', () => addNote(task, raw)))
  }

  // Turn a note into a task that inherits the parent's meta, then remove the note.
  async function promoteNote(task, note) {
    try {
      const created = await api('/api/tasks', 'POST', {
        title: note.content,
        category: note.category ?? task.category,
        assignee: note.assignee ?? task.assignee,
        sprint: task.sprint,
      })
      const updated = await api(`/api/tasks/${task.id}/notes/${note.id}`, 'DELETE')
      patchLocal(task.id, updated)
      upsert(created, true)
      announce(`Nota promossa a task: ${note.content}`)
    } catch {
      showError('Promozione non riuscita — riprova')
    }
  }

  // Optimistic like updateTask: patch the note locally, PUT in background, roll back on failure.
  function updateNote(task, noteId, fields) {
    if ('content' in fields) {
      const old = task.notes.find((n) => n.id === noteId)
      setLastEdit({
        undo: () =>
          api(`/api/tasks/${task.id}/notes/${noteId}`, 'PUT', { content: old?.content, category: old?.category ?? null, assignee: old?.assignee ?? null })
            .then((updated) => patchLocal(task.id, updated))
            .catch(() => showError('Non salvato — riprova')),
      })
    }
    const prevNotes = task.notes
    patchLocal(task.id, { notes: prevNotes.map((n) => (n.id === noteId ? { ...n, ...fields } : n)) })
    api(`/api/tasks/${task.id}/notes/${noteId}`, 'PUT', fields)
      .then((updated) => patchLocal(task.id, updated))
      .catch(() => {
        patchLocal(task.id, { notes: prevNotes })
        showError('Nota non salvata', () => updateNote(task, noteId, fields))
      })
  }

  // Optimistic like updateTask: remove locally, DELETE in background, roll back on failure.
  function deleteNote(task, noteId) {
    const prevNotes = task.notes
    patchLocal(task.id, { notes: prevNotes.filter((n) => n.id !== noteId) })
    api(`/api/tasks/${task.id}/notes/${noteId}`, 'DELETE')
      .then((updated) => {
        patchLocal(task.id, updated)
        announce('Nota eliminata')
      })
      .catch(() => {
        patchLocal(task.id, { notes: prevNotes })
        showError('Nota non eliminata', () => deleteNote(task, noteId))
      })
  }

  function commitPendingDelete(pd) {
    api(`/api/tasks/${pd.task.id}`, 'DELETE').catch(() => {
      setTasks((prev) => {
        const next = [...prev]
        next.splice(Math.min(pd.index, next.length), 0, pd.task)
        return next
      })
      showError(`"${pd.task.title}" non eliminato`, () => {
        setTasks((prev) => prev.filter((t) => t.id !== pd.task.id))
        commitPendingDelete(pd)
      })
    })
  }

  function deleteTask(id) {
    const index = tasks.findIndex((t) => t.id === id)
    if (index < 0) return
    const task = tasks[index]
    setTasks((prev) => prev.filter((t) => t.id !== id))
    const next = tasks[index + 1] ?? tasks[index - 1]
    setSelectedId(next?.id ?? null)
    // Each delete gets its own undo window; Z restores the most recent first.
    const pd = { task, index }
    pd.timer = setTimeout(() => {
      commitPendingDelete(pd)
      setPendingDeletes((p) => p.filter((x) => x !== pd))
    }, UNDO_MS)
    setPendingDeletes((p) => [...p, pd])
    announce(`Eliminato: ${task.title}. Premi Z per annullare.`)
  }

  // Closing the tab during the undo window must still commit the deletes, or the tasks reappear on reload.
  useEffect(() => {
    if (!pendingDeletes.length) return
    const commit = () => pendingDeletes.forEach((pd) => fetch(`/api/tasks/${pd.task.id}`, { method: 'DELETE', keepalive: true }))
    window.addEventListener('pagehide', commit)
    return () => window.removeEventListener('pagehide', commit)
  }, [pendingDeletes])

  function undoDelete() {
    const pd = pendingDeletes[pendingDeletes.length - 1]
    if (!pd) return
    clearTimeout(pd.timer)
    setPendingDeletes((p) => p.filter((x) => x !== pd))
    setTasks((prev) => {
      const next = [...prev]
      next.splice(Math.min(pd.index, next.length), 0, pd.task)
      return next
    })
    setSelectedId(pd.task.id)
    setTimeout(() => cardRefs.current.get(pd.task.id)?.focus(), 0) // after the card re-renders
    announce(`Ripristinato: ${pd.task.title}`)
  }

  function renderCard(t) {
    return (
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
        onAddNote={addNote}
        onPromoteNote={promoteNote}
        onProgress={setProgress}
      />
    )
  }

  function renderGroupActions(label, groupTasks) {
    return (
      <span className="sprint-actions">
        <button type="button" aria-label={`Completa tutti i task ${label}`} onClick={() => completeAll(groupTasks)}>
          ✓ tutti
        </button>
        <button type="button" aria-label={`Elimina tutti i task ${label}`} onClick={() => deleteGroup(label, groupTasks)}>
          ✕ sprint
        </button>
      </span>
    )
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
      if (e.key === '?') {
        e.preventDefault()
        setShowHelp((s) => !s)
        return
      }
      if (e.key === 'Escape' && showHelp) {
        setShowHelp(false)
        return
      }
      if (e.key === 'v') {
        setHorizontal((h) => !h)
        return
      }
      if (e.key === 'n') {
        const panel = document.querySelector('.daily-notes')
        if (panel) {
          panel.open = !panel.open
          if (panel.open) panel.querySelector('textarea')?.focus()
        }
        return
      }
      if (e.key === 'z' || e.key === 'Z') {
        if (pendingDeletes.length) {
          e.preventDefault()
          undoDelete()
        } else if (lastEdit) {
          e.preventDefault()
          lastEdit.undo()
          setLastEdit(null)
          announce('Modifica annullata')
        }
        return
      }
      if (!visibleTasks.length) return
      const idx = visibleTasks.findIndex((t) => t.id === selectedId)
      const selected = idx >= 0 ? visibleTasks[idx] : null
      if (selected && e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault()
        moveTaskBy(selected, e.key === 'ArrowDown' ? 1 : -1)
      } else if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        selectAndFocus(visibleTasks[Math.min(idx + 1, visibleTasks.length - 1)].id)
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        selectAndFocus(visibleTasks[Math.max(idx - 1, 0)].id)
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
  }, [visibleTasks, selectedId, pendingDeletes, lastEdit, showHelp]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="app">
      <div className="visually-hidden" role="status" aria-live="polite">
        {liveMessage}
      </div>
      {error && (
        <div className="error-banner" role="alert">
          ⚠ {error.message}
          {error.retry && (
            <button
              className="error-retry"
              onClick={() => {
                setError(null)
                error.retry()
              }}
            >
              Riprova
            </button>
          )}
          <button className="error-dismiss" aria-label="Chiudi avviso" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}
      <h1>DailyBoard</h1>
      <SmartBar tasks={tasks ?? []} onTaskSaved={upsert} onError={() => showError('Non salvato — riprova')} inputRef={barRef} />
      <DailyNotes onError={() => showError('Appunti non salvati — riprova')} />

      <div className="toolbar">
        <div className="view-toggle" role="group" aria-label="Orientamento vista">
          <button type="button" aria-pressed={!horizontal} onClick={() => setHorizontal(false)}>
            Verticale
          </button>
          <button type="button" aria-pressed={horizontal} onClick={() => setHorizontal(true)}>
            Orizzontale
          </button>
        </div>
        <div className="view-toggle">
          <button type="button" aria-pressed={hideDone} onClick={() => setHideDone((v) => !v)}>
            Nascondi fatti
          </button>
        </div>
        <input
          type="search"
          className="search-input"
          placeholder="Cerca…"
          aria-label="Cerca nei task"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
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
      ) : visibleTasks.length === 0 ? (
        <p className="hint">Nessun risultato con i filtri attivi.</p>
      ) : horizontal ? (
        <div className="board">
          {groups.map(([label, groupTasks]) => (
            <section className="board-column" key={label} aria-label={label}>
              <div className="board-column-head">
                <span className={`board-column-header${label === 'Senza sprint' ? ' no-sprint' : ''}`}>{label}</span>
                {renderGroupActions(label, groupTasks)}
              </div>
              <div role="list" aria-label={`Task ${label}`}>
                {groupTasks.map(renderCard)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="feed">
          {groups.map(([label, groupTasks]) => (
            <section key={label} aria-label={label}>
              <div className={`sprint-divider${label === 'Senza sprint' ? ' no-sprint' : ''}`}>
                <span className="sprint-label">{label}</span>
                <span className="sprint-line" />
                {renderGroupActions(label, groupTasks)}
              </div>
              <div role="list" aria-label={`Task ${label}`}>
                {groupTasks.map(renderCard)}
              </div>
            </section>
          ))}
        </div>
      )}

      {pendingDeletes.length > 0 && (
        <div className="undo-toast">
          <span className="undo-title">
            Eliminato: {pendingDeletes[pendingDeletes.length - 1].task.title}
            {pendingDeletes.length > 1 && ` (+${pendingDeletes.length - 1})`}
          </span>
          <button onClick={undoDelete}>
            Annulla <kbd>Z</kbd>
          </button>
        </div>
      )}

      {showHelp && (
        <div className="help-overlay" onClick={() => setShowHelp(false)}>
          <div className="help-card" role="dialog" aria-label="Scorciatoie da tastiera" onClick={(e) => e.stopPropagation()}>
            <h2>Scorciatoie</h2>
            <dl>
              <dt><kbd>/</kbd></dt><dd>focus sulla smart bar</dd>
              <dt><kbd>↑↓</kbd> / <kbd>j k</kbd></dt><dd>naviga il feed</dd>
              <dt><kbd>⇧↑↓</kbd></dt><dd>sposta il task nello sprint</dd>
              <dt><kbd>Invio</kbd> / <kbd>Spazio</kbd></dt><dd>fatto / da fare</dd>
              <dt><kbd>⌫</kbd> / <kbd>x</kbd></dt><dd>elimina il task</dd>
              <dt><kbd>e</kbd></dt><dd>modifica titolo e tag</dd>
              <dt><kbd>Z</kbd></dt><dd>annulla (delete, poi ultima modifica)</dd>
              <dt><kbd>v</kbd></dt><dd>cambia vista</dd>
              <dt><kbd>n</kbd></dt><dd>appunti del daily</dd>
              <dt><kbd>&gt;</kbd></dt><dd>nella barra: nota su task esistente</dd>
              <dt><kbd>?</kbd></dt><dd>questo pannello</dd>
            </dl>
          </div>
        </div>
      )}

      <p className="hint kbd-hints">
        <kbd>?</kbd> scorciatoie · <kbd>/</kbd> barra · <kbd>↑↓</kbd> naviga · <kbd>Invio</kbd> fatto · <kbd>e</kbd> modifica · <kbd>Z</kbd> annulla
      </p>
    </div>
  )
}

export default App
