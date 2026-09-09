import React, { useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users as UsersIcon, Flame, HandHeart, Landmark, Gavel,
  UtensilsCrossed, Recycle, FileBarChart, ShieldCheck, Settings as SettingsIcon,
  Menu, LogOut, Bell, Calendar, Clock, ChevronDown, ChevronRight, ChevronLeft, KeyRound, Wallet,
  Receipt, ClipboardList, ScanLine, TrendingUp,
} from 'lucide-react'
import { useAuth } from '../../auth/AuthContext.jsx'
import { canAccessKey, keyOf } from '../../auth/access.js'
import { useLang, T, tr, clock12, personName } from '../../i18n/LanguageContext.jsx'
import { getFontScale, setFontScale } from '../../lib/fontScale.js'
import ChangePasswordModal from './ChangePasswordModal.jsx'

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/counter', label: 'Counter Billing', icon: Receipt },
  // Advance booking lives inside Pooja Management → Bookings ("Advance Booking"
  // action) — a second top-level entry to the same wizard only duplicated it.
  // The daily queue is "My Poojas" to the Poojari who performs them; to everyone
  // else (Administrator, supervising staff) it is the temple's pooja queue.
  { to: '/admin/my-poojas', label: 'Pooja Queue', poojariLabel: 'My Poojas', icon: ClipboardList },
  { to: '/admin/verify-ticket', label: 'Verify Ticket', icon: ScanLine },
  { to: '/admin/devotees', label: 'Devotee Management', icon: UsersIcon },
  {
    label: 'Pooja Management', icon: Flame,
    children: [
      { to: '/admin/bookings', label: 'Bookings' },
      { to: '/admin/pooja-master', label: 'Pooja Master' },
      { to: '/admin/poojari-schedule', label: 'Poojari Schedule' },
      { to: '/admin/poojari-master', label: 'Poojari Master' },
      { to: '/admin/pooja-history', label: 'Pooja History' },
      { to: '/admin/calendar', label: 'Calendar' },
      { to: '/admin/festivals', label: 'Festival Master' },
    ],
  },
  {
    label: 'Donation Management', icon: HandHeart,
    children: [
      { to: '/admin/donations', label: 'Donations' },
      { to: '/admin/donation-master', label: 'Donation Master' },
    ],
  },
  {
    label: 'Hundi Management', icon: Landmark,
    children: [
      { to: '/admin/hundi', label: 'Hundi Collections' },
      { to: '/admin/hundi-items', label: 'Hundi Item Master' },
    ],
  },
  {
    label: 'Auction Management', icon: Gavel,
    children: [
      { to: '/admin/auction', label: 'Auctions' },
      { to: '/admin/auction-items', label: 'Auction Item Master' },
    ],
  },
  { to: '/admin/annadanam', label: 'Annadanam Management', icon: UtensilsCrossed, chevron: true },
  {
    label: 'Waste Material Sales', icon: Recycle,
    children: [
      { to: '/admin/waste-sales', label: 'Waste Sales' },
      { to: '/admin/vendors', label: 'Vendor Master' },
    ],
  },
  { to: '/admin/reports', label: 'Reports', icon: FileBarChart, chevron: true },
  { to: '/admin/analytics', label: 'Analytics & Trends', icon: TrendingUp, chevron: true },
  { to: '/admin/daily-closing', label: 'Daily Closing', icon: Wallet, chevron: true },
  { to: '/admin/users', label: 'User Management', icon: ShieldCheck, chevron: true },
  { to: '/admin/roles', label: 'Role & Access Management', icon: KeyRound, chevron: true },
  {
    label: 'Settings', icon: SettingsIcon,
    children: [
      { to: '/admin/settings', label: 'System Settings' },
      { to: '/admin/committee', label: 'Committee Member Master' },
      { to: '/admin/notifications', label: 'Notifications' },
      { to: '/admin/audit', label: 'Audit Trail' },
      { to: '/admin/backup', label: 'Backup & Restore' },
    ],
  },
]

// Weekday and month are words, so they translate; the digits stay as they are.
// AM/PM is a word too — a Telugu reader expects ఉదయం / సాయంత్రం.
const todayLabel = () =>
  new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' })
    .replace(/[A-Za-z]{3,}/g, (w) => tr(w))
const timeLabel = () =>
  clock12(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }))

// Accessibility text-size control (A− / A / A+) — bumps the whole UI via the
// --font-scale CSS variable, remembered across visits (see lib/fontScale.js).
function FontSizeToggle() {
  const [level, setLevel] = useState(getFontScale())
  const pick = (l) => setLevel(setFontScale(l))
  const btn = (l, node, title) => (
    <button onClick={() => pick(l)} title={title} aria-label={title}
      className={`px-2 py-1 leading-none focus:outline-none focus:ring-2 focus:ring-maroon-500 focus:ring-inset ${level === l ? 'bg-maroon-700 text-gold-400' : 'text-maroon-700 hover:bg-maroon-50'}`}>
      {node}
    </button>
  )
  return (
    <div className="inline-flex items-stretch rounded-full border border-maroon-300 overflow-hidden font-bold">
      {btn('small', <span className="text-[0.625rem]">A−</span>, 'Smaller text')}
      {btn('normal', <span className="text-[0.8125rem]">A</span>, 'Default text size')}
      {btn('large', <span className="text-[1rem]">A+</span>, 'Larger text')}
    </div>
  )
}

function SidebarNav({ onNavigate }) {
  const location = useLocation()
  const { user } = useAuth()
  const { t } = useLang()

  // Keep only what this user may reach: leaves gate on their key; a group is
  // pruned to its visible children and dropped entirely if none remain.
  const nav = NAV.map((n) => {
    if (n.children) {
      const kids = n.children.filter((c) => canAccessKey(user, keyOf(c.to)))
      return kids.length ? { ...n, children: kids } : null
    }
    if (!canAccessKey(user, keyOf(n.to))) return null
    return n.poojariLabel && user?.role === 'Poojari' ? { ...n, label: n.poojariLabel } : n
  }).filter(Boolean)

  // Check if we're on a top-level route (non-group item) - if so, don't auto-expand any group
  const isTopLevelRoute = nav.some((n) => !n.children && (
    n.end ? location.pathname === n.to : location.pathname === n.to || location.pathname.startsWith(n.to + '/')
  ))
  // Only auto-expand a group if we're NOT on a top-level route
  const activeGroup = isTopLevelRoute ? null : nav.find((n) => n.children?.some((c) => location.pathname.startsWith(c.to)))
  const [open, setOpen] = useState(activeGroup ? { [activeGroup.label]: true } : {})

  return (
    <nav className="flex-1 overflow-y-auto sidebar-scroll px-3 py-3 space-y-0.5">
      {nav.map((n) => {
        const Icon = n.icon
        if (n.children) {
          const groupActive = n.children.some((c) => location.pathname.startsWith(c.to))
          const isOpen = open[n.label] ?? groupActive
          return (
            <div key={n.label}>
              <button
                onClick={() => setOpen((o) => ({ ...o, [n.label]: !isOpen }))}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[0.84375rem] font-medium transition-colors ${
                  groupActive ? 'bg-ivory text-maroon-800 font-semibold' : 'text-cream/85 hover:bg-white/10'
                }`}
              >
                <Icon size={18} /> <span className="flex-1 text-left">{t(n.label)}</span>
                {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </button>
              {isOpen && (
                <div className="mt-0.5 mb-1 ml-3 pl-3 border-l border-white/15 space-y-0.5">
                  {n.children.map((c) => (
                    <NavLink key={c.to} to={c.to} onClick={onNavigate}
                      className={({ isActive }) =>
                        `flex items-center gap-2 pl-3 pr-2 py-2 rounded-lg text-[0.8125rem] transition-colors ${
                          isActive ? 'bg-maroon-900/70 text-gold-200 font-semibold border-l-2 border-gold-400 -ml-[0.8125rem] pl-[1.5rem]' : 'text-cream/70 hover:text-cream hover:bg-white/5'
                        }`
                      }
                    >
                      <span className="w-1 h-1 rounded-full bg-current opacity-60" /> {t(c.label)}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )
        }
        return (
          <NavLink key={n.to} to={n.to} end={n.end} onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-[0.84375rem] font-medium transition-colors ${
                isActive ? 'bg-ivory text-maroon-800 font-semibold' : 'text-cream/85 hover:bg-white/10'
              }`
            }
          >
            <Icon size={18} /> <span className="flex-1">{t(n.label)}</span>
            {n.chevron && <ChevronRight size={15} className="opacity-55" />}
          </NavLink>
        )
      })}
    </nav>
  )
}

export default function AdminLayout() {
  const [open, setOpen] = useState(false)          // mobile overlay
  const [collapsed, setCollapsed] = useState(false) // desktop slide-away
  const { user, logout } = useAuth()
  const { t, lang, setLang } = useLang()
  const navigate = useNavigate()
  const name = personName(user, lang) || tr('Administrator')
  const role = user?.role || 'Admin'
  const roleLabel = tr(role === 'Admin' ? 'Administrator' : role)
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  const signOut = () => { logout(); navigate('/staff-login') }

  return (
    <div className="h-screen h-dvh bg-cream flex overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 shrink-0 bg-gradient-to-b from-maroon-800 to-maroon-900 text-cream flex flex-col transition-all duration-300 ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} ${collapsed ? 'lg:-ml-64' : 'lg:ml-0'}`}>
        <div className="px-5 pt-4 pb-4 text-center border-b border-white/10 relative">
          <img src="/images/temple-logo.png" alt="Sri Shirdi Sai Baba Temple" className="w-20 h-20 mx-auto drop-shadow-md" />
          <div className="font-serif font-bold text-gold-200 text-[0.9375rem] leading-tight mt-1"><T>Sri Shirdi Sai Baba Temple</T></div>
          <div className="text-[0.65625rem] text-cream/55 leading-tight mt-1"><T>Dwarkapuri Colony, Punjagutta,</T><br /><T>Hyderabad, Telangana</T></div>
          {/* Toggle button at top right corner of logo section */}
          <button
            onClick={() => { setOpen(false); setCollapsed((c) => !c) }}
            className="hidden lg:flex absolute top-2 right-2 items-center justify-center text-white/70 hover:text-white hover:bg-maroon-600 transition-colors w-8 h-8 rounded-full"
            title={tr("Toggle sidebar")}
            aria-label={tr("Toggle sidebar")}>
            <ChevronLeft size={18} />
          </button>
        </div>

        <SidebarNav onNavigate={() => setOpen(false)} />
      </aside>

      {/* Toggle button when sidebar is collapsed - only icon visible */}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="hidden lg:flex fixed left-0 top-0 z-40 w-10 h-10 bg-maroon-700 hover:bg-maroon-600 rounded-br-lg items-center justify-center text-white shadow-md transition-colors"
          title={tr("Show sidebar")}
          aria-label={tr("Show sidebar")}>
          <ChevronRight size={20} />
        </button>
      )}

      {open && <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setOpen(false)} role="button" aria-label="Close navigation menu" tabIndex={0} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)} />}

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="h-[4.25rem] min-h-[4.25rem] shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
          {/* Left: Menu + Temple Name */}
          <div className="flex items-center gap-2">
            <button className="lg:hidden text-gray-500 hover:text-maroon-700 focus:outline-none focus:ring-2 focus:ring-maroon-500 focus:ring-offset-1 rounded p-1" title={tr("Menu")} aria-label={tr("Open navigation menu")}
              onClick={() => setOpen((o) => !o)}><Menu size={22} /></button>
            <span className="font-serif font-bold text-maroon-800 text-[1.375rem] whitespace-nowrap"><T>Sri Shirdi Sai Baba Temple</T></span>
          </div>

          {/* Right: All controls in one line */}
          <div className="flex items-center gap-2 lg:gap-4">
            <span className="hidden md:flex items-center gap-1.5 text-[0.875rem] text-maroon-700 whitespace-nowrap"><Calendar size={15} className="text-maroon-500" /> {todayLabel()}</span>
            <span className="hidden lg:flex items-center gap-1.5 text-[0.875rem] text-maroon-700 whitespace-nowrap"><Clock size={15} className="text-maroon-500" /> {timeLabel()}</span>
            <div className="inline-flex items-center rounded-full border border-maroon-300 overflow-hidden text-[0.6875rem] font-bold" role="group" aria-label="Language selection">
              <button onClick={() => setLang('en')} title="English" aria-label="Switch to English" aria-pressed={lang === 'en'} className={`px-2 py-1 focus:outline-none focus:ring-2 focus:ring-maroon-500 focus:ring-inset ${lang === 'en' ? 'bg-maroon-700 text-gold-400' : 'text-maroon-700 hover:bg-maroon-50'}`}>EN</button>
              <button onClick={() => setLang('te')} title="తెలుగు" aria-label="Switch to Telugu" aria-pressed={lang === 'te'} className={`px-2 py-1 font-telugu focus:outline-none focus:ring-2 focus:ring-maroon-500 focus:ring-inset ${lang === 'te' ? 'bg-maroon-700 text-gold-400' : 'text-maroon-700 hover:bg-maroon-50'}`}>తెలుగు</button>
            </div>
            <button onClick={() => navigate('/admin/notifications')} title={tr("Notifications")} aria-label={tr("Notifications")} className="text-maroon-500 hover:text-maroon-700 focus:outline-none focus:ring-2 focus:ring-maroon-500 focus:ring-offset-1 rounded-full p-1">
              <Bell size={18} />
            </button>
            <FontSizeToggle />
            <div className="flex items-center gap-2 pl-2 lg:pl-3 border-l border-gray-200">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 text-white grid place-items-center text-xs font-bold shadow-sm">{initials}</div>
              <div className="hidden md:block text-right leading-tight">
                <div className="text-[0.875rem] font-bold text-gray-800 whitespace-nowrap">{name}</div>
                <div className="text-[0.75rem] text-gray-500 whitespace-nowrap">{t(roleLabel)}</div>
              </div>
              <button onClick={signOut} title={tr("Sign out")} aria-label={tr("Sign out")} className="text-gray-400 hover:text-maroon-700 focus:outline-none focus:ring-2 focus:ring-maroon-500 focus:ring-offset-1 rounded p-1"><LogOut size={16} /></button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 lg:px-6 pt-2 lg:pt-3 pb-[max(2.5rem,env(safe-area-inset-bottom))] max-w-[100rem] w-full mx-auto">
          <Outlet context={{ role }} />
        </main>
      </div>

      {/* Force password change on first login */}
      <ChangePasswordModal />
    </div>
  )
}
