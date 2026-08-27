// ============================================================================
// Kabun Farm Intelligence — Daily Automated Morning Reminder Cron Handler
// Route: /api/reminders
// Triggered by Vercel Cron at 06:30 AM MYT (22:30 UTC)
// ============================================================================

import { generateDailyBriefing, sendTelegramMessage, cleanSecret } from './telegram.js';

export default async function handler(req, res) {
    const isVercelCron = Boolean(req.headers['x-vercel-cron']);
    const expectedSecret = cleanSecret(process.env.CRON_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET);
    const providedKey = cleanSecret(req.query?.key || req.headers['x-setup-key'] || req.headers['authorization']?.replace(/^Bearer\s+/i, ''));

    // Authorization check: allow if Vercel internal cron header is present OR valid secret provided
    if (!isVercelCron && expectedSecret && providedKey !== expectedSecret) {
        return res.status(401).json({
            error: 'Unauthorized. Pass secret via ?key=YOUR_SECRET or Authorization header.'
        });
    }

    const allowedChatIdsStr = process.env.ALLOWED_CHAT_IDS;
    if (!allowedChatIdsStr) {
        return res.status(200).json({
            message: 'No ALLOWED_CHAT_IDS configured in Vercel environment variables. Skipping reminder.',
            sentCount: 0
        });
    }

    const chatIds = allowedChatIdsStr.split(',').map(s => s.trim()).filter(Boolean);
    if (!chatIds.length) {
        return res.status(200).json({
            message: 'No valid chat IDs found in ALLOWED_CHAT_IDS.',
            sentCount: 0
        });
    }

    try {
        const briefingText = await generateDailyBriefing(1);
        const results = [];

        for (const chatId of chatIds) {
            const msgId = await sendTelegramMessage(chatId, briefingText);
            results.push({ chatId, success: Boolean(msgId), messageId: msgId });
        }

        const successCount = results.filter(r => r.success).length;
        return res.status(200).json({
            success: true,
            timestamp: new Date().toISOString(),
            sentCount: successCount,
            totalRecipients: chatIds.length,
            deliveryDetails: results
        });
    } catch (e) {
        console.error('Daily reminder cron error:', e);
        return res.status(500).json({ error: e.message });
    }
}
