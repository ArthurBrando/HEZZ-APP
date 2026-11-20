import { ref, set, onValue, onDisconnect } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { db, S, $, esc, SIDEBAR_W, isPulse, maxAudioSec } from "./state.js";

let toastTimer = null;
const typingUnsubs = {};
let typingTimer = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordTarget = 'server';
let recordTimer = null;
let lastBuiltPlan = null;

export function showErrorBanner(msg){
  const banner = $("firebase-error-banner");
  if (!banner) return;
  $("firebase-error-text").textContent = msg;
  banner.classList.remove("hidden");
}

export function showToast(msg){
  $("toast-text").textContent = msg;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2600);
}

export function copyText(text){
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast("Copiado!")).catch(() => showToast("Não foi possível copiar"));
  } else {
    showToast("Copie manualmente: " + text);
  }
}

export function closeAllViews(){
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
}

export function openView(viewId){
  closeAllViews();
  $(viewId).classList.add('active');
}

export function closeView(viewId){
  $(viewId).classList.remove("active");
  if (viewId === 'view-server') {
    if (S.serverUnsub) { S.serverUnsub(); S.serverUnsub = null; }
    if (S.serverChatUnsub) { S.serverChatUnsub(); S.serverChatUnsub = null; }
    S.currentServerId = null;
    S.currentServerData = null;
  }
  if (viewId === 'view-dm' && S.dmUnsub) {
    S.dmUnsub();
    S.dmUnsub = null;
    S.currentDmUid = null;
    S.currentGroupId = null;
  }
}

export function closeModals(){
  $("modal-backdrop").classList.remove("show");
  document.querySelectorAll(".hezz-modal").forEach(m => m.classList.remove("show"));
}

export function openModal(id){
  document.querySelectorAll(".hezz-modal").forEach(m => m.classList.remove("show"));
  $("modal-backdrop").classList.add("show");
  $(id).classList.add("show");
}

window.closeView = closeView;
window.closeModals = closeModals;

function setOffset(px, animate = true){
  document.documentElement.style.setProperty("--so", `${px}px`);
  const sidebar = $("sidebar"), dragHandle = $("drag-handle");
  if (!animate) { sidebar.classList.add("no-trans"); dragHandle.classList.add("no-trans"); }
  else { sidebar.classList.remove("no-trans"); dragHandle.classList.remove("no-trans"); }
}

export function setOpen(open){
  S.isSidebarOpen = open;
  setOffset(open ? SIDEBAR_W : 0, true);
}

export function watchTyping(path, barId){
  if (typingUnsubs[barId]) typingUnsubs[barId]();
  const bar = $(barId);
  bar.innerHTML = "";
  typingUnsubs[barId] = onValue(ref(db, path), (snap) => {
    const now = Date.now(), names = [];
    snap.forEach(c => {
      const v = c.val();
      if (c.key !== S.currentUser?.uid && v && now - v.t < 6000) names.push(v.nick || "Alguém");
    });
    const dots = '<span class="dots"><span>.</span><span>.</span><span>.</span></span>';
    bar.innerHTML = !names.length ? "" : names.length === 1 ? `<b>${esc(names[0])}</b> digitando${dots}` : `${names.length} pessoas estão digitando${dots}`;
  });
}

export function bindTyping(inputId, getPath){
  $(inputId).addEventListener("input", () => {
    const p = getPath();
    if (!p || !S.currentUser) return;
    const r = ref(db, `${p}/${S.currentUser.uid}`);
    set(r, { nick: S.userProfile.nick || "Anônimo", t: Date.now() }).catch(() => {});
    onDisconnect(r).remove();
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => set(r, null).catch(() => {}), 3000);
  });
}

export function fmt(t){
  return String(t).split('\n').map(line => {
    let lvl = 0, s = line;
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) { lvl = h[1].length; s = h[2]; }
    s = esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>')
      .replace(/:pulse([1-5]):/g, '<img class="pemoji" src="emoji$1.png" alt="">')
      .replace(/(^|\s)(@[\wÀ-ú.-]+)/g, '$1<span class="mention">$2</span>');
    return lvl ? `<div style="font-weight:800;font-size:${[0, 1.4, 1.2, 1.05][lvl]}rem">${s}</div>` : s;
  }).join('<br>');
}

export function createAudioPlayerHTML(src){
  return `
    <div class="custom-audio-player">
      <button class="play-btn"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></button>
      <div class="progress-track"><div class="progress-fill"></div></div>
      <span class="time">0:00</span>
      <audio src="${src}" preload="metadata"></audio>
    </div>
  `;
}

export function formatTime(seconds){
  if (isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function bindAudioPlayer(msgEl){
  const player = msgEl.querySelector('.custom-audio-player');
  if (!player) return;
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
    const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    progressFill.style.width = pct + '%';
    timeEl.textContent = formatTime(audio.currentTime);
  });
  audio.addEventListener('ended', () => {
    playBtn.innerHTML = '<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
    progressFill.style.width = '0%';
    timeEl.textContent = '0:00';
  });
  track.addEventListener('click', (e) => {
    if (!audio.duration) return;
    const rect = track.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
  });
}

async function toggleAudioRecord(target, btnEl){
  if (isRecording) {
    if (recordTimer) { clearTimeout(recordTimer); recordTimer = null; }
    mediaRecorder.stop(); isRecording = false;
    btnEl.classList.remove("recording");
    return;
  }
  recordTarget = target;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = () => {
      if (recordTimer) { clearTimeout(recordTimer); recordTimer = null; }
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.onload = () => {
        if (recordTarget === 'server') S.onSendServerAudio?.(reader.result);
        else S.onSendDmAudio?.(reader.result);
      };
      reader.readAsDataURL(audioBlob);
      stream.getTracks().forEach(track => track.stop());
    };
    mediaRecorder.start();
    isRecording = true;
    btnEl.classList.add("recording");
    showToast(`Gravando... (máx ${maxAudioSec()}s)`);
    recordTimer = setTimeout(() => {
      if (isRecording && mediaRecorder && mediaRecorder.state !== 'inactive') {
        showToast("Limite de áudio atingido");
        mediaRecorder.stop(); isRecording = false;
        btnEl.classList.remove("recording");
      }
    }, maxAudioSec() * 1000);
  } catch (err) { showToast("Erro ao acessar microfone: " + err.message); }
}

const emojis = "😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👿 👹 👺 🤡 💩 👻 💀 👽 👾 🤖 🎃 😺 😸 😹 😻 😼 😽 🙀 😿 😾".split(" ");

function buildEmojiPicker(pickerEl, inputEl){
  if (!pickerEl) return;
  pickerEl.innerHTML = "";
  emojis.forEach(e => {
    const btn = document.createElement("button");
    btn.className = "emoji-btn"; btn.type = "button"; btn.textContent = e;
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

export function refreshEmojiPickers(){
  const p = isPulse();
  if (lastBuiltPlan === p) return;
  lastBuiltPlan = p;
  buildEmojiPicker($("server-emoji-picker"), $("server-chat-input"));
  buildEmojiPicker($("dm-emoji-picker"), $("dm-input"));
}

export function initUI(){
  const dragHandle = $("drag-handle");
  let drag = { active:false, startX:0, startOffset:0, moved:false };
  dragHandle.addEventListener("pointerdown", (e) => {
    drag.active = true; drag.moved = false;
    drag.startX = e.clientX;
    drag.startOffset = S.isSidebarOpen ? SIDEBAR_W : 0;
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
    if (!drag.moved) setOpen(!S.isSidebarOpen);
    else setOpen(drag.startOffset + (e.clientX - drag.startX) > SIDEBAR_W / 2);
  });

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
      else if (nav === 'settings') S.onOpenSettings?.();
      setOpen(false);
    });
  });

  $("modal-backdrop").addEventListener("click", (e) => {
    if (e.target === $("modal-backdrop")) closeModals();
  });

  $("server-btn-record").addEventListener("click", () => toggleAudioRecord('server', $("server-btn-record")));
  $("dm-btn-record").addEventListener("click", () => toggleAudioRecord('dm', $("dm-btn-record")));

  $("server-btn-emoji").addEventListener("click", (e) => {
    e.stopPropagation();
    $("server-emoji-picker").classList.toggle("show");
    $("dm-emoji-picker").classList.remove("show");
    $("server-tools-menu").classList.remove("show");
  });
  $("dm-btn-emoji").addEventListener("click", (e) => {
    e.stopPropagation();
    $("dm-emoji-picker").classList.toggle("show");
    $("server-emoji-picker").classList.remove("show");
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#server-emoji-picker") && !e.target.closest("#server-btn-emoji")) $("server-emoji-picker").classList.remove("show");
    if (!e.target.closest("#dm-emoji-picker") && !e.target.closest("#dm-btn-emoji")) $("dm-emoji-picker").classList.remove("show");
    if (!e.target.closest("#server-tools-menu") && !e.target.closest("#server-btn-tools")) $("server-tools-menu").classList.remove("show");
  });

  refreshEmojiPickers();
}