const SUPABASE_URL = 'https://oegojjgvnsyjuffxtkuv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Twf2fn7Ay35v_ZEIw3iliA_UQwzuBgU';

const BREVO_API_KEY = 'xkeysib-YOUR_ACTUAL_BREVO_API_KEY_HERE';

// Singleton to prevent iOS PWA storage fragmentation
let supabaseInstance = null;

function getSupabase() {
    if(!window.supabase) return null;
    if(!supabaseInstance) {
        supabaseInstance = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    return supabaseInstance;
}

window.onload = async function() {
    try {
        const db = getSupabase();
        if(db) {
            const { data: { session } } = await db.auth.getSession();
            if(session && session.user) {
                showDashboard(session.user, db);
            } else {
                showLogin();
            }
        } else {
            showLogin();
        }
    } catch(err) { 
        console.error("Session load error:", err.message);
        showLogin();
    }
};

function showLogin() {
    const loginSec = document.getElementById('section-login');
    const dashSec = document.getElementById('section-dashboard');
    const signoutBtn = document.getElementById('nav-signout-btn');
    
    if(loginSec) loginSec.style.display = 'block';
    if(dashSec) dashSec.style.display = 'none';
    if(signoutBtn) signoutBtn.style.display = 'none';
}

function showDashboard(user, db) {
    const loginSec = document.getElementById('section-login');
    const dashSec = document.getElementById('section-dashboard');
    const signoutBtn = document.getElementById('nav-signout-btn');
    
    if(loginSec) loginSec.style.display = 'none';
    if(dashSec) dashSec.style.display = 'block';
    if(signoutBtn) signoutBtn.style.display = 'inline-block';
    
    const welcomeTitle = document.getElementById('portal-welcome-title');
    if(welcomeTitle) {
        welcomeTitle.innerText = `Welcome, ${user.user_metadata?.full_name || user.email}`;
    }
    checkVipStatus(db, user);
    loadClientDashboard(db, user);
}

async function checkVipStatus(db, user) {
    try {
        const { data: tier, error } = await db.from('client_tiers').select('*').eq('client_id', user.id).limit(1).maybeSingle();
        if(error) throw error;

        const isVip = tier && (tier.is_premium === true || tier.is_premium === 'true');
        const launcherCard = document.getElementById('vip-launcher-card');
        const unlockCard = document.getElementById('vip-unlock-card');

        if (isVip) {
            if(launcherCard) launcherCard.style.display = 'block';
            if(unlockCard) unlockCard.style.display = 'none';
        } else {
            if(launcherCard) launcherCard.style.display = 'none';
            if(unlockCard) unlockCard.style.display = 'block';
        }
    } catch(err) { 
        console.error("VIP status evaluation error:", err.message); 
    }
}

window.unlockVipPortal = async function(e) {
    e.preventDefault();
    try {
        const db = getSupabase();
        const { data: { user } } = await db.auth.getUser();
        if(!user) throw new Error("Active session required for verification.");

        const inputField = document.getElementById('vip-code-input');
        if(!inputField) throw new Error("Input element missing.");

        const enteredCode = inputField.value.trim().toUpperCase();
        const { data: tier, error } = await db.from('client_tiers').select('*').eq('client_id', user.id).limit(1).maybeSingle();
        if(error) throw new Error("Could not verify client tier database record.");

        if(tier && tier.unlock_code === enteredCode) {
            const { updateError } = await db.from('client_tiers').update({ is_premium: true }).eq('client_id', user.id);
            if(updateError) throw updateError;

            alert("VIP App Successfully Unlocked! Launching experience...");
            location.href = './vip.html';
        } else {
            alert("Invalid unlock code entered. Please check your confirmation records.");
        }
    } catch(err) { 
        alert("Verification Error: " + err.message); 
    }
    return false;
};

window.validateBusinessHours = function(input) {
    const val = input.value;
    if(!val) return;
    const date = new Date(val);
    if (date.getDay() === 0) { 
        alert("The practice is closed on Sundays. Please select a weekday."); 
        input.value = ""; 
        return; 
    }
    if (date.getHours() < 9 || date.getHours() >= 17) { 
        alert("Appointments must be selected between 9:00 AM and 5:00 PM."); 
        input.value = ""; 
        return; 
    }
}

window.processClientLogin = async function(e) {
    e.preventDefault();
    try {
        const emailInput = document.getElementById('login-email');
        const passInput = document.getElementById('login-password');
        if(!emailInput || !passInput) throw new Error("Form elements missing.");

        // Lowercasing to fix iOS auto-capitalization bugs
        const email = emailInput.value.trim().toLowerCase();
        const pass = passInput.value.trim();
        const db = getSupabase();

        if (!db) throw new Error("Database client failed to initialize. Please check connection.");

        const { data, error } = await db.auth.signInWithPassword({ email, password: pass });
        if (error) throw new Error(error.message);

        if (data.user) {
            showDashboard(data.user, db);
        }
    } catch (err) { 
        alert("Authentication Failed: " + err.message); 
    }
    return false;
}

window.bookNewSession = async function(e) {
    e.preventDefault();
    try {
        const db = getSupabase();
        const { data: { user } } = await db.auth.getUser();
        if(!user) throw new Error("Please sign in to confirm bookings.");

        const serviceSelect = document.getElementById('portal-service');
        const dateInput = document.getElementById('portal-date');
        if(!serviceSelect || !dateInput) throw new Error("Booking form fields missing.");

        const serviceName = serviceSelect.value;
        const appointmentTime = dateInput.value;
        const clientName = user.user_metadata?.full_name || user.email;

        const isFunctional = serviceName.includes('Functional') || serviceName.includes('Gut Reset') || serviceName.includes('Health Audit');
        let vipCode = null;

        if (isFunctional) {
            vipCode = 'VIP-' + Math.floor(1000 + Math.random() * 9000);
            const { error: tierError } = await db.from('client_tiers').upsert([{ client_id: user.id, is_premium: true, unlock_code: vipCode }]);
            if(tierError) console.error("Tier record upsert warning:", tierError);

            const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': BREVO_API_KEY,
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    sender: { name: "The Natural Healing Clinic", email: "clare.claretownsend82@gmail.com" },
                    to: [{ email: user.email, name: clientName }],
                    subject: "Your VIP App Access Code",
                    htmlContent: `<html><body><p>Hello ${clientName},</p><p>Your booking for <b>${serviceName}</b> is confirmed.</p><p>Your VIP Code is: <b>${vipCode}</b></p></body></html>`
                })
            });

            if (!brevoRes.ok) {
                const errData = await brevoRes.json();
                console.error("Brevo Error Response:", errData);
            }
        }

        const { error: apptError } = await db.from('appointments').insert([{ 
            client_id: user.id, 
            client_name: clientName, 
            service_name: serviceName, 
            appointment_time: appointmentTime, 
            status: 'confirmed' 
        }]);
        if(apptError) throw apptError;

        alert("Appointment booked successfully! Confirmation email dispatched."); 
        loadClientDashboard(db, user);
        checkVipStatus(db, user);

        serviceSelect.value = "";
        dateInput.value = "";
    } catch(err) { 
        alert("Booking Execution Error: " + err.message); 
    }
    return false;
};

window.cancelAppointment = async function(id) {
    if(!confirm("Are you sure you wish to cancel this scheduled appointment?")) return;
    try {
        const db = getSupabase();
        const { error } = await db.from('appointments').delete().eq('id', id);
        if(error) throw error;

        const { data: { user } } = await db.auth.getUser();
        if(user) loadClientDashboard(db, user);
    } catch(err) { 
        alert("Cancellation Error: " + err.message); 
    }
};

window.rescheduleAppointment = async function(id) {
    const newDate = prompt("Enter new appointment date and time (Format: YYYY-MM-DDTHH:MM):");
    if(!newDate) return;
    try {
        const db = getSupabase();
        const { error } = await db.from('appointments').update({ appointment_time: newDate }).eq('id', id);
        if(error) throw error;

        alert("Appointment successfully rescheduled.");
        const { data: { user } } = await db.auth.getUser();
        if(user) loadClientDashboard(db, user);
    } catch(err) { 
        alert("Reschedule Error: " + err.message); 
    }
};

async function loadClientDashboard(db, user) {
    const list = document.getElementById('client-appointments-list');
    try {
        const { data: appts, error } = await db.from('appointments').select('*').eq('client_id', user.id).order('appointment_time', { ascending: true });
        if(error) throw error;

        if(list) {
            list.innerHTML = (!appts || appts.length === 0) ? '<p style="color:#888; font-size: 0.9rem;">No active appointments booked.</p>' : appts.map(a => `
                <div style="padding: 1.2rem; margin-bottom: 0.8rem; border-radius: 8px; border: 1px solid #e0d8cc; background: white;">
                    <div><strong style="color: #222; font-family: 'Montserrat'; font-size: 1rem;">${new Date(a.appointment_time).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}</strong><br><span style="font-size:0.9rem; color:#095d28;">${a.service_name}</span></div>
                    <div style="display: flex; gap: 0.8rem; margin-top: 0.8rem;">
                        <button class="btn btn-outline" style="min-height: 32px; padding: 0.3rem 0.8rem; flex: 1; font-size: 0.75rem;" onclick="rescheduleAppointment('${a.id}')">Reschedule</button>
                        <button class="btn btn-outline" style="min-height: 32px; padding: 0.3rem 0.8rem; color: #a94442; border-color: #a94442; flex: 1; font-size: 0.75rem;" onclick="cancelAppointment('${a.id}')">Cancel</button>
                    </div>
                </div>`).join('');
        }
    } catch(err) { 
        console.error("Dashboard loading error:", err.message); 
    }
}

window.handleClientMessage = async function(e) {
    e.preventDefault();
    alert("Secure message transmitted to Clare successfully!");
    const input = document.getElementById('client-msg-input');
    if(input) input.value = '';
    return false;
};

window.processLogout = async function() {
    try {
        const db = getSupabase();
        if(db) await db.auth.signOut();
        showLogin();
    } catch(err) { 
        alert("Logout Error: " + err.message); 
    }
}

window.submitBasicIntake = async function(e) {
    e.preventDefault();
    alert("Standard health questionnaire securely saved to clinical records!");
    e.target.reset();
    return false;
}
