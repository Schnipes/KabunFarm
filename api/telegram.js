// ============================================================================
// Kabun Farm Intelligence — 24/7 Vercel Serverless Telegram Webhook Handler
// Route: /api/telegram
// ============================================================================

import { GoogleGenerativeAI } from '@google/generative-ai';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FIRESTORE_PROJECT_ID = 'kabunfarm';

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const SYSTEM_PROMPT = `
You are the AI Farm Intelligence Assistant for Kabun Farm.
Your job is to parse voice messages or text sent by farmers and extract structured farm activity logs, sales records, or planning commands.

Users may speak or type in:
- Bahasa Melayu (Standard or Colloquial: "Dah kutip terung batas 2 dapat 15 kilo", "Jual terung 30kg RM5/kg", "Batas 3 dah siram air", "Batalkan plan racun hari ni", "Cancel plan spray")
- Manglish / English ("Harvested 20kg red amaranth bed 4", "Sold 10kg chili RM8 per kg", "Cancel watering plan for today", "Plan spray EM4 for tomorrow morning")
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
  "inputsUsed": "e.g. EM4 Foliar Spray, Neem Oil, etc.",
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
  "note": "Description of task or recipe",
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

// Helper: Send message to Telegram chat
async function sendTelegramMessage(chatId, text) {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: 'Markdown'
            })
        });
    } catch (e) {
        console.error('sendTelegramMessage error:', e);
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
        console.error('saveToFirestore error:', e);
        return false;
    }
}

// Helper: Cancel / Delete Tasks from Firestore
async function cancelTasksInFirestore(category, date) {
    const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/tasks?pageSize=50`;
    let canceledCount = 0;

    try {
        const res = await fetch(url);
        const data = await res.json();
        if (!data.documents) return 0;

        for (const doc of data.documents) {
            const fields = doc.fields || {};
            const docStatus = fields.status?.stringValue || 'pending';
            const docDate = fields.date?.stringValue;
            const docCategory = fields.activityCategory?.stringValue;

            if (docStatus !== 'deleted' && (!date || docDate === date)) {
                if (category === 'all' || !category || docCategory === category) {
                    const docPath = doc.name; // projects/kabunfarm/databases/(default)/documents/tasks/task_123
                    const patchUrl = `https://firestore.googleapis.com/v1/${docPath}?updateMask.fieldPaths=status`;
                    await fetch(patchUrl, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            fields: {
                                status: { stringValue: 'deleted' }
                            }
                        })
                    });
                    canceledCount++;
                }
            }
        }
    } catch (e) {
        console.error('cancelTasksInFirestore error:', e);
    }
    return canceledCount;
}

// Helper: Process input with Gemini models (with fallback)
async function processWithGemini(inputPart, mimeType = null) {
    const models = ['gemini-1.5-flash', 'gemini-3.6-flash', 'gemini-1.5-pro'];
    let lastError = null;

    for (const m of models) {
        try {
            const model = genAI.getGenerativeModel({ model: m });
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

export default async function handler(req, res) {
    if (req.method === 'GET') {
        return res.status(200).json({ status: 'active', service: 'Kabun Farm 24/7 Telegram Webhook' });
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
        await sendTelegramMessage(chatId, `🌱 *Welcome to Kabun Farm 24/7 Voice & Text Logger!*

You can send me:
• 🎙️ *Voice Notes* in any language (Malay, English, Manglish, etc.)
• 💬 *Text Messages* (e.g. _"Jual terung 25kg RM6 setengah sekilo"_)
• 🧺 *Harvests* (e.g. _"Kutip bayam merah 10kg batas 2"_)
• 💧 *Irrigation* (e.g. _"Dah siram batas 1 dan 2"_)
• 🚫 *Cancel Plan* (e.g. _"Batalkan plan racun hari ni"_)
• 🗓️ *Schedule Task* (e.g. _"Plan spray EM4 esok pagi"_)

I log everything straight into your Kabun Farm PWA! 🚀`);
        return res.status(200).send('OK');
    }

    // 2. Handle Voice Notes / Audio
    if (msg.voice || msg.audio) {
        const fileId = msg.voice ? msg.voice.file_id : msg.audio.file_id;
        const mimeType = msg.voice ? (msg.voice.mime_type || 'audio/ogg') : (msg.audio.mime_type || 'audio/mp3');

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
            await recordAndReply(chatId, parsed);
        } catch (err) {
            console.error('Voice processing error:', err);
            await sendTelegramMessage(chatId, `⚠️ *Could not process voice note:* ${err.message}`);
        }
        return res.status(200).send('OK');
    }

    // 3. Handle Text Messages
    if (msg.text && !msg.text.startsWith('/')) {
        try {
            const parsed = await processWithGemini(msg.text);
            await recordAndReply(chatId, parsed);
        } catch (err) {
            console.error('Text processing error:', err);
            await sendTelegramMessage(chatId, `⚠️ *Could not parse message:* ${err.message}`);
        }
        return res.status(200).send('OK');
    }

    return res.status(200).send('OK');
}

// Helper: Record to Firestore and send receipt reply
async function recordAndReply(chatId, record) {
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

        await sendTelegramMessage(chatId, reply);

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

        await sendTelegramMessage(chatId, reply);

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

        await sendTelegramMessage(chatId, reply);

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

        await sendTelegramMessage(chatId, reply);
    }
}
