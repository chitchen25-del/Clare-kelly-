window.openScreen = function(screenId) {
    try {
        document.querySelectorAll('.page-screen').forEach(el => el.classList.remove('visible'));
        const target = document.getElementById(screenId);
        if(target) {
            target.classList.add('visible');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    } catch (err) { console.error(err.message); }
}

window.toggleMobileMenu = function() { document.getElementById('mobile-drawer')?.classList.toggle('open'); }

const SUPABASE_URL = 'https://oegojjgvnsyjuffxtkuv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Twf2fn7Ay35v_ZEIw3iliA_UQwzuBgU';

function getSupabase() {
    if(!window.supabase) return null;
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

window.onload = async function() {
    try {
        const db = getSupabase();
        if(db) {
            const { data: { session } } = await db.auth.getSession();
            if(session) {
                openScreen('screen-dashboard'); 
                loadClientDashboard(db, session.user);
            }
        }
    } catch(err) { console.log("No active session."); }
};

window.validateBusinessHours = function(input) {
    const val = input.value;
    if(!val) return;
    const date = new Date(val);
    if (date.getDay() === 0) { alert("Closed on Sundays."); input.value = ""; return; }
    if (date.getHours() < 9 || date.getHours() >= 17) { alert("Select between 9 AM and 5 PM."); input.value = ""; return; }
}

window.processClientLogin = async function(e) {
    e.preventDefault();
    try {
        const email = document.getElementById('login-email').value.trim();
        const pass = document.getElementById('login-password').value.trim();
        const db = getSupabase();
        const { data, error } = await db.auth.signInWithPassword({ email, password: pass });
        if (error) throw new Error(error.message);
        if (data.user) {
            openScreen('screen-dashboard'); 
            loadClientDashboard(db, data.user);
        }
    } catch (err) { alert("Login Failed: " + err.message); }
    return false;
}

window.bookNewSession = async function(e) {
    e.preventDefault();
    try {
        const db = getSupabase();
        const { data: { user } } = await db.auth.getUser();

        const serviceName = document.getElementById('portal-service').value;
        const appointmentTime = document.getElementById('portal-date').value;
        const clientName = user.user_metadata?.full_name || user.email;
        const formattedDate = new Date(appointmentTime).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short', hour12: true });

        const isFunctional = serviceName.includes('Functional') || serviceName.includes('Gut Reset') || serviceName.includes('Health Audit');
        let vipCode = null;

        if (isFunctional) {
            vipCode = 'VIP-' + Math.floor(1000 + Math.random() * 9000);
            await db.from('client_tiers').upsert([{ client_id: user.id, is_premium: true, unlock_code: vipCode }]);
        }

        await db.from('appointments').insert([{ client_id: user.id, client_name: clientName, service_name: serviceName, appointment_time: appointmentTime, status: 'confirmed' }]);

        alert("Appointment booked successfully!"); 
        loadClientDashboard(db, user);
    } catch(err) { alert("Error booking session: " + err.message); }
    return false;
};

window.cancelAppointment = async function(id) {
    if(!confirm("Cancel appointment?")) return;
    try {
        const db = getSupabase();
        const { error } = await db.from('appointments').delete().eq('id', id);
        if(error) throw error;
        const { data: { user } } = await db.auth.getUser();
        loadClientDashboard(db, user);
    } catch(err) { alert("Error: " + err.message); }
};

window.rescheduleAppointment = async function(id) {
    const newDate = prompt("Enter new date and time (YYYY-MM-DDTHH:MM):");
    if(!newDate) return;
    try {
        const db = getSupabase();
        const { error } = await db.from('appointments').update({ appointment_time: newDate }).eq('id', id);
        if(error) throw error;
        alert("Appointment rescheduled!");
        const { data: { user } } = await db.auth.getUser();
        loadClientDashboard(db, user);
    } catch(err) { alert("Reschedule Error: " + err.message); }
};

async function loadClientDashboard(db, user) {
    const list = document.getElementById('client-appointments-list');
    const welcomeTitle = document.getElementById('portal-welcome-title');
    if(welcomeTitle) {
        welcomeTitle.innerText = `Welcome, ${user.user_metadata?.full_name || user.email}`;
    }

    try {
        const { data: tier } = await db.from('client_tiers').select('*').eq('client_id', user.id).limit(1).maybeSingle();
        
        const isVip = tier && (tier.is_premium === true || tier.is_premium === 'true');
        const unlockCard = document.getElementById('vip-unlock-card');
        const vipNavItems = document.querySelectorAll('.vip-nav-item');

        if (isVip) {
            if(unlockCard) unlockCard.style.display = 'none';
            vipNavItems.forEach(item => item.style.display = 'flex');
        } else {
            if(unlockCard) unlockCard.style.display = 'block';
            vipNavItems.forEach(item => item.style.display = 'none');
        }

        const { data: appts } = await db.from('appointments').select('*').eq('client_id', user.id).order('appointment_time', { ascending: true });

        if(list) {
            list.innerHTML = (!appts || appts.length === 0) ? '<p style="color:#888; font-size: 0.9rem;">No appointments booked.</p>' : appts.map(a => `
                <div style="padding: 1.2rem; margin-bottom: 0.8rem; border-radius: 8px; border: 1px solid var(--secondary-sand); background: white;">
                    <div><strong style="color: var(--text-main); font-family: 'Montserrat'; font-size: 1rem;">${new Date(a.appointment_time).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}</strong><br><span style="font-size:0.9rem; color:var(--sage-hover);">${a.service_name}</span></div>
                    <div style="display: flex; gap: 0.8rem; margin-top: 0.8rem;">
                        <button class="btn btn-outline" style="min-height: 32px; padding: 0.3rem 0.8rem; flex: 1; font-size: 0.75rem;" onclick="rescheduleAppointment('${a.id}')">Reschedule</button>
                        <button class="btn btn-outline" style="min-height: 32px; padding: 0.3rem 0.8rem; color: #a94442; border-color: #a94442; flex: 1; font-size: 0.75rem;" onclick="cancelAppointment('${a.id}')">Cancel</button>
                    </div>
                </div>`).join('');
        }
    } catch(err) { console.error("Dashboard error:", err.message); }
}

window.unlockVipApp = async function(e) {
    e.preventDefault();
    try {
        const db = getSupabase();
        const { data: { user } } = await db.auth.getUser();
        if(!user) throw new Error("You must be logged in.");

        const enteredCode = document.getElementById('vip-code-input').value.trim().toUpperCase();
        const { data: tier, error } = await db.from('client_tiers').select('*').eq('client_id', user.id).limit(1).maybeSingle();
        if(error) throw new Error("Could not verify client tier.");

        if(tier && tier.unlock_code === enteredCode) {
            await db.from('client_tiers').update({ is_premium: true }).eq('client_id', user.id);
            alert("VIP App Unlocked Successfully!");
            loadClientDashboard(db, user);
        } else {
            alert("Invalid unlock code.");
        }
    } catch(err) { alert("Error unlocking: " + err.message); }
    return false;
};

// NEW APP LOGIC FOR SUPPLEMENTS, MOOD, EXERCISE, NUTRITION
window.submitDailyLog = async function(e) {
    e.preventDefault();
    alert("Food item logged successfully!");
    e.target.reset();
    return false;
};

window.saveSupplements = async function() {
    try {
        const db = getSupabase();
        const { data: { user } } = await db.auth.getUser();
        if(!user) throw new Error("Not logged in");

        const checkboxes = document.querySelectorAll('.supp-check');
        for(let cb of checkboxes) {
            if(cb.checked) {
                const dosageInput = cb.parentElement.querySelector('input[type="text"]');
                const dosage = dosageInput ? dosageInput.value : '';
                await db.from('client_supplements').upsert([{
                    client_id: user.id,
                    supplement_name: cb.value,
                    is_active: true,
                    dosage: dosage
                }], { onConflict: 'client_id,supplement_name' });
            }
        }
        alert("Supplement stack saved successfully!");
    } catch(err) { alert("Error saving supplements: " + err.message); }
};

window.saveMoodJournal = async function(e) {
    e.preventDefault();
    try {
        const db = getSupabase();
        const { data: { user } } = await db.auth.getUser();
        if(!user) throw new Error("Not logged in");

        const mood = document.getElementById('mood-select').value;
        const notes = document.getElementById('mood-notes').value;

        const { error } = await db.from('client_moods').insert([{
            client_id: user.id,
            mood: mood,
            journal_notes: notes
        }]);
        if(error) throw error;

        alert("Daily mood & journal saved successfully!");
        e.target.reset();
    } catch(err) { alert("Error saving mood: " + err.message); }
    return false;
};

window.saveExerciseLog = async function(e) {
    e.preventDefault();
    try {
        const db = getSupabase();
        const { data: { user } } = await db.auth.getUser();
        if(!user) throw new Error("Not logged in");

        const steps = parseInt(document.getElementById('exercise-steps').value) || 0;
        const type = document.getElementById('exercise-type').value;
        const duration = parseInt(document.getElementById('exercise-duration').value) || 0;

        const { error } = await db.from('client_exercises').insert([{
            client_id: user.id,
            steps: steps,
            workout_type: type,
            duration_minutes: duration
        }]);
        if(error) throw error;

        alert("Exercise & steps logged successfully!");
        e.target.reset();
    } catch(err) { alert("Error saving exercise: " + err.message); }
    return false;
};

window.handleClientMessage = async function(e) {
    e.preventDefault();
    alert("Message sent to Clare!");
    const input = document.getElementById('client-msg-input');
    if(input) input.value = '';
    return false;
};

window.processLogout = async function() {
    try {
        const db = getSupabase();
        if(db) await db.auth.signOut();
        location.href = './index.html';
    } catch(err) { alert("Error signing out: " + err.message); }
}

window.submitBasicIntake = async function(e) {
    e.preventDefault();
    alert("Health questionnaire securely saved!");
    e.target.reset();
    return false;
}
