// Gold / silver helpers shared by the counter, hundi and store screens.
// The daily Gold & Silver Rate was removed on 2026-11-15 (client decision): gold and silver are kept
// by grams and description only. Purity was removed everywhere (client, 2026-11-20) — and with it
// the old grams × rate × purity valuation helpers.

export const metalOf = (name) => {
  const n = String(name || '').toLowerCase()
  return n.includes('gold') ? 'Gold' : n.includes('silver') ? 'Silver' : null
}
export const isGrams = (unit) => String(unit || '').toLowerCase().includes('gram')
