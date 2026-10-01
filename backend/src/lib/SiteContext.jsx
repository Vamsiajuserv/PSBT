import React, { createContext, useContext, useEffect, useState } from 'react'
import { PublicAPI } from '../api/client.js'

// ─────────────────────────────────────────────────────────────────────────────
// Public-site content, served dynamically from the backend (/api/public/site).
// One fetch on mount; every public page + shared component (temple header,
// receipt, staff-login branding) reads from here instead of any static file.
// ─────────────────────────────────────────────────────────────────────────────

const SiteCtx = createContext({ site: null, loading: true, error: '' })

export function SiteProvider({ children }) {
  const [site, setSite] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    PublicAPI.site()
      .then((d) => { if (alive) { setSite(d); setError('') } })
      .catch((e) => { if (alive) setError(e?.detail || 'Could not load temple information.') })
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
