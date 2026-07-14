import { useEffect, useState } from 'react'
import { colorForCategory } from './lib/categoryColors.js'
import { colorForAssignee } from './lib/avatarColor.js'

export default function TaskCard({ task, selected, editing, cardRef, onStartEdit, onEndEdit, onToggle, onDelete, onTitleChange, onSelect, onDeleteNote, onUpdateNote }) {
  const [draft, setDraft] = useState(task.title)
  const [editingNoteId, setEditingNoteId] = useState(null)
  const [noteDraft, setNoteDraft] = useState('')

  function commitNote(note) {
    const trimmed = noteDraft.trim()
    if (trimmed && trimmed !== note.content) onUpdateNote(task, note.id, { content: trimmed })
    setEditingNoteId(null)
  }

  useEffect(() => {
    if (editing) setDraft(task.title)
  }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

  function commit() {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== task.title) onTitleChange(task, trimmed)
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
              aria-label="Modifica titolo"
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
                    setNoteDraft(n.content)
                    setEditingNoteId(n.id)
                  }}
                >
                  {n.content}
                </span>
              )}
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
    </div>
  )
}
