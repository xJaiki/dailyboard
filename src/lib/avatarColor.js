const AVATAR_PALETTE = ['#f97316', '#22d3ee', '#a3e635', '#f472b6', '#818cf8', '#facc15', '#34d399']

export function colorForAssignee(name) {
  if (!name) return '#cbd5e1'
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}
