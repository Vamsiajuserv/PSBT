import React, { useState, useMemo } from 'react'
import {
  Search, LayoutGrid, Flame, CalendarDays, Repeat, Sparkles, Star, Car,
  PhoneCall, Phone, ChevronDown, ArrowRight, ArrowLeft, Clock, ShieldCheck,
} from 'lucide-react'
import { Flourish, MinimalBanner } from '../../components/common/UI.jsx'
import { useSite } from '../../lib/SiteContext.jsx'
import { T, tr, useLang, useContentText } from '../../i18n/LanguageContext.jsx'

const CATS = [
  { key: 'all', label: 'All Services', icon: LayoutGrid },
  { key: 'Daily', label: 'Daily Poojas', icon: Flame },
  { key: 'Monthly', label: 'Monthly Poojas', icon: CalendarDays },
  { key: 'Long-term', label: 'Long-Term Pooja', icon: Repeat },
  { key: 'Festival', label: 'Festivals Poojas', icon: Star },
  { key: 'Ceremony', label: 'Special Poojas', icon: Sparkles },
  { key: 'Vahana', label: 'Vehicle Poojas', icon: Car },
]

// Per-seva image overrides (by pooja name). Takes precedence over the
// category image so a specific pooja can carry its own picture.
const SEVA_IMAGE = {
  Abhishekam: '/images/sai/goldfull.jpg',
  'Ashtotharam / Archana': '/babaimages/AshtotharamArchana.jpg',
  'Sahasranama Archana': '/babaimages/SahasranamaArchana.jpg',
  'Sai Vratam (Pournami)': '/babaimages/SaiVratam(Pournami).jpg',
  'Sai Pooja with Gothranamam': '/babaimages/SaiPoojaGothranamam.jpg',
  'Vishesha Pooja': '/babaimages/VisheshaPooja.webp',
  'Nithya Pooja': '/babaimages/NithyaPooja.jpg',
  'Vinayaka Chavithi Pooja': '/babaimages/VinayakaChavithiPooja.jpeg',
  'Karthika Masam Pooja': '/babaimages/KarthikaMasamPooja.jpg',
  'Sri Rama Navami': '/babaimages/SriRamaNavami.jpeg',
  'Namakaranam': '/babaimages/Namakaranam.jpeg',
  'Rudrabhishekam': '/babaimages/Rudrabhishekam.jpg',
  'Aksharabhyasam': '/babaimages/Aksharabhyasam.jpeg',
  'Annaprasana': '/babaimages/Annaprasana.jpeg',
  'Vastra Seva': '/babaimages/VastraSeva.jpeg',
  'Bike / Scooter Pooja': '/babaimages/BikeScooterPooja.jpeg',
  'Auto Pooja': '/babaimages/AutoPooja.jpeg',
  'Car Pooja': '/babaimages/CarPooja.jpeg',
}

// Per-seva "About" text (by pooja name). Shown in the detail view, taking
// precedence over the backend description and the generic fallback.
const SEVA_ABOUT = {
  'Sai Pooja with Gothranamam':
    "Sai Pooja with Gothranamam is a sacred ritual in which prayers are offered to Sri Shirdi Sai Baba by chanting the devotee's name and Gothram (family lineage). This special pooja is performed to seek Baba's divine blessings for good health, prosperity, family harmony, success, and overall well-being. Devotees participate with deep faith, praying for the welfare of their family, inner peace, fulfillment of their wishes, and a life filled with happiness and divine grace.",
  'Vishesha Pooja':
    "Vishesha Pooja is a special worship performed with devotion to Sri Shirdi Sai Baba on auspicious occasions, festivals, birthdays, anniversaries, or to fulfill a specific prayer. This sacred pooja is offered to seek Baba's blessings for good health, prosperity, success, family harmony, and protection from obstacles. Devotees participate with faith, praying for peace, happiness, and the fulfillment of their heartfelt wishes.",
  'Nithya Pooja':
    "Nithya Pooja is a daily worship offered to Sri Shirdi Sai Baba with devotion, prayers, and sacred offerings. It is performed to seek Baba's divine blessings for good health, peace, prosperity, family well-being, and spiritual growth. Devotees participate with faith, praying for happiness, protection, and success in every aspect of life.",
  'Sai Vratam (Pournami)':
    "Sai Vratam (Pournami) is a sacred monthly pooja performed at Sri Shirdi Sai Baba Temple on the auspicious day of Pournami (Full Moon). Devotees observe the vratam with devotion by participating in special poojas, Sai Baba Ashtotharam, bhajans, and aarti to seek Baba's divine blessings for good health, prosperity, family harmony, peace, and spiritual growth. It is believed that performing this vratam with sincere faith helps fulfill wishes and brings happiness, success, and divine grace into one's life.",
  'Devi Navaratri Pooja':
    "Devi Navaratri Pooja is a sacred worship performed during the auspicious Navaratri festival to honor Goddess Durga, the divine embodiment of strength, wisdom, and compassion. This special pooja is conducted to seek the Goddess's blessings for health, prosperity, protection, success, and spiritual growth. Devotees participate with devotion, praying for the well-being of their families, the removal of obstacles, and the fulfillment of their sincere wishes.",
  'Vinayaka Chavithi Pooja':
    "Vinayaka Chavithi Pooja is a sacred worship performed on the auspicious occasion of Vinayaka Chavithi to honor Lord Ganesha, the remover of obstacles and the giver of wisdom and prosperity. This special pooja is performed to seek Lord Ganesha's blessings for success, good health, family happiness, prosperity, and the smooth completion of all endeavors. Devotees participate with devotion, praying for peace, wisdom, and the fulfillment of their heartfelt wishes.",
  'Karthika Masam Pooja':
    "Karthika Masam Pooja is a special worship performed during the sacred month of Karthika at Sri Shirdi Sai Baba Temple with devotion and faith. During this holy month, devotees offer deepa seva (lighting lamps), special prayers, bhajans, and poojas to seek Sri Sai Baba's divine blessings for good health, prosperity, family harmony, peace, and spiritual growth. Devotees participate wholeheartedly, praying for the fulfillment of their wishes, removal of obstacles, and a life filled with happiness and Baba's grace.",
  'Sri Rama Navami':
    "Sri Rama Navami is a sacred festival celebrated with great devotion at Sri Shirdi Sai Baba Temple, commemorating the birth of Lord Sri Rama. Special poojas, bhajans, devotional prayers, and spiritual programs are conducted to seek divine blessings for righteousness, peace, prosperity, family well-being, and spiritual growth. Devotees participate with faith, praying for happiness, success, and the fulfillment of their wishes under the grace of Sri Rama and Sri Shirdi Sai Baba.",
  'Rudrabhishekam':
    "Rudrabhishekam is a special sacred ritual performed at Sri Shirdi Sai Baba Temple by offering Abhishekam to the Shiva Lingam with holy substances such as milk, water, honey, curd, and sandalwood while chanting powerful Vedic mantras. As Sri Sai Baba always emphasized devotion to Lord Shiva and the unity of all faiths, this pooja is conducted to seek divine blessings for good health, prosperity, family harmony, peace, protection, and spiritual well-being. Devotees participate with faith, praying for the removal of obstacles, fulfillment of their wishes, and Baba's divine grace.",
  'Namakaranam':
    "Namakaranam is a sacred naming ceremony performed at Sri Shirdi Sai Baba Temple to bless a newborn child with a meaningful name in the divine presence of Sri Sai Baba. Special prayers and poojas are offered to seek Baba's blessings for the child's good health, long life, wisdom, prosperity, and a bright future. Parents and family members participate with devotion, praying for the child's happiness, success, and lifelong divine protection.",
  'Aksharabhyasam':
    "Aksharabhyasam is a sacred ceremony performed at Sri Shirdi Sai Baba Temple to mark a child's first step into the world of education. In the divine presence of Sri Sai Baba, the child is guided to write the first letters while special prayers and poojas are offered for wisdom, knowledge, good character, and academic success. Parents and family members participate with devotion, seeking Baba's blessings for the child's bright future, confidence, and lifelong learning.",
  'Annaprasana':
    "Annaprasana is a sacred ceremony performed at Sri Shirdi Sai Baba Temple to celebrate a baby's first intake of solid food. In the divine presence of Sri Sai Baba, special poojas and prayers are offered to seek blessings for the child's good health, long life, happiness, wisdom, and prosperous future. Parents and family members participate with devotion, praying for the child's healthy growth, well-being, and lifelong protection under Baba's divine grace.",
  'Vastra Seva':
    "Vastra Seva is a sacred offering performed at Sri Shirdi Sai Baba Temple, where devotees offer new clothes to Sri Sai Baba as a symbol of devotion, gratitude, and surrender. This seva is performed to seek Baba's divine blessings for good health, prosperity, family harmony, success, and spiritual well-being. Devotees participate with faith, praying for the fulfillment of their wishes and expressing their love and reverence through this humble offering.",
  'Bike / Scooter Pooja':
    "Bike / Scooter Pooja is a sacred vehicle blessing ceremony performed at Sri Shirdi Sai Baba Temple for newly purchased or existing two-wheelers. Special prayers and poojas are offered to seek Sri Sai Baba's divine blessings for safe journeys, protection from accidents, success, prosperity, and peace of mind. Devotees perform this pooja with faith, praying for the safety of themselves and their families, and for Baba's guidance in every journey.",
  'Auto Pooja':
    "Auto Pooja is a sacred vehicle blessing ceremony performed at Sri Shirdi Sai Baba Temple for newly purchased or regularly used auto-rickshaws. Special prayers and poojas are offered to seek Sri Sai Baba's divine blessings for safe journeys, protection from accidents, prosperity, success in livelihood, and peace of mind. Devotees perform this pooja with faith, praying for a successful career, steady income, the well-being of their families, and Baba's guidance on every journey.",
  'Car Pooja':
    "Car Pooja is a sacred vehicle blessing ceremony performed at Sri Shirdi Sai Baba Temple for newly purchased or existing cars. Special prayers and poojas are offered to seek Sri Sai Baba's divine blessings for safe journeys, protection from accidents, prosperity, success, and peace of mind. Devotees perform this pooja with faith, praying for the safety of their family, smooth travels, and Baba's divine guidance and protection on every journey.",
}

// Telugu twin of SEVA_ABOUT, keyed identically. Kept beside its English
// counterpart rather than in the dictionary — these are page content, and a
// 400-character dictionary key is unreadable in a diff.
const SEVA_ABOUT_TE = {
  'Sai Pooja with Gothranamam':
    'గోత్రనామంతో సాయి పూజ అనేది భక్తుని పేరు మరియు గోత్రాన్ని (వంశ పరంపర) స్మరిస్తూ శ్రీ షిర్డీ సాయిబాబాకు ప్రార్థనలు సమర్పించే పవిత్ర కార్యక్రమం. ఆరోగ్యం, ఐశ్వర్యం, కుటుంబ సామరస్యం, విజయం మరియు సమగ్ర క్షేమం కోసం బాబా దివ్య ఆశీస్సులు పొందేందుకు ఈ ప్రత్యేక పూజ నిర్వహిస్తారు. భక్తులు గాఢ విశ్వాసంతో పాల్గొని, కుటుంబ శ్రేయస్సు, అంతర్గత శాంతి, కోరికల నెరవేర్పు మరియు సంతోషంతో నిండిన జీవితం కోసం ప్రార్థిస్తారు.',
  'Vishesha Pooja':
    'విశేష పూజ అనేది శుభ సందర్భాలలో, పండుగలలో, జన్మదినాలలో, వార్షికోత్సవాలలో లేదా ఒక ప్రత్యేక ప్రార్థన నెరవేర్పు కోసం శ్రీ షిర్డీ సాయిబాబాకు భక్తితో నిర్వహించే ప్రత్యేక ఆరాధన. ఆరోగ్యం, ఐశ్వర్యం, విజయం, కుటుంబ సామరస్యం మరియు ఆటంకాల నుండి రక్షణ కోసం బాబా ఆశీస్సులు పొందేందుకు ఈ పవిత్ర పూజ సమర్పిస్తారు. భక్తులు విశ్వాసంతో పాల్గొని, శాంతి, సంతోషం మరియు హృదయపూర్వక కోరికల నెరవేర్పు కోసం ప్రార్థిస్తారు.',
  'Nithya Pooja':
    'నిత్య పూజ అనేది భక్తి, ప్రార్థనలు మరియు పవిత్ర నైవేద్యాలతో శ్రీ షిర్డీ సాయిబాబాకు ప్రతిరోజూ సమర్పించే ఆరాధన. ఆరోగ్యం, శాంతి, ఐశ్వర్యం, కుటుంబ క్షేమం మరియు ఆధ్యాత్మిక అభివృద్ధి కోసం బాబా దివ్య ఆశీస్సులు పొందేందుకు దీనిని నిర్వహిస్తారు. భక్తులు విశ్వాసంతో పాల్గొని, జీవితంలోని ప్రతి అంశంలో సంతోషం, రక్షణ మరియు విజయం కోసం ప్రార్థిస్తారు.',
  'Sai Vratam (Pournami)':
    'సాయి వ్రతం (పౌర్ణమి) అనేది శుభప్రదమైన పౌర్ణమి రోజున శ్రీ షిర్డీ సాయిబాబా ఆలయంలో నిర్వహించే పవిత్ర మాసిక పూజ. భక్తులు ప్రత్యేక పూజలు, సాయిబాబా అష్టోత్తరం, భజనలు మరియు హారతిలో పాల్గొంటూ భక్తితో వ్రతాన్ని ఆచరించి, ఆరోగ్యం, ఐశ్వర్యం, కుటుంబ సామరస్యం, శాంతి మరియు ఆధ్యాత్మిక అభివృద్ధి కోసం బాబా దివ్య ఆశీస్సులు అర్థిస్తారు. చిత్తశుద్ధితో ఈ వ్రతాన్ని ఆచరిస్తే కోరికలు నెరవేరి, జీవితంలో సంతోషం, విజయం మరియు దైవానుగ్రహం లభిస్తాయని విశ్వాసం.',
  'Devi Navaratri Pooja':
    'దేవీ నవరాత్రి పూజ అనేది శక్తి, జ్ఞానం మరియు కరుణల దివ్య స్వరూపిణి అయిన దుర్గా దేవిని పూజించేందుకు శుభప్రదమైన నవరాత్రి ఉత్సవాల్లో నిర్వహించే పవిత్ర ఆరాధన. ఆరోగ్యం, ఐశ్వర్యం, రక్షణ, విజయం మరియు ఆధ్యాత్మిక అభివృద్ధి కోసం అమ్మవారి ఆశీస్సులు పొందేందుకు ఈ ప్రత్యేక పూజ నిర్వహిస్తారు. భక్తులు భక్తితో పాల్గొని, కుటుంబ క్షేమం, ఆటంకాల తొలగింపు మరియు తమ నిజాయితీ కోరికల నెరవేర్పు కోసం ప్రార్థిస్తారు.',
  'Vinayaka Chavithi Pooja':
    'వినాయక చవితి పూజ అనేది ఆటంకాలను తొలగించి జ్ఞానం, ఐశ్వర్యాలను ప్రసాదించే వినాయకుడిని పూజించేందుకు శుభప్రదమైన వినాయక చవితి సందర్భంగా నిర్వహించే పవిత్ర ఆరాధన. విజయం, ఆరోగ్యం, కుటుంబ సంతోషం, ఐశ్వర్యం మరియు అన్ని కార్యాల సాఫల్యం కోసం వినాయకుడి ఆశీస్సులు పొందేందుకు ఈ ప్రత్యేక పూజ నిర్వహిస్తారు. భక్తులు భక్తితో పాల్గొని, శాంతి, జ్ఞానం మరియు హృదయపూర్వక కోరికల నెరవేర్పు కోసం ప్రార్థిస్తారు.',
  'Karthika Masam Pooja':
    'కార్తీక మాస పూజ అనేది పవిత్ర కార్తీక మాసంలో శ్రీ షిర్డీ సాయిబాబా ఆలయంలో భక్తి విశ్వాసాలతో నిర్వహించే ప్రత్యేక ఆరాధన. ఈ పవిత్ర మాసంలో భక్తులు దీప సేవ, ప్రత్యేక ప్రార్థనలు, భజనలు మరియు పూజలు సమర్పిస్తూ ఆరోగ్యం, ఐశ్వర్యం, కుటుంబ సామరస్యం, శాంతి మరియు ఆధ్యాత్మిక అభివృద్ధి కోసం శ్రీ సాయిబాబా దివ్య ఆశీస్సులు అర్థిస్తారు. భక్తులు హృదయపూర్వకంగా పాల్గొని, కోరికల నెరవేర్పు, ఆటంకాల తొలగింపు మరియు బాబా అనుగ్రహంతో నిండిన జీవితం కోసం ప్రార్థిస్తారు.',
  'Sri Rama Navami':
    'శ్రీ రామ నవమి అనేది శ్రీ రాముని జన్మదినాన్ని పురస్కరించుకుని శ్రీ షిర్డీ సాయిబాబా ఆలయంలో గొప్ప భక్తితో జరుపుకునే పవిత్ర ఉత్సవం. ధర్మం, శాంతి, ఐశ్వర్యం, కుటుంబ క్షేమం మరియు ఆధ్యాత్మిక అభివృద్ధి కోసం దివ్య ఆశీస్సులు పొందేందుకు ప్రత్యేక పూజలు, భజనలు, భక్తి ప్రార్థనలు మరియు ఆధ్యాత్మిక కార్యక్రమాలు నిర్వహిస్తారు. భక్తులు విశ్వాసంతో పాల్గొని, శ్రీ రాముని మరియు శ్రీ షిర్డీ సాయిబాబా అనుగ్రహంతో సంతోషం, విజయం మరియు కోరికల నెరవేర్పు కోసం ప్రార్థిస్తారు.',
  'Rudrabhishekam':
    'రుద్రాభిషేకం అనేది శ్రీ షిర్డీ సాయిబాబా ఆలయంలో పాలు, నీరు, తేనె, పెరుగు మరియు గంధం వంటి పవిత్ర ద్రవ్యాలతో శివలింగానికి అభిషేకం చేస్తూ శక్తివంతమైన వేద మంత్రాలు పఠించే ప్రత్యేక పవిత్ర కార్యక్రమం. శ్రీ సాయిబాబా ఎల్లప్పుడూ శివ భక్తిని, సర్వమత సమానత్వాన్ని బోధించారు కాబట్టి, ఆరోగ్యం, ఐశ్వర్యం, కుటుంబ సామరస్యం, శాంతి, రక్షణ మరియు ఆధ్యాత్మిక క్షేమం కోసం ఈ పూజ నిర్వహిస్తారు. భక్తులు విశ్వాసంతో పాల్గొని, ఆటంకాల తొలగింపు, కోరికల నెరవేర్పు మరియు బాబా దివ్యానుగ్రహం కోసం ప్రార్థిస్తారు.',
  'Namakaranam':
    'నామకరణం అనేది శ్రీ షిర్డీ సాయిబాబా దివ్య సన్నిధిలో నవజాత శిశువుకు అర్థవంతమైన పేరు పెట్టి ఆశీర్వదించే పవిత్ర కార్యక్రమం. శిశువు ఆరోగ్యం, దీర్ఘాయువు, జ్ఞానం, ఐశ్వర్యం మరియు ఉజ్వల భవిష్యత్తు కోసం బాబా ఆశీస్సులు అర్థిస్తూ ప్రత్యేక ప్రార్థనలు, పూజలు సమర్పిస్తారు. తల్లిదండ్రులు మరియు కుటుంబ సభ్యులు భక్తితో పాల్గొని, శిశువు సంతోషం, విజయం మరియు జీవితకాల దైవ రక్షణ కోసం ప్రార్థిస్తారు.',
  'Aksharabhyasam':
    'అక్షరాభ్యాసం అనేది శ్రీ షిర్డీ సాయిబాబా ఆలయంలో పిల్లలు విద్యా ప్రస్థానంలో తొలి అడుగు వేసే సందర్భంగా నిర్వహించే పవిత్ర కార్యక్రమం. శ్రీ సాయిబాబా దివ్య సన్నిధిలో పిల్లలు తొలి అక్షరాలు దిద్దుతుండగా జ్ఞానం, విద్య, సద్గుణాలు మరియు విద్యా విజయం కోసం ప్రత్యేక ప్రార్థనలు, పూజలు సమర్పిస్తారు. తల్లిదండ్రులు మరియు కుటుంబ సభ్యులు భక్తితో పాల్గొని, పిల్లల ఉజ్వల భవిష్యత్తు, ఆత్మవిశ్వాసం మరియు జీవితకాల విద్యాభ్యాసం కోసం బాబా ఆశీస్సులు అర్థిస్తారు.',
  'Annaprasana':
    'అన్నప్రాశన అనేది శ్రీ షిర్డీ సాయిబాబా ఆలయంలో శిశువు తొలిసారి ఘనాహారం స్వీకరించే సందర్భాన్ని పురస్కరించుకుని నిర్వహించే పవిత్ర కార్యక్రమం. శ్రీ సాయిబాబా దివ్య సన్నిధిలో శిశువు ఆరోగ్యం, దీర్ఘాయువు, సంతోషం, జ్ఞానం మరియు ఐశ్వర్యవంతమైన భవిష్యత్తు కోసం ప్రత్యేక పూజలు, ప్రార్థనలు సమర్పిస్తారు. తల్లిదండ్రులు మరియు కుటుంబ సభ్యులు భక్తితో పాల్గొని, శిశువు ఆరోగ్యకరమైన ఎదుగుదల, క్షేమం మరియు బాబా అనుగ్రహంలో జీవితకాల రక్షణ కోసం ప్రార్థిస్తారు.',
  'Vastra Seva':
    'వస్త్ర సేవ అనేది భక్తి, కృతజ్ఞత మరియు శరణాగతికి చిహ్నంగా భక్తులు శ్రీ సాయిబాబాకు కొత్త వస్త్రాలు సమర్పించే పవిత్ర సేవ. ఆరోగ్యం, ఐశ్వర్యం, కుటుంబ సామరస్యం, విజయం మరియు ఆధ్యాత్మిక క్షేమం కోసం బాబా దివ్య ఆశీస్సులు పొందేందుకు ఈ సేవ నిర్వహిస్తారు. భక్తులు విశ్వాసంతో పాల్గొని, తమ కోరికల నెరవేర్పు కోసం ప్రార్థిస్తూ, ఈ వినమ్ర సమర్పణ ద్వారా తమ ప్రేమను, భక్తిని వ్యక్తపరుస్తారు.',
  'Bike / Scooter Pooja':
    'బైక్ / స్కూటర్ పూజ అనేది కొత్తగా కొనుగోలు చేసిన లేదా వినియోగంలో ఉన్న ద్విచక్ర వాహనాల కోసం శ్రీ షిర్డీ సాయిబాబా ఆలయంలో నిర్వహించే పవిత్ర వాహన ఆశీర్వాద కార్యక్రమం. సురక్షిత ప్రయాణాలు, ప్రమాదాల నుండి రక్షణ, విజయం, ఐశ్వర్యం మరియు మనశ్శాంతి కోసం శ్రీ సాయిబాబా దివ్య ఆశీస్సులు అర్థిస్తూ ప్రత్యేక ప్రార్థనలు, పూజలు సమర్పిస్తారు. భక్తులు విశ్వాసంతో ఈ పూజ నిర్వహించి, తమ మరియు తమ కుటుంబ భద్రత కోసం, ప్రతి ప్రయాణంలో బాబా మార్గదర్శకత్వం కోసం ప్రార్థిస్తారు.',
  'Auto Pooja':
    'ఆటో పూజ అనేది కొత్తగా కొనుగోలు చేసిన లేదా నిత్యం వినియోగించే ఆటో రిక్షాల కోసం శ్రీ షిర్డీ సాయిబాబా ఆలయంలో నిర్వహించే పవిత్ర వాహన ఆశీర్వాద కార్యక్రమం. సురక్షిత ప్రయాణాలు, ప్రమాదాల నుండి రక్షణ, ఐశ్వర్యం, జీవనోపాధిలో విజయం మరియు మనశ్శాంతి కోసం శ్రీ సాయిబాబా దివ్య ఆశీస్సులు అర్థిస్తూ ప్రత్యేక ప్రార్థనలు, పూజలు సమర్పిస్తారు. భక్తులు విశ్వాసంతో ఈ పూజ నిర్వహించి, విజయవంతమైన వృత్తి, స్థిరమైన ఆదాయం, కుటుంబ క్షేమం మరియు ప్రతి ప్రయాణంలో బాబా మార్గదర్శకత్వం కోసం ప్రార్థిస్తారు.',
  'Car Pooja':
    'కార్ పూజ అనేది కొత్తగా కొనుగోలు చేసిన లేదా వినియోగంలో ఉన్న కార్ల కోసం శ్రీ షిర్డీ సాయిబాబా ఆలయంలో నిర్వహించే పవిత్ర వాహన ఆశీర్వాద కార్యక్రమం. సురక్షిత ప్రయాణాలు, ప్రమాదాల నుండి రక్షణ, ఐశ్వర్యం, విజయం మరియు మనశ్శాంతి కోసం శ్రీ సాయిబాబా దివ్య ఆశీస్సులు అర్థిస్తూ ప్రత్యేక ప్రార్థనలు, పూజలు సమర్పిస్తారు. భక్తులు విశ్వాసంతో ఈ పూజ నిర్వహించి, కుటుంబ భద్రత, సాఫీ ప్రయాణాలు మరియు ప్రతి ప్రయాణంలో బాబా దివ్య మార్గదర్శకత్వం, రక్షణ కోసం ప్రార్థిస్తారు.',
}

// Human-readable duration hint per category (shown in the detail view).
// A real booking CONDITION a devotee must read before booking — a performance
// quota or a validity window (Vishesha = 3 poojas/year, Nithya = lifelong,
// festival multi-day). Everyday plans (daily, monthly, one-time, a single
// festival day) return null: there is nothing to warn about.
function planQuota(plan) {
  const n = (plan || '').toLowerCase()
  if (n.includes('life')) return 'Lifetime · unlimited poojas'
  if (n.includes('thrice')) return '3 poojas within 1 year'
  if (n.includes('yearly')) return '1 pooja within 1 year'
  const dm = n.match(/(\d+)\s*-?\s*day/)
  if (dm && +dm[1] > 1) return `${dm[1]}-day festival pooja`
  return null
}
// Milder validity shown in the plan table (includes the plain monthly plan).
function planValidity(plan) {
  const q = planQuota(plan)
  if (q) return q
  const n = (plan || '').toLowerCase()
  if (n.includes('monthly') || n.includes('30 day') || n.includes('full month') || n.includes('pournami')) return 'Valid for the month'
  return null
}
// Real terms → the "Terms apply" badge + Booking Terms note (Vishesha, Nithya,
// festivals). Plain multi-plan poojas like Archana (daily/monthly) are NOT this.
const sevaHasTerms = (seva) => (seva.planRows || []).some((p) => planQuota(p.plan))
const sevaMultiPlan = (seva) => (seva.planRows || []).length > 1

// Normalise a backend SevaOut row into the shape the cards expect.
const normalize = (s) => ({
  id: s.id ?? s.code, code: s.code, name: s.name, nameTe: s.name_te || s.nameTe || '',
  amount: s.amount == null ? null : Number(s.amount) || 0,
  committee: !!s.committee, from: !!s.from, plans: s.plans || '',
  category: s.category || 'Daily', desc: s.description || s.desc || '',
})

// Indian-style thousands grouping, e.g. 5001 → "5,001".
const fmt = (n) => Number(n ?? 0).toLocaleString('en-IN')

const priceLabel = (s) =>
  s.committee ? tr('Committee decided') : `${s.from ? tr('from') + ' ' : ''}₹${fmt(s.amount)}`

export default function Sevas() {
  const { t, lang } = useLang()
  const te = useContentText()
  const site = useSite()
  const [openCat, setOpenCat] = useState(null)      // which accordion is expanded (one at a time)
  const [cat, setCat] = useState('all')             // category driving the right content — full catalogue first
  const [detail, setDetail] = useState(null)        // selected seva → detail view (null = list view)
  const [query, setQuery] = useState('')

  // Live catalogue + display assets served by the site context (GET /api/public/site).
  const sevas = useMemo(() => (site?.sevas || []).map(normalize), [site])
  const catImage = site?.cat_image || {}
  const sevaEmoji = site?.seva_emoji || {}

  // Sort by fee low → high; committee-decided (no fixed fee) sinks to the bottom.
  const byFee = (a, b) => (a.amount ?? Infinity) - (b.amount ?? Infinity)

  // The API serves one row per plan. Collapse them back to one entry per pooja so
  // a multi-plan pooja (e.g. Vinayaka Chavithi: 1/3/5/9/11-Day) is listed once;
  // its individual plans are kept in `planRows` for the detail view. Categories
  // where each pooja has a single plan are unaffected.
  const groupByPooja = (list) => {
    const map = new Map()
    for (const s of list) {
      const key = s.code || s.name
      if (!map.has(key)) map.set(key, { ...s, id: key, planRows: [] })
      map.get(key).planRows.push({ plan: s.plans, amount: s.amount, committee: s.committee })
    }
    for (const g of map.values()) {
      const fees = g.planRows.filter((p) => !p.committee && p.amount != null).map((p) => p.amount)
      g.amount = fees.length ? Math.min(...fees) : null
      g.committee = fees.length === 0
      g.from = fees.length > 1
      g.plans = g.planRows.length === 1 ? g.planRows[0].plan : `${g.planRows.length} plans`
    }
    return [...map.values()]
  }

  const byCat = (key) => {
    const list = groupByPooja(key === 'all' ? sevas : sevas.filter((s) => s.category === key))
    // Occasion/Special poojas stay grouped by pooja (natural order); every other
    // category is sorted by fee low → high.
    return key === 'Ceremony' ? list : list.sort(byFee)
  }
  const catCount = (key) => byCat(key).length

  const filtered = byCat(cat).filter(
    (s) =>
      s.name.toLowerCase().includes(query.toLowerCase()) || (s.nameTe || '').includes(query)
  )

  const selectCat = (key) => {
    setCat(key)
    setDetail(null)
    setOpenCat((prev) => (prev === key ? (key === 'all' ? prev : null) : key))
  }

  const activeLabel = CATS.find((c) => c.key === cat)?.label || 'Services'   // translated at render via t(activeLabel)

  return (
    <div className="bg-cream">
      <MinimalBanner title={tr("Poojas & Services")} breadcrumb="Home  ›  Poojas & Services" />

      <div className="max-w-7xl mx-auto px-4 pt-8 pb-10">
        <div className="grid lg:grid-cols-[290px_1fr] gap-6 items-start">
          {/* ── Categories sidebar (sticky, accordion) ── */}
          <aside className="lg:sticky lg:top-24 space-y-4">
            {/* Search — lives with the filters so both columns start level */}
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tr("Search pooja / seva…")}
                className="input !pl-9 text-black"
              />
            </div>

            <div className="card p-4">
              <div className="font-display text-base uppercase tracking-widest text-maroon-900 mb-1"><T>Categories</T></div>
              <Flourish className="justify-start mb-3" width="w-8" />

              {/* All Services */}
              <button
                onClick={() => selectCat('all')}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-[0.8125rem] font-semibold transition-colors mb-1.5 ${cat === 'all' ? 'bg-gold-cta text-maroon-900' : 'text-black hover:bg-gold-50'}`}
              >
                <span className="flex items-center gap-2.5"><LayoutGrid size={16} />{' '}<T>All Services</T></span>
                <span className={`text-[0.6875rem] ${cat === 'all' ? 'text-maroon-800' : 'text-black'}`}>({catCount('all')})</span>
              </button>

              {/* Accordion categories */}
              <div className="space-y-1.5">
                {CATS.filter((c) => c.key !== 'all').map((c) => {
                  const Icon = c.icon
                  const isOpen = openCat === c.key
                  const isActive = cat === c.key
                  const rows = byCat(c.key)
                  const showFreq = !['Daily', 'Monthly', 'Vahana'].includes(c.key)   // these: only Pooja + Fee
                  return (
                    <div key={c.key} className={`rounded-xl border transition-colors ${isOpen ? 'border-gold-300 bg-ivory' : 'border-transparent'}`}>
                      <button
                        onClick={() => selectCat(c.key)}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-[0.8125rem] font-semibold transition-colors ${isActive ? 'text-maroon-800' : 'text-black hover:bg-gold-50'}`}
                      >
                        <span className="flex items-center gap-2.5"><Icon size={16} className={isActive ? 'text-maroon-700' : 'text-gold-500'} /> {t(c.label)}</span>
                        <span className="flex items-center gap-1.5 text-[0.6875rem] text-black">
                          ({rows.length})
                          <ChevronDown size={15} className={`transition-transform ${isOpen ? 'rotate-180 text-maroon-600' : ''}`} />
                        </span>
                      </button>

                      {/* AccordionDetails — fee table */}
                      <div className={`grid transition-all duration-300 ease-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                        <div className="overflow-hidden">
                          <div className="px-3 pb-3">
                            {rows.length === 0 ? (
                              <div className="text-[0.6875rem] text-black py-2"><T>No poojas listed.</T></div>
                            ) : (
                              <table className="w-full text-[0.75rem]">
                                <thead>
                                  <tr className="text-gold-600 border-b border-gold-200">
                                    <th className="text-left font-bold py-1.5"><T>Pooja</T></th>
                                    {showFreq && <th className="text-left font-bold py-1.5 px-2"><T>Plan</T></th>}
                                    <th className="text-right font-bold py-1.5"><T>Fee</T></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.map((s) => {
                                    const picked = detail?.id === s.id   // row whose detail is open
                                    return (
                                      <tr
                                        key={s.id}
                                        onClick={() => setDetail(s)}
                                        className={`cursor-pointer border-b border-gold-100 last:border-0 transition-colors ${
                                          picked ? 'bg-gold-100' : 'hover:bg-gold-50'
                                        }`}
                                      >
                                        <td className={`py-1.5 pr-2 ${picked ? 'font-bold text-maroon-700' : 'text-black'}`}>{te(s, 'name')}</td>
                                        {/* One plan → its name; several → the count, so the
                                            "2 plans" string is composed rather than baked in. */}
                                        {showFreq && <td className="py-1.5 px-2 text-black whitespace-nowrap">
                                          {s.planRows?.length > 1
                                            ? <>{s.planRows.length} <T>plans</T></>
                                            : s.plans ? <T>{s.plans}</T> : '—'}
                                        </td>}
                                        <td className="py-1.5 text-right font-semibold text-maroon-700">
                                          {s.committee ? <span className="text-[0.625rem] text-black font-medium"><T>Committee Decided</T></span> : <span className="whitespace-nowrap">₹{fmt(s.amount)}</span>}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="card p-4 bg-gradient-to-br from-ivory to-gold-50">
              <div className="flex items-center gap-2 text-maroon-700 font-bold text-sm"><PhoneCall size={16} className="text-gold-500" />{' '}<T>Need Help?</T></div>
              <div className="mt-3 space-y-2">
                <a href="tel:+9104023353589" className="flex items-center gap-2 text-sm text-black hover:text-maroon-700">
                  <span className="w-7 h-7 rounded-full border border-gold-300 bg-gold-50 text-maroon-600 grid place-items-center shrink-0"><Phone size={13} /></span>
                  +91 040 2335 3589
                </a>
                <div className="flex items-center gap-2 text-sm text-black">
                  <span className="w-7 h-7 rounded-full border border-gold-300 bg-gold-50 text-maroon-600 grid place-items-center shrink-0"><Clock size={13} /></span><T>9:00 AM – 8:00 PM</T>{' '}</div>
              </div>
            </div>
          </aside>

          {/* ── Right content ── */}
          <div>
            {detail ? (
              <ServiceDetail
                key={detail.id}
                seva={detail}
                image={SEVA_IMAGE[detail.name] || catImage[detail.category] || catImage.Daily}
                emoji={sevaEmoji[detail.code]}
                onBack={() => setDetail(null)}
              />
            ) : (
              <div className="animate-fade-in">
                <div className="flex items-baseline justify-between gap-3 mb-4">
                  <h2 className="font-serif text-2xl font-bold text-maroon-700">{t(activeLabel)}</h2>
                  <span className="shrink-0 text-[0.6875rem] font-semibold text-maroon-700 bg-gold-50 border border-gold-200 rounded-full px-2.5 py-1">
                    {filtered.length} {filtered.length === 1 ? t('service') : t('services')}
                  </span>
                </div>

                {filtered.length === 0 ? (
                  <div className="card p-10 text-center text-black text-sm"><T>No services match your search.</T></div>
                ) : (
                  <div className="space-y-4">
                    {filtered.map((s, i) => (
                      <ServiceCard
                        key={s.id}
                        seva={s}
                        image={SEVA_IMAGE[s.name] || catImage[s.category] || catImage.Daily}
                        emoji={sevaEmoji[s.code]}
                        onView={() => setDetail(s)}
                        style={{ animationDelay: `${Math.min(i * 60, 360)}ms` }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Horizontal service card (image left, info + CTA right) ── */
function ServiceCard({ seva, image, emoji, onView, style }) {
  const { t, lang } = useLang()
  const te = useContentText()
  return (
    <div className="card overflow-hidden flex flex-col sm:flex-row group animate-slide-up" style={style}>
      <div className="sm:w-36 sm:h-36 shrink-0 relative overflow-hidden">
        <img src={image} alt={te(seva, 'name')} className="w-full h-28 sm:h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-t from-maroon-900/40 to-transparent" />
        <span className="absolute top-1.5 left-1.5 text-[0.5625rem] font-bold uppercase tracking-wide bg-white/90 text-maroon-700 rounded-full px-1.5 py-0.5">{t(seva.category)}</span>
        {emoji && <span className="absolute bottom-1.5 right-1.5 text-lg drop-shadow-lg">{emoji}</span>}
      </div>

      <div className="flex-1 p-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm text-maroon-700">{te(seva, 'name')}</h3>
          {lang === 'en' && seva.nameTe && <p className="text-[0.625rem] text-black font-telugu">{seva.nameTe}</p>}
          {/* A "plans" chip where the pooja offers choices, and a "terms apply"
              hint only where it carries a real quota/validity. Plain same-day
              poojas (Abhishekam, one-time ceremonies) show neither. */}
          {(sevaMultiPlan(seva) || sevaHasTerms(seva)) && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {sevaMultiPlan(seva) && (
                <span className="text-[0.625rem] font-semibold text-maroon-700 bg-maroon-50 rounded-full px-2 py-0.5">{seva.planRows.length} <T>plans</T></span>
              )}
              {sevaHasTerms(seva) && (
                <span className="text-[0.625rem] font-semibold text-gold-700 bg-gold-50 border border-gold-200 rounded-full px-2 py-0.5"><T>Terms apply</T></span>
              )}
            </div>
          )}
        </div>

        <div className="sm:text-right shrink-0">
          <div className="text-[0.5625rem] uppercase tracking-wide text-[#800020] font-semibold">{(sevaMultiPlan(seva) || sevaHasTerms(seva)) ? <T>Starting From</T> : <T>Offering</T>}</div>
          <div className="text-lg font-extrabold text-maroon-700 leading-tight">
            {seva.committee ? <span className="text-xs"><T>Committee decided</T></span> : <>₹{fmt(seva.amount)}</>}
          </div>
          <button
            onClick={onView}
            className="btn-maroon !rounded-lg !py-1.5 !px-3 !text-[0.6875rem] mt-2 hover:!bg-gold-cta hover:!text-maroon-900"
          >
            {sevaHasTerms(seva) ? <T>View Plans &amp; Terms</T> : <T>View Details</T>} <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── In-place detail view (no route / modal — replaces the list) ── */
function ServiceDetail({ seva, image, emoji, onBack }) {
  const { t, lang } = useLang()
  const te = useContentText()
  const plans = seva.planRows || []
  const multi = plans.length > 1
  // Multi-plan poojas start unselected (the table is the chooser); single-plan
  // poojas are implicitly "selected".
  const [planIdx, setPlanIdx] = useState(multi ? null : 0)
  const selected = planIdx != null ? plans[planIdx] : null
  const hasTerms = sevaHasTerms(seva)
  const singleValidity = !multi && plans[0] ? planQuota(plans[0].plan) : null

  return (
    <div className="animate-fade-in">
      <button onClick={onBack} className="btn-ghost !px-2 !py-1 !text-xs mb-2 text-maroon-700">
        <ArrowLeft size={14} />{' '}<T>Back to list</T>{' '}</button>

      <div className="card overflow-hidden animate-slide-up">
        <div className="grid md:grid-cols-[40%_60%]">
          {/* Left — image */}
          <div className="relative min-h-[9.375rem]">
            <img src={image} alt={te(seva, 'name')} className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-maroon-900/50 to-transparent" />
            {emoji && <span className="absolute bottom-2 left-2 text-xl drop-shadow-lg">{emoji}</span>}
            <span className="absolute top-2 left-2 text-[0.5625rem] font-bold uppercase tracking-wide bg-white/90 text-maroon-700 rounded-full px-2 py-0.5">{t(seva.category)}</span>
          </div>

          {/* Right — details */}
          <div className="p-4">
            <div className="font-script text-lg text-gold-500 leading-none"><T>About</T></div>
            <h2 className="font-serif text-lg font-bold text-maroon-700">{te(seva, 'name')}</h2>
            {lang === 'en' && seva.nameTe && <p className="text-[0.6875rem] text-black font-telugu">{seva.nameTe}</p>}
            <Flourish className="justify-start my-1.5" width="w-8" />
            <p className="text-[0.75rem] text-black leading-relaxed">
              {/* The generic fallback is composed, not interpolated — a template
                  literal with the name baked in could never match a dictionary key. */}
              {(lang === 'te' && SEVA_ABOUT_TE[seva.name]) || SEVA_ABOUT[seva.name] || seva.desc
                ? <T>{(lang === 'te' && SEVA_ABOUT_TE[seva.name]) || SEVA_ABOUT[seva.name] || seva.desc}</T>
                : `${te(seva, 'name')} ${t('is a sacred offering performed at the temple as an expression of devotion, bringing peace, prosperity and blessings to devotees.')}`}
            </p>

            {/* A pooja offered on several plans lists them all; a single-plan
                pooja just shows its one offering price. */}
            {multi ? (
              <div className="mt-4">
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-[0.6875rem] uppercase tracking-wide text-black font-semibold"><T>Available Plans</T>{' '}</span>
                  <span className="text-[0.6875rem] text-gold-600"><T>Select a plan for details</T></span>
                </div>

                <table className="w-full text-sm border border-gold-200 rounded-xl overflow-hidden">
                  <thead>
                    <tr className="bg-gold-50 text-gold-600 text-[0.6875rem] uppercase tracking-wide">
                      <th className="text-left font-bold px-3 py-2"><T>Plan</T></th>
                      <th className="text-left font-bold px-3 py-2"><T>Validity</T></th>
                      <th className="text-right font-bold px-3 py-2"><T>Fee</T></th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map((p, i) => (
                      <tr
                        key={p.plan}
                        onClick={() => setPlanIdx(i)}
                        className={`border-t border-gold-100 cursor-pointer transition-colors ${
                          planIdx === i ? 'bg-gold-100' : 'hover:bg-gold-50'
                        }`}
                      >
                        <td className={`px-3 py-2 ${planIdx === i ? 'font-bold text-maroon-700' : 'text-black'}`}>
                          <T>{p.plan}</T>
                        </td>
                        <td className="px-3 py-2 text-[0.6875rem] text-gray-600">{planValidity(p.plan) ? <T>{planValidity(p.plan)}</T> : '—'}</td>
                        <td className="px-3 py-2 text-right font-semibold text-maroon-700 whitespace-nowrap">
                          {p.committee
                            ? <span className="text-xs text-black font-medium"><T>Committee Decided</T></span>
                            : `₹${fmt(p.amount)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {selected && (
                  <div key={selected.plan}
                       className="mt-3 rounded-xl border border-gold-300 bg-gold-50 px-4 py-3 animate-fade-in">
                    <div className="text-[0.625rem] font-bold uppercase tracking-wide text-gold-600"><T>Selected Plan</T></div>
                    <div className="font-serif text-lg font-bold text-maroon-700 mt-0.5">
                      {te(seva, 'name')} — {t(selected.plan)}
                    </div>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-[0.6875rem] uppercase tracking-wide text-black font-semibold"><T>Offering</T></span>
                      <span className="text-xl font-extrabold text-maroon-700">
                        {selected.committee ? <span className="text-base"><T>Committee Decided</T></span> : `₹${fmt(selected.amount)}`}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-[0.625rem] uppercase tracking-wide text-black font-semibold"><T>Offering</T></span>
                <span className="text-lg font-extrabold text-maroon-700">{priceLabel(seva)}</span>
                {!seva.committee && <span className="text-xs font-semibold text-black">/-</span>}
              </div>
            )}

            {/* Booking terms — shown ONLY for poojas that carry validity/quota
                (Vishesha, Nithya, festivals). Simple same-day poojas skip this. */}
            {hasTerms && (
              <div className="mt-4 rounded-xl border border-maroon-200 bg-maroon-50/50 px-3.5 py-2.5">
                <div className="flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-wide text-maroon-700"><ShieldCheck size={13} /> <T>Booking Terms</T></div>
                <p className="text-[0.75rem] text-black leading-relaxed mt-1">
                  {singleValidity
                    ? <><T>{singleValidity}</T>. <T>Validity begins from the booking date; each pooja is performed once per day.</T></>
                    : <T>Each plan above has its own validity — select a plan to see its terms. Validity begins from the booking date.</T>}
                </p>
              </div>
            )}

            {/* How to book — counter-first, matching the temple's actual flow */}
            <div className="mt-4 flex items-center gap-2.5 bg-gold-50 border border-gold-200 rounded-xl px-3.5 py-2.5">
              <PhoneCall size={15} className="text-gold-600 shrink-0" />
              <p className="text-[0.75rem] text-black"><T>Book this pooja at the temple counter — a ticket with a scannable QR is issued instantly. For queries call</T>{' '}<a href="tel:+9104023353589" className="font-semibold text-maroon-700 hover:underline">+91 040 2335 3589</a>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
