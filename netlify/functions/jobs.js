// Netlify Function: Jobs API
// This handles all job CRUD operations with Google Calendar sync

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://eplsowiliweiilcoomtd.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Google Calendar configuration
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'jacksum81@gmail.com';
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SERVICE_ACCOUNT_PRIVATE_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

// ============================================================
// Supabase Helpers
// ============================================================

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

    if (response.status === 204) {
        return null;
    }

    return response.json();
}

// ============================================================
// Google Calendar Helpers
// ============================================================

async function createJWT() {
    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        iss: SERVICE_ACCOUNT_EMAIL,
        sub: SERVICE_ACCOUNT_EMAIL,
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
        scope: 'https://www.googleapis.com/auth/calendar.events'
    };

    const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const unsignedToken = `${base64Header}.${base64Payload}`;

    const crypto = require('crypto');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(unsignedToken);

    let privateKey = SERVICE_ACCOUNT_PRIVATE_KEY;
    privateKey = privateKey.replace(/\\n/g, '\n');
    privateKey = privateKey.replace(/\\\\n/g, '\n');
    const signature = sign.sign(privateKey, 'base64url');

    return `${unsignedToken}.${signature}`;
}

async function getGoogleAccessToken() {
    const jwt = await createJWT();
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt
        })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to get access token: ${error}`);
    }

    const data = await response.json();
    return data.access_token;
}

async function calendarRequest(endpoint, options = {}) {
    const accessToken = await getGoogleAccessToken();
    const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GOOGLE_CALENDAR_ID)}`;

    const response = await fetch(`${baseUrl}${endpoint}`, {
        method: options.method || 'GET',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            ...options.headers
        },
        body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Calendar API error: ${response.status} - ${error}`);
    }

    if (response.status === 204) {
        return null;
    }

    return response.json();
}

function jobToCalendarEvent(job) {
    const startDate = new Date(job.start_time);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    const title = job.title || 'Lawn Job';

    let description = `JLS Lawn Maintenance Job\n\n`;
    if (job.job_type) description += `Type: ${job.job_type}\n`;
    if (job.price) description += `Price: $${job.price}\n`;
    if (job.notes) description += `Notes: ${job.notes}\n`;
    if (job.status) description += `Status: ${job.status}\n`;

    return {
        summary: title,
        description: description,
        location: job.address || '',
        start: { dateTime: startDate.toISOString(), timeZone: 'America/New_York' },
        end: { dateTime: endDate.toISOString(), timeZone: 'America/New_York' },
        colorId: job.job_type === 'mowing' ? '10' : '6'
    };
}

async function createCalendarEvent(job) {
    if (!SERVICE_ACCOUNT_EMAIL || !SERVICE_ACCOUNT_PRIVATE_KEY) {
        console.log('Google Calendar not configured, skipping sync');
        return null;
    }

    try {
        const calendarEvent = jobToCalendarEvent(job);
        const created = await calendarRequest('/events', {
            method: 'POST',
            body: calendarEvent
        });
        console.log('📅 Created Google Calendar event:', created.id);
        return created.id;
    } catch (error) {
        console.error('Calendar create error:', error.message);
        return null;
    }
}

async function deleteCalendarEvent(googleEventId) {
    if (!googleEventId || !SERVICE_ACCOUNT_EMAIL || !SERVICE_ACCOUNT_PRIVATE_KEY) {
        return;
    }

    try {
        await calendarRequest(`/events/${googleEventId}`, { method: 'DELETE' });
        console.log('📅 Deleted Google Calendar event:', googleEventId);
    } catch (error) {
        console.error('Calendar delete error:', error.message);
    }
}

// ============================================================
// CORS Headers
// ============================================================

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};

// ============================================================
// Main Handler
// ============================================================

exports.handler = async (event, context) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: '' };
    }

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

        // POST /api/jobs - Create job(s) with Google Calendar sync
        if (event.httpMethod === 'POST' && segments.length === 0) {
            const body = JSON.parse(event.body);
            const jobs = Array.isArray(body) ? body : [body];

            // Create jobs in Supabase
            const created = await supabaseRequest('jobs', {
                method: 'POST',
                body: jobs
            });

            // Sync each job to Google Calendar and save the event ID
            for (const job of created) {
                const googleEventId = await createCalendarEvent(job);
                if (googleEventId) {
                    // Update the job with the Google event ID
                    await supabaseRequest(`jobs?id=eq.${job.id}`, {
                        method: 'PATCH',
                        body: { google_event_id: googleEventId },
                        prefer: 'return=minimal'
                    });
                }
            }

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

            const jobs = await supabaseRequest(`jobs?recurring_id=eq.${recurringId}&select=id`);

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

        // DELETE /api/jobs/delete/:id - Hard delete a single job (with calendar sync)
        if (event.httpMethod === 'DELETE' && segments[0] === 'delete' && segments[1]) {
            const jobId = segments[1];

            // First, get the job to find the Google event ID
            const jobs = await supabaseRequest(`jobs?id=eq.${jobId}&select=id,google_event_id`);
            const job = jobs && jobs[0];

            // Delete from Google Calendar if we have an event ID
            if (job && job.google_event_id) {
                await deleteCalendarEvent(job.google_event_id);
            }

            // Delete from Supabase
            await supabaseRequest(`jobs?id=eq.${jobId}`, {
                method: 'DELETE',
                prefer: 'return=minimal'
            });

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, deleted: 1 })
            };
        }

        // DELETE /api/jobs/delete-future/:recurringId/:fromDate - Hard delete future jobs
        if (event.httpMethod === 'DELETE' && segments[0] === 'delete-future' && segments[1] && segments[2]) {
            const recurringId = segments[1];
            const fromDate = decodeURIComponent(segments[2]);

            const jobs = await supabaseRequest(
                `jobs?recurring_id=eq.${recurringId}&start_time=gte.${fromDate}&select=id,google_event_id`
            );

            let count = 0;
            for (const job of jobs || []) {
                // Delete from Google Calendar
                if (job.google_event_id) {
                    await deleteCalendarEvent(job.google_event_id);
                }
                // Delete from Supabase
                await supabaseRequest(`jobs?id=eq.${job.id}`, {
                    method: 'DELETE',
                    prefer: 'return=minimal'
                });
                count++;
            }

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ deleted: count })
            };
        }

        // DELETE /api/jobs/delete-series/:recurringId - Hard delete entire series
        if (event.httpMethod === 'DELETE' && segments[0] === 'delete-series' && segments[1]) {
            const recurringId = segments[1];

            const jobs = await supabaseRequest(`jobs?recurring_id=eq.${recurringId}&select=id,google_event_id`);

            let count = 0;
            for (const job of jobs || []) {
                // Delete from Google Calendar
                if (job.google_event_id) {
                    await deleteCalendarEvent(job.google_event_id);
                }
                // Delete from Supabase
                await supabaseRequest(`jobs?id=eq.${job.id}`, {
                    method: 'DELETE',
                    prefer: 'return=minimal'
                });
                count++;
            }

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ deleted: count })
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
