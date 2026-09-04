import React, { createContext, useContext, useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { AuthAPI, getToken, setToken } from '../api/client.js'

const AuthCtx = createContext(null)
const USER_KEY = 'psbt_user'

function loadUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)) } catch { return null }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadUser)
  const [ready, setReady] = useState(false)

  // On boot, if we have a token, confirm it's still valid.
  useEffect(() => {
    let alive = true
    async function boot() {
      if (getToken()) {
        try {
          const me = await AuthAPI.me()
          if (alive) applyUser(me)
        } catch {
          if (alive) signOut()
        }
      } else if (loadUser()) {
        // A cached user with no token is a stale/expired session — treat as
        // signed-out so the guard sends them to login instead of rendering the
        // admin shell tokenless (which would 401 every request).
        if (alive) signOut()
      }
      if (alive) setReady(true)
    }
    boot()
    return () => { alive = false }
  }, [])

  function applyUser(u) {
    localStorage.setItem(USER_KEY, JSON.stringify(u))
    setUser(u)
  }

  // Completes a successful login: store token + user.
  function completeLogin({ access_token, user: u }) {
    setToken(access_token)
    if (u) applyUser(u)
    return u
  }

  function signOut() {
    setToken(null)
    localStorage.removeItem(USER_KEY)
    setUser(null)
  }

  // Back-compat: session object mirrors old shape ({ type:'staff', role, name })
  const session = user ? { type: 'staff', role: user.role, name: user.name, email: user.email } : null

  return (
    <AuthCtx.Provider value={{ user, session, ready, completeLogin, logout: signOut }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)

// Route guard — redirects staff to the staff login when not authenticated.
export function RequireAuth({ children }) {
  const { user, ready } = useAuth()
  const location = useLocation()
  if (!ready) return null   // avoid a flash of the login page during boot
  if (!user) return <Navigate to="/staff-login" replace state={{ from: location.pathname }} />
  return children
}

// Convenience: does the current user have a given module (Admin = all).
export function useHasModule() {
  const { user } = useAuth()
  return (mod) => {
    if (!user) return false
    if (['Admin', 'Administrator'].includes(user.role)) return true
    return (user.modules || '').split(',').map((m) => m.trim()).includes(mod)
  }
}
