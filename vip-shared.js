/* The Natural Healing Clinic — VIP app shared logic
 *
 * Conventions used across every screen:
 *  - All values go into the DOM with textContent, never innerHTML.
 *    Patient-entered text is never treated as markup.
 *  - The UI disables things when a programme has ended, but the RLS
 *    policies are what actually prevent writes. The front end is a
 *    convenience, not a control.
 */

const SUPABASE_URL = 'https://oegojjgvnsyjuffxtkuv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Twf2fn7Ay35v_ZEIw3iliA_UQwzuBgU';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* Local date as YYYY-MM-DD. Never use toISOString() here — it converts
   to UTC and rolls the date over late in the evening. */
const today = () => new Date().toLocaleDateString('en-CA');

const isoOf = d => d.toLocaleDateString('en-CA');

function el(tag, opts = {}) {
  const n = document.createElement(tag);
  if (opts.class) n.className = opts.class;
  if (opts.text != null) n.textContent = opts.text;
  if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) n.setAttribute(k, v);
  return n;
}

function showError(msg, hostId = 'alert') {
  const host = document.getElementById(hostId);
  if (!host) return;
  host.replaceChildren(el('div', { class: 'err', text: msg }));
}

function clearError(hostId = 'alert') {
  const host = document.getElementById(hostId);
  if (host) host.replaceChildren();
}

/* Redirects to login if there is no session. Returns the session. */
async function requireSession() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) {
    location.replace('./vip-login.html');
    return null;
  }
  return session;
}

async function currentProgramme() {
  const { data, error } = await db
    .from('my_programme').select('*').limit(1).maybeSingle();
  return error ? null : data;
}

function readOnlyBanner(programme, hostId = 'alert') {
  if (!programme || programme.is_active) return false;
  const host = document.getElementById(hostId);
  if (host) {
    host.replaceChildren(el('div', {
      class: 'readonly',
      text: 'Your programme has finished. You can look back over everything you logged, but new entries are closed.'
    }));
  }
  return true;
}

/* Bottom navigation. current: 'home' | 'food' | 'progress' | 'account' */
const NAV = [
  { key: 'home',     href: './vip-home.html',     label: 'Today',
    path: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>' },
  { key: 'food',     href: './vip-food.html',     label: 'Food',
    path: '<path d="M6 3v8a3 3 0 0 0 6 0V3"/><path d="M9 11v10"/><path d="M17 3c-1.5 2-2 4-2 6s.5 3 2 3v9"/>' },
  { key: 'progress', href: './vip-progress.html', label: 'Progress',
    path: '<path d="M3 17l5-6 4 4 5-8 4 5"/>' },
  { key: 'account',  href: './vip-account.html',  label: 'Account',
    path: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>' }
];

function renderNav(current) {
  const nav = el('nav', { class: 'tabs' });
  NAV.forEach(item => {
    const a = el('a', { attrs: { href: item.href } });
    if (item.key === current) a.setAttribute('aria-current', 'page');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = item.path;           // static markup, no user data
    a.append(svg, document.createTextNode(item.label));
    nav.append(a);
  });
  document.body.append(nav);
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
