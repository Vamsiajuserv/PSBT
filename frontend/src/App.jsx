import React, { useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'

import PublicLayout from './components/public/PublicLayout.jsx'
import AdminLayout from './components/admin/AdminLayout.jsx'
import { RequireAuth, useAuth } from './auth/AuthContext.jsx'
import { canAccessKey } from './auth/access.js'
import { LanguageProvider } from './i18n/LanguageContext.jsx'
import { SiteProvider } from './lib/SiteContext.jsx'
import { DialogHost } from './components/common/Dialog.jsx'

// Loading spinner for lazy-loaded pages
function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-maroon-200 border-t-maroon-700 rounded-full animate-spin" />
        <span className="text-sm text-gray-500">Loading...</span>
      </div>
    </div>
  )
}

// Public pages - lazy loaded
const Home = lazy(() => import('./pages/public/Home.jsx'))
const About = lazy(() => import('./pages/public/About.jsx'))
const History = lazy(() => import('./pages/public/History.jsx'))
const Festivals = lazy(() => import('./pages/public/Festivals.jsx'))
const Gallery = lazy(() => import('./pages/public/Gallery.jsx'))
const Contact = lazy(() => import('./pages/public/Contact.jsx'))
const Sevas = lazy(() => import('./pages/public/Sevas.jsx'))
const Donations = lazy(() => import('./pages/public/Donations.jsx'))
const Hundi = lazy(() => import('./pages/public/Hundi.jsx'))
const Auction = lazy(() => import('./pages/public/Auction.jsx'))
const Annadanam = lazy(() => import('./pages/public/Annadanam.jsx'))
const Timings = lazy(() => import('./pages/public/Timings.jsx'))

// Admin pages - lazy loaded
const StaffLogin = lazy(() => import('./pages/admin/StaffLogin.jsx'))
const Dashboard = lazy(() => import('./pages/admin/Dashboard.jsx'))
const AdminBookings = lazy(() => import('./pages/admin/Bookings.jsx'))
const NewBooking = lazy(() => import('./pages/admin/NewBooking.jsx'))
const PoojaMaster = lazy(() => import('./pages/admin/PoojaMaster.jsx'))
const PoojariSchedule = lazy(() => import('./pages/admin/PoojariSchedule.jsx'))
const PoojaHistory = lazy(() => import('./pages/admin/PoojaHistory.jsx'))
const PoojaHistoryDetails = lazy(() => import('./pages/admin/PoojaHistoryDetails.jsx'))
const BookingDetails = lazy(() => import('./pages/admin/BookingDetails.jsx'))
const WasteSales = lazy(() => import('./pages/admin/WasteSales.jsx'))
const DonationMaster = lazy(() => import('./pages/admin/DonationMaster.jsx'))
const Settings = lazy(() => import('./pages/admin/Settings.jsx'))
const AdminCalendar = lazy(() => import('./pages/admin/Calendar.jsx'))
const AdminDevotees = lazy(() => import('./pages/admin/Devotees.jsx'))
const DevoteeDetails = lazy(() => import('./pages/admin/DevoteeDetails.jsx'))
const AdminDonations = lazy(() => import('./pages/admin/Donations.jsx'))
const AdminHundi = lazy(() => import('./pages/admin/Hundi.jsx'))
const AdminAuction = lazy(() => import('./pages/admin/Auction.jsx'))
const AdminAnnadanam = lazy(() => import('./pages/admin/Annadanam.jsx'))
const Counter = lazy(() => import('./pages/admin/Counter.jsx'))
const PoojariQueue = lazy(() => import('./pages/admin/PoojariQueue.jsx'))
const VerifyTicket = lazy(() => import('./pages/admin/VerifyTicket.jsx'))
const Users = lazy(() => import('./pages/admin/Users.jsx'))
const RoleAccess = lazy(() => import('./pages/admin/RoleAccess.jsx'))
const PoojariMaster = lazy(() => import('./pages/admin/PoojariMaster.jsx'))
const VendorMaster = lazy(() => import('./pages/admin/VendorMaster.jsx'))
const AuctionItemMaster = lazy(() => import('./pages/admin/AuctionItemMaster.jsx'))
const HundiItemMaster = lazy(() => import('./pages/admin/HundiItemMaster.jsx'))
const CommitteeMaster = lazy(() => import('./pages/admin/CommitteeMaster.jsx'))
const FestivalMaster = lazy(() => import('./pages/admin/FestivalMaster.jsx'))
const Reports = lazy(() => import('./pages/admin/Reports.jsx'))
const Analytics = lazy(() => import('./pages/admin/Analytics.jsx'))
const AuditTrail = lazy(() => import('./pages/admin/AuditTrail.jsx'))
const DailyClosing = lazy(() => import('./pages/admin/DailyClosing.jsx'))
const BackupRestore = lazy(() => import('./pages/admin/BackupRestore.jsx'))
const Notifications = lazy(() => import('./pages/admin/Notifications.jsx'))

// Per-route module guard. RequireAuth (on the parent) has already ensured a user
// exists; this sends a signed-in staff member who lacks the screen's module back
// to their landing screen instead of rendering a page whose every API call would 403.
function Guard({ k, children }) {
  const { user } = useAuth()
  if (!canAccessKey(user, k)) return <Navigate to="/admin" replace />
  return children
}

// Landing screen for /admin. The money dashboard is meaningless to a Poojari, so
// they land on their pooja queue instead. Counter Staff go to the Counter module
// directly (Client UAT requirement). Everyone else gets the dashboard.
function AdminHome() {
  const { user } = useAuth()
  if (user?.role === 'Poojari') return <Navigate to="/admin/my-poojas" replace />
  if (user?.role === 'Counter Staff') return <Navigate to="/admin/counter" replace />
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
    <LanguageProvider>
    <DialogHost />
    <ScrollToTop />
    <Suspense fallback={<PageLoader />}>
    <Routes>
      {/* Public informational website */}
      <Route element={<PublicLayout />}>
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
        <Route path="analytics" element={<Guard k="analytics"><Analytics /></Guard>} />
        <Route path="audit" element={<Guard k="audit"><AuditTrail /></Guard>} />
        <Route path="daily-closing" element={<Guard k="daily-closing"><DailyClosing /></Guard>} />
        <Route path="backup" element={<Guard k="backup"><BackupRestore /></Guard>} />
        <Route path="notifications" element={<Notifications />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
    </LanguageProvider>
    </SiteProvider>
  )
}
