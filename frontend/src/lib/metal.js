// Gold / silver helpers shared by the counter, hundi and store screens.
// The daily Gold & Silver Rate was removed on 2026-11-15 (client decision): gold and silver are kept
// by grams and description only — no ₹ value. Purity is optional: "Not known" unless a hallmark
// can be read. The list matches the server (backend/app/routers/metal_rates.py).

export const metalOf = (name) => {
  const n = String(name || '').toLowerCase()
  return n.includes('gold') ? 'Gold' : n.includes('silver') ? 'Silver' : null
}
export const isGrams = (unit) => String(unit || '').toLowerCase().includes('gram')
export const PURITY_UNKNOWN = 'Not known'
// label + factor (the factor is kept only to show values on receipts made before 2026-11-15)
export const PURITIES = {
  Gold: [{ label: '24K', factor: 1 }, { label: '22K', factor: 0.916 }, { label: '18K', factor: 0.75 }, { label: '14K', factor: 0.585 }],
  Silver: [{ label: '999', factor: 1 }, { label: '925', factor: 0.925 }, { label: '800', factor: 0.8 }],
}
export const purityOptions = (metal) => [PURITY_UNKNOWN, ...(PURITIES[metal] || []).map((p) => p.label)]
export const factorOf = (purities, metal, label) => ((purities || PURITIES)?.[metal] || []).find((p) => p.label === label)?.factor ?? null
// Old receipts only (made with a day's rate): grams × rate × purity, whole rupees
export const estValue = (grams, rate, factor) => {
  const g = Number(grams), r = Number(rate), f = Number(factor)
  return g > 0 && r > 0 && f > 0 ? Math.round(g * r * f) : null
}
export const pct = (factor) => `${(Number(factor) * 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`
