import assert from 'node:assert'
import { parseSmartInput, toSmartInput } from './parseSmartInput.js'

assert.deepStrictEqual(
  parseSmartInput('[FE] Modificare uri chiamata da redditivita a filtri @mario #sprint-1'),
  { title: 'Modificare uri chiamata da redditivita a filtri', category: 'FE', assignee: 'mario', sprint: 'sprint-1' },
)

assert.deepStrictEqual(
  parseSmartInput('Solo un titolo semplice'),
  { title: 'Solo un titolo semplice', category: null, assignee: null, sprint: null },
)

assert.deepStrictEqual(
  parseSmartInput('@luca #sprint-2 [be] Task con tag in ordine diverso'),
  { title: 'Task con tag in ordine diverso', category: 'BE', assignee: 'luca', sprint: 'sprint-2' },
)

assert.deepStrictEqual(
  parseSmartInput('Fix endpoint @Mario'),
  { title: 'Fix endpoint', category: null, assignee: 'mario', sprint: null },
)

assert.deepStrictEqual(
  parseSmartInput('[FE] fix [BE] api'),
  { title: 'fix api', category: 'FE', assignee: null, sprint: null },
)

assert.deepStrictEqual(
  parseSmartInput('Scrivere a mario@example.com per il rilascio'),
  { title: 'Scrivere a mario@example.com per il rilascio', category: null, assignee: null, sprint: null },
)

// toSmartInput ↔ parseSmartInput roundtrip
const task = { title: 'Fix api', category: 'BE', assignee: 'luca', sprint: '3' }
assert.strictEqual(toSmartInput(task), '[BE] Fix api @luca #3')
assert.deepStrictEqual(parseSmartInput(toSmartInput(task)), task)
assert.strictEqual(toSmartInput({ title: 'Solo titolo', category: null, assignee: null, sprint: null }), 'Solo titolo')

console.log('parseSmartInput: all tests passed')
