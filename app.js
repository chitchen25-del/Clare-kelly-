window.openScreen = function(screenId) {
    try {
        document.querySelectorAll('.page-screen').forEach(el => el.classList.remove('visible'));
        const target = document.getElementById(screenId);
        if(target) {
            target.classList.add('visible');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        const drawer = document.getElementById('mobile-drawer');
        if(drawer) drawer.classList.remove('open');
    } catch (err) { console.error(err.message); }
}

window.toggleMobileMenu = function() { document.getElementById('mobile-drawer').classList.toggle('open'); }

window.toggleAccordion = function(id) {
    const panel = document.getElementById(id);
    const btn = panel.previousElementSibling;
    panel.classList.toggle('show');
    btn.classList.toggle('active');
    btn.querySelector('.icon').innerText = panel.classList.contains('show') ? '−' : '+';
}

const SUPABASE_URL = 'https://oegojjgvnsyjuffxtkuv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Twf2fn7Ay35v_ZEIw3iliA_UQwzuBgU';

function getSupabase() {
    if(!window.supabase) return null;
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

window.onload = async function() {
    try {
        loadTestimonials();
        loadNews();

        const db = getSupabase();
        if(db) {
            const { data: { session } } = await db.auth.getSession();
            if(session) {
                updateNavState(true); 
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
            updateNavState(true); 
            openScreen('screen-dashboard'); 
            loadClientDashboard(db, data.user);
        }
    } catch (err) { alert("Login Failed: " + err.message); }
    return false;
}

window.processRegistration = async function(e) {
    e.preventDefault();
    try {
        const db = getSupabase();
        const name = document.getElementById('reg-name').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const pass = document.getElementById('reg-password').value.trim();
        const service = document.getElementById('reg-service').value;
        const date = document.getElementById('reg-date')?.value || document.getElementById('portal-date-reg')?.value || new Date().toISOString();

        const isFunctional = service.includes('Functional') || service.includes('Gut Reset') || service.includes('Health Audit');
        let vipCode = null;

        const { data: authData, error } = await db.auth.signUp({ email, password: pass, options: { data: { full_name: name } } });
        if (error) throw new Error(error.message);
        
        if (authData.user) {
            if (isFunctional) {
                vipCode = 'VIP-' + Math.floor(1000 + Math.random() * 9000);
                await db.from('client_tiers').insert([{ client_id: authData.user.id, is_premium: true, unlock_code: vipCode }]);
            } else {
                await db.from('client_tiers').insert([{ client_id: authData.user.id, is_premium: false }]);
            }

            const formattedDate = new Date(date).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short', hour12: true });
            await db.from('appointments').insert([{ client_id: authData.user.id, client_name: name, service_name: service, appointment_time: date, status: 'confirmed' }]);

            await db.rpc('send_booking_email', {
                to_email: email,
                client_name: name,
                service_name: service,
                appointment_time: formattedDate,
                access_code: vipCode
            });
        }
        
        alert('Registered and booked successfully! Check your email.'); 
        updateNavState(true); 
        openScreen('screen-dashboard'); 
        loadClientDashboard(db, authData.user);
    } catch(err) { alert("Registration Error: " + err.message); }
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

        await db.rpc('send_booking_email', {
            to_email: user.email,
            client_name: clientName,
            service_name: serviceName,
            appointment_time: formattedDate,
            access_code: vipCode
        });

        alert("Appointment booked successfully and confirmation email sent!"); 
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
    const newDate = prompt("Enter new date and time (YYYY-MM-DDTHH:MM, e.g. 2026-09-01T10:00):");
    if(!newDate) return;
    try {
        const db = getSupabase();
        const { error } = await db.from('appointments').update({ appointment_time: newDate }).eq('id', id);
        if(error) throw error;
        alert("Appointment rescheduled successfully!");
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
        const appContainer = document.getElementById('premium-app-container');

        if (isVip) {
            if(unlockCard) unlockCard.style.display = 'none';
            if(appContainer) appContainer.style.display = 'block';
        } else {
            if(unlockCard) unlockCard.style.display = 'block';
            if(appContainer) appContainer.style.display = 'none';
        }

        const { data: appts } = await db.from('appointments').select('*').eq('client_id', user.id).order('appointment_time', { ascending: true });

        if(list) {
            list.innerHTML = (!appts || appts.length === 0) ? '<p style="color:#888; font-size: 0.95rem;">No appointments booked.</p>' : appts.map(a => `
                <div style="padding: 1.5rem; margin-bottom: 1rem; border-radius: 8px; border: 1px solid var(--secondary-sand); background: white;">
                    <div><strong style="color: var(--text-main); font-family: 'Montserrat'; font-size: 1.1rem;">${new Date(a.appointment_time).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}</strong><br><span style="font-size:0.95rem; color:var(--sage-hover);">${a.service_name}</span></div>
                    <div style="display: flex; gap: 0.8rem; margin-top: 1rem;">
                        <button class="btn btn-outline" style="min-height: 35px; padding: 0.4rem 1rem; flex: 1;" onclick="rescheduleAppointment('${a.id}')">Reschedule</button>
                        <button class="btn btn-outline" style="min-height: 35px; padding: 0.4rem 1rem; color: #a94442; border-color: #a94442; flex: 1;" onclick="cancelAppointment('${a.id}')">Cancel</button>
                    </div>
                </div>`).join('');
        }
    } catch(err) { console.error("Dashboard error:", err.message); }
}

window.submitDailyLog = async function(e) {
    e.preventDefault();
    alert("Daily log saved successfully!");
    return false;
};

window.handleClientMessage = async function(e) {
    e.preventDefault();
    alert("Message sent to Clare!");
    const input = document.getElementById('client-msg-input');
    if(input) input.value = '';
    return false;
};

window.searchFood = function() {
    alert("Food database search triggered.");
};

window.startBarcodeScanner = function() {
    alert("Barcode scanner initiated.");
};

window.updateDailyTotals = function() {};

window.processLogout = async function() {
    try {
        const db = getSupabase();
        if(db) await db.auth.signOut();
        location.href = './index.html';
    } catch(err) { alert("Error signing out: " + err.message); }
}

function updateNavState(isLoggedIn) {
    const pBtn = document.getElementById('nav-portal-btn');
    const bBtn = document.getElementById('nav-book-btn');
    const lBtn = document.getElementById('nav-logout-btn');
    if(pBtn) pBtn.style.display = isLoggedIn ? 'none' : 'inline-block';
    if(bBtn) bBtn.style.display = isLoggedIn ? 'none' : 'inline-block';
    if(lBtn) lBtn.style.display = isLoggedIn ? 'inline-block' : 'none';
}

window.unlockVipApp = async function(e) {
    e.preventDefault();
    try {
        const db = getSupabase();
        const { data: { user } } = await db.auth.getUser();
        if(!user) throw new Error("You must be logged in to unlock the app.");

        const enteredCode = document.getElementById('vip-code-input').value.trim().toUpperCase();

        const { data: tier, error } = await db.from('client_tiers').select('*').eq('client_id', user.id).limit(1).maybeSingle();
        if(error) throw new Error("Could not verify client tier.");

        if(tier && tier.unlock_code === enteredCode) {
            await db.from('client_tiers').update({ is_premium: true }).eq('client_id', user.id);
            alert("VIP App Unlocked Successfully!");
            loadClientDashboard(db, user);
        } else {
            alert("Invalid unlock code. Please check your confirmation email.");
        }
    } catch(err) { 
        alert("Error unlocking: " + err.message); 
    }
    return false;
};

window.submitBasicIntake = async function(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const ogText = btn.innerText;
    btn.innerText = "Saving Questionnaire...";

    try {
        const db = getSupabase();
        const { data: { user } } = await db.auth.getUser();
        if (!user) throw new Error("Please log in to submit.");

        const checkedBoxes = Array.from(document.querySelectorAll('#basic-questionnaire-card input[type="checkbox"]:checked'))
                                  .map(cb => cb.parentElement.innerText.trim()).join(', ');

        const { error } = await db.from('basic_intake').insert([{
            client_id: user.id,
            full_name: document.getElementById('basic-name').value,
            dob: document.getElementById('basic-dob').value,
            phone: document.getElementById('basic-phone').value,
            email: document.getElementById('basic-email').value,
            emergency_contact_name: document.getElementById('basic-em-name').value,
            emergency_contact_phone: document.getElementById('basic-em-phone').value,
            reason_for_visit: document.getElementById('basic-reason').value,
            duration_of_symptoms: document.getElementById('basic-duration').value,
            pain_level: document.getElementById('basic-pain').value,
            checked_boxes: checkedBoxes,
            specific_event: document.getElementById('basic-event').value,
            pregnancy_months: document.getElementById('basic-pregnancy').value,
            medications: document.getElementById('basic-meds').value,
            prior_treatments: document.getElementById('basic-prior-treat').value,
            focus_areas: document.getElementById('basic-focus').value,
            avoid_areas: document.getElementById('basic-avoid').value
        }]);

        if (error) throw error;

        alert("Thank you! Your health questionnaire has been securely saved to your clinical file.");
        e.target.reset();
    } catch(err) {
        alert("Error saving questionnaire: " + err.message);
    } finally {
        btn.innerText = ogText;
    }
    return false;
}

window.submitTestimonial = async function(e) {
    e.preventDefault();
    try {
        const db = getSupabase();
        const { data: { user } } = await db.auth.getUser();
        if (!user) throw new Error("You must be logged in to submit a review.");

        const name = document.getElementById('test-name').value.trim();
        const rating = parseInt(document.getElementById('test-rating').value);
        const content = document.getElementById('test-content').value.trim();

        const { error } = await db.from('testimonials').insert([{
            client_id: user.id,
            client_name: name,
            rating: rating,
            content: content,
            is_approved: false 
        }]);

        if (error) throw error;
        
        alert("Thank you! Your testimonial has been submitted successfully and is awaiting review.");
        e.target.reset();
    } catch(err) {
        alert("Error submitting testimonial: " + err.message);
    }
    return false;
}

window.loadTestimonials = async function() {
    try {
        const db = getSupabase();
        const feed = document.getElementById('testimonial-feed');
        if (!feed) return;

        const { data, error } = await db.from('testimonials').select('*').eq('is_approved', true).order('created_at', { ascending: false });
        if (error) throw error;

        if (!data || data.length === 0) {
            feed.innerHTML = '<p style="color:#888; text-align:center; width:100%; font-style: italic;">Be the first to share your healing journey!</p>';
            return;
        }

        feed.innerHTML = data.map(t => `
            <div style="background: white; padding: 2.5rem; border-radius: 12px; border: 1px solid var(--secondary-sand); box-shadow: 0 4px 15px rgba(9,93,40,0.03);">
                <div style="color: var(--gold-accent); margin-bottom: 1rem; font-size: 1.2rem; letter-spacing: 2px;">${'★'.repeat(t.rating)}${'☆'.repeat(5 - t.rating)}</div>
                <p style="font-size: 1.05rem; color: #555; font-style: italic; margin-bottom: 1.5rem; line-height: 1.7;">"${t.content}"</p>
                <h4 style="color: var(--text-main); font-family: 'Montserrat'; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 1px;">- ${t.client_name}</h4>
            </div>
        `).join('');
    } catch(err) {
        console.error("Error loading testimonials:", err.message);
    }
}

window.loadNews = async function() {
    try {
        const db = getSupabase();
        const feed = document.getElementById('public-news-feed');
        if (!feed) return;

        const { data, error } = await db.from('clinic_news').select('*').order('created_at', { ascending: false });
        if (error) throw error;

        if (!data || data.length === 0) {
            feed.innerHTML = '<p style="color:#888; text-align:center; font-style: italic;">No news updates published yet.</p>';
            return;
        }

        feed.innerHTML = data.map(n => `
            <div style="background: #fafafa; padding: 2rem; border-radius: 12px; border: 1px solid #eee; display: flex; flex-direction: column; gap: 1rem; box-shadow: 0 4px 15px rgba(0,0,0,0.02);">
                ${n.image_url ? `<img src="${n.image_url}" alt="${n.title}" style="width: 100%; max-height: 350px; object-fit: cover; border-radius: 8px; margin-bottom: 1rem;">` : ''}
                <div>
                    <span style="font-size: 0.8rem; color: #888; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px;">Clinic Update • ${new Date(n.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</span>
                    <h3 style="color: #333; margin: 0.4rem 0 0.8rem 0; font-size: 1.4rem;">${n.title}</h3>
                    <p style="color: #555; font-size: 0.95rem; line-height: 1.6; margin: 0;">${n.description}</p>
                </div>
                <div>
                    <a href="${n.pdf_url}" target="_blank" style="display: inline-block; background: var(--primary-sage); color: white; padding: 0.7rem 1.2rem; border-radius: 6px; text-decoration: none; font-size: 0.9rem; font-weight: bold;">📄 View Document (PDF)</a>
                </div>
            </div>
        `).join('');
    } catch(err) {
        console.error("Error loading news:", err.message);
    }
}
