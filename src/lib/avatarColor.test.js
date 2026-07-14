import assert from 'node:assert'
import { colorForAssignee } from './avatarColor.js'

assert.strictEqual(colorForAssignee('mario'), colorForAssignee('mario'))
assert.notStrictEqual(colorForAssignee('mario'), colorForAssignee('luca'))
assert.strictEqual(colorForAssignee(null), '#cbd5e1')

console.log('avatarColor: all tests passed')
