import React, { createContext, useContext, useEffect, useState } from 'react'
import { PublicAPI } from '../api/client.js'

// ─────────────────────────────────────────────────────────────────────────────
// Public-site content, served dynamically from the backend (/api/public/site).
// One fetch on mount; every public page + shared component (temple header,
// receipt, staff-login branding) reads from here instead of any static file.
//
// OPTIMIZATION: Site data is cached in localStorage for instant loading on
// return visits. Fresh data is fetched in background to keep cache updated.
// ─────────────────────────────────────────────────────────────────────────────

const SiteCtx = createContext({ site: null, loading: true, error: '' })
const CACHE_KEY = 'psbt_site_cache'
const CACHE_TTL = 1000 * 60 * 60 // 1 hour - after this, show loader while fetching

// Load cached site data from localStorage
function loadCached() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    // If cache is older than TTL, don't use it (force fresh fetch with loader)
    if (Date.now() - ts > CACHE_TTL) return null
    return data
  } catch {
    return null
  }
}

// Save site data to localStorage
function saveCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }))
  } catch { /* ignore quota errors */ }
}

export function SiteProvider({ children }) {
  const cached = loadCached()
  const [site, setSite] = useState(cached)
  const [loading, setLoading] = useState(!cached) // Only show loader if no cache
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    PublicAPI.site()
      .then((d) => {
        if (alive) {
          setSite(d)
          saveCache(d)
          setError('')
        }
      })
      .catch((e) => {
        // Only show error if we don't have cached data
        if (alive && !site) setError(e?.detail || 'Could not load temple information.')
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return <SiteCtx.Provider value={{ site, loading, error }}>{children}</SiteCtx.Provider>
}

// Full context ({ site, loading, error }).
export const useSiteContext = () => useContext(SiteCtx)

// Convenience: just the site payload (null until loaded).
export const useSite = () => useContext(SiteCtx).site

// Convenience: the temple profile object (null until loaded).
export const useTemple = () => useContext(SiteCtx).site?.temple || null
