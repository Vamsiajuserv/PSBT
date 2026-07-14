import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'

import PublicLayout from './components/public/PublicLayout.jsx'
import AdminLayout from './components/admin/AdminLayout.jsx'
import { RequireAuth } from './auth/AuthContext.jsx'
import { LanguageProvider } from './i18n/LanguageContext.jsx'
import { SiteProvider } from './lib/SiteContext.jsx'

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
import AdminSevas from './pages/admin/Sevas.jsx'
import AdminDonations from './pages/admin/Donations.jsx'
import AdminHundi from './pages/admin/Hundi.jsx'
import AdminAuction from './pages/admin/Auction.jsx'
import AdminAnnadanam from './pages/admin/Annadanam.jsx'
import Counter from './pages/admin/Counter.jsx'
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

export default function App() {
  return (
    <SiteProvider>
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
        <Route index element={<Dashboard />} />
        <Route path="bookings" element={<AdminBookings />} />
        <Route path="bookings/new" element={<NewBooking />} />
        <Route path="bookings/:id" element={<BookingDetails />} />
        <Route path="pooja-master" element={<PoojaMaster />} />
        <Route path="poojari-schedule" element={<PoojariSchedule />} />
        <Route path="poojari-master" element={<PoojariMaster />} />
        <Route path="pooja-history" element={<PoojaHistory />} />
        <Route path="pooja-history/:id" element={<PoojaHistoryDetails />} />
        <Route path="waste-sales" element={<WasteSales />} />
        <Route path="vendors" element={<VendorMaster />} />
        <Route path="auction-items" element={<AuctionItemMaster />} />
        <Route path="hundi-items" element={<HundiItemMaster />} />
        <Route path="committee" element={<CommitteeMaster />} />
        <Route path="festivals" element={<FestivalMaster />} />
        <Route path="settings" element={<Settings />} />
        <Route path="calendar" element={<AdminCalendar />} />
        <Route path="devotees" element={<AdminDevotees />} />
        <Route path="devotees/:id" element={<DevoteeDetails />} />
        <Route path="sevas" element={<AdminSevas />} />
        <Route path="donations" element={<AdminDonations />} />
        <Route path="donation-master" element={<DonationMaster />} />
        <Route path="hundi" element={<AdminHundi />} />
        <Route path="auction" element={<AdminAuction />} />
        <Route path="annadanam" element={<AdminAnnadanam />} />
        <Route path="counter" element={<Counter />} />
        <Route path="users" element={<Users />} />
        <Route path="roles" element={<RoleAccess />} />
        <Route path="reports" element={<Reports />} />
        <Route path="audit" element={<AuditTrail />} />
        <Route path="daily-closing" element={<DailyClosing />} />
        <Route path="backup" element={<BackupRestore />} />
        <Route path="notifications" element={<Notifications />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </SiteProvider>
  )
}
