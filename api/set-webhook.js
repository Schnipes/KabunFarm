// ============================================================================
// Helper route to register Telegram Webhook to this Vercel deployment
// Visit: https://<your-vercel-domain>/api/set-webhook?key=<your-secret-or-setup-key>
// ============================================================================

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || process.env.SETUP_KEY;

export default async function handler(req, res) {
    // Basic protection: require key query param if secret is configured in env
    const providedKey = req.query?.key || req.headers['x-setup-key'];
    if (WEBHOOK_SECRET && providedKey !== WEBHOOK_SECRET) {
        return res.status(401).json({
            error: "Unauthorized. Pass your secret via query param: ?key=YOUR_SECRET"
        });
    }

    if (!TELEGRAM_TOKEN) {
        return res.status(500).json({ error: "TELEGRAM_BOT_TOKEN is not configured in environment." });
    }

    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const webhookUrl = `${proto}://${host}/api/telegram`;

    try {
        let setUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;
        if (process.env.TELEGRAM_WEBHOOK_SECRET) {
            setUrl += `&secret_token=${encodeURIComponent(process.env.TELEGRAM_WEBHOOK_SECRET)}`;
        }

        const tgRes = await fetch(setUrl);
        const data = await tgRes.json();

        return res.status(200).json({
            message: "Telegram Webhook Setup Result",
            registeredUrl: webhookUrl,
            hasSecretToken: !!process.env.TELEGRAM_WEBHOOK_SECRET,
            telegramResponse: data
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}

