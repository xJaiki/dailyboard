import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dbPath = process.env.DB_PATH || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dailyboard.db')
export const db = new Database(dbPath)
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT DEFAULT 'VARIE',
    assignee TEXT,
    sprint TEXT,
    progress_percent INTEGER DEFAULT 0,
    is_completed BOOLEAN DEFAULT 0,
    archived BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME,
    completed_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS daily_notes (
    date TEXT PRIMARY KEY,
    content TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS task_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    category TEXT,
    assignee TEXT,
    is_completed BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`)

// Additive migrations for DBs created before these columns existed.
function addColumn(table, column, ddl) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`)
  }
}
addColumn('task_notes', 'is_completed', 'BOOLEAN DEFAULT 0')
addColumn('tasks', 'archived', 'BOOLEAN DEFAULT 0')
addColumn('tasks', 'updated_at', 'DATETIME')
addColumn('tasks', 'completed_at', 'DATETIME')

// Old DBs have task_notes without the FK: SQLite can't ALTER-add one, so rebuild the table (dropping any orphans).
if (db.prepare('PRAGMA foreign_key_list(task_notes)').all().length === 0) {
  db.transaction(() => {
    db.exec(`
      DELETE FROM task_notes WHERE task_id NOT IN (SELECT id FROM tasks);
      CREATE TABLE task_notes_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        is_completed BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO task_notes_new SELECT id, task_id, content, is_completed, created_at FROM task_notes;
      DROP TABLE task_notes;
      ALTER TABLE task_notes_new RENAME TO task_notes;
    `)
  })()
}

// After the FK rebuild (which copies the pre-meta schema) so the columns survive on every migration path.
addColumn('task_notes', 'category', 'TEXT')
addColumn('task_notes', 'assignee', 'TEXT')

db.exec('CREATE INDEX IF NOT EXISTS idx_task_notes_task_id ON task_notes(task_id)')

export function getTasks(archived = false) {
  const tasks = db.prepare('SELECT * FROM tasks WHERE archived = ? ORDER BY created_at DESC, id DESC').all(archived ? 1 : 0)
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
  let setClause = columns.map((c) => `${c} = ?`).join(', ') + ', updated_at = CURRENT_TIMESTAMP'
  if (columns.includes('is_completed')) {
    setClause += fields.is_completed ? ', completed_at = CURRENT_TIMESTAMP' : ', completed_at = NULL'
  }
  db.prepare(`UPDATE tasks SET ${setClause} WHERE id = ?`).run(...columns.map((c) => fields[c]), id)
  return getTask(id)
}

// Notes go with the task via ON DELETE CASCADE.
export function deleteTask(id) {
  return db.prepare('DELETE FROM tasks WHERE id = ?').run(id).changes > 0
}

export function archiveCompleted() {
  return db.prepare('UPDATE tasks SET archived = 1, updated_at = CURRENT_TIMESTAMP WHERE is_completed = 1 AND archived = 0').run().changes
}

export function insertTaskNote(taskId, { content, category, assignee }) {
  if (!db.prepare('SELECT 1 FROM tasks WHERE id = ?').get(taskId)) return undefined
  db.prepare('INSERT INTO task_notes (task_id, content, category, assignee) VALUES (?, ?, ?, ?)').run(taskId, content, category ?? null, assignee ?? null)
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

export function getNoteDates() {
  return db.prepare('SELECT date FROM daily_notes ORDER BY date DESC').all().map((r) => r.date)
}

// Full backup: every task (archived included, with notes) + every daily note.
export function exportAll() {
  const tasks = db.prepare('SELECT * FROM tasks ORDER BY id').all()
  const notes = db.prepare('SELECT * FROM task_notes ORDER BY task_id, created_at, id').all()
  const byTask = new Map()
  for (const n of notes) {
    if (!byTask.has(n.task_id)) byTask.set(n.task_id, [])
    byTask.get(n.task_id).push(n)
  }
  return {
    tasks: tasks.map((t) => ({ ...t, notes: byTask.get(t.id) ?? [] })),
    daily_notes: db.prepare('SELECT * FROM daily_notes ORDER BY date').all(),
  }
}

export function getCompletedOn(date) {
  return db.prepare("SELECT * FROM tasks WHERE date(completed_at) = ? ORDER BY completed_at").all(date)
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
