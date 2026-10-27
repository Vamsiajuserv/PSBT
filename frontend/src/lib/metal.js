import { useEffect, useState } from 'react'
import { MetalRatesAPI } from '../api/client.js'

// Gold / silver valuation shared by the counter, hundi and store screens. The server works
// the value out the same way (backend/app/routers/metal_rates.py) and is the source of truth:
//   estimated value = grams × the day's rate (24K / 999) × purity factor (22K = 0.916 …)

export const metalOf = (name) => {
  const n = String(name || '').toLowerCase()
  return n.includes('gold') ? 'Gold' : n.includes('silver') ? 'Silver' : null
}
export const isGrams = (unit) => String(unit || '').toLowerCase().includes('gram')
export const factorOf = (purities, metal, label) => (purities?.[metal] || []).find((p) => p.label === label)?.factor ?? null
export const estValue = (grams, rate, factor) => {
  const g = Number(grams), r = Number(rate), f = Number(factor)
  return g > 0 && r > 0 && f > 0 ? Math.round(g * r * f) : null   // whole rupees, as the server
}
export const pct = (factor) => `${(Number(factor) * 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`

/** The rates of one day (default today) and the purity table; reload() after a change. */
export function useMetalDay(day) {
  const [data, setData] = useState(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    MetalRatesAPI.day(day).then((d) => alive && setData(d)).catch(() => alive && setData({ rates: {}, purities: {} }))
    return () => { alive = false }
  }, [day, tick])
  return { ...(data || {}), loaded: !!data, reload: () => setTick((t) => t + 1) }
}
