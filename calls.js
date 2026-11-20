import { ref, set, update, get, onValue, onDisconnect, query, limitToLast, push, remove, onChildAdded, onChildRemoved } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { db, S, $, esc, RTC, isPulse, userStrikes, dmPairId } from "./state.js";
import { showToast, openView, closeView, closeAllViews, openModal, closeModals } from "./ui.js";

const tiles = {};
let callsUnsub = null;
let cinemaUnsub = null;
let cinemaChatUnsub = null;

const sendSig = (to, o) => push(ref(db, `rooms/${S.room.id}/s/${to}`), { from: S.currentUser.uid, ...o });

export async function sendInviteTo(uid, roomId){
  await push(ref(db, `dms/${dmPairId(S.currentUser.uid, uid)}/messages`), {
    type: 'invite', roomId, text: 'Convite para call',
    senderUid: S.currentUser.uid, senderNick: S.userProfile.nick || 'Anônimo', senderAvatar: S.userProfile.avatarUrl || '', timestamp: Date.now()
  });
}

function tile(key, label, stream, isLocal){
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
  const v = t.querySelector('video');
  if (v.srcObject !== stream) v.srcObject = stream;
  if (isLocal) v.muted = true;
}

const dropTiles = (pfx) => Object.keys(tiles).filter(k => k.startsWith(pfx)).forEach(k => { tiles[k].remove(); delete tiles[k]; });

function addMine(pc){
  S.room.local.getTracks().forEach(t => pc.addTrack(t, S.room.local));
  S.room.extra.forEach(s => s.getTracks().forEach(t => pc.addTrack(t, s)));
}

function mkPc(uid, addNow){
  if (S.room.pcs[uid]) return S.room.pcs[uid];
  const pc = new RTCPeerConnection(RTC); S.room.pcs[uid] = pc;
  pc.onicecandidate = e => e.candidate && sendSig(uid, { k: 'ice', d: JSON.stringify(e.candidate) });
  pc.ontrack = e => {
    const s = e.streams[0]; if (!s) return;
    const key = uid + ':' + s.id;
    tile(key, S.room.nicks[uid] || 'Amigo', s, false);
    s.onremovetrack = () => { if (!s.getTracks().length) dropTiles(key); };
  };
  pc.onnegotiationneeded = async () => {
    if (pc.signalingState !== 'stable') return;
    try { await pc.setLocalDescription(await pc.createOffer()); sendSig(uid, { k: 'offer', d: JSON.stringify(pc.localDescription) }); } catch (e) {}
  };
  if (addNow) addMine(pc);
  return pc;
}

async function onSig(m){
  try {
    if (m.k === 'offer') {
      const first = !S.room.pcs[m.from]; const pc = mkPc(m.from, false);
      await pc.setRemoteDescription(JSON.parse(m.d));
      if (first) addMine(pc);
      await pc.setLocalDescription(await pc.createAnswer());
      sendSig(m.from, { k: 'answer', d: JSON.stringify(pc.localDescription) });
    } else if (m.k === 'answer') await S.room.pcs[m.from]?.setRemoteDescription(JSON.parse(m.d));
    else if (m.k === 'ice') await S.room.pcs[m.from]?.addIceCandidate(JSON.parse(m.d));
  } catch (e) { console.warn('sig', e); }
}

export async function joinRoom(id){
  if (userStrikes() >= 2) return showToast('Calls bloqueadas (Alerta Nível 2)');
  if (S.room) return showToast('Você já está em uma call');
  let local;
  try {
    const audioOpts = isPulse() ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000 } : true;
    local = await navigator.mediaDevices.getUserMedia({ audio: audioOpts });
  } catch (e) { return showToast('Sem acesso ao microfone'); }

  S.room = { id, pcs: {}, local, extra: [], nicks: {}, unsubs: [], cam: null, scr: null };
  openView('view-call'); $('call-grid').innerHTML = ''; tile('me:v', 'Você', local, true);
  const me = S.currentUser.uid, pr = ref(db, `rooms/${id}/p/${me}`);
  const existing = (await get(ref(db, `rooms/${id}/p`))).val() || {};
  await set(pr, { nick: S.userProfile.nick || 'Anônimo', t: Date.now() }); onDisconnect(pr).remove();
  Object.entries(existing).forEach(([u, v]) => { S.room.nicks[u] = v.nick; if (u !== me) mkPc(u, true); });
  S.room.unsubs.push(onChildAdded(ref(db, `rooms/${id}/p`), s => { S.room.nicks[s.key] = (s.val() || {}).nick; }));
  S.room.unsubs.push(onChildAdded(ref(db, `rooms/${id}/s/${me}`), s => { const m = s.val(); remove(s.ref); onSig(m); }));
  S.room.unsubs.push(onChildRemoved(ref(db, `rooms/${id}/p`), s => { S.room.pcs[s.key]?.close(); delete S.room.pcs[s.key]; dropTiles(s.key + ':'); }));
  watchCinemaRoom(id);
}

async function toggleExtra(key, getStream){
  if (S.room[key]) {
    const s = S.room[key];
    s.getTracks().forEach(t => { t.stop(); Object.values(S.room.pcs).forEach(pc => { const sn = pc.getSenders().find(x => x.track === t); if (sn) pc.removeTrack(sn); }); });
    S.room.extra = S.room.extra.filter(x => x !== s); S.room[key] = null; dropTiles('me:' + key); return;
  }
  try {
    const s = await getStream(); S.room[key] = s; S.room.extra.push(s);
    s.getVideoTracks()[0].onended = () => { if (S.room && S.room[key] === s) toggleExtra(key, getStream); };
    Object.values(S.room.pcs).forEach(pc => s.getTracks().forEach(t => pc.addTrack(t, s)));
    tile('me:' + key, key === 'cam' ? 'Você (vídeo)' : 'Você (tela)', s, true);
  } catch (e) { showToast('Não foi possível iniciar'); }
}

function formatYoutUbeUrl(raw){
  let u = String(raw || '').trim();
  if (!u) return '';
  if (u.includes('youtu.be/')) {
    const id = u.split('youtu.be/')[1].split(/[?&]/)[0];
    return `https://www.yout-ube.com/watch?v=${id}`;
  }
  return u.replace(/youtube\.com/gi, 'yout-ube.com');
}

function getCinemaRoomId(){
  if (S.room) return S.room.id;
  if (S.currentServerId) return `srv_cinema_${S.currentServerId}`;
  return `solo_${S.currentUser?.uid}`;
}

export async function openCinemaFromAnywhere(){
  if (userStrikes() >= 2) { showToast("Modo Cinema/Calls bloqueado (Alerta Nível 2)"); return; }
  const rid = getCinemaRoomId();
  const snap = await get(ref(db, `rooms/${rid}/cinema`));
  if (snap.exists() && snap.val()?.url) {
    watchCinemaRoom(rid);
    openView('view-cinema');
  } else {
    $("cinema-url-input").value = "";
    openModal("cinema-url-modal");
  }
}

function watchCinemaRoom(rid){
  if (cinemaUnsub) cinemaUnsub();
  cinemaUnsub = onValue(ref(db, `rooms/${rid}/cinema`), (snap) => {
    const c = snap.val();
    if (!c || !c.url) return;
    const isHost = S.currentUser && c.hostUid === S.currentUser.uid;
    $("cinema-url-badge").textContent = c.url;
    $("cinema-host-controls").style.display = isHost ? "flex" : "none";
    $("cinema-change-url-btn").style.display = isHost ? "inline-flex" : "none";
    $("cinema-guest-shield").style.display = isHost ? "none" : "block";
    if ($("cinema-iframe").dataset.loadedUrl !== c.url) {
      $("cinema-iframe").dataset.loadedUrl = c.url;
      $("cinema-iframe").src = c.url;
    }
  });

  if (cinemaChatUnsub) cinemaChatUnsub();
  cinemaChatUnsub = onValue(query(ref(db, `rooms/${rid}/cinemaChat`), limitToLast(40)), (snap) => {
    const box = $("cinema-chat-messages");
    box.innerHTML = "";
    snap.forEach(child => {
      const m = child.val();
      const d = document.createElement("div");
      d.innerHTML = `<b style="color:var(--gold);">${esc(m.nick)}:</b> <span>${esc(m.text)}</span>`;
      box.appendChild(d);
    });
    box.scrollTop = box.scrollHeight;
  });
}

export function subscribeCalls(uid){
  if (callsUnsub) callsUnsub();
  callsUnsub = onValue(ref(db, `calls/${uid}`), (snap) => renderCalls(snap.val() || {}));
}

export async function logCall(peerUid, peerNick){
  if (!S.currentUser) return;
  const now = Date.now();
  try {
    await push(ref(db, `calls/${S.currentUser.uid}`), { peerUid, peerNick, direction: 'out', type: 'audio', timestamp: now, duration: 0 });
    await push(ref(db, `calls/${peerUid}`), { peerUid: S.currentUser.uid, peerNick: S.userProfile.nick || 'Anônimo', direction: 'in', type: 'audio', timestamp: now, duration: 0 });
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
    if (S.friendsMap[c.peerUid]) { item.style.cursor = 'pointer'; item.onclick = () => S.onOpenDm?.(c.peerUid); }
    el.appendChild(item);
  });
}

export function initCalls(){
  $('call-mic').onclick = () => {
    const t = S.room?.local.getAudioTracks()[0]; if (!t) return;
    t.enabled = !t.enabled;
    $('call-mic').textContent = t.enabled ? '🎤 Mic' : '🔇 Mudo';
    $('cinema-mic-btn').textContent = t.enabled ? '🎤 Mic' : '🔇 Mudo';
  };
  $('cinema-mic-btn').onclick = () => $('call-mic').click();
  $('call-cam').onclick = () => S.room && toggleExtra('cam', () => navigator.mediaDevices.getUserMedia({ video: isPulse() ? { width: 1280, height: 720 } : true }));
  $('call-scr').onclick = () => S.room && toggleExtra('scr', () => navigator.mediaDevices.getDisplayMedia({ video: true, audio: isPulse() }));
  $('call-cinema-btn').onclick = openCinemaFromAnywhere;
  $('call-add').onclick = () => {
    const box = $('call-invite-list'); box.innerHTML = '';
    Object.entries(S.friendsMap).forEach(([k, f]) => {
      const b = document.createElement('button'); b.className = 'btn'; b.textContent = f.nick || 'Amigo';
      b.onclick = async () => { await sendInviteTo(f.uid || k, S.room.id); showToast('Convite enviado para ' + (f.nick || 'amigo')); };
      box.appendChild(b);
    });
    box.style.display = box.style.display === 'flex' ? 'none' : 'flex';
  };
  $('call-leave').onclick = () => {
    if (!S.room) return;
    if (cinemaUnsub) { cinemaUnsub(); cinemaUnsub = null; }
    if (cinemaChatUnsub) { cinemaChatUnsub(); cinemaChatUnsub = null; }
    S.room.unsubs.forEach(u => u()); Object.values(S.room.pcs).forEach(pc => pc.close());
    [S.room.local, S.room.cam, S.room.scr].forEach(s => s && s.getTracks().forEach(t => t.stop()));
    remove(ref(db, `rooms/${S.room.id}/p/${S.currentUser.uid}`)).catch(() => {});
    Object.keys(tiles).forEach(k => delete tiles[k]); S.room = null; closeAllViews();
  };

  $("cinema-change-url-btn").onclick = () => { $("cinema-url-input").value = ""; openModal("cinema-url-modal"); };
  $("cinema-close-btn").onclick = () => {
    $("cinema-iframe").src = "about:blank";
    if (S.room) openView('view-call'); else closeView('view-cinema');
  };
  $("cinema-url-ok").onclick = async () => {
    const raw = $("cinema-url-input").value.trim();
    if (!raw) { showToast("Cole um link do YouTube"); return; }
    const converted = formatYoutUbeUrl(raw);
    const rid = getCinemaRoomId();
    await set(ref(db, `rooms/${rid}/cinema`), {
      url: converted, rawUrl: raw, hostUid: S.currentUser.uid, state: 'playing', offset: 0, updatedAt: Date.now()
    });
    closeModals(); watchCinemaRoom(rid); openView('view-cinema');
  };

  $("cinema-chat-send").onclick = async () => {
    const txt = $("cinema-chat-input").value.trim();
    if (!txt || !S.currentUser) return;
    await push(ref(db, `rooms/${getCinemaRoomId()}/cinemaChat`), { nick: S.userProfile.nick || "Anônimo", text: txt, t: Date.now() });
    $("cinema-chat-input").value = "";
  };
  $("cinema-chat-input").addEventListener("keypress", (e) => { if (e.key === 'Enter') $("cinema-chat-send").click(); });

  $("cinema-play-btn").onclick = async () => {
    const rid = getCinemaRoomId();
    const s = await get(ref(db, `rooms/${rid}/cinema`));
    const cur = s.val() || {};
    await update(ref(db, `rooms/${rid}/cinema`), { state: cur.state === 'playing' ? 'paused' : 'playing', updatedAt: Date.now() });
    showToast(cur.state === 'playing' ? "Pausado para a sala" : "Reproduzindo para a sala");
  };
  $("cinema-back-btn").onclick = () => showToast("⏪ -15s sincronizado");
  $("cinema-fwd-btn").onclick = () => showToast("⏩ +15s sincronizado");
  $("cinema-seek-btn").onclick = () => { const t = $("cinema-seek-input").value.trim(); if (t) showToast("⏱️ Sincronizado em " + t); };
}