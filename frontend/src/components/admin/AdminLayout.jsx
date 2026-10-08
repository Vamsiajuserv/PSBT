import React, { useState, useEffect } from 'react'
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
  { to: '/admin', label: tr('Dashboard'), icon: LayoutDashboard, end: true },
  { to: '/admin/counter', label: tr('Counter Billing'), icon: Receipt },
  { to: '/admin/my-poojas', label: tr('Pooja Queue'), poojariLabel: tr('My Poojas'), icon: ClipboardList },
  { to: '/admin/verify-ticket', label: tr('Verify Ticket'), icon: ScanLine },
  { to: '/admin/devotees', label: tr('Devotee Management'), icon: UsersIcon },
  {
    label: tr('Pooja Management'), icon: Flame,
    children: [
      { to: '/admin/bookings', label: tr('Bookings') },
      { to: '/admin/pooja-master', label: tr('Pooja Master') },
      { to: '/admin/poojari-schedule', label: tr('Poojari Schedule') },
      { to: '/admin/poojari-master', label: tr('Poojari Master') },
      { to: '/admin/pooja-history', label: tr('Pooja History') },
      { to: '/admin/calendar', label: tr('Calendar') },
      { to: '/admin/festivals', label: tr('Festival Master') },
    ],
  },
  {
    label: tr('Donation Management'), icon: HandHeart,
    children: [
      { to: '/admin/donations', label: tr('Donations') },
      { to: '/admin/donation-master', label: tr('Donation Master') },
    ],
  },
  {
    label: tr('Hundi Management'), icon: Landmark,
    children: [
      { to: '/admin/hundi', label: tr('Hundi Collections') },
      { to: '/admin/hundi-items', label: tr('Hundi Item Master') },
    ],
  },
  {
    label: tr('Auction Management'), icon: Gavel,
    children: [
      { to: '/admin/auction', label: tr('Auctions') },
      { to: '/admin/auction-items', label: tr('Auction Item Master') },
    ],
  },
  { to: '/admin/annadanam', label: tr('Annadanam Management'), icon: UtensilsCrossed },
  {
    label: tr('Waste Material Sales'), icon: Recycle,
    children: [
      { to: '/admin/waste-sales', label: tr('Waste Sales') },
      { to: '/admin/vendors', label: tr('Vendor Master') },
      { to: '/admin/waste-materials', label: tr('Waste Material Master') },
    ],
  },
  { to: '/admin/reports', label: tr('Reports'), icon: FileBarChart },
  { to: '/admin/analytics', label: tr('Analytics & Trends'), icon: TrendingUp },
  { to: '/admin/daily-closing', label: tr('Daily Closing'), icon: Wallet },
  { to: '/admin/users', label: tr('User Management'), icon: ShieldCheck },
  { to: '/admin/roles', label: tr('Role & Access'), icon: KeyRound },
  {
    label: tr('Settings'), icon: SettingsIcon,
    children: [
      { to: '/admin/settings', label: tr('System Settings') },
      { to: '/admin/committee', label: tr('Committee Member Master') },
      { to: '/admin/notifications', label: tr('Notifications') },
      { to: '/admin/audit', label: tr('Audit Trail') },
      { to: '/admin/backup', label: tr('Backup & Restore') },
    ],
  },
]

const todayLabel = () =>
  new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' })
    .replace(/[A-Za-z]{3,}/g, (w) => tr(w))
const timeLabel = () =>
  clock12(new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' }))

// Live clock hook - updates every second
function useLiveClock() {
  const [time, setTime] = useState(timeLabel)
  useEffect(() => {
    const timer = setInterval(() => setTime(timeLabel()), 1000)
    return () => clearInterval(timer)
  }, [])
  return time
}

function FontSizeToggle() {
  const [level, setLevel] = useState(getFontScale())
  const pick = (l) => setLevel(setFontScale(l))
  const btn = (l, node, title) => (
    <button onClick={() => pick(l)} title={tr(title)} aria-label={tr(title)}
      className={`px-2 py-1 leading-none outline-none transition-none ${level === l ? 'bg-[#D4AF37] text-[#4A0515]' : 'text-[#FFF1C7] hover:bg-white/10 active:bg-[#D4AF37] active:text-[#4A0515]'}`}>
      {node}
    </button>
  )
  return (
    <div className="inline-flex items-stretch rounded-full border border-[#D4AF37] overflow-hidden font-bold">
      {btn('small', <span className="text-[0.625rem]">A−</span>, 'Smaller text')}
      {btn('normal', <span className="text-[0.8125rem]">A</span>, 'Default text size')}
      {btn('large', <span className="text-[1rem]">A+</span>, 'Larger text')}
    </div>
  )
}

function SidebarNav({ onNavigate, collapsed }) {
  const location = useLocation()
  const { user } = useAuth()
  const { t } = useLang()

  const nav = NAV.map((n) => {
    if (n.children) {
      const kids = n.children.filter((c) => canAccessKey(user, keyOf(c.to)))
      // Poojari / Counter Staff / Accountant / Committee: a group with a single reachable screen becomes
      // a direct link (e.g. Calendar, Donations, Hundi Collections, Auctions, Waste Sales)
      if (['Poojari', 'Counter Staff', 'Accountant', 'Committee'].includes(user?.role) && kids.length === 1) {
        return { to: kids[0].to, label: kids[0].label, icon: kids[0].to === '/admin/calendar' ? Calendar : n.icon }
      }
      return kids.length ? { ...n, children: kids } : null
    }
    if (!canAccessKey(user, keyOf(n.to))) return null
    return n.poojariLabel && user?.role === 'Poojari' ? { ...n, label: n.poojariLabel } : n
  }).filter(Boolean)

  const isTopLevelRoute = nav.some((n) => !n.children && (
    n.end ? location.pathname === n.to : location.pathname === n.to || location.pathname.startsWith(n.to + '/')
  ))
  const activeGroup = isTopLevelRoute ? null : nav.find((n) => n.children?.some((c) => location.pathname.startsWith(c.to)))
  // Accordion: only one section open at a time. On every page change only the current
  // page's section stays open — a single-link page (Dashboard, Daily Closing…) closes it.
  const [openGroup, setOpenGroup] = useState(activeGroup?.label ?? null)
  useEffect(() => { setOpenGroup(activeGroup?.label ?? null) }, [location.pathname])

  // Expanded: long labels (e.g. "Committee Member Master", Telugu names) wrap onto a
  // second line instead of being clipped by the fixed sidebar width. Collapsed: one
  // line, so the hidden zero-width label cannot grow tall.
  const labelClass = collapsed ? 'opacity-0 w-0 overflow-hidden whitespace-nowrap' : 'opacity-100 flex-1 min-w-0 whitespace-normal break-words leading-snug'

  return (
    <nav className={`flex-1 overflow-y-auto overflow-x-hidden sidebar-scroll py-2 space-y-0.5 transition-all duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] ${collapsed ? 'px-0' : 'px-3'}`}>
      {nav.map((n) => {
        const Icon = n.icon
        if (n.children) {
          const groupActive = n.children.some((c) => location.pathname.startsWith(c.to))
          const isOpen = !collapsed && openGroup === n.label
          const firstChild = n.children[0]

          return (
            <div key={n.label}>
              <NavLink
                to={collapsed ? firstChild.to : undefined}
                onClick={(e) => {
                  if (!collapsed) {
                    e.preventDefault()
                    setOpenGroup(isOpen ? null : n.label)
                    // Auto-scroll to show expanded menu items when opening
                    if (!isOpen) {
                      setTimeout(() => {
                        const menuDiv = e.target.closest('div[class*="key"]') || e.target.closest('div')
                        if (menuDiv) {
                          menuDiv.scrollIntoView({ behavior: 'smooth', block: 'end' })
                        }
                      }, 350)
                    }
                  } else {
                    onNavigate()
                  }
                }}
                title={collapsed ? t(n.label) : undefined}
                className={`w-full flex items-center py-2 rounded-lg text-[0.84375rem] font-medium transition-all duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] cursor-pointer ${
                  collapsed ? 'justify-center px-0' : 'gap-3 px-3'
                } ${
                  groupActive ? 'bg-ivory text-maroon-800 font-semibold' : 'text-cream/85 hover:bg-white/10'
                }`}
              >
                <Icon size={collapsed ? 16 : 18} className="shrink-0" />
                <span className={`text-left transition-all duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] ${labelClass}`}>{t(n.label)}</span>
                <span className={`shrink-0 transition-all duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] ${collapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>
                  {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </span>
              </NavLink>
              <div className={`transition-all duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] overflow-hidden ${isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="mt-0.5 mb-1 ml-3 pl-3 border-l border-white/15 space-y-0.5">
                  {n.children.map((c) => (
                    <NavLink key={c.to} to={c.to} onClick={onNavigate}
                      className={({ isActive }) =>
                        `flex items-center gap-2 pl-3 pr-2 py-2 rounded-lg text-[0.8125rem] transition-all duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] ${
                          isActive ? 'bg-maroon-900/70 text-gold-200 font-semibold border-l-2 border-gold-400 -ml-[0.8125rem] pl-[1.5rem]' : 'text-cream/70 hover:text-cream hover:bg-white/5'
                        }`
                      }
                    >
                      <span className="w-1 h-1 rounded-full bg-current opacity-60 shrink-0" />
                      <span className="min-w-0 break-words leading-snug">{t(c.label)}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            </div>
          )
        }

        return (
          <NavLink key={n.to} to={n.to} end={n.end} onClick={() => { setOpenGroup(null); onNavigate() }} title={collapsed ? t(n.label) : undefined}
            className={({ isActive }) =>
              `w-full flex items-center py-2 rounded-lg text-[0.84375rem] font-medium transition-all duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] ${
                collapsed ? 'justify-center px-0' : 'gap-3 px-3'
              } ${
                isActive ? 'bg-ivory text-maroon-800 font-semibold' : 'text-cream/85 hover:bg-white/10'
              }`
            }
          >
            <Icon size={collapsed ? 16 : 18} className="shrink-0" />
            <span className={`transition-all duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] ${labelClass}`}>{t(n.label)}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}

export default function AdminLayout() {
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [marqueePaused, setMarqueePaused] = useState(false)
  const { user, logout } = useAuth()
  const { t, lang, setLang } = useLang()
  const navigate = useNavigate()
  const liveTime = useLiveClock() // Live clock that updates every second
  const name = personName(user, lang) || tr('Administrator')
  const role = user?.role || 'Admin'
  const roleLabel = tr(role === 'Admin' ? 'Administrator' : role)
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  const signOut = () => { logout(); navigate('/staff-login') }

  return (
    <div className="h-screen h-dvh bg-cream flex overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 shrink-0 bg-gradient-to-b from-maroon-800 to-maroon-900 text-cream flex flex-col overflow-x-hidden transition-all duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] ${open ? 'translate-x-0 w-60' : '-translate-x-full lg:translate-x-0'} ${collapsed ? 'lg:w-[2.75rem]' : 'w-60'}`}>
        {/* Logo Section */}
        <div className={`border-b border-white/10 relative text-center transition-all duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] ${collapsed ? 'py-2 px-0' : 'px-5 pt-4 pb-4'}`}>
          {/* Toggle button - when expanded */}
          {!collapsed && (
            <button
              onClick={() => { setOpen(false); setCollapsed(true) }}
              className="hidden lg:flex absolute top-3 right-3 items-center justify-center bg-gold-400 text-maroon-800 hover:bg-gold-300 shadow-md transition-all duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] rounded w-8 h-8"
              title={tr("Collapse sidebar")}
              aria-label={tr("Collapse sidebar")}>
              <Menu size={16} />
            </button>
          )}
          {/* Toggle button - when collapsed */}
          {collapsed && (
            <button
              onClick={() => { setOpen(false); setCollapsed(false) }}
              className="hidden lg:flex mx-auto items-center justify-center bg-gold-400 text-maroon-800 hover:bg-gold-300 shadow-md transition-all duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] rounded w-7 h-7 mb-1"
              title={tr("Expand sidebar")}
              aria-label={tr("Expand sidebar")}>
              <Menu size={14} />
            </button>
          )}
          {/* Logo - always centered */}
          <img
            src="/images/temple-logo.png"
            alt="Shri Shirdi Sai Baba Temple"
            className={`drop-shadow-md rounded-full bg-white object-contain mx-auto transition-all duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] ${collapsed ? 'w-7 h-7 p-0.5' : 'w-20 h-20 p-1'}`}
          />
          {/* Temple name - hidden when collapsed */}
          <div className={`transition-all duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] overflow-hidden ${collapsed ? 'max-h-0 opacity-0 mt-0' : 'max-h-24 opacity-100 mt-1'}`}>
            <div className="font-serif font-bold text-gold-200 text-[0.9375rem] leading-tight"><T>Shri Shirdi Sai Baba Temple</T></div>
            <div className="text-[0.65625rem] text-cream/55 leading-tight mt-1"><T>Dwarkapuri Colony, Punjagutta,</T><br /><T>Hyderabad, Telangana</T></div>
          </div>
        </div>

        <SidebarNav onNavigate={() => setOpen(false)} collapsed={collapsed} />

        {/* Footer - hidden when collapsed */}
        <div className={`border-t border-white/10 text-center transition-all duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] overflow-hidden ${collapsed ? 'max-h-0 py-0 opacity-0' : 'max-h-16 py-3 px-3 opacity-100'}`}>
          <div className="marquee-container" onClick={() => setMarqueePaused(true)} onMouseLeave={() => setMarqueePaused(false)}>
            <div className={`marquee-text font-script text-gold-200 text-xl leading-tight ${marqueePaused ? 'paused' : ''}`}>
              {tr('Sab Ka Malik Ek Hai')}
            </div>
          </div>
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setOpen(false)} role="button" aria-label="Close navigation menu" tabIndex={0} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)} />}

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="h-[4.25rem] min-h-[4.25rem] shrink-0 bg-gradient-to-b from-maroon-800 to-maroon-900 border-t border-b border-[#D4AF37] flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30" style={{ boxShadow: '0 2px 8px rgba(74, 5, 21, 0.15)' }}>
          {/* Left: Menu + Temple Name */}
          <div className="flex items-center gap-2">
            <button className="lg:hidden text-[#E5B94F] hover:text-[#FFF1C7] focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:ring-offset-1 focus:ring-offset-[#5A071A] rounded p-1" title={tr("Menu")} aria-label={tr("Open navigation menu")}
              onClick={() => setOpen((o) => !o)}><Menu size={22} /></button>
            <span className="font-serif font-bold text-gold-100 text-[1.375rem] whitespace-nowrap lg:ml-2"><T>Shri Shirdi Sai Baba Temple</T></span>
          </div>

          {/* Right: All controls */}
          <div className="flex items-center gap-2 lg:gap-4">
            <button onClick={() => navigate('/admin/calendar')} title={tr("Open Calendar")} className="hidden md:flex items-center gap-1.5 text-[0.875rem] text-[#FFF1C7] whitespace-nowrap hover:text-white hover:bg-white/10 rounded-lg px-2 py-1 -mx-2 transition-all duration-300 cursor-pointer"><Calendar size={15} className="text-[#E5B94F]" /> {todayLabel()}</button>
            <span className="hidden lg:flex items-center gap-1.5 text-[0.875rem] text-[#FFF1C7] whitespace-nowrap tabular-nums"><Clock size={15} className="text-[#E5B94F]" /> {liveTime}</span>
            <div className="inline-flex items-center rounded-full border border-[#D4AF37] overflow-hidden text-[0.6875rem] font-bold" role="group" aria-label="Language selection">
              <button onClick={() => setLang('en')} title="English" aria-label="Switch to English" aria-pressed={lang === 'en'} className={`px-2 py-1 outline-none transition-none ${lang === 'en' ? 'bg-[#D4AF37] text-[#4A0515]' : 'text-[#FFF1C7] hover:bg-white/10 active:bg-[#D4AF37] active:text-[#4A0515]'}`}>EN</button>
              <button onClick={() => setLang('te')} title="తెలుగు" aria-label="Switch to Telugu" aria-pressed={lang === 'te'} className={`px-2 py-1 font-telugu outline-none transition-none ${lang === 'te' ? 'bg-[#D4AF37] text-[#4A0515]' : 'text-[#FFF1C7] hover:bg-white/10 active:bg-[#D4AF37] active:text-[#4A0515]'}`}>తెలుగు</button>
            </div>
            <button onClick={() => navigate('/admin/notifications')} title={tr("Notifications")} aria-label={tr("Notifications")} className="text-[#E5B94F] hover:text-[#FFF1C7] focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:ring-offset-1 focus:ring-offset-[#5A071A] rounded-full p-1">
              <Bell size={18} />
            </button>
            <FontSizeToggle />
            <div className="flex items-center gap-2 pl-2 lg:pl-3 border-l border-[#D4AF37]/30">
              <div className="w-9 h-9 rounded-full bg-[#D4AF37] text-[#4A0515] grid place-items-center text-xs font-bold shadow-sm">{initials}</div>
              <div className="hidden md:block text-right leading-tight">
                <div className="text-[0.875rem] font-bold text-[#FFF1C7] whitespace-nowrap">{name}</div>
                <div className="text-[0.75rem] text-[#E8D9B5] whitespace-nowrap">{t(roleLabel)}</div>
              </div>
              <button onClick={signOut} title={tr("Sign out")} aria-label={tr("Sign out")} className="text-[#FFF1C7] hover:text-white focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:ring-offset-1 focus:ring-offset-[#5A071A] rounded p-1"><LogOut size={16} /></button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 lg:px-6 pt-2 lg:pt-3 pb-[max(2.5rem,env(safe-area-inset-bottom))] max-w-[100rem] w-full mx-auto">
          <Outlet context={{ role }} />
        </main>
      </div>

      <ChangePasswordModal />
    </div>
  )
}
