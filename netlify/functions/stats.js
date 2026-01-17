// Netlify Function: Stats API
// Provides quote-to-job conversion statistics by aggregating data from TWO databases
// DB 1: Quotes/Reachouts (Client DB)
// DB 2: Jobs (Server DB)

// Quotes DB Config (Reachouts)
const QUOTES_URL = 'https://naxhczwlfymynqiescmn.supabase.co';
const QUOTES_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5heGhjendsZnlteW5xaWVzY21uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNzI3NDgsImV4cCI6MjA4Mjk0ODc0OH0.AG-OeNODU87hhw124x1gryh0CB8dP4SjDyUIIM35HRw';

// Jobs DB Config (Jobs) - Uses Netlify Env Vars or Fallback to old DB ID
const JOBS_URL = process.env.SUPABASE_URL || 'https://eplsowiliweiilcoomtd.supabase.co';
const JOBS_KEY = process.env.SUPABASE_SERVICE_KEY;

// ============================================================
// Supabase Helpers
// ============================================================

async function fetchFromSupabase(baseUrl, apiKey, path, options = {}) {
    if (!apiKey) {
        console.warn(`Missing API Key for request to ${baseUrl}`);
        return []; // Return empty array if key is missing (e.g. searching for jobs without env var)
    }

    const url = `${baseUrl}/rest/v1/${path}`;

    const headers = {
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Prefer': options.prefer || 'return=representation'
    };

    try {
        const response = await fetch(url, {
            method: options.method || 'GET',
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Supabase Error (${path}): ${response.status} - ${errorText}`);
            // Don't throw, just return empty so partial dash loads
            return [];
        }

        if (response.status === 204) {
            return [];
        }

        return await response.json();
    } catch (err) {
        console.error(`Fetch Error (${path}):`, err);
        return [];
    }
}

// ============================================================
// CORS Headers
// ============================================================

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

// ============================================================
// Main Handler
// ============================================================

exports.handler = async (event, context) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: '' };
    }

    try {
        // Only handle GET requests
        if (event.httpMethod !== 'GET') {
            return {
                statusCode: 405,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Method not allowed' })
            };
        }

        // Parallel Fetch: Get Quotes from DB1 and Jobs from DB2
        const [quotes, jobs] = await Promise.all([
            fetchFromSupabase(QUOTES_URL, QUOTES_KEY, 'quote_requests?select=id,status,created_at,service,name'),
            fetchFromSupabase(JOBS_URL, JOBS_KEY, 'jobs?select=id,status,job_type,created_at,title')
        ]);

        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        // Calculate quote stats
        const totalQuotes = quotes.length;
        const convertedQuotes = quotes.filter(q => q.status === 'converted').length;
        const contactedQuotes = quotes.filter(q => q.status === 'contacted').length;
        const newQuotes = quotes.filter(q => q.status === 'new').length;
        const dismissedQuotes = quotes.filter(q => q.status === 'dismissed').length;

        // 30-day stats
        const quotes30Days = quotes.filter(q => new Date(q.created_at) >= thirtyDaysAgo);
        const totalQuotes30Days = quotes30Days.length;
        const convertedQuotes30Days = quotes30Days.filter(q => q.status === 'converted').length;

        // 7-day stats
        const quotes7Days = quotes.filter(q => new Date(q.created_at) >= sevenDaysAgo);
        const totalQuotes7Days = quotes7Days.length;
        const convertedQuotes7Days = quotes7Days.filter(q => q.status === 'converted').length;

        // Job stats
        const totalJobs = jobs.length;
        const completedJobs = jobs.filter(j => j.status === 'done').length;
        const cancelledJobs = jobs.filter(j => j.status === 'cancelled').length;
        const activeJobs = jobs.filter(j => j.status !== 'done' && j.status !== 'cancelled').length;

        // Jobs by type
        const mowingJobs = jobs.filter(j => j.job_type === 'mowing').length;
        const hedgeJobs = jobs.filter(j => j.job_type === 'hedge').length;
        const quoteVisits = jobs.filter(j => j.job_type === 'quote').length;

        // Quote source breakdown
        const quotesByService = {};
        quotes.forEach(q => {
            const service = q.service || 'unknown';
            quotesByService[service] = (quotesByService[service] || 0) + 1;
        });

        // Monthly trends (last 6 months)
        const monthlyStats = [];
        for (let i = 5; i >= 0; i--) {
            const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);

            const monthQuotes = quotes.filter(q => {
                const d = new Date(q.created_at);
                return d >= monthStart && d <= monthEnd;
            });

            const monthConverted = monthQuotes.filter(q => q.status === 'converted').length;

            monthlyStats.push({
                month: monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
                quotes: monthQuotes.length,
                converted: monthConverted,
                rate: monthQuotes.length > 0 ? Math.round((monthConverted / monthQuotes.length) * 100) : 0
            });
        }

        // Calculate conversion rates
        const conversionRate = totalQuotes > 0
            ? Math.round((convertedQuotes / totalQuotes) * 100)
            : 0;
        const conversionRate30Days = totalQuotes30Days > 0
            ? Math.round((convertedQuotes30Days / totalQuotes30Days) * 100)
            : 0;
        const conversionRate7Days = totalQuotes7Days > 0
            ? Math.round((convertedQuotes7Days / totalQuotes7Days) * 100)
            : 0;

        const stats = {
            quotes: {
                total: totalQuotes,
                converted: convertedQuotes,
                contacted: contactedQuotes,
                new: newQuotes,
                dismissed: dismissedQuotes,
                conversionRate: conversionRate,
                last30Days: {
                    total: totalQuotes30Days,
                    converted: convertedQuotes30Days,
                    rate: conversionRate30Days
                },
                last7Days: {
                    total: totalQuotes7Days,
                    converted: convertedQuotes7Days,
                    rate: conversionRate7Days
                },
                byService: quotesByService
            },
            jobs: {
                total: totalJobs,
                completed: completedJobs,
                cancelled: cancelledJobs,
                active: activeJobs,
                byType: {
                    mowing: mowingJobs,
                    hedge: hedgeJobs,
                    quote: quoteVisits
                }
            },
            trends: monthlyStats,
            generatedAt: now.toISOString()
        };

        return {
            statusCode: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify(stats)
        };

    } catch (error) {
        console.error('Stats API Error:', error);
        return {
            statusCode: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: error.message })
        };
    }
};
