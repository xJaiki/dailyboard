import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTasks, insertTask, updateTask, deleteTask, archiveCompleted, insertTaskNote, updateTaskNote, deleteTaskNote, getNote, upsertNote, getNoteDates, exportAll, getCompletedOn } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.join(__dirname, '..', 'dist')

const app = express()
app.use(cors())
app.use(express.json())

const TASK_FIELDS = ['title', 'category', 'assignee', 'sprint', 'is_completed', 'progress_percent']
const NOTE_FIELDS = ['content', 'is_completed', 'category', 'assignee']

const MAX_LEN = { title: 300, category: 40, assignee: 60, sprint: 40, content: 2000 }
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Returns an error string or null. Covers types and lengths for every writable field.
function invalidFields(fields) {
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'is_completed') {
      if (![0, 1, true, false].includes(value)) return 'is_completed must be 0 or 1'
    } else if (key === 'progress_percent') {
      if (!Number.isInteger(value) || value < 0 || value > 100) return 'progress_percent must be an integer 0–100'
    } else if (value != null) {
      if (typeof value !== 'string') return `${key} must be a string`
      if (value.length > MAX_LEN[key]) return `${key} too long (max ${MAX_LEN[key]} chars)`
    }
  }
  return null
}

function validDate(req, res, next) {
  if (!DATE_RE.test(req.params.date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' })
  next()
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.get('/api/tasks', (req, res) => {
  res.json(getTasks(req.query.archived === '1'))
})

app.post('/api/tasks', (req, res) => {
  const { title, category, assignee, sprint } = req.body
  if (!title || typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'title is required' })
  const err = invalidFields({ title, category, assignee, sprint })
  if (err) return res.status(400).json({ error: err })
  res.status(201).json(insertTask({ title, category, assignee, sprint }))
})

// Archive instead of delete: completed tasks leave the feed but stay queryable via GET /api/tasks?archived=1.
app.post('/api/tasks/archive-done', (req, res) => {
  res.json({ archived: archiveCompleted() })
})

app.put('/api/tasks/:id', (req, res) => {
  const fields = Object.fromEntries(
    Object.entries(req.body).filter(([key]) => TASK_FIELDS.includes(key)),
  )
  if ('title' in fields && (typeof fields.title !== 'string' || !fields.title.trim())) {
    return res.status(400).json({ error: 'title cannot be empty' })
  }
  const err = invalidFields(fields)
  if (err) return res.status(400).json({ error: err })
  const updated = updateTask(req.params.id, fields)
  if (!updated) return res.status(404).json({ error: 'task not found' })
  res.json(updated)
})

app.delete('/api/tasks/:id', (req, res) => {
  if (!deleteTask(req.params.id)) return res.status(404).json({ error: 'task not found' })
  res.status(204).end()
})

app.post('/api/tasks/:id/notes', (req, res) => {
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : ''
  if (!content) return res.status(400).json({ error: 'content is required' })
  const { category, assignee } = req.body
  const err = invalidFields({ content, category, assignee })
  if (err) return res.status(400).json({ error: err })
  const task = insertTaskNote(req.params.id, { content, category, assignee })
  if (!task) return res.status(404).json({ error: 'task not found' })
  res.status(201).json(task)
})

app.put('/api/tasks/:id/notes/:noteId', (req, res) => {
  const fields = Object.fromEntries(
    Object.entries(req.body).filter(([key]) => NOTE_FIELDS.includes(key)),
  )
  const err = invalidFields(fields)
  if (err) return res.status(400).json({ error: err })
  const task = updateTaskNote(req.params.id, req.params.noteId, fields)
  if (!task) return res.status(404).json({ error: 'note not found' })
  res.json(task)
})

app.delete('/api/tasks/:id/notes/:noteId', (req, res) => {
  const task = deleteTaskNote(req.params.id, req.params.noteId)
  if (!task) return res.status(404).json({ error: 'note not found' })
  res.json(task)
})

app.get('/api/notes', (req, res) => {
  res.json(getNoteDates())
})

app.get('/api/notes/:date', validDate, (req, res) => {
  res.json(getNote(req.params.date) ?? {})
})

app.put('/api/notes/:date', validDate, (req, res) => {
  const content = req.body.content ?? ''
  if (typeof content !== 'string') return res.status(400).json({ error: 'content must be a string' })
  res.json(upsertNote(req.params.date, content))
})

// Full JSON backup of everything.
app.get('/api/export', (req, res) => {
  res.json(exportAll())
})

// Markdown recap of one day: daily note + tasks completed that day. Handy at the end of the daily.
app.get('/api/export/:date', validDate, (req, res) => {
  const date = req.params.date
  const note = getNote(date)
  const done = getCompletedOn(date)
  const lines = [`# DailyBoard — ${date}`, '']
  if (note?.content) lines.push('## Appunti', '', note.content, '')
  lines.push('## Completati', '')
  lines.push(...(done.length ? done.map((t) => `- [x] ${t.title}${t.assignee ? ` (@${t.assignee})` : ''}${t.sprint ? ` #${t.sprint}` : ''}`) : ['_nessuno_']))
  res.type('text/markdown').send(lines.join('\n') + '\n')
})

// Serves the built client (npm run build → dist/) when present, so one process is client + API.
app.use(express.static(distPath))
app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(distPath, 'index.html')))

// eslint-disable-next-line no-unused-vars -- Express needs the 4-arg signature to treat this as an error handler.
app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'internal server error' })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`DailyBoard server listening on http://localhost:${PORT}`)
})
