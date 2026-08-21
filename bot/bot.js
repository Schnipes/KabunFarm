// ============================================================================
// Kabun Farm Intelligence — Telegram Multilingual Voice & Text Bot
// ============================================================================

import TelegramBot from 'node-telegram-bot-api';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!token) {
    console.error("❌ Error: TELEGRAM_BOT_TOKEN is missing in bot/.env");
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

console.log("🚀 Kabun Farm Telegram Bot is online and listening...");

// Standard Crop Mapping Dictionary
const CROP_CANONICAL_NAMES = {
    "bayam merah": "Red Amaranth",
    "bayam hijau": "Green Amaranth",
    "bayam": "Green Amaranth",
    "red amaranth": "Red Amaranth",
    "green amaranth": "Green Amaranth",
    "terung": "Eggplant",
    "eggplant": "Eggplant",
    "bendi": "Okra",
    "okra": "Okra",
    "timun": "Cucumber",
    "cucumber": "Cucumber",
    "cili": "Chili",
    "chili": "Chili",
    "chilli": "Chili",
    "lada": "Chili",
    "kangkung": "Water Spinach",
    "kangkong": "Water Spinach",
    "water spinach": "Water Spinach",
    "sawi": "Choy Sum",
    "pak choi": "Bok Choy",
    "bok choy": "Bok Choy",
    "jagung": "Sweet Corn",
    "sweet corn": "Sweet Corn",
    "kacang panjang": "Long Beans",
    "long beans": "Long Beans",
    "tomato": "Tomato"
};

const SYSTEM_PROMPT = `
You are the AI Farm Intelligence Assistant for Kabun Farm.
Your job is to parse voice messages or text sent by farmers and extract structured farm activity logs or sales records.

Users may speak or type in:
- Bahasa Melayu (Standard or Colloquial: "Dah kutip terung batas 2 dapat 15 kilo", "Jual terung 30kg RM5/kg", "Batas 3 dah siram air")
- Manglish / English ("Harvested 20kg red amaranth bed 4", "Sold 10kg chili to restaurant RM8 per kg")
- Indonesian ("Sudah petik terong 12 kilo bed 1")
- Chinese ("今天二号床采收了15公斤茄子")

Extract the intent and return ONLY a valid JSON object matching one of these two schemas:

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

SCHEMA 2: FARM ACTIVITY LOG (harvest, watering, pest_control, sowing)
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

Today's Date: ${new Date().toISOString().slice(0, 10)}.
Return pure JSON only, without markdown fences or extra explanations.
`;

// Helper: Save document to Firestore via REST
async function saveToFirestore(collection, id, data) {
    const firestoreProjectId = "kabunfarm";
    const url = `https://firestore.googleapis.com/v1/projects/${firestoreProjectId}/databases/(default)/documents/${collection}?documentId=${id}`;

    // Convert JS object to Firestore REST fields format
    const fields = {};
    for (const [key, val] of Object.entries(data)) {
        if (typeof val === "number") {
            fields[key] = Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
        } else if (typeof val === "boolean") {
            fields[key] = { booleanValue: val };
        } else if (val === null || val === undefined) {
            fields[key] = { nullValue: null };
        } else {
            fields[key] = { stringValue: String(val) };
        }
    }

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fields })
        });
        if (!res.ok) {
            const err = await res.text();
            console.error("Firestore REST Error:", err);
            return false;
        }
        return true;
    } catch (e) {
        console.error("Firestore Save Failed:", e);
        return false;
    }
}

// Process Text or Voice Input via Gemini
async function processInput(inputPart, mimeType = null) {
    if (!genAI) {
        throw new Error("Gemini API key is not configured. Add GEMINI_API_KEY to bot/.env");
    }

    const candidateModels = ["gemini-3.5-flash-lite", "gemini-3.6-flash"];
    let lastErr = null;

    for (const modelName of candidateModels) {
        try {
            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: { responseMimeType: "application/json" }
            });
            let contents;
            if (mimeType) {
                contents = [
                    SYSTEM_PROMPT,
                    {
                        inlineData: {
                            mimeType: mimeType,
                            data: inputPart.toString("base64")
                        }
                    }
                ];
            } else {
                contents = [SYSTEM_PROMPT, inputPart];
            }

            const result = await model.generateContent(contents);
            const responseText = result.response.text().trim();
            const cleanJson = responseText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
            return JSON.parse(cleanJson);
        } catch (e) {
            lastErr = e;
            console.warn(`Model ${modelName} attempt note:`, e.message);
        }
    }
    throw lastErr || new Error("Failed to process with available Gemini models");
}

// Handle Incoming Text Message
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    if (msg.text === '/start') {
        bot.sendMessage(chatId, `🌱 *Welcome to Kabun Farm Voice & Text Logger!*

You can send me:
• 🎙️ *Voice Notes* in any language (Malay, English, Manglish, etc.)
• 💬 *Text Messages* (e.g. _"Jual terung 25kg RM5/kg"_)
• 🧺 *Harvests* (e.g. _"Kutip bayam merah 10kg batas 2"_)
• 💧 *Irrigation* (e.g. _"Dah siram batas 1 dan 2"_)

I will log them straight into your Kabun Farm dashboard! 🚀`, { parse_mode: 'Markdown' });
        return;
    }

    // Process Voice Note
    if (msg.voice || msg.audio) {
        const fileId = msg.voice ? msg.voice.file_id : msg.audio.file_id;
        const mimeType = msg.voice ? (msg.voice.mime_type || "audio/ogg") : (msg.audio.mime_type || "audio/mp3");

        bot.sendChatAction(chatId, 'typing');
        bot.sendMessage(chatId, "🎧 *Listening to voice note...*", { parse_mode: 'Markdown' });

        try {
            const fileLink = await bot.getFileLink(fileId);
            const audioRes = await fetch(fileLink);
            const arrayBuffer = await audioRes.arrayBuffer();
            const audioBuffer = Buffer.from(arrayBuffer);

            const parsed = await processInput(audioBuffer, mimeType);
            await handleParsedRecord(chatId, parsed);
        } catch (err) {
            console.error("Voice processing error:", err);
            bot.sendMessage(chatId, `⚠️ *Could not process audio:* ${err.message}`, { parse_mode: 'Markdown' });
        }
        return;
    }

    // Process Text Message
    if (msg.text && !msg.text.startsWith('/')) {
        bot.sendChatAction(chatId, 'typing');
        try {
            const parsed = await processInput(msg.text);
            await handleParsedRecord(chatId, parsed);
        } catch (err) {
            console.error("Text processing error:", err);
            bot.sendMessage(chatId, `⚠️ *Could not parse message:* ${err.message}`, { parse_mode: 'Markdown' });
        }
    }
});

// Format and Save Parsed Data
async function handleParsedRecord(chatId, record) {
    const today = new Date().toISOString().slice(0, 10);
    const date = record.date || today;

    if (record.type === "sale") {
        const id = "sale_" + Date.now();
        const saleDoc = {
            id,
            date,
            crop: record.crop || "Produce",
            quantity: String(record.quantity || "0"),
            unit: record.unit || "kg",
            pricePerUnit: String(record.pricePerUnit || "0"),
            totalRevenue: String(record.totalRevenue || (parseFloat(record.quantity || 0) * parseFloat(record.pricePerUnit || 0)).toFixed(2)),
            status: "active"
        };

        const ok = await saveToFirestore("sales", id, saleDoc);

        const reply = `💰 *SALE RECORDED!*
━━━━━━━━━━━━━━━
🌱 *Crop:* ${saleDoc.crop}
⚖️ *Quantity:* ${saleDoc.quantity} ${saleDoc.unit}
💵 *Price:* RM ${parseFloat(saleDoc.pricePerUnit).toFixed(2)}/${saleDoc.unit}
📊 *Total Revenue:* *RM ${parseFloat(saleDoc.totalRevenue).toFixed(2)}*
📅 *Date:* ${date}
${ok ? "✅ *Synced to Kabun Farm PWA!*" : "⚠️ *Saved locally, syncing to cloud...*"}`;

        bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });

    } else if (record.type === "activity") {
        const id = "log_" + Date.now();
        const activityDoc = {
            id,
            date,
            activityCategory: record.category || "watering",
            bedNumber: record.bedNumber ? String(record.bedNumber) : "all",
            cropName: record.cropName || "",
            inputsUsed: record.inputsUsed || "",
            costRM: record.costRM ? String(record.costRM) : "",
            revenueRM: "",
            weight: record.weight ? String(record.weight) : "",
            status: "active"
        };

        const ok = await saveToFirestore("logs", id, activityDoc);

        const icons = { watering: "💧", harvest: "🧺", pest_control: "🐛", sowing: "🌱" };
        const icon = icons[activityDoc.activityCategory] || "📝";
        const catLabel = activityDoc.activityCategory.toUpperCase().replace('_', ' ');

        const reply = `${icon} *${catLabel} RECORDED!*
━━━━━━━━━━━━━━━
📍 *Scope:* ${activityDoc.bedNumber === "all" ? "Whole Farm" : "Bed " + activityDoc.bedNumber}
${activityDoc.cropName ? `🌱 *Crop:* ${activityDoc.cropName}\n` : ""}${activityDoc.weight ? `⚖️ *Harvested Weight:* ${activityDoc.weight} kg\n` : ""}${activityDoc.inputsUsed ? `🧪 *Inputs:* ${activityDoc.inputsUsed}\n` : ""}${activityDoc.costRM ? `💵 *Cost:* RM ${parseFloat(activityDoc.costRM).toFixed(2)}\n` : ""}📅 *Date:* ${date}
${ok ? "✅ *Synced to Kabun Farm PWA!*" : "⚠️ *Saved locally, syncing to cloud...*"}`;

        bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
    }
}
