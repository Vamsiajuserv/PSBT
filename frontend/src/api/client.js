// ── Lightweight API client for the PSBT-Portal backend ──────────────────────
// All calls go through the Vite dev proxy (/api → FastAPI). The JWT is stored
// in localStorage and attached to every request.

const TOKEN_KEY = 'psbt_token'

// In production the built site calls the API at its absolute Azure URL
// (VITE_API_BASE_URL, injected at build time). In local dev this is unset, so
// calls stay relative ("/api") and go through the Vite proxy → 127.0.0.1:8099.
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '')

// ── Configuration ──
const REQUEST_TIMEOUT_MS = 30000 // 30 seconds timeout
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000 // Initial retry delay (doubles each attempt)
const RETRIABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504] // Status codes that trigger retry

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY))

export class ApiError extends Error {
  constructor(status, detail, isNetworkError = false, isTimeout = false) {
    super(detail || `Request failed (${status})`)
    this.status = status
    this.detail = detail
    this.isNetworkError = isNetworkError
    this.isTimeout = isTimeout
  }
}

// ── User-friendly error messages ──
function getNetworkErrorMessage(error) {
  if (error.name === 'AbortError') {
    return 'Request timed out. Please check your connection and try again.'
  }
  if (!navigator.onLine) {
    return 'You appear to be offline. Please check your internet connection.'
  }
  if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
    return 'Unable to connect to the server. Please check your connection or try again later.'
  }
  return 'A network error occurred. Please try again.'
}

function getHttpErrorMessage(status) {
  switch (status) {
    case 400: return 'Invalid request. Please check your input and try again.'
    case 401: return 'Your session has expired. Please log in again.'
    case 403: return 'You do not have permission to perform this action.'
    case 404: return 'The requested resource was not found.'
    case 408: return 'Request timed out. Please try again.'
    case 409: return 'This operation conflicts with existing data.'
    case 422: return 'Invalid data provided. Please check your input.'
    case 429: return 'Too many requests. Please wait a moment and try again.'
    case 500: return 'Server error. Our team has been notified.'
    case 502: return 'Server temporarily unavailable. Please try again shortly.'
    case 503: return 'Service temporarily unavailable. Please try again shortly.'
    case 504: return 'Server timeout. Please try again.'
    default: return `Request failed (${status})`
  }
}

// ── Sleep helper for retry delays ──
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ── Core request function with timeout, retry, and error handling ──
async function request(path, { method = 'GET', body, auth = true, retries = 0 } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth && getToken()) headers.Authorization = `Bearer ${getToken()}`

  // Create AbortController for timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let res
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
  } catch (error) {
    clearTimeout(timeoutId)

    // Handle timeout (AbortError)
    if (error.name === 'AbortError') {
      // Retry on timeout for GET requests
      if (method === 'GET' && retries < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * Math.pow(2, retries))
        return request(path, { method, body, auth, retries: retries + 1 })
      }
      throw new ApiError(408, getNetworkErrorMessage(error), false, true)
    }

    // Handle network errors (no response at all)
    // Retry on network error for idempotent methods (GET, PUT, DELETE)
    if (['GET', 'PUT', 'DELETE'].includes(method) && retries < MAX_RETRIES) {
      await sleep(RETRY_DELAY_MS * Math.pow(2, retries))
      return request(path, { method, body, auth, retries: retries + 1 })
    }

    throw new ApiError(0, getNetworkErrorMessage(error), true, false)
  } finally {
    clearTimeout(timeoutId)
  }

  // Handle 204 No Content
  if (res.status === 204) return null

  // Parse JSON response safely
  let data = null
  try {
    const text = await res.text()
    if (text) {
      data = JSON.parse(text)
    }
  } catch {
    // If response is not valid JSON but status is OK, return null
    if (res.ok) return null
    // JSON parse failed for non-OK response - continue to error handling below
  }

  // Handle success
  if (res.ok) return data

  // Handle retriable errors with automatic retry
  if (RETRIABLE_STATUS_CODES.includes(res.status) && retries < MAX_RETRIES) {
    // Don't retry POST requests as they may not be idempotent
    if (method !== 'POST') {
      await sleep(RETRY_DELAY_MS * Math.pow(2, retries))
      return request(path, { method, body, auth, retries: retries + 1 })
    }
  }

  // Handle 401 - auto sign-out
  // An expired/invalid session must clear BOTH the token and the cached user,
  // then bounce to the staff login — otherwise the admin shell keeps rendering
  // tokenless and every call 401s into a permanent "Loading…".
  // Guard the redirect so the login page (which 401s on bad credentials) doesn't loop.
  if (res.status === 401) {
    setToken(null)
    localStorage.removeItem('psbt_user')
    if (!window.location.pathname.startsWith('/staff-login')) {
      window.location.replace('/staff-login')
    }
  }

  // Build user-friendly error message
  const detail = data?.detail || getHttpErrorMessage(res.status)
  throw new ApiError(res.status, detail)
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
  changePassword: (current_password, new_password) => api.post('/auth/change-password', { current_password, new_password }),
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
  remove: (id, force = false) => api.del(`/poojas/${id}${force ? '?force=true' : ''}`),
  // Festival Pricing - for Committee role
  allPlans: () => api.get('/poojas/plans/all'),
  updateCommitteeFee: (planId, fee) => api.put(`/poojas/plans/${planId}/committee-fee`, { fee }),
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
  // Optimized endpoint: combines create + payment in single call (for Counter)
  quickCreate: (b) => api.post('/bookings/quick-create', b),
  // Bulk optimized: process multiple cart items in single request
  bulkQuickCreate: (b) => api.post('/bookings/bulk-quick-create', b),
  lookup: (ticket) => api.get('/bookings/lookup' + qs({ ticket })),
  checkDuplicate: (params) => api.get('/bookings/check-duplicate' + qs(params)),
  complete: (id) => api.post(`/bookings/${id}/complete`),
  reschedule: (id, body) => api.post(`/bookings/${id}/reschedule`, body),
  cancel: (id, body = {}) => api.post(`/bookings/${id}/cancel`, body),
  remove: (id) => api.del(`/bookings/${id}`),
  eligibleToday: (params = {}) => api.get('/bookings/eligible/today' + qs(params)),
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
  store: (id, b) => api.put(`/hundi/${id}/store`, b),
}
export const AuctionAPI = {
  list: (params = {}) => api.get('/auctions' + qs(params)),
  stats: () => api.get('/auctions/stats'),
  create: (b) => api.post('/auctions', b),
  update: (id, b) => api.put(`/auctions/${id}`, b),
  remove: (id) => api.del(`/auctions/${id}`),
  verify: (id) => api.post(`/auctions/${id}/verify`),
  reject: (id, reason) => api.post(`/auctions/${id}/reject`, { reason }),
  payment: (id, b) => api.post(`/auctions/${id}/payment`, b),
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
  assignBulk: (booking_ids, poojari_id) => api.post('/poojaris/assign-bulk', { booking_ids, poojari_id }),
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
  verify: (id, b = {}) => api.put(`/waste/sales/${id}/verify`, b),
  reject: (id, b) => api.put(`/waste/sales/${id}/reject`, b),
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
  reopen: (b) => api.post('/daily-closing/reopen', b),
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
export const TithiAPI = {
  list: (params = {}) => api.get('/tithis' + qs(params)),
  next: (tithi_type) => api.get('/tithis/next' + qs({ tithi_type })),
  upcoming: (tithi_type = 'Pournami', count = 12) => api.get('/tithis/upcoming' + qs({ tithi_type, count })),
  stats: () => api.get('/tithis/stats'),
  create: (b) => api.post('/tithis', b),
  update: (id, b) => api.put(`/tithis/${id}`, b),
  remove: (id) => api.del(`/tithis/${id}`),
  bulk: (items) => api.post('/tithis/bulk', { items }),
}

export const AnalyticsAPI = {
  trends: (params = {}) => api.get('/analytics/trends' + qs(params)),
  breakdown: (params = {}) => api.get('/analytics/breakdown' + qs(params)),
  comparison: (params = {}) => api.get('/analytics/comparison' + qs(params)),
  top: (params = {}) => api.get('/analytics/top' + qs(params)),
  paymentModes: (params = {}) => api.get('/analytics/payment-modes' + qs(params)),
  hundiFunnel: (params = {}) => api.get('/analytics/hundi-funnel' + qs(params)),
  summary: (params = {}) => api.get('/analytics/summary' + qs(params)),
}

export const PanchangamAPI = {
  status: () => api.get('/panchangam/status'),
  today: () => api.get('/panchangam/today'),
  date: (dt) => api.get(`/panchangam/date/${dt}`),
  month: (year, month) => api.get(`/panchangam/month/${year}/${month}`),
  range: (start, end) => api.get('/panchangam/range' + qs({ start, end })),
}

export const ProkeralaAPI = {
  status: () => api.get('/prokerala/status'),
  panchang: (date) => api.get('/prokerala/panchang' + qs({ date })),
  calendar: (year, month) => api.get('/prokerala/calendar' + qs({ year, month })),
  festivals: (year, month) => api.get('/prokerala/festivals' + qs({ year, month })),
  pournami: (year, count) => api.get('/prokerala/pournami' + qs({ year, count })),
  today: () => api.get('/prokerala/today'),
  clearCache: () => api.get('/prokerala/clear-cache'),
}

function qs(params) {
  const s = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null),
  ).toString()
  return s ? `?${s}` : ''
}
