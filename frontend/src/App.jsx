import React, { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'

import PublicLayout from './components/public/PublicLayout.jsx'
import AdminLayout from './components/admin/AdminLayout.jsx'
import { RequireAuth, useAuth } from './auth/AuthContext.jsx'
import { canAccessKey } from './auth/access.js'
import { LanguageProvider } from './i18n/LanguageContext.jsx'
import { SiteProvider } from './lib/SiteContext.jsx'
import { DialogHost } from './components/common/Dialog.jsx'

// Public pages
import Home from './pages/public/Home.jsx'
import About from './pages/public/About.jsx'
import History from './pages/public/History.jsx'
import Festivals from './pages/public/Festivals.jsx'
import Gallery from './pages/public/Gallery.jsx'
import Contact from './pages/public/Contact.jsx'
import Sevas from './pages/public/Sevas.jsx'
import Donations from './pages/public/Donations.jsx'
import Hundi from './pages/public/Hundi.jsx'
import Auction from './pages/public/Auction.jsx'
import Annadanam from './pages/public/Annadanam.jsx'
import Timings from './pages/public/Timings.jsx'

// Admin pages
import StaffLogin from './pages/admin/StaffLogin.jsx'
import Dashboard from './pages/admin/Dashboard.jsx'
import AdminBookings from './pages/admin/Bookings.jsx'
import NewBooking from './pages/admin/NewBooking.jsx'
import PoojaMaster from './pages/admin/PoojaMaster.jsx'
import PoojariSchedule from './pages/admin/PoojariSchedule.jsx'
import PoojaHistory from './pages/admin/PoojaHistory.jsx'
import PoojaHistoryDetails from './pages/admin/PoojaHistoryDetails.jsx'
import BookingDetails from './pages/admin/BookingDetails.jsx'
import WasteSales from './pages/admin/WasteSales.jsx'
import DonationMaster from './pages/admin/DonationMaster.jsx'
import Settings from './pages/admin/Settings.jsx'
import AdminCalendar from './pages/admin/Calendar.jsx'
import AdminDevotees from './pages/admin/Devotees.jsx'
import DevoteeDetails from './pages/admin/DevoteeDetails.jsx'
import AdminDonations from './pages/admin/Donations.jsx'
import AdminHundi from './pages/admin/Hundi.jsx'
import AdminAuction from './pages/admin/Auction.jsx'
import AdminAnnadanam from './pages/admin/Annadanam.jsx'
import Counter from './pages/admin/Counter.jsx'
import PoojariQueue from './pages/admin/PoojariQueue.jsx'
import VerifyTicket from './pages/admin/VerifyTicket.jsx'
import Users from './pages/admin/Users.jsx'
import RoleAccess from './pages/admin/RoleAccess.jsx'
import PoojariMaster from './pages/admin/PoojariMaster.jsx'
import VendorMaster from './pages/admin/VendorMaster.jsx'
import AuctionItemMaster from './pages/admin/AuctionItemMaster.jsx'
import HundiItemMaster from './pages/admin/HundiItemMaster.jsx'
import CommitteeMaster from './pages/admin/CommitteeMaster.jsx'
import FestivalMaster from './pages/admin/FestivalMaster.jsx'
import Reports from './pages/admin/Reports.jsx'
import AuditTrail from './pages/admin/AuditTrail.jsx'
import DailyClosing from './pages/admin/DailyClosing.jsx'
import BackupRestore from './pages/admin/BackupRestore.jsx'
import Notifications from './pages/admin/Notifications.jsx'

// Per-route module guard. RequireAuth (on the parent) has already ensured a user
// exists; this sends a signed-in staff member who lacks the screen's module back
// to their landing screen instead of rendering a page whose every API call would 403.
function Guard({ k, children }) {
  const { user } = useAuth()
  if (!canAccessKey(user, k)) return <Navigate to="/admin" replace />
  return children
}

// Landing screen for /admin. The money dashboard is meaningless to a Poojari, so
// they land on their pooja queue instead; everyone else gets the dashboard.
function AdminHome() {
  const { user } = useAuth()
  if (user?.role === 'Poojari') return <Navigate to="/admin/my-poojas" replace />
  return <Dashboard />
}

// Scroll to the top of the page on every route change so a new page always
// opens from the top (previous scroll position is not preserved).
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [pathname])
  return null
}

export default function App() {
  return (
    <SiteProvider>
    <DialogHost />
    <ScrollToTop />
    <Routes>
      {/* Public informational website */}
      <Route element={<LanguageProvider><PublicLayout /></LanguageProvider>}>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/history" element={<History />} />
        <Route path="/festivals" element={<Festivals />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/sevas" element={<Sevas />} />
        <Route path="/donations" element={<Donations />} />
        <Route path="/hundi" element={<Hundi />} />
        <Route path="/auction" element={<Auction />} />
        <Route path="/annadanam" element={<Annadanam />} />
        <Route path="/timings" element={<Timings />} />
      </Route>

      {/* Staff login (standalone) */}
      <Route path="/staff-login" element={<StaffLogin />} />

      {/* Admin / counter back-office */}
      <Route path="/admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
        <Route index element={<AdminHome />} />
        <Route path="my-poojas" element={<Guard k="my-poojas"><PoojariQueue /></Guard>} />
        <Route path="verify-ticket" element={<Guard k="verify-ticket"><VerifyTicket /></Guard>} />
        <Route path="bookings" element={<Guard k="bookings"><AdminBookings /></Guard>} />
        <Route path="bookings/new" element={<Guard k="bookings"><NewBooking /></Guard>} />
        <Route path="bookings/:id" element={<Guard k="bookings"><BookingDetails /></Guard>} />
        <Route path="pooja-master" element={<Guard k="pooja-master"><PoojaMaster /></Guard>} />
        <Route path="poojari-schedule" element={<Guard k="poojari-schedule"><PoojariSchedule /></Guard>} />
        <Route path="poojari-master" element={<Guard k="poojari-master"><PoojariMaster /></Guard>} />
        <Route path="pooja-history" element={<Guard k="pooja-history"><PoojaHistory /></Guard>} />
        <Route path="pooja-history/:id" element={<Guard k="pooja-history"><PoojaHistoryDetails /></Guard>} />
        <Route path="waste-sales" element={<Guard k="waste-sales"><WasteSales /></Guard>} />
        <Route path="vendors" element={<Guard k="vendors"><VendorMaster /></Guard>} />
        <Route path="auction-items" element={<Guard k="auction-items"><AuctionItemMaster /></Guard>} />
        <Route path="hundi-items" element={<Guard k="hundi-items"><HundiItemMaster /></Guard>} />
        <Route path="committee" element={<Guard k="committee"><CommitteeMaster /></Guard>} />
        <Route path="festivals" element={<Guard k="festivals"><FestivalMaster /></Guard>} />
        <Route path="settings" element={<Guard k="settings"><Settings /></Guard>} />
        <Route path="calendar" element={<Guard k="calendar"><AdminCalendar /></Guard>} />
        <Route path="devotees" element={<Guard k="devotees"><AdminDevotees /></Guard>} />
        <Route path="devotees/:id" element={<Guard k="devotees"><DevoteeDetails /></Guard>} />
        <Route path="donations" element={<Guard k="donations"><AdminDonations /></Guard>} />
        <Route path="donation-master" element={<Guard k="donation-master"><DonationMaster /></Guard>} />
        <Route path="hundi" element={<Guard k="hundi"><AdminHundi /></Guard>} />
        <Route path="auction" element={<Guard k="auction"><AdminAuction /></Guard>} />
        <Route path="annadanam" element={<Guard k="annadanam"><AdminAnnadanam /></Guard>} />
        <Route path="counter" element={<Guard k="counter"><Counter /></Guard>} />
        <Route path="users" element={<Guard k="users"><Users /></Guard>} />
        <Route path="roles" element={<Guard k="roles"><RoleAccess /></Guard>} />
        <Route path="reports" element={<Guard k="reports"><Reports /></Guard>} />
        <Route path="audit" element={<Guard k="audit"><AuditTrail /></Guard>} />
        <Route path="daily-closing" element={<Guard k="daily-closing"><DailyClosing /></Guard>} />
        <Route path="backup" element={<Guard k="backup"><BackupRestore /></Guard>} />
        <Route path="notifications" element={<Notifications />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </SiteProvider>
  )
}
