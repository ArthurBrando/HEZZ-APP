import { ref, set, onValue, onDisconnect } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { db, S, $, esc, SIDEBAR_W, KLIPY_KEY, isPulse, maxAudioSec } from "./state.js";

let toastTimer = null, typingTimer = null, mediaRecorder = null, isRecording = false, recordTarget = 'server', recordTimer = null, lastBuiltKey = null;
let audioChunks = [];
const typingUnsubs = {};
const emojis = "😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👿 👹 👺 🤡 💩 👻 💀 👽 👾 🤖 🎃 😺 😸 😹 😻 😼 😽 🙀 😿 😾".split(" ");

export function showErrorBanner(msg){ const b = $("firebase-error-banner"); if (b) { $("firebase-error-text").textContent = msg; b.classList.remove("hidden"); } }
export function showToast(msg){ $("toast-text").textContent = msg; $("toast").classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2600); }
export function copyText(t){ navigator.clipboard?.writeText ? navigator.clipboard.writeText(t).then(() => showToast("Copiado!")).catch(() => showToast("Copie: " + t)) : showToast("Copie: " + t); }
export function closeAllViews(){ document.querySelectorAll('.view').forEach(v => v.classList.remove('active')); }
export function openView(id){ closeAllViews(); $(id).classList.add('active'); }
export function closeView(id){
  $(id).classList.remove("active");
  if (id === 'view-server') { S.serverUnsub?.(); S.serverUnsub = null; S.serverChatUnsub?.(); S.serverChatUnsub = null; S.currentServerId = null; S.currentServerData = null; }
  if (id === 'view-dm' && S.dmUnsub) { S.dmUnsub(); S.dmUnsub = null; S.currentDmUid = null; S.currentGroupId = null; }
}
export function closeModals(){ $("modal-backdrop").classList.remove("show"); document.querySelectorAll(".hezz-modal").forEach(m => m.classList.remove("show")); }
export function openModal(id){ document.querySelectorAll(".hezz-modal").forEach(m => m.classList.remove("show")); $("modal-backdrop").classList.add("show"); $(id).classList.add("show"); }
window.closeView = closeView; window.closeModals = closeModals;

function setOffset(px, animate = true){
  document.documentElement.style.setProperty("--so", `${px}px`);
  const sb = $("sidebar"), dh = $("drag-handle");
  sb.classList.toggle("no-trans", !animate); dh.classList.toggle("no-trans", !animate);
}
export function setOpen(open){ S.isSidebarOpen = open; setOffset(open ? SIDEBAR_W : 0, true); }

export function watchTyping(path, barId){
  typingUnsubs[barId]?.();
  const bar = $(barId); bar.innerHTML = "";
  typingUnsubs[barId] = onValue(ref(db, path), (snap) => {
    const now = Date.now(), names = [];
    snap.forEach(c => { const v = c.val(); if (c.key !== S.currentUser?.uid && v && now - v.t < 6000) names.push(v.nick || "Alguém"); });
    const dots = '<span class="dots"><span>.</span><span>.</span><span>.</span></span>';
    bar.innerHTML = !names.length ? "" : names.length === 1 ? `<b>${esc(names[0])}</b> digitando${dots}` : `${names.length} digitando${dots}`;
  });
}
export function bindTyping(inputId, getPath){
  $(inputId).addEventListener("input", () => {
    const p = getPath(); if (!p || !S.currentUser) return;
    const r = ref(db, `${p}/${S.currentUser.uid}`);
    set(r, { nick: S.userProfile.nick || "Anônimo", t: Date.now() }).catch(() => {});
    onDisconnect(r).remove();
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => set(r, null).catch(() => {}), 3000);
  });
}

export function fmt(t){
  return String(t).split('\n').map(line => {
    let lvl = 0, s = line; const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) { lvl = h[1].length; s = h[2]; }
    s = esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>')
      .replace(/:pulse([1-5]):/g, '<img class="pemoji" src="emoji$1.png" alt="">')
      .replace(/(^|\s)(@[\wÀ-ú.-]+)/g, '$1<span class="mention">$2</span>');
    return lvl ? `<div style="font-weight:800;font-size:${[0, 1.4, 1.2, 1.05][lvl]}rem">${s}</div>` : s;
  }).join('<br>');
}

export const createAudioPlayerHTML = (src) => `<div class="custom-audio-player"><button class="play-btn"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></button><div class="progress-track"><div class="progress-fill"></div></div><span class="time">0:00</span><audio src="${src}" preload="metadata"></audio></div>`;
export const formatTime = (s) => isNaN(s) ? '0:00' : `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`;
export function bindAudioPlayer(msgEl){
  const pl = msgEl.querySelector('.custom-audio-player'); if (!pl) return;
  const a = pl.querySelector('audio'), pb = pl.querySelector('.play-btn'), pf = pl.querySelector('.progress-fill'), te = pl.querySelector('.time'), tr = pl.querySelector('.progress-track');
  pb.onclick = () => a.paused ? (a.play(), pb.innerHTML='<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>') : (a.pause(), pb.innerHTML='<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>');
  a.ontimeupdate = () => { pf.style.width = (a.duration ? (a.currentTime/a.duration)*100 : 0) + '%'; te.textContent = formatTime(a.currentTime); };
  a.onended = () => { pb.innerHTML='<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>'; pf.style.width='0%'; te.textContent='0:00'; };
  tr.onclick = (e) => { if (a.duration) a.currentTime = ((e.clientX - tr.getBoundingClientRect().left) / tr.getBoundingClientRect().width) * a.duration; };
}

async function toggleAudioRecord(target, btnEl){
  if (isRecording) { clearTimeout(recordTimer); mediaRecorder.stop(); isRecording = false; btnEl.classList.remove("recording"); return; }
  recordTarget = target;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream); audioChunks = [];
    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = () => {
      clearTimeout(recordTimer);
      const r = new FileReader();
      r.onload = () => recordTarget === 'server' ? S.onSendServerAudio?.(r.result) : S.onSendDmAudio?.(r.result);
      r.readAsDataURL(new Blob(audioChunks, { type: 'audio/webm' }));
      stream.getTracks().forEach(t => t.stop());
    };
    mediaRecorder.start(); isRecording = true; btnEl.classList.add("recording");
    showToast(`Gravando... (máx ${maxAudioSec()}s)`);
    recordTimer = setTimeout(() => { if (isRecording && mediaRecorder?.state !== 'inactive') { mediaRecorder.stop(); isRecording = false; btnEl.classList.remove("recording"); } }, maxAudioSec() * 1000);
  } catch (err) { showToast("Microfone: " + err.message); }
}

async function loadKlipyGifs(gridEl, q, target, pickerEl){
  gridEl.innerHTML = '<div class="empty" style="grid-column:1/-1;">Carregando GIFs...</div>';
  try {
    const cid = encodeURIComponent(S.currentUser?.uid || 'hezz_guest');
    const url = q ? `https://api.klipy.com/api/v1/${KLIPY_KEY}/gifs/search?page=1&per_page=24&q=${encodeURIComponent(q)}&customer_id=${cid}&locale=br`
                  : `https://api.klipy.com/api/v1/${KLIPY_KEY}/gifs/trending?page=1&per_page=24&customer_id=${cid}&locale=br`;
    const res = await fetch(url);
    const json = await res.json();
    const items = (json?.data?.data || json?.data || []).filter(i => i.type !== 'ad');
    gridEl.innerHTML = "";
    if (!items.length) { gridEl.innerHTML = '<div class="empty" style="grid-column:1/-1;">Nenhum GIF encontrado.</div>'; return; }
    items.forEach(item => {
      const gifUrl = item.file?.md?.gif?.url || item.file?.sm?.gif?.url || item.file?.hd?.gif?.url || item.file?.md?.webp?.url;
      if (!gifUrl) return;
      const d = document.createElement("div"); d.className = "gif-item";
      d.innerHTML = `<img src="${gifUrl}" alt="GIF" loading="lazy">`;
      d.onclick = () => {
        pickerEl.classList.remove("show");
        if (target === 'server') S.onSendServerGif?.(gifUrl, item.slug || '');
        else S.onSendDmGif?.(gifUrl, item.slug || '');
      };
      gridEl.appendChild(d);
    });
  } catch (e) { gridEl.innerHTML = '<div class="empty" style="grid-column:1/-1;">Erro ao buscar GIFs.</div>'; }
}

function buildEmojiPicker(pickerEl, inputEl, target){
  if (!pickerEl) return;
  pickerEl.innerHTML = `
    <div class="picker-tabs">
      <button type="button" class="picker-tab active" data-pt="emoji"><svg class="ui-icon sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/></svg>Emojis</button>
      <button type="button" class="picker-tab" data-pt="gif"><svg class="ui-icon sm" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 10v4h3M14 10v4M18 10h-2v4"/></svg>GIFs</button>
    </div>
    <div class="picker-body">
      <div class="emoji-grid"></div>
      <div class="gif-box">
        <div class="gif-search-row">
          <input type="text" placeholder="Pesquisar GIFs no KLIPY..." />
          <button type="button" class="mini-btn gold"><svg class="ui-icon sm" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button>
        </div>
        <div class="gif-grid"></div>
        <div class="klipy-attr">Powered by KLIPY</div>
      </div>
    </div>`;

  const grid = pickerEl.querySelector('.emoji-grid');
  const gifBox = pickerEl.querySelector('.gif-box');
  const gifGrid = pickerEl.querySelector('.gif-grid');
  const gifInp = gifBox.querySelector('input');

  // ✅ NOVO: EMOJIS DO SERVIDOR — aparecem SEM cadeado quando você está num servidor
  if (target === 'server' && S.currentServerId) {
    const secSrv = document.createElement("div");
    secSrv.className = "emoji-sec";
    secSrv.textContent = "EMOJIS DESTE SERVIDOR";
    grid.appendChild(secSrv);

    for (let i = 1; i <= 5; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "emoji-btn"; // sem cadeado — uso livre dentro do servidor
      b.innerHTML = `<img class="pemoji" src="emoji${i}.png" alt="">`;
      b.title = "Uso livre dentro deste servidor";
      b.onclick = () => { inputEl.value += `:pulse${i}:`; inputEl.focus(); };
      grid.appendChild(b);
    }
  }

  // Seção PULSE (com cadeado se não for assinante)
  const sec = document.createElement("div");
  sec.className = "emoji-sec";
  sec.textContent = "EMOJIS DO ASSINANTE (PULSE)";
  grid.appendChild(sec);
  for (let i = 1; i <= 5; i++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "emoji-btn" + (isPulse() ? "" : " emoji-locked");
    b.innerHTML = `<img class="pemoji" src="emoji${i}.png" alt="">`;
    b.title = isPulse() ? "Uso em qualquer lugar (PULSE)" : "Exclusivo PULSE";
    b.onclick = () => {
      if (!isPulse()) return showToast("Emojis exclusivos para assinantes PULSE — use livremente dentro de um servidor");
      inputEl.value += `:pulse${i}:`;
      inputEl.focus();
    };
    grid.appendChild(b);
  }

  // Seção padrão
  const sec2 = document.createElement("div");
  sec2.className = "emoji-sec";
  sec2.textContent = "PADRÃO";
  grid.appendChild(sec2);
  emojis.forEach(e => {
    const btn = document.createElement("button");
    btn.className = "emoji-btn"; btn.type = "button"; btn.textContent = e;
    btn.onclick = () => { inputEl.value += e; inputEl.focus(); };
    grid.appendChild(btn);
  });

  let gifsLoaded = false, gifDebounce = null;
  pickerEl.querySelectorAll('.picker-tab').forEach(tb => tb.onclick = () => {
    pickerEl.querySelectorAll('.picker-tab').forEach(x => x.classList.remove('active'));
    tb.classList.add('active');
    const isGif = tb.dataset.pt === 'gif';
    grid.style.display = isGif ? 'none' : 'grid';
    gifBox.classList.toggle('active', isGif);
    if (isGif && !gifsLoaded) { gifsLoaded = true; loadKlipyGifs(gifGrid, '', target, pickerEl); }
  });
  gifBox.querySelector('button').onclick = () => loadKlipyGifs(gifGrid, gifInp.value.trim(), target, pickerEl);
  gifInp.oninput = () => { clearTimeout(gifDebounce); gifDebounce = setTimeout(() => loadKlipyGifs(gifGrid, gifInp.value.trim(), target, pickerEl), 400); };
}

/**
 * Reconstrói os pickers quando necessário.
 * Chave considera plano E servidor atual — então quando entra/sai de servidor, reconstrói
 * para mostrar/esconder os emojis do servidor sem cadeado.
 */
export function refreshEmojiPickers(force = false){
  const key = `${isPulse()}_${S.currentServerId || 'dm'}`;
  if (!force && lastBuiltKey === key) return;
  lastBuiltKey = key;
  buildEmojiPicker($("server-emoji-picker"), $("server-chat-input"), 'server');
  buildEmojiPicker($("dm-emoji-picker"), $("dm-input"), 'dm');
}

export function initUI(){
  const dh = $("drag-handle"); let drag = { active:false, startX:0, startOffset:0, moved:false };
  dh.addEventListener("pointerdown", (e) => { drag = { active:true, startX:e.clientX, startOffset:S.isSidebarOpen?SIDEBAR_W:0, moved:false }; setOffset(drag.startOffset, false); dh.setPointerCapture(e.pointerId); e.preventDefault(); });
  window.addEventListener("pointermove", (e) => { if (!drag.active) return; const d = e.clientX - drag.startX; if (Math.abs(d) > 4) drag.moved = true; setOffset(Math.max(0, Math.min(SIDEBAR_W, drag.startOffset + d)), false); });
  window.addEventListener("pointerup", (e) => { if (!drag.active) return; drag.active = false; setOpen(!drag.moved ? !S.isSidebarOpen : drag.startOffset + (e.clientX - drag.startX) > SIDEBAR_W / 2); });
  document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', (e) => {
    e.preventDefault(); document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active')); item.classList.add('active');
    const nav = item.dataset.nav;
    if (nav === 'home') closeAllViews(); else if (nav === 'messages') openView('view-messages');
    else if (nav === 'friends') openView('view-friends'); else if (nav === 'calls') openView('view-calls'); else if (nav === 'settings') S.onOpenSettings?.();
    setOpen(false);
  }));
  $("modal-backdrop").addEventListener("click", (e) => { if (e.target === $("modal-backdrop")) closeModals(); });
  $("server-btn-record").addEventListener("click", () => toggleAudioRecord('server', $("server-btn-record")));
  $("dm-btn-record").addEventListener("click", () => toggleAudioRecord('dm', $("dm-btn-record")));

  // ✅ Força refresh ao abrir picker (garante emojis do servidor atualizados)
  $("server-btn-emoji").addEventListener("click", (e) => {
    refreshEmojiPickers();
    e.stopPropagation();
    $("server-emoji-picker").classList.toggle("show");
    $("dm-emoji-picker").classList.remove("show");
    $("server-tools-menu").classList.remove("show");
  });
  $("dm-btn-emoji").addEventListener("click", (e) => {
    refreshEmojiPickers();
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