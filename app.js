// ═══════════════════════════════════════════════
//  DATA
// ═══════════════════════════════════════════════
let sets = JSON.parse(localStorage.getItem('prac-sets') || '[]');
let editId = null;
let supportMode = 'site';

// Practice state
let cards = [], cardIdx = 0;
let dirFrom = 'zh', dirTo = 'en';

// Canvas
let canvas, ctx, drawing = false, lx = 0, ly = 0;

// Typing — pure buffer, never read from DOM input value
let typedBuffer = '';
let candTimer = null;

// Auth
let currentUser = null;
let authMode = 'signin'; // signin | register

function save() { localStorage.setItem('prac-sets', JSON.stringify(sets)); }

// ═══════════════════════════════════════════════
//  NAV
// ═══════════════════════════════════════════════
function showPanel(name, btn) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  btn.classList.add('active');
  if (name === 'practice') refreshPracticeSelects();
  if (name === 'sets') renderSets();
  if (name === 'settings') renderAuthStatus();
}

// ═══════════════════════════════════════════════
//  THEME
// ═══════════════════════════════════════════════
function setTheme(t, btn) {
  document.body.setAttribute('data-theme', t);
  document.querySelectorAll('.theme-opt').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (ctx) updateCtxStyle();
}

// ═══════════════════════════════════════════════
//  SETS
// ═══════════════════════════════════════════════
function renderSets() {
  const el = document.getElementById('sets-list');
  if (!sets.length) {
    el.innerHTML = '<div class="empty-state">No sets yet.</div>';
    return;
  }
  el.innerHTML = sets.map(s => `
    <div class="set-item">
      <div class="set-info">
        <div class="set-name">${s.name}</div>
        <div class="set-count">${s.words.length} word${s.words.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="set-actions">
        <button class="set-action" onclick="editSet('${s.id}')">Edit</button>
        <button class="set-action danger" onclick="delSet('${s.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function openModal() {
  editId = null;
  document.getElementById('modal-title').textContent = 'Create set';
  document.getElementById('modal-name').value = '';
  document.getElementById('word-rows').innerHTML = '';
  addRow(); addRow(); addRow();
  document.getElementById('modal').classList.add('open');

  // Focus set name, then Enter moves to first word
  setTimeout(() => document.getElementById('modal-name').focus(), 80);
}

function editSet(id) {
  const s = sets.find(x => x.id === id);
  if (!s) return;
  editId = id;
  document.getElementById('modal-title').textContent = 'Edit set';
  document.getElementById('modal-name').value = s.name;
  document.getElementById('word-rows').innerHTML = '';
  s.words.forEach(w => addRow(w));
  document.getElementById('modal').classList.add('open');
}

function delSet(id) {
  sets = sets.filter(s => s.id !== id);
  save();
  renderSets();
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
}

// ─── Add word row ───────────────────────────────
function addRow(w = {}) {
  const row = document.createElement('div');
  row.className = 'word-entry-row';

  const zhInput = document.createElement('input');
  zhInput.className = 'word-field zh-field';
  zhInput.placeholder = '汉字';
  zhInput.value = w.zh || '';
  zhInput.dataset.f = 'zh';

  const pyInput = document.createElement('input');
  pyInput.className = 'word-field';
  pyInput.placeholder = 'pīnyīn';
  pyInput.value = w.py || '';
  pyInput.dataset.f = 'py';

  const enInput = document.createElement('input');
  enInput.className = 'word-field';
  enInput.placeholder = 'english';
  enInput.value = w.en || '';
  enInput.dataset.f = 'en';

  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-word';
  removeBtn.textContent = '×';
  removeBtn.onclick = () => row.remove();

  row.appendChild(zhInput);
  row.appendChild(pyInput);
  row.appendChild(enInput);
  row.appendChild(removeBtn);
  document.getElementById('word-rows').appendChild(row);

  // Auto-fill pinyin + english when chinese is entered and fields are empty
  let zhTimer = null;
  zhInput.addEventListener('input', () => {
    clearTimeout(zhTimer);
    const val = zhInput.value.trim();
    if (!val) return;
    zhTimer = setTimeout(() => autoFill(val, pyInput, enInput), 600);
  });

  // Enter key in any field: if on last row's last field, add new row; else move forward
  [zhInput, pyInput, enInput].forEach((inp, i) => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const allRows = [...document.querySelectorAll('.word-entry-row')];
        const isLastRow = row === allRows[allRows.length - 1];
        const isLastField = i === 2;

        if (isLastRow && isLastField) {
          addRow();
          // Focus the zh field of the new last row
          const newRows = [...document.querySelectorAll('.word-entry-row')];
          newRows[newRows.length - 1].querySelector('[data-f=zh]').focus();
        } else if (isLastField) {
          // Move to zh of next row
          const rowIdx = allRows.indexOf(row);
          allRows[rowIdx + 1]?.querySelector('[data-f=zh]')?.focus();
        } else {
          // Move to next field in same row
          [zhInput, pyInput, enInput][i + 1].focus();
        }
      }
    });
  });

  return row;
}

// ─── Auto-fill via Claude API ───────────────────
async function autoFill(zh, pyInput, enInput) {
  if (pyInput.value.trim() && enInput.value.trim()) return; // both already filled
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        system: 'Return ONLY JSON, no markdown, no explanation: {"py":"pinyin with tone marks","en":"english translation"}. Give the standard pinyin (with diacritics) and a short English translation for the Chinese input.',
        messages: [{ role: 'user', content: zh }]
      })
    });
    const data = await res.json();
    const text = data.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    if (!pyInput.value.trim() && parsed.py) pyInput.value = parsed.py;
    if (!enInput.value.trim() && parsed.en) enInput.value = parsed.en;
  } catch (e) { /* silent fail */ }
}

function saveSet() {
  const name = document.getElementById('modal-name').value.trim();
  if (!name) return;
  const words = [];
  document.querySelectorAll('.word-entry-row').forEach(row => {
    const zh = row.querySelector('[data-f=zh]').value.trim();
    const py = row.querySelector('[data-f=py]').value.trim();
    const en = row.querySelector('[data-f=en]').value.trim();
    if (zh || py || en) words.push({ zh, py, en });
  });
  if (editId) {
    const s = sets.find(x => x.id === editId);
    s.name = name;
    s.words = words;
  } else {
    sets.push({ id: Date.now() + '', name, words });
  }
  save();
  renderSets();
  closeModal();
}

// ═══════════════════════════════════════════════
//  PRACTICE SETUP
// ═══════════════════════════════════════════════
function refreshPracticeSelects() {
  const sel = document.getElementById('prac-set');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Select a set</option>';
  sets.forEach(s => {
    sel.innerHTML += `<option value="${s.id}"${s.id === cur ? ' selected' : ''}>${s.name}</option>`;
  });
}

// Prevent same-same direction
document.addEventListener('DOMContentLoaded', () => {
  const fromSel = document.getElementById('dir-from');
  const toSel   = document.getElementById('dir-to');

  function syncDirections(changed) {
    if (fromSel.value === toSel.value) {
      const others = ['zh','py','en'].filter(v => v !== changed.value);
      // set the OTHER select to the first available option
      const other = changed === fromSel ? toSel : fromSel;
      other.value = others[0];
    }
  }

  fromSel.addEventListener('change', () => syncDirections(fromSel));
  toSel.addEventListener('change',   () => syncDirections(toSel));
});

function setSupport(mode, btn) {
  supportMode = mode;
  document.querySelectorAll('.toggle-opt').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('support-desc').textContent = mode === 'site'
    ? 'Site converts your typing to Chinese — type pinyin and pick from candidates.'
    : 'You handle Chinese input with your own keyboard or IME.';
}

function beginPractice() {
  const setId = document.getElementById('prac-set').value;
  if (!setId) return;
  const set = sets.find(s => s.id === setId);
  if (!set || !set.words.length) return;

  dirFrom = document.getElementById('dir-from').value;
  dirTo   = document.getElementById('dir-to').value;
  if (dirFrom === dirTo) return;

  cards = [...set.words].sort(() => Math.random() - 0.5);
  cardIdx = 0;

  document.getElementById('main').classList.add('hidden');
  document.getElementById('practice-screen').classList.remove('hidden');

  initCanvas();
  showCard();
  attachKeyboard();
}

// ═══════════════════════════════════════════════
//  PRACTICE SCREEN
// ═══════════════════════════════════════════════
function showCard() {
  const w = cards[cardIdx];
  const promptText = dirFrom === 'zh' ? w.zh : dirFrom === 'py' ? w.py : w.en;
  const hintText   = dirTo === 'zh'   ? 'write chinese'
                   : dirTo === 'py'   ? 'write pinyin'
                   :                    'write english';

  const el = document.getElementById('p-prompt');
  el.textContent = promptText;
  el.className = 'p-prompt' + (dirFrom !== 'zh' ? ' roman' : '');
  document.getElementById('p-hint').textContent = hintText;

  const tc = document.getElementById('typed-chars');
  tc.className = 'typed-chars' + (dirTo !== 'zh' ? ' roman' : '');

  clearAnswer();
}

function nextCard() {
  cardIdx = (cardIdx + 1) % cards.length;
  showCard();
}

function exitPractice() {
  document.getElementById('practice-screen').classList.add('hidden');
  document.getElementById('main').classList.remove('hidden');
  clearAnswer();
  detachKeyboard();
}

function clearAnswer() {
  typedBuffer = '';
  const tc = document.getElementById('typed-chars');
  tc.textContent = '';
  tc.classList.remove('visible');
  document.getElementById('cand-bar').innerHTML = '';
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// ═══════════════════════════════════════════════
//  CANVAS
// ═══════════════════════════════════════════════
function initCanvas() {
  const zone = document.getElementById('answer-zone');
  const old = document.getElementById('answer-canvas');
  // Replace to wipe all old listeners
  const fresh = document.createElement('canvas');
  fresh.id = 'answer-canvas';
  zone.replaceChild(fresh, old);
  canvas = fresh;

  resizeCanvas();
  ctx = canvas.getContext('2d');
  updateCtxStyle();

  canvas.addEventListener('mousedown',  startDraw);
  canvas.addEventListener('mousemove',  moveDraw);
  canvas.addEventListener('mouseup',    endDraw);
  canvas.addEventListener('mouseleave', endDraw);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); startDraw(e.touches[0]); }, { passive: false });
  canvas.addEventListener('touchmove',  e => { e.preventDefault(); moveDraw(e.touches[0]); },  { passive: false });
  canvas.addEventListener('touchend',   e => { e.preventDefault(); endDraw(); },                { passive: false });
  window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
  if (!canvas) return;
  const r = canvas.parentElement.getBoundingClientRect();
  canvas.width  = r.width;
  canvas.height = r.height;
  if (ctx) updateCtxStyle();
}

function updateCtxStyle() {
  const light = document.body.getAttribute('data-theme') === 'light';
  ctx.strokeStyle = light ? '#18170f' : '#e8e5de';
  ctx.lineCap  = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2;
}

function getPos(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (canvas.width  / r.width),
    y: (e.clientY - r.top)  * (canvas.height / r.height)
  };
}

function startDraw(e) {
  drawing = true;
  // Clear typed buffer when drawing starts
  if (typedBuffer) {
    typedBuffer = '';
    renderTyped();
  }
  const p = getPos(e);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  lx = p.x; ly = p.y;
}

function moveDraw(e) {
  if (!drawing) return;
  const p = getPos(e);
  // Smooth quadratic curve between points
  const mx = (lx + p.x) / 2;
  const my = (ly + p.y) / 2;
  ctx.quadraticCurveTo(lx, ly, mx, my);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(mx, my);
  lx = p.x; ly = p.y;
}

function endDraw() {
  if (!drawing) return;
  drawing = false;
  ctx.lineTo(lx, ly);
  ctx.stroke();
}

// ═══════════════════════════════════════════════
//  KEYBOARD — pure keydown approach, no hidden input value reading
//
//  Why: reading .value from a hidden input causes bugs because:
//  1. IME composition fires extra events
//  2. Backspace keydown fires, THEN input event fires with '' appended
//  3. The .value accumulates strangely across focus cycles
//
//  Fix: intercept every key in keydown, build typedBuffer ourselves,
//  preventDefault on everything we handle so no input event fires.
// ═══════════════════════════════════════════════
function attachKeyboard() {
  document.addEventListener('keydown', handleKey);
}

function detachKeyboard() {
  document.removeEventListener('keydown', handleKey);
}

function handleKey(e) {
  // Don't intercept if a modal is open or focus is in a real input
  if (document.querySelector('.modal-overlay.open')) return;
  const tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  // Don't intercept browser shortcuts
  if (e.metaKey || e.ctrlKey) return;

  if (e.key === 'Enter') {
    e.preventDefault();
    nextCard();
    return;
  }

  if (e.key === 'Backspace') {
    e.preventDefault();
    if (typedBuffer.length > 0) {
      // Remove last character — handle multi-byte (emoji/CJK) safely
      typedBuffer = [...typedBuffer].slice(0, -1).join('');
      renderTyped();
      if (shouldShowCandidates()) queueCandidates();
    }
    return;
  }

  // Printable characters: single char keys
  if (e.key.length === 1) {
    e.preventDefault();
    // Clear canvas when typing starts
    if (typedBuffer === '' && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    typedBuffer += e.key;
    renderTyped();
    if (shouldShowCandidates()) queueCandidates();
    return;
  }

  // Space
  if (e.key === ' ') {
    e.preventDefault();
    typedBuffer += ' ';
    renderTyped();
    return;
  }
}

// For mobile/IME users who need to use a real input field for composition
// We also listen to a visible-but-transparent overlay input on mobile
function setupMobileInput() {
  // On touch devices, tap the answer zone to open a native input prompt
  // This is handled via a separate visible-but-opacity-0 input overlaid
  // on the answer zone — see the IME note below.
  // For now the document keydown listener covers desktop.
  // Mobile Chinese users will use their OS IME via the canvas tap listener below.
  document.getElementById('answer-zone').addEventListener('click', () => {
    if (/Mobi|Android/i.test(navigator.userAgent)) {
      const val = prompt('Type your answer:');
      if (val !== null) {
        typedBuffer = val;
        renderTyped();
      }
    }
  });
}

function renderTyped() {
  const el = document.getElementById('typed-chars');
  if (typedBuffer) {
    el.textContent = typedBuffer;
    el.classList.add('visible');
  } else {
    el.textContent = '';
    el.classList.remove('visible');
    document.getElementById('cand-bar').innerHTML = '';
  }
}

function shouldShowCandidates() {
  return supportMode === 'site' && dirTo === 'zh' && typedBuffer.trim().length > 0;
}

// ═══════════════════════════════════════════════
//  CANDIDATES (site mode, answer is Chinese)
// ═══════════════════════════════════════════════
function queueCandidates() {
  clearTimeout(candTimer);
  candTimer = setTimeout(() => fetchCandidates(typedBuffer), 420);
}

async function fetchCandidates(input) {
  const bar = document.getElementById('cand-bar');
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        system: 'Chinese IME. Return ONLY JSON, no markdown: {"c":["候选1","候选2","候选3","候选4","候选5"]}. Give 5 Chinese character/word candidates for the pinyin input. Most common first.',
        messages: [{ role: 'user', content: input }]
      })
    });
    const data = await res.json();
    const text = data.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    bar.innerHTML = '';
    parsed.c.forEach(ch => {
      const btn = document.createElement('button');
      btn.className = 'candidate';
      btn.textContent = ch;
      btn.addEventListener('mousedown', e => {
        e.preventDefault(); // don't blur document focus
        typedBuffer = ch;
        renderTyped();
        bar.innerHTML = '';
      });
      bar.appendChild(btn);
    });
  } catch (e) {
    bar.innerHTML = '';
  }
}

// ═══════════════════════════════════════════════
//  AUTH — client-side only (localStorage)
//  Note: This is NOT secure server-side auth.
//  Passwords are hashed with SHA-256 before storing,
//  but this is a frontend-only app. See README for
//  guidance on adding real backend auth.
// ═══════════════════════════════════════════════
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getUsers() {
  return JSON.parse(localStorage.getItem('prac-users') || '{}');
}

function saveUsers(users) {
  localStorage.setItem('prac-users', JSON.stringify(users));
}

function renderAuthStatus() {
  const el = document.getElementById('auth-status');
  const btn = document.getElementById('sign-in-btn');
  if (currentUser) {
    el.textContent = `Signed in as ${currentUser}`;
    btn.textContent = 'Sign out';
    btn.onclick = signOut;
  } else {
    el.textContent = '';
    btn.textContent = 'Sign in';
    btn.onclick = openAuthModal;
  }
}

function openAuthModal() {
  authMode = 'signin';
  document.getElementById('auth-modal-title').textContent = 'Sign in';
  document.getElementById('auth-submit-btn').textContent = 'Sign in';
  document.getElementById('auth-toggle-label').textContent = 'Need an account? Register';
  document.getElementById('auth-username').value = '';
  document.getElementById('auth-password').value = '';
  document.getElementById('auth-error').textContent = '';
  document.getElementById('auth-modal').classList.add('open');
  setTimeout(() => document.getElementById('auth-username').focus(), 80);
}

function closeAuthModal() {
  document.getElementById('auth-modal').classList.remove('open');
}

function toggleAuthMode() {
  authMode = authMode === 'signin' ? 'register' : 'signin';
  const isReg = authMode === 'register';
  document.getElementById('auth-modal-title').textContent = isReg ? 'Register' : 'Sign in';
  document.getElementById('auth-submit-btn').textContent  = isReg ? 'Register' : 'Sign in';
  document.getElementById('auth-toggle-label').textContent = isReg
    ? 'Have an account? Sign in'
    : 'Need an account? Register';
  document.getElementById('auth-error').textContent = '';
}

async function submitAuth() {
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl    = document.getElementById('auth-error');

  if (!username || !password) { errEl.textContent = 'Fill in both fields.'; return; }

  const hash  = await sha256(password);
  const users = getUsers();

  if (authMode === 'register') {
    if (users[username]) { errEl.textContent = 'Username already taken.'; return; }
    users[username] = { hash };
    saveUsers(users);
    currentUser = username;
    closeAuthModal();
    renderAuthStatus();
    return;
  }

  // Sign in
  if (!users[username] || users[username].hash !== hash) {
    errEl.textContent = 'Invalid username or password.';
    return;
  }
  currentUser = username;
  closeAuthModal();
  renderAuthStatus();
}

function signOut() {
  currentUser = null;
  renderAuthStatus();
}

// Allow Enter key in auth modal
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('auth-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitAuth();
  });

  renderSets();
  renderAuthStatus();
});
