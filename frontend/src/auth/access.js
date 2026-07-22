// Central access map for the admin back-office — the single source of truth for
// both the sidebar (AdminLayout) and the route guards (App.jsx). Keys are the
// route segment after "/admin/" (e.g. "donation-master"); the dashboard index
// and any unlisted screen are open to every signed-in staff member.
//
// Rules:
//   module    — the backend module the screen needs (mirrors security.MODULES /
//               RequireModule on the API, so the UI never offers a screen the
//               API will reject).
//   adminOnly — configuration / master-data screens restricted to Administrator
//               regardless of module. The requirement doc frames every master as
//               admin configuration ("Configurable poojas / plans / fees / …"),
//               and the backend's module vocabulary is too coarse to separate
//               "operate" from "configure" (e.g. Donation Master sits behind the
//               same Donations module counter staff use to record a donation).
//               adminOnly closes that gap on the client; the matching API
//               write-hardening is tracked as a follow-up.
//   roles     — role-specific workflow screens: only these roles (plus
//               Administrator) see them, even if other roles hold the module.
//               Used to give the Poojari its own queue/verify screens and to keep
//               the counter's booking screens off the Poojari's menu — both roles
//               hold the Bookings module, but their screens differ.
export const ACCESS = {
  // ── Transactional screens (visible to any role holding the module) ──
  devotees: { module: 'Devotees' },
  bookings: { module: 'Bookings', roles: ['Counter Staff'] },
  'bookings/new': { module: 'Bookings', roles: ['Counter Staff'] },   // Advance Booking nav entry
  'pooja-history': { module: 'Bookings', roles: ['Counter Staff'] },
  calendar: { module: 'Bookings', roles: ['Counter Staff'] },
  counter: { module: 'Counter' },
  donations: { module: 'Donations' },
  hundi: { module: 'Hundi' },
  annadanam: { module: 'Annadanam' },
  'waste-sales': { module: 'Counter' },
  auction: { module: 'Auction' },
  reports: { module: 'Reports' },
  'daily-closing': { module: 'Reports' },
  audit: { module: 'Audit' },

  // ── Poojari workflow screens (Poojari + Administrator) ──
  'my-poojas': { module: 'Bookings', roles: ['Poojari'] },
  'verify-ticket': { module: 'Bookings', roles: ['Poojari'] },

  // ── Masters / configuration (Administrator only) ──
  'pooja-master': { adminOnly: true },
  'poojari-schedule': { adminOnly: true },
  'poojari-master': { adminOnly: true },
  'donation-master': { adminOnly: true },
  'hundi-items': { adminOnly: true },
  'auction-items': { adminOnly: true },
  vendors: { adminOnly: true },
  committee: { adminOnly: true },
  festivals: { adminOnly: true },
  settings: { adminOnly: true },
  users: { adminOnly: true },
  roles: { adminOnly: true },
  backup: { adminOnly: true },
}

export function isAdminRole(user) {
  return !!user && ['Admin', 'Administrator'].includes(user.role)
}

// The "/admin/…" screen key for a nav target, e.g. "/admin/bookings" → "bookings"
// and "/admin" → "" (the dashboard).
export function keyOf(to) {
  return (to || '').replace(/^\/admin\/?/, '')
}

// Can this user reach the given screen key? Administrators reach everything;
// unlisted keys (dashboard, notifications) are open to any signed-in staff.
export function canAccessKey(user, key) {
  if (!user) return false
  if (isAdminRole(user)) return true
  const rule = ACCESS[key]
  if (!rule) return true
  if (rule.adminOnly) return false
  if (rule.roles && !rule.roles.includes(user.role)) return false
  if (rule.module && !(user.modules || '').split(',').map((m) => m.trim()).includes(rule.module)) return false
  return true
}
