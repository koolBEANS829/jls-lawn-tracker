/**
 * Netlify Function: Google Calendar Sync
 * Syncs lawn care jobs to Google Calendar for family visibility
 */

// Google Calendar API configuration
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'jacksum81@gmail.com';

// Service account credentials from environment variables
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SERVICE_ACCOUNT_PRIVATE_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

// JWT library for Google API authentication (we'll use a simple implementation)
// Since Netlify Functions don't have built-in JWT, we'll use the Web Crypto API

/**
 * Creates a JWT token for Google API authentication
 */
async function createJWT() {
    const header = {
        alg: 'RS256',
        typ: 'JWT'
    };

    const now = Math.floor(Date.now() / 1000);
    const payload = {
        iss: SERVICE_ACCOUNT_EMAIL,
        sub: SERVICE_ACCOUNT_EMAIL,
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
        scope: 'https://www.googleapis.com/auth/calendar.events'
    };

    // Base64url encode header and payload
    const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const unsignedToken = `${base64Header}.${base64Payload}`;

    // Sign with private key
    const crypto = require('crypto');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(unsignedToken);

    // Clean up the private key (handle escaped newlines from env var)
    // Handle multiple formats: literal \n, escaped \\n, or already real newlines
    let privateKey = SERVICE_ACCOUNT_PRIVATE_KEY;
    // Replace literal backslash-n with actual newlines
    privateKey = privateKey.replace(/\\n/g, '\n');
    // Also handle double-escaped
    privateKey = privateKey.replace(/\\\\n/g, '\n');
    const signature = sign.sign(privateKey, 'base64url');

    return `${unsignedToken}.${signature}`;
}

/**
 * Gets an access token from Google using JWT
 */
async function getAccessToken() {
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

/**
 * Makes an authenticated request to Google Calendar API
 */
async function calendarRequest(endpoint, options = {}) {
    const accessToken = await getAccessToken();
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

/**
 * Converts a lawn job to a Google Calendar event
 */
function jobToCalendarEvent(job) {
    // Parse the start time
    const startDate = new Date(job.start_time);

    // Assume jobs are 1 hour by default
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

    // Build the event title
    const jobTypeEmoji = job.job_type === 'mowing' ? '🌿' : '🌳';
    const title = `${jobTypeEmoji} ${job.title || 'Lawn Job'}`;

    // Build description with job details
    let description = `JLS Lawn Maintenance Job\n\n`;
    if (job.job_type) description += `Type: ${job.job_type}\n`;
    if (job.price) description += `Price: $${job.price}\n`;
    if (job.notes) description += `Notes: ${job.notes}\n`;
    if (job.status) description += `Status: ${job.status}\n`;

    return {
        summary: title,
        description: description,
        location: job.address || '',
        start: {
            dateTime: startDate.toISOString(),
            timeZone: 'America/New_York'  // Adjust for your timezone
        },
        end: {
            dateTime: endDate.toISOString(),
            timeZone: 'America/New_York'
        },
        // Color based on job type (green for mowing, brown for hedge)
        colorId: job.job_type === 'mowing' ? '10' : '6'
    };
}

// CORS headers
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

    // Check for required environment variables
    if (!SERVICE_ACCOUNT_EMAIL || !SERVICE_ACCOUNT_PRIVATE_KEY) {
        return {
            statusCode: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: 'Server configuration error: Missing Google service account credentials'
            })
        };
    }

    try {
        const path = event.path.replace('/.netlify/functions/google-calendar', '').replace('/api/calendar', '');
        const segments = path.split('/').filter(Boolean);
        const body = event.body ? JSON.parse(event.body) : {};

        // POST /api/calendar/create - Create a calendar event for a job
        if (event.httpMethod === 'POST' && segments[0] === 'create') {
            const calendarEvent = jobToCalendarEvent(body);
            const created = await calendarRequest('/events', {
                method: 'POST',
                body: calendarEvent
            });

            return {
                statusCode: 201,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: true,
                    googleEventId: created.id,
                    htmlLink: created.htmlLink
                })
            };
        }

        // PUT /api/calendar/update/:eventId - Update a calendar event
        if (event.httpMethod === 'PUT' && segments[0] === 'update' && segments[1]) {
            const eventId = segments[1];
            const calendarEvent = jobToCalendarEvent(body);

            const updated = await calendarRequest(`/events/${eventId}`, {
                method: 'PUT',
                body: calendarEvent
            });

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: true,
                    googleEventId: updated.id
                })
            };
        }

        // DELETE /api/calendar/delete/:eventId - Delete a calendar event
        if (event.httpMethod === 'DELETE' && segments[0] === 'delete' && segments[1]) {
            const eventId = segments[1];

            await calendarRequest(`/events/${eventId}`, {
                method: 'DELETE'
            });

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, deleted: true })
            };
        }

        // GET /api/calendar/test - Test the connection
        if (event.httpMethod === 'GET' && segments[0] === 'test') {
            // Try to list upcoming events to verify connection
            const events = await calendarRequest('/events?maxResults=1');

            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: true,
                    message: 'Google Calendar connection successful!',
                    calendarId: GOOGLE_CALENDAR_ID
                })
            };
        }

        return {
            statusCode: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Not found' })
        };

    } catch (error) {
        console.error('Calendar API Error:', error);
        return {
            statusCode: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: error.message })
        };
    }
};
