/* Our Life — James + Keith
   Vanilla JavaScript, no build step.

   Two modes:
   - LOCAL mode (config.js empty): works like V1; data lives only in this browser (localStorage key "ourLifeV1").
   - CLOUD mode (config.js filled in): sign-in required; data lives in Supabase and syncs live between devices.
     A copy is cached on the device so the app opens instantly and works briefly offline; offline edits are queued.

   Ownership (James / Keith / Shared) means "who it's for". Both household members can see and edit everything.
*/
'use strict';
(() => {

// ---------------------------------------------------------------- constants
const CFG = window.OUR_LIFE_CONFIG || {};
const LOCAL_KEY = 'ourLifeV1';            // V1 key — kept so existing browser data carries over untouched
const CACHE_KEY = 'ourLifeCloudCache';
const PENDING_KEY = 'ourLifePending';
const PREFS_KEY = 'ourLifePrefs';
const IMPORTED_KEY = 'ourLifeImportedLocal';
const TYPES = ['Task','Event','Grocery','Meal','Project','Reminder','Idea','Workout'];
const OWNERS = ['Shared','James','Keith'];
const DEPARTMENTS = ['Produce','Dairy & Eggs','Meat & Seafood','Bakery & Bread','Frozen','Pantry','Snacks & Drinks','Household Essentials','Personal Care','Pet','Other'];
const BRAIN_CATEGORIES = ['Cleaning','Home','Errands','Personal','Work','Shopping','Money','Meals','Ideas','Other'];
const DEMO_TITLES = ['Call dentist','Pick up cat food','Dinner with friends','Chicken tacos','Lactose-free milk','Tortillas','Kitchen organization'];

// ---------------------------------------------------------------- helpers
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const localDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => localDate(new Date());
const parseDate = s => new Date(s + 'T12:00:00');
const displayDate = (d, opts = { month: 'short', day: 'numeric' }) => d ? parseDate(d).toLocaleDateString(undefined, opts) : '';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const newId = () => (globalThis.crypto?.randomUUID?.() || 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2));
const readJSON = (k, fallback) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? fallback; } catch { return fallback; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('Could not save to this device', e); } };
const num = v => { if (v === '' || v === null || v === undefined) return null; const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null; };
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = s => typeof s === 'string' && /^\d{2}:\d{2}$/.test(s);

// Make any stored/imported record safe and consistent. Used for V1 data, backups and database rows.
function normalize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const x = { ...raw };
  x.id = String(x.id ?? newId()).slice(0, 100);
  if (!TYPES.includes(x.type)) return null;
  x.title = String(x.title ?? '').trim().slice(0, 300);
  if (!x.title) return null;
  x.owner = OWNERS.includes(x.owner) ? x.owner : 'Shared';
  x.date = isDate(x.date) ? x.date : '';
  x.notes = String(x.notes ?? '').slice(0, 1000);
  x.done = !!x.done;
  x.deleted = !!x.deleted;
  if (x.type === 'Grocery') x.category = DEPARTMENTS.includes(x.category) ? x.category : 'Other';
  if (x.type === 'Idea') x.category = BRAIN_CATEGORIES.includes(x.category) ? x.category : 'Other';
  if (x.type === 'Event') {
    x.startTime = isTime(x.startTime) ? x.startTime : '';
    x.endTime = isTime(x.endTime) ? x.endTime : '';
    x.location = String(x.location ?? '').slice(0, 300);
  }
  if (x.type === 'Project') {
    // V1 stored progress as a number typed into Notes (e.g. "40"). Move it into a real progress field.
    if (x.progress === undefined || x.progress === null) {
      const m = /^\s*(\d{1,3})\s*%?\s*$/.exec(x.notes);
      if (m) { x.progress = Math.min(100, Number(m[1])); x.notes = ''; } else x.progress = null;
    }
    x.progress = x.progress === null ? null : Math.max(0, Math.min(100, Number(x.progress) || 0));
  }
  if (x.type === 'Workout') for (const k of ['calories','sets','reps','weight','duration']) x[k] = num(x[k]);
  return x;
}

// Read V1-format data ({items, brain}) and migrate legacy free-text brain entries (same rule as V1).
function readV1(obj) {
  const items = Array.isArray(obj?.items) ? obj.items.slice() : [];
  for (const old of (Array.isArray(obj?.brain) ? obj.brain : [])) {
    if (old?.text && !items.some(x => x.legacyBrainCreated === old.created && x.title === old.text))
      items.push({ id: newId(), type: 'Idea', title: old.text, owner: old.owner || 'Shared', date: String(old.created || '').slice(0, 10), notes: '', category: 'Other', done: false, legacyBrainCreated: old.created });
  }
  return items.map(normalize).filter(Boolean);
}

function demoData() {
  const plus = n => localDate(new Date(Date.now() + n * 86400000));
  return [
    { id: '1', type: 'Task', title: 'Call dentist', owner: 'James', date: today(), notes: 'Personal' },
    { id: '2', type: 'Task', title: 'Pick up cat food', owner: 'Shared', date: today(), notes: 'Errand' },
    { id: '3', type: 'Event', title: 'Dinner with friends', owner: 'Shared', date: plus(2), notes: 'Dinner plans', startTime: '19:00', endTime: '21:00', location: '' },
    { id: '4', type: 'Meal', title: 'Chicken tacos', owner: 'Shared', date: today(), notes: 'Keith is cooking' },
    { id: '5', type: 'Grocery', title: 'Lactose-free milk', owner: 'Shared', notes: '', category: 'Dairy & Eggs' },
    { id: '6', type: 'Grocery', title: 'Tortillas', owner: 'Shared', notes: '', category: 'Pantry' },
    { id: '7', type: 'Project', title: 'Kitchen organization', owner: 'Shared', notes: '40' }
  ].map(normalize);
}
const isDemoItem = x => /^[1-7]$/.test(String(x.id)) && DEMO_TITLES.includes(x.title);

// ---------------------------------------------------------------- state
const prefs = readJSON(PREFS_KEY, {});
const savePrefs = () => writeJSON(PREFS_KEY, prefs);
let items = [];                 // all records (including soft-deleted ones in cloud mode)
let taskFilter = 'All', workoutFilter = 'All';
let selectedCalendarDate = today();
let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let weekOffset = 0;
let editingId = null;
let lastRenderDay = today();

const live = () => items.filter(x => !x.deleted);
const byId = id => items.find(x => x.id === String(id));

// ---------------------------------------------------------------- storage layer
const cloud = {
  enabled: false, sb: null, user: null, member: null, channel: null,
  pending: readJSON(PENDING_KEY, {}), flushing: false, retryTimer: null
};

function setSync(state, text) {
  const el = $('syncStatus');
  el.className = 'sync ' + state;
  $('syncText').textContent = text;
  el.title = text;
}

function persist() {
  if (cloud.enabled) writeJSON(CACHE_KEY, items);
  else writeJSON(LOCAL_KEY, { items: live(), brain: [] });
}

// The single way records change: add / edit / toggle / delete all go through here.
function commit(list) {
  const stamp = new Date().toISOString();
  for (const it of [].concat(list)) {
    it.updatedAt = stamp;
    const i = items.findIndex(x => x.id === it.id);
    if (i >= 0) items[i] = it; else items.push(it);
    if (cloud.enabled) cloud.pending[it.id] = it;
  }
  persist();
  render();
  if (cloud.enabled) { writeJSON(PENDING_KEY, cloud.pending); flush(); }
}

const toRow = it => {
  const { deleted, updatedAt, ...data } = it;
  return { id: it.id, type: it.type, data, deleted: !!deleted };
};
const fromRow = r => normalize({ ...(r.data || {}), id: r.id, type: r.type || r.data?.type, deleted: r.deleted, updatedAt: r.updated_at });

async function flush() {
  if (!cloud.enabled || cloud.flushing) return;
  const batch = Object.values(cloud.pending);
  if (!batch.length) { setSync('ok', 'Synced'); return; }
  if (navigator.onLine === false) { setSync('offline', 'Offline — will sync'); return; }
  cloud.flushing = true;
  setSync('pending', 'Saving…');
  try {
    const { error } = await cloud.sb.from('items').upsert(batch.map(toRow), { onConflict: 'id' });
    if (error) throw error;
    // Only clear entries that weren't changed again while we were saving.
    for (const it of batch) if (cloud.pending[it.id] === it) delete cloud.pending[it.id];
    writeJSON(PENDING_KEY, cloud.pending);
    setSync(Object.keys(cloud.pending).length ? 'pending' : 'ok', Object.keys(cloud.pending).length ? 'Saving…' : 'Synced');
  } catch (e) {
    console.warn('Sync failed', e);
    setSync(navigator.onLine === false ? 'offline' : 'error', navigator.onLine === false ? 'Offline — will sync' : 'Not synced — retrying');
    clearTimeout(cloud.retryTimer);
    cloud.retryTimer = setTimeout(flush, 15000);
  } finally {
    cloud.flushing = false;
    if (Object.values(cloud.pending).some(it => !batch.includes(it))) flush();
  }
}

async function fetchAll() {
  if (!cloud.enabled) return;
  try {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await cloud.sb.from('items').select('id,type,data,deleted,updated_at').order('id').range(from, from + 999);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    const server = rows.map(fromRow).filter(Boolean);
    // Local unsaved edits win over what the server had a moment ago.
    const pend = cloud.pending;
    items = server.filter(x => !pend[x.id]).concat(Object.values(pend));
    persist();
    render();
    if (!Object.keys(pend).length) setSync('ok', 'Synced');
    return true;
  } catch (e) {
    console.warn('Load failed', e);
    setSync(navigator.onLine === false ? 'offline' : 'error', navigator.onLine === false ? 'Offline — showing saved copy' : 'Could not reach database');
    return false;
  }
}

function applyRemote(payload) {
  if (payload.eventType === 'DELETE') {
    const id = payload.old?.id;
    if (id && !cloud.pending[id]) { items = items.filter(x => x.id !== id); persist(); scheduleRender(); }
    return;
  }
  const it = fromRow(payload.new || {});
  if (!it || cloud.pending[it.id]) return;
  const i = items.findIndex(x => x.id === it.id);
  if (i >= 0) items[i] = it; else items.push(it);
  persist();
  scheduleRender();
}

let renderQueued = false;
function scheduleRender() { if (renderQueued) return; renderQueued = true; requestAnimationFrame(() => { renderQueued = false; render(); }); }

function subscribe() {
  if (cloud.channel) cloud.sb.removeChannel(cloud.channel);
  cloud.channel = cloud.sb.channel('our-life-items')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, applyRemote)
    .subscribe(status => { if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setTimeout(subscribe, 5000); });
}

// ---------------------------------------------------------------- startup
function showApp() { $('loginScreen').hidden = true; $('appShell').hidden = false; }
function showLogin(msg = '') { $('appShell').hidden = true; $('loginScreen').hidden = false; $('loginError').textContent = msg; $('loginBtn').disabled = false; }

function looksLikeSecretKey(k) {
  if (/^sb_secret_/.test(k)) return true;
  try { return JSON.parse(atob(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role'; } catch { return false; }
}

async function boot() {
  fillSelect('departmentInput', DEPARTMENTS);
  fillSelect('brainCategoryInput', BRAIN_CATEGORIES);
  fillSelect('brainInlineCategory', BRAIN_CATEGORIES);
  if (OWNERS.slice(1).includes(prefs.viewer)) $('viewer').value = prefs.viewer;
  wireEvents();

  const wantsCloud = !!(CFG.supabaseUrl && CFG.supabaseKey);
  if (!wantsCloud) return startLocal();
  if (!window.supabase?.createClient) { alert('The database library (lib/supabase.js) is missing. Running in local mode.'); return startLocal(); }
  if (looksLikeSecretKey(CFG.supabaseKey)) {
    document.body.innerHTML = '<div class="login-wrap"><div class="card login"><h1>Stop</h1><p>config.js contains a <b>secret</b> key. Remove it right away and use the <b>publishable</b> key instead. See README.md, step 3.</p></div></div>';
    return;
  }
  cloud.enabled = true;
  cloud.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  cloud.sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') { stopCloud(); showLogin(); }
    else if (event === 'TOKEN_REFRESHED' && session) cloud.user = session.user;
  });
  const { data } = await cloud.sb.auth.getSession();
  if (data.session) startCloud(data.session.user, false); else showLogin();
}

function startLocal() {
  const stored = readJSON(LOCAL_KEY, null);
  items = stored ? readV1(stored) : demoData();
  $('localBanner').hidden = false;
  setSync('offline', 'This device only');
  $('accountInfo').textContent = 'Local mode: everything is saved only in this browser. Download a backup before clearing browser data.';
  showApp();
  persist();
  render();
}

async function startCloud(user, freshLogin) {
  cloud.user = user;
  const { data: name, error } = await cloud.sb.rpc('my_member_name');
  if (error || !name) {
    await cloud.sb.auth.signOut();
    return showLogin(error ? 'Could not check your account (' + (error.message || 'database not set up') + '). See README step 2.' : 'This account is not on the household list. See README step 2.');
  }
  cloud.member = name;
  if (freshLogin || !OWNERS.slice(1).includes(prefs.viewer)) { prefs.viewer = name; savePrefs(); }
  $('viewer').value = prefs.viewer;
  $('accountInfo').textContent = `Signed in as ${user.email} (${name}). Changes sync between your devices.`;
  $('accountBlock').hidden = false;
  items = readJSON(CACHE_KEY, []).map(normalize).filter(Boolean);
  for (const p of Object.values(cloud.pending)) { const i = items.findIndex(x => x.id === p.id); if (i >= 0) items[i] = p; else items.push(p); }
  showApp();
  render();
  subscribe();
  if (await fetchAll()) { flush(); offerLocalImport(false); }
}

function stopCloud() {
  if (cloud.channel) { cloud.sb.removeChannel(cloud.channel); cloud.channel = null; }
  items = []; cloud.user = null; cloud.member = null;
  localStorage.removeItem(CACHE_KEY);
  // Unsaved edits are kept on purpose (PENDING_KEY) and upload after the next sign-in.
}

function localImportCandidates() {
  const stored = readJSON(LOCAL_KEY, null);
  return stored ? readV1(stored).filter(x => !isDemoItem(x)) : [];
}
function offerLocalImport(manual) {
  const list = localImportCandidates();
  if (!list.length) { if (manual) toast('No older entries found in this browser.'); return; }
  if (!manual && localStorage.getItem(IMPORTED_KEY)) return;
  localStorage.setItem(IMPORTED_KEY, new Date().toISOString());
  if (!confirm(`This browser has ${list.length} item${list.length === 1 ? '' : 's'} from the earlier version of Our Life. Copy ${list.length === 1 ? 'it' : 'them'} into your shared account?`)) {
    if (!manual) toast('Skipped. You can do this later in Settings.');
    return;
  }
  // Fresh IDs so James's and Keith's old browsers can never collide (both started with demo IDs 1–7).
  commit(list.map(x => ({ ...x, id: newId() })));
  toast(`Copied ${list.length} item${list.length === 1 ? '' : 's'}.`);
}

// ---------------------------------------------------------------- rendering
const pill = o => `<span class="pill ${o === 'Shared' ? 'shared' : o === 'Keith' ? 'keith' : 'james'}">${esc(o || 'Shared')}</span>`;
const editBtn = x => `<button class="smallbtn" data-act="edit" data-id="${esc(x.id)}" aria-label="Edit ${esc(x.title)}">Edit</button>`;
const delBtn = x => `<button class="deletebtn" data-act="delete" data-id="${esc(x.id)}" aria-label="Delete ${esc(x.title)}">Delete</button>`;
const rowBtns = x => `<div class="rowbtns">${editBtn(x)}${delBtn(x)}</div>`;

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number), d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
const timeRange = x => x.startTime ? formatTime(x.startTime) + (x.endTime ? '–' + formatTime(x.endTime) : '') : (x.type === 'Event' ? 'All day' : '');

function itemRow(x, { check = true, showOverdue = false, extra = '' } = {}) {
  const meta = [pill(x.owner)];
  if (x.date) meta.push(showOverdue && x.date < today() && !x.done ? `<span class="overdue">Overdue · ${displayDate(x.date)}</span>` : displayDate(x.date));
  if (x.type === 'Event') meta.push(esc(timeRange(x)));
  if (x.type === 'Reminder' && showOverdue) meta.push('Reminder');
  if (x.notes) meta.push(esc(x.notes));
  return `<div class="item ${x.done ? 'done' : ''}">` +
    (check ? `<input type="checkbox" data-act="toggle" data-id="${esc(x.id)}" aria-label="Mark ${esc(x.title)} ${x.done ? 'not done' : 'done'}" ${x.done ? 'checked' : ''}>` : '') +
    `<div class="item-main"><div class="item-title">${esc(x.title)}</div><div class="item-meta">${meta.join(' · ')}</div>${extra}</div>${rowBtns(x)}</div>`;
}

// Undone first; dated items by date; undated last.
const taskSort = (a, b) => (a.done - b.done) || ((a.date ? 0 : 1) - (b.date ? 0 : 1)) || (a.date || '').localeCompare(b.date || '');
const eventSort = (a, b) => (a.date || '').localeCompare(b.date || '') || (a.startTime || '').localeCompare(b.startTime || '');

function render() {
  const now = new Date(), viewer = $('viewer').value, t = today(), all = live();
  lastRenderDay = t;

  // HOME
  $('todayLabel').textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  $('hello').textContent = `Good ${now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening'}, ${viewer}`;
  const mine = x => x.owner === viewer || x.owner === 'Shared';
  const due = all.filter(x => (x.type === 'Task' || x.type === 'Reminder') && !x.done && x.date && x.date <= t && mine(x)).sort(taskSort);
  $('todayTasks').innerHTML = due.map(x => itemRow(x, { showOverdue: true })).join('') || '<div class="empty">Nothing pressing today.</div>';
  const ev = all.filter(x => x.type === 'Event' && x.date >= t).sort(eventSort).slice(0, 5);
  $('upcoming').innerHTML = ev.map(x => itemRow(x, { check: false })).join('') || '<div class="empty">Nothing coming up yet.</div>';
  const meals = all.filter(x => x.type === 'Meal' && x.date === t);
  $('tonight').innerHTML = meals.length ? meals.map(m => `<div class="item"><div class="item-main"><div class="tonight-title">${esc(m.title)}</div><div class="item-meta">${pill(m.owner)}${m.notes ? ' · ' + esc(m.notes) : ''}</div></div>${rowBtns(m)}</div>`).join('') : '<div class="empty">No dinner planned yet.</div>';
  const gs = all.filter(x => x.type === 'Grocery' && !x.done);
  $('grocerySummary').innerHTML = `<div class="bignum">${gs.length} item${gs.length === 1 ? '' : 's'} left</div><div class="muted">${gs.slice(0, 5).map(x => esc(x.title)).join(' · ') || 'List is clear'}</div>`;

  // TASKS + REMINDERS
  const byFilter = x => taskFilter === 'All' || x.owner === taskFilter;
  $('taskList').innerHTML = all.filter(x => x.type === 'Task' && byFilter(x)).sort(taskSort).map(x => itemRow(x, { showOverdue: true })).join('') || '<div class="empty">No tasks here.</div>';
  $('reminderList').innerHTML = all.filter(x => x.type === 'Reminder' && byFilter(x)).sort(taskSort).map(x => itemRow(x, { showOverdue: true })).join('') || '<div class="empty">No reminders here.</div>';
  document.querySelectorAll('#taskFilters button').forEach(b => { const on = b.dataset.filter === taskFilter; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });

  renderMeals(all);
  renderGroceries(all);
  renderProjects(all);
  renderBrain(all);
  renderWorkouts(all);
  renderCalendar(all);
}

function renderMeals(all) {
  const t = today(), start = new Date();
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  $('weekLabel').textContent = `${displayDate(localDate(days[0]))} – ${displayDate(localDate(days[6]))}`;
  $('mealWeek').innerHTML = days.map(d => {
    const ds = localDate(d), ms = all.filter(x => x.type === 'Meal' && x.date === ds);
    return `<div class="day ${ds === t ? 'is-today' : ''}"><b>${d.toLocaleDateString(undefined, { weekday: 'long' })}</b><span class="muted">${displayDate(ds)}</span>` +
      (ms.map(m => `<div class="meal"><b>${esc(m.title)}</b><small>${pill(m.owner)}${m.notes ? ' · ' + esc(m.notes) : ''}</small>${rowBtns(m)}</div>`).join('') || '<div class="empty" style="padding:10px 0 0">Not planned</div>') +
      `<button class="smallbtn addmeal" data-act="add" data-type="Meal" data-date="${ds}">+ Add dinner</button></div>`;
  }).join('');
  const ideas = all.filter(x => x.type === 'Meal' && !x.date);
  $('mealIdeasCard').hidden = !ideas.length;
  $('mealIdeas').innerHTML = ideas.map(x => itemRow(x, { check: false })).join('');
}

function renderGroceries(all) {
  const g = all.filter(x => x.type === 'Grocery');
  $('groceryList').innerHTML = DEPARTMENTS.map(cat => {
    const rows = g.filter(x => x.category === cat).sort((a, b) => a.done - b.done);
    return rows.length ? `<div class="card"><h3>${esc(cat)} <small>(${rows.filter(x => !x.done).length} left)</small></h3>${rows.map(x => itemRow(x)).join('')}</div>` : '';
  }).join('') || '<div class="empty">Your grocery list is empty.</div>';
}

function renderProjects(all) {
  $('projectList').innerHTML = all.filter(x => x.type === 'Project').map(x => {
    const p = x.progress;
    return `<div class="card"><h3>${esc(x.owner)}</h3><div class="project-title">${esc(x.title)}</div>` +
      (x.date ? `<div class="muted">Target: ${displayDate(x.date, { month: 'short', day: 'numeric', year: 'numeric' })}</div>` : '') +
      (x.notes ? `<div class="muted">${esc(x.notes)}</div>` : '') +
      (p !== null && p !== undefined ? `<div class="projectbar" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100"><span style="width:${p}%"></span></div><div class="muted" style="font-size:12px;margin-bottom:8px">${p}% done</div>` : '') +
      `<div class="rowbtns" style="margin-top:8px">${editBtn(x)}${delBtn(x)}</div></div>`;
  }).join('') || '<div class="empty">No projects yet.</div>';
}

function renderBrain(all) {
  const ideas = all.filter(x => x.type === 'Idea');
  $('brainList').innerHTML = BRAIN_CATEGORIES.map(cat => {
    const rows = ideas.filter(x => x.category === cat).sort((a, b) => a.done - b.done);
    return rows.length ? `<div class="section-label">${esc(cat)}<span>${rows.filter(x => !x.done).length} open</span></div>${rows.map(x => itemRow(x)).join('')}` : '';
  }).join('') || '<div class="empty">Nothing in your Brain Dump yet.</div>';
}

function renderWorkouts(all) {
  const w = all.filter(x => x.type === 'Workout' && (workoutFilter === 'All' || x.owner === workoutFilter || x.owner === 'Shared')).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  $('workoutList').innerHTML = w.map(x => {
    const bits = [];
    if (x.duration !== null) bits.push(`${x.duration} min`);
    if (x.calories !== null) bits.push(`${x.calories.toLocaleString()} cal`);
    if (x.sets !== null) bits.push(`${x.sets} sets`);
    if (x.reps !== null) bits.push(`${x.reps} reps`);
    if (x.weight !== null) bits.push(`${x.weight} lb`);
    const meta = [pill(x.owner), displayDate(x.date, { month: 'short', day: 'numeric', year: 'numeric' }) || 'No date', ...bits.map(esc)];
    if (x.notes) meta.push(esc(x.notes));
    return `<div class="item"><div class="item-main"><div class="item-title">${esc(x.title)}</div><div class="item-meta">${meta.join(' · ')}</div></div>${rowBtns(x)}</div>`;
  }).join('') || '<div class="empty">No workouts logged yet.</div>';
  $('workoutCount').textContent = w.length;
  $('workoutCalories').textContent = w.reduce((s, x) => s + (x.calories || 0), 0).toLocaleString();
  const recent = w.find(x => x.date);
  $('workoutRecent').textContent = recent ? displayDate(recent.date) : '—';
  document.querySelectorAll('#workoutFilters button').forEach(b => { const on = b.dataset.wfilter === workoutFilter; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });
}

function renderCalendar(all) {
  const y = calendarCursor.getFullYear(), m = calendarCursor.getMonth(), t = today();
  $('calendarMonthTitle').textContent = calendarCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const startDow = new Date(y, m, 1).getDay();
  const eventDates = new Set(all.filter(x => x.type === 'Event' && x.date).map(x => x.date));
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(y, m, 1 - startDow + i), ds = localDate(d), cl = ['cal-day'];
    if (d.getMonth() !== m) cl.push('outside');
    if (ds === t) cl.push('today');
    if (ds === selectedCalendarDate) cl.push('selected');
    if (eventDates.has(ds)) cl.push('has-event');
    const label = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) + (eventDates.has(ds) ? ', has events' : '');
    cells += `<button class="${cl.join(' ')}" data-act="day" data-date="${ds}" aria-label="${esc(label)}" ${ds === selectedCalendarDate ? 'aria-current="date"' : ''}>${d.getDate()}</button>`;
  }
  $('calendarGrid').innerHTML = cells;
  $('selectedDayTitle').textContent = displayDate(selectedCalendarDate, { weekday: 'long', month: 'long', day: 'numeric' });
  const events = all.filter(x => x.type === 'Event' && x.date === selectedCalendarDate).sort(eventSort);
  $('eventList').innerHTML = events.map(x => {
    const meta = [pill(x.owner), displayDate(x.date, { weekday: 'short', month: 'short', day: 'numeric' }), esc(timeRange(x))];
    if (x.location) meta.push(esc(x.location));
    if (x.notes) meta.push(esc(x.notes));
    return `<div class="eventcard"><div class="eventmain"><div class="eventtitle">${esc(x.title)}</div><div class="muted">${meta.join(' · ')}</div></div>` +
      `<div class="eventbtns"><button class="calbtn" data-act="ics" data-id="${esc(x.id)}">＋ Add to Calendar</button>${editBtn(x)}${delBtn(x)}</div></div>`;
  }).join('') || '<div class="empty">Nothing planned for this day.</div>';
}

// ---------------------------------------------------------------- calendar export (.ics)
// One-way file export. Times are "floating" local times, so 7:00 PM stays 7:00 PM on whichever phone imports it.
function icsEscape(v = '') { return String(v).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }
function icsFold(line) {   // RFC 5545: lines longer than 75 bytes are folded
  const enc = new TextEncoder(); const out = []; let cur = '', bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}
const icsLocal = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const icsDay = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
function icsEventLines(x) {
  const [Y, M, D] = x.date.split('-').map(Number);
  const lines = ['BEGIN:VEVENT', 'UID:' + x.id + '@our-life', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')];
  if (x.startTime) {
    const [sh, sm] = x.startTime.split(':').map(Number);
    const start = new Date(Y, M - 1, D, sh, sm);
    let end;
    if (x.endTime && x.endTime > x.startTime) { const [eh, em] = x.endTime.split(':').map(Number); end = new Date(Y, M - 1, D, eh, em); }
    else end = new Date(start.getTime() + 60 * 60000);   // no end time → 1 hour (V1 bug: defaulted to 10:00 AM)
    lines.push('DTSTART:' + icsLocal(start), 'DTEND:' + icsLocal(end));
  } else {
    lines.push('DTSTART;VALUE=DATE:' + icsDay(new Date(Y, M - 1, D)), 'DTEND;VALUE=DATE:' + icsDay(new Date(Y, M - 1, D + 1)));
  }
  lines.push('SUMMARY:' + icsEscape(x.title));
  lines.push('DESCRIPTION:' + icsEscape((x.notes ? x.notes + '\n' : '') + 'Our Life: ' + (x.owner || 'Shared')));
  if (x.location) lines.push('LOCATION:' + icsEscape(x.location));
  lines.push('END:VEVENT');
  return lines;
}
function buildICS(events) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Our Life//James + Keith//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const x of events) lines.push(...icsEventLines(x));
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}
function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime }), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const safeName = s => (s || 'event').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'event';
function addToCalendar(id) {
  const x = byId(id);
  if (!x?.date) return alert('This event needs a date.');
  download(safeName(x.title) + '.ics', buildICS([x]), 'text/calendar;charset=utf-8');
}
function exportUpcoming() {
  const ev = live().filter(x => x.type === 'Event' && x.date >= today()).sort(eventSort);
  if (!ev.length) return toast('No upcoming events to export.');
  download('our-life-upcoming.ics', buildICS(ev), 'text/calendar;charset=utf-8');
  toast(`Exported ${ev.length} event${ev.length === 1 ? '' : 's'}. Open the file to add them to your calendar.`);
}

// ---------------------------------------------------------------- Quick Add / Edit
function fillSelect(id, opts) { $(id).innerHTML = opts.map(o => `<option>${esc(o)}</option>`).join(''); }
const FIELD_IDS = ['titleInput','dateInput','notesInput','startTimeInput','endTimeInput','locationInput','caloriesInput','setsInput','repsInput','weightInput','durationInput','progressInput'];

function updateConditionalFields() {
  const t = $('type').value;
  if (!editingId && t === 'Workout' && !$('dateInput').value) $('dateInput').value = today();
  document.querySelectorAll('#itemForm [data-for]').forEach(el => { el.hidden = el.dataset.for !== t; });
  $('titleInput').placeholder = { Grocery: 'e.g. Cheddar cheese', Meal: 'e.g. Chicken tacos', Workout: 'e.g. 30 min run, Bench press', Event: 'e.g. Dinner with friends' }[t] || 'What do you need to remember?';
}

function openModal(id) {
  closeModals();
  $(id).classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeModals() {
  document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
  document.body.style.overflow = '';
}

function openItemModal({ type, id, date } = {}) {
  const x = id ? byId(id) : null;
  editingId = x ? x.id : null;
  FIELD_IDS.forEach(f => { $(f).value = ''; });
  $('modalTitle').textContent = x ? 'Edit' : 'Quick Add';
  $('type').value = x ? x.type : (TYPES.includes(type) ? type : 'Task');
  $('owner').value = x ? x.owner : $('viewer').value;
  $('departmentInput').value = DEPARTMENTS[0];
  $('brainCategoryInput').value = BRAIN_CATEGORIES[0];
  if (x) {
    $('titleInput').value = x.title; $('dateInput').value = x.date || ''; $('notesInput').value = x.notes || '';
    if (x.type === 'Event') { $('startTimeInput').value = x.startTime || ''; $('endTimeInput').value = x.endTime || ''; $('locationInput').value = x.location || ''; }
    if (x.type === 'Grocery') $('departmentInput').value = x.category;
    if (x.type === 'Idea') $('brainCategoryInput').value = x.category;
    if (x.type === 'Project') $('progressInput').value = x.progress ?? '';
    if (x.type === 'Workout') for (const k of ['calories','sets','reps','weight','duration']) $(k + 'Input').value = x[k] ?? '';
  } else if (date) $('dateInput').value = date;
  updateConditionalFields();
  openModal('modal');
  // Put the cursor in "What?" — unless the person already tapped into another field.
  setTimeout(() => { if (!$('itemForm').contains(document.activeElement)) $('titleInput').focus(); }, 30);
}

function saveItem(e) {
  e.preventDefault();
  const title = $('titleInput').value.trim(), t = $('type').value;
  if (!title) { alert('Please enter a title.'); return $('titleInput').focus(); }
  const base = editingId ? { ...byId(editingId) } : { id: newId(), done: false, createdAt: new Date().toISOString() };
  const it = { ...base, type: t, title, owner: $('owner').value, date: $('dateInput').value, notes: $('notesInput').value.trim() };
  if (t === 'Event') {
    if (!it.date) return alert('Events need a date.');
    it.startTime = $('startTimeInput').value; it.endTime = $('endTimeInput').value; it.location = $('locationInput').value.trim();
    if (it.endTime && !it.startTime) return alert('Please add a start time, or clear the end time for an all-day event.');
    if (it.startTime && it.endTime && it.endTime <= it.startTime) return alert('End time must be after start time.');
  }
  if (t === 'Grocery') it.category = $('departmentInput').value;     // manual department — never guessed
  if (t === 'Idea') it.category = $('brainCategoryInput').value;
  if (t === 'Project') it.progress = $('progressInput').value === '' ? null : Math.max(0, Math.min(100, Number($('progressInput').value) || 0));
  if (t === 'Workout') for (const k of ['calories','sets','reps','weight','duration']) it[k] = num($(k + 'Input').value);
  const clean = normalize(it);
  if (!clean) return alert('Something about this entry could not be saved.');
  const wasEditing = !!editingId;
  editingId = null;
  closeModals();
  commit(clean);
  toast(wasEditing ? 'Changes saved.' : `${t === 'Idea' ? 'Idea' : t} added.`);
}

function saveBrain() {
  const title = $('brainText').value.trim();
  if (!title) return $('brainText').focus();
  commit(normalize({ id: newId(), type: 'Idea', title, owner: $('viewer').value, date: today(), notes: '', category: $('brainInlineCategory').value, done: false, createdAt: new Date().toISOString() }));
  $('brainText').value = '';
  toast(`Saved under ${$('brainInlineCategory').value}.`);
}

function toggleDone(id) { const x = byId(id); if (x) commit({ ...x, done: !x.done }); }

function deleteItems(list, label) {
  if (!list.length) return;
  if (!confirm(label)) return;
  commit(list.map(x => ({ ...x, deleted: true })));
  const ids = list.map(x => x.id);
  toast(list.length === 1 ? 'Deleted.' : `Deleted ${list.length} items.`, 'Undo', () => {
    commit(ids.map(byId).filter(Boolean).map(x => ({ ...x, deleted: false })));
  });
}

// ---------------------------------------------------------------- backup
function exportJSON() {
  const payload = { app: 'Our Life', version: 2, exportedAt: new Date().toISOString(), items: live().map(({ deleted, ...x }) => x) };
  download(`our-life-backup-${today()}.json`, JSON.stringify(payload, null, 2), 'application/json');
}
function importJSON(file) {
  const r = new FileReader();
  r.onload = () => {
    let parsed;
    try { parsed = JSON.parse(r.result); } catch { return alert('That file is not a valid Our Life backup.'); }
    const list = readV1(Array.isArray(parsed) ? { items: parsed } : parsed);
    if (!list.length) return alert('No entries found in that file.');
    if (!confirm(`Restore ${list.length} item${list.length === 1 ? '' : 's'} from this backup?\n\nItems that already exist are updated. Nothing is deleted.`)) return;
    commit(list.map(x => ({ ...x, deleted: false })));
    toast(`Restored ${list.length} item${list.length === 1 ? '' : 's'}.`);
  };
  r.readAsText(file);
}

// ---------------------------------------------------------------- toast
let toastTimer;
function toast(msg, actionLabel, action) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast'; el.setAttribute('role', 'status');
  el.textContent = msg;
  if (actionLabel) {
    const b = document.createElement('button');
    b.textContent = actionLabel;
    b.style.cssText = 'margin-left:12px;background:#fff;color:#27364A;border:0;border-radius:10px;padding:5px 10px;font-weight:750';
    b.onclick = () => { el.remove(); action(); };
    el.appendChild(b);
  }
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), actionLabel ? 7000 : 2600);
}

// ---------------------------------------------------------------- navigation + events
function goTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === page));
  let secondary = false;
  document.querySelectorAll('#nav [data-page]').forEach(b => { const on = b.dataset.page === page; b.classList.toggle('active', on); if (on && b.classList.contains('secondary')) secondary = true; });
  document.querySelector('#nav .more-btn').classList.toggle('active', secondary);
  closeModals();
  window.scrollTo(0, 0);
  if (location.hash !== '#' + page) history.replaceState(null, '', '#' + page);
}

function wireEvents() {
  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-page]'); if (nav) return goTo(nav.dataset.page);
    const go = e.target.closest('[data-goto]'); if (go) return goTo(go.dataset.goto);
    const f = e.target.closest('[data-filter]'); if (f) { taskFilter = f.dataset.filter; return render(); }
    const wf = e.target.closest('[data-wfilter]'); if (wf) { workoutFilter = wf.dataset.wfilter; return render(); }
    if (e.target.classList.contains('modal')) return closeModals();   // tap the dimmed background to close
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.dataset.id;
    switch (b.dataset.act) {
      case 'add': return openItemModal({ type: b.dataset.type, date: b.dataset.date });
      case 'edit': return openItemModal({ id });
      case 'delete': { const x = byId(id); return x && deleteItems([x], `Delete "${x.title}"?`); }
      case 'ics': return addToCalendar(id);
      case 'close-modal': editingId = null; return closeModals();
      case 'open-more': return openModal('moreModal');
      case 'open-settings': return openModal('settingsModal');
      case 'save-brain': return saveBrain();
      case 'add-event-selected': return openItemModal({ type: 'Event', date: selectedCalendarDate });
      case 'day': { selectedCalendarDate = b.dataset.date; const d = parseDate(selectedCalendarDate); calendarCursor = new Date(d.getFullYear(), d.getMonth(), 1); return render(); }
      case 'month': calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + Number(b.dataset.n), 1); return render();
      case 'week': weekOffset = Number(b.dataset.n) === 0 ? 0 : weekOffset + Number(b.dataset.n); return render();
      case 'export-upcoming': return exportUpcoming();
      case 'export-json': return exportJSON();
      case 'import-json': return $('importFile').click();
      case 'clear-bought': { const done = live().filter(x => x.type === 'Grocery' && x.done); return done.length ? deleteItems(done, `Remove ${done.length} checked item${done.length === 1 ? '' : 's'} from the list?`) : toast('Nothing checked off yet.'); }
      case 'refresh': return fetchAll().then(ok => { flush(); toast(ok ? 'Up to date.' : 'Could not reach the database.'); });
      case 'import-local': return offerLocalImport(true);
      case 'sign-out': if (confirm('Sign out of Our Life on this device?')) cloud.sb.auth.signOut(); return;
    }
  });
  document.addEventListener('change', e => {
    if (e.target.matches('[data-act="toggle"]')) toggleDone(e.target.dataset.id);
  });
  $('type').addEventListener('change', updateConditionalFields);
  $('itemForm').addEventListener('submit', saveItem);
  $('viewer').addEventListener('change', () => { prefs.viewer = $('viewer').value; savePrefs(); render(); });
  $('importFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) importJSON(f); e.target.value = ''; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.querySelector('.modal.show')) { editingId = null; closeModals(); } });
  $('brainText').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveBrain(); });

  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    $('loginError').textContent = ''; $('loginBtn').disabled = true; $('loginBtn').textContent = 'Signing in…';
    const { data, error } = await cloud.sb.auth.signInWithPassword({ email: $('loginEmail').value.trim(), password: $('loginPassword').value });
    $('loginBtn').textContent = 'Sign in';
    if (error) return showLogin(error.message === 'Invalid login credentials' ? 'Email or password is incorrect.' : error.message);
    $('loginPassword').value = '';
    startCloud(data.user, true);
  });

  // Phones pause background tabs: catch up whenever the app comes back into view or reconnects.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (cloud.enabled && cloud.user) { fetchAll(); flush(); } if (today() !== lastRenderDay) render(); } });
  window.addEventListener('online', () => { if (cloud.enabled && cloud.user) { flush(); fetchAll(); } });
  window.addEventListener('offline', () => { if (cloud.enabled) setSync('offline', 'Offline — will sync'); });
  setInterval(() => { if (today() !== lastRenderDay) render(); }, 60000);

  // Other tab on the same device changed local data (local mode).
  window.addEventListener('storage', e => { if (!cloud.enabled && e.key === LOCAL_KEY) { items = readV1(readJSON(LOCAL_KEY, {})); render(); } });

  const start = location.hash.slice(1);
  if (document.getElementById(start)?.classList.contains('page')) goTo(start);
}

// Settings: show "copy older browser data" only in cloud mode when there is something to copy.
const settingsObserver = new MutationObserver(() => {
  if (!$('settingsModal').classList.contains('show') || !cloud.enabled) return;
  let btn = document.querySelector('[data-act="import-local"]');
  const has = localImportCandidates().length;
  if (has && !btn) $('accountBlock').querySelector('.hero-actions').insertAdjacentHTML('afterbegin', `<button class="ghost" data-act="import-local">Copy older entries from this browser (${has})</button>`);
});

document.addEventListener('DOMContentLoaded', () => {
  settingsObserver.observe($('settingsModal'), { attributes: true, attributeFilter: ['class'] });
  boot();
});

// Exposed for automated tests only.
window.__ourLife = { buildICS, normalize, readV1, get items() { return items; }, cloud };
})();
