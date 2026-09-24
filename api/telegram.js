import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Extend Vercel serverless execution limit for audio/image processing
export const maxDuration = 30;

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FIRESTORE_PROJECT_ID = 'kabunfarm';

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

let adminDb = null;
let lastAdminInitError = null;
let lastFirestoreSaveError = null;

function getAdminFirestore() {
    if (adminDb) return adminDb;
    try {
        if (!getApps().length) {
            const rawSA = process.env.FIREBASE_SERVICE_ACCOUNT;
            if (!rawSA) {
                lastAdminInitError = 'FIREBASE_SERVICE_ACCOUNT env variable is missing in Vercel';
                console.warn(lastAdminInitError);
                return null;
            }

            let serviceAccount;
            try {
                serviceAccount = typeof rawSA === 'string' ? JSON.parse(rawSA.trim()) : rawSA;
            } catch (pe) {
                lastAdminInitError = 'JSON.parse error on FIREBASE_SERVICE_ACCOUNT: ' + pe.message;
                console.error(lastAdminInitError);
                return null;
            }

            if (serviceAccount && serviceAccount.private_key) {
                if (typeof serviceAccount.private_key === 'string') {
                    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
                }
                initializeApp({
                    credential: cert(serviceAccount),
                    projectId: serviceAccount.project_id || FIRESTORE_PROJECT_ID
                });
            } else {
                lastAdminInitError = 'serviceAccount JSON missing private_key field';
                console.error(lastAdminInitError);
                return null;
            }
        }
        adminDb = getFirestore();
        return adminDb;
    } catch (e) {
        lastAdminInitError = 'initializeApp error: ' + (e.message || String(e));
        console.error('Firebase Admin init error:', e.message || e);
        return null;
    }
}

// ============================================================================
// Inventory context — Firestore `inventory` collection is the single source of
// truth for product names, pricing, and dosing. The prompt builders below are
// formatted dynamically from it (with a static fallback snapshot mirroring
// DEFAULT_INVENTORY in js/state.js, used only when Admin SDK is unavailable).
// ============================================================================
const FALLBACK_INVENTORY = [
    { id: "bio_botava", name: "KMB Bio Botava", category: "foliar", packPrice: 94.00, packSize: 1000, unit: "ml", costPerUnit: 0.094, dosePerLitre: 2.5, doseUnit: "ml", dosePerApplication: 0, moaCode: "IRAC UNM", phiDays: 0 },
    { id: "amino_18", name: "KMB Amino 18", category: "foliar", packPrice: 35.00, packSize: 1000, unit: "ml", costPerUnit: 0.035, dosePerLitre: 2.0, doseUnit: "ml", dosePerApplication: 0, moaCode: "NUT-AMINO", phiDays: 0 },
    { id: "garlic_oil", name: "Garlic Oil Extract", category: "foliar", packPrice: 35.00, packSize: 1000, unit: "ml", costPerUnit: 0.035, dosePerLitre: 1.5, doseUnit: "ml", dosePerApplication: 0, moaCode: "IRAC UNM", phiDays: 0 },
    { id: "neem_oil", name: "Neem Oil", category: "foliar", packPrice: 34.00, packSize: 1000, unit: "ml", costPerUnit: 0.034, dosePerLitre: 5.0, doseUnit: "ml", dosePerApplication: 0, moaCode: "IRAC UNM", phiDays: 0 },
    { id: "wood_vinegar", name: "Wood Vinegar", category: "foliar", packPrice: 18.00, packSize: 1000, unit: "ml", costPerUnit: 0.018, dosePerLitre: 2.0, doseUnit: "ml", dosePerApplication: 0, moaCode: "FRAC M", phiDays: 0 },
    { id: "seaweed", name: "Seaweed Extract", category: "foliar", packPrice: 60.00, packSize: 1000, unit: "ml", costPerUnit: 0.060, dosePerLitre: 1.5, doseUnit: "ml", dosePerApplication: 0, moaCode: "BIO-KELP", phiDays: 0 },
    { id: "pest_guard_2", name: "KMB Pest Guard 2 (Powder)", category: "foliar", packPrice: 75.00, packSize: 500, unit: "g", costPerUnit: 0.150, dosePerLitre: 3.0, doseUnit: "g", dosePerApplication: 0, moaCode: "IRAC UNM", phiDays: 0 },
    { id: "wira_calbo", name: "Wira CalBo", category: "foliar", packPrice: 45.00, packSize: 1000, unit: "ml", costPerUnit: 0.045, dosePerLitre: 2.0, doseUnit: "ml", dosePerApplication: 0, moaCode: "NUT-CA-B", phiDays: 0 },
    { id: "antracol", name: "Antracol 70 WP", category: "foliar", packPrice: 45.00, packSize: 1000, unit: "g", costPerUnit: 0.045, dosePerLitre: 2.0, doseUnit: "g", dosePerApplication: 0, moaCode: "FRAC M02", phiDays: 7 },
    { id: "em4", name: "EM4", category: "foliar", packPrice: 25.00, packSize: 1000, unit: "ml", costPerUnit: 0.025, dosePerLitre: 5.0, doseUnit: "ml", dosePerApplication: 0, moaCode: "BIO-01", phiDays: 0 },
    { id: "abamectin", name: "Abamectin", category: "foliar", packPrice: 38.00, packSize: 1000, unit: "ml", costPerUnit: 0.038, dosePerLitre: 1.0, doseUnit: "ml", dosePerApplication: 0, moaCode: "IRAC 6", phiDays: 7 },
    { id: "cypermethrin", name: "Cypermethrin", category: "foliar", packPrice: 35.00, packSize: 1000, unit: "ml", costPerUnit: 0.035, dosePerLitre: 1.5, doseUnit: "ml", dosePerApplication: 0, moaCode: "IRAC 3A", phiDays: 7 },
    { id: "npk_11_11_11", name: "RealStrong NPK 11-11-11", category: "fertilizer", packPrice: 115.00, packSize: 25, unit: "kg", costPerUnit: 4.60, dosePerLitre: 0, doseUnit: "kg", dosePerApplication: 1, moaCode: "NUTRITION", phiDays: 0 },
    { id: "npk_8_8_29", name: "RealStrong NPK 8-8-29", category: "fertilizer", packPrice: 140.00, packSize: 25, unit: "kg", costPerUnit: 5.60, dosePerLitre: 0, doseUnit: "kg", dosePerApplication: 1, moaCode: "NUTRITION", phiDays: 0 },
    { id: "bluvita_16_16_16", name: "Bluvita NPK 16-16-16", category: "fertilizer", packPrice: 185.00, packSize: 50, unit: "kg", costPerUnit: 3.70, dosePerLitre: 0, doseUnit: "kg", dosePerApplication: 1, moaCode: "NUTRITION", phiDays: 0 },
    { id: "dolomite", name: "Dolomite (Kapur Pertanian)", category: "fertilizer", packPrice: 20.00, packSize: 25, unit: "kg", costPerUnit: 0.80, dosePerLitre: 0, doseUnit: "kg", dosePerApplication: 1, moaCode: "NUTRITION", phiDays: 0 }
];

const INVENTORY_CACHE_TTL_MS = 5 * 60 * 1000;
let inventoryCache = { items: null, fetchedAt: 0 };

async function fetchInventoryContext() {
    const now = Date.now();
    if (inventoryCache.items && (now - inventoryCache.fetchedAt) < INVENTORY_CACHE_TTL_MS) {
        return inventoryCache.items;
    }

    const adminFirestore = getAdminFirestore();
    if (adminFirestore) {
        try {
            const snap = await adminFirestore.collection('inventory').get();
            const items = [];
            snap.forEach(doc => {
                const d = doc.data();
                if (d.status === 'deleted') return;
                items.push({
                    id: d.id || doc.id,
                    name: d.name || doc.id,
                    category: d.category || '',
                    unit: d.unit || '',
                    packPrice: parseFloat(d.packPrice) || 0,
                    packSize: parseFloat(d.packSize) || 0,
                    costPerUnit: parseFloat(d.costPerUnit) || 0,
                    dosePerLitre: parseFloat(d.dosePerLitre) || 0,
                    doseUnit: d.doseUnit || d.unit || '',
                    dosePerApplication: parseFloat(d.dosePerApplication) || 0,
                    moaCode: d.moaCode || '',
                    phiDays: parseInt(d.phiDays, 10) || 0,
                    standardDosage: d.standardDosage || ''
                });
            });
            if (items.length) {
                inventoryCache = { items, fetchedAt: now };
                return items;
            }
            console.warn('Firestore inventory collection is empty, using fallback snapshot');
        } catch (e) {
            console.warn('Firestore inventory fetch failed, using fallback snapshot:', e.message || e);
        }
    } else {
        console.warn('Admin SDK unavailable for inventory fetch, using fallback snapshot');
    }

    inventoryCache = { items: FALLBACK_INVENTORY, fetchedAt: now };
    return FALLBACK_INVENTORY;
}

function formatInventoryForPrompt(items) {
    const foliar = items
        .filter(i => i.dosePerLitre > 0)
        .sort((a, b) => a.name.localeCompare(b.name));
    const granular = items
        .filter(i => !(i.dosePerLitre > 0) && (i.costPerUnit > 0))
        .sort((a, b) => a.name.localeCompare(b.name));

    const lines = [];
    let n = 1;
    foliar.forEach(i => {
        const packDesc = i.packPrice > 0 && i.packSize > 0
            ? `RM ${i.packPrice}/${i.packSize}${i.unit} = RM ${i.costPerUnit}/${i.unit}`
            : `RM ${i.costPerUnit}/${i.unit}`;
        const moa = i.moaCode ? `${i.moaCode} - ` : '';
        const phi = i.phiDays > 0 ? `, ${i.phiDays}-day PHI` : '';
        lines.push(`${n}. ${i.name} (${i.dosePerLitre} ${i.doseUnit || i.unit}/L, ${packDesc}, ${moa}${i.category || 'foliar'}${phi})`);
        n++;
    });
    granular.forEach(i => {
        const packDesc = i.packPrice > 0 && i.packSize > 0
            ? `RM ${i.packPrice}/${i.packSize}${i.unit} = RM ${i.costPerUnit}/${i.unit}`
            : `RM ${i.costPerUnit}/${i.unit}`;
        const appDesc = i.dosePerApplication > 0 ? `, standard application: ${i.dosePerApplication} ${i.unit}` : '';
        lines.push(`${n}. ${i.name} (${packDesc}${appDesc} - ${i.category || 'fertilizer'})`);
        n++;
    });
    return lines.join('\n');
}

function buildSystemPrompt(items) {
    const inventoryBlock = formatInventoryForPrompt(items);
    return `
You are the AI Farm Intelligence Assistant for Kabun Farm.
Your job is to parse voice messages or text sent by farmers and extract structured farm activity logs, sales records, overhead expenses, or planning commands.

The farm stocks the following registered inventory items (live from the Firestore inventory collection):
${inventoryBlock}

Users may speak or type in:
- Bahasa Melayu (Standard or Colloquial: "Dah kutip terung batas 2 dapat 15 kilo", "Jual terung 30kg RM5/kg", "Batas 3 dah siram air", "Tabur Bluvita 16-16-16 1kg batas 2", "Bayar bil elektrik RM145", "Beli diesel pam air RM50", "Batalkan plan racun hari ni", "Plan spray neem esok petang")
- Manglish / English ("Harvested 20kg red amaranth bed 4", "Sold 10kg chili RM8 per kg", "Applied 2kg RealStrong 8-8-29 on bed 1", "Paid SESB electricity bill RM150", "Cancel watering plan for today")
- Indonesian ("Sudah petik terong 12 kilo bed 1", "Beli solar RM60")
- Chinese ("今天二号床采收了15公斤茄子", "支付电费145马币")

Extract the intent and return ONLY a valid JSON object matching one of these 5 schemas:

SCHEMA 1: SALE LOG
{
  "type": "sale",
  "crop": "Canonical English Crop Name",
  "quantity": 15.0,
  "unit": "kg",
  "pricePerUnit": 5.00,
  "totalRevenue": 75.00,
  "notes": "Optional customer or destination note",
  "date": "YYYY-MM-DD"
}

SCHEMA 2: FARM ACTIVITY LOG (COMPLETED work: harvest, watering, pest_control, sowing)
{
  "type": "activity",
  "category": "harvest" | "watering" | "pest_control" | "sowing",
  "bedNumber": "1", // or "all", or "plot_xxx" if specified
  "cropName": "Canonical English Crop Name",
  "weight": 15.0, // only for harvest in kg
  "inputsUsed": "e.g. KMB Bio Botava, Neem Oil, Bluvita 16-16-16, RealStrong 8-8-29, etc.",
  "costRM": 0.00, // optional cost in RM
  "date": "YYYY-MM-DD"
}

SCHEMA 3: FARM OVERHEAD EXPENSE (Bills, Fuel, Labor, Supplies, Maintenance)
(Trigger words: "bayar bil", "bil elektrik", "electricity bill", "beli diesel", "solar", "petrol", "upah pekerja", "gaji", "wages", "beli paip", "fitting", "repair", "racun", "baja")
{
  "type": "expense",
  "category": "utilities" | "fuel" | "labor" | "supplies" | "maintenance" | "general",
  "amount": 145.00,
  "note": "Description (e.g. SESB Electricity bill, 20L Diesel for pump, Worker wages)",
  "date": "YYYY-MM-DD"
}

SCHEMA 4: CANCEL / DELETE PLANNED TASK
(Trigger words: "cancel plan", "batalkan plan", "batal jadual", "delete task", "tak jadi spray", "cancel watering")
{
  "type": "cancel_task",
  "category": "pest_control" | "watering" | "harvest" | "sowing" | "all",
  "date": "YYYY-MM-DD"
}

SCHEMA 5: SCHEDULE / ADD PLANNED TASK
(Trigger words: "plan spray for tomorrow", "jadualkan siram", "schedule harvest", "set task")
{
  "type": "schedule_task",
  "category": "pest_control" | "watering" | "harvest" | "sowing",
  "bedNumber": "1", // or "all"
  "timeSlot": "Morning" | "Evening" | "Anytime",
  "note": "Description of task or recipe using the inventory products listed above",
  "date": "YYYY-MM-DD"
}

Crop Normalization Rules:
- bayam merah -> Red Amaranth
- bayam / bayam hijau -> Green Amaranth
- terung / terong -> Eggplant
- bendi -> Okra
- timun -> Cucumber
- cili / lada -> Chili
- kangkung / kangkong -> Water Spinach
- jagung -> Sweet Corn
- sawi -> Choy Sum
- tomato -> Tomato

Scope & Bed/Plot Normalization Rules:
- If a specific bed is mentioned ("batas 2", "bed 2", "batas nombor 3", "no 4", "二号床", "bed #5"):
  extract ONLY the clean numeric digit string (e.g. "2", "3", "4", "5") as "bedNumber".
- If a plot or block is mentioned ("plot 1", "plot A", "blok A", "plot jambu"):
  extract the plot name (e.g. "Plot 1", "Plot A", "Blok A") as "bedNumber".
- If multiple beds are mentioned ("batas 1 dan 2", "bed 3-5"):
  extract as comma-separated digits (e.g. "1, 2") as "bedNumber".
- ONLY return "all" if the user explicitly mentions whole farm ("semua batas", "seluruh kebun", "all beds", "whole farm") or mentions NO bed/plot at all.
- NEVER return "all" if a bed number or plot is specified in the message!

Colloquial Price/Weight Rules:
- "setengah" -> 0.5 (e.g. "RM 6 setengah" = 6.50, "dua kilo setengah" = 2.5)
- "suku" -> 0.25

Today's Date: ${new Date().toISOString().slice(0, 10)}.
Return pure JSON only, without markdown fences or extra explanations.
`;
}

function buildDiagnosisPrompt(items) {
    const inventoryBlock = formatInventoryForPrompt(items.filter(i => i.dosePerLitre > 0));
    return `
You are the Expert Agronomist and Plant Pathologist for Kabun Farm (tropical vegetable market garden in Malaysia).
Analyze the provided crop leaf or plant photo and any optional user caption.

The farm stocks ONLY these registered spray products (live from the Firestore inventory collection):
${inventoryBlock}

Pathology Rules:
- If Whiteflies/Aphids/Mites: Prescribe Neem Oil + Soap OR KMB Bio Botava. (If severe mites, mention Abamectin IRAC 6 as backup).
- If Caterpillars/Plutella/Armyworms: Prescribe KMB Pest Guard 2 (or Cypermethrin IRAC 3A if severe).
- If Anthracnose/Leaf Spots: Prescribe Antracol (2g/L) or Wood Vinegar (1:500).
- If Blossom End Rot / Yellowing: Prescribe Wira CalBo or KMB Amino 18.
- If Incurable (Bacterial Wilt / Chili Leaf Curl Virus): Set "isIncurable": true. Prescribe Rogueing (uproot and destroy immediately). DO NOT prescribe spray.
- Spray Timing Rule: Always specify Evening (> 5:30 PM) to avoid leaf burn and protect bees.

Extract the diagnosis and return ONLY a valid JSON object matching this schema:
{
  "type": "diagnosis",
  "crop": "Eggplant" | "Chili" | "Red Amaranth" | "Okra" | "Cucumber" | "Water Spinach" | "Other",
  "issue": "Specific Pest / Pathogen Name (e.g. Whitefly Infestation / Kutu Putih)",
  "category": "pest" | "fungal" | "bacterial" | "viral" | "deficiency" | "healthy",
  "confidence": "High" | "Medium" | "Low",
  "symptoms": "Detailed visual symptoms observed on leaf / fruit",
  "isIncurable": false,
  "prescribedRemedy": "Exact recipe using the farm's stocked items listed above",
  "moaCode": "IRAC UNM" | "FRAC M02" | "IRAC 6" | "IRAC 3A" | "Nutrition" | "Cultural",
  "phiDays": 0, // 7 for Antracol/Abamectin/Cypermethrin, 0 for organics
  "applicationTiming": "Evening (after 5:30 PM)",
  "bedNumber": "1" | null, // extract bed number if user mentions it in caption (e.g. "batas 2", "bed 3")
  "autoSchedule": false // true if user caption explicitly asks to schedule/plan (e.g. "jadualkan spray", "plan tolong set")
}
`;
}

// Helper: Send typing / action indicator
async function sendChatAction(chatId, action = 'typing') {
    if (!TELEGRAM_TOKEN) return;
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendChatAction`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, action })
        });
    } catch (e) {
        console.error('sendChatAction error:', e);
    }
}

export let lastTelegramSendError = null;

// Helper: Send message to Telegram chat with automatic Markdown-fallback
export async function sendTelegramMessage(chatId, text) {
    if (!TELEGRAM_TOKEN) {
        lastTelegramSendError = 'TELEGRAM_BOT_TOKEN is missing in environment variables';
        console.error(lastTelegramSendError);
        return null;
    }
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: 'Markdown'
            })
        });
        if (res.ok) {
            const data = await res.json();
            return data.result?.message_id || null;
        } else {
            const errText = await res.text();
            lastTelegramSendError = `Markdown send failed (${res.status}): ${errText}`;
            console.warn('sendTelegramMessage markdown failed, trying plain text fallback:', errText);

            // Fallback: Strip formatting characters and send as plain text
            const plainRes = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: text.replace(/[*_`\[\]]/g, '')
                })
            });
            if (plainRes.ok) {
                const plainData = await plainRes.json();
                return plainData.result?.message_id || null;
            } else {
                const plainErrText = await plainRes.text();
                lastTelegramSendError = `Plain send failed (${plainRes.status}): ${plainErrText}`;
                console.error('sendTelegramMessage plain text fallback failed:', plainErrText);
            }
        }
    } catch (e) {
        lastTelegramSendError = e.message || String(e);
        console.error('sendTelegramMessage error:', e);
    }
    return null;
}

// Helper: Generate structured Daily / Multi-day task briefing with live weather
export async function generateDailyBriefing(daysCount = 1) {
    // Current time in Kudat, Sabah (UTC+8)
    const sabahTime = new Date(Date.now() + 8 * 3600 * 1000);
    const todayStr = sabahTime.toISOString().slice(0, 10);

    // Weather Fetch (Open-Meteo for Kudat, Sabah)
    let weatherSnippet = '';
    try {
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=6.828472&longitude=116.765778&timezone=Asia%2FKuching&daily=precipitation_probability_max,temperature_2m_max,weather_code&forecast_days=3`;
        const wRes = await fetch(weatherUrl);
        if (wRes.ok) {
            const wData = await wRes.json();
            const daily = wData.daily;
            if (daily && daily.time && daily.time.length) {
                const todayRain = daily.precipitation_probability_max?.[0] ?? 0;
                const todayTemp = daily.temperature_2m_max?.[0] ?? 31;

                let rainIcon = '☀️';
                let sprayAdvice = '✅ Safe spray window';
                if (todayRain >= 60) {
                    rainIcon = '🌧️';
                    sprayAdvice = '⚠️ High rain risk — delay open foliar sprays';
                } else if (todayRain >= 30) {
                    rainIcon = '⛅';
                    sprayAdvice = '🌤️ Moderate rain risk — check sky or spray early';
                }

                weatherSnippet = `\n🌦️ *Weather (Kudat, Sabah):* ${rainIcon} ${todayTemp}°C | Rain Risk: *${todayRain}%*\n💡 _${sprayAdvice}_\n`;
            }
        }
    } catch (we) {
        console.warn('Weather fetch note:', we.message);
    }

    // Query Firestore Tasks and Plots via Admin SDK
    const adminFirestore = getAdminFirestore();
    let tasks = [];
    const plotMap = {};

    if (adminFirestore) {
        try {
            // Fetch plots for name resolution
            const plotSnap = await adminFirestore.collection('plots').get();
            plotSnap.forEach(doc => {
                const p = doc.data();
                const pName = p.name || p.title || '';
                if (pName) {
                    plotMap[doc.id] = pName;
                    if (p.id) plotMap[p.id] = pName;
                    const clean = doc.id.replace(/^plot_?/i, '');
                    plotMap[clean] = pName;
                }
            });

            if (daysCount === 1) {
                const snap = await adminFirestore.collection('tasks').where('date', '==', todayStr).get();
                snap.forEach(doc => {
                    const data = doc.data();
                    if (data.status !== 'deleted') tasks.push(data);
                });
            } else {
                const snap = await adminFirestore.collection('tasks').where('date', '>=', todayStr).get();
                snap.forEach(doc => {
                    const data = doc.data();
                    if (data.status !== 'deleted') tasks.push(data);
                });
            }
        } catch (te) {
            console.error('Fetch tasks error:', te);
        }
    }

    // Helper: Resolve human-friendly scope name (Bed 1, Plot "Eggplant Plot", Whole Farm)
    const resolveScopeName = (raw) => {
        if (!raw || raw === 'all' || raw === 'Whole Farm') return 'Whole Farm';
        const str = String(raw).trim();
        if (!str || str.toLowerCase() === 'all') return 'Whole Farm';

        // Check if matching plot in plotMap
        if (plotMap[str]) return `Plot "${plotMap[str]}"`;
        const cleanId = str.replace(/^plot_?/i, '');
        if (plotMap[cleanId]) return `Plot "${plotMap[cleanId]}"`;

        if (/^(?:plot|blok|block)/i.test(str)) {
            const named = str.replace(/^(?:plot|blok|block)[_\s]*/i, 'Plot ').trim();
            // If it's a raw timestamp ID like "Plot 1787328691648", just display "Plot"
            if (/^Plot \d{10,}$/.test(named)) return 'Plot';
            return named;
        }
        return `Bed ${str}`;
    };

    const icons = { watering: '💧', harvest: '🧺', pest_control: '🐛', sowing: '🌱' };

    // If 1 Day View (/today or morning reminder)
    if (daysCount === 1) {
        if (!tasks.length) {
            return `🌱 *Kabun Farm Daily Briefing*
📅 *Date:* ${todayStr} (Today)
━━━━━━━━━━━━━━━${weatherSnippet}
✅ *No scheduled tasks for today!*
_All clear. Enjoy your farm day! 🚜_

💡 *Reply "Plan spray batas 1 esok" to schedule tasks.*`;
        }

        // Group by Time Slot
        const morningTasks = tasks.filter(t => t.timeSlot === 'Morning');
        const eveningTasks = tasks.filter(t => t.timeSlot === 'Evening');
        const anytimeTasks = tasks.filter(t => t.timeSlot !== 'Morning' && t.timeSlot !== 'Evening');

        let text = `🌱 *Kabun Farm Daily Briefing*
📅 *Date:* ${todayStr} (Today)
━━━━━━━━━━━━━━━${weatherSnippet}
📋 *${tasks.length} Scheduled Task(s):*\n`;

        const formatGroup = (title, icon, list) => {
            if (!list.length) return '';
            let groupStr = `\n${icon} *${title}:*\n`;
            list.forEach(t => {
                const catIcon = icons[t.activityCategory] || '📝';
                const catName = (t.activityCategory || 'task').toUpperCase().replace('_', ' ');
                const scope = resolveScopeName(t.bedNumber || t.bedScope);
                const doneMark = t.status === 'done' ? '✅ _(Done)_ ' : '⏳ ';
                groupStr += `${doneMark}${catIcon} *${catName}* — ${scope}\n`;
                if (t.note) groupStr += `   └ 📝 _${t.note}_\n`;
            });
            return groupStr;
        };

        text += formatGroup('MORNING CHORES', '🌅', morningTasks);
        text += formatGroup('EVENING SPRAYS & TASKS', '🌇', eveningTasks);
        text += formatGroup('ANYTIME / GENERAL', '🕒', anytimeTasks);

        text += `\n━━━━━━━━━━━━━━━\n💡 *Tip: Check tasks off in your Kabun Farm PWA or reply "Batalkan plan racun" to cancel.*`;
        return text;
    }

    // If Multi-Day Plan View (/plan)
    if (!tasks.length) {
        return `🗓️ *Kabun Farm Upcoming Schedule*
━━━━━━━━━━━━━━━${weatherSnippet}
✅ *No upcoming tasks scheduled.*
_Add tasks from the PWA Plan tab or reply "Plan spray batas 2 esok petang"!_`;
    }

    // Sort by date ascending
    tasks.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    // Group by Date
    const byDate = {};
    tasks.forEach(t => {
        const d = t.date || todayStr;
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(t);
    });

    let text = `🗓️ *Kabun Farm Upcoming Schedule*
━━━━━━━━━━━━━━━${weatherSnippet}`;

    for (const [d, dTasks] of Object.entries(byDate)) {
        const isToday = d === todayStr;
        const dateHeader = isToday ? `📅 *${d} (TODAY)*` : `📅 *${d}*`;
        text += `\n${dateHeader}\n`;
        dTasks.forEach(t => {
            const catIcon = icons[t.activityCategory] || '📝';
            const catName = (t.activityCategory || 'task').toUpperCase().replace('_', ' ');
            const scope = resolveScopeName(t.bedNumber || t.bedScope);
            const slot = t.timeSlot ? ` [${t.timeSlot}]` : '';
            const doneMark = t.status === 'done' ? '✅ ' : '• ';
            text += `${doneMark}${catIcon} *${catName}* — ${scope}${slot}\n`;
            if (t.note) text += `   └ _${t.note}_\n`;
        });
    }

    text += `\n━━━━━━━━━━━━━━━\n💡 *Reply with any log or spray update anytime!*`;
    return text;
}

// Helper: Edit existing Telegram message in place
async function editTelegramMessage(chatId, messageId, text) {
    if (!TELEGRAM_TOKEN) return;
    if (!messageId) {
        await sendTelegramMessage(chatId, text);
        return;
    }
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/editMessageText`;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                message_id: messageId,
                text,
                parse_mode: 'Markdown'
            })
        });
        if (!res.ok) {
            await sendTelegramMessage(chatId, text);
        }
    } catch (e) {
        console.error('editTelegramMessage error:', e);
        await sendTelegramMessage(chatId, text);
    }
}

// Helper: Save document to Firestore via Admin SDK (with REST fallback)
async function saveToFirestore(collection, id, data) {
    const adminFirestore = getAdminFirestore();
    if (adminFirestore) {
        try {
            await adminFirestore.collection(collection).doc(id).set(data);
            return true;
        } catch (e) {
            lastFirestoreSaveError = e.message || String(e);
            console.error('Admin Firestore save failed, trying REST fallback:', e.message || e);
        }
    } else {
        lastFirestoreSaveError = lastAdminInitError || 'Admin SDK not initialized';
    }

    // Fallback to REST (when Service Account is not configured)
    const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/${collection}?documentId=${id}`;

    const fields = {};
    for (const [key, val] of Object.entries(data)) {
        if (typeof val === 'number') {
            fields[key] = Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
        } else if (typeof val === 'boolean') {
            fields[key] = { booleanValue: val };
        } else if (val === null || val === undefined) {
            fields[key] = { nullValue: null };
        } else {
            fields[key] = { stringValue: String(val) };
        }
    }

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields })
        });
        if (res.ok) return true;
        const errText = await res.text();
        lastFirestoreSaveError = `REST write returned ${res.status}: ${errText.slice(0, 100)}`;
        return false;
    } catch (e) {
        lastFirestoreSaveError = `REST fetch failed: ${e.message}`;
        console.error('Firestore save error:', e);
        return false;
    }
}

// Helper: Cancel / Soft-delete planned tasks in Firestore via Admin SDK (with REST fallback)
async function cancelTasksInFirestore(category, date) {
    let canceledCount = 0;
    const adminFirestore = getAdminFirestore();

    if (adminFirestore) {
        try {
            let query = adminFirestore.collection('tasks');
            if (date) query = query.where('date', '==', date);
            if (category && category !== 'all') query = query.where('activityCategory', '==', category);

            const snap = await query.get();
            const batch = adminFirestore.batch();

            snap.forEach(doc => {
                const data = doc.data();
                if (data.status === 'pending' || !data.status || data.status === 'active') {
                    batch.update(doc.ref, { status: 'deleted' });
                    canceledCount++;
                }
            });

            if (canceledCount > 0) {
                await batch.commit();
            }
            return canceledCount;
        } catch (e) {
            console.error('Admin Firestore cancelTasks error:', e.message || e);
        }
    }

    // Fallback to REST
    const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/tasks`;

    try {
        const res = await fetch(url);
        if (!res.ok) return 0;
        const data = await res.json();
        const docs = data.documents || [];

        for (const doc of docs) {
            const fields = doc.fields || {};
            const docDate = fields.date?.stringValue;
            const docCat = fields.activityCategory?.stringValue;
            const docStatus = fields.status?.stringValue;

            const matchesDate = !date || docDate === date;
            const matchesCat = category === 'all' || docCat === category;
            const isPending = docStatus === 'pending' || !docStatus || docStatus === 'active';

            if (matchesDate && matchesCat && isPending) {
                const docName = doc.name;
                const updateUrl = `https://firestore.googleapis.com/v1/${docName}?updateMask.fieldPaths=status`;
                const patchRes = await fetch(updateUrl, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fields: {
                            status: { stringValue: 'deleted' }
                        }
                    })
                });
                if (patchRes.ok) {
                    canceledCount++;
                }
            }
        }
    } catch (e) {
        console.error('cancelTasksInFirestore error:', e);
    }
    return canceledCount;
}

// Helper: Process input with Gemini models (fastest first with fallback)
async function processWithGemini(inputPart, mimeType = null) {
    const models = ['gemini-3.5-flash-lite', 'gemini-3.6-flash'];
    let lastError = null;

    const inventoryItems = await fetchInventoryContext();
    const systemPrompt = buildSystemPrompt(inventoryItems);

    for (const m of models) {
        try {
            const model = genAI.getGenerativeModel({
                model: m,
                generationConfig: { responseMimeType: 'application/json' }
            });
            let contents;
            if (mimeType) {
                contents = [
                    systemPrompt,
                    {
                        inlineData: {
                            mimeType,
                            data: inputPart.toString('base64')
                        }
                    }
                ];
            } else {
                contents = [systemPrompt, inputPart];
            }

            const result = await model.generateContent(contents);
            const raw = result.response.text().trim();
            const cleanJson = raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
            return JSON.parse(cleanJson);
        } catch (err) {
            lastError = err;
            console.warn(`Model ${m} failed, trying next:`, err.message);
        }
    }
    throw lastError || new Error('All Gemini model attempts failed');
}

// Helper: Process Photo Diagnosis with Gemini Vision
async function processPhotoDiagnosis(photoBuffer, mimeType = 'image/jpeg', userCaption = '') {
    const models = ['gemini-3.5-flash-lite', 'gemini-3.6-flash'];
    let lastError = null;

    const inventoryItems = await fetchInventoryContext();
    const basePrompt = buildDiagnosisPrompt(inventoryItems);
    const promptText = userCaption ? `${basePrompt}\nUser Caption / Context: "${userCaption}"` : basePrompt;

    for (const m of models) {
        try {
            const model = genAI.getGenerativeModel({
                model: m,
                generationConfig: { responseMimeType: 'application/json' }
            });
            const contents = [
                promptText,
                {
                    inlineData: {
                        mimeType,
                        data: photoBuffer.toString('base64')
                    }
                }
            ];

            const result = await model.generateContent(contents);
            const raw = result.response.text().trim();
            const cleanJson = raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
            return JSON.parse(cleanJson);
        } catch (err) {
            lastError = err;
            console.warn(`Vision Model ${m} failed:`, err.message);
        }
    }
    throw lastError || new Error('All Vision model attempts failed');
}

export function cleanSecret(s) {
    if (!s) return '';
    return String(s).trim().replace(/^["']|["']$/g, '');
}

export default async function handler(req, res) {
    if (req.method === 'GET') {
        return res.status(200).json({
            status: 'online',
            service: 'Kabun Farm Intelligence'
        });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 1. Webhook Secret Token Verification
    const expectedSecret = cleanSecret(process.env.TELEGRAM_WEBHOOK_SECRET);
    if (expectedSecret) {
        const incomingSecret = cleanSecret(req.headers['x-telegram-bot-api-secret-token']);
        if (incomingSecret !== expectedSecret) {
            console.warn('Unauthorized webhook call — secret mismatch');
            return res.status(403).json({ error: 'Forbidden' });
        }
    }

    const update = req.body;
    if (!update || !update.message) {
        return res.status(200).send('OK');
    }

    const msg = update.message;
    const chatId = msg.chat?.id;
    if (!chatId) {
        return res.status(200).send('OK');
    }

    // 2. Chat ID Authorization Check
    const allowedChatIdsStr = process.env.ALLOWED_CHAT_IDS;
    if (allowedChatIdsStr) {
        const allowedChatIds = allowedChatIdsStr.split(',').map(s => s.trim()).filter(Boolean);
        const isAllowed = allowedChatIds.includes(String(chatId));
        if (!isAllowed) {
            console.warn(`Unauthorized message attempt from Chat ID: ${chatId}`);
            await sendTelegramMessage(chatId, `🔒 *Kabun Farm Security Notice*\n\nThis chat is not authorized to log farm data.\n\n📍 *Your Chat ID:* \`${chatId}\`\n\n_To authorize this chat, add \`${chatId}\` to \`ALLOWED_CHAT_IDS\` in your Vercel Environment Variables._`);
            return res.status(200).send('OK');
        }
    }

    // 3. Handle /id command (helps user discover their Chat ID anytime)
    if (msg.text === '/id' || msg.text === '/myid') {
        await sendTelegramMessage(chatId, `📍 *Your Telegram Chat ID:* \`${chatId}\`\n\nAdd this to \`ALLOWED_CHAT_IDS\` in your Vercel Environment Variables.`);
        return res.status(200).send('OK');
    }

    // 4. Handle /today and /plan commands (on-demand tasks & daily briefing)
    if (msg.text === '/today' || msg.text === '/tasks' || msg.text === '/hariini') {
        await sendChatAction(chatId, 'typing');
        const briefing = await generateDailyBriefing(1);
        await sendTelegramMessage(chatId, briefing);
        return res.status(200).send('OK');
    }

    if (msg.text === '/plan' || msg.text === '/jadual' || msg.text === '/schedule') {
        await sendChatAction(chatId, 'typing');
        const planText = await generateDailyBriefing(3);
        await sendTelegramMessage(chatId, planText);
        return res.status(200).send('OK');
    }

    // 5. Handle /diag or /test command (probes Firestore connection live)
    if (msg.text === '/diag' || msg.text === '/test' || msg.text === '/status') {
        await sendChatAction(chatId, 'typing');
        const hasEnv = !!process.env.FIREBASE_SERVICE_ACCOUNT;
        let testResult = 'Testing connection...';
        const adminFirestore = getAdminFirestore();

        if (!adminFirestore) {
            testResult = `❌ Admin SDK failed to initialize:\n_${lastAdminInitError || 'Unknown initialization error'}_`;
        } else {
            try {
                const probeId = '_conn_probe_' + Date.now();
                await adminFirestore.collection('config').doc(probeId).set({ probe: true, timestamp: Date.now() });
                await adminFirestore.collection('config').doc(probeId).delete();
                testResult = '✅ *Firestore Cloud Connection SUCCESSFUL!*\n_Service Account credentials are valid and active._';
            } catch (te) {
                testResult = `❌ *Firestore write test failed:*\n_${te.message}_`;
            }
        }

        const report = `🔍 *Kabun Farm Bot Diagnostic Report*
━━━━━━━━━━━━━━━
🔑 *FIREBASE_SERVICE_ACCOUNT:* ${hasEnv ? '✅ Configured (' + process.env.FIREBASE_SERVICE_ACCOUNT.length + ' chars)' : '❌ Missing'}
🛡️ *TELEGRAM_WEBHOOK_SECRET:* ${process.env.TELEGRAM_WEBHOOK_SECRET ? '✅ Configured' : '❌ Missing'}
👥 *ALLOWED_CHAT_IDS:* \`${process.env.ALLOWED_CHAT_IDS || 'Not set'}\`
📍 *Your Chat ID:* \`${chatId}\`

📊 *Live Firestore Probe:*
${testResult}`;

        await sendTelegramMessage(chatId, report);
        return res.status(200).send('OK');
    }

    // 6. Handle /start command
    if (msg.text === '/start') {
        const idHint = allowedChatIdsStr ? '' : `\n\n📍 *Your Chat ID:* \`${chatId}\` _(Save this for your ALLOWED_CHAT_IDS whitelist)_`;
        await sendTelegramMessage(chatId, `🌱 *Welcome to Kabun Farm 24/7 Voice, Photo & Text Assistant!*

You can send me:
• 📋 *Today's Briefing:* Send \`/today\` for chores & weather
• 🗓️ *Weekly Plan:* Send \`/plan\` for upcoming tasks
• 📸 *Plant / Leaf Photos* for instant pest & disease diagnosis
• 🎙️ *Voice Notes* in any language (Malay, English, Manglish, etc.)
• 💬 *Text Messages* (e.g. _"Jual terung 25kg RM6 setengah sekilo"_)
• 🧺 *Harvests* (e.g. _"Kutip bayam merah 10kg batas 2"_)
• 💧 *Irrigation* (e.g. _"Dah siram batas 1 dan 2"_)
• 🚫 *Cancel Plan* (e.g. _"Batalkan plan racun hari ni"_)
• 🗓️ *Schedule Task* (e.g. _"Plan spray KMB Bio Botava esok petang"_)
• 🆔 *Check Chat ID:* Send \`/id\`
• 🔍 *Diagnostics:* Send \`/diag\`${idHint}

All logs sync directly to your Kabun Farm PWA! 🚀`);
        return res.status(200).send('OK');
    }

    // 2. Handle Photos (Plant & Pest Diagnosis)
    if (msg.photo && msg.photo.length > 0) {
        // Pick the highest resolution photo (last in array)
        const photoObj = msg.photo[msg.photo.length - 1];
        const fileId = photoObj.file_id;
        const userCaption = msg.caption || '';

        await sendChatAction(chatId, 'upload_photo');
        const statusMsgId = await sendTelegramMessage(chatId, '⏳ *Menganalisis gambar daun...*\n_Gemini AI is diagnosing crop pathology against your 12 farm inventory items..._');

        try {
            const fileRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${fileId}`);
            const fileData = await fileRes.json();
            if (!fileData.ok || !fileData.result.file_path) {
                throw new Error('Could not retrieve photo from Telegram');
            }

            const downloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileData.result.file_path}`;
            const photoBufferRes = await fetch(downloadUrl);
            const arrayBuf = await photoBufferRes.arrayBuffer();
            const photoBuffer = Buffer.from(arrayBuf);

            const diagnosis = await processPhotoDiagnosis(photoBuffer, 'image/jpeg', userCaption);
            await formatAndReplyDiagnosis(chatId, diagnosis, statusMsgId);
        } catch (err) {
            console.error('Photo diagnosis error:', err);
            await editTelegramMessage(chatId, statusMsgId, `⚠️ *Gagal menganalisis gambar / Diagnosis error:*\n_${err.message}_`);
        }
        return res.status(200).send('OK');
    }

    // 3. Handle Voice Notes / Audio
    if (msg.voice || msg.audio) {
        const fileId = msg.voice ? msg.voice.file_id : msg.audio.file_id;
        const mimeType = msg.voice ? (msg.voice.mime_type || 'audio/ogg') : (msg.audio.mime_type || 'audio/mp3');

        await sendChatAction(chatId, 'record_voice');
        const statusMsgId = await sendTelegramMessage(chatId, '⏳ *Menganalisis rakaman suara...*\n_Gemini AI is processing your voice note..._');

        try {
            const fileRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${fileId}`);
            const fileData = await fileRes.json();
            if (!fileData.ok || !fileData.result.file_path) {
                throw new Error('Could not retrieve audio file from Telegram');
            }

            const downloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileData.result.file_path}`;
            const audioBufferRes = await fetch(downloadUrl);
            const arrayBuf = await audioBufferRes.arrayBuffer();
            const audioBuffer = Buffer.from(arrayBuf);

            const parsed = await processWithGemini(audioBuffer, mimeType);
            await recordAndReply(chatId, parsed, statusMsgId);
        } catch (err) {
            console.error('Voice processing error:', err);
            await editTelegramMessage(chatId, statusMsgId, `⚠️ *Gagal memproses audio / Processing error:*\n_${err.message}_`);
        }
        return res.status(200).send('OK');
    }

    // 4. Handle Text Messages
    if (msg.text && !msg.text.startsWith('/')) {
        await sendChatAction(chatId, 'typing');
        const statusMsgId = await sendTelegramMessage(chatId, '⏳ *Memproses log...*\n_Extracting farm data..._');

        try {
            const parsed = await processWithGemini(msg.text);
            await recordAndReply(chatId, parsed, statusMsgId);
        } catch (err) {
            console.error('Text processing error:', err);
            await editTelegramMessage(chatId, statusMsgId, `⚠️ *Gagal memproses teks / Parsing error:*\n_${err.message}_`);
        }
        return res.status(200).send('OK');
    }

    return res.status(200).send('OK');
}

// Helper: Clean and normalize bed number / plot strings
function normalizeBedScope(raw) {
    if (!raw || raw === 'all' || raw === 'Whole Farm' || raw === 'null') return 'all';
    const str = String(raw).trim();
    if (!str || str.toLowerCase() === 'all' || str.toLowerCase() === 'whole farm') return 'all';

    // Check if it's a plot or block
    if (/^(plot|blok|block)\b/i.test(str)) {
        return str;
    }

    // Check if it starts with "batas" or "bed" followed by numbers
    const bedMatch = str.match(/^(?:batas|bed|no\.?|nombor)?\s*(\d+(?:\s*,\s*\d+)*)$/i);
    if (bedMatch) {
        return bedMatch[1].replace(/\s+/g, '');
    }

    // Check if contains digits like "batas 2"
    const digitMatch = str.match(/(?:batas|bed|no\.?)\s*(\d+)/i);
    if (digitMatch) {
        return digitMatch[1];
    }

    const cleaned = str.replace(/^(?:batas|bed)\s*/i, '').trim();
    return cleaned || 'all';
}

// Helper: Format Diagnosis Response & Handle Auto-Scheduling
async function formatAndReplyDiagnosis(chatId, diag, messageId) {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const cleanBed = normalizeBedScope(diag.bedNumber);

    if (diag.isIncurable) {
        const locText = cleanBed === 'all' ? '' : (/^(plot|blok|block)\b/i.test(cleanBed) ? `📍 *Location:* ${cleanBed}` : `📍 *Location:* Bed ${cleanBed}`);
        const alertMsg = `🚨 *DIAGNOSIS: ${diag.issue.toUpperCase()}*
━━━━━━━━━━━━━━━
🌱 *Crop:* ${diag.crop || 'Plant'} | *Confidence:* ${diag.confidence || 'Medium'}
⚠️ *Symptom:* ${diag.symptoms}

🚫 *DO NOT SPRAY:*
This is an incurable viral/vascular disease. Sprays cannot heal infected plants.

🚨 *MANDATORY ACTION:*
*Rogue (pull out & destroy)* this plant immediately to prevent spreading to neighboring beds!
${locText}`;

        await editTelegramMessage(chatId, messageId, alertMsg);
        return;
    }

    let scheduledText = '';
    if (diag.autoSchedule && cleanBed !== 'all') {
        const taskId = 'task_' + crypto.randomUUID();
        const taskDoc = {
            id: taskId,
            date: tomorrow,
            activityCategory: 'pest_control',
            bedNumber: cleanBed,
            bedScope: cleanBed,
            timeSlot: 'Evening',
            note: `${diag.issue}: ${diag.prescribedRemedy}`,
            status: 'active'
        };
        await saveToFirestore('tasks', taskId, taskDoc);
        const bedLabel = /^(plot|blok|block)\b/i.test(cleanBed) ? cleanBed : `Bed ${cleanBed}`;
        scheduledText = `\n━━━━━━━━━━━━━━━\n🗓️ *Auto-Scheduled for ${bedLabel} tomorrow evening!*`;
    } else {
        const scopeHint = cleanBed !== 'all' ? (/^(plot|blok|block)\b/i.test(cleanBed) ? cleanBed : `batas ${cleanBed}`) : `batas 1`;
        scheduledText = `\n━━━━━━━━━━━━━━━\n💡 *Reply "Plan spray ${scopeHint} esok" to add to Planning tab.*`;
    }

    const phiNotice = diag.phiDays > 0 ? `⚠️ *${diag.phiDays} Days PHI* (Wait ${diag.phiDays} days before harvest)` : `✅ *0 Days PHI* (Safe for immediate harvest)`;

    const reply = `🔍 *DIAGNOSIS: ${diag.issue.toUpperCase()}*
━━━━━━━━━━━━━━━
🌱 *Crop:* ${diag.crop || 'Crop'} | *Confidence:* ${diag.confidence || 'Medium'}
⚠️ *Observed Symptoms:*
_${diag.symptoms}_

🌿 *Prescribed Treatment (From Stocked Inventory):*
• *${diag.prescribedRemedy}*
⏰ *Timing:* ${diag.applicationTiming || 'Evening (after 5:30 PM)'}
🛡️ *FRAC/IRAC Code:* \`${diag.moaCode || 'IRAC UNM'}\`
⏳ *Safety Interval:* ${phiNotice}${scheduledText}`;

    await editTelegramMessage(chatId, messageId, reply);
}

// Helper: Parse total spray volume and tank count from inputsUsed text.
// The PWA writes patterns like "Bio-Shield — 32L mix (2x16L)" (js/views.js:686),
// so prefer the explicit "N x size L" tuple (with or without parens), then a
// bare "<num>L mix" total, then fall back to a single 16 L tank.
export function parseVolumeFromInputsUsed(text) {
    const str = String(text || '');
    const tupleMatch = str.match(/(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*L\b/i);
    if (tupleMatch) {
        const tanks = parseFloat(tupleMatch[1]);
        const size = parseFloat(tupleMatch[2]);
        if (tanks > 0 && size > 0) return { totalLitres: tanks * size, numTanks: tanks };
    }
    // Bare "<num> L" total — lookbehind rejects letters AND digits so "80 ml"
    // and "2x16L" never partial-match ("6L" out of "16L" must not match)
    const litreMatch = str.match(/(?<![a-zA-Z\d])(\d+(?:\.\d+)?)\s*L\b(?!\w)/i);
    if (litreMatch) {
        const total = parseFloat(litreMatch[1]);
        if (total > 0) return { totalLitres: total, numTanks: 1 };
    }
    return { totalLitres: 16, numTanks: 1 };
}

// Common colloquial aliases per inventory id (Firestore items without an entry
// still match on their base name and any NPK formula code like "8-8-29").
const INVENTORY_ALIASES = {
    bio_botava: ['bio botava'],
    amino_18: ['amino 18', 'amino'],
    garlic_oil: ['garlic oil', 'garlic'],
    neem_oil: ['neem'],
    wood_vinegar: ['cuka kayu'],
    seaweed: ['seaweed'],
    pest_guard_2: ['pest guard'],
    wira_calbo: ['calbo'],
    antracol: ['antracol'],
    abamectin: ['abamectin'],
    cypermethrin: ['cypermethrin'],
    em4: ['effective microorganisms'],
    npk_11_11_11: ['11-11-11', '11 11 11'],
    npk_8_8_29: ['8-8-29', '8 8 29'],
    bluvita_16_16_16: ['bluvita', '16-16-16', '16 16 16'],
    dolomite: ['kapur']
};

// Helper: All strings that can identify an inventory item in free text,
// longest-first so the most specific variant wins.
function inventoryMatchVariants(item) {
    const nameLower = String(item.name || '').toLowerCase();
    const baseName = nameLower.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
    const variants = new Set([nameLower, baseName]);
    // Derive NPK formula-code variants from the name (e.g. "Bluvita NPK 16-16-16" -> "16-16-16", "16 16 16")
    const codeMatch = baseName.match(/(\d+)\s*-\s*(\d+)\s*-\s*(\d+)/);
    if (codeMatch) {
        variants.add(`${codeMatch[1]}-${codeMatch[2]}-${codeMatch[3]}`);
        variants.add(`${codeMatch[1]} ${codeMatch[2]} ${codeMatch[3]}`);
    }
    (INVENTORY_ALIASES[item.id] || []).forEach(a => variants.add(a));
    return [...variants].filter(v => v && v.length >= 3).sort((a, b) => b.length - a.length);
}

// Helper: Parse an explicit granular quantity like "2kg" / "1.5 kg" stated
// immediately next to a matched product variant. Prefers the nearest quantity
// AFTER the name ("bluvita 16-16-16 2kg"), falling back to a tight backward
// window ("2kg kapur"). Returns null when none stated adjacent to the name.
function parseExplicitQuantity(text, variant) {
    const idx = text.indexOf(variant);
    if (idx === -1) return null;
    const nameEnd = idx + variant.length;
    const qtyRe = /(\d+(?:\.\d+)?)\s*(kg|g)\b/i;

    // Nearest match after the product name (skip digits that are part of NPK codes)
    const after = text.slice(nameEnd, nameEnd + 20).match(qtyRe);
    if (after) {
        const qty = parseFloat(after[1]);
        if (qty > 0) return after[2].toLowerCase() === 'kg'
            ? { amount: qty, unit: 'kg' }
            : { amount: qty / 1000, unit: 'kg' }; // g -> kg
    }

    // Backward window for quantity-before-name phrasing ("2kg RealStrong 8-8-29").
    // Only kg/g match, so tank volumes ("16L mix") and ml figures cannot be
    // mistaken for a granular weight.
    const before = text.slice(Math.max(0, idx - 24), idx).match(qtyRe);
    if (before) {
        const qty = parseFloat(before[1]);
        if (qty > 0) return before[2].toLowerCase() === 'kg'
            ? { amount: qty, unit: 'kg' }
            : { amount: qty / 1000, unit: 'kg' }; // g -> kg
    }

    return null;
}

// Helper: Compute total application cost from inputsUsed text using the live
// inventory (same math as calculateRecipeCost in js/calculations.js:
//   cost = dosePerLitre × totalLitres × costPerUnit for foliar items;
//   cost = quantity × costPerUnit for granular items).
// Returns 0 when nothing matches (no cost line is then written to the log).
export function computeApplicationCost(inputsUsed, inventory) {
    const text = String(inputsUsed || '').toLowerCase();
    if (!text || !Array.isArray(inventory) || !inventory.length) return 0;

    const { totalLitres } = parseVolumeFromInputsUsed(text);

    let totalCost = 0;
    let matchedAny = false;

    for (const item of inventory) {
        if (!item || !item.name || !((parseFloat(item.costPerUnit) || 0) > 0)) continue;

        const variant = inventoryMatchVariants(item).find(v => text.includes(v));
        if (!variant) continue;

        const costPerUnit = parseFloat(item.costPerUnit) || 0;
        const dosePerLitre = parseFloat(item.dosePerLitre) || 0;

        if (dosePerLitre > 0) {
            // Foliar: dose per litre × total mixed volume × per-unit cost
            totalCost += dosePerLitre * totalLitres * costPerUnit;
        } else {
            // Granular fertilizer: explicit quantity if stated, else standard application
            const dosePerApp = parseFloat(item.dosePerApplication) || 0;
            if (dosePerApp <= 0) continue;
            const qty = parseExplicitQuantity(text, variant);
            totalCost += (qty ? qty.amount : dosePerApp) * costPerUnit;
        }
        matchedAny = true;
    }

    return matchedAny ? Math.round(totalCost * 100) / 100 : 0;
}

// Helper: Record to Firestore and send receipt reply (updates statusMsgId in place)
async function recordAndReply(chatId, record, messageId = null) {
    const today = new Date().toISOString().slice(0, 10);
    const date = record.date || today;

    if (record.type === 'sale') {
        const id = 'sale_' + crypto.randomUUID();
        const saleDoc = {
            id,
            date,
            crop: record.crop || 'Produce',
            quantity: String(record.quantity || '0'),
            unit: record.unit || 'kg',
            pricePerUnit: String(record.pricePerUnit || '0'),
            totalRevenue: String(record.totalRevenue || (parseFloat(record.quantity || 0) * parseFloat(record.pricePerUnit || 0)).toFixed(2)),
            status: 'active'
        };

        const ok = await saveToFirestore('sales', id, saleDoc);
        const syncMsg = ok 
            ? '✅ *Synced to Kabun Farm PWA!*' 
            : `⚠️ *Cloud sync failed*\n_${lastFirestoreSaveError || 'Authentication error'}_`;

        const reply = `💰 *SALE RECORDED!*
━━━━━━━━━━━━━━━
🌱 *Crop:* ${saleDoc.crop}
⚖️ *Quantity:* ${saleDoc.quantity} ${saleDoc.unit}
💵 *Price:* RM ${parseFloat(saleDoc.pricePerUnit).toFixed(2)}/${saleDoc.unit}
📊 *Total Revenue:* *RM ${parseFloat(saleDoc.totalRevenue).toFixed(2)}*
📅 *Date:* ${date}
${syncMsg}`;

        await editTelegramMessage(chatId, messageId, reply);

    } else if (record.type === 'expense') {
        const id = 'exp_' + crypto.randomUUID();
        const expDoc = {
            id,
            date,
            category: record.category || 'general',
            amount: parseFloat(record.amount || 0),
            note: record.note || '',
            status: 'active'
        };

        const ok = await saveToFirestore('expenses', id, expDoc);
        const syncMsg = ok 
            ? '✅ *Synced to Kabun Farm PWA!*' 
            : `⚠️ *Cloud sync failed*\n_${lastFirestoreSaveError || 'Authentication error'}_`;

        const expIcons = {
            utilities: '⚡',
            fuel: '⛽',
            labor: '👷',
            supplies: '🛠️',
            maintenance: '🔧',
            general: '💵'
        };
        const icon = expIcons[expDoc.category] || '💵';
        const catLabel = (expDoc.category || 'general').toUpperCase();

        const reply = `${icon} *FARM EXPENSE RECORDED!*
━━━━━━━━━━━━━━━
📂 *Category:* ${catLabel}
💵 *Amount:* *RM ${parseFloat(expDoc.amount).toFixed(2)}*
${expDoc.note ? `📝 *Details:* ${expDoc.note}\n` : ''}📅 *Date:* ${date}
${syncMsg}`;

        await editTelegramMessage(chatId, messageId, reply);

    } else if (record.type === 'activity') {
        const id = 'log_' + crypto.randomUUID();
        const cleanBed = normalizeBedScope(record.bedNumber);

        // Auto-compute cost if not explicitly supplied, using live inventory pricing
        // and dosing from Firestore (volume/tanks parsed from the inputsUsed text)
        let computedCost = record.costRM ? parseFloat(record.costRM) : 0;
        if (!computedCost && record.inputsUsed) {
            try {
                const inventory = await fetchInventoryContext();
                computedCost = computeApplicationCost(record.inputsUsed, inventory);
            } catch (ce) {
                console.warn('Application cost computation skipped:', ce.message || ce);
            }
        }

        const activityDoc = {
            id,
            date,
            activityCategory: record.category || 'watering',
            bedNumber: cleanBed,
            bedScope: cleanBed,
            cropName: record.cropName || '',
            inputsUsed: record.inputsUsed || '',
            costRM: computedCost > 0 ? String(computedCost.toFixed(2)) : '',
            revenueRM: '',
            weight: record.weight ? String(record.weight) : '',
            status: 'active'
        };

        const ok = await saveToFirestore('logs', id, activityDoc);
        const syncMsg = ok 
            ? '✅ *Synced to Kabun Farm PWA!*' 
            : `⚠️ *Cloud sync failed*\n_${lastFirestoreSaveError || 'Authentication error'}_`;

        const icons = { watering: '💧', harvest: '🧺', pest_control: '🐛', sowing: '🌱' };
        const icon = icons[activityDoc.activityCategory] || '📝';
        const catLabel = activityDoc.activityCategory.toUpperCase().replace('_', ' ');
        const scopeText = cleanBed === 'all' ? 'Whole Farm' : (/^(plot|blok|block)\b/i.test(cleanBed) ? cleanBed : `Bed ${cleanBed}`);

        const reply = `${icon} *${catLabel} RECORDED!*
━━━━━━━━━━━━━━━
📍 *Scope:* ${scopeText}
${activityDoc.cropName ? `🌱 *Crop:* ${activityDoc.cropName}\n` : ''}${activityDoc.weight ? `⚖️ *Harvested Weight:* ${activityDoc.weight} kg\n` : ''}${activityDoc.inputsUsed ? `🧪 *Inputs:* ${activityDoc.inputsUsed}\n` : ''}${activityDoc.costRM ? `💵 *Cost:* RM ${parseFloat(activityDoc.costRM).toFixed(2)}\n` : ''}📅 *Date:* ${date}
${syncMsg}`;

        await editTelegramMessage(chatId, messageId, reply);

    } else if (record.type === 'cancel_task') {
        const cat = record.category || 'all';
        const count = await cancelTasksInFirestore(cat, date);

        const catText = cat === 'all' ? 'All scheduled' : cat.replace('_', ' ');
        const reply = `🚫 *PLAN CANCELED!*
━━━━━━━━━━━━━━━
🗑️ *Action:* Removed ${catText} task(s)
📅 *Date:* ${date}
🔢 *Tasks Canceled:* ${count > 0 ? count : 'Checked (no pending tasks found)'}
✅ *Synced to Kabun Farm PWA!*`;

        await editTelegramMessage(chatId, messageId, reply);

    } else if (record.type === 'schedule_task') {
        const id = 'task_' + crypto.randomUUID();
        const cleanBed = normalizeBedScope(record.bedNumber);
        const taskDoc = {
            id,
            date,
            activityCategory: record.category || 'pest_control',
            bedNumber: cleanBed,
            bedScope: cleanBed,
            timeSlot: record.timeSlot || 'Morning',
            note: record.note || '',
            status: 'active'
        };

        const ok = await saveToFirestore('tasks', id, taskDoc);
        const syncMsg = ok 
            ? '✅ *Synced to Planning Tab!*' 
            : `⚠️ *Cloud sync failed*\n_${lastFirestoreSaveError || 'Authentication error'}_`;

        const icons = { watering: '💧', harvest: '🧺', pest_control: '🐛', sowing: '🌱' };
        const icon = icons[taskDoc.activityCategory] || '🗓️';
        const catLabel = taskDoc.activityCategory.toUpperCase().replace('_', ' ');
        const scopeText = cleanBed === 'all' ? 'Whole Farm' : (/^(plot|blok|block)\b/i.test(cleanBed) ? cleanBed : `Bed ${cleanBed}`);

        const reply = `🗓️ *TASK SCHEDULED!*
━━━━━━━━━━━━━━━
${icon} *Category:* ${catLabel}
📍 *Scope:* ${scopeText}
⏰ *Time Slot:* ${taskDoc.timeSlot}
${taskDoc.note ? `📝 *Note:* ${taskDoc.note}\n` : ''}📅 *Date:* ${date}
${syncMsg}`;

        await editTelegramMessage(chatId, messageId, reply);
    }
}
