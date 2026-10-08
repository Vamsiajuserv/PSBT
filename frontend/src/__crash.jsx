const qs = new URLSearchParams(location.search)
const role = qs.get('role') || 'Administrator'
const user = { id: 1, username: 'u', name: 'Test', role, modules: 'Devotees,Sevas,Bookings,Donations,Hundi,Auction,Annadanam,Counter,Reports,Users,Audit', must_change_password: false, is_active: true }
localStorage.setItem('psbt_token', 'x'); localStorage.setItem('psbt_user', JSON.stringify(user))
window.__errors = []
const origErr = console.error
console.error = (...a) => { window.__errors.push(a.map((x) => (x && x.stack) ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x)).join(' ')); origErr(...a) }
window.addEventListener('error', (e) => window.__errors.push('window.error: ' + e.message))
window.fetch = (url) => {
  const u = String(url)
  if (u.includes('/auth/me')) return Promise.resolve(new Response(JSON.stringify(user), { status: 200 }))
  return Promise.resolve(new Response(JSON.stringify({ detail: 'mock' }), { status: 404 }))
}
const React = (await import('react')).default
const ReactDOM = (await import('react-dom/client')).default
const { MemoryRouter } = await import('react-router-dom')
const { default: App } = await import('./App.jsx')
const { AuthProvider } = await import('./auth/AuthContext.jsx')
const { default: ErrorBoundary } = await import('./components/common/ErrorBoundary.jsx')
ReactDOM.createRoot(document.getElementById('root')).render(
  React.createElement(ErrorBoundary, null, React.createElement(MemoryRouter, { initialEntries: [qs.get('path')] },
    React.createElement(AuthProvider, null, React.createElement(App)))))
setTimeout(() => {
  const crashed = document.body.innerText.includes('Something went wrong')
  const pre = document.createElement('pre'); pre.id = 'report'
  pre.textContent = (crashed ? 'CRASH ' : 'ok ') + (crashed ? window.__errors.filter((e) => /Error|error/.test(e)).slice(0, 2).join(' || ').slice(0, 600) : '')
  document.body.appendChild(pre)
}, 3500)
