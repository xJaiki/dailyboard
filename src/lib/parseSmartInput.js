export function parseSmartInput(input) {
  let category = null
  let assignee = null
  let sprint = null

  const title = input
    .replace(/\[(\w+)\]/, (_, val) => {
      category = val.toUpperCase()
      return ' '
    })
    .replace(/@(\S+)/, (_, val) => {
      assignee = val.toLowerCase()
      return ' '
    })
    .replace(/#(\S+)/, (_, val) => {
      sprint = val
      return ' '
    })
    .replace(/\s+/g, ' ')
    .trim()

  return { title, category, assignee, sprint }
}
