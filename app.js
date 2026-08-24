// --- UI TOGGLES ---
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

window.closePwaOverlay = function() {
    document.getElementById('pwa-install-overlay').style.display = 'none';
}

function checkPwaInstall() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    const isIos = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
    
    if (!isStandalone && window.innerWidth <= 900) {
        document.getElementById('pwa-install-overlay').style.display = 'flex';
        if(isIos) {
            document.getElementById('pwa-instruction-text').innerHTML = `<strong>1.</strong> Tap the <b>Share</b> icon <svg width="14" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle;"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg> at the bottom of your Safari screen.<br><br><strong>2.</strong> Scroll down and tap <b>Add to Home Screen</b>.`;
        }
    }
}

// --- SUPABASE SETUP ---
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
            db.auth.onAuthStateChange(async (event, session) => {
                if (event === 'PASSWORD_RECOVERY') {
                    const newPassword = prompt("Please enter your new password:");
                    if (newPassword) {
                        const { error } = await db.auth.updateUser({ password: newPassword });
                        if (error) alert("Error updating password: " + error.message);
                        else alert("Password updated successfully! You are now logged in.");
                    }
                }
            });

            const { data: { session } } = await db.auth.getSession();
            if(session) {
                updateNavState(true); 
                openScreen('screen-dashboard'); 
                loadClientDashboard(db, session.user);
            }
        }
    } catch(err) {
        console.log("No active session found.");
    }
};

window.validateBusinessHours = function(input) {
    const val = input.value;
    if(!val) return;
    const date = new Date(val);
    const day = date.getDay();
    const hour = date.getHours();

    if (day === 0) {
        alert("The clinic is closed on Sundays. Please select Monday through Saturday.");
        input.value = "";
        return;
    }
    if (hour < 9 || hour >= 17) {
        alert("Please select a time between 9:00 AM and 5:00 PM.");
        input.value = "";
        return;
    }
}

// --- AUTH & BOOKING LOGIC ---
window.processClientLogin = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('client-login-btn');
    const originalText = btn.innerText;
    btn.innerText = "Authenticating...";

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
            setTimeout(checkPwaInstall, 1000);
        }
    } catch (err) { alert("Login Failed: " + err.message); } 
    finally { btn.innerText = originalText; }
    return false;
}

window.processPasswordReset = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('reset-btn');
    const ogText = btn.innerText;
    btn.innerText = "Sending Link...";
    try {
        const email = document.getElementById('forgot-email').value.trim();
        const db = getSupabase();
        const { error } = await db.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + window.location.pathname
        });
        if (error) throw error;
        alert("If an account exists for that email, a password reset link has been sent.");
        openScreen('screen-login');
        document.getElementById('forgot-email').value = '';
    } catch(err) { 
        alert("Reset Error: " + err.message); 
    } finally { 
        btn.innerText = ogText; 
    }
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
        const date = document.getElementById('reg-date').value;

        const { data: authData, error } = await db.auth.signUp({ email, password: pass, options: { data: { full_name: name } } });
        if (error) throw new Error(error.message);
        
        if (authData.user) {
            const formattedDate = new Date(date).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' });
            const { error: apptError } = await db.from('appointments').insert([{ client_id: authData.user.id, client_name: name, service_name: service, appointment_time: date, status: 'confirmed' }]);
            if(apptError) throw new Error(apptError.message);

            // Trigger secure database email
            await db.rpc('send_booking_email', {
                to_email: email,
                client_name: name,
                service_name: service,
                appointment_time: formattedDate
            });
        }
        
        alert('Registered and booked successfully!'); 
        updateNavState(true); 
        openScreen('screen-dashboard'); 
        loadClientDashboard(db, authData.user);
        setTimeout(checkPwaInstall, 1000);
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
        const formattedDate = new Date(appointmentTime).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' });

        const { error } = await db.from('appointments').insert([{ client_id: user.id, client_name: clientName, service_name: serviceName, appointment_time: appointmentTime, status: 'confirmed' }]);
        if(error) throw error;

        // Trigger secure database email
        await db.rpc('send_booking_email', {
            to_email: user.email,
            client_name: clientName,
            service_name: serviceName,
            appointment_time: formattedDate
        });

        alert("Appointment booked successfully and confirmation email sent!"); 
        loadClientDashboard(db, user);
    } catch(err) { alert("Error booking session: " + err.message); }
    return false;
};

window.cancelAppointment = async function(id) {
    if(!confirm("Are you sure you want to cancel this appointment?")) return;
    try {
        const db = getSupabase();
        const { error } = await db.from('appointments').delete().eq('id', id);
        if(error) throw error;
        
        const { data: { user } } = await db.auth.getUser();
        loadClientDashboard(db, user);
    } catch(err) { alert("Error cancelling appointment: " + err.message); }
};

window.processLogout = async function() {
    try {
        const db = getSupabase();
        if(db) await db.auth.signOut();
        updateNavState(false); 
        openScreen('screen-home');
        location.reload();
    } catch(err) { alert("Error signing out: " + err.message); }
}

function updateNavState(isLoggedIn) {
    document.getElementById('nav-portal-btn').style.display = isLoggedIn ? 'none' : 'inline-block';
    document.getElementById('nav-book-btn').style.display = isLoggedIn ? 'none' : 'inline-block';
    document.getElementById('nav-logout-btn').style.display = isLoggedIn ? 'inline-block' : 'none';
    document.getElementById('mobile-portal-link').style.display = isLoggedIn ? 'none' : 'block';
    document.getElementById('mobile-book-link').style.display = isLoggedIn ? 'none' : 'block';
    document.getElementById('mobile-logout-link').style.display = isLoggedIn ? 'block' : 'none';
}

// --- PORTAL DATA LOADING ---
async function loadClientDashboard(db, user) {
    const list = document.getElementById('client-appointments-list');
    const chatBox = document.getElementById('client-chat-box');
    document.getElementById('portal-welcome-title').innerText = `Welcome, ${user.user_metadata?.full_name || user.email}`;

    try {
        const { data: appts, error: apptError } = await db.from('appointments').select('*').eq('client_id', user.id).order('appointment_time', { ascending: true });
        if(apptError) throw apptError;

        list.innerHTML = (!appts || appts.length === 0) ? '<p style="color:#888; font-size: 0.95rem;">No appointments booked.</p>' : appts.map(a => `
            <div style="padding: 1.5rem; margin-bottom: 1rem; border-radius: 8px; border: 1px solid var(--secondary-sand); display: flex; justify-content: space-between; align-items: center; background: white;">
                <div><strong style="color: var(--text-main); font-family: 'Montserrat'; font-size: 1.1rem;">${new Date(a.appointment_time).toLocaleString('en-GB')}</strong><br><span style="font-size:0.95rem; color:var(--sage-hover);">${a.service_name}</span></div>
                <button class="btn btn-outline" style="min-height: 35px; padding: 0.4rem 1.5rem; color: #a94442; border-color: #a94442;" onclick="cancelAppointment('${a.id}')">Cancel</button>
            </div>`).join('');

        const { data: msgs, error: msgError } = await db.from('messages').select('*').eq('client_id', user.id).order('created_at', { ascending: true });
        if(msgError) throw msgError;

        if(msgs) {
            const chatMsgs = msgs.filter(m => !m.content.includes('[DAILY HEALTH LOG]') && !m.content.includes('[MEDICAL INTAKE SUBMISSION]'));
            chatBox.innerHTML = chatMsgs.map(m => `<div class="msg ${m.sender}"><strong>${m.sender === 'client' ? 'You' : 'Clare'}:</strong> ${m.content}</div>`).join('');
            chatBox.scrollTop = chatBox.scrollHeight;
        }
    } catch(err) { list.innerHTML = `<p style="color: #a94442; font-size: 0.9rem;">Database Error: ${err.message}</p>`; }
}

window.handleClientMessage = async function(e) {
    e.preventDefault();
    try {
        const db = getSupabase();
        const input = document.getElementById('client-msg-input');
        const { data: { user } } = await db.auth.getUser();
        
        const { error } = await db.from('messages').insert([{ client_id: user.id, sender: 'client', content: input.value.trim() }]);
        if(error) throw error;

        document.getElementById('client-chat-box').innerHTML += `<div class="msg client"><strong>You:</strong> ${input.value}</div>`;
        input.value = '';
        document.getElementById('client-chat-box').scrollTop = document.getElementById('client-chat-box').scrollHeight;
    } catch(err) { alert("Error sending message: " + err.message); }
    return false;
}

window.submitMedicalIntake = async function(e) {
    e.preventDefault();
    try {
        const db = getSupabase();
        const { data: { user } } = await db.auth.getUser();
        
        const summary = `[MEDICAL INTAKE SUBMISSION]\nAge: ${document.getElementById('intake-age').value} | Sex: ${document.getElementById('intake-sex').value}\nHeight: ${document.getElementById('intake-height').value} | Weight: ${document.getElementById('intake-weight').value}\n\nAIMS: ${document.getElementById('intake-aims').value}\n\nFUNCTIONAL MARKERS:\nAutoimmune: ${document.getElementById('fm-immune-1').value || 'N/A'}\nDigestion/Gas: ${document.getElementById('fm-digest-1').value || 'N/A'}\nSkin Issues: ${document.getElementById('fm-digest-2').value || 'N/A'}\nCravings: ${document.getElementById('fm-hormone-1').value || 'N/A'}\nMorning Energy: ${document.getElementById('fm-hormone-2').value || 'N/A'}\nThyroid Markers: ${document.getElementById('fm-thyroid-1').value || 'N/A'}\nBlood Sugar: ${document.getElementById('fm-blood-1').value || 'N/A'}\n\nCONSENT: Patient has digitally signed the Functional Medicine Informed Consent waiver.`;

        const { error } = await db.from('messages').insert([{ client_id: user.id, sender: 'client', content: summary }]);
        if(error) throw new Error(error.message);

        alert("Comprehensive Medical Intake successfully submitted!");
    } catch (err) { alert("Error submitting intake: " + err.message); }
    return false;
}

// --- NUTRITION & BARCODE LOGIC ---
window.startBarcodeScanner = function() {
    try {
        const readerDiv = document.getElementById('reader');
        if(readerDiv.style.display === 'block') {
            if(window.html5QrCode) window.html5QrCode.stop().then(() => { readerDiv.style.display = 'none'; });
            return;
        }
        readerDiv.style.display = 'block';
        window.html5QrCode = new Html5Qrcode("reader");
        window.html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: {width: 250, height: 150} },
            (decodedText) => { window.html5QrCode.stop().then(() => { readerDiv.style.display = 'none'; lookupBarcode(decodedText); }); },
            (errorMessage) => { }
        ).catch(err => { alert("Camera access error. Ensure you have granted permissions."); readerDiv.style.display = 'none'; });
    } catch (err) { alert("Scanner error: " + err.message); }
};

window.lookupBarcode = async function(barcode) {
    const resBox = document.getElementById('food-search-results');
    resBox.innerHTML = '<p style="color:#666; font-size:0.9rem; margin-top:0.5rem;">Looking up barcode...</p>';
    try {
        const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
        const data = await res.json();
        if(data.status === 1 && data.product) {
            const p = data.product;
            const name = p.product_name || 'Unknown Food';
            const kcal = p.nutriments ? (p.nutriments['energy-kcal_100g'] || 0) : 0;
            const pro = p.nutriments ? (p.nutriments.proteins_100g || 0) : 0;
            const car = p.nutriments ? (p.nutriments.carbohydrates_100g || 0) : 0;
            const fat = p.nutriments ? (p.nutriments.fat_100g || 0) : 0;
            const fib = p.nutriments ? (p.nutriments.fiber_100g || 0) : 0;
            const sod = p.nutriments ? ((p.nutriments.sodium_100g || 0) * 1000) : 0;
            const pot = p.nutriments ? ((p.nutriments.potassium_100g || 0) * 1000) : 0;
            const calc = p.nutriments ? ((p.nutriments.calcium_100g || 0) * 1000) : 0;
            const iron = p.nutriments ? ((p.nutriments.iron_100g || 0) * 1000) : 0;
            const safeName = name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            selectFood(safeName, kcal, pro, car, fat, fib, sod, pot, calc, iron);
        } else { resBox.innerHTML = '<p style="color:#666; font-size:0.9rem; margin-top:0.5rem;">Product not found in database.</p>'; }
    } catch(err) { resBox.innerHTML = '<p style="color:#a94442; font-size:0.9rem;">Error connecting to food database.</p>'; }
};

window.searchFood = async function() {
    const query = document.getElementById('food-search-query').value.trim();
    if(!query) return;
    const resBox = document.getElementById('food-search-results');
    resBox.innerHTML = '<p style="color:#666; font-size:0.9rem; margin-top:0.5rem;">Searching database...</p>';
    try {
        const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=10`);
        const data = await res.json();
        if(data.products && data.products.length > 0) {
            let html = '<div style="margin-top: 1rem;">';
            data.products.forEach((p) => {
                const name = p.product_name || 'Unknown Food';
                const brand = p.brands ? `(${p.brands})` : '';
                const kcal = p.nutriments ? (p.nutriments['energy-kcal_100g'] || 0) : 0;
                const pro = p.nutriments ? (p.nutriments.proteins_100g || 0) : 0;
                const car = p.nutriments ? (p.nutriments.carbohydrates_100g || 0) : 0;
                const fat = p.nutriments ? (p.nutriments.fat_100g || 0) : 0;
                const fib = p.nutriments ? (p.nutriments.fiber_100g || 0) : 0;
                const sod = p.nutriments ? ((p.nutriments.sodium_100g || 0) * 1000) : 0;
                const pot = p.nutriments ? ((p.nutriments.potassium_100g || 0) * 1000) : 0;
                const calc = p.nutriments ? ((p.nutriments.calcium_100g || 0) * 1000) : 0;
                const iron = p.nutriments ? ((p.nutriments.iron_100g || 0) * 1000) : 0;
                const safeName = name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                
                html += `<div class="premium-list-item" onclick="selectFood('${safeName}', ${kcal}, ${pro}, ${car}, ${fat}, ${fib}, ${sod}, ${pot}, ${calc}, ${iron})">
                    <strong>${name} ${brand}</strong>
                    <span>Per 100g: ${kcal} kcal | ${pro}g Pro | ${car}g Carb | ${fat}g Fat | ${fib}g Fiber</span>
                </div>`;
            });
            html += '</div>';
            resBox.innerHTML = html;
        } else { resBox.innerHTML = '<p style="color:#666; font-size:0.9rem; margin-top:0.5rem;">No results found.</p>'; }
    } catch(err) { resBox.innerHTML = `<p style="color:#a94442; font-size:0.9rem;">Error connecting to database. ${err.message}</p>`; }
};

window.selectFood = function(name, k, p, c, f, fib, sod, pot, calc, iron) {
    const panel = document.getElementById('food-selection-panel');
    panel.style.display = 'block';
    panel.innerHTML = `
        <div style="background: white; padding: 1.5rem; border-radius: 8px; margin-top: 1rem; border: 1px solid var(--primary-sage); box-shadow: 0 10px 30px rgba(13,155,70,0.08);">
            <h5 style="margin-bottom:0.8rem; color: var(--text-main); font-family: 'Montserrat'; font-size: 1.1rem; text-transform: none;">${name}</h5>
            <div style="display:flex; gap:1rem; align-items:center; margin-bottom:1.5rem;">
                <label style="margin:0; font-size: 0.85rem;">Portion (grams):</label>
                <input type="number" id="food-grams" value="100" style="width: 120px; padding:0.8rem; margin:0; background: var(--bg-color);" oninput="updatePreviewMacros(${k}, ${p}, ${c}, ${f}, ${fib}, ${sod}, ${pot}, ${calc}, ${iron})">
            </div>
            <div id="food-macro-preview" style="font-size:0.95rem; color:#555; margin-bottom:1.5rem; font-family: 'Montserrat'; line-height: 1.6; padding-bottom: 1.5rem; border-bottom: 1px solid var(--secondary-sand);">
                <strong style="color:var(--text-main); font-size: 1.1rem;">${k} kcal</strong> | ${p}g Pro | ${c}g Carbs | ${f}g Fat <br>
                <span style="font-size:0.8rem; color:#888;">${fib}g Fiber | ${sod}mg Sodium | ${pot}mg Potassium | ${calc}mg Calcium | ${iron}mg Iron</span>
            </div>
            <div style="display:flex; gap:0.8rem; flex-wrap: wrap;">
                <select id="food-meal-target" style="padding:0.8rem; margin:0; flex:1; background: var(--bg-color);">
                    <option value="brk">Breakfast</option>
                    <option value="lun">Lunch</option>
                    <option value="din">Dinner</option>
                    <option value="snk">Snacks & Supplements</option>
                </select>
                <button type="button" class="btn" style="padding:0 1.5rem; min-height:45px;" onclick="addFoodToLog('${name.replace(/'/g, "\\'")}', ${k}, ${p}, ${c}, ${f}, ${fib}, ${sod}, ${pot}, ${calc}, ${iron})">Add to Meal</button>
            </div>
        </div>
    `;
    document.getElementById('food-search-results').innerHTML = '';
};

window.updatePreviewMacros = function(k, p, c, f, fib, sod, pot, calc, iron) {
    const g = document.getElementById('food-grams').value || 0;
    const r = g / 100;
    document.getElementById('food-macro-preview').innerHTML = `<strong style="color:var(--text-main); font-size: 1.1rem;">${Math.round(k*r)} kcal</strong> | ${Math.round(p*r)}g Pro | ${Math.round(c*r)}g Carbs | ${Math.round(f*r)}g Fat <br>
    <span style="font-size:0.8rem; color:#888;">${Math.round(fib*r)}g Fiber | ${Math.round(sod*r)}mg Sodium | ${Math.round(pot*r)}mg Potassium | ${Math.round(calc*r)}mg Calcium | ${Math.round(iron*r)}mg Iron</span>`;
};

window.addFoodToLog = function(name, k, p, c, f, fib, sod, pot, calc, iron) {
    const g = document.getElementById('food-grams').value || 0;
    const r = g / 100;
    const meal = document.getElementById('food-meal-target').value;
    
    const descInput = document.getElementById(`log-${meal}-desc`);
    const entryText = `${name} (${g}g)\n`;
    descInput.value = descInput.value ? descInput.value + entryText : entryText;

    document.getElementById(`log-${meal}-cal`).value = Math.round((Number(document.getElementById(`log-${meal}-cal`).value) || 0) + (k * r));
    document.getElementById(`log-${meal}-pro`).value = Math.round((Number(document.getElementById(`log-${meal}-pro`).value) || 0) + (p * r));
    document.getElementById(`log-${meal}-car`).value = Math.round((Number(document.getElementById(`log-${meal}-car`).value) || 0) + (c * r));
    document.getElementById(`log-${meal}-fat`).value = Math.round((Number(document.getElementById(`log-${meal}-fat`).value) || 0) + (f * r));
    document.getElementById(`log-${meal}-fib`).value = Math.round((Number(document.getElementById(`log-${meal}-fib`).value) || 0) + (fib * r));

    document.getElementById(`log-${meal}-sod`).value = Math.round((Number(document.getElementById(`log-${meal}-sod`).value) || 0) + (sod * r));
    document.getElementById(`log-${meal}-pot`).value = Math.round((Number(document.getElementById(`log-${meal}-pot`).value) || 0) + (pot * r));
    document.getElementById(`log-${meal}-calc`).value = Math.round((Number(document.getElementById(`log-${meal}-calc`).value) || 0) + (calc * r));
    document.getElementById(`log-${meal}-iron`).value = Math.round((Number(document.getElementById(`log-${meal}-iron`).value) || 0) + (iron * r));

    document.getElementById('food-selection-panel').style.display = 'none';
    document.getElementById('food-search-query').value = '';
    
    updateDailyTotals();
    alert(`${name} (${g}g) added to your log!`);
};

window.updateDailyTotals = function() {
    const meals = ['brk', 'lun', 'din', 'snk'];
    let tCal=0, tPro=0, tCar=0, tFat=0, tFib=0, tSod=0, tPot=0, tCalc=0, tIron=0;
    meals.forEach(m => {
        tCal += Number(document.getElementById(`log-${m}-cal`).value) || 0;
        tPro += Number(document.getElementById(`log-${m}-pro`).value) || 0;
        tCar += Number(document.getElementById(`log-${m}-car`).value) || 0;
        tFat += Number(document.getElementById(`log-${m}-fat`).value) || 0;
        tFib += Number(document.getElementById(`log-${m}-fib`).value) || 0;
        tSod += Number(document.getElementById(`log-${m}-sod`).value) || 0;
        tPot += Number(document.getElementById(`log-${m}-pot`).value) || 0;
        tCalc += Number(document.getElementById(`log-${m}-calc`).value) || 0;
        tIron += Number(document.getElementById(`log-${m}-iron`).value) || 0;
    });
    document.getElementById('tot-cal').innerText = tCal;
    document.getElementById('tot-pro').innerText = tPro + 'g';
    document.getElementById('tot-car').innerText = tCar + 'g';
    document.getElementById('tot-fat').innerText = tFat + 'g';
    document.getElementById('tot-fib').innerText = tFib + 'g';
    document.getElementById('tot-sod').innerText = tSod + 'mg';
    document.getElementById('tot-pot').innerText = tPot + 'mg';
    document.getElementById('tot-calc').innerText = tCalc + 'mg';
    document.getElementById('tot-iron').innerText = tIron + 'mg';
};

window.submitDailyLog = async function(e) {
    e.preventDefault();
    try {
        const db = getSupabase();
        const { data: { user } } = await db.auth.getUser();

        const logData = `[DAILY HEALTH LOG]\nDate: ${new Date().toLocaleDateString('en-GB')}\n\n🥗 FOOD & NUTRITION:\n[Breakfast] ${document.getElementById('log-brk-desc').value || '-'}\n> Macros: ${document.getElementById('log-brk-cal').value||0}kcal | ${document.getElementById('log-brk-pro').value||0}g Pro | ${document.getElementById('log-brk-car').value||0}g Carb | ${document.getElementById('log-brk-fat').value||0}g Fat\n> Micros: ${document.getElementById('log-brk-fib').value||0}g Fiber | ${document.getElementById('log-brk-sod').value||0}mg Sodium | ${document.getElementById('log-brk-pot').value||0}mg Potassium | ${document.getElementById('log-brk-calc').value||0}mg Calcium | ${document.getElementById('log-brk-iron').value||0}mg Iron\n\n[Lunch] ${document.getElementById('log-lun-desc').value || '-'}\n> Macros: ${document.getElementById('log-lun-cal').value||0}kcal | ${document.getElementById('log-lun-pro').value||0}g Pro | ${document.getElementById('log-lun-car').value||0}g Carb | ${document.getElementById('log-lun-fat').value||0}g Fat\n> Micros: ${document.getElementById('log-lun-fib').value||0}g Fiber | ${document.getElementById('log-lun-sod').value||0}mg Sodium | ${document.getElementById('log-lun-pot').value||0}mg Potassium | ${document.getElementById('log-lun-calc').value||0}mg Calcium | ${document.getElementById('log-lun-iron').value||0}mg Iron\n\n[Dinner] ${document.getElementById('log-din-desc').value || '-'}\n> Macros: ${document.getElementById('log-din-cal').value||0}kcal | ${document.getElementById('log-din-pro').value||0}g Pro | ${document.getElementById('log-din-car').value||0}g Carb | ${document.getElementById('log-din-fat').value||0}g Fat\n> Micros: ${document.getElementById('log-din-fib').value||0}g Fiber | ${document.getElementById('log-din-sod').value||0}mg Sodium | ${document.getElementById('log-din-pot').value||0}mg Potassium | ${document.getElementById('log-din-calc').value||0}mg Calcium | ${document.getElementById('log-din-iron').value||0}mg Iron\n\n[Snacks] ${document.getElementById('log-snk-desc').value || '-'}\n> Macros: ${document.getElementById('log-snk-cal').value||0}kcal | ${document.getElementById('log-snk-pro').value||0}g Pro | ${document.getElementById('log-snk-car').value||0}g Carb | ${document.getElementById('log-snk-fat').value||0}g Fat\n> Micros: ${document.getElementById('log-snk-fib').value||0}g Fiber | ${document.getElementById('log-snk-sod').value||0}mg Sodium | ${document.getElementById('log-snk-pot').value||0}mg Potassium | ${document.getElementById('log-snk-calc').value||0}mg Calcium | ${document.getElementById('log-snk-iron').value||0}mg Iron\n\n>> DAILY MACRO TOTALS: ${document.getElementById('tot-cal').innerText} kcal | ${document.getElementById('tot-pro').innerText} Protein | ${document.getElementById('tot-car').innerText} Carbs | ${document.getElementById('tot-fat').innerText} Fat \n>> DAILY MICRO TOTALS: ${document.getElementById('tot-fib').innerText} Fiber | ${document.getElementById('tot-sod').innerText} Sodium | ${document.getElementById('tot-pot').innerText} Potassium | ${document.getElementById('tot-calc').innerText} Calcium | ${document.getElementById('tot-iron').innerText} Iron\n\n🏃‍♀️ ACTIVITY: ${document.getElementById('log-activity-type').value || '-'} (${document.getElementById('log-activity-dur').value || '0'} mins) | Intensity: ${document.getElementById('log-activity-int')?.value || '-'}\n🧠 MOOD: ${document.getElementById('log-mood-rating').value || '-'} | Energy: ${document.getElementById('log-energy')?.value || '-'}/10 | Notes: ${document.getElementById('log-mood-notes')?.value || '-'}\n💤 SLEEP: ${document.getElementById('log-sleep-hours').value || '-'} hours | Quality: ${document.getElementById('log-sleep-quality').value || '-'}/5\n🚽 BOWEL: ${document.getElementById('log-bowel-type').value || '-'} | Freq: ${document.getElementById('log-bowel-freq').value || '-'}\n💧 WATER: ${document.getElementById('log-water').value || '-'}\n📏 VITALS: Weight: ${document.getElementById('log-meas-weight').value || '-'} | BP: ${document.getElementById('log-meas-bp').value || '-'}`;

        const { error } = await db.from('messages').insert([{ client_id: user.id, sender: 'client', content: logData }]);
        if(error) throw error;

        alert("Daily Health Log saved successfully to your practitioner file!");
        e.target.reset(); updateDailyTotals();
        document.querySelectorAll('.journal-panel').forEach(p => p.classList.remove('show'));
    } catch(err) { alert("Error saving log: " + err.message); }
    return false;
};
