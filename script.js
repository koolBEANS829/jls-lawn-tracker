
// --- CONFIGURATION ---
// TODO: Replace these with your actual Supabase keys!
const SUPABASE_URL = 'https://eplsowiliweiilcoomtd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwbHNvd2lsaXdlaWlsY29vbXRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4NDg3MDYsImV4cCI6MjA4MTQyNDcwNn0.eB-idCDGSqcltv2OH8WMvRFQlyx3IYrBqMD4o5oUXSE';

// Initialize Supabase (Check if keys are present)
let supabase;
if (SUPABASE_URL !== 'YOUR_SUPABASE_URL_HERE') {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// --- SECURITY LOGIC ---
const CREW_PIN = '2025'; // Shared PIN

function checkSecurity() {
    const isUnlocked = localStorage.getItem('jls_unlocked');
    const overlay = document.getElementById('login-overlay');

    if (isUnlocked === 'true') {
        overlay.classList.add('hidden');
    } else {
        overlay.classList.remove('hidden');
    }
}

window.checkPin = function () {
    const input = document.getElementById('pin-input');
    if (input.value === CREW_PIN) {
        localStorage.setItem('jls_unlocked', 'true');
        document.getElementById('login-overlay').classList.add('hidden');
    } else {
        alert('INCORRECT PIN');
        input.value = '';
    }
};

document.addEventListener('DOMContentLoaded', function () {
    // Run Security Check first
    checkSecurity();

    // Enable "Enter" key on PIN input
    const pinInput = document.getElementById('pin-input');
    if (pinInput) {
        pinInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') window.checkPin();
        });
    }

    var calendarEl = document.getElementById('calendar');

    var calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,listWeek' },
        height: 'auto',
        events: function (info, successCallback, failureCallback) {
            // Helper to process and merge empty days
            const processEvents = (realEvents) => {
                const events = [...realEvents];

                // Only generate empty days if we are in a List view (or generally, to support list view)
                // We'll generate them for the requested range.
                let current = new Date(info.start);
                const end = new Date(info.end);

                // create a lookup for days that have jobs
                const daysWithJobs = new Set();
                events.forEach(e => {
                    const start = new Date(e.start);
                    daysWithJobs.add(start.toDateString());
                });

                while (current < end) {
                    // Check if this day has a job
                    // Note: This simple check assumes jobs are single-day. 
                    // For multi-day, we'd need more complex overlap logic, but for lawn care, single day is safe assumption.
                    if (!daysWithJobs.has(current.toDateString())) {
                        events.push({
                            title: 'No Jobs',
                            start: new Date(current), // Copy date
                            allDay: true,
                            classNames: ['job-empty-day'] // CSS will hide this in Month view
                        });
                    }
                    current.setDate(current.getDate() + 1);
                }
                successCallback(events);
            };

            if (!supabase) {
                // Fallback for demo/testing without keys
                console.warn('Supabase not configured. Using local dummy data.');
                const localJobs = JSON.parse(localStorage.getItem('jls_local_jobs')) || [];
                processEvents(localJobs);
                return;
            }

            // Fetch from Supabase
            supabase.from('jobs').select('*')
                .then(({ data, error }) => {
                    if (error) {
                        console.error('Error fetching jobs:', error);
                        failureCallback(error);
                    } else {
                        // Map Supabase data to FullCalendar event objects
                        const mappedEvents = data.map(job => ({
                            id: job.id,
                            title: job.title,
                            start: job.start_time, // Assuming 'start_time' column
                            type: job.job_type,    // Assuming 'job_type' column
                            notes: job.notes,
                            status: job.status,
                            price: job.price,      // New dedicated column
                            address: job.address,  // New dedicated column
                            classNames: getEventClassNames(job.job_type, job.status)
                        }));
                        processEvents(mappedEvents);
                    }
                });
        },
        eventClick: function (info) {
            info.jsEvent.preventDefault(); // Prevent URL navigation
            // Don't open details for "Empty Day" placeholders
            if (info.event.classNames.includes('job-empty-day')) return;
            openJobDetails(info.event);
        },
        windowResize: function (view) {
            // Keep the format consistent (DayGrid) regardless of size
            calendar.changeView('dayGridMonth');
        }
    });

    calendar.render();

    // Helper to style events
    function getEventClassNames(type, status) {
        let classes = [];
        if (type === 'mowing') classes.push('job-mowing');
        else if (type === 'hedge') classes.push('job-hedge');

        if (status === 'done') classes.push('job-completed');
        return classes;
    }

    // --- Modal Logic ---

    // Elements
    const fab = document.getElementById('fab-add-job');
    const overlay = document.getElementById('wizard-overlay');
    const closeBtn = document.getElementById('wizard-close');

    const detailsOverlay = document.getElementById('job-details-modal');
    const detailsCloseBtn = document.getElementById('view-job-close');
    const markDoneBtn = document.getElementById('btn-mark-done');

    let currentEventId = null;

    // Selection State
    let selectedType = '';

    window.selectJobType = function (type) {
        selectedType = type;
        document.querySelectorAll('.btn-big-type').forEach(btn => btn.classList.remove('selected'));
        document.querySelector(`.btn-big-type.${type}`).classList.add('selected');
    };

    window.saveJob = async function () {
        const client = document.getElementById('wizard-client').value;
        const phone = document.getElementById('wizard-phone').value;
        const address = document.getElementById('wizard-address').value;
        const priceVal = document.getElementById('wizard-price').value;
        const dateVal = document.getElementById('wizard-date').value;
        const notes = document.getElementById('wizard-notes').value;

        if (!client) { alert('Please enter client name!'); return; }
        if (!selectedType) { alert('Please select a job type!'); return; }
        if (!dateVal) { alert('Please pick a date!'); return; }

        let eventTitle = client;
        // Legacy: We NO LONGER append price to title for new jobs
        // if (priceVal) { eventTitle += ` ($${priceVal})`; }

        let displayType = selectedType === 'mowing' ? 'Mowing' : 'Hedge Trimming';
        if (!eventTitle.toLowerCase().includes(displayType.toLowerCase())) {
            eventTitle += ` - ${displayType}`;
        }

        const newJob = {
            title: eventTitle,
            start_time: dateVal, // DB column: start_time
            job_type: selectedType, // DB column: job_type
            notes: notes,
            price: priceVal || null, // DB column: price
            address: address, // DB column: address
            client_phone: phone, // New field, assuming DB column 'client_phone' or 'phone' exists or ignored if not
            status: 'pending'
        };

        if (supabase) {
            const { data, error } = await supabase.from('jobs').insert([newJob]).select();
            if (error) {
                alert('Error saving to cloud: ' + error.message);
                return;
            }
        } else {
            // Local Fallback
            newJob.id = Date.now().toString(); // Fake ID
            newJob.classNames = getEventClassNames(newJob.job_type, newJob.status);
            // Must map back to FC format (start instead of start_time)
            const localJobFC = {
                id: newJob.id,
                title: newJob.title,
                start: newJob.start_time,
                type: newJob.job_type,
                notes: newJob.notes,
                phone: newJob.client_phone,
                status: newJob.status,
                price: newJob.price,
                address: newJob.address,
                classNames: newJob.classNames
            };

            const existing = JSON.parse(localStorage.getItem('jls_local_jobs')) || [];
            existing.push(localJobFC);
            localStorage.setItem('jls_local_jobs', JSON.stringify(existing));
        }

        calendar.refetchEvents(); // Refresh calendar
        alert('Job Scheduled!');
        closeWizard();
    };

    function openJobDetails(event) {
        currentEventId = event.id;

        document.getElementById('view-job-title').innerText = event.title;

        const dateObj = event.start;
        const dateStr = dateObj ? (dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : 'No date';
        document.getElementById('view-job-date').innerText = dateStr;

        // Address Logic
        const addressEl = document.getElementById('view-job-address');
        const address = event.extendedProps.address;
        if (address) {
            addressEl.innerHTML = `<a href="https://maps.google.com/?q=${encodeURIComponent(address)}" target="_blank">${address}</a>`;
        } else {
            addressEl.innerText = '--';
        }

        const typeEl = document.getElementById('view-job-type-badge');
        const type = event.extendedProps.type;
        typeEl.innerText = type === 'mowing' ? 'MOWING' : 'HEDGE TRIMMING';
        typeEl.className = 'job-type-badge ' + (type === 'mowing' ? 'mowing' : 'hedge');

        const notes = event.extendedProps.notes || 'No notes.';
        document.getElementById('view-job-notes').innerText = notes;

        // Price Logic: Check dedicated column first, then fallback to Title Regex
        const priceEl = document.getElementById('view-job-price');
        let priceVal = event.extendedProps.price;

        if (!priceVal) {
            // BACKWARD COMPATIBILITY: Check title for ($50)
            const priceMatch = event.title.match(/\(\$(\d+(?:\.\d{2})?)\)/);
            priceVal = priceMatch ? priceMatch[1] : null;
        }

        if (priceVal) {
            priceEl.innerText = '$' + priceVal;
        } else {
            priceEl.innerText = '--';
        }

        // Phone & SMS Buttons
        const phone = event.extendedProps.phone || ''; // FullCalendar puts extra props here
        const phoneRow = document.getElementById('view-job-phone-row');
        const phoneEl = document.getElementById('view-job-phone');
        const smsContainer = document.querySelector('.sms-actions');
        const btnRemind = document.getElementById('btn-sms-remind');
        const btnThanks = document.getElementById('btn-sms-thanks');

        if (phone) {
            phoneRow.classList.remove('hidden');
            phoneEl.innerText = phone;
            smsContainer.classList.remove('hidden');

            const firstName = event.title.split(' ')[0]; // Simple name extraction
            // Reminder Text
            const remindMsg = `Hi ${firstName}, this is JLS Lawn Care. Just a reminder that we'll be by tomorrow for your service. Thanks!`;
            btnRemind.href = `sms:${phone}?&body=${encodeURIComponent(remindMsg)}`;

            // Thank You Text
            const thanksMsg = `Hi ${firstName}, your lawn is all done! Thanks for choosing JLS Lawn Care. See you next time!`;
            btnThanks.href = `sms:${phone}?&body=${encodeURIComponent(thanksMsg)}`;

        } else {
            phoneRow.classList.add('hidden');
            smsContainer.classList.add('hidden');
        }

        // Update Button State
        if (event.extendedProps.status === 'done') {
            markDoneBtn.innerText = 'COMPLETED ✓';
            markDoneBtn.classList.add('completed-state');
            markDoneBtn.disabled = true;
        } else {
            markDoneBtn.innerText = 'MARK AS DONE';
            markDoneBtn.classList.remove('completed-state');
            markDoneBtn.disabled = false;
        }

        detailsOverlay.classList.remove('hidden');
    }

    window.markJobAsDone = async function () {
        if (!currentEventId) return;

        if (confirm('Mark this job as DONE?')) {
            if (supabase) {
                const { error } = await supabase.from('jobs')
                    .update({ status: 'done' })
                    .eq('id', currentEventId);

                if (error) {
                    alert('Error updating: ' + error.message);
                    return;
                }
            } else {
                // Local Fallback
                const existing = JSON.parse(localStorage.getItem('jls_local_jobs')) || [];
                const jobIndex = existing.findIndex(j => j.id === currentEventId);
                if (jobIndex > -1) {
                    existing[jobIndex].status = 'done';
                    // Update classNames for next fetch
                    existing[jobIndex].classNames = getEventClassNames(existing[jobIndex].type, 'done');
                    localStorage.setItem('jls_local_jobs', JSON.stringify(existing));
                }
            }

            calendar.refetchEvents();
            window.closeJobDetails();
        }
    };

    function openWizard() {
        if (!supabase && localStorage.getItem('jls_local_jobs') === null) {
            alert('NOTE: Cloud Sync is NOT setup. Data will only be saved on this device (LocalStorage).');
        }
        overlay.classList.remove('hidden');
        document.getElementById('wizard-client').value = '';
        document.getElementById('wizard-client').value = '';
        document.getElementById('wizard-client').value = '';
        document.getElementById('wizard-phone').value = '';
        document.getElementById('wizard-address').value = '';
        document.getElementById('wizard-price').value = '';
        document.getElementById('wizard-date').value = '';
        document.getElementById('wizard-notes').value = '';
        selectedType = '';
        document.querySelectorAll('.btn-big-type').forEach(btn => btn.classList.remove('selected'));
    }

    function closeWizard() {
        overlay.classList.add('hidden');
    }

    window.closeJobDetails = function () {
        detailsOverlay.classList.add('hidden');
    };

    if (fab) fab.addEventListener('click', openWizard);
    if (closeBtn) closeBtn.addEventListener('click', closeWizard);
    if (detailsCloseBtn) detailsCloseBtn.addEventListener('click', window.closeJobDetails);

    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeWizard();
    });
    detailsOverlay.addEventListener('click', function (e) {
        if (e.target === detailsOverlay) window.closeJobDetails();
    });
});
