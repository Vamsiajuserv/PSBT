// ── Lightweight API client for the PSBT-Portal backend ──────────────────────
// All calls go through the Vite dev proxy (/api → FastAPI). The JWT is stored
// in localStorage and attached to every request.

const TOKEN_KEY = 'psbt_token'

// In production the built site calls the API at its absolute Azure URL
// (VITE_API_BASE_URL, injected at build time). In local dev this is unset, so
// calls stay relative ("/api") and go through the Vite proxy → 127.0.0.1:8099.
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '')

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY))

export class ApiError extends Error {
  constructor(status, detail) {
    super(detail || `Request failed (${status})`)
    this.status = status
    this.detail = detail
  }
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth && getToken()) headers.Authorization = `Bearer ${getToken()}`

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    // Auto sign-out on auth failure: an expired/invalid session must clear BOTH
    // the token and the cached user, then bounce to the staff login — otherwise
    // the admin shell keeps rendering tokenless and every call 401s into a
    // permanent "Loading…". Guard the redirect so the login page (which 401s on
    // bad credentials) doesn't loop.
    if (res.status === 401) {
      setToken(null)
      localStorage.removeItem('psbt_user')
      if (!window.location.pathname.startsWith('/staff-login')) {
        window.location.replace('/staff-login')
      }
    }
    throw new ApiError(res.status, data?.detail || res.statusText)
  }
  return data
}

export const api = {
  get: (p) => request(p),
  post: (p, body, opts) => request(p, { method: 'POST', body, ...opts }),
  put: (p, body) => request(p, { method: 'PUT', body }),
  del: (p) => request(p, { method: 'DELETE' }),
}

// ── Endpoint helpers ────────────────────────────────────────────────────────
export const AuthAPI = {
  login: (username, password) => api.post('/auth/login', { username, password }, { auth: false }),
  verify2fa: (challenge_token, code) => api.post('/auth/verify-2fa', { challenge_token, code }, { auth: false }),
  me: () => api.get('/auth/me'),
}

export const DevoteesAPI = {
  list: (params = {}) => api.get('/devotees' + qs(params)),
  stats: () => api.get('/devotees/stats'),
  get: (id) => api.get(`/devotees/${id}`),
  summary: (id) => api.get(`/devotees/${id}/summary`),
  history: (id) => api.get(`/devotees/${id}/history`),
  detail: (id) => api.get(`/devotees/${id}/detail`),
  create: (b) => api.post('/devotees', b),
  update: (id, b) => api.put(`/devotees/${id}`, b),
  remove: (id) => api.del(`/devotees/${id}`),
  addFamily: (id, b) => api.post(`/devotees/${id}/family`, b),
  removeFamily: (id, fid) => api.del(`/devotees/${id}/family/${fid}`),
}

export const PoojasAPI = {
  grouped: () => api.get('/poojas/grouped'),
  list: (params = {}) => api.get('/poojas' + qs(params)),
  admin: () => api.get('/poojas/admin'),
  stats: () => api.get('/poojas/stats'),
  get: (id) => api.get(`/poojas/${id}`),
  updatePlan: (planId, b) => api.put(`/poojas/plans/${planId}`, b),
  create: (b) => api.post('/poojas', b),
  update: (id, b) => api.put(`/poojas/${id}`, b),
  remove: (id) => api.del(`/poojas/${id}`),
}

export const PaymentsAPI = {
  provider: () => api.get('/payments/provider'),
  createOrder: (b) => api.post('/payments/order', b),
  verify: (b) => api.post('/payments/verify', b),
  status: (ref) => api.get(`/payments/${ref}`),
}

export const BookingsAPI = {
  list: (params = {}) => api.get('/bookings' + qs(params)),
  stats: () => api.get('/bookings/stats'),
  create: (b) => api.post('/bookings', b),
  lookup: (ticket) => api.get('/bookings/lookup' + qs({ ticket })),
  complete: (id) => api.post(`/bookings/${id}/complete`),
  reschedule: (id, body) => api.post(`/bookings/${id}/reschedule`, body),
  cancel: (id, body = {}) => api.post(`/bookings/${id}/cancel`, body),
  remove: (id) => api.del(`/bookings/${id}`),
}

export const DonationsAPI = {
  list: (params = {}) => api.get('/donations' + qs(params)),
  stats: () => api.get('/donations/stats'),
  create: (b) => api.post('/donations', b),
  remove: (id) => api.del(`/donations/${id}`),
}

export const PoojaHistoryAPI = {
  list: (params = {}) => api.get('/pooja-history' + qs(params)),
  stats: () => api.get('/pooja-history/stats'),
  detail: (id) => api.get(`/pooja-history/${id}`),
}

export const DonationCategoriesAPI = {
  list: (params = {}) => api.get('/donation-categories' + qs(params)),
  stats: () => api.get('/donation-categories/stats'),
  create: (b) => api.post('/donation-categories', b),
  update: (id, b) => api.put(`/donation-categories/${id}`, b),
  remove: (id) => api.del(`/donation-categories/${id}`),
}

export const HundiAPI = {
  list: (params = {}) => api.get('/hundi' + qs(params)),
  stats: () => api.get('/hundi/stats'),
  create: (b) => api.post('/hundi', b),
  verify: (id) => api.put(`/hundi/${id}/verify`),
  reject: (id, b) => api.put(`/hundi/${id}/reject`, b),
  deposit: (id, b) => api.put(`/hundi/${id}/deposit`, b),
}
export const AuctionAPI = {
  list: (params = {}) => api.get('/auctions' + qs(params)),
  stats: () => api.get('/auctions/stats'),
  create: (b) => api.post('/auctions', b),
  update: (id, b) => api.put(`/auctions/${id}`, b),
  remove: (id) => api.del(`/auctions/${id}`),
}

export const RefundsAPI = {
  list: (params = {}) => api.get('/refunds' + qs(params)),
  create: (b) => api.post('/refunds', b),
}
export const AnnadanamAPI = {
  list: (params = {}) => api.get('/annadanam' + qs(params)),
  stats: () => api.get('/annadanam/stats'),
  create: (b) => api.post('/annadanam', b),
}

export const UsersAPI = {
  list: () => api.get('/users'),
  meta: () => api.get('/users/meta'),
  stats: () => api.get('/users/stats'),
  create: (b) => api.post('/users', b),
  update: (id, b) => api.put(`/users/${id}`, b),
  totp: (id) => api.get(`/users/${id}/totp`),
  remove: (id) => api.del(`/users/${id}`),
}

export const RolesAPI = {
  list: () => api.get('/roles'),
  catalog: () => api.get('/roles/catalog'),
  stats: () => api.get('/roles/stats'),
  get: (id) => api.get(`/roles/${id}`),
  create: (b) => api.post('/roles', b),
  update: (id, b) => api.put(`/roles/${id}`, b),
}

export const PoojarisAPI = {
  list: () => api.get('/poojaris'),
  master: (params = {}) => api.get('/poojaris/master' + qs(params)),
  stats: () => api.get('/poojaris/stats'),
  create: (b) => api.post('/poojaris', b),
  update: (id, b) => api.put(`/poojaris/${id}`, b),
  remove: (id) => api.del(`/poojaris/${id}`),
  schedule: (day) => api.get('/poojaris/schedule' + qs({ day })),
  queue: (params = {}) => api.get('/poojaris/queue' + qs(params)),
  completeDue: (body = {}) => api.post('/poojaris/queue/complete-due', body),
  assign: (booking_id, poojari_id) => api.post('/poojaris/assign', { booking_id, poojari_id }),
}

// ── Configurable masters ──
const crud = (base) => ({
  list: (params = {}) => api.get(base + qs(params)),
  stats: () => api.get(base + '/stats'),
  create: (b) => api.post(base, b),
  update: (id, b) => api.put(`${base}/${id}`, b),
  remove: (id) => api.del(`${base}/${id}`),
})
export const AuctionItemsAPI = crud('/auction-items')
export const HundiItemsAPI = crud('/hundi-items')
export const CommitteeAPI = crud('/committee')
export const FestivalsAPI = crud('/festivals')
export const VendorsAPI = {
  list: (params = {}) => api.get('/waste/vendors/master' + qs(params)),
  stats: () => api.get('/waste/vendors/stats'),
  create: (b) => api.post('/waste/vendors', b),
  update: (id, b) => api.put(`/waste/vendors/${id}`, b),
  remove: (id) => api.del(`/waste/vendors/${id}`),
}

export const SchedulesAPI = {
  list: (params = {}) => api.get('/schedules' + qs(params)),
  stats: () => api.get('/schedules/stats'),
  create: (b) => api.post('/schedules', b),
  update: (id, b) => api.put(`/schedules/${id}`, b),
  remove: (id) => api.del(`/schedules/${id}`),
}

export const WasteAPI = {
  vendors: () => api.get('/waste/vendors'),
  createVendor: (b) => api.post('/waste/vendors', b),
  stats: () => api.get('/waste/stats'),
  sales: (params = {}) => api.get('/waste/sales' + qs(params)),
  createSale: (b) => api.post('/waste/sales', b),
  removeSale: (id) => api.del(`/waste/sales/${id}`),
}

export const TranslateAPI = {
  provider: () => api.get('/translate/provider'),
  translate: (texts, target = 'te') => api.post('/translate', { texts, target }),
}

// ── Public informational site (no auth required) ──
export const PublicAPI = { site: () => request('/public/site', { auth: false }) }

export const DashboardAPI = { get: (params = {}) => api.get('/dashboard' + qs(params)) }
export const ReportsAPI = {
  summary: (params = {}) => api.get('/reports/summary' + qs(params)),
  catalog: () => api.get('/reports/catalog'),
  generate: (params = {}) => api.get('/reports/generate' + qs(params)),
}
export const SettingsAPI = {
  get: () => api.get('/settings'),
  config: () => api.get('/settings/config'),
  update: (b) => api.put('/settings', b),
}
export const AuditAPI = {
  list: (limit = 100) => api.get(`/audit?limit=${limit}`),
  search: (params = {}) => api.get('/audit/search' + qs(params)),
  stats: () => api.get('/audit/stats'),
}
export const DailyClosingAPI = {
  summary: (day) => api.get('/daily-closing/summary' + qs(day ? { day } : {})),
  stats: () => api.get('/daily-closing/stats'),
  list: () => api.get('/daily-closing'),
  close: (b) => api.post('/daily-closing/close', b),
}
export const BackupAPI = {
  list: () => api.get('/backups'),
  stats: () => api.get('/backups/stats'),
  create: () => api.post('/backups', {}),
  download: (id) => `${API_BASE}/backups/${id}/download`,
  validate: (snapshot) => api.post('/backups/validate', { snapshot }),
  restore: (snapshot) => api.post('/backups/restore', { snapshot, confirm: true }),
}
export const NotificationsAPI = {
  config: () => api.get('/notifications/config'),
  updateConfig: (b) => api.put('/notifications/config', b),
  stats: () => api.get('/notifications/stats'),
  logs: (params = {}) => api.get('/notifications/logs' + qs(params)),
  templates: () => api.get('/notifications/templates'),
  test: (b) => api.post('/notifications/test', b),
}

function qs(params) {
  const s = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null),
  ).toString()
  return s ? `?${s}` : ''
}
