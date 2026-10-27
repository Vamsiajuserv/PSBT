import React, { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users as UsersIcon, Flame, HandHeart, Landmark, Gavel,
  Recycle, FileBarChart, ShieldCheck, Settings as SettingsIcon,
  Menu, LogOut, Bell, Calendar, Clock, ChevronDown, ChevronRight, ChevronLeft, KeyRound, Wallet,
  Receipt, ClipboardList, ScanLine, TrendingUp, Boxes,
  Tag, Droplets, FilePlus2, Undo2, Store, ClipboardCheck, History, MapPin, CalendarCheck, ArrowRightLeft, SearchX,
  ShoppingCart, PackageOpen, UserCheck, Coins,
} from 'lucide-react'
import { useAuth } from '../../auth/AuthContext.jsx'
import { canAccessKey, keyOf } from '../../auth/access.js'
import { useLang, T, tr, clock12, personName, initialsOf, getLang } from '../../i18n/LanguageContext.jsx'
import { getFontScale, setFontScale } from '../../lib/fontScale.js'
import ChangePasswordModal from './ChangePasswordModal.jsx'
import { StoresAPI } from '../../api/client.js'

// Stores & Inventory badges: donations / custodies still waiting for ID tagging, and pieces
// that came back unsold. Refreshed on every page change and whenever stock changes
// ('stores:changed'), so neither can be forgotten.
const PENDING_TO = '/admin/stores/pending'
const UNSOLD_TO = '/admin/stores/unsold'
const OPEN_SALE_TO = '/admin/stores/open-sale'
const REGISTER_TO = '/admin/stores/register'   // badge: pieces tagged but not yet placed
const ISSUE_TO = '/admin/stores/issue'         // red badge: issued pieces past their return date
const MISSING_TO = '/admin/stores/missing'     // red badge: open missing cases
const CONSUMABLES_TO = '/admin/stores/consumables'   // red badge: batches expiring within 7 days (or expired)
const PURCHASE_TO = '/admin/stores/purchase'   // badge: purchase requests waiting for approval
const RED_BADGES = new Set([ISSUE_TO, MISSING_TO, CONSUMABLES_TO])
function useStoresBadges(user, pathname) {
  const [counts, setCounts] = useState({})
  const allowed = canAccessKey(user, keyOf(PENDING_TO))
  useEffect(() => {
    if (!allowed) return undefined
    let alive = true
    const load = () => Promise.all([StoresAPI.pendingCount().catch(() => null), StoresAPI.unsoldCount().catch(() => null),
      StoresAPI.openSaleCount().catch(() => null), StoresAPI.awaitingCount().catch(() => null),
      StoresAPI.issueCount().catch(() => null), StoresAPI.missingCount().catch(() => null),
      StoresAPI.expiryCount().catch(() => null), StoresAPI.purchaseCount().catch(() => null)])
      .then(([p, u, o, a, i, m, e, pr]) => alive && setCounts({ [PENDING_TO]: p?.total || 0, shortages: p?.shortages || 0, [UNSOLD_TO]: u?.total || 0, [OPEN_SALE_TO]: o?.total || 0,
        [REGISTER_TO]: a?.total || 0, [ISSUE_TO]: i?.overdue || 0, [MISSING_TO]: m?.total || 0,
        [CONSUMABLES_TO]: e?.total || 0, [PURCHASE_TO]: pr?.waiting || 0 }))
    load()
    window.addEventListener('stores:changed', load)
    return () => { alive = false; window.removeEventListener('stores:changed', load) }
  }, [allowed, pathname])
  return allowed ? counts : {}
}
// Pending Tagging turns red while a receive shortage is open
const isRed = (to, counts) => RED_BADGES.has(to) || (to === PENDING_TO && counts.shortages > 0)
const badgeTitle = (to, t, counts = {}) => (to === PENDING_TO && counts.shortages > 0 ? `${counts.shortages} ${t('shortage(s) open')}` : to === UNSOLD_TO ? t('Unsold pieces in store') : to === OPEN_SALE_TO ? t('Pieces on Open Sale')
  : to === REGISTER_TO ? t('Tagged pieces awaiting placement') : to === ISSUE_TO ? t('Issued pieces past their return date')
  : to === MISSING_TO ? t('Missing pieces to follow up') : to === CONSUMABLES_TO ? t('Batches expiring within 7 days')
  : to === PURCHASE_TO ? t('Purchase requests waiting for approval') : t('Waiting to be tagged'))
const Badge = ({ n, title, red }) => (n > 0
  ? <span title={title} className={`shrink-0 min-w-[1.25rem] h-5 px-1.5 rounded-full text-[0.6875rem] font-bold grid place-items-center ${red ? 'bg-red-500 text-white' : 'bg-gold-400 text-maroon-900'}`}>{n}</span>
  : null)

// Stores Officer: Stores & Inventory only, as a flat menu under small headings —
// everything one click away, nothing to expand. Other roles keep NAV below.
const STORES_OFFICER_NAV = [
  { items: [{ to: '/admin/stores/overview', label: tr('Stores Overview'), icon: LayoutDashboard }] },
  { heading: tr('Daily Work'), items: [
    { to: '/admin/stores/register', label: tr('Stock Register'), icon: Boxes },
    { to: '/admin/stores/pending', label: tr('Pending Tagging'), icon: Tag },
    { to: '/admin/stores/issue', label: tr('Issue & Return'), icon: ArrowRightLeft },
    { to: '/admin/stores/kits', label: tr('Festival Kits'), icon: PackageOpen },
    { to: '/admin/stores/consumables', label: tr('Consumables Stock'), icon: Droplets },
    { to: '/admin/stores/purchase', label: tr('Purchase Requests'), icon: ShoppingCart },
    { to: '/admin/stores/manual', label: tr('Manual Entries'), icon: FilePlus2 },
  ] },
  { heading: tr('Sales'), items: [
    { to: '/admin/stores/unsold', label: tr('Unsold Items'), icon: Undo2 },
    { to: '/admin/stores/open-sale', label: tr('Open Sale'), icon: Store },
  ] },
  { heading: tr('Control'), items: [
    { to: '/admin/stores/day-closing', label: tr('Stores Day Closing'), icon: CalendarCheck },
    { to: '/admin/stores/check', label: tr('Stock Check'), icon: ClipboardCheck },
    { to: '/admin/stores/missing', label: tr('Missing Items'), icon: SearchX },
    { to: '/admin/stores/handover', label: tr('Handover'), icon: UserCheck },
    { to: '/admin/stores/report', label: tr('Stock Report'), icon: FileBarChart },
    { to: '/admin/stores/valuables', label: tr('Valuables Statement'), icon: Coins },
    { to: '/admin/stores/item', label: tr('Item History'), icon: History },
    { to: '/admin/stores/locations', label: tr('Store Locations'), icon: MapPin },
  ] },
]

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
      { to: '/admin/almanac', label: tr('Pournami & Festivals') },
    ],
  },
  {
    label: tr('Donation Management'), icon: HandHeart,
    children: [
      { to: '/admin/donations', label: tr('Donations') },
      { to: '/admin/donation-master', label: tr('Donation Master') },
      { to: '/admin/metal-rates', label: tr('Gold & Silver Rate') },
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
  {
    label: tr('Stores & Inventory'), icon: Boxes,
    children: [
      { to: '/admin/stores/register', label: tr('Stock Register') },
      { to: '/admin/stores/pending', label: tr('Pending Tagging') },
      { to: '/admin/stores/issue', label: tr('Issue & Return') },
      { to: '/admin/stores/kits', label: tr('Festival Kits') },
      { to: '/admin/stores/unsold', label: tr('Unsold Items') },
      { to: '/admin/stores/open-sale', label: tr('Open Sale') },
      { to: '/admin/stores/consumables', label: tr('Consumables Stock') },
      { to: '/admin/stores/purchase', label: tr('Purchase Requests') },
      { to: '/admin/stores/manual', label: tr('Manual Entries') },
      { to: '/admin/stores/item', label: tr('Item History') },
      { to: '/admin/stores/report', label: tr('Stock Report') },
      { to: '/admin/stores/valuables', label: tr('Valuables Statement') },
      { to: '/admin/stores/check', label: tr('Stock Check') },
      { to: '/admin/stores/missing', label: tr('Missing Items') },
      { to: '/admin/stores/handover', label: tr('Handover') },
      { to: '/admin/stores/day-closing', label: tr('Stores Day Closing') },
      { to: '/admin/stores/locations', label: tr('Store Locations') },
    ],
  },
  {
    label: tr('Other Material Sales'), icon: Recycle,
    children: [
      { to: '/admin/waste-sales', label: tr('Other Sales') },
      { to: '/admin/vendors', label: tr('Vendor Master') },
      { to: '/admin/waste-materials', label: tr('Other Material Master') },
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
      {btn('small', <span className="text-[0.625rem]">{getLang() === 'te' ? 'అ−' : 'A−'}</span>, 'Smaller text')}
      {btn('normal', <span className="text-[0.8125rem]">{getLang() === 'te' ? 'అ' : 'A'}</span>, 'Default text size')}
      {btn('large', <span className="text-[1rem]">{getLang() === 'te' ? 'అ+' : 'A+'}</span>, 'Larger text')}
    </div>
  )
}

function SidebarNav({ onNavigate, collapsed }) {
  const location = useLocation()
  const { user } = useAuth()
  const { t } = useLang()
  const storesBadges = useStoresBadges(user, location.pathname)
  const badgeFor = (to) => storesBadges[to] || 0

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

  if (user?.role === 'Stores Officer') {
    return (
      <nav className={`flex-1 overflow-y-auto overflow-x-hidden sidebar-scroll py-2 transition-all duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] ${collapsed ? 'px-0' : 'px-3'}`}>
        {STORES_OFFICER_NAV.map((sec, i) => (
          <div key={sec.heading || i} className={i ? 'mt-3' : ''}>
            {sec.heading && (collapsed
              ? <div className="mx-auto my-1 w-5 border-t border-white/15" aria-hidden="true" />
              : <div className="px-3 pb-1 text-[0.65625rem] font-semibold uppercase tracking-wider text-gold-200/70">{t(sec.heading)}</div>)}
            <div className="space-y-0.5">
              {sec.items.filter((n) => canAccessKey(user, keyOf(n.to))).map((n) => {
                const Icon = n.icon
                return (
                  <NavLink key={n.to} to={n.to} onClick={onNavigate} title={collapsed ? t(n.label) : undefined}
                    className={({ isActive }) =>
                      `w-full flex items-center py-2 rounded-lg text-[0.84375rem] font-medium transition-all duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] ${
                        collapsed ? 'justify-center px-0' : 'gap-3 px-3'
                      } ${isActive ? 'bg-ivory text-maroon-800 font-semibold' : 'text-cream/85 hover:bg-white/10'}`}>
                    <Icon size={collapsed ? 16 : 18} className="shrink-0" />
                    <span className={`transition-all duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] ${labelClass}`}>{t(n.label)}</span>
                    {!collapsed && <Badge n={badgeFor(n.to)} title={badgeTitle(n.to, t, storesBadges)} red={isRed(n.to, storesBadges)} />}
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
    )
  }

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
                {!collapsed && !isOpen && <Badge n={n.children.reduce((s, c) => s + badgeFor(c.to), 0)} title={t('Waiting for action')} />}
                <span className={`shrink-0 transition-all duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] ${collapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>
                  {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </span>
              </NavLink>
              <div className={`transition-all duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] overflow-hidden ${isOpen ? 'max-h-[48rem] opacity-100' : 'max-h-0 opacity-0'}`}>
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
                      <span className="min-w-0 flex-1 break-words leading-snug">{t(c.label)}</span>
                      <Badge n={badgeFor(c.to)} title={badgeTitle(c.to, t, storesBadges)} red={isRed(c.to, storesBadges)} />
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
  const initials = lang === 'te' ? initialsOf(personName(user, 'en') || name) : name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

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
            alt={tr("Shri Shirdi Sai Baba Temple")}
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

      {open && <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setOpen(false)} role="button" aria-label={tr("Close navigation menu")} tabIndex={0} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)} />}

      {/* ── Main ── */}
      {/* scrollbar-gutter: the scrollbar's space is always kept, so a page that grows or shrinks
          (switching tabs, paging) never shifts sideways when the scrollbar appears / disappears */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto [scrollbar-gutter:stable]">
        <header className="h-[4.25rem] min-h-[4.25rem] shrink-0 bg-gradient-to-b from-maroon-800 to-maroon-900 border-t border-b border-[#D4AF37] flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30" style={{ boxShadow: '0 2px 8px rgba(74, 5, 21, 0.15)' }}>
          {/* Left: Menu + Temple Name */}
          <div className="flex items-center gap-2">
            <button className="lg:hidden text-[#E5B94F] hover:text-[#FFF1C7] focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:ring-offset-1 focus:ring-offset-[#5A071A] rounded p-1" title={tr("Menu")} aria-label={tr("Open navigation menu")}
              onClick={() => setOpen((o) => !o)}><Menu size={22} /></button>
            <span className="font-serif font-bold text-gold-100 text-[1.375rem] whitespace-nowrap lg:ml-2"><T>Shri Shirdi Sai Baba Temple</T></span>
          </div>

          {/* Right: All controls */}
          <div className="flex items-center gap-2 lg:gap-4">
            {role === 'Stores Officer'
              ? <span className="hidden md:flex items-center gap-1.5 text-[0.875rem] text-[#FFF1C7] whitespace-nowrap"><Calendar size={15} className="text-[#E5B94F]" /> {todayLabel()}</span>
              : <button onClick={() => navigate('/admin/calendar')} title={tr("Open Calendar")} className="hidden md:flex items-center gap-1.5 text-[0.875rem] text-[#FFF1C7] whitespace-nowrap hover:text-white hover:bg-white/10 rounded-lg px-2 py-1 -mx-2 transition-all duration-300 cursor-pointer"><Calendar size={15} className="text-[#E5B94F]" /> {todayLabel()}</button>}
            <span className="hidden lg:flex items-center gap-1.5 text-[0.875rem] text-[#FFF1C7] whitespace-nowrap tabular-nums"><Clock size={15} className="text-[#E5B94F]" /> {liveTime}</span>
            <div className="inline-flex items-center rounded-full border border-[#D4AF37] overflow-hidden text-[0.6875rem] font-bold" role="group" aria-label={tr("Language selection")}>
              <button onClick={() => setLang('en')} title={tr("English")} aria-label={tr("English")} aria-pressed={lang === 'en'} className={`px-2 py-1 outline-none transition-none ${lang === 'en' ? 'bg-[#D4AF37] text-[#4A0515]' : 'text-[#FFF1C7] hover:bg-white/10 active:bg-[#D4AF37] active:text-[#4A0515]'}`}>EN</button>
              <button onClick={() => setLang('te')} title="తెలుగు" aria-label={tr("Switch to Telugu")} aria-pressed={lang === 'te'} className={`px-2 py-1 font-telugu outline-none transition-none ${lang === 'te' ? 'bg-[#D4AF37] text-[#4A0515]' : 'text-[#FFF1C7] hover:bg-white/10 active:bg-[#D4AF37] active:text-[#4A0515]'}`}>తెలుగు</button>
            </div>
            {canAccessKey(user, 'notifications') && <button onClick={() => navigate('/admin/notifications')} title={tr("Notifications")} aria-label={tr("Notifications")} className="text-[#E5B94F] hover:text-[#FFF1C7] focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:ring-offset-1 focus:ring-offset-[#5A071A] rounded-full p-1">
              <Bell size={18} />
            </button>}
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
