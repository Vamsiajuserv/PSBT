"""Default public-site content.

This is the seed for the temple's public-facing website content (hero, about,
history, gallery, timings, festivals, mantra, imagery). It is stored in the DB
(a single JSON row in the ``settings`` table under ``site_content``) so the
public site is served dynamically and can be edited without a code change.

The values below are the initial content; once seeded, the DB copy is the source
of truth. See ``ensure_site_content`` and ``routers/public.py``.
"""

_IMG = lambda name: f"/images/sai/{name}.jpg"

# Extra temple-profile fields that don't live in the settings key-value defaults.
TEMPLE_EXTRAS = {
    "nameTelugu": "పంజాగుట్ట శ్రీ షిర్డి సాయిబాబా దేవస్థానం",
    "tagline": "A sacred place of faith, devotion and blessings of Sai Baba.",
    "managedBy": "Sri Shirdi Sai Premsamaj",
    "timingsNote": "Temple is open on all days including weekends and holidays.",
    "timings": "5:00 AM – 9:00 PM",
    "pan": "To be provided",
}

DEFAULT_CONTENT = {
    "mantra": {"hi": "ॐ श्री साईं राम", "te": "సబకా మాలిక్ ఏక్", "sloka": "శ్రద్ధ · సబూరి"},

    "images": {"hero": _IMG("goldfull"), "about": _IMG("samadhi"), "banner": _IMG("temple3")},

    "stats": [
        {"value": "38+", "label": "Years of Service"},
        {"value": "500+", "label": "Daily Devotees"},
        {"value": "23", "label": "Poojas & Services"},
        {"value": "10,000+", "label": "Happy Devotees"},
        {"value": "1,00,000+", "label": "Lives Touched"},
    ],

    "timings": [
        {"session": "Kakada Aarti", "time": "5:30 AM – 6:00 AM", "icon": "🌅"},
        {"session": "Abhishekam", "time": "6:00 AM – 7:00 AM", "icon": "🥛"},
        {"session": "Morning Archana", "time": "7:00 AM – 8:30 AM", "icon": "🌸"},
        {"session": "Madhyana Aarti", "time": "12:00 PM – 1:00 PM", "icon": "🔔"},
        {"session": "Evening Archana", "time": "5:00 PM – 6:30 PM", "icon": "🌆"},
        {"session": "Shej Aarti (Night)", "time": "8:30 PM – 9:30 PM", "icon": "🌙"},
    ],

    "about": {
        "intro": (
            "Sri Shirdi Sai Baba Temple at Dwarakapuri Colony, Punjagutta, Hyderabad is managed by the "
            "registered charitable trust Sri Shirdi Sai Premsamaj. The temple follows Shirdi Sai Baba "
            "traditions and performs daily sevas in the same manner as Shirdi."
        ),
        "mission": (
            "Beyond religious activities, the trust conducts charitable healthcare initiatives and supports "
            "free medical services for the public through its associated medical facilities, alongside "
            "daily Annadanam (free food offering)."
        ),
        "highlights": [
            {"icon": "🛕", "title": "Established 1987", "desc": "Serving devotees for over three decades."},
            {"icon": "🙏", "title": "Shirdi Traditions", "desc": "Daily sevas performed as in Shirdi."},
            {"icon": "🍲", "title": "Annadanam", "desc": "Free food offering to devotees & the needy."},
            {"icon": "🏥", "title": "Free Medical Service", "desc": "Charitable healthcare for the public."},
        ],
    },

    "history": [
        {"year": "1983", "title": "The Foundation", "desc": "Sri Shirdi Sai Premsamaj, a registered charitable society, begins building a Sai mandir at Dwarakapuri Colony, Punjagutta — among the earliest Sai Baba temples of Hyderabad."},
        {"year": "April 1987", "title": "Temple Opened to Devotees", "desc": "The temple is consecrated and opened to devotees, with daily sevas performed in the same manner as at Shirdi."},
        {"year": "1990s", "title": "Shirdi Traditions Take Root", "desc": "Daily abhishekam, archana and the four aartis are established, and the Thursday evening Palki Yatra through Dwarakapuri Colony begins drawing devotees from across the city."},
        {"year": "2000s", "title": "Annadanam & Free Healthcare", "desc": "The trust's seva grows beyond the temple — daily annadanam expands, and free medical consultations, physiotherapy, a pathology lab and a free pharmacy serve the public."},
        {"year": "Today", "title": "A Living Centre of Devotion", "desc": "Thousands visit for Thursday palki seva and the great festivals — Sri Rama Navami, Guru Purnima, Vijayadashami (Mahasamadhi) and Sai Jayanti."},
    ],

    # The life of Shirdi Sai Baba — rendered on the Temple History page. Historic
    # imagery: public-domain photograph plus the temple's own gallery images.
    "baba_story": [
        {"era": "c. 1858", "title": "Arrival at Shirdi", "img": "/images/history/baba-portrait.jpg",
         "desc": "A young fakir arrived in the village of Shirdi, Maharashtra, and sat in meditation beneath a neem tree at the place now revered as Gurusthan. The temple priest Mhalsapati greeted him “Ya Sai!” — welcome, Sai — and the name remained forever."},
        {"era": "1858–1918", "title": "Life at Dwarkamai", "img": "/images/sai/sai2.jpg",
         "desc": "For sixty years Baba lived in a humble mosque he named Dwarkamai — a Hindu name lovingly given to a Muslim structure. There he tended the sacred dhuni, whose udi (ash) he gave to devotees as a blessing of protection and grace."},
        {"era": "Teachings", "title": "Shraddha & Saburi — For All", "img": "/images/sai/devotees.jpg",
         "desc": "Baba asked only for two things: Shraddha (faith) and Saburi (patience). Hindus and Muslims alike sat together at his feet as he taught love, forgiveness, charity and contentment — “Sabka Malik Ek”, One God governs all."},
        {"era": "15 Oct 1918", "title": "Mahasamadhi", "img": "/images/sai/samadhi.jpg",
         "desc": "On Vijayadashami day, Baba attained Mahasamadhi. His samadhi at Shirdi draws millions each year, and his promise endures: “I shall be active and vigorous even from my tomb.” Temples across the world — including ours — carry his light forward."},
    ],

    # Gallery — categorised for the public page's filter chips ("cat"). The first
    # five entries also feed the home-page gallery strip. Commons imagery is
    # attributed in frontend/public/images/{festivals,history,gallery}/ATTRIBUTIONS.md.
    "gallery": [
        {"id": "G1", "caption": "Golden Shrine — Sri Sai Baba", "img": _IMG("goldfull"), "cat": "Sri Sai Baba"},
        {"id": "G2", "caption": "Samadhi Mandir, Shirdi", "img": _IMG("samadhi"), "cat": "Heritage"},
        {"id": "G3", "caption": "Sri Sai Baba — Marble Murti", "img": _IMG("temple3"), "cat": "Sri Sai Baba"},
        {"id": "G4", "caption": "Baba Blessing Devotees", "img": _IMG("temple2"), "cat": "Sri Sai Baba"},
        {"id": "G5", "caption": "Sai Baba — Historic Portrait", "img": _IMG("sai3"), "cat": "Sri Sai Baba"},
        {"id": "G6", "caption": "Baba Seated on Stone — Dwarkamai", "img": _IMG("sai2"), "cat": "Heritage"},
        {"id": "G7", "caption": "Baba with Devotees (1910s)", "img": _IMG("devotees"), "cat": "Heritage"},
        {"id": "G8", "caption": "116-ft Sai Baba Statue", "img": _IMG("st116"), "cat": "Heritage"},
        {"id": "G9", "caption": "Baba Walking with Devotees — Historic", "img": "/images/history/baba-portrait.jpg", "cat": "Heritage"},
        {"id": "G10", "caption": "Sri Rama Navami — Sita Rama Kalyanam", "img": "/images/festivals/rama-navami.jpg", "cat": "Festivals"},
        {"id": "G11", "caption": "Devi Navaratri Alankaram", "img": "/images/festivals/navaratri.jpg", "cat": "Festivals"},
        {"id": "G12", "caption": "Vinayaka Chavithi", "img": "/images/festivals/vinayaka-chavithi.jpg", "cat": "Festivals"},
        {"id": "G13", "caption": "Karthika Deepotsavam", "img": "/images/festivals/karthika-masam.jpg", "cat": "Festivals"},
        {"id": "G14", "caption": "Mahasamadhi Observance", "img": "/images/festivals/mahasamadhi.jpg", "cat": "Festivals"},
        {"id": "G15", "caption": "Evening Aarti — The Dance of Flames", "img": "/images/gallery/aarti-lamps.jpg", "cat": "Seva & Aarti"},
        {"id": "G16", "caption": "Palki Seva Decorations", "img": "/images/festivals/palki.jpg", "cat": "Seva & Aarti"},
    ],

    # Festival content follows the Shirdi tradition: Rama Navami, Guru Purnima and
    # Vijayadashami (Mahasamadhi) are the three principal Sai festivals. Imagery is
    # from Wikimedia Commons (see frontend/public/images/festivals/ATTRIBUTIONS.md).
    "festivals": [
        {"name": "Sri Rama Navami", "nameTe": "శ్రీ రామ నవమి", "month": "Mar–Apr", "icon": "🏹", "img": "/images/festivals/rama-navami.jpg", "major": True,
         "desc": "One of the three great Shirdi festivals — celebrated on a grand scale with Sita Rama Kalyanam and free annadanam served to thousands of devotees."},
        {"name": "Guru Purnima", "nameTe": "గురు పూర్ణిమ", "month": "Jul", "icon": "🌕", "img": "/images/festivals/guru-purnima.jpg", "major": True,
         "desc": "The day devotees honour the Guru. Special poojas, Sai Satcharitra parayanam and sevas performed exactly as at Shirdi."},
        {"name": "Sai Baba Mahasamadhi", "nameTe": "సాయి మహాసమాధి", "month": "Oct (Vijayadashami)", "icon": "🪔", "img": "/images/festivals/mahasamadhi.jpg", "major": True,
         "desc": "Vijayadashami — the day Baba attained Mahasamadhi (1918). Observed with akhanda parayana, special abhishekam and palki seva."},
        {"name": "Sai Jayanti", "nameTe": "సాయి జయంతి", "month": "Sep–Oct", "icon": "✨", "img": "/images/festivals/sai-jayanti.jpg",
         "desc": "Birth celebration of Shirdi Sai Baba with bhajans, abhishekam and prasadam distribution."},
        {"name": "Vinayaka Chavithi", "nameTe": "వినాయక చవితి", "month": "Aug–Sep", "icon": "🐘", "img": "/images/festivals/vinayaka-chavithi.jpg",
         "desc": "Ganesh Chaturthi festivities — multi-day poojas to Lord Vinayaka at the temple."},
        {"name": "Devi Navaratri", "nameTe": "దేవీ నవరాత్రి", "month": "Sep–Oct", "icon": "🌸", "img": "/images/festivals/navaratri.jpg",
         "desc": "Nine nights of Devi worship with daily alankaram and special archanas."},
        {"name": "Karthika Masam", "nameTe": "కార్తీక మాసం", "month": "Nov–Dec", "icon": "🪔", "img": "/images/festivals/karthika-masam.jpg",
         "desc": "The sacred month of lamps — month-long deepa poojas and Karthika deeparadhana every evening."},
        {"name": "Thursday Celebrations", "nameTe": "గురువారం సేవలు", "month": "Weekly", "icon": "🔔", "img": "/images/festivals/palki.jpg",
         "desc": "Baba's day — every Thursday evening at 7:30 PM the palki is carried through Dwarakapuri Colony with bhajans, followed by prasadam."},
    ],

    # Public Sevas page styling (per-category imagery + per-seva emoji/gradient).
    "seva_categories": ["Daily", "Monthly", "Long-term", "Ceremony", "Festival", "Donation", "Vahana"],
    "cat_image": {
        "Daily": _IMG("sai3"), "Monthly": _IMG("temple2"), "Long-term": _IMG("samadhi"),
        "Ceremony": _IMG("deoghar"), "Festival": _IMG("goldfull"), "Donation": _IMG("temple3"),
        "Vahana": _IMG("st116"),
    },
    "cat_gradient": {
        "Daily": "from-amber-300 via-orange-400 to-maroon-500",
        "Monthly": "from-rose-300 via-rose-400 to-maroon-500",
        "Long-term": "from-violet-300 via-violet-400 to-violet-700",
        "Ceremony": "from-emerald-300 via-emerald-400 to-emerald-700",
        "Festival": "from-fuchsia-300 via-pink-400 to-maroon-600",
        "Donation": "from-yellow-300 via-gold-400 to-amber-600",
        "Vahana": "from-sky-300 via-blue-400 to-blue-700",
    },
    "featured_img": {
        "SV01": _IMG("temple2"), "SV02": _IMG("temple3"), "SV03": _IMG("goldfull"), "SV16": _IMG("deoghar"),
    },
    "seva_emoji": {
        "SV01": "🛕", "SV02": "🌸", "SV03": "🔱", "SV04": "🪔", "SV05": "🌺", "SV06": "📿",
        "SV07": "🙏", "SV08": "📅", "SV09": "🍚", "SV10": "✏️", "SV11": "👶", "SV12": "🕉️",
        "SV13": "🌺", "SV14": "🪔", "SV15": "🐘", "SV16": "🍲", "SV17": "🥇", "SV18": "🥈",
        "SV19": "🧣", "SV20": "🌾", "SV21": "🏥", "SV22": "🚗", "SV23": "🛵",
    },

    # Public donation funds shown on the online-donation page (display catalogue).
    "donation_funds": [
        {"id": "F1", "name": "General Donation", "desc": "Towards temple operations & upkeep."},
        {"id": "F2", "name": "Annadanam Fund", "desc": "Free food offering to devotees."},
        {"id": "F3", "name": "Temple Development", "desc": "Construction & renovation projects."},
        {"id": "F4", "name": "Go Samrakshana", "desc": "Care & protection of cows."},
    ],
}


def ensure_site_content(engine) -> None:
    """Seed the ``site_content`` settings row on first run (idempotent)."""
    import json
    from .database import SessionLocal
    from .models import Setting

    db = SessionLocal()
    try:
        row = db.query(Setting).filter(Setting.skey == "site_content").first()
        if row is None:
            db.add(Setting(skey="site_content", svalue=json.dumps(DEFAULT_CONTENT, ensure_ascii=False),
                           updated_by="system"))
            db.commit()
            print("[startup] seeded public site_content")
    finally:
        db.close()
