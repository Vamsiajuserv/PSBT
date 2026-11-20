// Booking status colours — ONE meaning everywhere a booking is shown (All bookings, Booking
// Details, Devotee pages, Calendar, Dashboard). Client review 2026-11-14: "Confirmed" (paid,
// pooja still to perform) was green and "Completed" blue, so green read as "done".
//   Confirmed = amber (to perform) · Completed = green (done) · Cancelled = red · Pending = grey (not paid yet)
export const BOOKING_STATUSES = ['Confirmed', 'Completed', 'Cancelled', 'Pending']

const TONES = {
  Confirmed: { pill: 'amber', chip: 'bg-amber-50 text-amber-800 border-amber-200', dot: '#d97706' },
  Completed: { pill: 'green', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: '#059669' },
  Cancelled: { pill: 'red', chip: 'bg-red-50 text-red-700 border-red-200', dot: '#dc2626' },
  Pending: { pill: 'gray', chip: 'bg-gray-100 text-gray-600 border-gray-200', dot: '#9ca3af' },
}
const OTHER = { pill: 'gray', chip: 'bg-gray-100 text-gray-500 border-gray-200', dot: '#9ca3af' }

/** Tailwind classes for a status badge (background + text + border colour). */
export const statusChip = (status) => (TONES[status] || OTHER).chip
/** The <Pill tone> name for a status (components/admin/ui.jsx). */
export const statusPill = (status) => (TONES[status] || OTHER).pill
/** A solid colour for a status dot (Calendar). */
export const statusDot = (status) => (TONES[status] || OTHER).dot
