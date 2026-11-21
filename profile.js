import { ref, set, update, get, onValue, onDisconnect, push } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { auth, db, S, $, esc, todayKey, TTL_OFFLINE_MS, HEARTBEAT_MS, DEFAULT_AVATAR, isPulse, maxUploadMB, userStrikes, applyAgeBadge, labelState, fileToBase64 } from "./state.js";
import { showToast, openView, closeView, openModal, closeModals, refreshEmojiPickers } from "./ui.js";

export const VERIFIED_SVG = `<span class="verified-badge" title="Assinante Verificado"><svg viewBox="0 0 24 24"><path fill="#0095F6" d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484z"/><path fill="#fff" d="M10.8 16.2l-3.6-3.6 1.4-1.4 2.2 2.2 4.8-4.8 1.4 1.4z"/></svg></span>`;

export const NICK_FONTS = [
  'Inter', 'Playfair Display', 'Orbitron', 'Pacifico', 'Bebas Neue',
  'Space Mono', 'Press Start 2P', 'Lobster', 'Cinzel', 'Caveat',
  'Abril Fatface', 'Righteous', 'Dancing Script', 'Bangers', 'Fredoka'
];

const mkSvgDeco = (inner) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${inner}</svg>`)}`;
const EXTRA_DECOS = [
  { id: 'none', label: 'Nenhuma', url: '', pulse: false },
  { id: 'natal', label: 'Natal', url: 'natal.png', pulse: true },
  { id: 'gold', label: 'Dourado', url: mkSvgDeco('<circle cx="50" cy="50" r="46" fill="none" stroke="#e8b923" stroke-width="5"/><circle cx="50" cy="4" r="4" fill="#fdeaa8"/><circle cx="50" cy="96" r="4" fill="#fdeaa8"/>'), pulse: false },
  { id: 'neon', label: 'Neon', url: mkSvgDeco('<circle cx="50" cy="50" r="46" fill="none" stroke="#00f0ff" stroke-width="4" stroke-dasharray="14 6"/>'), pulse: true },
  { id: 'flame', label: 'Aura', url: mkSvgDeco('<circle cx="50" cy="50" r="45" fill="none" stroke="#ff5e3a" stroke-width="5"/><circle cx="50" cy="50" r="40" fill="none" stroke="#ffd23f" stroke-width="2" stroke-dasharray="8 8"/>'), pulse: true },
  { id: 'stars', label: 'Estrelas', url: mkSvgDeco('<circle cx="50" cy="50" r="46" fill="none" stroke="#a78bfa" stroke-width="3"/><polygon points="15,18 18,24 24,25 19,29 20,35 15,32 10,35 11,29 6,25 12,24" fill="#fde047"/><polygon points="85,70 87,75 92,76 88,79 89,84 85,81 81,84 82,79 78,76 83,75" fill="#fde047"/>'), pulse: false },
  { id: 'pink', label: 'Pastel', url: mkSvgDeco('<circle cx="50" cy="50" r="46" fill="none" stroke="#f472b6" stroke-width="4"/><circle cx="16" cy="22" r="5" fill="#fbcfe8"/><circle cx="84" cy="78" r="5" fill="#fbcfe8"/>'), pulse: false }
];

const SVG_BAN = '<svg class="ui-icon lg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>';
const SVG_LOCK = '<svg class="ui-icon sm" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

let heartbeatInt = null, profileUnsub = null, editAvatar = "", editBanner = "", editDeco = "", editProof = "";
let reportTarget = { uid: null, nick: '', avatar: '' };

function injectExtraAssets(){
  if (!$("hezz-fonts-link")) {
    const l = document.createElement("link");
    l.id = "hezz-fonts-link"; l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Bangers&family=Bebas+Neue&family=Caveat:wght@700&family=Cinzel:wght@700&family=Dancing+Script:wght@700&family=Fredoka:wght@600&family=Lobster&family=Orbitron:wght@700&family=Pacifico&family=Playfair+Display:wght@700&family=Press+Start+2P&family=Righteous&family=Space+Mono:wght@700&display=swap";
    document.head.appendChild(l);
  }
  if (!$("hezz-extra-css")) {
    const st = document.createElement("style");
    st.id = "hezz-extra-css";
    st.textContent = `.verified-badge{display:inline-flex;align-items:center;width:16px;height:16px;vertical-align:middle;flex-shrink:0}.verified-badge svg{width:16px;height:16px}.nick-grad{-webkit-background-clip:text!important;background-clip:text!important;-webkit-text-fill-color:transparent!important;color:transparent!important}.font-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px}.font-opt{padding:8px;border:2px solid var(--gold-light);border-radius:10px;background:var(--white);color:var(--text);cursor:pointer;font-size:.82rem;display:flex;align-items:center;justify-content:center;gap:4px}.font-opt.active{border-color:var(--gold);background:var(--gold-soft)}.font-opt.locked{opacity:.55}.profile-badges-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}.badge-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:999px;background:rgba(255,255,255,.88);color:#222;border:1px solid var(--gold-light);font-size:.72rem;font-weight:700}.badge-chip img{width:16px;height:16px;border-radius:50%;object-fit:cover}.pm-panel-box{background:rgba(255,255,255,.82);color:#222;border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:5px;backdrop-filter:blur(6px)}.emoji-locked::after{content:""!important;width:15px!important;height:15px!important;right:2px!important;bottom:2px!important;background:rgba(0,0,0,.78) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2.5'%3E%3Crect x='3' y='11' width='18' height='11' rx='2'/%3E%3Cpath d='M7 11V7a5 5 0 0 1 10 0v4'/%3E%3C/svg%3E") center/10px no-repeat!important;border-radius:50%}`;
    document.head.appendChild(st);
  }
}

function ensureProfileFormControls(){
  if ($("official-nick-input")) return;
  const form = $("profile-form");
  const nickInp = $("nick-input").closest(".form-group");
  const div = document.createElement("div");
  div.innerHTML = `
    <div class="form-group" style="margin-top:12px;"><label>Nick Oficial da Conta (@arroba - fixo)</label><input type="text" id="official-nick-input" maxlength="24" placeholder="@seuarroba" /></div>
    <div class="form-group" style="margin-top:12px;"><label>Fonte do Nick (15 opções - PULSE)</label><div id="nick-font-grid" class="font-grid"></div></div>
    <div class="gradient-controls" style="margin-top:12px;"><label><input type="checkbox" id="nick-grad-toggle" /> Gradiente no Nick (PULSE)</label><div style="flex:1;display:flex;gap:8px;justify-content:flex-end;"><input type="color" id="nick-grad-1" value="#e8b923" /><input type="color" id="nick-grad-2" value="#e26a6a" /></div></div>
    <div class="gradient-controls" style="margin-top:10px;"><label><input type="checkbox" id="profile-bg-toggle" /> Fundo Gradiente do Perfil (Discord)</label><div style="flex:1;display:flex;gap:8px;justify-content:flex-end;"><input type="color" id="profile-bg-top" value="#d6e4f0" /><input type="color" id="profile-bg-bottom" value="#f0d9e8" /></div></div>
  `;
  nickInp.after(...div.children);
  ["official-nick-input", "nick-grad-1", "nick-grad-2", "profile-bg-top", "profile-bg-bottom"].forEach(id => $(id).addEventListener("input", applyPreview));
  ["nick-grad-toggle", "profile-bg-toggle"].forEach(id => $(id).addEventListener("change", applyPreview));
}

export function nickStyleAttr(u){
  const font = u.nickFont ? `font-family:'${esc(u.nickFont)}',sans-serif;` : '';
  if (u.nickGradEnabled && u.plan === 'pulse') {
    return { cls: 'nick-grad', style: `${font}background:linear-gradient(90deg,${u.nickGrad1 || '#e8b923'},${u.nickGrad2 || '#e26a6a'});` };
  }
  return { cls: '', style: font };
}

export async function ensureUserDoc(uid){
  const userRef = ref(db, `users/${uid}`);
  const snap = await get(userRef);
  const defHandle = `@user_${uid.slice(0,5).toLowerCase()}`;
  if (!snap.exists()){
    await set(userRef, {
      uid, nick: "Anônimo_" + uid.slice(0,4), handle: defHandle, fixedNick: "Anônimo_" + uid.slice(0,4),
      bio: "", status: "", state: "online", avatarUrl: "", bannerUrl: "", decoUrl: "", ageRating: "under16",
      nickFont: "Inter", nickGradEnabled: false, nickGrad1: "#e8b923", nickGrad2: "#e26a6a",
      profileBgEnabled: false, profileBgTop: "#d6e4f0", profileBgBottom: "#f0d9e8",
      gradientEnabled: false, gradientTop: "#d6e4f0", gradientBottom: "#f0d9e8",
      isAnonymous: !!auth.currentUser?.isAnonymous, plan: "free", pulsePending: false, revokePending: false,
      strikes: 0, banned: false, privacy: { friendRequests: "all" },
      createdAt: Date.now(), lastSeen: Date.now(), expireAt: Date.now() + TTL_OFFLINE_MS
    });
  } else {
    const val = snap.val();
    const upd = { lastSeen: Date.now(), expireAt: Date.now() + TTL_OFFLINE_MS };
    if (!val.handle) upd.handle = defHandle;
    if (!val.fixedNick) upd.fixedNick = val.nick || "Anônimo";
    await update(userRef, upd);
  }
}

export function startHeartbeat(uid){
  if (heartbeatInt) clearInterval(heartbeatInt);
  heartbeatInt = setInterval(() => {
    if (S.currentUser) update(ref(db, `users/${uid}`), { lastSeen: Date.now(), expireAt: Date.now() + TTL_OFFLINE_MS }).catch(() => {});
  }, HEARTBEAT_MS);
}

export function setupDisconnect(uid){
  onDisconnect(ref(db, `users/${uid}/expireAt`)).set(Date.now() + TTL_OFFLINE_MS);
  onDisconnect(ref(db, `users/${uid}/lastSeen`)).set(Date.now());
}

export function subscribeProfile(uid){
  if (profileUnsub) profileUnsub();
  profileUnsub = onValue(ref(db, `users/${uid}`), (snap) => { S.userProfile = snap.val() || {}; renderProfile(S.userProfile); });
}

function renderProfile(d){
  $("banned-overlay").style.display = (d.banned || Number(d.strikes || 0) >= 3) ? "grid" : "none";
  const st = nickStyleAttr(d);
  const sn = $("sidebar-nick");
  sn.textContent = d.nick || "Anônimo";
  sn.className = "nick " + st.cls; sn.style.cssText = st.style;
  let sbVer = $("sidebar-verified");
  if (!sbVer) { sbVer = document.createElement("span"); sbVer.id = "sidebar-verified"; sn.after(sbVer); }
  sbVer.innerHTML = d.plan === "pulse" ? VERIFIED_SVG : "";

  $("sidebar-status-text").textContent = d.status || labelState(d.state);
  $("sidebar-avatar").src = d.avatarUrl || DEFAULT_AVATAR;
  const deco = $("sidebar-avatar-deco");
  if (d.decoUrl) { deco.src = d.decoUrl; deco.style.display = "block"; } else { deco.style.display = "none"; deco.src = ""; }
  $("sidebar-state-dot").className = "avatar-state " + (d.state || "offline");
  $("sidebar-badge").style.display = (d.plan === "pulse") ? "inline-block" : "none";
  const privacySel = $("privacy-friend-requests");
  if (privacySel) privacySel.value = (d.privacy && d.privacy.friendRequests) || "all";

  const restricted = userStrikes() >= 2;
  $("discover-restricted").classList.toggle("hidden", !restricted);
  $("discover-search-wrap").style.display = restricted ? "none" : "flex";
  $("discover-list").style.display = restricted ? "none" : "grid";

  S.onRenderAccount?.(); S.onRenderPlanState?.(); refreshEmojiPickers(); S.onRenderDiscover?.();
}

function buildDecoPresets(sel){
  const grid = $("deco-presets"); grid.innerHTML = "";
  EXTRA_DECOS.forEach(p => {
    const btn = document.createElement("button"); btn.type = "button";
    btn.className = "deco-option" + (sel === p.url ? " active" : "");
    btn.innerHTML = p.url ? `<img src="${p.url}" alt=""><span>${p.label}${p.pulse && !isPulse() ? ' ' + SVG_LOCK : ''}</span>` : `<span style="height:36px;display:grid;place-items:center;">${SVG_BAN}</span><span>${p.label}</span>`;
    btn.onclick = () => {
      if (p.pulse && !isPulse()) return showToast("Moldura exclusiva do PULSE!");
      editDeco = ""; $("deco-url").value = p.url; buildDecoPresets(p.url); applyPreview();
    };
    grid.appendChild(btn);
  });
}

function buildFontGrid(sel){
  const grid = $("nick-font-grid"); if (!grid) return;
  grid.innerHTML = "";
  NICK_FONTS.forEach(f => {
    const b = document.createElement("button"); b.type = "button";
    const locked = f !== 'Inter' && !isPulse();
    b.className = "font-opt" + (sel === f ? " active" : "") + (locked ? " locked" : "");
    b.style.fontFamily = `'${f}', sans-serif`;
    b.innerHTML = `${f}${locked ? ' ' + SVG_LOCK : ''}`;
    b.onclick = () => {
      if (locked) return showToast("As 15 fontes de nick são exclusivas do PULSE!");
      grid.dataset.selected = f; buildFontGrid(f); applyPreview();
    };
    grid.appendChild(b);
  });
  grid.dataset.selected = sel || 'Inter';
}

function applyPreview(){
  const banner = editBanner || $("banner-url").value.trim(), avatar = editAvatar || $("avatar-url").value.trim(), deco = editDeco || $("deco-url").value.trim();
  const pBanner = $("preview-banner");
  if ($("gradient-toggle").checked) { pBanner.style.backgroundImage = "none"; pBanner.style.background = `linear-gradient(to bottom, ${$("gradient-top").value}, ${$("gradient-bottom").value})`; }
  else if (banner) { pBanner.style.background = ""; pBanner.style.backgroundImage = `url("${banner}")`; }
  else { pBanner.style.backgroundImage = ""; pBanner.style.background = "var(--pastel-pink)"; }
  $("preview-avatar").src = avatar || DEFAULT_AVATAR;
  const pDeco = $("preview-avatar-deco");
  if (deco) { pDeco.src = deco; pDeco.style.display = "block"; } else { pDeco.style.display = "none"; pDeco.src = ""; }
}

export function loadProfileIntoForm(){
  ensureProfileFormControls();
  const d = S.userProfile || {};
  editAvatar = ""; editBanner = ""; editDeco = "";
  $("nick-input").value = d.nick || "";
  $("official-nick-input").value = d.handle || `@user_${(S.currentUser?.uid || 'hezz').slice(0,5).toLowerCase()}`;
  $("bio-input").value = d.bio || "";
  $("age-input").value = d.ageRating || "under16";
  $("state-input").value = d.state || "online";
  $("status-input").value = d.status || "";
  $("banner-url").value = d.bannerUrl || ""; $("avatar-url").value = d.avatarUrl || ""; $("deco-url").value = d.decoUrl || "";
  $("gradient-toggle").checked = !!d.gradientEnabled; $("gradient-top").value = d.gradientTop || "#d6e4f0"; $("gradient-bottom").value = d.gradientBottom || "#f0d9e8";
  $("nick-grad-toggle").checked = !!d.nickGradEnabled; $("nick-grad-1").value = d.nickGrad1 || "#e8b923"; $("nick-grad-2").value = d.nickGrad2 || "#e26a6a";
  $("profile-bg-toggle").checked = !!d.profileBgEnabled; $("profile-bg-top").value = d.profileBgTop || "#d6e4f0"; $("profile-bg-bottom").value = d.profileBgBottom || "#f0d9e8";
  buildDecoPresets(d.decoUrl || "");
  buildFontGrid(d.nickFont || "Inter");
  applyPreview();
}

export async function openUserProfileModal(uid){
  if (uid === 'hezz_bot' || uid === 'hezz_ticket_bot') {
    $("user-profile-modal").style.background = "";
    $("upm-banner").style.background = "linear-gradient(135deg, var(--gold-light), var(--pastel-blue))";
    $("upm-avatar").src = "foto.png"; $("upm-deco").style.display = "none";
    $("upm-nick").textContent = "Hezz Bot"; $("upm-nick").className = ""; $("upm-nick").style.cssText = "";
    $("upm-badge").style.display = "inline-block"; $("upm-badge").textContent = "BOT OFICIAL";
    $("upm-age").textContent = "Oficial"; $("upm-status").textContent = "Sistema & Suporte HEZZ";
    $("upm-bio").textContent = "Canal oficial de alertas de moderação e atendimento do HEZZ.";
    $("upm-bot-support").style.display = "flex"; $("upm-add-friend-btn").style.display = "none"; $("upm-report-btn").style.display = "none";
    if ($("upm-badges-row")) $("upm-badges-row").innerHTML = "";
    if ($("upm-handle")) $("upm-handle").textContent = "@hezz_bot";
    openModal("user-profile-modal"); return;
  }

  try {
    const snap = await get(ref(db, `users/${uid}`));
    const u = snap.val() || {};
    const modal = $("user-profile-modal");
    modal.style.background = u.profileBgEnabled ? `linear-gradient(180deg, ${u.profileBgTop || '#d6e4f0'}, ${u.profileBgBottom || '#f0d9e8'})` : "";

    if (u.gradientEnabled) { $("upm-banner").style.backgroundImage = "none"; $("upm-banner").style.background = `linear-gradient(to bottom, ${u.gradientTop || '#d6e4f0'}, ${u.gradientBottom || '#f0d9e8'})`; }
    else if (u.bannerUrl) { $("upm-banner").style.backgroundImage = `url("${u.bannerUrl}")`; }
    else { $("upm-banner").style.backgroundImage = ""; $("upm-banner").style.background = "var(--pastel-blue)"; }

    $("upm-avatar").src = u.avatarUrl || DEFAULT_AVATAR;
    if (u.decoUrl) { $("upm-deco").src = u.decoUrl; $("upm-deco").style.display = "block"; } else $("upm-deco").style.display = "none";

    const st = nickStyleAttr(u);
    $("upm-nick").innerHTML = `${esc(u.nick || "Usuário")} ${u.plan === 'pulse' ? VERIFIED_SVG : ''}`;
    $("upm-nick").className = st.cls; $("upm-nick").style.cssText = st.style;
    $("upm-badge").style.display = (u.plan === 'pulse') ? "inline-block" : "none"; $("upm-badge").textContent = "LOVER";
    applyAgeBadge($("upm-age"), u.ageRating === '18+' ? '18+' : u.ageRating === '16+' ? '16+' : 'all');

    let handleEl = $("upm-handle");
    if (!handleEl) { handleEl = document.createElement("div"); handleEl.id = "upm-handle"; handleEl.style.cssText = "font-size:.76rem;font-weight:700;opacity:.8;"; $("upm-status").before(handleEl); }
    handleEl.textContent = `${u.handle || '@hezz'} • Fixo: ${u.fixedNick || u.nick || 'Anônimo'}`;

    $("upm-status").textContent = u.status || labelState(u.state);
    $("upm-bio").textContent = u.bio || "Sem bio.";
    $("upm-bot-support").style.display = "none";

    let bRow = $("upm-badges-row");
    if (!bRow) { bRow = document.createElement("div"); bRow.id = "upm-badges-row"; bRow.className = "profile-badges-row"; $("upm-bio").after(bRow); }
    bRow.innerHTML = "";
    Object.values(u.earnedBadges || {}).forEach(b => {
      const chip = document.createElement("span"); chip.className = "badge-chip";
      chip.innerHTML = (b.imageUrl ? `<img src="${b.imageUrl}" alt="">` : (b.iconSvg || '')) + `<span>${esc(b.name)}</span>`;
      bRow.appendChild(chip);
    });

    const isSelf = S.currentUser && uid === S.currentUser.uid;
    $("upm-add-friend-btn").style.display = (isSelf || S.friendsMap[uid]) ? "none" : "inline-flex";
    $("upm-add-friend-btn").onclick = () => { S.onSendFriendRequest?.(uid); closeModals(); };
    $("upm-report-btn").style.display = isSelf ? "none" : "inline-flex";
    $("upm-report-btn").onclick = () => {
      reportTarget = { uid, nick: u.nick || "Usuário", avatar: u.avatarUrl || "" };
      $("rep-target-nick").textContent = reportTarget.nick; $("rep-reason").value = ""; editProof = "";
      $("rep-proof-preview").style.display = "none"; openModal("report-modal");
    };
    openModal("user-profile-modal");
  } catch (err) { showToast("Erro ao carregar perfil: " + err.message); }
}

export function initProfile(){
  injectExtraAssets();
  $("profile-card").addEventListener("click", () => { if (!S.currentUser) return showToast("Aguarde conectar..."); loadProfileIntoForm(); openView('view-profile'); });
  ['banner-url', 'avatar-url', 'deco-url', 'gradient-top', 'gradient-bottom'].forEach(id => {
    $(id).addEventListener("input", () => { if (id === 'avatar-url') editAvatar = ""; if (id === 'banner-url') editBanner = ""; if (id === 'deco-url') editDeco = ""; applyPreview(); });
  });
  $("gradient-toggle").addEventListener("change", applyPreview);

  const bindFile = (id, setter, urlId) => $(id).addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!isPulse()) { showToast("Upload direto exclusivo do PULSE."); e.target.value = ""; return; }
    try { const b = await fileToBase64(f, maxUploadMB() * 1024 * 1024); setter(b); $(urlId).value = ""; applyPreview(); } catch (err) { showToast(err.message); }
    e.target.value = "";
  });
  bindFile("banner-file", v => editBanner = v, "banner-url");
  bindFile("avatar-file", v => editAvatar = v, "avatar-url");
  bindFile("deco-file", v => editDeco = v, "deco-url");

  $("save-profile-btn").addEventListener("click", async () => {
    if (!S.currentUser) return;
    const newAvatar = editAvatar || $("avatar-url").value.trim(), newBanner = editBanner || $("banner-url").value.trim(), newDeco = editDeco || $("deco-url").value.trim();
    const changedPhoto = (newAvatar !== (S.userProfile.avatarUrl || "")) || (newBanner !== (S.userProfile.bannerUrl || ""));
    let photoChanges = S.userProfile.photoChanges || { date: todayKey(), count: 0 };
    if (photoChanges.date !== todayKey()) photoChanges = { date: todayKey(), count: 0 };
    if (changedPhoto) { if (photoChanges.count >= 5) return showToast("Limite de 5 trocas de foto por dia atingido!"); photoChanges.count += 1; }

    let handle = ($("official-nick-input")?.value || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    handle = handle ? `@${handle}` : (S.userProfile.handle || `@user_${S.currentUser.uid.slice(0,5).toLowerCase()}`);

    const payload = {
      nick: $("nick-input").value.trim() || "Anônimo", handle,
      bio: $("bio-input").value.trim(), ageRating: $("age-input").value, state: $("state-input").value, status: $("status-input").value.trim(),
      bannerUrl: newBanner, avatarUrl: newAvatar, decoUrl: newDeco, photoChanges,
      nickFont: $("nick-font-grid")?.dataset.selected || "Inter",
      nickGradEnabled: !!$("nick-grad-toggle")?.checked, nickGrad1: $("nick-grad-1")?.value || "#e8b923", nickGrad2: $("nick-grad-2")?.value || "#e26a6a",
      profileBgEnabled: !!$("profile-bg-toggle")?.checked, profileBgTop: $("profile-bg-top")?.value || "#d6e4f0", profileBgBottom: $("profile-bg-bottom")?.value || "#f0d9e8",
      gradientEnabled: $("gradient-toggle").checked, gradientTop: $("gradient-top").value, gradientBottom: $("gradient-bottom").value,
      lastSeen: Date.now(), expireAt: Date.now() + TTL_OFFLINE_MS
    };
    try { await update(ref(db, `users/${S.currentUser.uid}`), payload); showToast("Perfil salvo!"); closeView('view-profile'); }
    catch (err) { showToast("Erro ao salvar: " + err.message); }
  });

  $("upm-support-chat-btn").onclick = () => { closeModals(); S.onOpenSupportModal?.(); };
  $("rep-proof-file").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { editProof = await fileToBase64(f, 5 * 1024 * 1024); $("rep-proof-preview").src = editProof; $("rep-proof-preview").style.display = "block"; }
    catch (err) { showToast(err.message); }
    e.target.value = "";
  });
  $("rep-submit-btn").onclick = async () => {
    if (!S.currentUser || !reportTarget.uid) return;
    const reason = $("rep-reason").value.trim(); if (!reason) return showToast("Descreva o motivo");
    try {
      await push(ref(db, "reports"), { targetUid: reportTarget.uid, targetNick: reportTarget.nick, targetAvatar: reportTarget.avatar, reporterUid: S.currentUser.uid, reporterNick: S.userProfile.nick || "Anônimo", reason, proofUrl: editProof || "", status: "pending", createdAt: Date.now() });
      closeModals(); showToast("Denúncia enviada!");
    } catch (err) { showToast("Erro: " + err.message); }
  };
}