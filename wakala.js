/* ===== WAKALA POINT — App Logic (Firebase Realtime Database) ===== */

// localStorage is still used to cache the *current session* only.
// All real data (users + requests) lives in Firebase Realtime Database.
const KEYS = {
  USER: 'wp_user',
};

/* ---------- Wait for firebase-init.js (loaded as a <script type="module">) ---------- */
function wpFirebaseReady() {
  if (window.__wpFirebase) return Promise.resolve(window.__wpFirebase);
  return new Promise((resolve) => {
    window.addEventListener('wp-firebase-ready', () => resolve(window.__wpFirebase), { once: true });
  });
}

/* ---------- Helpers ---------- */

// Generate unique ID (used for request display IDs)
function genId() {
  return 'WP' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();
}

// Format date in Swahili
function formatDate(dateStr) {
  const d = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ago', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/* ---------- Session (synchronous, cached locally) ---------- */

// Get current user (synchronous — reads cached session)
function getUser() {
  return JSON.parse(localStorage.getItem(KEYS.USER) || 'null');
}

// Save user session locally (cache only; source of truth is RTDB)
function saveUser(user) {
  localStorage.setItem(KEYS.USER, JSON.stringify(user));
}

function clearUser() {
  localStorage.removeItem(KEYS.USER);
  localStorage.removeItem('wakala_user');
}

/* ---------- Auth: Firebase Authentication (email/password + Google) ---------- */
/*
  Phone Auth requires Firebase's paid Blaze plan, so sign-in uses:
   - Email + password (Firebase Authentication)
   - Continue with Google (Firebase Authentication)
  "Namba ya Simu" is kept as a profile field in Realtime Database (users/{uid}),
  not as the sign-in credential.
*/

// Read or create the RTDB profile for a signed-in Firebase Auth user.
async function syncUserProfile(fbUser, extra) {
  const fb = await wpFirebaseReady();
  const userRef = fb.ref(fb.db, `users/${fbUser.uid}`);
  const snap = await fb.get(userRef);
  if (snap.exists()) {
    // Existing profile — return as-is (don't overwrite jina/simu/mkoa on every login).
    return { id: fbUser.uid, ...snap.val() };
  }
  // First time we see this Firebase Auth user — create their profile.
  const profile = {
    id: fbUser.uid,
    jina: (extra && extra.jina) || fbUser.displayName || 'Mteja',
    simu: (extra && extra.simu) || '',
    mkoa: (extra && extra.mkoa) || '',
    email: fbUser.email || '',
    isAdmin: false,
    createdAt: new Date().toISOString(),
  };
  await fb.set(userRef, profile);
  return profile;
}

// Register a new user with email + password. Returns the user profile object.
async function registerUser({ jina, simu, mkoa, email, pass }) {
  const fb = await wpFirebaseReady();
  let cred;
  try {
    cred = await fb.createUserWithEmailAndPassword(fb.auth, email, pass);
  } catch (e) {
    throw new Error(authErrorMessage(e));
  }
  if (jina) {
    try { await fb.updateProfile(cred.user, { displayName: jina }); } catch (e) { /* non-fatal */ }
  }
  return syncUserProfile(cred.user, { jina, simu, mkoa });
}

// Log in with email + password. Returns the user profile object.
async function loginUser(email, pass) {
  const fb = await wpFirebaseReady();
  let cred;
  try {
    cred = await fb.signInWithEmailAndPassword(fb.auth, email, pass);
  } catch (e) {
    throw new Error(authErrorMessage(e));
  }
  return syncUserProfile(cred.user);
}

// Continue with Google. Returns the user profile object.
async function loginWithGoogle() {
  const fb = await wpFirebaseReady();
  let cred;
  try {
    cred = await fb.signInWithPopup(fb.auth, fb.googleProvider);
  } catch (e) {
    throw new Error(authErrorMessage(e));
  }
  return syncUserProfile(cred.user);
}

// Translate common Firebase Auth error codes into Swahili messages.
function authErrorMessage(e) {
  const code = e && e.code;
  const map = {
    'auth/email-already-in-use': 'Barua pepe hii tayari imesajiliwa. Tafadhali ingia.',
    'auth/invalid-email': 'Barua pepe si sahihi.',
    'auth/weak-password': 'Nenosiri ni hafifu. Tumia angalau herufi 6.',
    'auth/user-not-found': 'Akaunti haipo. Tafadhali jiandikishe kwanza.',
    'auth/wrong-password': 'Barua pepe au nenosiri si sahihi.',
    'auth/invalid-credential': 'Barua pepe au nenosiri si sahihi.',
    'auth/too-many-requests': 'Majaribio mengi yameshindwa. Tafadhali subiri kidogo kisha jaribu tena.',
    'auth/popup-closed-by-user': 'Umefunga dirisha la Google kabla ya kukamilisha.',
    'auth/network-request-failed': 'Hitilafu ya mtandao. Hakikisha intaneti yako inafanya kazi.',
  };
  return map[code] || 'Hitilafu imetokea. Tafadhali jaribu tena.';
}

/* ---------- Requests (Realtime Database) ---------- */

// Get all requests (admin use) — returns an array, newest first
async function getRequests() {
  const fb = await wpFirebaseReady();
  const snap = await fb.get(fb.ref(fb.db, 'requests'));
  if (!snap.exists()) return [];
  const obj = snap.val();
  return Object.keys(obj)
    .map((key) => ({ ...obj[key], _key: key }))
    .sort((a, b) => new Date(b.tarehe) - new Date(a.tarehe));
}

// Get a single request by its display id (e.g. "WPABC123")
async function getRequestById(id) {
  const all = await getRequests();
  return all.find((r) => r.id === id) || null;
}

// Get current user's requests only — returns an array, newest first
async function getUserRequests() {
  const user = getUser();
  if (!user) return [];
  const fb = await wpFirebaseReady();
  const q = fb.query(fb.ref(fb.db, 'requests'), fb.orderByChild('userId'), fb.equalTo(user.id));
  const snap = await fb.get(q);
  if (!snap.exists()) return [];
  const obj = snap.val();
  return Object.keys(obj)
    .map((key) => ({ ...obj[key], _key: key }))
    .sort((a, b) => new Date(b.tarehe) - new Date(a.tarehe));
}

// Submit a new request — writes to Realtime Database
async function submitRequest(type, details) {
  const user = getUser();
  if (!user) { window.location.href = 'login.html'; return; }
  const fb = await wpFirebaseReady();
  const requestsRef = fb.ref(fb.db, 'requests');
  const newRef = fb.push(requestsRef);
  const nowIso = new Date().toISOString();
  const newReq = {
    id: genId(),
    userId: user.id,
    userName: user.jina,
    userPhone: user.simu,
    type,
    details,
    status: 'pending',
    tarehe: nowIso,
    updatedAt: nowIso,
    adminNote: '',
  };
  await fb.set(newRef, newReq);
  return { ...newReq, _key: newRef.key };
}

// Admin: update a request's status + note. Needs the Firebase push key (_key) of the request.
async function updateRequest(_key, { status, adminNote }) {
  const fb = await wpFirebaseReady();
  await fb.update(fb.ref(fb.db, `requests/${_key}`), {
    status,
    adminNote,
    updatedAt: new Date().toISOString(),
  });
}

/* ---------- Labels ---------- */

// Status label in Swahili
function statusLabel(status) {
  const map = { pending: 'Inasubiri', approved: 'Imekubaliwa', rejected: 'Imekataliwa', processing: 'Inashughulikiwa' };
  return map[status] || status;
}

// Status badge HTML
function statusBadge(status) {
  return `<span class="badge-${status}">${statusLabel(status)}</span>`;
}

// Service type label
function serviceLabel(type) {
  const map = { 'lipa-namba': 'Lipa Namba', 'till-uwakala': 'Till ya Uwakala' };
  return map[type] || type;
}

/* ---------- Guards ---------- */

// Auth guard — redirect to login if not logged in
function requireAuth() {
  if (!getUser()) { window.location.href = 'login.html'; return false; }
  return true;
}

// Admin guard
function requireAdmin() {
  const user = getUser();
  if (!user || !user.isAdmin) { window.location.href = 'login.html'; return false; }
  return true;
}

// Logout — signs out of Firebase Auth and clears local session cache
async function logout() {
  clearUser();
  try {
    const fb = await wpFirebaseReady();
    await fb.signOut(fb.auth);
  } catch (e) { /* ignore — local session is already cleared */ }
  window.location.href = 'login.html';
}

/* ---------- On DOM ready ---------- */
document.addEventListener('DOMContentLoaded', function () {
  // Preloader
  setTimeout(() => {
    const pre = document.querySelector('.preload-container');
    if (pre) pre.style.display = 'none';
  }, 800);
});
