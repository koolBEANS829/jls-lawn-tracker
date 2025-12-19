// Netlify Function: Jobs API
// This handles all job CRUD operations, keeping the Supabase key server-side

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://eplsowiliweiilcoomtd.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Helper to make Supabase REST API calls
async function supabaseRequest(path, options = {}) {
    const url = `${SUPABASE_URL}/rest/v1/${path}`;

    const headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': options.prefer || 'return=representation'
    };

    const response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Supabase error: ${response.status} - ${error}`);
    }

    // For DELETE or when no content expected
    if (response.status === 204) {
        return null;
    }

    return response.json();
}

// CORS headers for all responses
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};

exports.handler = async (event, context) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: '' };
    }

    // Check for API key
    if (!SUPABASE_KEY) {
        return {
            statusCode: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Server configuration error: Missing SUPABASE_SERVICE_KEY' })
        };
    }

    try {
        const path = event.path.replace('/.netlify/functions/jobs', '').replace('/api/jobs', '');
        const segments = path.split('/').filter(Boolean);

        // GET /api/jobs - Fetch all jobs
        if (event.httpMethod === 'GET' && segments.length === 0) {
            const jobs = await supabaseRequest('jobs?select=*');
            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify(jobs)
            };
        }

        // POST /api/jobs - Create job(s)
        if (event.httpMethod === 'POST' && segments.length === 0) {
            const body = JSON.parse(event.body);
            const jobs = Array.isArray(body) ? body : [body];

            const created = await supabaseRequest('jobs', {
                method: 'POST',
                body: jobs
            });

            return {
                statusCode: 201,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify(created)
            };
        }

        // PUT /api/jobs/series/:recurringId - Update all jobs in a series
        if (event.httpMethod === 'PUT' && segments[0] === 'series' && segments[1]) {
            const recurringId = segments[1];
            const updates = JSON.parse(event.body);

            // First get all jobs in the series
            const jobs = await supabaseRequest(`jobs?recurring_id=eq.${recurringId}&select=id`);

            // Update each job with timestamp
            let count = 0;
            for (const job of jobs || []) {
                await supabaseRequest(`jobs?id=eq.${job.id}`, {
                    method: 'PATCH',
                    body: { ...updates, updated_at: new Date().toISOString() },
                    prefer: 'return=minimal'
                });
                count++;
            }

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ updated: count })
            };
        }

        // PUT /api/jobs/:id - Update a single job
        if (event.httpMethod === 'PUT' && segments[0] && segments[0] !== 'series') {
            const jobId = segments[0];
            const updates = JSON.parse(event.body);

            await supabaseRequest(`jobs?id=eq.${jobId}`, {
                method: 'PATCH',
                body: { ...updates, updated_at: new Date().toISOString() },
                prefer: 'return=minimal'
            });

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true })
            };
        }

        // PATCH /api/jobs/cancel/:id - Cancel a single job
        if (event.httpMethod === 'PATCH' && segments[0] === 'cancel' && segments[1]) {
            const jobId = segments[1];

            await supabaseRequest(`jobs?id=eq.${jobId}`, {
                method: 'PATCH',
                body: { status: 'cancelled', updated_at: new Date().toISOString() },
                prefer: 'return=minimal'
            });

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true })
            };
        }

        // PATCH /api/jobs/cancel-future/:recurringId/:fromDate - Cancel future jobs
        if (event.httpMethod === 'PATCH' && segments[0] === 'cancel-future' && segments[1] && segments[2]) {
            const recurringId = segments[1];
            const fromDate = decodeURIComponent(segments[2]);

            const jobs = await supabaseRequest(
                `jobs?recurring_id=eq.${recurringId}&start_time=gte.${fromDate}&select=id`
            );

            let count = 0;
            for (const job of jobs || []) {
                await supabaseRequest(`jobs?id=eq.${job.id}`, {
                    method: 'PATCH',
                    body: { status: 'cancelled', updated_at: new Date().toISOString() },
                    prefer: 'return=minimal'
                });
                count++;
            }

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ cancelled: count })
            };
        }

        // PATCH /api/jobs/cancel-series/:recurringId - Cancel entire series
        if (event.httpMethod === 'PATCH' && segments[0] === 'cancel-series' && segments[1]) {
            const recurringId = segments[1];

            const jobs = await supabaseRequest(`jobs?recurring_id=eq.${recurringId}&select=id`);

            let count = 0;
            for (const job of jobs || []) {
                await supabaseRequest(`jobs?id=eq.${job.id}`, {
                    method: 'PATCH',
                    body: { status: 'cancelled', updated_at: new Date().toISOString() },
                    prefer: 'return=minimal'
                });
                count++;
            }

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ cancelled: count })
            };
        }

        // PATCH /api/jobs/done/:id - Mark job as done
        if (event.httpMethod === 'PATCH' && segments[0] === 'done' && segments[1]) {
            const jobId = segments[1];

            await supabaseRequest(`jobs?id=eq.${jobId}`, {
                method: 'PATCH',
                body: { status: 'done', updated_at: new Date().toISOString() },
                prefer: 'return=minimal'
            });

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true })
            };
        }

        // 404 for unmatched routes
        return {
            statusCode: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Not found', path: event.path, method: event.httpMethod })
        };

    } catch (error) {
        console.error('API Error:', error);
        return {
            statusCode: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: error.message })
        };
    }
};
