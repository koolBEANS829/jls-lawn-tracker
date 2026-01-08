/**
 * JLS Lawn Maintenance - Command Center
 * 
 * A mobile-first job scheduling application for lawn care management.
 * Features: FullCalendar integration, Supabase cloud sync, local fallback.
 */

'use strict';

// ============================================================
// Global Error Handling
// ============================================================

/**
 * Global error handler to prevent total app crashes.
 * Logs errors and provides user feedback.
 */
window.onerror = function (message, source, lineno, colno, error) {
    console.error('Global Error:', { message, source, lineno, colno, error });
    // Don't show error to user for minor issues, just log them
    return true; // Prevents default error handling
};

window.onunhandledrejection = function (event) {
    console.error('Unhandled Promise Rejection:', event.reason);
    // Suppress default behavior for handled rejections
    event.preventDefault();
};

console.log('--- JLS Lawn Tracker Initialized ---');

// ============================================================
// Configuration
// ============================================================

/**
 * Formats a Date object as a local datetime string for datetime-local inputs.
 * This avoids timezone conversion issues that occur with toISOString().
 * @param {Date} date - The date to format
 * @returns {string} Formatted as 'YYYY-MM-DDTHH:mm'
 */
function formatLocalDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

const CONFIG = {
    api: {
        baseUrl: '/api/jobs',  // Netlify Function handles Supabase calls
        calendarUrl: '/api/calendar'  // Google Calendar sync endpoint
    },
    storage: {
        jobsKey: 'jls_local_jobs',
        addressesKey: 'jls_address_history'
    },
    recurrence: {
        weekly: 7,
        biweekly: 14,
        monthly: 30
    }
};

// ============================================================
// Google Calendar Sync
// ============================================================

/**
 * Syncs a job to Google Calendar (creates an event).
 * Runs silently in background - won't block job creation.
 * @param {Object} job - The job data to sync
 * @returns {Promise<string|null>} Google Event ID if successful
 */
async function syncJobToCalendar(job) {
    try {
        const response = await fetch(`${CONFIG.api.calendarUrl}/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(job)
        });

        if (response.ok) {
            const result = await response.json();
            console.log('📅 Synced to Google Calendar:', result.googleEventId);
            return result.googleEventId;
        } else {
            console.warn('⚠️ Calendar sync failed (non-blocking):', await response.text());
            return null;
        }
    } catch (error) {
        console.warn('⚠️ Calendar sync error (non-blocking):', error.message);
        return null;
    }
}

/**
 * Updates a Google Calendar event for a job.
 * @param {string} googleEventId - The Google Calendar event ID
 * @param {Object} job - Updated job data
 */
async function updateCalendarEvent(googleEventId, job) {
    if (!googleEventId) return;

    try {
        const response = await fetch(`${CONFIG.api.calendarUrl}/update/${googleEventId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(job)
        });

        if (response.ok) {
            console.log('📅 Updated Google Calendar event:', googleEventId);
        } else {
            console.warn('⚠️ Calendar update failed:', await response.text());
        }
    } catch (error) {
        console.warn('⚠️ Calendar update error:', error.message);
    }
}

/**
 * Deletes a Google Calendar event.
 * @param {string} googleEventId - The Google Calendar event ID to delete
 */
async function deleteCalendarEvent(googleEventId) {
    if (!googleEventId) return;

    try {
        const response = await fetch(`${CONFIG.api.calendarUrl}/delete/${googleEventId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            console.log('📅 Deleted Google Calendar event:', googleEventId);
        } else {
            console.warn('⚠️ Calendar delete failed:', await response.text());
        }
    } catch (error) {
        console.warn('⚠️ Calendar delete error:', error.message);
    }
}

// ============================================================
// Message Templates (from LAWN CARE RESPONSES.rtf)
// ============================================================

/**
 * Formats a date as "Mon Dec 25" style
 */
function formatDateForMessage(date) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${days[date.getDay()]} ${months[date.getMonth()]} ${date.getDate()}`;
}

/**
 * Formats time as "10:00 AM" style
 */
function formatTimeForMessage(date) {
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 becomes 12
    return `${hours}:${minutes} ${ampm}`;
}

/**
 * Generates reminder message from template.
 * Template: "REMINDER! On XX Xxx XX, JLS Lawn Maintenance will arrive between 
 * XXXX - XXXX to take care of your yard. Please have your cash payment of $XX 
 * ready upon completion. We look forward to providing you excellent service!"
 */
function generateReminderMessage(event) {
    const startDate = event.start || new Date();
    const dateStr = formatDateForMessage(startDate);

    // Create time window (arrival time + 30 minutes)
    const startTime = formatTimeForMessage(startDate);
    const endDate = new Date(startDate);
    endDate.setMinutes(endDate.getMinutes() + 30);
    const endTime = formatTimeForMessage(endDate);

    const price = event.extendedProps?.price || 'TBD';

    return `REMINDER! On ${dateStr}, JLS Lawn Maintenance will arrive between ${startTime} - ${endTime} to take care of your yard. Please have your cash payment of $${price} ready upon completion. We look forward to providing you excellent service!

Jonathan L. Sumerlin
Jackson L. Sumerlin
JLS Lawn Maintenance`;
}

/**
 * Generates follow-up/thank you message from template.
 * Template: "Thank you for allowing JLS Lawn Maintenance to care for your yard! 
 * If you feel our services warrant a review, please provide it at the link below."
 */
function generateFollowUpMessage() {
    return `Thank you for allowing JLS Lawn Maintenance to care for your yard! If you feel our services warrant a review, please provide it at the link below. We look forward to the next time we can provide you excellent service!

Jonathan L. Sumerlin
Jackson L. Sumerlin
JLS Lawn Maintenance

https://www.facebook.com/share/16iCjk4xax/`;
}

/**
 * Generates initial inquiry response template.
 * Template for when someone first reaches out.
 */
function generateInitialReplyMessage() {
    return `Thank you reaching for out to JLS Lawn Maintenance! What is your name, address and when would be a good time to come by to look at your lawn and provide you a quote?

Jonathan L. Sumerlin
Jackson L. Sumerlin
JLS Lawn Maintenance`;
}

// ============================================================
// Global State
// ============================================================

// apiAvailable is set by initializeAPI() in the API Initialization section
let calendar = null;
let currentEventId = null;
let currentRecurringId = null;
let isEditMode = false;
let selectedJobType = '';
let editScope = 'single'; // 'single' or 'all' - for bulk editing recurring jobs

// ============================================================
// Custom Modal Utilities
// ============================================================

/**
 * Modal type configurations with icons and titles.
 */
const MODAL_TYPES = {
    success: { icon: '✅', title: 'Success', headerClass: 'success' },
    error: { icon: '❌', title: 'Error', headerClass: 'error' },
    warning: { icon: '⚠️', title: 'Warning', headerClass: 'warning' },
    info: { icon: 'ℹ️', title: 'Info', headerClass: 'info' },
    confirm: { icon: '❓', title: 'Confirm', headerClass: 'info' }
};

/**
 * Shows a custom modal notification (replaces alert()).
 * @param {string} message - The message to display.
 * @param {string} type - 'success', 'error', 'warning', or 'info'.
 * @returns {Promise<void>} Resolves when modal is closed.
 */
function showModal(message, type = 'info') {
    return new Promise((resolve) => {
        const config = MODAL_TYPES[type] || MODAL_TYPES.info;

        const modal = document.getElementById('custom-modal');
        const header = document.getElementById('custom-modal-header');
        const title = document.getElementById('custom-modal-title');
        const icon = document.getElementById('custom-modal-icon');
        const msgEl = document.getElementById('custom-modal-message');
        const confirmBtn = document.getElementById('custom-modal-confirm');
        const cancelBtn = document.getElementById('custom-modal-cancel');
        const closeBtn = document.getElementById('custom-modal-close');

        // Configure modal
        header.className = 'wizard-header ' + config.headerClass;
        title.textContent = config.title;
        icon.textContent = config.icon;
        msgEl.textContent = message;
        cancelBtn.classList.add('hidden');
        confirmBtn.textContent = 'OK';

        // Show modal
        modal.classList.remove('hidden');

        // Handle close
        const close = () => {
            modal.classList.add('hidden');
            confirmBtn.removeEventListener('click', close);
            closeBtn.removeEventListener('click', close);
            resolve();
        };

        confirmBtn.addEventListener('click', close);
        closeBtn.addEventListener('click', close);
    });
}

/**
 * Shows a custom confirmation modal (replaces confirm()).
 * @param {string} message - The confirmation message.
 * @param {string} type - Modal type for styling (default: 'confirm').
 * @returns {Promise<boolean>} Resolves true if confirmed, false if cancelled.
 */
function showConfirm(message, type = 'confirm') {
    return new Promise((resolve) => {
        const config = MODAL_TYPES[type] || MODAL_TYPES.confirm;

        const modal = document.getElementById('custom-modal');
        const header = document.getElementById('custom-modal-header');
        const title = document.getElementById('custom-modal-title');
        const icon = document.getElementById('custom-modal-icon');
        const msgEl = document.getElementById('custom-modal-message');
        const confirmBtn = document.getElementById('custom-modal-confirm');
        const cancelBtn = document.getElementById('custom-modal-cancel');
        const closeBtn = document.getElementById('custom-modal-close');

        // Configure modal
        header.className = 'wizard-header ' + config.headerClass;
        title.textContent = config.title;
        icon.textContent = config.icon;
        msgEl.textContent = message;
        cancelBtn.classList.remove('hidden');
        confirmBtn.textContent = 'Yes';
        cancelBtn.textContent = 'No';

        // Show modal
        modal.classList.remove('hidden');

        // Handle responses
        const handleConfirm = () => {
            cleanup();
            resolve(true);
        };

        const handleCancel = () => {
            cleanup();
            resolve(false);
        };

        const cleanup = () => {
            modal.classList.add('hidden');
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
            closeBtn.removeEventListener('click', handleCancel);
        };

        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
        closeBtn.addEventListener('click', handleCancel);
    });
}

// ============================================================
// Storage Utilities
// ============================================================

/**
 * Safe wrapper for localStorage operations.
 * Prevents crashes in private browsing or restricted environments.
 */
const Storage = {
    get(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Storage Read Error:', error);
            return null;
        }
    },

    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('Storage Write Error:', error);
            showModal('Could not save data. Private browsing mode?', 'warning');
            return false;
        }
    }
};

// ============================================================
// API Initialization
// ============================================================

// Track if API is available (vs local-only mode)
let apiAvailable = false;

/**
 * Check if the API is available.
 * Falls back to local mode if API is not reachable.
 */
async function initializeAPI() {
    try {
        const response = await fetch(CONFIG.api.baseUrl, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
            apiAvailable = true;
            console.log('✅ API Connected (Cloud Mode)');
            return true;
        } else {
            console.warn('⚠️ API returned error. Running in LOCAL MODE.');
            return false;
        }
    } catch (error) {
        console.warn('⚠️ Could not reach API. Running in LOCAL MODE.', error);
        return false;
    }
}

// ============================================================
// Event Class Helpers
// ============================================================

/**
 * Generates CSS class names for calendar events based on type and status.
 */
function getEventClasses(type, status, isRecurring) {
    const classes = [];

    if (type === 'mowing') classes.push('job-mowing');
    else if (type === 'hedge') classes.push('job-hedge');

    if (status === 'done') classes.push('job-completed');
    if (status === 'cancelled') classes.push('job-cancelled');
    if (isRecurring) classes.push('job-recurring');

    return classes;
}

/**
 * Maps a database job record to a FullCalendar event object.
 */
function mapJobToEvent(job) {
    return {
        id: job.id,
        title: job.title,
        start: job.start_time,
        type: job.job_type,
        notes: job.notes,
        status: job.status,
        price: job.price,
        address: job.address,
        phone: job.client_phone,
        recurring_id: job.recurring_id,
        is_recurring: job.is_recurring,
        recurrence_pattern: job.recurrence_pattern,
        occurrence_number: job.occurrence_number,
        classNames: getEventClasses(job.job_type, job.status, job.is_recurring)
    };
}

// ============================================================
// Calendar Event Rendering
// ============================================================

/**
 * Custom renderer for calendar event content.
 */
function renderEventContent(arg) {
    // Skip rendering for empty day placeholders
    if (arg.event.classNames.includes('job-empty-day')) {
        return { domNodes: [] };
    }

    const { price, address } = arg.event.extendedProps;

    const container = document.createElement('div');
    container.className = 'event-content';

    // Event Title
    const titleEl = document.createElement('div');
    titleEl.className = 'event-title';
    titleEl.textContent = arg.event.title;
    container.appendChild(titleEl);

    // Event Details (Price & Address)
    if (price || address) {
        const detailsEl = document.createElement('div');
        detailsEl.className = 'event-details-row';

        if (price) {
            const priceEl = document.createElement('span');
            priceEl.className = 'event-price';
            priceEl.textContent = `$${price}`;
            detailsEl.appendChild(priceEl);
        }

        if (address) {
            const addrEl = document.createElement('span');
            addrEl.className = 'event-address';
            let shortAddr = address.split(',')[0];
            if (shortAddr.length > 20) shortAddr = shortAddr.substring(0, 18) + '..';
            addrEl.textContent = shortAddr;
            detailsEl.appendChild(addrEl);
        }

        container.appendChild(detailsEl);
    }

    return { domNodes: [container] };
}

/**
 * Generates "No Jobs" placeholders for empty days in list view.
 */
function addEmptyDayPlaceholders(events, startDate, endDate) {
    const daysWithJobs = new Set(
        events.map(e => new Date(e.start).toDateString())
    );

    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current < end) {
        if (!daysWithJobs.has(current.toDateString())) {
            events.push({
                title: 'No Jobs',
                start: new Date(current),
                allDay: true,
                classNames: ['job-empty-day']
            });
        }
        current.setDate(current.getDate() + 1);
    }

    return events;
}

// ============================================================
// Data Fetching
// ============================================================

/**
 * Fetches jobs from API or local storage.
 * Automatically falls back to local storage on API errors.
 */
async function fetchEvents(info, successCallback, failureCallback) {
    const processEvents = (rawEvents) => {
        try {
            // Filter out any invalid events
            const validEvents = (rawEvents || []).filter(e => e && (e.start || e.start_time));
            const events = addEmptyDayPlaceholders([...validEvents], info.start, info.end);
            successCallback(events);
        } catch (e) {
            console.error('Error processing events:', e);
            successCallback([]); // Return empty array rather than crashing
        }
    };

    // Local mode fallback
    if (!apiAvailable) {
        console.warn('Using local data (API not connected)');
        try {
            const localJobs = Storage.get(CONFIG.storage.jobsKey) || [];
            processEvents(localJobs);
        } catch (e) {
            console.error('Error reading local storage:', e);
            processEvents([]);
        }
        return;
    }

    // Fetch from API with timeout
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(CONFIG.api.baseUrl, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();

        const mappedEvents = (data || []).map(job => {
            try {
                return mapJobToEvent(job);
            } catch (e) {
                console.warn('Error mapping job:', job?.id, e);
                return null;
            }
        }).filter(Boolean);

        processEvents(mappedEvents);
    } catch (error) {
        console.error('Fetch error:', error);
        // Fallback to local storage on any error
        console.warn('Falling back to local storage due to network error...');
        try {
            const localJobs = Storage.get(CONFIG.storage.jobsKey) || [];
            processEvents(localJobs);
        } catch (e) {
            console.error('Local storage fallback also failed:', e);
            processEvents([]);
        }
    }
}

// ============================================================
// Job CRUD Operations
// ============================================================

/**
 * Creates or updates a job.
 */
window.saveJob = async function () {
    const formData = {
        client: document.getElementById('wizard-client').value.trim(),
        phone: document.getElementById('wizard-phone').value.trim(),
        address: document.getElementById('wizard-address').value.trim(),
        price: document.getElementById('wizard-price').value,
        date: document.getElementById('wizard-date').value,
        notes: document.getElementById('wizard-notes').value.trim(),
        isRecurring: document.getElementById('wizard-recurring').checked,
        frequency: document.getElementById('wizard-frequency').value,
        occurrences: parseInt(document.getElementById('wizard-occurrences').value) || 1
    };

    // Clear previous validation errors
    clearValidationErrors();

    // Validation with visual feedback
    let hasErrors = false;
    const errors = [];

    if (!formData.client) {
        markFieldAsError('wizard-client');
        errors.push('Client name is required');
        hasErrors = true;
    }

    if (!selectedJobType) {
        const jobTypeContainer = document.querySelector('.job-type-selection');
        if (jobTypeContainer) {
            jobTypeContainer.classList.add('has-error');
            jobTypeContainer.closest('.form-group-large')?.classList.add('has-error');
        }
        errors.push('Please select a job type');
        hasErrors = true;
    }

    if (!formData.address) {
        markFieldAsError('wizard-address');
        errors.push('Address is required');
        hasErrors = true;
    }

    if (!formData.price) {
        markFieldAsError('wizard-price');
        errors.push('Price is required');
        hasErrors = true;
    }

    if (!formData.date) {
        markFieldAsError('wizard-date');
        errors.push('Date is required');
        hasErrors = true;
    }

    if (formData.isRecurring && formData.occurrences < 2) {
        markFieldAsError('wizard-occurrences');
        errors.push('Recurring jobs need at least 2 occurrences');
        hasErrors = true;
    }

    if (hasErrors) {
        // Scroll to first error
        const firstError = document.querySelector('.input-error, .job-type-selection.has-error');
        if (firstError) {
            firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
    }

    // Build title
    const typeLabel = selectedJobType === 'mowing' ? 'Mowing' : 'Hedge Trimming';
    let eventTitle = formData.client;
    if (!eventTitle.toLowerCase().includes(typeLabel.toLowerCase())) {
        eventTitle += ` - ${typeLabel}`;
    }

    // Generate job(s)
    const recurringId = formData.isRecurring ? `rec_${Date.now()}` : null;
    const intervalDays = CONFIG.recurrence[formData.frequency] || 7;
    const numJobs = formData.isRecurring ? formData.occurrences : 1;
    const jobsToCreate = [];

    for (let i = 0; i < numJobs; i++) {
        const jobDate = new Date(formData.date);
        jobDate.setDate(jobDate.getDate() + (i * intervalDays));

        const job = {
            title: eventTitle,
            start_time: formatLocalDateTime(jobDate),
            job_type: selectedJobType,
            notes: formData.notes,
            price: formData.price || null,
            address: formData.address,
            client_phone: formData.phone,
            status: isEditMode && i === 0 ? undefined : 'pending',
            recurring_id: recurringId,
            is_recurring: formData.isRecurring,
            recurrence_pattern: formData.isRecurring
                ? JSON.stringify({ frequency: formData.frequency, interval: intervalDays })
                : null,
            occurrence_number: i + 1
        };

        if (job.status === undefined) delete job.status;
        jobsToCreate.push(job);
    }

    // Save
    try {
        if (isEditMode) {
            if (editScope === 'all' && currentRecurringId) {
                // Bulk update all jobs in the series
                const count = await updateAllInSeries(currentRecurringId, jobsToCreate[0]);
                await showModal(`Updated ${count} job(s) in the series!`, 'success');
            } else {
                // Single job update
                await updateJob(currentEventId, jobsToCreate[0]);
                await showModal('Job Updated!', 'success');
            }
        } else {
            await createJobs(jobsToCreate);
            const jobWord = jobsToCreate.length > 1 ? 'Jobs' : 'Job';
            await showModal(`${jobsToCreate.length} ${jobWord} Scheduled!`, 'success');
        }

        // Save address to history for autocomplete
        if (formData.address) {
            saveAddressToHistory(formData.address);
        }

        safeRefetchCalendar();
        closeWizard();
        isEditMode = false;
        editScope = 'single'; // Reset edit scope
    } catch (error) {
        console.error('Save error:', error);
        await showModal('Error saving: ' + (error?.message || 'Unknown error'), 'error');
    }
};

/**
 * Safely refetch calendar events without crashing.
 */
function safeRefetchCalendar() {
    try {
        if (calendar && typeof calendar.refetchEvents === 'function') {
            calendar.refetchEvents();
        }
    } catch (e) {
        console.error('Error refetching calendar:', e);
    }
}

/**
 * Creates new jobs in database or local storage.
 * Google Calendar sync is now handled server-side.
 */
async function createJobs(jobs) {
    if (apiAvailable) {
        const response = await fetch(CONFIG.api.baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(jobs)
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create jobs');
        }
        // Google Calendar sync is now handled automatically by the server
    } else {
        const existing = Storage.get(CONFIG.storage.jobsKey) || [];
        jobs.forEach((job, idx) => {
            job.id = `${Date.now()}_${idx}`;
            existing.push({
                id: job.id,
                title: job.title,
                start: job.start_time,
                type: job.job_type,
                notes: job.notes,
                phone: job.client_phone,
                status: job.status,
                price: job.price,
                address: job.address,
                recurring_id: job.recurring_id,
                is_recurring: job.is_recurring,
                classNames: getEventClasses(job.job_type, job.status, job.is_recurring)
            });
        });
        Storage.set(CONFIG.storage.jobsKey, existing);
    }
}

/**
 * Updates an existing job.
 */
async function updateJob(jobId, jobData) {
    if (apiAvailable) {
        const response = await fetch(`${CONFIG.api.baseUrl}/${jobId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(jobData)
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update job');
        }
    } else {
        const existing = Storage.get(CONFIG.storage.jobsKey) || [];
        const index = existing.findIndex(j => j.id === jobId);
        if (index > -1) {
            existing[index] = {
                ...existing[index],
                title: jobData.title,
                start: jobData.start_time,
                type: jobData.job_type,
                notes: jobData.notes,
                phone: jobData.client_phone,
                address: jobData.address,
                price: jobData.price
            };
            Storage.set(CONFIG.storage.jobsKey, existing);
        }
    }
}

/**
 * Updates all jobs in a recurring series with shared data.
 * Preserves each job's individual start_time, status, and occurrence_number.
 */
async function updateAllInSeries(recurringId, jobData) {
    // Fields to update across all jobs in the series
    const sharedData = {
        title: jobData.title,
        job_type: jobData.job_type,
        notes: jobData.notes,
        price: jobData.price,
        address: jobData.address,
        client_phone: jobData.client_phone
    };

    if (apiAvailable) {
        const response = await fetch(`${CONFIG.api.baseUrl}/series/${recurringId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sharedData)
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update series');
        }
        const result = await response.json();
        return result.updated || 0;
    } else {
        // Local storage update
        const existing = Storage.get(CONFIG.storage.jobsKey) || [];
        let count = 0;

        existing.forEach(job => {
            if (job.recurring_id === recurringId) {
                job.title = sharedData.title;
                job.type = sharedData.job_type;
                job.notes = sharedData.notes;
                job.price = sharedData.price;
                job.address = sharedData.address;
                job.phone = sharedData.client_phone;
                count++;
            }
        });

        Storage.set(CONFIG.storage.jobsKey, existing);
        return count;
    }
}

/**
 * Marks a job as complete.
 */
window.markJobAsDone = async function () {
    if (!currentEventId) return;
    const confirmed = await showConfirm('Mark this job as DONE?');
    if (!confirmed) return;

    try {
        if (apiAvailable) {
            const response = await fetch(`${CONFIG.api.baseUrl}/done/${currentEventId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' }
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to mark job done');
            }
        } else {
            const existing = Storage.get(CONFIG.storage.jobsKey) || [];
            const index = existing.findIndex(j => j.id === currentEventId);
            if (index > -1) {
                existing[index].status = 'done';
                existing[index].classNames = getEventClasses(existing[index].type, 'done', existing[index].is_recurring);
                Storage.set(CONFIG.storage.jobsKey, existing);
            }
        }

        safeRefetchCalendar();
        closeJobDetails();
    } catch (error) {
        console.error('Mark done error:', error);
        await showModal('Error updating: ' + (error?.message || 'Unknown error'), 'error');
    }
};

// ============================================================
// Job Cancellation
// ============================================================

// Store cancellation context
let pendingCancelRecurringId = null;
let pendingCancelDate = null;
let pendingCancelIsRecurring = false;

window.cancelJob = async function () {
    if (!currentEventId) return;

    let event = null;
    try {
        event = calendar?.getEventById(currentEventId);
    } catch (e) {
        console.warn('Could not get event by ID:', e);
    }

    const isRecurring = event?.extendedProps?.is_recurring;
    const recurringId = event?.extendedProps?.recurring_id;
    const currentDate = event?.start ? new Date(event.start) : new Date();

    // Store context for when user selects an option
    pendingCancelRecurringId = recurringId;
    pendingCancelDate = currentDate;
    pendingCancelIsRecurring = isRecurring && recurringId;

    // Show/hide appropriate buttons based on whether it's recurring
    const singleBtn = document.getElementById('btn-cancel-single');
    const futureBtn = document.getElementById('btn-cancel-future');
    const allBtn = document.getElementById('btn-cancel-all');
    const prompt = document.getElementById('cancel-scope-prompt');

    if (pendingCancelIsRecurring) {
        // Recurring job - show all options
        if (singleBtn) singleBtn.classList.remove('hidden');
        if (futureBtn) futureBtn.classList.remove('hidden');
        if (allBtn) allBtn.classList.remove('hidden');
        if (prompt) prompt.textContent = 'This job is part of a recurring series. What would you like to cancel?';
    } else {
        // Non-recurring - only show single cancel option
        if (singleBtn) singleBtn.classList.remove('hidden');
        if (futureBtn) futureBtn.classList.add('hidden');
        if (allBtn) allBtn.classList.add('hidden');
        if (prompt) prompt.textContent = 'Cancel this job? It will remain on the calendar but marked as cancelled.';
    }

    // Close job details and show cancel modal
    closeJobDetails();
    document.getElementById('cancel-scope-modal')?.classList.remove('hidden');
};

/**
 * Close the cancel modal without doing anything.
 */
window.closeCancelModal = function () {
    document.getElementById('cancel-scope-modal')?.classList.add('hidden');
    pendingCancelRecurringId = null;
    pendingCancelDate = null;
    pendingCancelIsRecurring = false;
};

/**
 * Handle user's cancel scope selection.
 */
window.confirmCancelScope = async function (scope) {
    document.getElementById('cancel-scope-modal')?.classList.add('hidden');

    try {
        if (scope === 'single') {
            await deleteSingleJob(currentEventId);
            await showModal('Job deleted!', 'success');
        } else if (scope === 'future' && pendingCancelRecurringId) {
            const count = await deleteFutureJobs(pendingCancelRecurringId, pendingCancelDate);
            await showModal(`Deleted ${count} job(s)!`, 'success');
        } else if (scope === 'all' && pendingCancelRecurringId) {
            const count = await deleteEntireSeries(pendingCancelRecurringId);
            await showModal(`Deleted all ${count} job(s) in series!`, 'success');
        }

        safeRefetchCalendar();
    } catch (error) {
        console.error('Delete error:', error);
        await showModal('Error deleting: ' + (error?.message || 'Unknown error'), 'error');
    }

    // Reset state
    pendingCancelRecurringId = null;
    pendingCancelDate = null;
    pendingCancelIsRecurring = false;
};

async function deleteSingleJob(jobId) {
    if (apiAvailable) {
        const response = await fetch(`${CONFIG.api.baseUrl}/delete/${jobId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete job');
        }
    } else {
        const existing = Storage.get(CONFIG.storage.jobsKey) || [];
        const filtered = existing.filter(j => j.id !== jobId);
        Storage.set(CONFIG.storage.jobsKey, filtered);
    }
}

async function deleteFutureJobs(recurringId, fromDate) {
    if (apiAvailable) {
        const response = await fetch(
            `${CONFIG.api.baseUrl}/delete-future/${recurringId}/${encodeURIComponent(fromDate.toISOString())}`,
            {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            }
        );
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete future jobs');
        }
        const result = await response.json();
        return result.deleted || 0;
    } else {
        const existing = Storage.get(CONFIG.storage.jobsKey) || [];
        const filtered = existing.filter(job =>
            !(job.recurring_id === recurringId && new Date(job.start) >= fromDate)
        );
        const count = existing.length - filtered.length;
        Storage.set(CONFIG.storage.jobsKey, filtered);
        return count;
    }
}

async function deleteEntireSeries(recurringId) {
    if (apiAvailable) {
        const response = await fetch(`${CONFIG.api.baseUrl}/delete-series/${recurringId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete series');
        }
        const result = await response.json();
        return result.deleted || 0;
    } else {
        const existing = Storage.get(CONFIG.storage.jobsKey) || [];
        const filtered = existing.filter(job => job.recurring_id !== recurringId);
        const count = existing.length - filtered.length;
        Storage.set(CONFIG.storage.jobsKey, filtered);
        return count;
    }
}

// ============================================================
// Address Autocomplete
// ============================================================

let autocompleteHighlightIndex = -1;

/**
 * Saves an address to the history for autocomplete.
 */
function saveAddressToHistory(address) {
    if (!address || address.trim().length < 3) return;

    const normalizedAddress = address.trim();
    let addresses = Storage.get(CONFIG.storage.addressesKey) || [];

    // Check if address already exists (case-insensitive)
    const existingIndex = addresses.findIndex(
        a => a.toLowerCase() === normalizedAddress.toLowerCase()
    );

    if (existingIndex > -1) {
        // Move to top (most recently used)
        addresses.splice(existingIndex, 1);
    }

    // Add to beginning
    addresses.unshift(normalizedAddress);

    // Keep only the last 50 addresses
    if (addresses.length > 50) {
        addresses = addresses.slice(0, 50);
    }

    Storage.set(CONFIG.storage.addressesKey, addresses);
}

/**
 * Gets address suggestions based on input.
 */
function getAddressSuggestions(query) {
    if (!query || query.length < 2) return [];

    const addresses = Storage.get(CONFIG.storage.addressesKey) || [];
    const queryLower = query.toLowerCase();

    return addresses
        .filter(addr => addr.toLowerCase().includes(queryLower))
        .slice(0, 8); // Max 8 suggestions
}

/**
 * Shows the autocomplete dropdown with suggestions.
 */
function showAddressAutocomplete(suggestions, query) {
    const dropdown = document.getElementById('address-autocomplete');
    if (!dropdown) return;

    if (suggestions.length === 0) {
        dropdown.classList.add('hidden');
        return;
    }

    const queryLower = query.toLowerCase();
    dropdown.innerHTML = suggestions.map((addr, index) => {
        // Highlight matching part
        const matchIndex = addr.toLowerCase().indexOf(queryLower);
        let displayText = addr;
        if (matchIndex > -1) {
            const before = addr.substring(0, matchIndex);
            const match = addr.substring(matchIndex, matchIndex + query.length);
            const after = addr.substring(matchIndex + query.length);
            displayText = `${before}<span class="match-highlight">${match}</span>${after}`;
        }
        return `<div class="autocomplete-item" data-index="${index}" data-address="${escapeHtml(addr)}">${displayText}</div>`;
    }).join('');

    dropdown.classList.remove('hidden');
    autocompleteHighlightIndex = -1;

    // Add click handlers
    dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', () => {
            selectAutocompleteAddress(item.dataset.address);
        });
    });
}

/**
 * Hides the autocomplete dropdown.
 */
function hideAddressAutocomplete() {
    const dropdown = document.getElementById('address-autocomplete');
    if (dropdown) {
        dropdown.classList.add('hidden');
        autocompleteHighlightIndex = -1;
    }
}

/**
 * Selects an address from autocomplete.
 */
function selectAutocompleteAddress(address) {
    const input = document.getElementById('wizard-address');
    if (input) {
        input.value = address;
        clearFieldError('wizard-address');
    }
    hideAddressAutocomplete();
}

/**
 * Handles keyboard navigation in autocomplete.
 */
function handleAutocompleteKeydown(e) {
    const dropdown = document.getElementById('address-autocomplete');
    if (!dropdown || dropdown.classList.contains('hidden')) return;

    const items = dropdown.querySelectorAll('.autocomplete-item');
    if (items.length === 0) return;

    switch (e.key) {
        case 'ArrowDown':
            e.preventDefault();
            autocompleteHighlightIndex = Math.min(autocompleteHighlightIndex + 1, items.length - 1);
            updateAutocompleteHighlight(items);
            break;
        case 'ArrowUp':
            e.preventDefault();
            autocompleteHighlightIndex = Math.max(autocompleteHighlightIndex - 1, -1);
            updateAutocompleteHighlight(items);
            break;
        case 'Enter':
            if (autocompleteHighlightIndex >= 0 && items[autocompleteHighlightIndex]) {
                e.preventDefault();
                selectAutocompleteAddress(items[autocompleteHighlightIndex].dataset.address);
            }
            break;
        case 'Escape':
            hideAddressAutocomplete();
            break;
    }
}

/**
 * Updates the visual highlight on autocomplete items.
 */
function updateAutocompleteHighlight(items) {
    items.forEach((item, index) => {
        if (index === autocompleteHighlightIndex) {
            item.classList.add('highlighted');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('highlighted');
        }
    });
}

/**
 * Escapes HTML to prevent XSS.
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Initializes the address autocomplete functionality.
 */
function initAddressAutocomplete() {
    const addressInput = document.getElementById('wizard-address');
    if (!addressInput) return;

    // Show suggestions on input
    addressInput.addEventListener('input', (e) => {
        const query = e.target.value;
        const suggestions = getAddressSuggestions(query);
        showAddressAutocomplete(suggestions, query);
    });

    // Handle keyboard navigation
    addressInput.addEventListener('keydown', handleAutocompleteKeydown);

    // Show suggestions on focus if there's already text
    addressInput.addEventListener('focus', (e) => {
        const query = e.target.value;
        if (query.length >= 2) {
            const suggestions = getAddressSuggestions(query);
            showAddressAutocomplete(suggestions, query);
        }
    });

    // Hide on blur (with delay to allow clicks)
    addressInput.addEventListener('blur', () => {
        setTimeout(hideAddressAutocomplete, 200);
    });
}

// ============================================================
// Form Validation Helpers
// ============================================================

/**
 * Clears all validation error states from form fields.
 */
function clearValidationErrors() {
    // Clear input errors
    document.querySelectorAll('.input-error').forEach(el => {
        el.classList.remove('input-error');
    });

    // Clear form group errors
    document.querySelectorAll('.form-group-large.has-error').forEach(el => {
        el.classList.remove('has-error');
    });

    // Clear job type selection errors
    const jobTypeSelection = document.querySelector('.job-type-selection');
    if (jobTypeSelection) {
        jobTypeSelection.classList.remove('has-error');
    }

    // Remove any validation messages
    document.querySelectorAll('.validation-message').forEach(el => el.remove());
}

/**
 * Marks a specific field as having an error.
 */
function markFieldAsError(fieldId) {
    const field = document.getElementById(fieldId);
    if (field) {
        field.classList.add('input-error');
        // Mark parent form group
        const formGroup = field.closest('.form-group-large');
        if (formGroup) {
            formGroup.classList.add('has-error');
        }
    }
}

/**
 * Clears error state from a specific field.
 */
function clearFieldError(fieldId) {
    const field = document.getElementById(fieldId);
    if (field) {
        field.classList.remove('input-error');
        const formGroup = field.closest('.form-group-large');
        if (formGroup) {
            formGroup.classList.remove('has-error');
        }
    }
}

// ============================================================
// UI Functions
// ============================================================

window.selectJobType = function (type) {
    selectedJobType = type;
    document.querySelectorAll('.btn-big-type').forEach(btn => btn.classList.remove('selected'));
    document.querySelector(`.btn-big-type.${type}`)?.classList.add('selected');

    // Clear job type validation error when user selects a type
    const jobTypeSelection = document.querySelector('.job-type-selection');
    if (jobTypeSelection) {
        jobTypeSelection.classList.remove('has-error');
        jobTypeSelection.closest('.form-group-large')?.classList.remove('has-error');
    }
};

window.toggleRecurringOptions = function () {
    const checkbox = document.getElementById('wizard-recurring');
    const options = document.getElementById('recurring-options');
    if (checkbox && options) {
        options.classList.toggle('hidden', !checkbox.checked);
    }
};

// Store event data temporarily when showing scope modal
let pendingEditEvent = null;

window.editJob = async function () {
    if (!currentEventId) {
        await showModal('No job selected to edit.', 'error');
        return;
    }

    let event = null;
    try {
        event = calendar?.getEventById(currentEventId);
    } catch (e) {
        console.warn('Could not get event for editing:', e);
    }

    if (!event) {
        await showModal('Could not load job details for editing.', 'error');
        return;
    }

    // Check if this is a recurring job and prompt for edit scope
    const isRecurring = event.extendedProps?.is_recurring;
    const recurringId = event.extendedProps?.recurring_id;

    if (isRecurring && recurringId) {
        // Store event for later and show scope selection modal
        pendingEditEvent = event;
        currentRecurringId = recurringId;
        closeJobDetails();
        document.getElementById('edit-scope-modal')?.classList.remove('hidden');
    } else {
        // Non-recurring job: go straight to edit mode
        editScope = 'single';
        currentRecurringId = null;
        openEditWizard(event);
    }
};

/**
 * Called when user selects an edit scope from the modal.
 */
window.selectEditScope = function (scope) {
    editScope = scope;
    document.getElementById('edit-scope-modal')?.classList.add('hidden');

    if (pendingEditEvent) {
        openEditWizard(pendingEditEvent);
        pendingEditEvent = null;
    }
};

/**
 * Opens the wizard in edit mode with the given event data.
 */
async function openEditWizard(event) {
    try {
        isEditMode = true;

        const titleEl = document.getElementById('wizard-title');
        if (titleEl) {
            titleEl.textContent = editScope === 'all' ? 'Edit All Jobs in Series' : 'Edit Job';
        }

        const clientEl = document.getElementById('wizard-client');
        if (clientEl) clientEl.value = (event.title || '').split(' - ')[0];

        const phoneEl = document.getElementById('wizard-phone');
        if (phoneEl) phoneEl.value = event.extendedProps?.phone || '';

        const addressEl = document.getElementById('wizard-address');
        if (addressEl) addressEl.value = event.extendedProps?.address || '';

        const priceEl = document.getElementById('wizard-price');
        if (priceEl) priceEl.value = event.extendedProps?.price || '';

        const dateEl = document.getElementById('wizard-date');
        if (dateEl && event.start) {
            try {
                dateEl.value = formatLocalDateTime(new Date(event.start));
            } catch (e) {
                console.warn('Date parsing error:', e);
                dateEl.value = '';
            }
        }

        // Disable date field when editing all in series (each job keeps its own date)
        // Enable it for single job edits
        if (dateEl) {
            if (editScope === 'all') {
                dateEl.disabled = true;
                dateEl.title = 'Date cannot be changed when editing all jobs in series';
            } else {
                dateEl.disabled = false;
                dateEl.title = '';
            }
        }

        const notesEl = document.getElementById('wizard-notes');
        if (notesEl) notesEl.value = event.extendedProps?.notes || '';

        selectedJobType = event.extendedProps?.type || 'mowing';
        document.querySelectorAll('.btn-big-type').forEach(btn => btn.classList.remove('selected'));
        document.querySelector(`.btn-big-type.${selectedJobType}`)?.classList.add('selected');

        // Hide recurring checkbox for recurring job edits (they already selected scope)
        // Show but disable for non-recurring edits
        const recurringContainer = document.getElementById('recurring-checkbox-container');
        const recurringCheckbox = document.getElementById('wizard-recurring');
        const recurringOptions = document.getElementById('recurring-options');

        if (currentRecurringId) {
            // Editing a recurring job - hide the checkbox entirely
            if (recurringContainer) recurringContainer.classList.add('hidden');
        } else {
            // Editing a non-recurring job - show but disable
            if (recurringContainer) recurringContainer.classList.remove('hidden');
            if (recurringCheckbox) {
                recurringCheckbox.checked = false;
                recurringCheckbox.disabled = true;
            }
        }

        if (recurringOptions) recurringOptions.classList.add('hidden');

        closeJobDetails();

        const wizardOverlay = document.getElementById('wizard-overlay');
        if (wizardOverlay) wizardOverlay.classList.remove('hidden');
    } catch (error) {
        console.error('Error opening edit mode:', error);
        await showModal('Could not open edit form.', 'error');
        isEditMode = false;
    }
}

async function openWizard() {
    if (!apiAvailable && Storage.get(CONFIG.storage.jobsKey) === null) {
        await showModal('Cloud Sync not available. Data saved locally only.', 'info');
    }

    isEditMode = false;
    selectedJobType = '';
    editScope = 'single'; // Reset edit scope

    // Clear any previous validation errors
    clearValidationErrors();

    document.getElementById('wizard-title').textContent = 'New Job';
    document.getElementById('wizard-client').value = '';
    document.getElementById('wizard-phone').value = '';
    document.getElementById('wizard-address').value = '';
    document.getElementById('wizard-price').value = '';

    const dateEl = document.getElementById('wizard-date');
    if (dateEl) {
        dateEl.value = '';
        dateEl.disabled = false; // Re-enable in case it was disabled for bulk edit
        dateEl.title = '';
    }

    document.getElementById('wizard-notes').value = '';

    // Make sure recurring checkbox is visible and enabled for new jobs
    const recurringContainer = document.getElementById('recurring-checkbox-container');
    if (recurringContainer) recurringContainer.classList.remove('hidden');

    document.getElementById('wizard-recurring').checked = false;
    document.getElementById('wizard-recurring').disabled = false;
    document.getElementById('recurring-options').classList.add('hidden');
    document.querySelectorAll('.btn-big-type').forEach(btn => btn.classList.remove('selected'));

    document.getElementById('wizard-overlay').classList.remove('hidden');
}

function closeWizard() {
    document.getElementById('wizard-overlay').classList.add('hidden');
}

function openJobDetails(event) {
    if (!event) {
        console.error('openJobDetails called with null event');
        return;
    }

    currentEventId = event.id;
    currentRecurringId = event.extendedProps?.recurring_id || null;

    // Title & Date (with safe access)
    const titleEl = document.getElementById('view-job-title');
    if (titleEl) titleEl.textContent = event.title || 'Untitled Job';

    let dateStr = 'No date';
    try {
        if (event.start) {
            dateStr = `${event.start.toLocaleDateString()} ${event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
    } catch (e) {
        console.warn('Date formatting error:', e);
    }
    const dateEl = document.getElementById('view-job-date');
    if (dateEl) dateEl.textContent = dateStr;

    // Address
    const addressEl = document.getElementById('view-job-address');
    const address = event.extendedProps?.address || '';
    if (addressEl) {
        addressEl.innerHTML = address
            ? `<a href="https://maps.google.com/?q=${encodeURIComponent(address)}" target="_blank">${address}</a>`
            : '--';
    }

    // Type Badge
    const typeEl = document.getElementById('view-job-type-badge');
    const type = event.extendedProps?.type || 'mowing';
    let typeText = type === 'mowing' ? 'MOWING' : 'HEDGE TRIMMING';
    if (event.extendedProps?.is_recurring) {
        typeText += ' <span class="recurring-badge">🔁 RECURRING</span>';
    }
    if (typeEl) {
        typeEl.innerHTML = typeText;
        typeEl.className = `job-type-badge ${type === 'mowing' ? 'mowing' : 'hedge'}`;
    }

    // Notes & Price
    const notesEl = document.getElementById('view-job-notes');
    if (notesEl) notesEl.textContent = event.extendedProps?.notes || 'No notes.';

    let price = event.extendedProps?.price;
    if (!price && event.title) {
        try {
            const match = event.title.match(/\(\$(\d+(?:\.\d{2})?)\)/);
            price = match ? match[1] : null;
        } catch (e) {
            console.warn('Price extraction error:', e);
        }
    }
    const priceEl = document.getElementById('view-job-price');
    if (priceEl) priceEl.textContent = price ? `$${price}` : '--';

    // Phone & SMS
    const phone = event.extendedProps?.phone || '';
    const phoneRow = document.getElementById('view-job-phone-row');
    const smsActions = document.querySelector('.sms-actions');

    if (phone) {
        if (phoneRow) phoneRow.classList.remove('hidden');
        const phoneEl = document.getElementById('view-job-phone');
        if (phoneEl) phoneEl.innerHTML = `<a href="sms:${phone}">${phone}</a>`;
        if (smsActions) smsActions.classList.remove('hidden');

        // Generate templated messages using job data
        const remindMsg = generateReminderMessage(event);
        const thanksMsg = generateFollowUpMessage();

        const smsRemindBtn = document.getElementById('btn-sms-remind');
        const smsThanksBtn = document.getElementById('btn-sms-thanks');
        if (smsRemindBtn) smsRemindBtn.href = `sms:${phone}?body=${encodeURIComponent(remindMsg)}`;
        if (smsThanksBtn) smsThanksBtn.href = `sms:${phone}?body=${encodeURIComponent(thanksMsg)}`;
    } else {
        if (phoneRow) phoneRow.classList.add('hidden');
        if (smsActions) smsActions.classList.add('hidden');
    }

    // Button States
    const status = event.extendedProps?.status;
    const markDoneBtn = document.getElementById('btn-mark-done');
    const cancelBtn = document.getElementById('btn-cancel-job');
    const editBtn = document.getElementById('btn-edit-job');

    if (markDoneBtn) {
        if (status === 'done') {
            markDoneBtn.textContent = 'COMPLETED ✓';
            markDoneBtn.classList.add('completed-state');
            markDoneBtn.disabled = true;
        } else {
            markDoneBtn.textContent = 'MARK AS DONE';
            markDoneBtn.classList.remove('completed-state');
            markDoneBtn.disabled = false;
        }
    }

    if (status === 'cancelled') {
        if (cancelBtn) {
            cancelBtn.textContent = 'CANCELLED ✕';
            cancelBtn.classList.add('cancelled-state');
            cancelBtn.disabled = true;
        }
        if (editBtn) editBtn.disabled = true;
        if (markDoneBtn) markDoneBtn.disabled = true;
    } else {
        if (cancelBtn) {
            cancelBtn.textContent = 'CANCEL JOB';
            cancelBtn.classList.remove('cancelled-state');
            cancelBtn.disabled = false;
        }
        if (editBtn) editBtn.disabled = false;
    }

    const modalEl = document.getElementById('job-details-modal');
    if (modalEl) modalEl.classList.remove('hidden');
}

function closeJobDetails() {
    document.getElementById('job-details-modal').classList.add('hidden');
}

window.closeJobDetails = closeJobDetails;

// ============================================================
// Calendar Initialization
// ============================================================

function initializeCalendar() {
    const calendarEl = document.getElementById('calendar');

    if (!calendarEl) {
        console.error('Calendar element not found!');
        showCalendarError('Calendar container not found. Please refresh the page.');
        return null;
    }

    if (typeof FullCalendar === 'undefined') {
        console.error('FullCalendar not loaded!');
        showCalendarError('Calendar library failed to load. Please check your internet connection and refresh.');
        return null;
    }

    try {
        return new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,listWeek'
            },
            height: 'auto',
            dayMaxEvents: false, // Show all events, don't collapse with "+more"
            eventOrder: 'start', // Sort by start time (earliest first at top)
            views: {
                listWeek: {
                    listDayFormat: { weekday: 'long', month: 'short', day: 'numeric' },
                    listDaySideFormat: false
                }
            },
            eventContent: renderEventContent,
            events: fetchEvents,
            eventClick: (info) => {
                try {
                    info.jsEvent.preventDefault();
                    if (info.event && !info.event.classNames?.includes('job-empty-day')) {
                        openJobDetails(info.event);
                    }
                } catch (e) {
                    console.error('Event click error:', e);
                }
            },
            datesSet: (info) => {
                // Toggle class on body based on view type
                if (info.view.type === 'listWeek') {
                    document.body.classList.add('view-list');
                } else {
                    document.body.classList.remove('view-list');
                }

                // Check for overflow in day cells and add fade indicator
                setTimeout(() => {
                    document.querySelectorAll('.fc-daygrid-day-events').forEach(el => {
                        if (el.scrollHeight > el.clientHeight) {
                            el.classList.add('has-overflow');
                        } else {
                            el.classList.remove('has-overflow');
                        }
                    });
                }, 100);
            }
            // Note: windowResize handler removed - was causing list view to reset on mobile
        });
    } catch (error) {
        console.error('Calendar initialization error:', error);
        showCalendarError('Failed to initialize calendar. Please refresh the page.');
        return null;
    }
}

/**
 * Shows an error message in the calendar container
 */
function showCalendarError(message) {
    const calendarEl = document.getElementById('calendar');
    if (calendarEl) {
        calendarEl.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 300px; gap: 16px; color: #ef4444; text-align: center; padding: 24px;">
                <span style="font-size: 3rem;">⚠️</span>
                <p style="font-size: 1.1rem; font-weight: 600;">${message}</p>
                <button onclick="location.reload()" style="padding: 12px 24px; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">Refresh Page</button>
            </div>
        `;
    }
}

// ============================================================
// Application Bootstrap
// ============================================================

document.addEventListener('DOMContentLoaded', async function () {
    // Environment check
    if (window.location.protocol === 'file:') {
        console.warn('⚠️ Running via file:// protocol. Some features may be limited.');
    }

    // Initialize API connection
    await initializeAPI();

    // Initialize Calendar
    calendar = initializeCalendar();
    if (calendar) {
        calendar.render();
        console.log('✅ Calendar initialized');
    }

    // Initialize Address Autocomplete
    initAddressAutocomplete();

    // Setup Event Listeners
    const fab = document.getElementById('fab-add-job');
    const wizardOverlay = document.getElementById('wizard-overlay');
    const detailsOverlay = document.getElementById('job-details-modal');

    fab?.addEventListener('click', openWizard);
    document.getElementById('wizard-close')?.addEventListener('click', closeWizard);
    document.getElementById('view-job-close')?.addEventListener('click', closeJobDetails);

    // Setup validation error clearing on input
    const validatedFields = ['wizard-client', 'wizard-address', 'wizard-price', 'wizard-date', 'wizard-occurrences'];
    validatedFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('input', () => clearFieldError(fieldId));
            field.addEventListener('change', () => clearFieldError(fieldId));
        }
    });

    // Close modals on backdrop click
    wizardOverlay?.addEventListener('click', (e) => {
        if (e.target === wizardOverlay) closeWizard();
    });
    detailsOverlay?.addEventListener('click', (e) => {
        if (e.target === detailsOverlay) closeJobDetails();
    });
});

// ============================================================
// Toast Notification System
// ============================================================

/**
 * Displays a toast notification to the user.
 * @param {string} message - The message to display
 * @param {string} type - 'success', 'error', 'warning', or 'info'
 * @param {number} duration - How long to show the toast (ms)
 */
function showToast(message, type = 'info', duration = 3500) {
    // Remove any existing toast
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;

    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-message">${message}</span>
    `;

    document.body.appendChild(toast);

    // Trigger reflow for animation
    toast.offsetHeight;
    toast.classList.add('toast-visible');

    setTimeout(() => {
        toast.classList.remove('toast-visible');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Override window.alert to use toast system
window.originalAlert = window.alert;
window.alert = function (msg) {
    console.log('Alert:', msg);

    // Determine toast type based on message content
    let type = 'info';
    const msgLower = (msg || '').toLowerCase();

    if (msgLower.includes('error') || msgLower.includes('failed') || msgLower.includes('could not')) {
        type = 'error';
    } else if (msgLower.includes('warning') || msgLower.includes('note:')) {
        type = 'warning';
    } else if (msgLower.includes('scheduled') || msgLower.includes('updated') ||
        msgLower.includes('done') || msgLower.includes('cancelled') ||
        msgLower.includes('success') || msgLower.includes('completed')) {
        type = 'success';
    }

    showToast(msg, type);
};
