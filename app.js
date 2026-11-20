import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, set, update, get, onValue, onDisconnect, query, limitToLast, push, remove, onChildAdded, onChildRemoved } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBk0TzSvq4T4f27RbCUtHblQxvmkAI0dHE",
  authDomain: "hezz-gg.firebaseapp.com",
  databaseURL: "https://hezz-gg-default-rtdb.firebaseio.com",
  projectId: "hezz-gg",
  storageBucket: "hezz-gg.firebasestorage.app",
  messagingSenderId: "944032998353",
  appId: "1:944032998353:web:e5b079c669c2f6f3a736f0"
};

const SIDEBAR_W      = 280;
const MAX_FILE_SIZE  = 5 * 1024 * 1024;
const TTL_OFFLINE_MS = 30 * 60 * 1000;
const HEARTBEAT_MS   = 60 * 1000;
const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' fill='%23d6e4f0'/%3E%3Ccircle cx='20' cy='16' r='7' fill='%23e8b923'/%3E%3Cpath d='M6 40c2-8 8-12 14-12s12 4 14 12z' fill='%23e8b923'/%3E%3C/svg%3E";

let currentUser = null;
let userProfile = {};
let isSidebarOpen = false;
let heartbeatInt = null;
let profileUnsub = null;
let currentCommunityId = null;
let communityUnsub = null;
let currentDmUid = null;
let dmUnsub = null;
let friendsMap = {};
let friendsUnsub = null;
let requestsUnsub = null;
let communitiesUnsub = null;
let callsUnsub = null;
let editProof = "";
let editCommunityAvatar = "";
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let recordTimer = null;

const $ = (id) => document.getElementById(id);
const sidebar    = $("sidebar");
const dragHandle = $("drag-handle");
const profileCard = $("profile-card");
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, t => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[t]));

let app, auth, db;
try {
  app  = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db   = getDatabase(app);
} catch (e) {
  console.error("[HEZZ] Falha ao inicializar Firebase:", e);
  showErrorBanner("Falha ao inicializar Firebase: " + e.message);
}

function showErrorBanner(msg){
  const banner = $("firebase-error-banner");
  if (!banner) return;
  $("firebase-error-text").textContent = msg;
  banner.classList.remove("hidden");
}

window.closeView = function(viewId) {
  $(viewId).classList.remove("active");
  if (viewId === 'view-chat' && communityUnsub) { communityUnsub(); communityUnsub = null; currentCommunityId = null; }
  if (viewId === 'view-dm' && dmUnsub) { dmUnsub(); dmUnsub = null; currentDmUid = null; }
};
function closeAllViews(){ document.querySelectorAll('.view').forEach(v => v.classList.remove('active')); }
function openView(viewId) { document.querySelectorAll('.view').forEach(v => v.classList.remove('active')); $(viewId).classList.add('active'); }

function setOffset(px, animate = true) {
  document.documentElement.style.setProperty("--so", `${px}px`);
  if (!animate) { sidebar.classList.add("no-trans"); dragHandle.classList.add("no-trans"); }
  else { sidebar.classList.remove("no-trans"); dragHandle.classList.remove("no-trans"); }
}
function setOpen(open) { isSidebarOpen = open; setOffset(open ? SIDEBAR_W : 0, true); }
let drag = { active:false, startX:0, startOffset:0, moved:false };
dragHandle.addEventListener("pointerdown", (e) => {
  drag.active = true; drag.moved = false;
  drag.startX = e.clientX;
  drag.startOffset = isSidebarOpen ? SIDEBAR_W : 0;
  setOffset(drag.startOffset, false);
  dragHandle.setPointerCapture(e.pointerId);
  e.preventDefault();
});
window.addEventListener("pointermove", (e) => {
  if (!drag.active) return;
  const delta = e.clientX - drag.startX;
  if (Math.abs(delta) > 4) drag.moved = true;
  setOffset(Math.max(0, Math.min(SIDEBAR_W, drag.startOffset + delta)), false);
});
window.addEventListener("pointerup", (e) => {
  if (!drag.active) return;
  drag.active = false;
  if (!drag.moved) setOpen(!isSidebarOpen);
  else setOpen(drag.startOffset + (e.clientX - drag.startX) > SIDEBAR_W / 2);
});

let toastTimer = null;
function showToast(msg){
  $("toast-text").textContent = msg;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2600);
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    const nav = item.dataset.nav;
    if (nav === 'home') closeAllViews();
    else if (nav === 'messages') openView('view-messages');
    else if (nav === 'friends') openView('view-friends');
    else if (nav === 'calls') openView('view-calls');
    else if (nav === 'settings') openSettings();
    setOpen(false);
  });
});

if (auth) {
  const tryAuth = (fn) => async () => { $("login-err").textContent = ""; try { await fn(); } catch (e) { $("login-err").textContent = e.code || e.message; } };
  const cred = () => [$("login-email").value.trim(), $("login-pass").value];
  $("login-btn").onclick  = tryAuth(() => signInWithEmailAndPassword(auth, ...cred()));
  $("signup-btn").onclick = tryAuth(() => createUserWithEmailAndPassword(auth, ...cred()));
  $("google-btn").onclick = tryAuth(() => signInWithPopup(auth, new GoogleAuthProvider()));
  $("anon-btn").onclick   = tryAuth(() => signInAnonymously(auth));
  const t0 = Date.now();
  const hideSplash = () => setTimeout(() => { const s = $("splash"); if (!s) return; s.style.opacity = 0; setTimeout(() => s.remove(), 500); }, Math.max(0, 1500 - (Date.now() - t0)));
  onAuthStateChanged(auth, async (user) => {
    hideSplash();
    $("login-overlay").style.display = user ? "none" : "grid";
    if (!user) { currentUser = null; return; }
    currentUser = user;
    try {
      await ensureUserDoc(user.uid);
      startHeartbeat(user.uid);
      setupDisconnect(user.uid);
      subscribeProfile(user.uid);
      subscribeFriends(user.uid);
      subscribeRequests(user.uid);
      subscribeCommunities(user.uid);
      subscribeCalls(user.uid);
      const myIdEl = $("my-id-short");
      if (myIdEl) { myIdEl.textContent = user.uid.slice(0, 10) + "…"; myIdEl.onclick = () => copyText(user.uid); }
    } catch (err) { showErrorBanner("Erro no banco: " + (err.code || err.message)); }
  });
}

async function ensureUserDoc(uid){
  const userRef = ref(db, `users/${uid}`);
  const snap = await get(userRef);
  if (!snap.exists()){
    await set(userRef, {
      uid, nick: "Anônimo_" + uid.slice(0,4), bio: "", status: "", state: "online",
      avatarUrl: "", bannerUrl: "",
      gradientEnabled: false, gradientTop: "#d6e4f0", gradientBottom: "#f0d9e8",
      isAnonymous: !!auth.currentUser?.isAnonymous, plan: "free", pulsePending: false, revokePending: false,
      privacy: { friendRequests: "all" },
      createdAt: Date.now(), lastSeen: Date.now(), expireAt: Date.now() + TTL_OFFLINE_MS
    });
  } else {
    await update(userRef, { lastSeen: Date.now(), expireAt: Date.now() + TTL_OFFLINE_MS });
  }
}
function startHeartbeat(uid){
  if (heartbeatInt) clearInterval(heartbeatInt);
  heartbeatInt = setInterval(() => {
    if (!currentUser) return;
    update(ref(db, `users/${uid}`), { lastSeen: Date.now(), expireAt: Date.now() + TTL_OFFLINE_MS }).catch(() => {});
  }, HEARTBEAT_MS);
}
function setupDisconnect(uid){
  onDisconnect(ref(db, `users/${uid}/expireAt`)).set(Date.now() + TTL_OFFLINE_MS);
  onDisconnect(ref(db, `users/${uid}/lastSeen`)).set(Date.now());
}
function subscribeProfile(uid){
  if (profileUnsub) profileUnsub();
  profileUnsub = onValue(ref(db, `users/${uid}`), (snap) => {
    userProfile = snap.val() || {};
    renderProfile(userProfile);
  });
}
function renderProfile(d){
  $("sidebar-nick").textContent = d.nick || "Anônimo";
  $("sidebar-status-text").textContent = d.status || labelState(d.state);
  if (d.avatarUrl) $("sidebar-avatar").src = d.avatarUrl;
  $("sidebar-state-dot").className = "avatar-state " + (d.state || "offline");
  $("sidebar-badge").style.display = (d.plan === "pulse") ? "inline-block" : "none";
  const privacySel = $("privacy-friend-requests");
  if (privacySel) privacySel.value = (d.privacy && d.privacy.friendRequests) || "all";
  renderAccount();
  renderPlanState();
  refreshEmojiPickers();
}
function labelState(s){
  if (s === "online") return "Online";
  if (s === "disabled") return "Desativado";
  return "Offline";
}

profileCard.addEventListener("click", () => {
  if (!currentUser) { showToast("Aguarde conectar..."); return; }
  loadProfileIntoForm();
  openView('view-profile');
});

function applyPreview(){
  const banner = $("banner-url").value.trim();
  const avatar = $("avatar-url").value.trim();
  const useGrad = $("gradient-toggle").checked;
  const gTop = $("gradient-top").value;
  const gBot = $("gradient-bottom").value;
  const pBanner = $("preview-banner");
  if (useGrad) {
    pBanner.style.backgroundImage = "none";
    pBanner.style.background = `linear-gradient(to bottom, ${gTop}, ${gBot})`;
  } else if (banner) {
    pBanner.style.background = "";
    pBanner.style.backgroundImage = `url("${banner}")`;
  } else {
    pBanner.style.backgroundImage = "";
    pBanner.style.background = "var(--pastel-pink)";
  }
  if (avatar) $("preview-avatar").src = avatar;
  else $("preview-avatar").src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' fill='%23d9ead3'/%3E%3Ccircle cx='40' cy='32' r='14' fill='%23e8b923'/%3E%3Cpath d='M12 80c4-16 16-24 28-24s24 8 28 24z' fill='%23e8b923'/%3E%3C/svg%3E";
}
['banner-url', 'avatar-url', 'gradient-top', 'gradient-bottom'].forEach(id => {
  $(id).addEventListener("input", applyPreview);
});
$("gradient-toggle").addEventListener("change", applyPreview);

function loadProfileIntoForm(){
  const d = userProfile || {};
  $("nick-input").value = d.nick || "";
  $("bio-input").value = d.bio || "";
  $("state-input").value = d.state || "online";
  $("status-input").value = d.status || "";
  $("banner-url").value = d.bannerUrl || "";
  $("avatar-url").value = d.avatarUrl || "";
  $("gradient-toggle").checked = d.gradientEnabled || false;
  $("gradient-top").value = d.gradientTop || "#d6e4f0";
  $("gradient-bottom").value = d.gradientBottom || "#f0d9e8";
  applyPreview();
}

$("save-profile-btn").addEventListener("click", async () => {
  if (!currentUser) return;
  const payload = {
    nick: $("nick-input").value.trim() || "Anônimo",
    bio: $("bio-input").value.trim(),
    state: $("state-input").value,
    status: $("status-input").value.trim(),
    bannerUrl: $("banner-url").value.trim(),
    avatarUrl: $("avatar-url").value.trim(),
    gradientEnabled: $("gradient-toggle").checked,
    gradientTop: $("gradient-top").value,
    gradientBottom: $("gradient-bottom").value,
    lastSeen: Date.now(),
    expireAt: Date.now() + TTL_OFFLINE_MS
  };
  try {
    await update(ref(db, `users/${currentUser.uid}`), payload);
    showToast("Perfil salvo!");
    closeView('view-profile');
  } catch (err) { showToast("Erro ao salvar: " + err.message); }
});

function isPulse(){ return (userProfile.plan || 'free') === 'pulse'; }
function maxUploadMB(){ return isPulse() ? 10 : 5; }
function maxAudioSec(){ return isPulse() ? 300 : 60; }
function maxCommunities(){ return isPulse() ? 20 : 10; }

$("btn-open-create-community").addEventListener("click", () => {
  if (!currentUser) { showToast("Aguarde conectar..."); return; }
  openView('view-create-community');
  setOpen(false);
});

$("community-avatar-file").addEventListener("change", async (e) => {
  const f = e.target.files[0]; if (!f) return;
  if (!isPulse()) { showToast("Upload direto é exclusivo do PULSE. Use URL."); e.target.value = ""; return; }
  try {
    editCommunityAvatar = await fileToBase64(f, maxUploadMB() * 1024 * 1024);
    $("community-avatar-url").value = "";
  } catch (err) { showToast(err.message); }
  e.target.value = "";
});

$("create-community-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return;
  try {
    const snap = await get(ref(db, `users/${currentUser.uid}/communities`));
    const count = snap.exists() ? Object.keys(snap.val()).length : 0;
    if (count >= maxCommunities()) { showToast(`Limite do seu plano: ${maxCommunities()} comunidades`); return; }
    const name = $("community-name").value.trim();
    const bio = $("community-bio").value.trim();
    const avatarUrl = editCommunityAvatar || $("community-avatar-url").value.trim();
    if (!name) { showToast("Dê um nome à comunidade"); return; }
    const communityRef = push(ref(db, "communities"));
    const cid = communityRef.key;
    await set(communityRef, { id: cid, name, bio, avatarUrl, ownerUid: currentUser.uid, createdAt: Date.now() });
    await update(ref(db, `users/${currentUser.uid}/communities/${cid}`), { name, bio, avatarUrl, joinedAt: Date.now() });
    $("create-community-form").reset();
    editCommunityAvatar = "";
    showToast("Comunidade criada!");
    openCommunityChat(cid, name, bio, avatarUrl);
  } catch (err) { showToast("Erro ao criar: " + err.message); }
});

function subscribeCommunities(uid){
  if (communitiesUnsub) communitiesUnsub();
  communitiesUnsub = onValue(ref(db, `users/${uid}/communities`), (snap) => {
    renderCommunities(snap.val() || {});
  });
}
function renderCommunities(list){
  const el = $("home-communities");
  if (!el) return;
  el.innerHTML = "";
  const arr = Object.entries(list).sort((a,b) => (b[1].joinedAt || 0) - (a[1].joinedAt || 0));
  if (!arr.length) { el.innerHTML = '<div class="empty">Você ainda não tem comunidades. Crie a primeira!</div>'; return; }
  arr.forEach(([id, c]) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `<img class="avatar" src="${c.avatarUrl || DEFAULT_AVATAR}" />
      <div class="list-item-info">
        <div class="list-item-name">${esc(c.name || 'Comunidade')}</div>
        <div class="list-item-sub">${esc(c.bio || 'Chat geral')}</div>
      </div>`;
    item.onclick = () => openCommunityChat(id, c.name, c.bio, c.avatarUrl);
    el.appendChild(item);
  });
}

function openCommunityChat(cid, name, bio, avatarUrl) {
  currentCommunityId = cid;
  $("chat-header-name").textContent = name || "Chat Geral";
  $("chat-header-bio").textContent = bio || "Chat Geral";
  $("chat-header-avatar").src = avatarUrl || DEFAULT_AVATAR;
  openView('view-chat');
  const msgsContainer = $("chat-messages");
  msgsContainer.innerHTML = '<div class="empty">Carregando mensagens...</div>';
  if (communityUnsub) communityUnsub();
  const chatRef = query(ref(db, `communities/${cid}/chats/geral`), limitToLast(50));
  communityUnsub = onValue(chatRef, (snap) => {
    msgsContainer.innerHTML = "";
    const msgs = [];
    snap.forEach((child) => { msgs.push({ id: child.key, ...child.val() }); });
    if (msgs.length === 0) { msgsContainer.innerHTML = '<div class="empty">Nenhuma mensagem ainda. Diga oi no chat geral!</div>'; return; }
    msgs.forEach(m => renderMessage(m, msgsContainer));
    msgsContainer.scrollTop = msgsContainer.scrollHeight;
  }, (err) => showToast("Chat: " + err.message));
  watchTyping(`communities/${cid}/typing`, "chat-typing");
}

function fmt(t){
  return String(t).split('\n').map(line => {
    let lvl = 0, s = line;
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) { lvl = h[1].length; s = h[2]; }
    s = esc(s).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\*(.+?)\*/g,'<i>$1</i>')
      .replace(/:pulse([1-5]):/g,'<img class="pemoji" src="emoji$1.png" alt="">')
      .replace(/(^|\s)(@[\wÀ-ú.-]+)/g,'$1<span class="mention">$2</span>');
    return lvl ? `<div style="font-weight:800;font-size:${[0,1.5,1.25,1.1][lvl]}rem">${s}</div>` : s;
  }).join('<br>');
}
function renderMessage(m, container) {
  const isOwn = m.senderUid === (currentUser ? currentUser.uid : '');
  const msgEl = document.createElement("div");
  msgEl.className = `message ${isOwn ? 'own' : ''}`;
  let contentHtml = '';
  if (m.type === 'text') contentHtml = `<div class="message-text">${fmt(m.text || '')}</div>`;
  else if (m.type === 'image') contentHtml = `<img src="${m.imageUrl}" class="message-image" onclick="window.open(this.src,'_blank')" />`;
  else if (m.type === 'audio') contentHtml = createAudioPlayerHTML(m.audioUrl);
  else if (m.type === 'invite') contentHtml = `<div class="message-text">📞 Convite para call <button class="btn btn-primary" data-room="${esc(m.roomId)}" style="padding:6px 12px;margin-left:6px">Entrar</button></div>`;
  const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const avatar = m.senderAvatar || DEFAULT_AVATAR;
  msgEl.innerHTML = `
    <img src="${avatar}" class="message-avatar" />
    <div class="message-content">
      <div class="message-header">
        <span class="message-sender">${esc(m.senderNick || 'Anônimo')}</span>
        <span class="message-time">${time}</span>
      </div>
      ${contentHtml}
    </div>
  `;
  container.appendChild(msgEl);
  const rb = msgEl.querySelector('[data-room]'); if (rb) rb.onclick = () => joinRoom(rb.dataset.room);
  if (m.type === 'audio') {
    const player = msgEl.querySelector('.custom-audio-player');
    const audio = player.querySelector('audio');
    const playBtn = player.querySelector('.play-btn');
    const progressFill = player.querySelector('.progress-fill');
    const timeEl = player.querySelector('.time');
    const track = player.querySelector('.progress-track');
    playBtn.addEventListener('click', () => {
      if (audio.paused) { audio.play(); playBtn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'; }
      else { audio.pause(); playBtn.innerHTML = '<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>'; }
    });
    audio.addEventListener('timeupdate', () => {
      const pct = (audio.currentTime / audio.duration) * 100;
      progressFill.style.width = pct + '%';
      timeEl.textContent = formatTime(audio.currentTime);
    });
    audio.addEventListener('ended', () => {
      playBtn.innerHTML = '<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
      progressFill.style.width = '0%';
      timeEl.textContent = '0:00';
    });
    track.addEventListener('click', (e) => {
      const rect = track.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      audio.currentTime = pct * audio.duration;
    });
  }
}
function createAudioPlayerHTML(src) {
  return `
    <div class="custom-audio-player">
      <button class="play-btn"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></button>
      <div class="progress-track"><div class="progress-fill"></div></div>
      <span class="time">0:00</span>
      <audio src="${src}" preload="metadata"></audio>
    </div>
  `;
}
function formatTime(seconds) {
  if (isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

async function sendMessage(payload) {
  if (!currentCommunityId || !currentUser) return;
  payload.senderUid = currentUser.uid;
  payload.senderNick = userProfile.nick || "Anônimo";
  payload.senderAvatar = userProfile.avatarUrl || "";
  payload.timestamp = Date.now();
  try { await push(ref(db, `communities/${currentCommunityId}/chats/geral`), payload); }
  catch (err) { showToast("Erro ao enviar: " + err.message); }
}
$("btn-send").addEventListener("click", () => {
  const text = $("chat-input").value.trim();
  if (!text) return;
  sendMessage({ type: 'text', text });
  $("chat-input").value = "";
});
$("chat-input").addEventListener("keypress", (e) => { if (e.key === 'Enter') $("btn-send").click(); });
$("chat-image-upload").addEventListener("change", async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const maxBytes = maxUploadMB() * 1024 * 1024;
  if (f.size > maxBytes) { showToast(`Imagem muito grande (máx ${maxUploadMB()}MB no seu plano)`); e.target.value = ""; return; }
  try { const base64 = await fileToBase64(f, maxBytes); sendMessage({ type: 'image', imageUrl: base64 }); }
  catch (err) { showToast(err.message); }
  e.target.value = "";
});
$("btn-record").addEventListener("click", async () => {
  if (isRecording) {
    if (recordTimer) { clearTimeout(recordTimer); recordTimer = null; }
    mediaRecorder.stop(); isRecording = false;
    $("btn-record").classList.remove("recording");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = async () => {
      if (recordTimer) { clearTimeout(recordTimer); recordTimer = null; }
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.onload = () => sendMessage({ type: 'audio', audioUrl: reader.result });
      reader.readAsDataURL(audioBlob);
      stream.getTracks().forEach(track => track.stop());
    };
    mediaRecorder.start();
    isRecording = true;
    $("btn-record").classList.add("recording");
    showToast(`Gravando... (máx ${maxAudioSec()}s no seu plano)`);
    recordTimer = setTimeout(() => {
      if (isRecording && mediaRecorder && mediaRecorder.state !== 'inactive') {
        showToast("Limite de áudio do seu plano atingido");
        mediaRecorder.stop(); isRecording = false;
        $("btn-record").classList.remove("recording");
      }
    }, maxAudioSec() * 1000);
  } catch (err) { showToast("Erro ao acessar microfone: " + err.message); }
});

function subscribeFriends(uid){
  if (friendsUnsub) friendsUnsub();
  friendsUnsub = onValue(ref(db, `users/${uid}/friends`), (snap) => {
    friendsMap = snap.val() || {};
    renderFriendsLists();
  });
}
function makeFriendItem(f){
  const item = document.createElement('div');
  item.className = 'list-item';
  item.innerHTML = `<img class="avatar" src="${f.avatarUrl || DEFAULT_AVATAR}" />
    <div class="list-item-info">
      <div class="list-item-name">${esc(f.nick || 'Amigo')}</div>
      <div class="list-item-sub">ID: ${esc((f.uid || '').slice(0,10))}…</div>
    </div>`;
  item.onclick = () => openDm(f.uid);
  return item;
}
function renderFriendsLists(){
  const arr = Object.entries(friendsMap).map(([k,v]) => ({ ...v, uid: v.uid || k })).sort((a,b) => (a.nick || '').localeCompare(b.nick || ''));
  const fEl = $("friends-list");
  const dEl = $("dm-friends-list");
  if (fEl) fEl.innerHTML = "";
  if (dEl) dEl.innerHTML = "";
  if (!arr.length) {
    if (fEl) fEl.innerHTML = '<div class="empty">Nenhum amigo ainda.</div>';
    if (dEl) dEl.innerHTML = '<div class="empty">Adicione amigos na aba Amigos para conversar.</div>';
    return;
  }
  arr.forEach(f => {
    if (fEl) fEl.appendChild(makeFriendItem(f));
    if (dEl) dEl.appendChild(makeFriendItem(f));
  });
}
$("btn-add-friend").addEventListener("click", () => sendFriendRequest($("friend-id-input").value));
$("friend-id-input").addEventListener("keypress", (e) => { if (e.key === 'Enter') sendFriendRequest($("friend-id-input").value); });
async function sendFriendRequest(targetUid){
  if (!currentUser) return;
  targetUid = (targetUid || '').trim();
  if (!targetUid) { showToast("Informe o ID do usuário"); return; }
  if (targetUid === currentUser.uid) { showToast("Você não pode adicionar você mesmo"); return; }
  if (friendsMap[targetUid]) { showToast("Essa pessoa já é seu amigo"); return; }
  try {
    const snap = await get(ref(db, `users/${targetUid}`));
    if (!snap.exists()) { showToast("Usuário não encontrado"); return; }
    const target = snap.val();
    const privacy = (target.privacy && target.privacy.friendRequests) || "all";
    if (privacy === "none") { showToast("Este usuário não aceita pedidos de amizade"); return; }
    await set(ref(db, `friend_requests/${targetUid}/${currentUser.uid}`), {
      fromUid: currentUser.uid,
      fromNick: userProfile.nick || "Anônimo",
      fromAvatar: userProfile.avatarUrl || "",
      createdAt: Date.now()
    });
    $("friend-id-input").value = "";
    showToast("Pedido de amizade enviado!");
  } catch (err) { showToast("Erro: " + err.message); }
}
function subscribeRequests(uid){
  if (requestsUnsub) requestsUnsub();
  requestsUnsub = onValue(ref(db, `friend_requests/${uid}`), (snap) => { renderRequests(snap.val() || {}); });
}
function renderRequests(list){
  const el = $("requests-list");
  if (!el) return;
  el.innerHTML = "";
  const arr = Object.entries(list);
  if (!arr.length) { el.innerHTML = '<div class="empty">Nenhum convite no momento.</div>'; return; }
  arr.forEach(([fromUid, r]) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.style.cursor = 'default';
    item.innerHTML = `<img class="avatar" src="${r.fromAvatar || DEFAULT_AVATAR}" />
      <div class="list-item-info">
        <div class="list-item-name">${esc(r.fromNick || 'Usuário')}</div>
        <div class="list-item-sub">quer ser seu amigo</div>
      </div>`;
    const actions = document.createElement('div');
    actions.style.display = 'flex'; actions.style.gap = '6px';
    const ok = document.createElement('button');
    ok.className = 'mini-btn accept'; ok.textContent = 'Aceitar';
    ok.onclick = () => acceptRequest(fromUid);
    const no = document.createElement('button');
    no.className = 'mini-btn decline'; no.textContent = 'Recusar';
    no.onclick = () => declineRequest(fromUid);
    actions.append(ok, no);
    item.appendChild(actions);
    el.appendChild(item);
  });
}
async function acceptRequest(fromUid){
  if (!currentUser) return;
  try {
    const snap = await get(ref(db, `users/${fromUid}`));
    const f = snap.val() || {};
    const updates = {};
    updates[`users/${currentUser.uid}/friends/${fromUid}`] = { uid: fromUid, nick: f.nick || 'Anônimo', avatarUrl: f.avatarUrl || '', since: Date.now() };
    updates[`users/${fromUid}/friends/${currentUser.uid}`] = { uid: currentUser.uid, nick: userProfile.nick || 'Anônimo', avatarUrl: userProfile.avatarUrl || '', since: Date.now() };
    updates[`friend_requests/${currentUser.uid}/${fromUid}`] = null;
    await update(ref(db), updates);
    showToast("Amizade aceita!");
  } catch (err) { showToast("Erro: " + err.message); }
}
async function declineRequest(fromUid){
  try { await set(ref(db, `friend_requests/${currentUser.uid}/${fromUid}`), null); showToast("Convite recusado"); }
  catch (err) { showToast("Erro: " + err.message); }
}

const typingUnsubs = {};
let typingTimer = null;
function watchTyping(path, barId){
  if (typingUnsubs[barId]) typingUnsubs[barId]();
  const bar = $(barId); bar.innerHTML = "";
  typingUnsubs[barId] = onValue(ref(db, path), (snap) => {
    const now = Date.now(), names = [];
    snap.forEach(c => { const v = c.val(); if (c.key !== currentUser.uid && v && now - v.t < 6000) names.push(v.nick || "Alguém"); });
    const dots = '<span class="dots"><span>.</span><span>.</span><span>.</span></span>';
    bar.innerHTML = !names.length ? "" : names.length === 1 ? `<b>${esc(names[0])}</b> digitando${dots}` : `${names.length} pessoas estão digitando${dots}`;
  });
}
function bindTyping(inputId, getPath){
  $(inputId).addEventListener("input", () => {
    const p = getPath(); if (!p || !currentUser) return;
    const r = ref(db, `${p}/${currentUser.uid}`);
    set(r, { nick: userProfile.nick || "Anônimo", t: Date.now() }).catch(()=>{});
    onDisconnect(r).remove();
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => set(r, null).catch(()=>{}), 3000);
  });
}
bindTyping("dm-input", () => currentDmUid ? `dms/${dmPairId(currentUser.uid, currentDmUid)}/typing` : null);
bindTyping("chat-input", () => currentCommunityId ? `communities/${currentCommunityId}/typing` : null);
function dmPairId(a, b){ return [a, b].sort().join('_'); }
async function openDm(friendUid){
  if (!currentUser) return;
  const f = friendsMap[friendUid];
  if (!f) { showToast("Amigo não encontrado"); return; }
  currentDmUid = friendUid;
  $("dm-header-name").textContent = f.nick || "Amigo";
  $("dm-header-avatar").src = f.avatarUrl || DEFAULT_AVATAR;
  openView('view-dm');
  const box = $("dm-messages");
  box.innerHTML = '<div class="empty">Carregando mensagens...</div>';
  const pairId = dmPairId(currentUser.uid, friendUid);
  if (dmUnsub) dmUnsub();
  dmUnsub = onValue(query(ref(db, `dms/${pairId}/messages`), limitToLast(50)), (snap) => {
    box.innerHTML = "";
    const msgs = [];
    snap.forEach(c => msgs.push({ id: c.key, ...c.val() }));
    if (!msgs.length) { box.innerHTML = '<div class="empty">Nenhuma mensagem ainda. Diga oi!</div>'; return; }
    msgs.forEach(m => renderMessage(m, box));
    box.scrollTop = box.scrollHeight;
  }, (err) => {
    box.innerHTML = '<div class="empty">Erro ao carregar DM: ' + esc(err.message) + '</div>';
    showToast("DM: " + err.message);
  });
  watchTyping(`dms/${pairId}/typing`, "dm-typing");
}
async function sendDm(payload){
  if (!currentDmUid || !currentUser) return;
  const pairId = dmPairId(currentUser.uid, currentDmUid);
  payload.senderUid = currentUser.uid;
  payload.senderNick = userProfile.nick || "Anônimo";
  payload.senderAvatar = userProfile.avatarUrl || "";
  payload.timestamp = Date.now();
  try { await push(ref(db, `dms/${pairId}/messages`), payload); }
  catch (err) { showToast("Erro ao enviar: " + err.message); }
}
$("dm-send").addEventListener("click", () => {
  const text = $("dm-input").value.trim();
  if (!text) return;
  sendDm({ type: 'text', text });
  $("dm-input").value = "";
});
$("dm-input").addEventListener("keypress", (e) => { if (e.key === 'Enter') $("dm-send").click(); });
$("dm-call-btn").addEventListener("click", async () => {
  if (!currentDmUid || !currentUser || room) return;
  const f = friendsMap[currentDmUid];
  const id = push(ref(db, "rooms")).key;
  logCall(currentDmUid, f ? (f.nick || 'Amigo') : 'Amigo');
  await sendInviteTo(currentDmUid, id);
  joinRoom(id);
});

/* ===== CALLS (WebRTC mesh, sinalização via RTDB) ===== */
const RTC = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
let room = null; const tiles = {};
const sendSig = (to, o) => push(ref(db, `rooms/${room.id}/s/${to}`), { from: currentUser.uid, ...o });
async function sendInviteTo(uid, roomId){
  await push(ref(db, `dms/${dmPairId(currentUser.uid, uid)}/messages`), { type: 'invite', roomId, text: 'Convite para call',
    senderUid: currentUser.uid, senderNick: userProfile.nick || 'Anônimo', senderAvatar: userProfile.avatarUrl || '', timestamp: Date.now() });
}
function tile(key, label, stream, isLocal, uid){
  let t = tiles[key];
  if (!t) {
    t = document.createElement('div');
    t.style.cssText = 'position:relative;background:#000;border-radius:12px;overflow:hidden;min-height:140px;display:grid;place-items:center';
    t.innerHTML = `<video autoplay playsinline style="width:100%;max-height:50vh;object-fit:contain"></video><span style="position:absolute;left:8px;bottom:6px;color:#fff;font-size:.75rem;background:#0008;padding:2px 8px;border-radius:8px">${esc(label)}</span>`;
    if (!isLocal) {
      const mb = document.createElement('button'); mb.className = 'btn'; mb.textContent = '🔊'; mb.title = 'Silenciar para mim';
      mb.style.cssText = 'position:absolute;right:6px;top:6px;padding:4px 8px';
      mb.onclick = () => { const v = t.querySelector('video'); v.muted = !v.muted; mb.textContent = v.muted ? '🔇' : '🔊'; };
      t.appendChild(mb);
    }
    $('call-grid').appendChild(t); tiles[key] = t;
  }
  const v = t.querySelector('video'); if (v.srcObject !== stream) v.srcObject = stream; if (isLocal) v.muted = true;
}
const dropTiles = (pfx) => Object.keys(tiles).filter(k => k.startsWith(pfx)).forEach(k => { tiles[k].remove(); delete tiles[k]; });
function addMine(pc){ room.local.getTracks().forEach(t => pc.addTrack(t, room.local)); room.extra.forEach(s => s.getTracks().forEach(t => pc.addTrack(t, s))); }
function mkPc(uid, addNow){
  if (room.pcs[uid]) return room.pcs[uid];
  const pc = new RTCPeerConnection(RTC); room.pcs[uid] = pc;
  pc.onicecandidate = e => e.candidate && sendSig(uid, { k: 'ice', d: JSON.stringify(e.candidate) });
  pc.ontrack = e => { const s = e.streams[0]; if (!s) return; const key = uid + ':' + s.id;
    tile(key, room.nicks[uid] || 'Amigo', s, false, uid);
    s.onremovetrack = () => { if (!s.getTracks().length) dropTiles(key); }; };
  pc.onnegotiationneeded = async () => { if (pc.signalingState !== 'stable') return;
    try { await pc.setLocalDescription(await pc.createOffer()); sendSig(uid, { k: 'offer', d: JSON.stringify(pc.localDescription) }); } catch (e) {} };
  if (addNow) addMine(pc);
  return pc;
}
async function onSig(m){
  try {
    if (m.k === 'offer') {
      const first = !room.pcs[m.from]; const pc = mkPc(m.from, false);
      await pc.setRemoteDescription(JSON.parse(m.d));
      if (first) addMine(pc);
      await pc.setLocalDescription(await pc.createAnswer());
      sendSig(m.from, { k: 'answer', d: JSON.stringify(pc.localDescription) });
    } else if (m.k === 'answer') await room.pcs[m.from]?.setRemoteDescription(JSON.parse(m.d));
    else if (m.k === 'ice') await room.pcs[m.from]?.addIceCandidate(JSON.parse(m.d));
  } catch (e) { console.warn('sig', e); }
}
async function joinRoom(id){
  if (room) return showToast('Você já está em uma call');
  let local;
  try { local = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { return showToast('Sem acesso ao microfone'); }
  room = { id, pcs: {}, local, extra: [], nicks: {}, unsubs: [], cam: null, scr: null };
  openView('view-call'); $('call-grid').innerHTML = ''; tile('me:v', 'Você', local, true);
  const me = currentUser.uid, pr = ref(db, `rooms/${id}/p/${me}`);
  const existing = (await get(ref(db, `rooms/${id}/p`))).val() || {};
  await set(pr, { nick: userProfile.nick || 'Anônimo', t: Date.now() }); onDisconnect(pr).remove();
  Object.entries(existing).forEach(([u, v]) => { room.nicks[u] = v.nick; if (u !== me) mkPc(u, true); });
  room.unsubs.push(onChildAdded(ref(db, `rooms/${id}/p`), s => { room.nicks[s.key] = (s.val() || {}).nick; }));
  room.unsubs.push(onChildAdded(ref(db, `rooms/${id}/s/${me}`), s => { const m = s.val(); remove(s.ref); onSig(m); }));
  room.unsubs.push(onChildRemoved(ref(db, `rooms/${id}/p`), s => { room.pcs[s.key]?.close(); delete room.pcs[s.key]; dropTiles(s.key + ':'); }));
}
async function toggleExtra(key, getStream){
  if (room[key]) {
    const s = room[key];
    s.getTracks().forEach(t => { t.stop(); Object.values(room.pcs).forEach(pc => { const sn = pc.getSenders().find(x => x.track === t); if (sn) pc.removeTrack(sn); }); });
    room.extra = room.extra.filter(x => x !== s); room[key] = null; dropTiles('me:' + key); return;
  }
  try {
    const s = await getStream(); room[key] = s; room.extra.push(s);
    s.getVideoTracks()[0].onended = () => { if (room && room[key] === s) toggleExtra(key, getStream); };
    Object.values(room.pcs).forEach(pc => s.getTracks().forEach(t => pc.addTrack(t, s)));
    tile('me:' + key, key === 'cam' ? 'Você (vídeo)' : 'Você (tela)', s, true);
  } catch (e) { showToast('Não foi possível iniciar'); }
}
$('call-mic').onclick = () => { const t = room?.local.getAudioTracks()[0]; if (!t) return; t.enabled = !t.enabled; $('call-mic').textContent = t.enabled ? '🎤 Mic' : '🔇 Mudo'; };
$('call-cam').onclick = () => room && toggleExtra('cam', () => navigator.mediaDevices.getUserMedia({ video: true }));
$('call-scr').onclick = () => room && toggleExtra('scr', () => navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }));
$('call-add').onclick = () => {
  const box = $('call-invite-list'); box.innerHTML = '';
  Object.entries(friendsMap).forEach(([k, f]) => { const b = document.createElement('button'); b.className = 'btn'; b.textContent = f.nick || 'Amigo';
    b.onclick = async () => { await sendInviteTo(f.uid || k, room.id); showToast('Convite enviado para ' + (f.nick || 'amigo')); }; box.appendChild(b); });
  box.style.display = box.style.display === 'flex' ? 'none' : 'flex';
};
$('call-leave').onclick = () => {
  if (!room) return;
  room.unsubs.forEach(u => u()); Object.values(room.pcs).forEach(pc => pc.close());
  [room.local, room.cam, room.scr].forEach(s => s && s.getTracks().forEach(t => t.stop()));
  remove(ref(db, `rooms/${room.id}/p/${currentUser.uid}`)).catch(() => {});
  Object.keys(tiles).forEach(k => delete tiles[k]); room = null; closeAllViews();
};

function subscribeCalls(uid){
  if (callsUnsub) callsUnsub();
  callsUnsub = onValue(ref(db, `calls/${uid}`), (snap) => { renderCalls(snap.val() || {}); });
}
async function logCall(peerUid, peerNick){
  if (!currentUser) return;
  const now = Date.now();
  try {
    await push(ref(db, `calls/${currentUser.uid}`), { peerUid, peerNick, direction: 'out', type: 'audio', timestamp: now, duration: 0 });
    await push(ref(db, `calls/${peerUid}`), { peerUid: currentUser.uid, peerNick: userProfile.nick || 'Anônimo', direction: 'in', type: 'audio', timestamp: now, duration: 0 });
  } catch (err) { showToast("Erro ao registrar chamada: " + err.message); }
}
function renderCalls(list){
  const el = $("calls-list");
  if (!el) return;
  el.innerHTML = "";
  const arr = Object.values(list).sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
  if (!arr.length) { el.innerHTML = '<div class="empty">Nenhuma chamada ainda.</div>'; return; }
  arr.forEach(c => {
    const item = document.createElement('div');
    item.className = 'call-item';
    const dir = c.direction === 'out' ? '↗' : '↙';
    const date = new Date(c.timestamp).toLocaleString();
    item.innerHTML = `<div style="font-size:1.2rem;width:24px;text-align:center;">${dir}</div>
      <div style="flex:1;min-width:0;">
        <div class="list-item-name">${esc(c.peerNick || 'Desconhecido')}</div>
        <div class="list-item-sub">${c.direction === 'out' ? 'Você ligou' : 'Recebida'} • ${date}</div>
      </div>`;
    if (friendsMap[c.peerUid]) { item.style.cursor = 'pointer'; item.onclick = () => openDm(c.peerUid); }
    el.appendChild(item);
  });
}

function openSettings(){
  openView('view-settings');
  renderAccount();
  renderPlanState();
}
document.querySelectorAll('#settings-tabs .tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#settings-tabs .tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.subview').forEach(s => s.classList.remove('active'));
    const sub = $('sub-' + btn.dataset.sub);
    if (sub) sub.classList.add('active');
  });
});
function renderAccount(){
  if (!currentUser) return;
  $("acc-nick").textContent = userProfile.nick || "—";
  $("acc-uid").textContent = currentUser.uid;
  $("acc-plan").textContent = isPulse() ? "PULSE" : "FREE";
  $("acc-created").textContent = userProfile.createdAt ? new Date(userProfile.createdAt).toLocaleString() : "—";
}
$("btn-copy-id").addEventListener("click", () => { if (currentUser) copyText(currentUser.uid); });
function copyText(text){
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast("Copiado!")).catch(() => showToast("Não foi possível copiar"));
  } else showToast("Copie manualmente: " + text);
}
$("btn-open-profile-edit").addEventListener("click", () => {
  loadProfileIntoForm();
  openView('view-profile');
});

function renderPlanState(){
  const pulse = isPulse();
  $("plan-free-label").textContent = pulse ? "Grátis" : "Atual";
  $("plan-pulse-label").textContent = pulse ? "Atual" : "R$ 5,00";
  const btn = $("btn-buy-pulse");
  if (btn) {
    btn.style.display = pulse ? 'none' : 'inline-flex';
    btn.disabled = !!userProfile.pulsePending;
    btn.textContent = userProfile.pulsePending ? "Pedido em análise..." : "Quero o PULSE";
  }
  if (pulse) $("pulse-form").style.display = 'none';
  const rv = $("btn-revoke-pulse");
  if (rv) {
    rv.style.display = pulse ? 'inline-flex' : 'none';
    rv.disabled = !!userProfile.revokePending;
    rv.textContent = userProfile.revokePending ? "Revogação em análise..." : "Revogar assinatura";
  }
}
$("btn-revoke-pulse").addEventListener("click", async () => {
  if (!currentUser || !isPulse() || userProfile.revokePending) return;
  if (!confirm("Pedir a revogação da sua assinatura PULSE?")) return;
  try {
    await push(ref(db, "pulse_requests"), { uid: currentUser.uid, nick: userProfile.nick || "Anônimo",
      type: "revoke", plan: "pulse", status: "pending", createdAt: Date.now() });
    await update(ref(db, `users/${currentUser.uid}`), { revokePending: true });
    showToast("Pedido de revogação enviado");
  } catch (err) { showToast("Erro: " + err.message); }
});
$("btn-buy-pulse").addEventListener("click", () => {
  const form = $("pulse-form");
  form.style.display = form.style.display === 'flex' ? 'none' : 'flex';
});
$("proof-file").addEventListener("change", async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    editProof = await fileToBase64(f, 5 * 1024 * 1024);
    const prev = $("proof-preview");
    prev.src = editProof;
    prev.style.display = 'block';
  } catch (err) { showToast(err.message); }
  e.target.value = "";
});
$("btn-send-proof").addEventListener("click", async () => {
  if (!currentUser) return;
  if (isPulse()) { showToast("Você já é PULSE!"); return; }
  if (userProfile.pulsePending) { showToast("Seu pedido já está em análise"); return; }
  if (!editProof) { showToast("Anexe o comprovante do Pix"); return; }
  const buyerName = $("buyer-name").value.trim();
  if (!buyerName) { showToast("Informe o nome do pagador"); return; }
  try {
    await push(ref(db, "pulse_requests"), {
      uid: currentUser.uid,
      nick: userProfile.nick || "Anônimo",
      buyerName: buyerName,
      type: "subscribe",
      plan: "pulse",
      amount: 5,
      proofUrl: editProof,
      status: "pending",
      createdAt: Date.now()
    });
    await update(ref(db, `users/${currentUser.uid}`), { pulsePending: true });
    editProof = "";
    $("proof-preview").style.display = 'none';
    $("pulse-form").style.display = 'none';
    showToast("Pedido enviado! Aguarde a aprovação.");
  } catch (err) {
    showToast("Erro ao enviar pedido: " + err.message);
  }
});

$("btn-save-privacy").addEventListener("click", async () => {
  if (!currentUser) return;
  try {
    await update(ref(db, `users/${currentUser.uid}`), { privacy: { friendRequests: $("privacy-friend-requests").value } });
    showToast("Privacidade salva!");
  } catch (err) { showToast("Erro: " + err.message); }
});

$("btn-delete-data").addEventListener("click", async () => {
  if (!currentUser) return;
  if (!confirm("Isso apagará seu perfil, amigos e pedidos. Deseja continuar?")) return;
  try {
    const updates = {};
    Object.keys(friendsMap).forEach(fid => { updates[`users/${fid}/friends/${currentUser.uid}`] = null; });
    updates[`users/${currentUser.uid}`] = null;
    updates[`friend_requests/${currentUser.uid}`] = null;
    await update(ref(db), updates);
    showToast("Dados excluídos. Saindo...");
    setTimeout(() => { auth.signOut().then(() => location.reload()); }, 900);
  } catch (err) { showToast("Erro ao excluir: " + err.message); }
});

const emojis = "😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👿 👹 👺 🤡 💩 👻 💀 👽 👾 🤖 🎃 😺 😸 😹 😻 😼 😽 🙀 😿 😾".split(" ");
let lastBuiltPlan = null;
function buildEmojiPicker(pickerEl, inputEl){
  if (!pickerEl) return;
  pickerEl.innerHTML = "";
  emojis.forEach(e => {
    const btn = document.createElement("button");
    btn.className = "emoji-btn";
    btn.type = "button";
    btn.textContent = e;
    btn.onclick = () => { inputEl.value += e; inputEl.focus(); };
    pickerEl.appendChild(btn);
  });
  const sec = document.createElement("div"); sec.className = "emoji-sec"; sec.textContent = "PULSE"; pickerEl.appendChild(sec);
  for (let i = 1; i <= 5; i++) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "emoji-btn" + (isPulse() ? "" : " emoji-locked");
    b.innerHTML = `<img class="pemoji" src="emoji${i}.png" alt="">`;
    b.onclick = () => { if (!isPulse()) { showToast("Emojis exclusivos para assinantes PULSE"); return; } inputEl.value += `:pulse${i}:`; inputEl.focus(); };
    pickerEl.appendChild(b);
  }
}
function refreshEmojiPickers(){
  const p = isPulse();
  if (lastBuiltPlan === p) return;
  lastBuiltPlan = p;
  buildEmojiPicker($("emoji-picker"), $("chat-input"));
  buildEmojiPicker($("dm-emoji-picker"), $("dm-input"));
}
refreshEmojiPickers();

$("btn-emoji").addEventListener("click", (e) => {
  e.stopPropagation();
  $("emoji-picker").classList.toggle("show");
  $("dm-emoji-picker").classList.remove("show");
});
$("dm-btn-emoji").addEventListener("click", (e) => {
  e.stopPropagation();
  $("dm-emoji-picker").classList.toggle("show");
  $("emoji-picker").classList.remove("show");
});
document.addEventListener("click", (e) => {
  if (!e.target.closest("#emoji-picker") && !e.target.closest("#btn-emoji")) $("emoji-picker").classList.remove("show");
  if (!e.target.closest("#dm-emoji-picker") && !e.target.closest("#dm-btn-emoji")) $("dm-emoji-picker").classList.remove("show");
});

function fileToBase64(file, maxBytes = MAX_FILE_SIZE){
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) {
      reject(new Error(`Arquivo muito grande (máx ${(maxBytes / 1024 / 1024).toFixed(0)}MB)`));
      return;
    }
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}