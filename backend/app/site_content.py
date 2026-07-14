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
        {"year": "1987", "title": "Temple Established", "desc": "Sri Shirdi Sai Premsamaj trust establishes the temple at Dwarakapuri Colony, Punjagutta."},
        {"year": "1990s", "title": "Daily Sevas Begin", "desc": "Regular abhishekam, archana and aarti introduced following Shirdi traditions."},
        {"year": "2000s", "title": "Annadanam & Healthcare", "desc": "Free food offering and charitable medical services for the public expanded."},
        {"year": "Today", "title": "A Living Centre of Devotion", "desc": "Known for Thursday celebrations, Guru Purnima, Rama Navami, Sai Mahasamadhi & Sai Jayanti."},
    ],

    "gallery": [
        {"id": "G1", "caption": "Golden Shrine — Sri Sai Baba", "img": _IMG("goldfull")},
        {"id": "G2", "caption": "Samadhi Mandir, Shirdi", "img": _IMG("samadhi")},
        {"id": "G3", "caption": "Sri Sai Baba (Marble Murti)", "img": _IMG("temple3")},
        {"id": "G4", "caption": "Baba Blessing Devotees", "img": _IMG("temple2")},
        {"id": "G5", "caption": "Sai Baba — Historic Portrait", "img": _IMG("sai3")},
        {"id": "G6", "caption": "Baba Seated on Stone", "img": _IMG("sai2")},
        {"id": "G7", "caption": "Baba with Devotees (1910s)", "img": _IMG("devotees")},
        {"id": "G8", "caption": "116-ft Sai Baba Statue", "img": _IMG("st116")},
    ],

    "festivals": [
        {"name": "Sri Rama Navami", "nameTe": "శ్రీ రామ నవమి", "month": "Mar–Apr", "icon": "🏹", "img": _IMG("goldfull"), "desc": "Celebration of the birth of Lord Rama."},
        {"name": "Guru Purnima", "nameTe": "గురు పూర్ణిమ", "month": "Jul", "icon": "🌕", "img": _IMG("sai3"), "desc": "Honouring the guru — a principal Sai festival."},
        {"name": "Sai Baba Mahasamadhi", "nameTe": "సాయి మహాసమాధి", "month": "Oct (Vijayadashami)", "icon": "🪔", "img": _IMG("samadhi"), "desc": "Observance of Baba's Mahasamadhi day."},
        {"name": "Sai Jayanti", "nameTe": "సాయి జయంతి", "month": "Sep–Oct", "icon": "✨", "img": _IMG("temple3"), "desc": "Birth celebration of Shirdi Sai Baba."},
        {"name": "Vinayaka Chavithi", "nameTe": "వినాయక చవితి", "month": "Aug–Sep", "icon": "🐘", "img": _IMG("deoghar"), "desc": "Ganesh Chaturthi festivities."},
        {"name": "Devi Navaratri", "nameTe": "దేవీ నవరాత్రి", "month": "Sep–Oct", "icon": "🌸", "img": _IMG("temple2"), "desc": "Nine nights of Devi worship."},
        {"name": "Karthika Masam", "nameTe": "కార్తీక మాసం", "month": "Nov–Dec", "icon": "🪔", "img": _IMG("face"), "desc": "Month-long Karthika deepa poojas."},
        {"name": "Thursday Celebrations", "nameTe": "గురువారం సేవలు", "month": "Weekly", "icon": "🔔", "img": _IMG("baba2"), "desc": "Special Sai aarti & palki every Thursday."},
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
