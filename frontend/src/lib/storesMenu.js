// Stores & Inventory menu — ONE definition for every role, in the order the work happens:
// receive → keep in the store → sell → check & close → report → set up.
// Used by the sidebar (AdminLayout: the Stores Officer's flat menu and the "Stores & Inventory"
// group for everyone else) and by the tab bar on the merged screens (StoresTabs).
//
// An entry with `tabs` is ONE menu line for several screens shown as tabs on one page.
// Each tab keeps its own route, so links, bookmarks and access rules are unchanged; the menu
// line opens the first tab the user may see and is highlighted on any of them.
import {
  LayoutDashboard, Boxes, Tag, Droplets, FilePlus2, Store, ClipboardCheck, History, MapPin,
  CalendarCheck, ArrowRightLeft, FileBarChart,
} from 'lucide-react'
import { canAccessKey, keyOf } from '../auth/access.js'

// Tab groups: [route, label]. Labels are English keys, translated where they are shown.
export const STORES_TABS = {
  sales: [
    ['/admin/stores/unsold', 'Unsold Items'],
    ['/admin/stores/open-sale', 'Open Sale'],
  ],
  check: [
    ['/admin/stores/check', 'Stock Check'],
    ['/admin/stores/missing', 'Missing Items'],
  ],
  reports: [
    ['/admin/stores/report', 'Stock Report'],
  ],
}

export const STORES_SECTIONS = [
  { items: [{ to: '/admin/stores/overview', label: 'Stores Overview', icon: LayoutDashboard }] },
  { heading: 'Receive', items: [
    { to: '/admin/stores/pending', label: 'Receive & Tag', icon: Tag },
    { to: '/admin/stores/manual', label: 'Manual Entries', icon: FilePlus2 },
  ] },
  { heading: 'In the Store', items: [
    { to: '/admin/stores/register', label: 'Stock Register', icon: Boxes },
    { to: '/admin/stores/consumables', label: 'Consumables Stock', icon: Droplets },
    { to: '/admin/stores/issue', label: 'Issue & Return', icon: ArrowRightLeft },
  ] },
  { heading: 'Sales', items: [
    { tabs: 'sales', label: 'Sales from Stock', icon: Store },
  ] },
  { heading: 'Reports', items: [
    { tabs: 'reports', label: 'Stock Reports', icon: FileBarChart },
    { to: '/admin/stores/item', label: 'Item Tracker', icon: History },
  ] },
  { heading: 'Setup', items: [
    { to: '/admin/stores/locations', label: 'Store Locations', icon: MapPin },
  ] },
  // Check & Close last (client request 2026-11-12)
  { heading: 'Check & Close', items: [
    { tabs: 'check', label: 'Stock Check', icon: ClipboardCheck },
    { to: '/admin/stores/day-closing', label: 'Stores Day Closing', icon: CalendarCheck },
  ] },
]

// The tabs of a group this user may open.
export const visibleTabs = (user, group) => (STORES_TABS[group] || []).filter(([to]) => canAccessKey(user, keyOf(to)))

// The sections as this user sees them: entries they may open, each with a resolved `to`
// (a tab entry opens its first visible tab) and `match` (every route it stands for).
// Sections left empty are dropped.
export function storesSectionsFor(user) {
  return STORES_SECTIONS.map((sec) => ({
    ...sec,
    items: sec.items.map((it) => {
      if (!it.tabs) return canAccessKey(user, keyOf(it.to)) ? { ...it, match: [it.to] } : null
      const tabs = visibleTabs(user, it.tabs)
      return tabs.length ? { ...it, to: tabs[0][0], match: tabs.map(([to]) => to) } : null
    }).filter(Boolean),
  })).filter((sec) => sec.items.length)
}

// Is this menu entry the current page? (a tab entry: any of its tabs; deep links like
// /admin/stores/item/PAN-00042 count for their screen)
export const entryActive = (entry, pathname) =>
  entry.match.some((to) => pathname === to || pathname.startsWith(to + '/'))
