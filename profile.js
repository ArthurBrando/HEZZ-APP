import { ref, set, update, get, onValue, onDisconnect, push } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  auth, db, S, $, esc, todayKey, TTL_OFFLINE_MS, HEARTBEAT_MS,
  DEFAULT_AVATAR, DECO_PRESETS, NICK_FONTS, SVG_VERIFIED,
  isPulse, maxUploadMB, userStrikes, applyAgeBadge, labelState, fileToBase64
} from "./state.js";
import { showToast, openView, closeView, openModal, closeModals, refreshEmojiPickers } from "./ui.js";

export { SVG_VERIFIED };

const SVG_BAN = '<svg class="ui-icon lg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>';
const SVG_LOCK = '<svg class="ui-icon sm" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

let heartbeatInt = null;
let profileUnsub = null;
let editAvatar = "";
let editBanner = "";
let editDeco = "";
let editReportProof = "";
let reportTarget = { uid: null, nick: "", avatar: "" };

/* ============================================================
   ESTILOS EXTRAS (injetados uma única vez)
   ============================================================ */
function injectExtraAssets() {
  if (!$("hezz-fonts-link")) {
    const l = document.createElement("link");
    l.id = "hezz-fonts-link";
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Bangers&family=Bebas+Neue&family=Caveat:wght@700&family=Cinzel:wght@700&family=Dancing+Script:wght@700&family=Fredoka:wght@600&family=Lobster&family=Orbitron:wght@700&family=Pacifico&family=Playfair+Display:wght@700&family=Press+Start+2P&family=Righteous&family=Space+Mono:wght@700&display=swap";
    document.head.appendChild(l);
  }
  if (!$("hezz-extra-css")) {
    const st = document.createElement("style");
    st.id = "hezz-extra-css";
    st.textContent = `
      .verified-badge{display:inline-flex;align-items:center;width:16px;height:16px;vertical-align:middle;flex-shrink:0}
      .verified-badge svg{width:16px;height:16px}
      .nick-grad{-webkit-background-clip:text!important;background-clip:text!important;-webkit-text-fill-color:transparent!important;color:transparent!important}
      .font-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px}
      .font-opt{padding:8px;border:2px solid var(--gold-light);border-radius:10px;background:var(--white);color:var(--text);cursor:pointer;font-size:.82rem;display:flex;align-items:center;justify-content:center;gap:4px}
      .font-opt.active{border-color:var(--gold);background:var(--gold-soft)}
      .font-opt.locked{opacity:.55}
      .profile-badges-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
      .badge-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:999px;background:rgba(255,255,255,.88);color:#222;border:1px solid var(--gold-light);font-size:.72rem;font-weight:700}
      .badge-chip img{width:16px;height:16px;border-radius:50%;object-fit:cover}
    `;
    document.head.appendChild(st);
  }
}

/* ============================================================
   HELPERS DE ESTILO DO NICK
   ============================================================ */
export function nickStyleAttr(u) {
  const font = u.nickFont ? `font-family:'${esc(u.nickFont)}',sans-serif;` : "";
  if (u.nickGradEnabled && u.plan === "pulse") {
    return {
      cls: "nick-grad",
      style: `${font}background:linear-gradient(90deg,${u.nickGrad1 || "#e8b923"},${u.nickGrad2 || "#e26a6a"});`
    };
  }
  return { cls: "", style: font };
}

/* ============================================================
   USER DOC / PRESENÇA
   ============================================================ */
export async function ensureUserDoc(uid) {
  const userRef = ref(db, `users/${uid}`);
  const snap = await get(userRef);
  const defHandle = `@user_${uid.slice(0, 5).toLowerCase()}`;
  if (!snap.exists()) {
    await set(userRef, {
      uid,
      nick: "Anônimo_" + uid.slice(0, 4),
      handle: defHandle,
      fixedNick: "Anônimo_" + uid.slice(0, 4),
      bio: "",
      status: "",
      state: "online",
      avatarUrl: "",
      bannerUrl: "",
      decoUrl: "",
      ageRating: "under16",
      nickFont: "Inter",
      nickGradEnabled: false,
      nickGrad1: "#e8b923",
      nickGrad2: "#e26a6a",
      profileBgEnabled: false,
      profileBgTop: "#d6e4f0",
      profileBgBottom: "#f0d9e8",
      gradientEnabled: false,
      gradientTop: "#d6e4f0",
      gradientBottom: "#f0d9e8",
      isAnonymous: !!auth.currentUser?.isAnonymous,
      plan: "free",
      pulsePending: false,
      revokePending: false,
      strikes: 0,
      banned: false,
      privacy: { friendRequests: "all" },
      createdAt: Date.now(),
      lastSeen: Date.now(),
      expireAt: Date.now() + TTL_OFFLINE_MS
    });
  } else {
    const val = snap.val();
    const upd = { lastSeen: Date.now(), expireAt: Date.now() + TTL_OFFLINE_MS };
    if (!val.handle) upd.handle = defHandle;
    if (!val.fixedNick) upd.fixedNick = val.nick || "Anônimo";
    await update(userRef, upd);
  }
}

export function startHeartbeat(uid) {
  if (heartbeatInt) clearInterval(heartbeatInt);
  heartbeatInt = setInterval(() => {
    if (!S.currentUser) return;
    update(ref(db, `users/${uid}`), {
      lastSeen: Date.now(),
      expireAt: Date.now() + TTL_OFFLINE_MS
    }).catch(() => {});
  }, HEARTBEAT_MS);
}

export function setupDisconnect(uid) {
  onDisconnect(ref(db, `users/${uid}/expireAt`)).set(Date.now() + TTL_OFFLINE_MS);
  onDisconnect(ref(db, `users/${uid}/lastSeen`)).set(Date.now());
}

export function subscribeProfile(uid) {
  if (profileUnsub) profileUnsub();
  profileUnsub = onValue(ref(db, `users/${uid}`), (snap) => {
    S.userProfile = snap.val() || {};
    renderProfile(S.userProfile);
  });
}

/* ============================================================
   RENDER DO SIDEBAR
   ============================================================ */
function renderProfile(d) {
  const bannedOverlay = $("banned-overlay");
  if (bannedOverlay) {
    bannedOverlay.style.display = (d.banned || Number(d.strikes || 0) >= 3) ? "grid" : "none";
  }

  const st = nickStyleAttr(d);
  const sn = $("sidebar-nick");
  if (sn) {
    sn.textContent = d.nick || "Anônimo";
    sn.className = "nick " + st.cls;
    sn.style.cssText = st.style;
  }

  const handleEl = $("sidebar-handle");
  if (handleEl) {
    handleEl.textContent = d.handle || `@user_${(S.currentUser?.uid || "hezz").slice(0, 5).toLowerCase()}`;
  }

  let sbVer = $("sidebar-verified");
  if (sbVer) {
    if (d.plan === "pulse") {
      sbVer.innerHTML = SVG_VERIFIED;
      sbVer.style.display = "inline-flex";
    } else {
      sbVer.innerHTML = "";
      sbVer.style.display = "none";
    }
  }

  const statusEl = $("sidebar-status-text");
  if (statusEl) statusEl.textContent = d.status || labelState(d.state);

  const avatarEl = $("sidebar-avatar");
  if (avatarEl) avatarEl.src = d.avatarUrl || DEFAULT_AVATAR;

  const deco = $("sidebar-avatar-deco");
  if (deco) {
    if (d.decoUrl) { deco.src = d.decoUrl; deco.style.display = "block"; }
    else { deco.style.display = "none"; deco.src = ""; }
  }

  const stateDot = $("sidebar-state-dot");
  if (stateDot) stateDot.className = "avatar-state " + (d.state || "offline");

  const badgeEl = $("sidebar-badge");
  if (badgeEl) badgeEl.style.display = (d.plan === "pulse") ? "inline-block" : "none";

  const privacySel = $("privacy-friend-requests");
  if (privacySel) privacySel.value = (d.privacy && d.privacy.friendRequests) || "all";

  const restricted = userStrikes() >= 2;
  const discRestricted = $("discover-restricted");
  if (discRestricted) discRestricted.classList.toggle("hidden", !restricted);
  const discWrap = $("discover-search-wrap");
  if (discWrap) discWrap.style.display = restricted ? "none" : "flex";
  const discList = $("discover-list");
  if (discList) discList.style.display = restricted ? "none" : "grid";

  S.onRenderAccount?.();
  S.onRenderPlanState?.();
  refreshEmojiPickers();
  S.onRenderDiscover?.();
}

/* ============================================================
   DECO PRESETS (usa DECO_PRESETS do state.js — 7 opções)
   ============================================================ */
function buildDecoPresets(sel) {
  const grid = $("deco-presets");
  if (!grid) return;
  grid.innerHTML = "";
  DECO_PRESETS.forEach((p) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "deco-option" + (sel === p.url ? " active" : "");
    btn.innerHTML = p.url
      ? `<img src="${p.url}" alt=""><span>${p.label}${p.pulse && !isPulse() ? " " + SVG_LOCK : ""}</span>`
      : `<span style="height:36px;display:grid;place-items:center;">${SVG_BAN}</span><span>${p.label}</span>`;
    btn.onclick = () => {
      if (p.pulse && !isPulse()) {
        showToast("Moldura exclusiva do PULSE!");
        return;
      }
      editDeco = "";
      const inp = $("deco-url");
      if (inp) inp.value = p.url;
      buildDecoPresets(p.url);
      applyPreview();
    };
    grid.appendChild(btn);
  });
}

/* ============================================================
   FONT GRID (usa NICK_FONTS do state.js — 15 fontes Google)
   ============================================================ */
function buildFontGrid(sel) {
  const grid = $("nick-font-grid");
  if (!grid) return;
  grid.innerHTML = "";
  NICK_FONTS.forEach((f) => {
    const locked = f !== "Inter" && !isPulse();
    const b = document.createElement("button");
    b.type = "button";
    b.className = "font-opt" + (sel === f ? " active" : "") + (locked ? " locked" : "");
    b.style.fontFamily = `'${f}', sans-serif`;
    b.innerHTML = `${f}${locked ? " " + SVG_LOCK : ""}`;
    b.onclick = () => {
      if (locked) {
        showToast("As 15 fontes de nick são exclusivas do PULSE!");
        return;
      }
      grid.dataset.selected = f;
      buildFontGrid(f);
      applyPreview();
    };
    grid.appendChild(b);
  });
  grid.dataset.selected = sel || "Inter";
}

/* ============================================================
   PREVIEW DO FORMULÁRIO
   ============================================================ */
function applyPreview() {
  const banner = editBanner || ($("banner-url")?.value.trim() || "");
  const avatar = editAvatar || ($("avatar-url")?.value.trim() || "");
  const deco = editDeco || ($("deco-url")?.value.trim() || "");

  const pBanner = $("preview-banner");
  if (pBanner) {
    if ($("gradient-toggle")?.checked) {
      pBanner.style.backgroundImage = "none";
      pBanner.style.background = `linear-gradient(to bottom, ${$("gradient-top")?.value || "#d6e4f0"}, ${$("gradient-bottom")?.value || "#f0d9e8"})`;
    } else if (banner) {
      pBanner.style.background = "";
      pBanner.style.backgroundImage = `url("${banner}")`;
    } else {
      pBanner.style.backgroundImage = "";
      pBanner.style.background = "var(--pastel-pink)";
    }
  }

  const pAvatar = $("preview-avatar");
  if (pAvatar) pAvatar.src = avatar || DEFAULT_AVATAR;

  const pDeco = $("preview-avatar-deco");
  if (pDeco) {
    if (deco) { pDeco.src = deco; pDeco.style.display = "block"; }
    else { pDeco.style.display = "none"; pDeco.src = ""; }
  }

  const pNick = $("preview-nick-display");
  if (pNick) {
    const nick = $("nick-input")?.value.trim() || "Seu Nick";
    pNick.textContent = nick;
    const selectedFont = $("nick-font-grid")?.dataset.selected || "Inter";
    pNick.style.fontFamily = isPulse() ? `'${selectedFont}', sans-serif` : "Inter, sans-serif";
    if (isPulse() && $("nick-grad-toggle")?.checked) {
      pNick.classList.add("nick-grad");
      pNick.style.backgroundImage = `linear-gradient(90deg, ${$("nick-grad-c1")?.value || "#e8b923"}, ${$("nick-grad-c2")?.value || "#ec4899"})`;
    } else {
      pNick.classList.remove("nick-grad");
      pNick.style.backgroundImage = "none";
    }
  }

  const pVer = $("preview-verified-badge");
  if (pVer) {
    if (isPulse()) { pVer.innerHTML = SVG_VERIFIED; pVer.style.display = "inline-flex"; }
    else { pVer.innerHTML = ""; pVer.style.display = "none"; }
  }

  const pH = $("preview-handle-display");
  if (pH) {
    const h = $("handle-input")?.value.trim();
    pH.textContent = h ? (h.startsWith("@") ? h : "@" + h) : "@usuario";
  }
}

/* ============================================================
   CARREGAR FORM
   ============================================================ */
export function loadProfileIntoForm() {
  injectExtraAssets();
  const d = S.userProfile || {};
  editAvatar = "";
  editBanner = "";
  editDeco = "";

  if ($("nick-input")) $("nick-input").value = d.nick || "";
  if ($("handle-input")) $("handle-input").value = (d.handle || "").replace(/^@/, "");
  if ($("bio-input")) $("bio-input").value = d.bio || "";
  if ($("age-input")) $("age-input").value = d.ageRating || "under16";
  if ($("state-input")) $("state-input").value = d.state || "online";
  if ($("status-input")) $("status-input").value = d.status || "";

  if ($("banner-url")) $("banner-url").value = d.bannerUrl || "";
  if ($("avatar-url")) $("avatar-url").value = d.avatarUrl || "";
  if ($("deco-url")) $("deco-url").value = d.decoUrl || "";

  if ($("gradient-toggle")) $("gradient-toggle").checked = !!d.gradientEnabled;
  if ($("gradient-top")) $("gradient-top").value = d.gradientTop || "#d6e4f0";
  if ($("gradient-bottom")) $("gradient-bottom").value = d.gradientBottom || "#f0d9e8";

  if ($("profile-bg-toggle")) $("profile-bg-toggle").checked = !!d.profileBgEnabled;
  if ($("profile-bg-top")) $("profile-bg-top").value = d.profileBgTop || "#d6e4f0";
  if ($("profile-bg-bottom")) $("profile-bg-bottom").value = d.profileBgBottom || "#f0d9e8";

  if ($("nick-grad-toggle")) $("nick-grad-toggle").checked = !!d.nickGradEnabled;
  if ($("nick-grad-c1")) $("nick-grad-c1").value = d.nickGrad1 || "#e8b923";
  if ($("nick-grad-c2")) $("nick-grad-c2").value = d.nickGrad2 || "#e26a6a";

  buildDecoPresets(d.decoUrl || "");
  buildFontGrid(d.nickFont || "Inter");
  applyPreview();
}

/* ============================================================
   MODAL DE PERFIL DE USUÁRIO
   ============================================================ */
export async function openUserProfileModal(uid) {
  injectExtraAssets();

  if (uid === "hezz_bot" || uid === "hezz_ticket_bot") {
    const modal = $("user-profile-modal");
    if (modal) modal.style.background = "";
    const banner = $("upm-banner");
    if (banner) {
      banner.style.backgroundImage = "none";
      banner.style.background = "linear-gradient(135deg, var(--gold-light), var(--pastel-blue))";
    }
    const av = $("upm-avatar"); if (av) av.src = "foto.png";
    const dc = $("upm-deco"); if (dc) dc.style.display = "none";
    const nk = $("upm-nick");
    if (nk) {
      nk.textContent = "Hezz Bot";
      nk.className = "";
      nk.style.cssText = "";
    }
    const vb = $("upm-verified"); if (vb) vb.style.display = "none";
    const bd = $("upm-badge");
    if (bd) { bd.style.display = "inline-block"; bd.textContent = "BOT OFICIAL"; }
    if ($("upm-age")) $("upm-age").textContent = "Oficial";
    if ($("upm-handle")) $("upm-handle").textContent = "@hezz_bot";
    if ($("upm-status")) $("upm-status").textContent = "Sistema & Suporte HEZZ";
    if ($("upm-bio")) $("upm-bio").textContent = "Canal oficial de alertas de moderação e atendimento do HEZZ.";
    if ($("upm-badges-row")) $("upm-badges-row").innerHTML = "";
    const bs = $("upm-bot-support"); if (bs) bs.style.display = "flex";
    const ad = $("upm-add-friend-btn"); if (ad) ad.style.display = "none";
    const rp = $("upm-report-btn"); if (rp) rp.style.display = "none";
    openModal("user-profile-modal");
    return;
  }

  try {
    const snap = await get(ref(db, `users/${uid}`));
    const u = snap.val() || {};

    const modal = $("user-profile-modal");
    if (modal) {
      modal.style.background = u.profileBgEnabled
        ? `linear-gradient(180deg, ${u.profileBgTop || "#d6e4f0"}, ${u.profileBgBottom || "#f0d9e8"})`
        : "";
    }

    const banner = $("upm-banner");
    if (banner) {
      if (u.gradientEnabled) {
        banner.style.backgroundImage = "none";
        banner.style.background = `linear-gradient(to bottom, ${u.gradientTop || "#d6e4f0"}, ${u.gradientBottom || "#f0d9e8"})`;
      } else if (u.bannerUrl) {
        banner.style.background = "";
        banner.style.backgroundImage = `url("${u.bannerUrl}")`;
      } else {
        banner.style.backgroundImage = "";
        banner.style.background = "var(--pastel-blue)";
      }
    }

    const av = $("upm-avatar");
    if (av) av.src = u.avatarUrl || DEFAULT_AVATAR;

    const dc = $("upm-deco");
    if (dc) {
      if (u.decoUrl) { dc.src = u.decoUrl; dc.style.display = "block"; }
      else { dc.style.display = "none"; dc.src = ""; }
    }

    const st = nickStyleAttr(u);
    const nk = $("upm-nick");
    if (nk) {
      nk.innerHTML = `${esc(u.nick || "Usuário")} ${u.plan === "pulse" ? SVG_VERIFIED : ""}`;
      nk.className = st.cls;
      nk.style.cssText = st.style;
    }

    const vb = $("upm-verified");
    if (vb) {
      if (u.plan === "pulse") { vb.innerHTML = SVG_VERIFIED; vb.style.display = "inline-flex"; }
      else { vb.innerHTML = ""; vb.style.display = "none"; }
    }

    const bd = $("upm-badge");
    if (bd) {
      bd.style.display = (u.plan === "pulse") ? "inline-block" : "none";
      bd.textContent = "LOVER";
    }

    applyAgeBadge($("upm-age"), u.ageRating === "18+" ? "18+" : u.ageRating === "16+" ? "16+" : "all");

    const hd = $("upm-handle");
    if (hd) hd.textContent = `${u.handle || "@hezz"} • Fixo: ${u.fixedNick || u.nick || "Anônimo"}`;

    if ($("upm-status")) $("upm-status").textContent = u.status || labelState(u.state);
    if ($("upm-bio")) $("upm-bio").textContent = u.bio || "Sem bio.";
    if ($("upm-bot-support")) $("upm-bot-support").style.display = "none";

    const bRow = $("upm-badges-row");
    if (bRow) {
      bRow.innerHTML = "";
      Object.values(u.earnedBadges || {}).forEach((b) => {
        const chip = document.createElement("span");
        chip.className = "badge-chip";
        chip.innerHTML = (b.imageUrl ? `<img src="${b.imageUrl}" alt="">` : (b.iconSvg || "")) + `<span>${esc(b.name)}</span>`;
        bRow.appendChild(chip);
      });
    }

    const isSelf = S.currentUser && uid === S.currentUser.uid;

    const addBtn = $("upm-add-friend-btn");
    if (addBtn) {
      addBtn.style.display = (isSelf || S.friendsMap[uid]) ? "none" : "inline-flex";
      addBtn.onclick = () => {
        S.onSendFriendRequest?.(uid);
        closeModals();
      };
    }

    const repBtn = $("upm-report-btn");
    if (repBtn) {
      repBtn.style.display = isSelf ? "none" : "inline-flex";
      repBtn.onclick = () => {
        reportTarget = { uid, nick: u.nick || "Usuário", avatar: u.avatarUrl || "" };
        if ($("rep-target-nick")) $("rep-target-nick").textContent = reportTarget.nick;
        if ($("rep-reason")) $("rep-reason").value = "";
        editReportProof = "";
        if ($("rep-proof-preview")) $("rep-proof-preview").style.display = "none";
        openModal("report-modal");
      };
    }

    openModal("user-profile-modal");
  } catch (err) {
    showToast("Erro ao carregar perfil: " + err.message);
  }
}

/* ============================================================
   INIT PROFILE
   ============================================================ */
export function initProfile() {
  injectExtraAssets();

  $("profile-card")?.addEventListener("click", () => {
    if (!S.currentUser) {
      showToast("Aguarde conectar...");
      return;
    }
    loadProfileIntoForm();
    openView("view-profile");
  });

  ["banner-url", "avatar-url", "deco-url", "gradient-top", "gradient-bottom",
   "nick-grad-c1", "nick-grad-c2", "profile-bg-top", "profile-bg-bottom"].forEach((id) => {
    $(id)?.addEventListener("input", () => {
      if (id === "avatar-url") editAvatar = "";
      if (id === "banner-url") editBanner = "";
      if (id === "deco-url") editDeco = "";
      applyPreview();
    });
  });

  ["gradient-toggle", "profile-bg-toggle", "nick-grad-toggle"].forEach((id) => {
    $(id)?.addEventListener("change", applyPreview);
  });
  $("nick-input")?.addEventListener("input", applyPreview);
  $("handle-input")?.addEventListener("input", applyPreview);

  // Uploads (PULSE)
  $("banner-file")?.addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!isPulse()) { showToast("Upload direto é exclusivo do PULSE. Use URL."); e.target.value = ""; return; }
    try {
      editBanner = await fileToBase64(f, maxUploadMB() * 1024 * 1024);
      if ($("banner-url")) $("banner-url").value = "";
      applyPreview();
    } catch (err) { showToast(err.message); }
    e.target.value = "";
  });

  $("avatar-file")?.addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!isPulse()) { showToast("Upload direto é exclusivo do PULSE. Use URL."); e.target.value = ""; return; }
    try {
      editAvatar = await fileToBase64(f, maxUploadMB() * 1024 * 1024);
      if ($("avatar-url")) $("avatar-url").value = "";
      applyPreview();
    } catch (err) { showToast(err.message); }
    e.target.value = "";
  });

  $("deco-file")?.addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!isPulse()) { showToast("Upload direto é exclusivo do PULSE. Use URL."); e.target.value = ""; return; }
    try {
      editDeco = await fileToBase64(f, maxUploadMB() * 1024 * 1024);
      if ($("deco-url")) $("deco-url").value = "";
      applyPreview();
    } catch (err) { showToast(err.message); }
    e.target.value = "";
  });

  // Salvar perfil
  $("save-profile-btn")?.addEventListener("click", async () => {
    if (!S.currentUser) return;

    const newAvatar = editAvatar || ($("avatar-url")?.value.trim() || "");
    const newBanner = editBanner || ($("banner-url")?.value.trim() || "");
    const newDeco = editDeco || ($("deco-url")?.value.trim() || "");

    const changedPhoto = (newAvatar !== (S.userProfile.avatarUrl || "")) || (newBanner !== (S.userProfile.bannerUrl || ""));
    let photoChanges = S.userProfile.photoChanges || { date: todayKey(), count: 0 };
    if (photoChanges.date !== todayKey()) photoChanges = { date: todayKey(), count: 0 };
    if (changedPhoto) {
      if (photoChanges.count >= 5) { showToast("Limite de 5 trocas de foto por dia atingido!"); return; }
      photoChanges.count += 1;
    }

    let handle = ($("handle-input")?.value.trim() || "").replace(/^@/, "").replace(/[^a-zA-Z0-9_]/g, "");
    if (handle && !handle.startsWith("@")) handle = "@" + handle.toLowerCase();
    if (!handle) handle = S.userProfile.handle || `@user_${S.currentUser.uid.slice(0, 5).toLowerCase()}`;

    const payload = {
      nick: ($("nick-input")?.value.trim() || "") || "Anônimo",
      handle,
      bio: ($("bio-input")?.value.trim() || "") || "",
      ageRating: ($("age-input")?.value || "under16"),
      state: ($("state-input")?.value || "online"),
      status: ($("status-input")?.value.trim() || ""),
      bannerUrl: newBanner,
      avatarUrl: newAvatar,
      decoUrl: newDeco,
      photoChanges,
      gradientEnabled: !!$("gradient-toggle")?.checked,
      gradientTop: $("gradient-top")?.value || "#d6e4f0",
      gradientBottom: $("gradient-bottom")?.value || "#f0d9e8",
      profileBgEnabled: !!$("profile-bg-toggle")?.checked,
      profileBgTop: $("profile-bg-top")?.value || "#d6e4f0",
      profileBgBottom: $("profile-bg-bottom")?.value || "#f0d9e8",
      nickFont: $("nick-font-grid")?.dataset.selected || "Inter",
      nickGradEnabled: !!$("nick-grad-toggle")?.checked,
      nickGrad1: $("nick-grad-c1")?.value || "#e8b923",
      nickGrad2: $("nick-grad-c2")?.value || "#e26a6a",
      lastSeen: Date.now(),
      expireAt: Date.now() + TTL_OFFLINE_MS
    };

    try {
      await update(ref(db, `users/${S.currentUser.uid}`), payload);
      showToast("Perfil salvo!");
      closeView("view-profile");
    } catch (err) {
      showToast("Erro ao salvar: " + err.message);
    }
  });

  // Suporte a partir do perfil do bot
  $("upm-support-chat-btn")?.addEventListener("click", () => {
    closeModals();
    S.onOpenSupportModal?.();
  });

  // Denúncia
  $("rep-proof-file")?.addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      editReportProof = await fileToBase64(f, 5 * 1024 * 1024);
      const prev = $("rep-proof-preview");
      if (prev) { prev.src = editReportProof; prev.style.display = "block"; }
    } catch (err) { showToast(err.message); }
    e.target.value = "";
  });

  $("rep-submit-btn")?.addEventListener("click", async () => {
    if (!S.currentUser || !reportTarget.uid) return;
    const reason = $("rep-reason")?.value.trim() || "";
    if (!reason) { showToast("Descreva o motivo da denúncia"); return; }
    try {
      await push(ref(db, "reports"), {
        targetUid: reportTarget.uid,
        targetNick: reportTarget.nick,
        targetAvatar: reportTarget.avatar,
        reporterUid: S.currentUser.uid,
        reporterNick: S.userProfile.nick || "Anônimo",
        reason,
        proofUrl: editReportProof || "",
        status: "pending",
        createdAt: Date.now()
      });
      closeModals();
      showToast("Denúncia enviada para a moderação!");
    } catch (err) {
      showToast("Erro ao enviar: " + err.message);
    }
  });
}