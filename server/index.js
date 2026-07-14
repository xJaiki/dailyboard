import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTasks, insertTask, updateTask, deleteTask, insertTaskNote, updateTaskNote, deleteTaskNote, getNote, upsertNote } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.join(__dirname, '..', 'dist')

const app = express()
app.use(cors())
app.use(express.json())

const TASK_FIELDS = ['title', 'category', 'assignee', 'sprint', 'is_completed']
const NOTE_FIELDS = ['content', 'is_completed']

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.get('/api/tasks', (req, res) => {
  res.json(getTasks())
})

app.post('/api/tasks', (req, res) => {
  const { title, category, assignee, sprint } = req.body
  if (!title) return res.status(400).json({ error: 'title is required' })
  res.status(201).json(insertTask({ title, category, assignee, sprint }))
})

app.put('/api/tasks/:id', (req, res) => {
  const fields = Object.fromEntries(
    Object.entries(req.body).filter(([key]) => TASK_FIELDS.includes(key)),
  )
  const updated = updateTask(req.params.id, fields)
  if (!updated) return res.status(404).json({ error: 'task not found' })
  res.json(updated)
})

app.delete('/api/tasks/:id', (req, res) => {
  if (!deleteTask(req.params.id)) return res.status(404).json({ error: 'task not found' })
  res.status(204).end()
})

app.post('/api/tasks/:id/notes', (req, res) => {
  const content = req.body.content?.trim()
  if (!content) return res.status(400).json({ error: 'content is required' })
  const task = insertTaskNote(req.params.id, content)
  if (!task) return res.status(404).json({ error: 'task not found' })
  res.status(201).json(task)
})

app.put('/api/tasks/:id/notes/:noteId', (req, res) => {
  const fields = Object.fromEntries(
    Object.entries(req.body).filter(([key]) => NOTE_FIELDS.includes(key)),
  )
  const task = updateTaskNote(req.params.id, req.params.noteId, fields)
  if (!task) return res.status(404).json({ error: 'note not found' })
  res.json(task)
})

app.delete('/api/tasks/:id/notes/:noteId', (req, res) => {
  const task = deleteTaskNote(req.params.id, req.params.noteId)
  if (!task) return res.status(404).json({ error: 'note not found' })
  res.json(task)
})

app.get('/api/notes/:date', (req, res) => {
  res.json(getNote(req.params.date) ?? {})
})

app.put('/api/notes/:date', (req, res) => {
  res.json(upsertNote(req.params.date, req.body.content ?? ''))
})

// Serves the built client (npm run build → dist/) when present, so one process is client + API.
app.use(express.static(distPath))
app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(distPath, 'index.html')))

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`DailyBoard server listening on http://localhost:${PORT}`)
})
