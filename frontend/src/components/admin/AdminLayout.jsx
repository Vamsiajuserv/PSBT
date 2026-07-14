import React, { useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users as UsersIcon, Flame, HandHeart, Landmark, Gavel,
  UtensilsCrossed, Recycle, FileBarChart, ShieldCheck, Settings as SettingsIcon,
  Menu, LogOut, Bell, Calendar, Clock, ChevronDown, ChevronRight, KeyRound, Wallet,
} from 'lucide-react'
import { useAuth } from '../../auth/AuthContext.jsx'

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/devotees', label: 'Devotee Management', icon: UsersIcon },
  {
    label: 'Pooja Management', icon: Flame,
    children: [
      { to: '/admin/bookings', label: 'Bookings' },
      { to: '/admin/pooja-master', label: 'Pooja Master' },
      { to: '/admin/poojari-schedule', label: 'Poojari Schedule' },
      { to: '/admin/poojari-master', label: 'Poojari Master' },
      { to: '/admin/pooja-history', label: 'Pooja History' },
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
  { to: '/admin/daily-closing', label: 'Daily Closing', icon: Wallet, chevron: true },
  { to: '/admin/users', label: 'User Management', icon: ShieldCheck, chevron: true },
  { to: '/admin/roles', label: 'Role & Access Management', icon: KeyRound, chevron: true },
  {
    label: 'Settings', icon: SettingsIcon,
    children: [
      { to: '/admin/settings', label: 'System Settings' },
      { to: '/admin/committee', label: 'Committee Member Master' },
      { to: '/admin/festivals', label: 'Festival Master' },
      { to: '/admin/notifications', label: 'Notifications' },
      { to: '/admin/audit', label: 'Audit Trail' },
      { to: '/admin/backup', label: 'Backup & Restore' },
    ],
  },
]

const todayLabel = () => new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' })
const timeLabel = () => new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

function GopuraMark() {
  return (
    <div className="w-16 h-16 mx-auto grid place-items-center text-gold-300">
      <svg viewBox="0 0 64 64" className="w-12 h-12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
        <path d="M32 4 36 12H28z" fill="currentColor" />
        <path d="M22 20l10-8 10 8v4H22z" />
        <path d="M18 30l14-8 14 8v4H18z" />
        <path d="M14 42l18-10 18 10v4H14z" />
        <path d="M16 46h32v14H16z" />
        <path d="M28 60V50a4 4 0 018 0v10" />
      </svg>
    </div>
  )
}

function SidebarNav({ onNavigate }) {
  const location = useLocation()
  const activeGroup = NAV.find((n) => n.children?.some((c) => location.pathname.startsWith(c.to)))
  const [open, setOpen] = useState(activeGroup ? { [activeGroup.label]: true } : {})

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
      {NAV.map((n) => {
        const Icon = n.icon
        if (n.children) {
          const groupActive = n.children.some((c) => location.pathname.startsWith(c.to))
          const isOpen = open[n.label] ?? groupActive
          return (
            <div key={n.label}>
              <button
                onClick={() => setOpen((o) => ({ ...o, [n.label]: !isOpen }))}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium transition-colors ${
                  groupActive ? 'bg-ivory text-maroon-800 font-semibold' : 'text-cream/85 hover:bg-white/10'
                }`}
              >
                <Icon size={18} /> <span className="flex-1 text-left">{n.label}</span>
                {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </button>
              {isOpen && (
                <div className="mt-0.5 mb-1 ml-3 pl-3 border-l border-white/15 space-y-0.5">
                  {n.children.map((c) => (
                    <NavLink key={c.to} to={c.to} onClick={onNavigate}
                      className={({ isActive }) =>
                        `flex items-center gap-2 pl-3 pr-2 py-2 rounded-lg text-[13px] transition-colors ${
                          isActive ? 'bg-maroon-900/70 text-gold-200 font-semibold border-l-2 border-gold-400 -ml-[13px] pl-[24px]' : 'text-cream/70 hover:text-cream hover:bg-white/5'
                        }`
                      }
                    >
                      <span className="w-1 h-1 rounded-full bg-current opacity-60" /> {c.label}
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
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium transition-colors ${
                isActive ? 'bg-ivory text-maroon-800 font-semibold' : 'text-cream/85 hover:bg-white/10'
              }`
            }
          >
            <Icon size={18} /> <span className="flex-1">{n.label}</span>
            {n.chevron && <ChevronRight size={15} className="opacity-55" />}
          </NavLink>
        )
      })}
    </nav>
  )
}

export default function AdminLayout() {
  const [open, setOpen] = useState(false)
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const name = user?.name || 'Administrator'
  const role = user?.role || 'Admin'
  const roleLabel = role === 'Admin' ? 'Administrator' : role
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  const signOut = () => { logout(); navigate('/') }

  return (
    <div className="min-h-screen bg-cream flex">
      {/* ── Sidebar ── */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 shrink-0 bg-gradient-to-b from-maroon-800 to-maroon-900 text-cream flex flex-col transition-transform ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="px-5 pt-5 pb-4 text-center border-b border-white/10">
          <GopuraMark />
          <div className="font-serif font-bold text-gold-200 text-[15px] leading-tight mt-1">Sri Shirdi Sai Baba Temple</div>
          <div className="text-[10.5px] text-cream/55 leading-tight mt-1">Dwarkapuri Colony, Punjagutta,<br />Hyderabad, Telangana</div>
        </div>

        <SidebarNav onNavigate={() => setOpen(false)} />

        <div className="px-3 pb-3">
          <div className="rounded-xl bg-[#3a0909] border-2 border-gold-500/50 py-4 text-center shadow-inner ring-1 ring-inset ring-gold-400/15">
            <div className="text-gold-300 text-2xl leading-none font-telugu">ॐ</div>
            <div className="font-display text-[15px] tracking-[0.25em] text-gold-300 mt-1.5">Om Sai Ram</div>
          </div>
          <div className="text-[10px] text-cream/40 text-center mt-3 leading-tight">© 2026 Sri Shirdi Sai Baba Temple.<br />All rights reserved.</div>
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setOpen(false)} />}

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button className="text-gray-500 hover:text-maroon-700" onClick={() => setOpen(!open)}><Menu size={22} /></button>
            <span className="font-serif font-bold text-maroon-800 text-lg hidden sm:block">Sri Shirdi Sai Baba Temple</span>
          </div>

          <div className="flex items-center gap-4 lg:gap-5">
            <span className="hidden md:flex items-center gap-2 text-[13px] text-gray-600"><Calendar size={15} className="text-gray-400" /> {todayLabel()}</span>
            <span className="hidden md:flex items-center gap-2 text-[13px] text-gray-600"><Clock size={15} className="text-gray-400" /> {timeLabel()}</span>
            <button className="relative text-gray-500 hover:text-maroon-700">
              <Bell size={20} />
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 grid place-items-center">5</span>
            </button>
            <div className="flex items-center gap-2.5 pl-4 border-l border-gray-200">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 text-white grid place-items-center text-sm font-bold">{initials}</div>
              <div className="hidden sm:block leading-tight">
                <div className="text-[13px] font-bold text-gray-800">{name}</div>
                <div className="text-[11px] text-gray-400">{roleLabel}</div>
              </div>
              <button onClick={signOut} title="Sign out" className="text-gray-400 hover:text-maroon-700 ml-1"><LogOut size={16} /></button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 max-w-[1600px] w-full mx-auto">
          <Outlet context={{ role }} />
        </main>
      </div>
    </div>
  )
}
