// Known categories keep stable colors; anything else hashes into the same
// pastel family so custom categories stay distinguishable (all pass AA vs #1c1917).
const CATEGORY_COLORS = {
  BE: '#c084fc',
  FE: '#fde047',
  DEV: '#5eead4',
}

const FALLBACK_PALETTE = ['#fda4af', '#93c5fd', '#fdba74', '#86efac', '#f0abfc']

export function colorForCategory(category) {
  if (!category) return FALLBACK_PALETTE[0]
  if (CATEGORY_COLORS[category]) return CATEGORY_COLORS[category]
  let hash = 0
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) | 0
  return FALLBACK_PALETTE[Math.abs(hash) % FALLBACK_PALETTE.length]
}
