// ============================================================================
// Kabun Farm Intelligence — 24/7 Vercel Serverless Telegram Webhook Handler
// Route: /api/telegram
// ============================================================================

import { GoogleGenerativeAI } from '@google/generative-ai';

// Extend Vercel serverless execution limit for audio/image processing
export const maxDuration = 30;

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FIRESTORE_PROJECT_ID = 'kabunfarm';

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const SYSTEM_PROMPT = `
You are the AI Farm Intelligence Assistant for Kabun Farm.
Your job is to parse voice messages or text sent by farmers and extract structured farm activity logs, sales records, or planning commands.

The farm stocks 12 specific registered inventory products:
1. KMB Bio Botava (2.5 ml/L, IRAC UNM - Botanical insect repellent)
2. Neem Oil (5.0 ml/L + 2ml soap, IRAC UNM - Azadirachtin organic knockdown)
3. KMB Pest Guard 2 (3.0 ml/L, IRAC UNM - Botanical contact deterrent for caterpillars/thrips)
4. Wood Vinegar / Cuka Kayu (2.0 ml/L, FRAC M - Multi-site fungal suppressor/repellent)
5. Antracol 70 WP (2.0 g/L, FRAC M02 - Propineb multi-site protectant, 7-day PHI)
6. Wira CalBo (2.0 ml/L, Nutrition - Calcium + Boron blossom end rot/fruit set)
7. KMB Amino 18 (2.0 ml/L, Nutrition - 18 L-Amino acids vegetative booster)
8. Garlic Oil Extract (1.5 - 2.0 ml/L, IRAC UNM - Botanical aromatic deterrent)
9. EM4 (5.0 - 10.0 ml/L, Biological Inoculant - Beneficial microbes)
10. Seaweed Extract (1.0 - 1.5 ml/L, Biostimulant - Kelp root & stress tolerance)
11. Abamectin (0.5 - 1.0 ml/L, IRAC Group 6 - Mites/leafminers knockdown, 7-day PHI, max 2 consecutive sprays)
12. Cypermethrin (1.0 - 1.5 ml/L, IRAC Group 3A - Caterpillars/beetles knockdown, 7-day PHI, max 2 consecutive sprays)

Users may speak or type in:
- Bahasa Melayu (Standard or Colloquial: "Dah kutip terung batas 2 dapat 15 kilo", "Jual terung 30kg RM5/kg", "Batas 3 dah siram air", "Batalkan plan racun hari ni", "Plan spray neem esok petang")
- Manglish / English ("Harvested 20kg red amaranth bed 4", "Sold 10kg chili RM8 per kg", "Cancel watering plan for today", "Plan spray KMB Bio Botava for tomorrow evening")
- Indonesian ("Sudah petik terong 12 kilo bed 1", "Batal jadwal siram hari ini")
- Chinese ("今天二号床采收了15公斤茄子", "取消今天的打药计划")

Extract the intent and return ONLY a valid JSON object matching one of these 4 schemas:

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
  "inputsUsed": "e.g. KMB Bio Botava, Neem Oil, Antracol, etc.",
  "costRM": 0.00, // optional cost
  "date": "YYYY-MM-DD"
}

SCHEMA 3: CANCEL / DELETE PLANNED TASK
(Trigger words: "cancel plan", "batalkan plan", "batal jadual", "delete task", "tak jadi spray", "cancel watering")
{
  "type": "cancel_task",
  "category": "pest_control" | "watering" | "harvest" | "sowing" | "all",
  "date": "YYYY-MM-DD"
}

SCHEMA 4: SCHEDULE / ADD PLANNED TASK
(Trigger words: "plan spray for tomorrow", "jadualkan siram", "schedule harvest", "set task")
{
  "type": "schedule_task",
  "category": "pest_control" | "watering" | "harvest" | "sowing",
  "bedNumber": "1", // or "all"
  "timeSlot": "Morning" | "Evening" | "Anytime",
  "note": "Description of task or recipe using the 12 inventory products",
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

Colloquial Price/Weight Rules:
- "setengah" -> 0.5 (e.g. "RM 6 setengah" = 6.50, "dua kilo setengah" = 2.5)
- "suku" -> 0.25

Today's Date: ${new Date().toISOString().slice(0, 10)}.
Return pure JSON only, without markdown fences or extra explanations.
`;

const DIAGNOSIS_PROMPT = `
You are the Expert Agronomist and Plant Pathologist for Kabun Farm (tropical vegetable market garden in Malaysia).
Analyze the provided crop leaf or plant photo and any optional user caption.

The farm stocks ONLY these 12 registered products:
1. KMB Bio Botava (2.5 ml/L - IRAC UNM Botanical repellent)
2. Neem Oil (5.0 ml/L + 2ml soap - IRAC UNM Azadirachtin organic knockdown)
3. KMB Pest Guard 2 (3.0 ml/L - IRAC UNM Botanical contact deterrent)
4. Wood Vinegar / Cuka Kayu (2.0 ml/L - FRAC M Fungal suppressor/repellent)
5. Antracol 70 WP (2.0 g/L - FRAC M02 Propineb protectant, 7-day PHI)
6. Wira CalBo (2.0 ml/L - Nutrition: Calcium + Boron)
7. KMB Amino 18 (2.0 ml/L - Nutrition: 18 L-Amino acids recovery)
8. Garlic Oil Extract (1.5 - 2.0 ml/L - IRAC UNM Botanical deterrent)
9. EM4 (5.0 - 10.0 ml/L - Beneficial microbes)
10. Seaweed Extract (1.0 - 1.5 ml/L - Biostimulant Cytokinins)
11. Abamectin (0.5 - 1.0 ml/L - IRAC 6 Synthetic Acaricide for severe mites/leafminers, 7-day PHI)
12. Cypermethrin (1.0 - 1.5 ml/L - IRAC 3A Synthetic Pyrethroid for severe caterpillars, 7-day PHI)

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
  "prescribedRemedy": "Exact recipe using the farm's 12 stocked items",
  "moaCode": "IRAC UNM" | "FRAC M02" | "IRAC 6" | "IRAC 3A" | "Nutrition" | "Cultural",
  "phiDays": 0, // 7 for Antracol/Abamectin/Cypermethrin, 0 for organics
  "applicationTiming": "Evening (after 5:30 PM)",
  "bedNumber": "1" | null, // extract bed number if user mentions it in caption (e.g. "batas 2", "bed 3")
  "autoSchedule": false // true if user caption explicitly asks to schedule/plan (e.g. "jadualkan spray", "plan tolong set")
}
`;

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

// Helper: Send message to Telegram chat (returns message_id)
async function sendTelegramMessage(chatId, text) {
    if (!TELEGRAM_TOKEN) return null;
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
        }
    } catch (e) {
        console.error('sendTelegramMessage error:', e);
    }
    return null;
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

// Helper: Save document to Firestore via REST
async function saveToFirestore(collection, id, data) {
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
        return res.ok;
    } catch (e) {
        console.error('Firestore save error:', e);
        return false;
    }
}

// Helper: Cancel / Soft-delete planned tasks in Firestore
async function cancelTasksInFirestore(category, date) {
    let canceledCount = 0;
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
            const isPending = docStatus === 'pending' || !docStatus;

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

    for (const m of models) {
        try {
            const model = genAI.getGenerativeModel({
                model: m,
                generationConfig: { responseMimeType: 'application/json' }
            });
            let contents;
            if (mimeType) {
                contents = [
                    SYSTEM_PROMPT,
                    {
                        inlineData: {
                            mimeType,
                            data: inputPart.toString('base64')
                        }
                    }
                ];
            } else {
                contents = [SYSTEM_PROMPT, inputPart];
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

    const promptText = userCaption ? `${DIAGNOSIS_PROMPT}\nUser Caption / Context: "${userCaption}"` : DIAGNOSIS_PROMPT;

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

export default async function handler(req, res) {
    if (req.method === 'GET') {
        return res.status(200).json({
            status: 'active',
            service: 'Kabun Farm 24/7 Telegram Webhook',
            hasTelegramToken: !!TELEGRAM_TOKEN,
            hasGeminiKey: !!GEMINI_API_KEY,
            firestoreProject: FIRESTORE_PROJECT_ID
        });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const update = req.body;
    if (!update || !update.message) {
        return res.status(200).send('OK');
    }

    const msg = update.message;
    const chatId = msg.chat.id;

    // 1. Handle /start command
    if (msg.text === '/start') {
        await sendTelegramMessage(chatId, `🌱 *Welcome to Kabun Farm 24/7 Voice, Photo & Text Assistant!*

You can send me:
• 📸 *Plant / Leaf Photos* for instant pest & disease diagnosis + organic recipes
• 🎙️ *Voice Notes* in any language (Malay, English, Manglish, etc.)
• 💬 *Text Messages* (e.g. _"Jual terung 25kg RM6 setengah sekilo"_)
• 🧺 *Harvests* (e.g. _"Kutip bayam merah 10kg batas 2"_)
• 💧 *Irrigation* (e.g. _"Dah siram batas 1 dan 2"_)
• 🚫 *Cancel Plan* (e.g. _"Batalkan plan racun hari ni"_)
• 🗓️ *Schedule Task* (e.g. _"Plan spray KMB Bio Botava esok petang"_)

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

// Helper: Format Diagnosis Response & Handle Auto-Scheduling
async function formatAndReplyDiagnosis(chatId, diag, messageId) {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    if (diag.isIncurable) {
        const alertMsg = `🚨 *DIAGNOSIS: ${diag.issue.toUpperCase()}*
━━━━━━━━━━━━━━━
🌱 *Crop:* ${diag.crop || 'Plant'} | *Confidence:* ${diag.confidence || 'Medium'}
⚠️ *Symptom:* ${diag.symptoms}

🚫 *DO NOT SPRAY:*
This is an incurable viral/vascular disease. Sprays cannot heal infected plants.

🚨 *MANDATORY ACTION:*
*Rogue (pull out & destroy)* this plant immediately to prevent spreading to neighboring beds!
${diag.bedNumber ? `📍 *Location:* Bed ${diag.bedNumber}` : ''}`;

        await editTelegramMessage(chatId, messageId, alertMsg);
        return;
    }

    let scheduledText = '';
    if (diag.autoSchedule && diag.bedNumber) {
        const taskId = 'task_' + Date.now();
        const taskDoc = {
            id: taskId,
            date: tomorrow,
            activityCategory: 'pest_control',
            bedScope: String(diag.bedNumber),
            timeSlot: 'Evening',
            note: `${diag.issue}: ${diag.prescribedRemedy}`,
            status: 'pending'
        };
        await saveToFirestore('tasks', taskId, taskDoc);
        scheduledText = `\n━━━━━━━━━━━━━━━\n🗓️ *Auto-Scheduled for Bed ${diag.bedNumber} tomorrow evening!*`;
    } else {
        const scopeHint = diag.bedNumber ? `batas ${diag.bedNumber}` : `batas 1`;
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

// Helper: Record to Firestore and send receipt reply (updates statusMsgId in place)
async function recordAndReply(chatId, record, messageId = null) {
    const today = new Date().toISOString().slice(0, 10);
    const date = record.date || today;

    if (record.type === 'sale') {
        const id = 'sale_' + Date.now();
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

        const reply = `💰 *SALE RECORDED!*
━━━━━━━━━━━━━━━
🌱 *Crop:* ${saleDoc.crop}
⚖️ *Quantity:* ${saleDoc.quantity} ${saleDoc.unit}
💵 *Price:* RM ${parseFloat(saleDoc.pricePerUnit).toFixed(2)}/${saleDoc.unit}
📊 *Total Revenue:* *RM ${parseFloat(saleDoc.totalRevenue).toFixed(2)}*
📅 *Date:* ${date}
${ok ? '✅ *Synced to Kabun Farm PWA!*' : '⚠️ *Saved locally, syncing to cloud...*'}`;

        await editTelegramMessage(chatId, messageId, reply);

    } else if (record.type === 'activity') {
        const id = 'log_' + Date.now();
        const activityDoc = {
            id,
            date,
            activityCategory: record.category || 'watering',
            bedNumber: record.bedNumber ? String(record.bedNumber) : 'all',
            cropName: record.cropName || '',
            inputsUsed: record.inputsUsed || '',
            costRM: record.costRM ? String(record.costRM) : '',
            revenueRM: '',
            weight: record.weight ? String(record.weight) : '',
            status: 'active'
        };

        const ok = await saveToFirestore('logs', id, activityDoc);

        const icons = { watering: '💧', harvest: '🧺', pest_control: '🐛', sowing: '🌱' };
        const icon = icons[activityDoc.activityCategory] || '📝';
        const catLabel = activityDoc.activityCategory.toUpperCase().replace('_', ' ');

        const reply = `${icon} *${catLabel} RECORDED!*
━━━━━━━━━━━━━━━
📍 *Scope:* ${activityDoc.bedNumber === 'all' ? 'Whole Farm' : 'Bed ' + activityDoc.bedNumber}
${activityDoc.cropName ? `🌱 *Crop:* ${activityDoc.cropName}\n` : ''}${activityDoc.weight ? `⚖️ *Harvested Weight:* ${activityDoc.weight} kg\n` : ''}${activityDoc.inputsUsed ? `🧪 *Inputs:* ${activityDoc.inputsUsed}\n` : ''}${activityDoc.costRM ? `💵 *Cost:* RM ${parseFloat(activityDoc.costRM).toFixed(2)}\n` : ''}📅 *Date:* ${date}
${ok ? '✅ *Synced to Kabun Farm PWA!*' : '⚠️ *Saved locally, syncing to cloud...*'}`;

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
        const id = 'task_' + Date.now();
        const taskDoc = {
            id,
            date,
            activityCategory: record.category || 'pest_control',
            bedScope: record.bedNumber ? String(record.bedNumber) : 'all',
            timeSlot: record.timeSlot || 'Morning',
            note: record.note || '',
            status: 'pending'
        };

        const ok = await saveToFirestore('tasks', id, taskDoc);

        const icons = { watering: '💧', harvest: '🧺', pest_control: '🐛', sowing: '🌱' };
        const icon = icons[taskDoc.activityCategory] || '🗓️';
        const catLabel = taskDoc.activityCategory.toUpperCase().replace('_', ' ');

        const reply = `🗓️ *TASK SCHEDULED!*
━━━━━━━━━━━━━━━
${icon} *Category:* ${catLabel}
📍 *Scope:* ${taskDoc.bedScope === 'all' ? 'Whole Farm' : 'Bed ' + taskDoc.bedScope}
⏰ *Time Slot:* ${taskDoc.timeSlot}
${taskDoc.note ? `📝 *Note:* ${taskDoc.note}\n` : ''}📅 *Date:* ${date}
${ok ? '✅ *Synced to Planning Tab!*' : '⚠️ *Saved locally, syncing to cloud...*'}`;

        await editTelegramMessage(chatId, messageId, reply);
    }
}
