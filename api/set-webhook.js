// ============================================================================
// Helper route to register Telegram Webhook to this Vercel deployment
// Visit: https://<your-vercel-domain>/api/set-webhook
// ============================================================================

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export default async function handler(req, res) {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const webhookUrl = `${proto}://${host}/api/telegram`;

    try {
        const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
        const data = await tgRes.json();

        return res.status(200).json({
            message: "Telegram Webhook Setup Result",
            registeredUrl: webhookUrl,
            telegramResponse: data
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
