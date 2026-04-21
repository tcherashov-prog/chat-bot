// backend/api/b24-stats.js - Vercel Serverless API route

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Helper function for date calculation
function getYesterdaysDate() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
}

async function getCount(entity, b24, ydate) {
    let filter = {};
    if (entity !== 'company') { // "company" may not have create date
        filter = {
            [entity === 'deal' ? '>DATE_CREATE' : '>DATE_CREATE']: (new Date(ydate * 1000)).toISOString().slice(0, 10) + "T00:00:00+03:00",
            ['<DATE_CREATE']: (new Date(ydate * 1000 + 86400000)).toISOString().slice(0, 10) + "T00:00:00+03:00"
        };
    }
    const urls = {
        'deal': 'crm.deal.list',
        'lead': 'crm.lead.list',
        'contact': 'crm.contact.list',
        'company': 'crm.company.list'
    };
    // Only count, don't fetch all fields
    const res = await fetch(`${b24.restURL}/rest/${b24.userId}/${b24.token}/${urls[entity]}?select[]=ID&filter=${encodeURIComponent(JSON.stringify(filter))}`);
    if (!res.ok) return 0;
    const json = await res.json();
    return Array.isArray(json.result) ? json.result.length : (json.result ? json.result.length : 0);
}

module.exports = async (req, res) => {
    // Only POST
    if (req.method !== "POST") {
        return res.status(405).json({error: "Method not allowed"});
    }
    // Extract from body (Vercel passes req.body as parsed object usually)
    const { rest_domain, auth, event } = req.body;
    // This endpoint should be called via Bitrix24 REST handler (webhook or installable app)
    if (!auth || !auth.access_token) {
        return res.status(401).json({error: "Invalid Bitrix24 auth"});
    }

    // Only run for a bot /command text event
    if (!event || !event.text || !event.text.startsWith('/stat')) {
        return res.status(200).json({message: "Send /stat in chat to get yesterday's CRM stats."});
    }

    const b24 = {
        restURL: `https://${rest_domain}`,
        userId: auth.user_id,
        token: auth.access_token
    };
    const ydate = getYesterdaysDate();

    // Get counts for each type
    const [dealCount, leadCount, contactCount, companyCount] = await Promise.all([
        getCount('deal', b24, ydate),
        getCount('lead', b24, ydate),
        getCount('contact', b24, ydate),
        getCount('company', b24, ydate)
    ]);

    // Build message
    const msg = `Статистика за вчера:\n`
        + `Сделки: ${dealCount}\n`
        + `Лиды: ${leadCount}\n`
        + `Контакты: ${contactCount}\n`
        + `Компании: ${companyCount}`;

    // Send message via REST
    await fetch(`${b24.restURL}/rest/im.message.add`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            DIALOG_ID: event.dialog_id,
            MESSAGE: msg,
            SYSTEM: 'N'
        })
    });

    res.status(200).json({message: "Stat sent"});
};