import { ref, set, update, get, onValue, onDisconnect, push } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { auth, db, S, $, todayKey, TTL_OFFLINE_MS, HEARTBEAT_MS, DEFAULT_AVATAR, DECO_PRESETS, isPulse, maxUploadMB, userStrikes, applyAgeBadge, labelState, fileToBase64 } from "./state.js";
import { showToast, openView, closeView, openModal, closeModals, refreshEmojiPickers } from "./ui.js";

let heartbeatInt = null;
let profileUnsub = null;
let editProfileAvatarData = "";
let editProfileBannerData = "";
let editProfileDecoData = "";
let editReportProof = "";
let reportTarget = { uid: null, nick: '', avatar: '' };

export async function ensureUserDoc(uid){
  const userRef = ref(db, `users/${uid}`);
  const snap = await get(userRef);
  if (!snap.exists()){
    await set(userRef, {
      uid, nick: "Anônimo_" + uid.slice(0,4), bio: "", status: "", state: "online",
      avatarUrl: "", bannerUrl: "", decoUrl: "", ageRating: "under16",
      gradientEnabled: false, gradientTop: "#d6e4f0", gradientBottom: "#f0d9e8",
      isAnonymous: !!auth.currentUser?.isAnonymous, plan: "free", pulsePending: false, revokePending: false,
      strikes: 0, banned: false, privacy: { friendRequests: "all" },
      createdAt: Date.now(), lastSeen: Date.now(), expireAt: Date.now() + TTL_OFFLINE_MS
    });
  } else {
    await update(userRef, { lastSeen: Date.now(), expireAt: Date.now() + TTL_OFFLINE_MS });
  }
}

export function startHeartbeat(uid){
  if (heartbeatInt) clearInterval(heartbeatInt);
  heartbeatInt = setInterval(() => {
    if (!S.currentUser) return;
    update(ref(db, `users/${uid}`), { lastSeen: Date.now(), expireAt: Date.now() + TTL_OFFLINE_MS }).catch(() => {});
  }, HEARTBEAT_MS);
}

export function setupDisconnect(uid){
  onDisconnect(ref(db, `users/${uid}/expireAt`)).set(Date.now() + TTL_OFFLINE_MS);
  onDisconnect(ref(db, `users/${uid}/lastSeen`)).set(Date.now());
}

export function subscribeProfile(uid){
  if (profileUnsub) profileUnsub();
  profileUnsub = onValue(ref(db, `users/${uid}`), (snap) => {
    S.userProfile = snap.val() || {};
    renderProfile(S.userProfile);
  });
}

function renderProfile(d){
  $("banned-overlay").style.display = (d.banned || Number(d.strikes || 0) >= 3) ? "grid" : "none";
  $("sidebar-nick").textContent = d.nick || "Anônimo";
  $("sidebar-status-text").textContent = d.status || labelState(d.state);
  $("sidebar-avatar").src = d.avatarUrl || DEFAULT_AVATAR;
  const deco = $("sidebar-avatar-deco");
  if (d.decoUrl) { deco.src = d.decoUrl; deco.style.display = "block"; }
  else { deco.style.display = "none"; deco.src = ""; }
  $("sidebar-state-dot").className = "avatar-state " + (d.state || "offline");
  $("sidebar-badge").style.display = (d.plan === "pulse") ? "inline-block" : "none";
  const privacySel = $("privacy-friend-requests");
  if (privacySel) privacySel.value = (d.privacy && d.privacy.friendRequests) || "all";

  const restricted = userStrikes() >= 2;
  $("discover-restricted").classList.toggle("hidden", !restricted);
  $("discover-search-wrap").style.display = restricted ? "none" : "flex";
  $("discover-list").style.display = restricted ? "none" : "grid";

  S.onRenderAccount?.();
  S.onRenderPlanState?.();
  refreshEmojiPickers();
  S.onRenderDiscover?.();
}

function buildDecoPresets(selectedUrl){
  const grid = $("deco-presets");
  grid.innerHTML = "";
  DECO_PRESETS.forEach(p => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "deco-option" + (selectedUrl === p.url ? " active" : "");
    btn.innerHTML = p.url
      ? `<img src="${p.url}" alt=""><span>${p.label}${p.pulse && !isPulse() ? ' 🔒' : ''}</span>`
      : `<span style="height:36px;display:grid;place-items:center;">🚫</span><span>${p.label}</span>`;
    btn.onclick = () => {
      if (p.pulse && !isPulse()) { showToast("Moldura exclusiva do PULSE!"); return; }
      editProfileDecoData = "";
      $("deco-url").value = p.url;
      buildDecoPresets(p.url);
      applyPreview();
    };
    grid.appendChild(btn);
  });
}

function applyPreview(){
  const banner = editProfileBannerData || $("banner-url").value.trim();
  const avatar = editProfileAvatarData || $("avatar-url").value.trim();
  const deco = editProfileDecoData || $("deco-url").value.trim();
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
  $("preview-avatar").src = avatar || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' fill='%23d9ead3'/%3E%3Ccircle cx='40' cy='32' r='14' fill='%23e8b923'/%3E%3Cpath d='M12 80c4-16 16-24 28-24s24 8 28 24z' fill='%23e8b923'/%3E%3C/svg%3E";
  const pDeco = $("preview-avatar-deco");
  if (deco) { pDeco.src = deco; pDeco.style.display = "block"; }
  else { pDeco.style.display = "none"; pDeco.src = ""; }
}

export function loadProfileIntoForm(){
  const d = S.userProfile || {};
  editProfileAvatarData = ""; editProfileBannerData = ""; editProfileDecoData = "";
  $("nick-input").value = d.nick || "";
  $("bio-input").value = d.bio || "";
  $("age-input").value = d.ageRating || "under16";
  $("state-input").value = d.state || "online";
  $("status-input").value = d.status || "";
  $("banner-url").value = d.bannerUrl || "";
  $("avatar-url").value = d.avatarUrl || "";
  $("deco-url").value = d.decoUrl || "";
  $("gradient-toggle").checked = d.gradientEnabled || false;
  $("gradient-top").value = d.gradientTop || "#d6e4f0";
  $("gradient-bottom").value = d.gradientBottom || "#f0d9e8";
  buildDecoPresets(d.decoUrl || "");
  applyPreview();
}

export async function openUserProfileModal(uid){
  if (uid === 'hezz_bot' || uid === 'hezz_ticket_bot') {
    $("upm-banner").style.background = "linear-gradient(135deg, var(--gold-light), var(--pastel-blue))";
    $("upm-banner").style.backgroundImage = "";
    $("upm-avatar").src = "foto.png";
    $("upm-deco").style.display = "none";
    $("upm-nick").textContent = "Hezz Bot";
    $("upm-badge").style.display = "inline-block";
    $("upm-badge").textContent = "BOT OFICIAL";
    $("upm-age").textContent = "Oficial";
    $("upm-status").textContent = "Sistema & Suporte HEZZ";
    $("upm-bio").textContent = "Canal oficial de alertas de moderação e atendimento do HEZZ.";
    $("upm-bot-support").style.display = "flex";
    $("upm-add-friend-btn").style.display = "none";
    $("upm-report-btn").style.display = "none";
    openModal("user-profile-modal");
    return;
  }

  try {
    const snap = await get(ref(db, `users/${uid}`));
    const u = snap.val() || {};
    if (u.gradientEnabled) {
      $("upm-banner").style.backgroundImage = "none";
      $("upm-banner").style.background = `linear-gradient(to bottom, ${u.gradientTop || '#d6e4f0'}, ${u.gradientBottom || '#f0d9e8'})`;
    } else if (u.bannerUrl) {
      $("upm-banner").style.backgroundImage = `url("${u.bannerUrl}")`;
    } else {
      $("upm-banner").style.backgroundImage = "";
      $("upm-banner").style.background = "var(--pastel-blue)";
    }
    $("upm-avatar").src = u.avatarUrl || DEFAULT_AVATAR;
    if (u.decoUrl) { $("upm-deco").src = u.decoUrl; $("upm-deco").style.display = "block"; }
    else { $("upm-deco").style.display = "none"; }

    $("upm-nick").textContent = u.nick || "Usuário";
    $("upm-badge").style.display = (u.plan === 'pulse') ? "inline-block" : "none";
    $("upm-badge").textContent = "LOVER";
    applyAgeBadge($("upm-age"), u.ageRating === '18+' ? '18+' : u.ageRating === '16+' ? '16+' : 'all');
    $("upm-status").textContent = u.status || labelState(u.state);
    $("upm-bio").textContent = u.bio || "Sem bio.";
    $("upm-bot-support").style.display = "none";

    const isSelf = S.currentUser && uid === S.currentUser.uid;
    $("upm-add-friend-btn").style.display = (isSelf || S.friendsMap[uid]) ? "none" : "inline-flex";
    $("upm-add-friend-btn").onclick = () => { S.onSendFriendRequest?.(uid); closeModals(); };

    $("upm-report-btn").style.display = isSelf ? "none" : "inline-flex";
    $("upm-report-btn").onclick = () => {
      reportTarget = { uid, nick: u.nick || "Usuário", avatar: u.avatarUrl || "" };
      $("rep-target-nick").textContent = reportTarget.nick;
      $("rep-reason").value = "";
      editReportProof = "";
      $("rep-proof-preview").style.display = "none";
      openModal("report-modal");
    };
    openModal("user-profile-modal");
  } catch (err) { showToast("Erro ao carregar perfil: " + err.message); }
}

export function initProfile(){
  $("profile-card").addEventListener("click", () => {
    if (!S.currentUser) { showToast("Aguarde conectar..."); return; }
    loadProfileIntoForm();
    openView('view-profile');
  });

  ['banner-url', 'avatar-url', 'deco-url', 'gradient-top', 'gradient-bottom'].forEach(id => {
    $(id).addEventListener("input", () => {
      if (id === 'avatar-url') editProfileAvatarData = "";
      if (id === 'banner-url') editProfileBannerData = "";
      if (id === 'deco-url') editProfileDecoData = "";
      applyPreview();
    });
  });
  $("gradient-toggle").addEventListener("change", applyPreview);

  $("banner-file").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!isPulse()) { showToast("Upload direto de banner é exclusivo do PULSE. Use URL."); e.target.value = ""; return; }
    try { editProfileBannerData = await fileToBase64(f, maxUploadMB() * 1024 * 1024); $("banner-url").value = ""; applyPreview(); }
    catch (err) { showToast(err.message); }
    e.target.value = "";
  });
  $("avatar-file").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!isPulse()) { showToast("Upload direto de foto é exclusivo do PULSE. Use URL."); e.target.value = ""; return; }
    try { editProfileAvatarData = await fileToBase64(f, maxUploadMB() * 1024 * 1024); $("avatar-url").value = ""; applyPreview(); }
    catch (err) { showToast(err.message); }
    e.target.value = "";
  });
  $("deco-file").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!isPulse()) { showToast("Upload direto de moldura é exclusivo do PULSE. Use URL."); e.target.value = ""; return; }
    try { editProfileDecoData = await fileToBase64(f, maxUploadMB() * 1024 * 1024); $("deco-url").value = ""; applyPreview(); }
    catch (err) { showToast(err.message); }
    e.target.value = "";
  });

  $("save-profile-btn").addEventListener("click", async () => {
    if (!S.currentUser) return;
    const newAvatar = editProfileAvatarData || $("avatar-url").value.trim();
    const newBanner = editProfileBannerData || $("banner-url").value.trim();
    const newDeco = editProfileDecoData || $("deco-url").value.trim();

    const changedPhoto = (newAvatar !== (S.userProfile.avatarUrl || "")) || (newBanner !== (S.userProfile.bannerUrl || ""));
    let photoChanges = S.userProfile.photoChanges || { date: todayKey(), count: 0 };
    if (photoChanges.date !== todayKey()) photoChanges = { date: todayKey(), count: 0 };
    if (changedPhoto) {
      if (photoChanges.count >= 5) { showToast("Limite de 5 trocas de foto por dia atingido!"); return; }
      photoChanges.count += 1;
    }

    const payload = {
      nick: $("nick-input").value.trim() || "Anônimo",
      bio: $("bio-input").value.trim(),
      ageRating: $("age-input").value,
      state: $("state-input").value,
      status: $("status-input").value.trim(),
      bannerUrl: newBanner, avatarUrl: newAvatar, decoUrl: newDeco, photoChanges,
      gradientEnabled: $("gradient-toggle").checked,
      gradientTop: $("gradient-top").value, gradientBottom: $("gradient-bottom").value,
      lastSeen: Date.now(), expireAt: Date.now() + TTL_OFFLINE_MS
    };
    try {
      await update(ref(db, `users/${S.currentUser.uid}`), payload);
      showToast("Perfil salvo!");
      closeView('view-profile');
    } catch (err) { showToast("Erro ao salvar: " + err.message); }
  });

  $("upm-support-chat-btn").onclick = () => { closeModals(); S.onOpenSupportModal?.(); };

  $("rep-proof-file").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      editReportProof = await fileToBase64(f, 5 * 1024 * 1024);
      $("rep-proof-preview").src = editReportProof;
      $("rep-proof-preview").style.display = "block";
    } catch (err) { showToast(err.message); }
    e.target.value = "";
  });

  $("rep-submit-btn").onclick = async () => {
    if (!S.currentUser || !reportTarget.uid) return;
    const reason = $("rep-reason").value.trim();
    if (!reason) { showToast("Descreva o motivo da denúncia"); return; }
    try {
      await push(ref(db, "reports"), {
        targetUid: reportTarget.uid, targetNick: reportTarget.nick, targetAvatar: reportTarget.avatar,
        reporterUid: S.currentUser.uid, reporterNick: S.userProfile.nick || "Anônimo",
        reason, proofUrl: editReportProof || "", status: "pending", createdAt: Date.now()
      });
      closeModals();
      showToast("Denúncia enviada para a moderação!");
    } catch (err) { showToast("Erro ao enviar: " + err.message); }
  };
}