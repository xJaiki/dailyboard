import { useEffect, useState } from 'react'
import { colorForCategory } from './lib/categoryColors.js'
import { colorForAssignee } from './lib/avatarColor.js'
import { parseSmartInput, toSmartInput } from './lib/parseSmartInput.js'

function noteSmartText(n) {
  return toSmartInput({ title: n.content, category: n.category, assignee: n.assignee })
}

export default function TaskCard({ task, selected, editing, cardRef, onStartEdit, onEndEdit, onToggle, onDelete, onTitleChange, onSelect, onDeleteNote, onUpdateNote, onAddNote, onPromoteNote, onProgress }) {
  const [draft, setDraft] = useState(task.title)
  const [editingNoteId, setEditingNoteId] = useState(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [newNote, setNewNote] = useState('')

  function commitNewNote() {
    const trimmed = newNote.trim()
    if (trimmed) onAddNote(task, trimmed)
    setNewNote('')
    setAddingNote(false)
  }

  function commitNote(note) {
    const trimmed = noteDraft.trim()
    const parsed = parseSmartInput(trimmed)
    if (parsed.title && trimmed !== noteSmartText(note)) {
      onUpdateNote(task, note.id, { content: parsed.title, category: parsed.category, assignee: parsed.assignee })
    }
    setEditingNoteId(null)
  }

  // Edit shows the full smart syntax so tags are visible, editable, and removable.
  useEffect(() => {
    if (editing) setDraft(toSmartInput(task))
  }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

  function commit() {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== toSmartInput(task)) onTitleChange(task, trimmed)
    onEndEdit()
  }

  return (
    <div
      ref={cardRef}
      role="listitem"
      tabIndex={selected ? 0 : -1}
      className={`task-card${task.is_completed ? ' done' : ''}${selected ? ' selected' : ''}`}
      onClick={() => onSelect(task.id)}
      onFocus={() => onSelect(task.id)}
    >
      <div className="task-row">
        <button
          className="check"
          aria-label={task.is_completed ? `Segna da fare: ${task.title}` : `Segna fatto: ${task.title}`}
          aria-pressed={Boolean(task.is_completed)}
          onClick={(e) => {
            e.stopPropagation()
            onToggle(task)
          }}
        >
          {task.is_completed ? '✓' : ''}
        </button>
        <div className="task-main">
          {editing ? (
            <input
              className="title-input"
              aria-label="Modifica titolo e tag ([categoria] @assignee #sprint)"
              autoFocus
              value={draft}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit()
                if (e.key === 'Escape') {
                  setDraft(task.title)
                  onEndEdit()
                }
              }}
              onBlur={commit}
            />
          ) : (
            <span className="title" onDoubleClick={() => onStartEdit(task.id)}>
              {task.title}
            </span>
          )}
          {!task.is_completed && (
            <div className="progress" role="group" aria-label={`Avanzamento: ${task.progress_percent ?? 0}%`}>
              {[25, 50, 75, 100].map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`progress-zone${(task.progress_percent ?? 0) >= p ? ' filled' : ''}`}
                  aria-label={`Avanzamento ${p}%`}
                  aria-pressed={(task.progress_percent ?? 0) >= p}
                  onClick={(e) => {
                    e.stopPropagation()
                    onProgress(task, task.progress_percent === p ? p - 25 : p)
                  }}
                />
              ))}
            </div>
          )}
          {(task.category || task.assignee) && (
            <div className="task-meta">
              {task.category && (
                <span className="badge" style={{ background: colorForCategory(task.category) }}>
                  {task.category}
                </span>
              )}
              {task.assignee && (
                <span className="assignee">
                  <span className="avatar" style={{ background: colorForAssignee(task.assignee) }}>
                    {task.assignee[0].toUpperCase()}
                  </span>
                  {task.assignee}
                </span>
              )}
            </div>
          )}
        </div>
        <button
          className="delete"
          aria-label={`Elimina: ${task.title}`}
          onClick={(e) => {
            e.stopPropagation()
            onDelete(task.id)
          }}
        >
          ✕
        </button>
      </div>
      {task.notes.length > 0 && (
        <ul className="task-notes">
          {task.notes.map((n) => (
            <li key={n.id} className={n.is_completed ? 'note-done' : ''}>
              <button
                className="note-check"
                aria-label={n.is_completed ? `Segna da fare: ${n.content}` : `Segna fatto: ${n.content}`}
                aria-pressed={Boolean(n.is_completed)}
                onClick={(e) => {
                  e.stopPropagation()
                  onUpdateNote(task, n.id, { is_completed: n.is_completed ? 0 : 1 })
                }}
              >
                {n.is_completed ? '✓' : ''}
              </button>
              {editingNoteId === n.id ? (
                <input
                  className="note-input"
                  aria-label="Modifica nota"
                  autoFocus
                  value={noteDraft}
                  onClick={(e) => e.stopPropagation()}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitNote(n)
                    if (e.key === 'Escape') setEditingNoteId(null)
                  }}
                  onBlur={() => commitNote(n)}
                />
              ) : (
                <span
                  className="note-content"
                  onDoubleClick={() => {
                    setNoteDraft(noteSmartText(n))
                    setEditingNoteId(n.id)
                  }}
                >
                  {n.content}
                  {n.category && (
                    <span className="badge note-badge" style={{ background: colorForCategory(n.category) }}>
                      {n.category}
                    </span>
                  )}
                  {n.assignee && (
                    <span className="avatar note-avatar" title={n.assignee} style={{ background: colorForAssignee(n.assignee) }}>
                      {n.assignee[0].toUpperCase()}
                    </span>
                  )}
                </span>
              )}
              <button
                className="note-promote"
                aria-label={`Promuovi nota a task: ${n.content}`}
                title="Promuovi a task"
                onClick={(e) => {
                  e.stopPropagation()
                  onPromoteNote(task, n)
                }}
              >
                ↥
              </button>
              <button
                className="note-delete"
                aria-label={`Elimina nota: ${n.content}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteNote(task, n.id)
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="add-note-row">
        {addingNote ? (
          <input
            className="note-input"
            aria-label="Nuova nota"
            placeholder="Nuova nota… (Invio salva, Esc annulla)"
            autoFocus
            value={newNote}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitNewNote()
              if (e.key === 'Escape') {
                setNewNote('')
                setAddingNote(false)
              }
            }}
            onBlur={commitNewNote}
          />
        ) : (
          <button
            type="button"
            className="add-note"
            aria-label={`Aggiungi nota a: ${task.title}`}
            onClick={(e) => {
              e.stopPropagation()
              setAddingNote(true)
            }}
          >
            + nota
          </button>
        )}
      </div>
    </div>
  )
}
