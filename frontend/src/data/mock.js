// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA — demo only. No backend. Replace with API calls in Phase 1.
// ─────────────────────────────────────────────────────────────────────────────

export const TEMPLE = {
  name: 'Punjagutta Sri Shirdi Sai Baba Temple',
  nameTelugu: 'పంజాగుట్ట శ్రీ షిర్డి సాయిబాబా దేవస్థానం',
  short: 'Sai Baba Temple',
  tagline: 'A sacred place of faith, devotion and blessings of Sai Baba.',
  trust: 'Sri Shirdi Sai Premsamaj (Regd. Charitable Trust)',
  managedBy: 'Sri Shirdi Sai Premsamaj',
  established: 1987,
  regNo: 'To be provided',   // Trust registration no. — pending from temple
  pan: 'To be provided',     // Trust PAN — pending from temple
  place: 'Punjagutta, Hyderabad',
  address: 'Dwarakapuri Colony, Punjagutta, Hyderabad, Telangana 500082',
  phone: '040-2335 5286',
  email: 'info@psbt.org',
  timings: '5:00 AM – 9:00 PM',
  timingsNote: 'Temple is open on all days including weekends and holidays.',
}

// Phase-1 service catalogue (requirement §8) — grouped by category.
export const SEVA_CATEGORIES = ['Daily', 'Monthly', 'Long-term', 'Ceremony', 'Festival', 'Donation', 'Vahana']

export const SEVAS = [
  // Daily
  { id: 'SV01', name: 'Abhishekam', nameTe: 'అభిషేకం', amount: 516, slot: 'Morning', category: 'Daily', desc: 'Sacred bathing ritual of Sri Sai Baba.' },
  { id: 'SV02', name: 'Archana', nameTe: 'అర్చన', amount: 116, slot: 'All day', category: 'Daily', desc: 'Offering of prayers with names & gotra.' },
  { id: 'SV03', name: 'Rudrabhishekam', nameTe: 'రుద్రాభిషేకం', amount: 1516, slot: 'Morning', category: 'Daily', desc: 'Vedic abhishekam invoking Lord Shiva.' },
  // Monthly
  { id: 'SV04', name: 'Monthly Abhishekam', nameTe: 'నెలవారీ అభిషేకం', amount: 2500, slot: 'Monthly', category: 'Monthly', desc: 'Abhishekam performed every month in your name.' },
  { id: 'SV05', name: 'Monthly Archana', nameTe: 'నెలవారీ అర్చన', amount: 1116, slot: 'Monthly', category: 'Monthly', desc: 'Monthly archana sankalpam for the family.' },
  { id: 'SV06', name: 'Monthly Sahasranamam', nameTe: 'నెలవారీ సహస్రనామం', amount: 3000, slot: 'Monthly', category: 'Monthly', desc: 'Recitation of the 1008 names each month.' },
  // Long-term
  { id: 'SV07', name: 'Life Long Pooja', nameTe: 'జీవితకాల పూజ', amount: 25000, slot: 'Lifetime', category: 'Long-term', desc: 'Pooja performed in your name for life.' },
  { id: 'SV08', name: 'Yearly Pooja', nameTe: 'వార్షిక పూజ', amount: 5116, slot: 'Yearly', category: 'Long-term', desc: 'Annual pooja sankalpam on your chosen day.' },
  // Ceremony
  { id: 'SV09', name: 'Annaprasana', nameTe: 'అన్నప్రాశన', amount: 750, slot: 'Morning', category: 'Ceremony', desc: 'First-feeding ceremony for infants.' },
  { id: 'SV10', name: 'Aksharabhyasam', nameTe: 'అక్షరాభ్యాసం', amount: 750, slot: 'Morning', category: 'Ceremony', desc: 'Initiation of a child into learning.' },
  { id: 'SV11', name: 'Namakaranam', nameTe: 'నామకరణం', amount: 500, slot: 'Morning', category: 'Ceremony', desc: 'Naming ceremony for the newborn.' },
  { id: 'SV12', name: 'Sai Vratam', nameTe: 'సాయి వ్రతం', amount: 516, slot: 'Thursday', category: 'Ceremony', desc: 'Sri Sai Vratam puja for devotees.' },
  // Festival
  { id: 'SV13', name: 'Devi Navaratri Pooja', nameTe: 'దేవీ నవరాత్రి పూజ', amount: 2516, slot: 'Festival', category: 'Festival', desc: 'Nine-day Navaratri pooja participation.' },
  { id: 'SV14', name: 'Karthika Masam Pooja', nameTe: 'కార్తీక మాస పూజ', amount: 1116, slot: 'Festival', category: 'Festival', desc: 'Special poojas through Karthika month.' },
  { id: 'SV15', name: 'Vinayaka Chavithi Pooja', nameTe: 'వినాయక చవితి పూజ', amount: 1116, slot: 'Festival', category: 'Festival', desc: 'Ganesh Chaturthi festival pooja.' },
  // Donation-style sevas
  { id: 'SV16', name: 'Annadanam', nameTe: 'అన్నదానం', amount: 1116, slot: 'All day', category: 'Donation', desc: 'Sponsor free food offering to devotees.' },
  { id: 'SV17', name: 'Gold Donation', nameTe: 'బంగారు విరాళం', amount: 10000, slot: 'All day', category: 'Donation', desc: 'Offering towards gold ornaments for the deity.' },
  { id: 'SV18', name: 'Silver Donation', nameTe: 'వెండి విరాళం', amount: 5000, slot: 'All day', category: 'Donation', desc: 'Offering towards silver articles.' },
  { id: 'SV19', name: 'Vastra Seva', nameTe: 'వస్త్ర సేవ', amount: 1516, slot: 'All day', category: 'Donation', desc: 'Offering of sacred vastram to Sai Baba.' },
  { id: 'SV20', name: 'Rice Bag Donation', nameTe: 'బియ్యం బస్తా విరాళం', amount: 1116, slot: 'All day', category: 'Donation', desc: 'Donate a bag of rice for Annadanam.' },
  { id: 'SV21', name: 'Medical Donation', nameTe: 'వైద్య విరాళం', amount: 5000, slot: 'All day', category: 'Donation', desc: 'Support the trust’s free medical services.' },
  // Vahana
  { id: 'SV22', name: 'Car Pooja', nameTe: 'కార్ పూజ', amount: 516, slot: 'All day', category: 'Vahana', desc: 'Blessing of a new car.' },
  { id: 'SV23', name: 'Scooter Pooja', nameTe: 'స్కూటర్ పూజ', amount: 251, slot: 'All day', category: 'Vahana', desc: 'Blessing of a new two-wheeler.' },
]

// ── Real Shirdi Sai Baba imagery (local, from Wikimedia Commons) ────────────
// See CREDITS.md for sources & licences.
const S = (name) => `/images/sai/${name}.jpg`

export const IMG = {
  hero: S('goldfull'),    // golden Sai Baba shrine statue with garlands
  about: S('samadhi'),    // Shirdi Samadhi Mandir (golden dome)
  banner: S('temple3'),   // white-marble Sai Baba murti
}

export const CAT_IMAGE = {
  Daily: S('sai3'),        // iconic Baba portrait
  Monthly: S('temple2'),   // white-marble murti
  'Long-term': S('samadhi'),
  Ceremony: S('deoghar'),  // Sai shrine
  Festival: S('goldfull'),
  Donation: S('temple3'),
  Vahana: S('st116'),      // tall Sai statue
}

// Distinct images for the four Home "featured" sevas
export const FEATURED_IMG = {
  SV01: S('temple2'),
  SV02: S('temple3'),
  SV03: S('goldfull'),
  SV16: S('deoghar'),
}

// Per-category card gradients (full class strings so Tailwind JIT keeps them)
export const CAT_GRADIENT = {
  Daily: 'from-amber-300 via-orange-400 to-maroon-500',
  Monthly: 'from-rose-300 via-rose-400 to-maroon-500',
  'Long-term': 'from-violet-300 via-violet-400 to-violet-700',
  Ceremony: 'from-emerald-300 via-emerald-400 to-emerald-700',
  Festival: 'from-fuchsia-300 via-pink-400 to-maroon-600',
  Donation: 'from-yellow-300 via-gold-400 to-amber-600',
  Vahana: 'from-sky-300 via-blue-400 to-blue-700',
}

// Distinct emoji per seva so cards aren't identical placeholders
export const SEVA_EMOJI = {
  SV01: '🛕', SV02: '🌸', SV03: '🔱', SV04: '🪔', SV05: '🌺', SV06: '📿',
  SV07: '🙏', SV08: '📅', SV09: '🍚', SV10: '✏️', SV11: '👶', SV12: '🕉️',
  SV13: '🌺', SV14: '🪔', SV15: '🐘', SV16: '🍲', SV17: '🥇', SV18: '🥈',
  SV19: '🧣', SV20: '🌾', SV21: '🏥', SV22: '🚗', SV23: '🛵',
}

export const MANTRA = { hi: 'ॐ श्री साईं राम', te: 'సబకా మాలిక్ ఏక్', sloka: 'శ్రద్ధ · సబూరి' }

export const ANNOUNCEMENTS = [
  { text: 'Annual Sri Sai Baba Maha Pooja on Guru Purnima', date: '20 Jun 2026' },
  { text: 'Special Rudrabhishekam on Shravana Sundays', date: '14 Jul 2026' },
  { text: 'Vinayaka Chavithi 9-Days Pooja bookings open', date: '25 Aug 2026' },
]

export const STATS = [
  { value: '38+', label: 'Years of Service' },
  { value: '500+', label: 'Daily Devotees' },
  { value: '23', label: 'Poojas & Services' },
  { value: '10,000+', label: 'Happy Devotees' },
  { value: '1,00,000+', label: 'Lives Touched' },
]

export const TIMINGS = [
  { session: 'Kakada Aarti', time: '5:30 AM – 6:00 AM', icon: '🌅' },
  { session: 'Abhishekam', time: '6:00 AM – 7:00 AM', icon: '🥛' },
  { session: 'Morning Archana', time: '7:00 AM – 8:30 AM', icon: '🌸' },
  { session: 'Madhyana Aarti', time: '12:00 PM – 1:00 PM', icon: '🔔' },
  { session: 'Evening Archana', time: '5:00 PM – 6:30 PM', icon: '🌆' },
  { session: 'Shej Aarti (Night)', time: '8:30 PM – 9:30 PM', icon: '🌙' },
]

export const DONATION_FUNDS = [
  { id: 'F1', name: 'General Donation', desc: 'Towards temple operations & upkeep.' },
  { id: 'F2', name: 'Annadanam Fund', desc: 'Free food offering to devotees.' },
  { id: 'F3', name: 'Temple Development', desc: 'Construction & renovation projects.' },
  { id: 'F4', name: 'Go Samrakshana', desc: 'Care & protection of cows.' },
]

export const AUCTIONS = [
  { id: 'AU01', item: 'Sri Sai Palki Seva (Annual)', base: 25000, current: 41000, bids: 12, status: 'Live', closes: '2026-07-10' },
  { id: 'AU02', item: 'Dhwajarohanam Honour', base: 15000, current: 22500, bids: 7, status: 'Live', closes: '2026-07-12' },
  { id: 'AU03', item: 'Rathotsavam Lead Seva', base: 30000, current: 30000, bids: 0, status: 'Upcoming', closes: '2026-07-20' },
  { id: 'AU04', item: 'Guru Purnima Maha Aarti', base: 18000, current: 35000, bids: 15, status: 'Closed', closes: '2026-06-20' },
]

// ── Admin / back-office mock data ───────────────────────────────────────────
export const DASHBOARD_STATS = [
  { label: "Today's Bookings", value: '142', delta: '+8%', tone: 'saffron' },
  { label: 'Donations (Today)', value: '₹ 96,200', delta: '+5%', tone: 'emerald' },
  { label: "Today's Collection", value: '₹ 1,84,560', delta: '+12%', tone: 'blue' },
  { label: 'Annadanam (Today)', value: '800 plates', delta: '+6%', tone: 'violet' },
  { label: 'Hundi (This Week)', value: '₹ 1,84,560', delta: '+3%', tone: 'saffron' },
  { label: 'Monthly Collection', value: '₹ 42,80,300', delta: '+9%', tone: 'emerald' },
  { label: 'Registered Devotees', value: '12,480', delta: '+1.2%', tone: 'blue' },
  { label: 'Active Counters', value: '3 / 3', delta: 'Online', tone: 'violet' },
]

export const COLLECTION_TREND = [
  { d: 'Mon', v: 120 }, { d: 'Tue', v: 145 }, { d: 'Wed', v: 138 },
  { d: 'Thu', v: 210 }, { d: 'Fri', v: 168 }, { d: 'Sat', v: 240 }, { d: 'Sun', v: 285 },
]

export const RECENT_ACTIVITY = [
  { time: '10:42 AM', who: 'Counter 2', action: 'Seva booking — Abhishekam', amt: '₹516' },
  { time: '10:39 AM', who: 'Online', action: 'Donation — Annadanam Fund', amt: '₹2,000' },
  { time: '10:31 AM', who: 'Counter 1', action: 'Archana booking', amt: '₹116' },
  { time: '10:18 AM', who: 'Counter 3', action: 'Hundi deposit recorded', amt: '₹18,400' },
  { time: '10:02 AM', who: 'Online', action: 'Auction bid — Palki Seva', amt: '₹41,000' },
]

export const DEVOTEES = [
  { code: 'DEV-2024-0012', name: 'Ramesh Kumar', phone: '98480 11223', gotra: 'Bharadwaja', city: 'Hyderabad', visits: 24 },
  { code: 'DEV-2024-0019', name: 'Lakshmi Devi', phone: '90000 44556', gotra: 'Kashyapa', city: 'Secunderabad', visits: 11 },
  { code: 'DEV-2024-0031', name: 'Suresh Reddy', phone: '99590 77881', gotra: 'Atreya', city: 'Kukatpally', visits: 7 },
  { code: 'DEV-2024-0044', name: 'Anjali Sharma', phone: '70133 99020', gotra: 'Vasishta', city: 'Madhapur', visits: 18 },
  { code: 'DEV-2024-0052', name: 'Venkat Rao', phone: '88860 12345', gotra: 'Gautama', city: 'Ameerpet', visits: 3 },
]

export const DONATIONS = [
  { id: 'DN-5521', donor: 'Ramesh Kumar', fund: 'Annadanam Fund', amount: 5000, mode: 'UPI', date: '2026-06-29', g80: true },
  { id: 'DN-5520', donor: 'Anonymous', fund: 'General Donation', amount: 1116, mode: 'Cash', date: '2026-06-29', g80: false },
  { id: 'DN-5519', donor: 'Lakshmi Devi', fund: 'Temple Development', amount: 25000, mode: 'Card', date: '2026-06-28', g80: true },
  { id: 'DN-5518', donor: 'Suresh Reddy', fund: 'Go Samrakshana', amount: 2500, mode: 'UPI', date: '2026-06-28', g80: true },
]

export const HUNDI_COLLECTIONS = [
  { id: 'HU-091', date: '2026-06-29', counted: 184560, denom: 'Mixed', officer: 'K. Srinivas', status: 'Verified' },
  { id: 'HU-090', date: '2026-06-22', counted: 201340, denom: 'Mixed', officer: 'K. Srinivas', status: 'Verified' },
  { id: 'HU-089', date: '2026-06-15', counted: 176900, denom: 'Mixed', officer: 'P. Anand', status: 'Verified' },
]

export const ANNADANAM_BOOKINGS = [
  { id: 'AN-330', donor: 'Anjali Sharma', plates: 200, amount: 10000, date: '2026-07-05', occasion: 'Birthday' },
  { id: 'AN-329', donor: 'Venkat Rao', plates: 100, amount: 5000, date: '2026-07-01', occasion: 'In memory' },
  { id: 'AN-328', donor: 'Ramesh Kumar', plates: 500, amount: 25000, date: '2026-06-30', occasion: 'Thanksgiving' },
]

export const USERS = [
  { id: 'U01', name: 'Admin (EO)', email: 'eo@psbt.org', role: 'Admin', modules: 'All', status: 'Active' },
  { id: 'U02', name: 'K. Srinivas', email: 'counter1@psbt.org', role: 'Counter Staff', modules: 'Seva, Donation, Hundi', status: 'Active' },
  { id: 'U03', name: 'P. Anand', email: 'counter2@psbt.org', role: 'Counter Staff', modules: 'Seva, Donation', status: 'Active' },
  { id: 'U04', name: 'G. Meena', email: 'accounts@psbt.org', role: 'Accountant', modules: 'Reports (read-only)', status: 'Active' },
]

export const ROLES = [
  { role: 'Admin', desc: 'Full rights — add, edit, delete, update all modules. Manages users & access.', can: ['Create', 'Read', 'Update', 'Delete'] },
  { role: 'Counter Staff', desc: 'Billing only. Cannot cancel or delete transactions.', can: ['Create', 'Read'] },
  { role: 'Accountant', desc: 'Read-only access to all reports and bills.', can: ['Read'] },
]

export const MODULES = ['Devotees', 'Sevas', 'Donations', 'Hundi', 'Auction', 'Annadanam', 'Counter', 'Reports', 'Users', 'Audit']

export const AUDIT_LOG = [
  { time: '2026-06-29 10:42:11', user: 'counter1@psbt.org', action: 'CREATE', entity: 'SevaBooking', detail: 'Abhishekam ₹516', status: 'SUCCESS' },
  { time: '2026-06-29 10:31:02', user: 'counter1@psbt.org', action: 'CREATE', entity: 'SevaBooking', detail: 'Archana ₹116', status: 'SUCCESS' },
  { time: '2026-06-29 09:58:40', user: 'eo@psbt.org', action: 'UPDATE', entity: 'Seva', detail: 'Edited Kalyanam amount', status: 'SUCCESS' },
  { time: '2026-06-29 09:45:19', user: 'counter2@psbt.org', action: 'DELETE', entity: 'Booking', detail: 'Attempted cancel — denied (role)', status: 'FAILURE' },
  { time: '2026-06-29 09:12:05', user: 'eo@psbt.org', action: 'LOGIN', entity: 'Auth', detail: '2FA verified', status: 'SUCCESS' },
]

export const REPORTS = [
  { name: 'Daily Collection Report', desc: 'Counter + online, all modules', period: 'Daily' },
  { name: 'Monthly Collection Report', desc: 'Consolidated month-wise collection', period: 'Monthly' },
  { name: 'Donation & 80G Report', desc: 'Donations with tax-exemption flag', period: 'Monthly' },
  { name: 'Pooja / Seva Report', desc: 'Bookings grouped by seva type', period: 'Monthly' },
  { name: 'Hundi Collection Register', desc: 'Counted amounts & verification', period: 'Weekly' },
  { name: 'Auction Settlement Report', desc: 'Winning bids & dues', period: 'Per event' },
  { name: 'Annadanam Report', desc: 'Sponsorships, plates & occasions', period: 'Monthly' },
  { name: 'Counter Collection Report', desc: 'Collection per billing counter/staff', period: 'Daily' },
  { name: 'Audit Trail Export', desc: 'All staff actions, who/what/when', period: 'On demand' },
]

// ── Public website content (requirement §2, §6) ─────────────────────────────
export const ABOUT = {
  intro:
    'Sri Shirdi Sai Baba Temple at Dwarakapuri Colony, Punjagutta, Hyderabad is managed by the ' +
    'registered charitable trust Sri Shirdi Sai Premsamaj. The temple follows Shirdi Sai Baba ' +
    'traditions and performs daily sevas in the same manner as Shirdi.',
  mission:
    'Beyond religious activities, the trust conducts charitable healthcare initiatives and supports ' +
    'free medical services for the public through its associated medical facilities, alongside ' +
    'daily Annadanam (free food offering).',
  highlights: [
    { icon: '🛕', title: 'Established 1987', desc: 'Serving devotees for over three decades.' },
    { icon: '🙏', title: 'Shirdi Traditions', desc: 'Daily sevas performed as in Shirdi.' },
    { icon: '🍲', title: 'Annadanam', desc: 'Free food offering to devotees & the needy.' },
    { icon: '🏥', title: 'Free Medical Service', desc: 'Charitable healthcare for the public.' },
  ],
}

export const HISTORY = [
  { year: '1987', title: 'Temple Established', desc: 'Sri Shirdi Sai Premsamaj trust establishes the temple at Dwarakapuri Colony, Punjagutta.' },
  { year: '1990s', title: 'Daily Sevas Begin', desc: 'Regular abhishekam, archana and aarti introduced following Shirdi traditions.' },
  { year: '2000s', title: 'Annadanam & Healthcare', desc: 'Free food offering and charitable medical services for the public expanded.' },
  { year: 'Today', title: 'A Living Centre of Devotion', desc: 'Known for Thursday celebrations, Guru Purnima, Rama Navami, Sai Mahasamadhi & Sai Jayanti.' },
]

export const FESTIVALS = [
  { name: 'Sri Rama Navami', nameTe: 'శ్రీ రామ నవమి', month: 'Mar–Apr', icon: '🏹', img: S('goldfull'), desc: 'Celebration of the birth of Lord Rama.' },
  { name: 'Guru Purnima', nameTe: 'గురు పూర్ణిమ', month: 'Jul', icon: '🌕', img: S('sai3'), desc: 'Honouring the guru — a principal Sai festival.' },
  { name: 'Sai Baba Mahasamadhi', nameTe: 'సాయి మహాసమాధి', month: 'Oct (Vijayadashami)', icon: '🪔', img: S('samadhi'), desc: 'Observance of Baba’s Mahasamadhi day.' },
  { name: 'Sai Jayanti', nameTe: 'సాయి జయంతి', month: 'Sep–Oct', icon: '✨', img: S('temple3'), desc: 'Birth celebration of Shirdi Sai Baba.' },
  { name: 'Vinayaka Chavithi', nameTe: 'వినాయక చవితి', month: 'Aug–Sep', icon: '🐘', img: S('deoghar'), desc: 'Ganesh Chaturthi festivities.' },
  { name: 'Devi Navaratri', nameTe: 'దేవీ నవరాత్రి', month: 'Sep–Oct', icon: '🌸', img: S('temple2'), desc: 'Nine nights of Devi worship.' },
  { name: 'Karthika Masam', nameTe: 'కార్తీక మాసం', month: 'Nov–Dec', icon: '🪔', img: S('face'), desc: 'Month-long Karthika deepa poojas.' },
  { name: 'Thursday Celebrations', nameTe: 'గురువారం సేవలు', month: 'Weekly', icon: '🔔', img: S('baba2'), desc: 'Special Sai aarti & palki every Thursday.' },
]

// Gallery placeholders — replace src with real images in Phase 1.
export const GALLERY = [
  { id: 'G1', caption: 'Golden Shrine — Sri Sai Baba', img: S('goldfull') },
  { id: 'G2', caption: 'Samadhi Mandir, Shirdi', img: S('samadhi') },
  { id: 'G3', caption: 'Sri Sai Baba (Marble Murti)', img: S('temple3') },
  { id: 'G4', caption: 'Baba Blessing Devotees', img: S('temple2') },
  { id: 'G5', caption: 'Sai Baba — Historic Portrait', img: S('sai3') },
  { id: 'G6', caption: 'Baba Seated on Stone', img: S('sai2') },
  { id: 'G7', caption: 'Baba with Devotees (1910s)', img: S('devotees') },
  { id: 'G8', caption: '116-ft Sai Baba Statue', img: S('st116') },
]

// ── Admin console mock data (refs 03_53_30 / 03_56_23) ──────────────────────
export const ADMIN_RECENT_BOOKINGS = [
  { seva: 'Abhishekam', emoji: '🛕', datetime: '18 Jun 2026, 08:00 AM', status: 'Confirmed' },
  { seva: 'Archana', emoji: '🌸', datetime: '18 Jun 2026, 10:00 AM', status: 'Confirmed' },
  { seva: 'Annadanam', emoji: '🍲', datetime: '18 Jun 2026, 12:00 PM', status: 'Confirmed' },
  { seva: 'Kalyanam', emoji: '💍', datetime: '18 Jun 2026, 02:00 PM', status: 'Pending' },
  { seva: 'Car Pooja', emoji: '🚗', datetime: '18 Jun 2026, 04:00 PM', status: 'Confirmed' },
]

export const BOOKINGS_DONUT = [
  { label: 'Abhishekam', value: 18, pct: 38, color: '#8a1c1c' },
  { label: 'Archana', value: 15, pct: 32, color: '#d4a017' },
  { label: 'Annadanam', value: 7, pct: 15, color: '#2563eb' },
  { label: 'Kalyanam', value: 4, pct: 8, color: '#059669' },
  { label: 'Others', value: 3, pct: 7, color: '#9ca3af' },
]

export const GRIEVANCES_DONUT = [
  { label: 'New', value: 8, pct: 35, color: '#2563eb' },
  { label: 'In Progress', value: 9, pct: 39, color: '#d4a017' },
  { label: 'Resolved', value: 6, pct: 26, color: '#059669' },
]

// Monthly donation area-chart series (₹ lakh)
export const DONATION_AREA = [4.2, 5.1, 4.8, 6.0, 5.6, 6.8, 7.2, 6.9, 8.1, 7.6, 9.0, 12.45]

export const SCHEDULE = [
  { time: '05:00 AM', name: 'Suprabhatam' },
  { time: '06:00 AM', name: 'Kakad Aarti' },
  { time: '07:30 AM', name: 'Abhishekam' },
  { time: '12:00 PM', name: 'Madhyana Aarti' },
  { time: '08:30 PM', name: 'Dhoop Aarti' },
  { time: '09:00 PM', name: 'Shej Aarti' },
]

export const BOOKING_KPIS = [
  { label: "Today's Bookings", value: 47, tone: 'maroon' },
  { label: 'Upcoming Bookings', value: 128, tone: 'violet' },
  { label: 'Completed', value: 356, tone: 'emerald' },
  { label: 'Cancelled', value: 18, tone: 'red' },
]

export const ADMIN_BOOKINGS = [
  { id: 'BK2506180001', devotee: 'Suresh Kumar', phone: '99000 11234', seva: 'Abhishekam', booked: '18 Jun 2026', scheduled: '18 Jun, 08:00 AM', pay: 'Paid', status: 'Confirmed', source: 'Online', receipt: 'RCPT2506180001' },
  { id: 'BK2506180002', devotee: 'Lakshmi Devi', phone: '97030 67890', seva: 'Archana (108 Names)', booked: '18 Jun 2026', scheduled: '18 Jun, 10:00 AM', pay: 'Paid', status: 'Confirmed', source: 'Online', receipt: 'RCPT2506180002' },
  { id: 'BK2506180003', devotee: 'Ravi Teja', phone: '96480 56789', seva: 'Annadanam', booked: '18 Jun 2026', scheduled: '18 Jun, 11:00 AM', pay: 'Pending', status: 'Pending', source: 'Online', receipt: '—' },
  { id: 'BK2506180004', devotee: 'Anitha Reddy', phone: '91234 56789', seva: 'Sai Sahasranamam', booked: '18 Jun 2026', scheduled: '18 Jun, 12:00 PM', pay: 'Paid', status: 'Confirmed', source: 'Counter', receipt: 'RCPT2506180004' },
  { id: 'BK2506180005', devotee: 'Venkatesh B.', phone: '99887 66544', seva: 'Special Sankalpam', booked: '18 Jun 2026', scheduled: '18 Jun, 03:00 PM', pay: 'Paid', status: 'Confirmed', source: 'Online', receipt: 'RCPT2506180005' },
  { id: 'BK2506180006', devotee: 'Meena Patel', phone: '98485 11223', seva: 'Rudrabhishekam', booked: '18 Jun 2026', scheduled: '18 Jun, 05:00 PM', pay: 'Failed', status: 'Cancelled', source: 'Online', receipt: '—' },
  { id: 'BK2506180007', devotee: 'Krishna Mohan', phone: '90100 32334', seva: 'Kalyanam', booked: '18 Jun 2026', scheduled: '19 Jun, 11:00 AM', pay: 'Paid', status: 'Confirmed', source: 'Counter', receipt: 'RCPT2506180007' },
]

// Calendar events keyed by day-of-month (June 2026 demo)
export const CALENDAR_EVENTS = {
  2: [{ time: '08:00 AM', title: 'Abhishekam', status: 'Confirmed' }],
  3: [{ time: '10:00 AM', title: 'Archana', status: 'Confirmed' }, { time: '11:30 AM', title: 'Annadanam', status: 'Pending' }],
  4: [{ time: '12:00 PM', title: 'Parayanam', status: 'Confirmed' }],
  5: [{ time: '03:00 PM', title: 'Sankalpam', status: 'Confirmed' }],
  6: [{ time: '05:00 PM', title: 'Abhishekam', status: 'Confirmed' }],
  9: [{ time: '08:00 AM', title: 'Abhishekam', status: 'Confirmed' }, { time: '11:00 AM', title: 'Annadanam', status: 'Confirmed' }],
  10: [{ time: '10:00 AM', title: 'Archana (108)', status: 'Confirmed' }],
  11: [{ time: '12:00 PM', title: 'Parayanam', status: 'Confirmed' }],
  12: [{ time: '03:00 PM', title: 'Special Seva', status: 'Pending' }],
  13: [{ time: '05:00 PM', title: 'Abhishekam', status: 'Confirmed' }],
  16: [{ time: '08:00 AM', title: 'Archana', status: 'Cancelled' }, { time: '11:00 AM', title: 'Annadanam', status: 'Confirmed' }],
  17: [{ time: '10:00 AM', title: 'Abhishekam', status: 'Confirmed' }, { time: '12:00 PM', title: 'Parayanam', status: 'Confirmed' }],
  18: [{ time: '11:00 AM', title: 'Kalyanam', status: 'Pending' }, { time: '02:00 PM', title: 'Abhishekam', status: 'Confirmed' }],
  19: [{ time: '03:00 PM', title: 'Sankalpam', status: 'Confirmed' }],
  23: [{ time: '08:00 AM', title: 'Abhishekam', status: 'Confirmed' }],
  24: [{ time: '10:00 AM', title: 'Archana', status: 'Confirmed' }],
  25: [{ time: '12:00 PM', title: 'Parayanam', status: 'Confirmed' }],
  26: [{ time: '05:00 PM', title: 'Rudrabhishekam', status: 'Confirmed' }],
}
