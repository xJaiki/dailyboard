import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dbPath = process.env.DB_PATH || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dailyboard.db')
export const db = new Database(dbPath)

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT DEFAULT 'VARIE',
    assignee TEXT,
    sprint TEXT,
    progress_percent INTEGER DEFAULT 0,
    is_completed BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS daily_notes (
    date TEXT PRIMARY KEY,
    content TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS task_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    is_completed BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`)

// Migration for DBs created before task_notes had a state column.
if (!db.prepare('PRAGMA table_info(task_notes)').all().some((c) => c.name === 'is_completed')) {
  db.exec('ALTER TABLE task_notes ADD COLUMN is_completed BOOLEAN DEFAULT 0')
}

export function getTasks() {
  const tasks = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC, id DESC').all()
  const notes = db.prepare('SELECT * FROM task_notes ORDER BY created_at, id').all()
  const byTask = new Map()
  for (const n of notes) {
    if (!byTask.has(n.task_id)) byTask.set(n.task_id, [])
    byTask.get(n.task_id).push(n)
  }
  return tasks.map((t) => ({ ...t, notes: byTask.get(t.id) ?? [] }))
}

export function getTask(id) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
  if (!task) return undefined
  task.notes = db.prepare('SELECT * FROM task_notes WHERE task_id = ? ORDER BY created_at, id').all(id)
  return task
}

export function insertTask({ title, category, assignee, sprint }) {
  const { lastInsertRowid } = db
    .prepare('INSERT INTO tasks (title, category, assignee, sprint) VALUES (?, ?, ?, ?)')
    .run(title, category ?? 'VARIE', assignee ?? null, sprint ?? null)
  return getTask(lastInsertRowid)
}

export function updateTask(id, fields) {
  const columns = Object.keys(fields)
  if (columns.length === 0) return getTask(id)
  const setClause = columns.map((c) => `${c} = ?`).join(', ')
  db.prepare(`UPDATE tasks SET ${setClause} WHERE id = ?`).run(...columns.map((c) => fields[c]), id)
  return getTask(id)
}

export const deleteTask = db.transaction((id) => {
  db.prepare('DELETE FROM task_notes WHERE task_id = ?').run(id)
  return db.prepare('DELETE FROM tasks WHERE id = ?').run(id).changes > 0
})

export function insertTaskNote(taskId, content) {
  if (!db.prepare('SELECT 1 FROM tasks WHERE id = ?').get(taskId)) return undefined
  db.prepare('INSERT INTO task_notes (task_id, content) VALUES (?, ?)').run(taskId, content)
  return getTask(taskId)
}

export function updateTaskNote(taskId, noteId, fields) {
  const columns = Object.keys(fields)
  if (columns.length === 0) return getTask(taskId)
  const setClause = columns.map((c) => `${c} = ?`).join(', ')
  const changed = db
    .prepare(`UPDATE task_notes SET ${setClause} WHERE id = ? AND task_id = ?`)
    .run(...columns.map((c) => fields[c]), noteId, taskId).changes > 0
  return changed ? getTask(taskId) : undefined
}

export function deleteTaskNote(taskId, noteId) {
  const deleted = db.prepare('DELETE FROM task_notes WHERE id = ? AND task_id = ?').run(noteId, taskId).changes > 0
  return deleted ? getTask(taskId) : undefined
}

export function getNote(date) {
  return db.prepare('SELECT * FROM daily_notes WHERE date = ?').get(date)
}

export function upsertNote(date, content) {
  db.prepare(`
    INSERT INTO daily_notes (date, content, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(date) DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP
  `).run(date, content)
  return getNote(date)
}
