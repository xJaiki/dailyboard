// Inverse of parseSmartInput: renders title + tags back to the editable smart syntax.
export function toSmartInput({ title, category, assignee, sprint }) {
  return [category && `[${category}]`, title, assignee && `@${assignee}`, sprint && `#${sprint}`].filter(Boolean).join(' ')
}

export function parseSmartInput(input) {
  let category = null
  let assignee = null
  let sprint = null

  // @/# count only at the start of a word, so an email in the title is left alone.
  // With multiple tags of the same kind, the first wins and all are stripped from the title.
  const title = input
    .replace(/\[(\w+)\]/g, (_, val) => {
      category ??= val.toUpperCase()
      return ' '
    })
    .replace(/(^|\s)@(\S+)/g, (_, pre, val) => {
      assignee ??= val.toLowerCase()
      return pre
    })
    .replace(/(^|\s)#(\S+)/g, (_, pre, val) => {
      sprint ??= val
      return pre
    })
    .replace(/\s+/g, ' ')
    .trim()

  return { title, category, assignee, sprint }
}
