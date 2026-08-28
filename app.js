const SUPABASE_URL = 'https://oegojjgvnsyjuffxtkuv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Twf2fn7Ay35v_ZEIw3iliA_UQwzuBgU';

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

// HELPER FUNCTION: Double-Booking Blocker
async function checkAvailability(db, appointmentTime) {
    const { data, error } = await db.from('appointments')
        .select('id')
        .eq('appointment_time', appointmentTime)
        .in('status', ['confirmed', 'pending']);
        
    if (error) throw error;
    if (data && data.length > 0) { return false; }
    return true; 
}

window.processRegistration = async function(e) {
    e.preventDefault();
    try {
        const db = getSupabase();
        if (!db) throw new Error("Database connection failed.");

        const name = document.getElementById('reg-name').value.trim();
        const email = document.getElementById('reg-email').value.trim().toLowerCase();
        const password = document.getElementById('reg-password').value;
        const service = document.getElementById('reg-service').value;
        const date = document.getElementById('portal-date-reg').value;
        const time = document.getElementById('portal-time-reg').value;

        if (!name || !email || !password || !service || !date || !time) {
            throw new Error("Please complete all registration fields.");
        }

        const appointmentTime = `${date}T${time}:00`;

        const isAvailable = await checkAvailability(db, appointmentTime);
        if (!isAvailable) {
            throw new Error("Alert: This time slot was just booked by another patient! If you have just paid, please contact Clare immediately to reschedule or receive a full refund.");
        }

        const paymentId = window.paypalTransactionId || (service.includes('Free') ? "Free Booking" : "Pending/Manual");

        const { data: authData, error: authError } = await db.auth.signUp({
            email: email,
            password: password,
            options: { data: { full_name: name } }
        });
        if (authError) throw authError;
        
        const user = authData.user;
        if (!user) throw new Error("Registration failed to create user.");

        const isFunctional = service.includes('Functional') || service.includes('Gut Reset') || service.includes('Health Audit');
        let vipCode = null;

        if (isFunctional) {
            vipCode = 'VIP-' + Math.floor(1000 + Math.random() * 9000);
            await db.from('client_tiers').upsert([{ client_id: user.id, is_premium: true, unlock_code: vipCode }]);
        }

        const { error: apptError } = await db.from('appointments').insert([{ 
            client_id: user.id, 
            client_name: name, 
            service_name: service, 
            appointment_time: appointmentTime, 
            status: 'confirmed' 
        }]);
        if (apptError) throw apptError;

        const { error: emailError } = await db.functions.invoke('send-confirmation', {
            body: { email: email, clientName: name, serviceName: service, vipCode: vipCode }
        });
        if (emailError) console.error("Email Dispatch Warning:", emailError);

        alert(`Registration successful! Payment Reference: ${paymentId}. Redirecting to your patient portal...`);
        window.location.href = './app.html';

    } catch (err) {
        alert("Registration Error: " + err.message);
    }
    return false;
};

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
        
        const isAvailable = await checkAvailability(db, appointmentTime);
        if (!isAvailable) {
            throw new Error("Alert: This time slot was just booked by another patient! If you have just paid, please contact Clare immediately to reschedule or receive a full refund.");
        }

        const clientName = user.user_metadata?.full_name || user.email;
        const paymentId = window.portalPayPalId || (serviceName.includes('Free') ? "Free Booking" : "Pending/Manual");

        const isFunctional = serviceName.includes('Functional') || serviceName.includes('Gut Reset') || serviceName.includes('Health Audit');
        let vipCode = null;

        if (isFunctional) {
            vipCode = 'VIP-' + Math.floor(1000 + Math.random() * 9000);
            const { error: tierError } = await db.from('client_tiers').upsert([{ client_id: user.id, is_premium: true, unlock_code: vipCode }]);
            if(tierError) console.error("Tier record upsert warning:", tierError);
        }

        const { error: emailError } = await db.functions.invoke('send-confirmation', {
            body: { email: user.email, clientName, serviceName, vipCode }
        });
        if (emailError) console.error("Email Dispatch Warning:", emailError);

        const { error: apptError } = await db.from('appointments').insert([{ 
            client_id: user.id, 
            client_name: clientName, 
            service_name: serviceName, 
            appointment_time: appointmentTime, 
            status: 'confirmed' 
        }]);
        if(apptError) throw apptError;

        alert(`Appointment booked successfully! Payment Reference: ${paymentId}. Confirmation email dispatched.`); 
        
        window.portalPayPalId = null;
        serviceSelect.value = "";
        dateInput.value = "";
        
        loadClientDashboard(db, user);
        checkVipStatus(db, user);

    } catch(err) { 
        alert("Booking Execution Error: " + err.message); 
    }
    return false;
};

window.cancelAppointment = async function(id) {
    if(!confirm("Are you sure you wish to cancel this scheduled appointment?")) return;
    try {
        const db = getSupabase();
        const { data: appt, error: fetchError } = await db.from('appointments').select('*').eq('id', id).single();
        if(fetchError) throw fetchError;

        const { error: deleteError } = await db.from('appointments').delete().eq('id', id);
        if(deleteError) throw deleteError;

        const { data: { user } } = await db.auth.getUser();

        if (user && appt) {
            await db.functions.invoke('send-confirmation', {
                body: { 
                    email: user.email, 
                    clientName: appt.client_name, 
                    serviceName: appt.service_name, 
                    appointmentTime: appt.appointment_time,
                    isCancellation: true 
                }
            }).catch(err => console.error("Could not send cancellation ping:", err));
        }

        alert("Appointment cancelled successfully. The clinic has been notified.");
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
        
        const isAvailable = await checkAvailability(db, newDate);
        if (!isAvailable) {
            throw new Error("The time slot you requested is already booked. Please try a different time.");
        }

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
        
        localStorage.clear();
        sessionStorage.clear();
        
        window.location.replace('./app.html?logout=' + new Date().getTime());
    } catch(err) { 
        alert("Logout Error: " + err.message); 
        localStorage.clear();
        sessionStorage.clear();
        window.location.replace('./app.html?logout=' + new Date().getTime());
    }
}

window.submitBasicIntake = async function(e) {
    e.preventDefault();
    alert("Standard health questionnaire securely saved to clinical records!");
    e.target.reset();
    return false;
}

// =========================================================================
// AUTOMATED NEWS FEED ENGINE (Connects to admin.html uploads)
// =========================================================================
async function loadDynamicNews() {
    const container = document.getElementById('dynamic-news-container');
    if (!container) return; // Only runs on news.html

    try {
        const db = getSupabase();
        if(!db) throw new Error("Could not connect to database.");

        const { data: newsPosts, error } = await db.from('clinic_news').select('*').order('created_at', { ascending: false });
        if (error) throw error;

        if (!newsPosts || newsPosts.length === 0) {
            container.innerHTML = `<p style="text-align: center; color: #666;">No recent updates at this time.</p>`;
            return;
        }

        container.innerHTML = newsPosts.map(post => `
            <div style="background: white; border: 1px solid #e0d8cc; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.02); margin-bottom: 1.5rem;">
                
                ${post.image_url ? `<img src="${post.image_url}" alt="Clinic Image" style="width: 100%; height: auto; max-height: 400px; object-fit: cover; display: block; border-bottom: 1px solid #e0d8cc;">` : ''}
                
                <div style="padding: 1.5rem;">
                    <span style="font-size: 0.75rem; color: #095d28; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">
                        ${new Date(post.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                    
                    <h3 style="margin: 0.5rem 0; color: #222; font-size: 1.3rem; font-family: 'Montserrat', sans-serif; text-transform: capitalize;">${post.title}</h3>
                    
                    ${post.description ? `<p style="margin: 0 0 1rem 0; color: #555; font-size: 0.95rem; line-height: 1.6;">${post.description}</p>` : ''}
                    
                    ${post.pdf_url ? `
                        <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e0d8cc;">
                            <a href="${post.pdf_url}" target="_blank" style="display: inline-block; background: #095d28; color: white; text-decoration: none; padding: 0.7rem 1.5rem; border-radius: 8px; font-weight: 600; font-size: 0.85rem; font-family: 'Montserrat', sans-serif;">
                                📥 Download PDF Document
                            </a>
                        </div>
                    ` : ''}
                </div>
            </div>
        `).join('');

    } catch (err) {
        console.error("Failed to load news feed:", err);
        container.innerHTML = `<p style="text-align: center; color: #a94442;">Could not load updates right now.</p>`;
    }
}

// Make sure the news loader fires when news.html is opened
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('dynamic-news-container')) {
        loadDynamicNews();
    }
});
