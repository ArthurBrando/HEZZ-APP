--- START OF FILE servers.js ---

import { ref, set, update, get, onValue, query, limitToLast, push, remove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { db, S, $, esc, todayKey, DEFAULT_AVATAR, dmPairId, isPulse, maxUploadMB, maxCommunities, canAccessAge, ageBadgeLabel, applyAgeBadge, fileToBase64 } from "./state.js";
import { showToast, copyText, setOpen, openView, closeView, openModal, closeModals, watchTyping, bindTyping, fmt } from "./ui.js";
import { joinRoom, openCinemaFromAnywhere } from "./calls.js";
import { myMemberPerms, checkSendCooldown, renderMessage, setupInputPopups, attachReplyToPayload } from "./chat.js";

const SVG_HASH = '<svg class="ui-icon sm" viewBox="0 0 24 24"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>';
const SVG_VOL = '<svg class="ui-icon sm" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
const SVG_TAG = '<svg class="ui-icon sm" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>';
const SVG_EDIT = '<svg class="ui-icon sm" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
const SVG_INFO = '<svg class="ui-icon sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
const SVG_CLOCK = '<svg class="ui-icon sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
const SVG_CROWN = '<svg class="ui-icon sm" style="color:var(--gold)" viewBox="0 0 24 24"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></svg>';
const SVG_AWARD = '<svg class="ui-icon sm" viewBox="0 0 24 24"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>';

let myCommunitiesUnsub = null;
let allCommunitiesUnsub = null;
let editCommunityAvatar = "";
let editServerAvatarData = "";
let editBotAvatarData = "";
let editAchIconData = "";
let pendingInviteServer = null;
let serverEditingChanId = null;
let editingRoleId = null;
let timeoutTargetUid = null;

/* ============================================================
   CONTROLE DE ACESSO A TICKETS
   Ticket só aparece/pode ser acessado por:
   - Admin (admin / manageChannels / manageMessages)
   - Dono do servidor
   - Quem abriu o ticket (ticketOwnerUid)
   ============================================================ */
function canSeeTicketChannel(ch) {
  if (!ch || ch.type !== 'ticket') return true;
  if (!S.currentUser || !S.currentServerData) return false;
  const perms = myMemberPerms();
  const isAdmin = !!(perms.admin || perms.manageChannels || perms.manageMessages);
  const isOwner = S.currentServerData.ownerUid === S.currentUser.uid;
  const isTicketOwner = ch.ticketOwnerUid === S.currentUser.uid;
  return isAdmin || isOwner || isTicketOwner;
}

function randomInviteCode(){
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function subscribeCommunities(uid){
  if (myCommunitiesUnsub) myCommunitiesUnsub();
  myCommunitiesUnsub = onValue(ref(db, `users/${uid}/communities`), (snap) => {
    S.myCommunitiesMap = snap.val() || {};
    renderCommunities(S.myCommunitiesMap);
  });
}

export function subscribeAllCommunities(){
  if (allCommunitiesUnsub) allCommunitiesUnsub();
  allCommunitiesUnsub = onValue(ref(db, "communities"), (snap) => {
    S.allCommunitiesMap = snap.val() || {};
    renderDiscover();
  });
}

function renderCommunities(list){
  const el = $("home-communities");
  if (!el) return;
  el.innerHTML = "";
  const arr = Object.entries(list).sort((a,b) => (b[1].joinedAt || 0) - (a[1].joinedAt || 0));
  if (!arr.length) { el.innerHTML = '<div class="empty">Você ainda não está em servidores. Crie ou descubra um!</div>'; return; }
  arr.forEach(([id, c]) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `<img class="avatar" src="${c.avatarUrl || DEFAULT_AVATAR}" />
      <div class="list-item-info">
        <div class="list-item-name">${esc(c.name || 'Servidor')} <span class="age-badge">${ageBadgeLabel(c.ageRating)}</span></div>
        <div class="list-item-sub">${esc(c.bio || 'Clique para abrir')}</div>
      </div>`;
    item.onclick = () => openServer(id);
    el.appendChild(item);
  });
}

export function renderDiscover(){
  const el = $("discover-list");
  if (!el) return;
  const q = ($("discover-search")?.value || "").trim().toLowerCase();
  el.innerHTML = "";
  const arr = Object.entries(S.allCommunitiesMap)
    .filter(([id, c]) => !S.myCommunitiesMap[id] && canAccessAge(c.ageRating))
    .filter(([, c]) => !q || (c.name || '').toLowerCase().includes(q) || (c.bio || '').toLowerCase().includes(q))
    .slice(0, 24);
  if (!arr.length) { el.innerHTML = '<div class="empty">Nenhum servidor encontrado para sua faixa etária.</div>'; return; }
  arr.forEach(([id, c]) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `<img class="avatar" src="${c.avatarUrl || DEFAULT_AVATAR}" />
      <div class="list-item-info">
        <div class="list-item-name">${esc(c.name || 'Servidor')} <span class="age-badge">${ageBadgeLabel(c.ageRating)}</span></div>
        <div class="list-item-sub">${esc(c.bio || 'Servidor público')}</div>
      </div>
      <button class="mini-btn gold">Entrar</button>`;
    item.onclick = () => joinServer(id, c);
    el.appendChild(item);
  });
}

export async function openInviteByCode(raw){
  let code = String(raw || '').trim();
  if (code.includes('invite=')) code = code.split('invite=').pop().split('&')[0];
  if (!code) return;
  try {
    let cid = null;
    const invSnap = await get(ref(db, `invites/${code}`));
    if (invSnap.exists()) cid = invSnap.val().communityId;
    else {
      const found = Object.entries(S.allCommunitiesMap).find(([, c]) => (c.inviteCode || '').toLowerCase() === code.toLowerCase());
      if (found) cid = found[0];
    }
    if (!cid) { showToast("Convite inválido ou expirado"); return; }
    const srvSnap = await get(ref(db, `communities/${cid}`));
    if (!srvSnap.exists()) { showToast("Servidor não existe mais"); return; }
    showInviteModal(cid, srvSnap.val());
  } catch (err) { showToast("Erro no convite: " + err.message); }
}

export function showInviteModal(cid, srv){
  pendingInviteServer = { id: cid, data: srv };
  $("inv-avatar").src = srv.avatarUrl || DEFAULT_AVATAR;
  $("inv-title").textContent = srv.name || "Servidor";
  $("inv-subtitle").textContent = srv.bio || "Você foi convidado para entrar neste servidor!";
  applyAgeBadge($("inv-age"), srv.ageRating || 'all');
  openModal("invite-modal");
}

async function joinServer(cid, srv){
  if (!S.currentUser) return;
  if (!canAccessAge(srv.ageRating)) { showToast(`Este servidor é classificado como ${srv.ageRating}.`); return; }
  try {
    await update(ref(db, `communities/${cid}/members/${S.currentUser.uid}`), {
      uid: S.currentUser.uid, nick: S.userProfile.nick || "Anônimo", avatarUrl: S.userProfile.avatarUrl || "", joinedAt: Date.now()
    });
    await update(ref(db, `users/${S.currentUser.uid}/communities/${cid}`), {
      name: srv.name || "Servidor", bio: srv.bio || "", avatarUrl: srv.avatarUrl || "", ageRating: srv.ageRating || 'all', joinedAt: Date.now()
    });
    openServer(cid);
  } catch (err) { showToast("Erro ao entrar: " + err.message); }
}

async function openServer(cid){
  if (!S.currentUser) return;
  const snap = await get(ref(db, `communities/${cid}`));
  if (!snap.exists()) { showToast("Servidor não encontrado"); return; }
  const srv = snap.val();
  if (!canAccessAge(srv.ageRating)) { showToast(`Servidor restrito (${srv.ageRating})`); return; }

  S.currentServerId = cid;
  S.currentServerData = srv;
  // Escolhe canal inicial respeitando acesso a tickets
  const firstVisible = srv.channels?.geral
    ? 'geral'
    : (Object.keys(srv.channels || {}).find(k => canSeeTicketChannel(srv.channels[k])) || 'geral');
  S.currentChannelId = firstVisible;
  S.replyTo = null;
  openView('view-server');

  if (!srv.members?.[S.currentUser.uid]) {
    update(ref(db, `communities/${cid}/members/${S.currentUser.uid}`), {
      uid: S.currentUser.uid, nick: S.userProfile.nick || "Anônimo", avatarUrl: S.userProfile.avatarUrl || "", joinedAt: Date.now()
    }).catch(() => {});
  }

  if (S.serverUnsub) S.serverUnsub();
  S.serverUnsub = onValue(ref(db, `communities/${cid}`), (s) => {
    if (!s.exists()) { closeView('view-server'); return; }
    S.currentServerData = s.val();
    renderServerUI();
  });
  switchServerChannel(S.currentChannelId);
}

function renderServerUI(){
  const srv = S.currentServerData;
  if (!srv) return;
  const perms = myMemberPerms();
  const isAdmin = !!perms.admin || !!perms.manageChannels;

  $("server-header-name").textContent = srv.name || "Servidor";
  $("server-header-avatar").src = srv.avatarUrl || DEFAULT_AVATAR;
  applyAgeBadge($("server-header-age"), srv.ageRating || 'all');
  $("server-btn-add-cat").style.display = isAdmin ? "inline-flex" : "none";
  $("server-btn-add-chan").style.display = isAdmin ? "inline-flex" : "none";
  $("server-btn-settings").style.display = (srv.ownerUid === S.currentUser.uid || perms.admin || perms.manageRoles || perms.timeoutMembers) ? "grid" : "none";

  const cats = srv.categories || { cat_default: { name: "CANAIS", order: 1, rules: "" } };
  const chans = srv.channels || { geral: { name: "geral", type: "text", categoryId: "cat_default", rules: srv.bio || "" } };

  const catList = $("server-categories-list");
  catList.innerHTML = "";
  Object.entries(cats).sort((a,b) => (a[1].order || 0) - (b[1].order || 0)).forEach(([catId, cat]) => {
    const grp = document.createElement("div");
    grp.className = "cat-group";
    grp.innerHTML = `<div class="cat-header"><span>${esc(cat.name)}</span></div>`;

    // Filtra canais da categoria + aplica trava de acesso a tickets
    Object.entries(chans)
      .filter(([, ch]) => (ch.categoryId || Object.keys(cats)[0]) === catId)
      .filter(([, ch]) => canSeeTicketChannel(ch))
      .forEach(([chId, ch]) => {
        const item = document.createElement("div");
        item.className = "chan-item" + (chId === S.currentChannelId ? " active" : "");
        const icon = ch.type === 'voice' ? SVG_VOL : ch.type === 'ticket' ? SVG_TAG : SVG_HASH;
        item.innerHTML = `${icon}<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(ch.name)}</span>`;
        if (isAdmin) {
          const eb = document.createElement("button");
          eb.className = "chan-edit-btn"; eb.innerHTML = SVG_EDIT;
          eb.onclick = (e) => { e.stopPropagation(); openEditChannelModal(chId, ch); };
          item.appendChild(eb);
        }
        item.onclick = () => {
          if (ch.type === 'voice') {
            joinRoom(`srv_${S.currentServerId}_${chId}`);
          } else {
            switchServerChannel(chId);
            $("server-channels-drawer").classList.remove("open");
          }
        };
        grp.appendChild(item);
      });
    catList.appendChild(grp);
  });

  const curCh = chans[S.currentChannelId] || { name: "geral", type: "text" };
  $("server-chan-title").innerHTML = (curCh.type === 'ticket' ? `${SVG_TAG} ` : '# ') + esc(curCh.name || 'geral');

  // Regras + info de permissões do canal
  const rulesText = curCh.syncCat && cats[curCh.categoryId]?.rules ? cats[curCh.categoryId].rules : (curCh.rules || "");
  const cp = curCh.perms || {};
  const blocked = [];
  if (cp.sendText === false) blocked.push("texto off");
  if (cp.sendMedia === false) blocked.push("mídias off");
  if (cp.sendVoice === false) blocked.push("voz off");
  if (cp.sendEmoji === false) blocked.push("emojis off");
  if (cp.sendServerEmoji === false) blocked.push("emojis de servidor off");
  const permsInfo = blocked.length ? ` 🔒 ${blocked.join(" · ")}` : "";

  $("server-chan-rules").innerHTML = rulesText
    ? `${SVG_INFO} ${esc(rulesText)}${permsInfo ? `<span style="color:var(--text-soft);font-size:.75rem;">${esc(permsInfo)}</span>` : ""}`
    : (srv.slowmode ? `${SVG_CLOCK} Slowmode: ${srv.slowmode}s${permsInfo ? ` · ${esc(permsInfo)}` : ""}` : "");

  $("server-ticket-close-btn").style.display = (curCh.type === 'ticket' && (isAdmin || curCh.ticketOwnerUid === S.currentUser.uid)) ? "inline-flex" : "none";
}

function switchServerChannel(chanId){
  // 🔒 Trava: bloqueia acesso a tickets alheios
  const targetCh = S.currentServerData?.channels?.[chanId];
  if (targetCh && !canSeeTicketChannel(targetCh)) {
    showToast("Você não tem acesso a este ticket");
    const fallback = S.currentServerData?.channels?.geral
      ? 'geral'
      : (Object.keys(S.currentServerData?.channels || {})
          .find(k => canSeeTicketChannel(S.currentServerData.channels[k])) || 'geral');
    if (fallback !== chanId) switchServerChannel(fallback);
    return;
  }

  S.replyTo = null;
  const rb = document.getElementById("reply-bar");
  if (rb) rb.style.display = "none";
  S.currentChannelId = chanId;
  renderServerUI();
  const box = $("server-chat-messages");
  box.innerHTML = '<div class="empty">Carregando mensagens...</div>';
  if (S.serverChatUnsub) S.serverChatUnsub();

  const path = chanId === 'geral' && !S.currentServerData?.channels?.geral
    ? `communities/${S.currentServerId}/chats/geral`
    : `communities/${S.currentServerId}/messages/${chanId}`;

  S.serverChatUnsub = onValue(query(ref(db, path), limitToLast(60)), (snap) => {
    box.innerHTML = "";
    const msgs = [];
    // ✅ CORREÇÃO: uso de chaves para evitar retornar o resultado de push() ao Firebase
    snap.forEach(c => {
      msgs.push({ id: c.key, ...c.val() });
    });
    if (!msgs.length) { box.innerHTML = '<div class="empty">Nenhuma mensagem neste canal ainda.</div>'; return; }
    msgs.forEach(m => renderMessage(m, box, { isServer: true, path, onSwitchChannel: switchServerChannel }));
    box.scrollTop = box.scrollHeight;
  });
  watchTyping(`communities/${S.currentServerId}/typing_${chanId}`, "server-typing");
}

function populateCategorySelect(selectedCatId){
  const sel = $("chan-cat-select"); sel.innerHTML = "";
  Object.entries(S.currentServerData?.categories || {}).forEach(([id, c]) => {
    const opt = document.createElement("option");
    opt.value = id; opt.textContent = c.name;
    if (id === selectedCatId) opt.selected = true;
    sel.appendChild(opt);
  });
}

/* ============================================================
   TOGGLES DE PERMISSÃO DO CANAL (injetados no modal)
   ============================================================ */
function ensureChannelPermsUI(){
  const saveBtn = $("chan-save-btn");
  if (!saveBtn) return null;
  let box = $("chan-perms-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "chan-perms-box";
    box.style.cssText = "margin:10px 0 12px;padding:10px 12px;border:1px solid var(--gold-light);border-radius:10px;background:var(--gold-soft);";
    box.innerHTML = `
      <div style="font-weight:700;font-size:.85rem;margin-bottom:8px;">Permissões do Canal</div>
      <label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;font-size:.85rem;"><input type="checkbox" data-cperm="sendText"> Enviar mensagem de texto</label>
      <label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;font-size:.85rem;"><input type="checkbox" data-cperm="sendMedia"> Enviar mídias (imagens/GIFs)</label>
      <label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;font-size:.85rem;"><input type="checkbox" data-cperm="sendVoice"> Enviar voz/áudio</label>
      <label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;font-size:.85rem;"><input type="checkbox" data-cperm="sendEmoji"> Enviar emojis</label>
      <label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;font-size:.85rem;"><input type="checkbox" data-cperm="sendServerEmoji"> Enviar emojis do servidor</label>
    `;
    if (saveBtn.parentNode) saveBtn.parentNode.insertBefore(box, saveBtn);
    else ($("channel-modal")?.querySelector(".modal-card, .modal-content, .modal-body") || $("channel-modal"))?.appendChild(box);
  }
  return box;
}

function applyChannelPermsUI(perms){
  const box = ensureChannelPermsUI();
  if (!box) return;
  const p = perms || {};
  box.querySelectorAll("input[data-cperm]").forEach(cb => {
    const key = cb.dataset.cperm;
    cb.checked = p[key] !== false;
  });
}

function openEditChannelModal(chId, ch){
  serverEditingChanId = chId;
  $("chan-modal-title").textContent = "Editar Canal";
  $("chan-name-input").value = ch.name || "";
  $("chan-type-select").value = ch.type || "text";
  $("chan-rules-input").value = ch.rules || "";
  $("chan-sync-cat").checked = !!ch.syncCat;
  populateCategorySelect(ch.categoryId);
  applyChannelPermsUI(ch.perms);
  openModal("channel-modal");
}

function openServerInviteFriends(){
  if (!S.currentServerId || !S.currentServerData) return;
  const code = S.currentServerData.inviteCode || S.currentServerId;
  const linkEl = $("sif-link");
  linkEl.textContent = code;
  linkEl.onclick = () => copyText(code);

  const list = $("sif-friends-list"); list.innerHTML = "";
  const arr = Object.entries(S.friendsMap);
  if (!arr.length) list.innerHTML = '<div class="empty">Nenhum amigo para convidar.</div>';
  arr.forEach(([fid, f]) => {
    const row = document.createElement("div"); row.className = "list-item";
    row.innerHTML = `<img class="avatar round" src="${f.avatarUrl || DEFAULT_AVATAR}" />
      <div class="list-item-info"><div class="list-item-name">${esc(f.nick || 'Amigo')}</div></div>
      <button class="mini-btn gold">Enviar Convite</button>`;
    row.querySelector("button").onclick = async () => {
      await push(ref(db, `dms/${dmPairId(S.currentUser.uid, fid)}/messages`), {
        type: 'server_invite', serverId: S.currentServerId, serverName: S.currentServerData.name || 'Servidor',
        serverAvatar: S.currentServerData.avatarUrl || '', serverAge: S.currentServerData.ageRating || 'all',
        text: `Convite para o servidor ${S.currentServerData.name}`,
        senderUid: S.currentUser.uid, senderNick: S.userProfile.nick || 'Anônimo', senderAvatar: S.userProfile.avatarUrl || '', timestamp: Date.now()
      });
      showToast(`Convite enviado para ${f.nick || 'amigo'}!`);
    };
    list.appendChild(row);
  });
  openModal("server-invite-friends-modal");
}

function openServerSettings(tab){
  if (!S.currentServerData) return;
  editServerAvatarData = ""; editBotAvatarData = ""; editAchIconData = "";
  $("srv-name").value = S.currentServerData.name || "";
  $("srv-avatar-url").value = S.currentServerData.avatarUrl || "";
  $("srv-age").value = S.currentServerData.ageRating || "all";
  $("srv-slowmode").value = String(S.currentServerData.slowmode || 0);
  $("srv-invite-code").value = S.currentServerData.inviteCode || "";

  const tb = S.currentServerData.ticketBot || {};
  $("srv-bot-name").value = tb.name || "Hezz Ticket";
  $("srv-bot-avatar").value = tb.avatarUrl || "foto.png";
  $("srv-bot-bio").value = tb.bio || "";

  document.querySelectorAll('#srv-settings-tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.sub === tab));
  document.querySelectorAll('#view-server-settings .subview').forEach(s => s.classList.toggle('active', s.id === 'sub-' + tab));
  renderServerMembersList();
  renderServerRolesList();
  renderServerBadgesTab();
  openView('view-server-settings');
}

function renderServerMembersList(){
  const box = $("srv-members-list"); box.innerHTML = "";
  const members = S.currentServerData?.members || {};
  const roles = S.currentServerData?.roles || {};
  const perms = myMemberPerms();

  Object.entries(members).forEach(([uid, m]) => {
    const row = document.createElement("div");
    row.className = "list-item"; row.style.cursor = "default";
    const statusSub = uid === S.currentServerData.ownerUid
      ? `${SVG_CROWN} Dono`
      : (m.timeoutUntil > Date.now() ? `${SVG_CLOCK} Em Timeout` : 'Membro');
    row.innerHTML = `<img class="avatar round" src="${m.avatarUrl || DEFAULT_AVATAR}" />
      <div class="list-item-info"><div class="list-item-name">${esc(m.nick || uid)}</div>
      <div class="list-item-sub">${statusSub}</div></div>`;

    if ((perms.admin || perms.manageRoles) && uid !== S.currentServerData.ownerUid) {
      const sel = document.createElement("select");
      sel.style.cssText = "padding:6px;border-radius:8px;border:1px solid var(--border);font-size:.75rem;background:var(--input-bg);color:var(--text);";
      sel.innerHTML = `<option value="">Sem cargo</option>` + Object.entries(roles).map(([rid, r]) => `<option value="${rid}" ${m.roleId === rid ? 'selected' : ''}>${esc(r.name)}</option>`).join('');
      sel.onchange = () => update(ref(db, `communities/${S.currentServerId}/members/${uid}`), { roleId: sel.value || null });
      row.appendChild(sel);
    }
    if ((perms.admin || perms.timeoutMembers) && uid !== S.currentServerData.ownerUid && uid !== S.currentUser.uid) {
      const tb = document.createElement("button"); tb.className = "mini-btn decline"; tb.innerHTML = SVG_CLOCK; tb.title = "Timeout";
      tb.onclick = () => { timeoutTargetUid = uid; $("to-target-name").textContent = "Membro: " + (m.nick || uid); openModal("timeout-modal"); };
      row.appendChild(tb);
    }
    box.appendChild(row);
  });
}

function renderServerRolesList(){
  const box = $("srv-roles-list"); box.innerHTML = "";
  const arr = Object.entries(S.currentServerData?.roles || {});
  if (!arr.length) { box.innerHTML = '<div class="empty">Nenhum cargo criado.</div>'; return; }
  arr.forEach(([rid, r]) => {
    const row = document.createElement("div"); row.className = "list-item";
    row.innerHTML = `<span class="role-pill" style="background:${r.color || '#e8b923'}">${esc(r.name)}</span><div class="list-item-info"></div><button class="mini-btn gold">Permissões</button>`;
    row.querySelector("button").onclick = () => openRoleEditModal(rid, r);
    box.appendChild(row);
  });
}

function renderServerBadgesTab(){
  const listEl = $("srv-badges-list");
  if (!listEl) return;
  listEl.innerHTML = "";
  const badges = S.currentServerData?.badges || {};
  const entries = Object.entries(badges);
  const count = entries.length;

  $("srv-badge-form").style.display = count >= 3 ? "none" : "flex";
  $("srv-badge-limit-hint").textContent = `${count}/3 Conquistas criadas neste servidor.`;

  if (!count) {
    listEl.innerHTML = '<div class="empty">Nenhuma conquista criada. Crie até 3 no formulário acima!</div>';
    return;
  }

  entries.forEach(([bid, b]) => {
    const card = document.createElement("div");
    card.className = "ach-card";
    const condLabel = b.type === 'account_days'
      ? `${b.threshold} dias de conta criada`
      : `${b.threshold} mensagens enviadas neste servidor`;

    card.innerHTML = `
      <div class="ach-thumb">
        ${b.iconUrl ? `<img src="${b.iconUrl}" />` : SVG_AWARD}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:.88rem;">${esc(b.title)}</div>
        <div style="font-size:.72rem;color:var(--text-soft);">${condLabel}</div>
      </div>
      <button class="mini-btn decline" data-del-badge="${bid}">Excluir</button>
    `;
    card.querySelector('[data-del-badge]').onclick = async () => {
      await remove(ref(db, `communities/${S.currentServerId}/badges/${bid}`));
      showToast("Conquista removida!");
      renderServerBadgesTab();
    };
    listEl.appendChild(card);
  });
}

function openRoleEditModal(rid, r){
  editingRoleId = rid;
  $("rem-title").textContent = "Permissões: " + r.name;
  const permsDef = [
    ['sendMessages', 'Enviar mensagens'], ['manageMessages', 'Apagar / Fixar mensagens'],
    ['manageChannels', 'Criar / Editar canais'], ['timeoutMembers', 'Aplicar Timeout em membros'],
    ['manageRoles', 'Gerenciar cargos'], ['admin', 'Administrador Total']
  ];
  const box = $("rem-perms"); box.innerHTML = "";
  permsDef.forEach(([k, lbl]) => {
    const label = document.createElement("label");
    label.style.cssText = "display:flex;align-items:center;gap:8px;cursor:pointer;";
    label.innerHTML = `<input type="checkbox" data-perm="${k}" ${r.perms?.[k] ? 'checked' : ''} /> ${lbl}`;
    box.appendChild(label);
  });
  openModal("role-edit-modal");
}

function openSetupTicketModal(){
  const sel = $("tk-role"); sel.innerHTML = `<option value="">Todos (sem cargo)</option>`;
  Object.entries(S.currentServerData?.roles || {}).forEach(([rid, r]) => {
    sel.innerHTML += `<option value="${rid}">${esc(r.name)}</option>`;
  });
  renderExistingTickets();
  openModal("setup-ticket-modal");
}

function renderExistingTickets(){
  const box = $("tk-existing-list"); box.innerHTML = "";
  Object.entries(S.currentServerData?.ticketConfigs || {}).forEach(([id, t]) => {
    const row = document.createElement("div"); row.className = "list-item"; row.style.cursor = "default";
    row.innerHTML = `<div class="list-item-info"><div class="list-item-name">/send-${esc(id)}</div><div class="list-item-sub">${esc(t.title)}</div></div>
      <button class="mini-btn decline">Apagar</button>`;
    row.querySelector("button").onclick = async () => { await remove(ref(db, `communities/${S.currentServerId}/ticketConfigs/${id}`)); renderExistingTickets(); };
    box.appendChild(row);
  });
}

/* ============================================================
   ENVIO DE MENSAGEM (com enforcement de toggles + reply + ticket)
   ============================================================ */
export async function sendServerMessage(payload){
  if (!S.currentServerId || !S.currentUser) return;

  // 🔒 Trava: não envia em ticket alheio
  const targetCh = S.currentServerData?.channels?.[S.currentChannelId];
  if (targetCh && !canSeeTicketChannel(targetCh)) {
    showToast("Você não tem acesso a este ticket");
    return;
  }

  const meMember = S.currentServerData?.members?.[S.currentUser.uid];
  if (meMember?.timeoutUntil && meMember.timeoutUntil > Date.now()) {
    const rem = Math.ceil((meMember.timeoutUntil - Date.now()) / 1000);
    showToast(`Você está em timeout por mais ${rem}s`);
    return;
  }
  const perms = myMemberPerms();
  if (perms.sendMessages === false) { showToast("Seu cargo não pode enviar mensagens"); return; }
  const isAdmin = perms.admin || perms.manageMessages;

  // Toggles do canal
  const cp = targetCh?.perms || {};
  if (!isAdmin) {
    if (payload.type === 'text' && cp.sendText === false) return showToast("Este canal não permite mensagens de texto");
    if ((payload.type === 'image' || payload.type === 'gif') && cp.sendMedia === false) return showToast("Este canal não permite mídias");
    if (payload.type === 'audio' && cp.sendVoice === false) return showToast("Este canal não permite voz/áudio");
    if (payload.type === 'text') {
      if (cp.sendEmoji === false && /[\u{1F300}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{27BF}]/u.test(payload.text || '')) {
        return showToast("Este canal não permite emojis");
      }
      if (cp.sendServerEmoji === false && /:pulse[1-5]:/i.test(payload.text || '')) {
        return showToast("Este canal não permite emojis do servidor");
      }
    }
  }

  if (!isAdmin && !checkSendCooldown(Number(S.currentServerData?.slowmode || 0))) return;

  S.lastSentMsgAt = Date.now();
  payload.senderUid = S.currentUser.uid;
  payload.senderNick = S.userProfile.nick || "Anônimo";
  payload.senderAvatar = S.userProfile.avatarUrl || "";
  payload.timestamp = Date.now();

  // Anexa citação de resposta
  attachReplyToPayload(payload);

  const path = S.currentChannelId === 'geral' && !S.currentServerData?.channels?.geral
    ? `communities/${S.currentServerId}/chats/geral`
    : `communities/${S.currentServerId}/messages/${S.currentChannelId}`;
  try {
    await push(ref(db, path), payload);
    const curMsgs = (meMember?.msgCount || 0) + 1;
    await update(ref(db, `communities/${S.currentServerId}/members/${S.currentUser.uid}`), { msgCount: curMsgs });
  }
  catch (err) { showToast("Erro ao enviar: " + err.message); }
}

export function initServers(){
  S.onRenderDiscover = renderDiscover;
  S.onShowInviteModal = showInviteModal;
  S.onSendServerAudio = (audioUrl) => sendServerMessage({ type: 'audio', audioUrl });
  S.onSendServerPayload = (payload) => sendServerMessage(payload);

  $("discover-search")?.addEventListener("input", renderDiscover);
  $("discover-btn")?.addEventListener("click", renderDiscover);

  $("btn-join-invite").addEventListener("click", () => {
    const code = prompt("Cole o código ou link de convite do servidor:");
    if (code) openInviteByCode(code);
  });
  $("inv-accept-btn").onclick = async () => {
    if (!pendingInviteServer) return;
    const { id, data } = pendingInviteServer;
    closeModals();
    await joinServer(id, data);
  };
  $("inv-decline-btn").onclick = () => { pendingInviteServer = null; closeModals(); };

  $("btn-open-create-community").addEventListener("click", () => {
    if (!S.currentUser) { showToast("Aguarde conectar..."); return; }
    $("community-invite-wrap").style.display = isPulse() ? "flex" : "none";
    openView('view-create-community');
    setOpen(false);
  });
  $("community-avatar-file").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!isPulse()) { showToast("Upload direto é exclusivo do PULSE. Use URL."); e.target.value = ""; return; }
    try { editCommunityAvatar = await fileToBase64(f, maxUploadMB() * 1024 * 1024); $("community-avatar-url").value = ""; }
    catch (err) { showToast(err.message); }
    e.target.value = "";
  });

  $("create-community-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!S.currentUser) return;
    try {
      const snap = await get(ref(db, `users/${S.currentUser.uid}/communities`));
      const count = snap.exists() ? Object.keys(snap.val()).length : 0;
      if (count >= maxCommunities()) { showToast(`Limite do seu plano: ${maxCommunities()} servidores`); return; }
      const name = $("community-name").value.trim();
      const bio = $("community-bio").value.trim();
      const ageRating = $("community-age").value || 'all';
      const avatarUrl = editCommunityAvatar || $("community-avatar-url").value.trim();
      if (!name) { showToast("Dê um nome ao servidor"); return; }

      let inviteCode = randomInviteCode();
      if (isPulse()) {
        const custom = $("community-invite-input").value.trim().replace(/[^a-zA-Z0-9_-]/g, '');
        if (custom) {
          const invSnap = await get(ref(db, `invites/${custom}`));
          if (invSnap.exists()) { showToast("Esse link de convite já está em uso!"); return; }
          inviteCode = custom;
        }
      }

      const communityRef = push(ref(db, "communities"));
      const cid = communityRef.key;
      const catTextId = "cat_text", catVoiceId = "cat_voice";
      await set(communityRef, {
        id: cid, name, bio, avatarUrl, ageRating, inviteCode, slowmode: 0,
        ownerUid: S.currentUser.uid, createdAt: Date.now(),
        ticketBot: { name: "Hezz Ticket", avatarUrl: "foto.png", bio: "Bot de suporte deste servidor" },
        categories: {
          [catTextId]: { name: "CANAIS DE TEXTO", order: 1, rules: "Seja respeitoso no chat." },
          [catVoiceId]: { name: "CANAIS DE VOZ", order: 2, rules: "Use fone para evitar eco." }
        },
        channels: {
          geral: { name: "geral", type: "text", categoryId: catTextId, rules: "Seja respeitoso no chat.", syncCat: true, perms: { sendText: true, sendMedia: true, sendVoice: true, sendEmoji: true, sendServerEmoji: true } },
          call1: { name: "Call Geral", type: "voice", categoryId: catVoiceId, rules: "", syncCat: true }
        },
        members: { [S.currentUser.uid]: { uid: S.currentUser.uid, nick: S.userProfile.nick || "Anônimo", avatarUrl: S.userProfile.avatarUrl || "", joinedAt: Date.now(), msgCount: 0 } }
      });
      await set(ref(db, `invites/${inviteCode}`), { communityId: cid, createdAt: Date.now() });
      await update(ref(db, `users/${S.currentUser.uid}/communities/${cid}`), { name, bio, avatarUrl, ageRating, joinedAt: Date.now() });
      $("create-community-form").reset(); editCommunityAvatar = "";
      showToast("Servidor criado!");
      openServer(cid);
    } catch (err) { showToast("Erro ao criar: " + err.message); }
  });

  $("server-drawer-toggle").onclick = () => {
    const dr = $("server-channels-drawer");
    if (window.innerWidth <= 768) dr.classList.toggle("open");
    else dr.classList.toggle("collapsed");
  };
  $("server-ticket-close-btn").onclick = async () => {
    if (!S.currentServerId || !S.currentChannelId) return;
    if (!confirm("Fechar e apagar este canal de ticket?")) return;
    await remove(ref(db, `communities/${S.currentServerId}/channels/${S.currentChannelId}`));
    await remove(ref(db, `communities/${S.currentServerId}/messages/${S.currentChannelId}`));
    switchServerChannel('geral'); showToast("Ticket fechado!");
  };

  $("server-btn-add-cat").onclick = () => { $("cat-name-input").value = ""; openModal("category-modal"); };
  $("cat-create-btn").onclick = async () => {
    const name = $("cat-name-input").value.trim();
    if (!name || !S.currentServerId) return;
    await set(ref(db, `communities/${S.currentServerId}/categories/cat_${Date.now()}`), { name: name.toUpperCase(), order: Date.now(), rules: "" });
    closeModals(); showToast("Categoria criada!");
  };
  $("server-btn-add-chan").onclick = () => {
    serverEditingChanId = null;
    $("chan-modal-title").textContent = "Novo Canal";
    $("chan-name-input").value = ""; $("chan-type-select").value = "text";
    $("chan-rules-input").value = ""; $("chan-sync-cat").checked = true;
    populateCategorySelect();
    applyChannelPermsUI({});
    openModal("channel-modal");
  };
  $("chan-save-btn").onclick = async () => {
    if (!S.currentServerId) return;
    const name = $("chan-name-input").value.trim();
    if (!name) return;
    const key = serverEditingChanId || ("ch_" + Date.now());
    const perms = {};
    document.querySelectorAll("#chan-perms-box input[data-cperm]").forEach(cb => {
      perms[cb.dataset.cperm] = cb.checked;
    });
    await update(ref(db, `communities/${S.currentServerId}/channels/${key}`), {
      name, type: $("chan-type-select").value, categoryId: $("chan-cat-select").value,
      rules: $("chan-rules-input").value.trim(), syncCat: $("chan-sync-cat").checked,
      perms
    });
    closeModals(); showToast("Canal salvo!");
  };

  $("server-pinned-btn").onclick = async () => {
    if (!S.currentServerId) return;
    const snap = await get(ref(db, `communities/${S.currentServerId}/pinned/${S.currentChannelId}`));
    const box = $("pinned-list"); box.innerHTML = "";
    const arr = Object.entries(snap.val() || {});
    if (!arr.length) box.innerHTML = '<div class="empty">Nenhuma mensagem fixada neste canal.</div>';
    else arr.forEach(([mid, m]) => {
      const d = document.createElement("div"); d.className = "card";
      d.innerHTML = `<div style="font-size:.75rem;font-weight:700;">${esc(m.senderNick)}</div><div style="font-size:.85rem;">${fmt(m.text || '[Mídia]')}</div>`;
      if (myMemberPerms().manageMessages || myMemberPerms().admin) {
        const ub = document.createElement("button"); ub.className = "mini-btn decline"; ub.textContent = "Desafixar";
        ub.onclick = async () => { await remove(ref(db, `communities/${S.currentServerId}/pinned/${S.currentChannelId}/${mid}`)); d.remove(); };
        d.appendChild(ub);
      }
      box.appendChild(d);
    });
    openModal("pinned-modal");
  };

  $("server-btn-invite").onclick = openServerInviteFriends;
  $("tool-invite-friends").onclick = () => { $("server-tools-menu").classList.remove("show"); openServerInviteFriends(); };
  $("server-btn-members").onclick = () => openServerSettings('srv-members');
  $("server-btn-settings").onclick = () => openServerSettings('srv-general');

  document.querySelectorAll('#srv-settings-tabs .tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#srv-settings-tabs .tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('#view-server-settings .subview').forEach(s => s.classList.remove('active'));
      $('sub-' + btn.dataset.sub).classList.add('active');
      if (btn.dataset.sub === 'srv-badges') renderServerBadgesTab();
    });
  });

  $("srv-avatar-file").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!isPulse()) { showToast("Upload direto é exclusivo do PULSE. Use URL."); e.target.value = ""; return; }
    try { editServerAvatarData = await fileToBase64(f, maxUploadMB() * 1024 * 1024); $("srv-avatar-url").value = ""; }
    catch (err) { showToast(err.message); }
    e.target.value = "";
  });
  $("srv-bot-avatar-file").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!isPulse()) { showToast("Upload direto é exclusivo do PULSE. Use URL."); e.target.value = ""; return; }
    try { editBotAvatarData = await fileToBase64(f, maxUploadMB() * 1024 * 1024); $("srv-bot-avatar").value = ""; }
    catch (err) { showToast(err.message); }
    e.target.value = "";
  });

  $("srv-save-general").onclick = async () => {
    if (!S.currentServerId || !S.currentServerData) return;
    const newAvatar = editServerAvatarData || $("srv-avatar-url").value.trim();
    let photoChanges = S.currentServerData.photoChanges || { date: todayKey(), count: 0 };
    if (photoChanges.date !== todayKey()) photoChanges = { date: todayKey(), count: 0 };
    if (newAvatar !== (S.currentServerData.avatarUrl || "")) {
      if (photoChanges.count >= 5) { showToast("Limite de 5 trocas de foto do servidor por dia!"); return; }
      photoChanges.count += 1;
    }

    let inviteCode = S.currentServerData.inviteCode || randomInviteCode();
    const desired = $("srv-invite-code").value.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (desired && desired !== inviteCode) {
      if (!isPulse()) { showToast("Link de convite personalizado é exclusivo do PULSE!"); return; }
      const invSnap = await get(ref(db, `invites/${desired}`));
      if (invSnap.exists()) { showToast("Esse código de convite já existe!"); return; }
      await remove(ref(db, `invites/${inviteCode}`));
      await set(ref(db, `invites/${desired}`), { communityId: S.currentServerId, createdAt: Date.now() });
      inviteCode = desired;
    }

    const name = $("srv-name").value.trim() || S.currentServerData.name;
    const ageRating = $("srv-age").value;
    const slowmode = Number($("srv-slowmode").value || 0);
    await update(ref(db, `communities/${S.currentServerId}`), { name, avatarUrl: newAvatar, ageRating, slowmode, inviteCode, photoChanges });
    await update(ref(db, `users/${S.currentUser.uid}/communities/${S.currentServerId}`), { name, avatarUrl: newAvatar, ageRating });
    showToast("Servidor atualizado!");
  };

  $("srv-save-bot").onclick = async () => {
    if (!S.currentServerId) return;
    await set(ref(db, `communities/${S.currentServerId}/ticketBot`), {
      name: $("srv-bot-name").value.trim() || "Hezz Ticket",
      avatarUrl: editBotAvatarData || $("srv-bot-avatar").value.trim() || "foto.png",
      bio: $("srv-bot-bio").value.trim()
    });
    showToast("Bot de Tickets atualizado!");
  };

  // Conquistas / Badges do Servidor
  $("srv-ach-icon-file")?.addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { editAchIconData = await fileToBase64(f, 2 * 1024 * 1024); }
    catch (err) { showToast(err.message); }
    e.target.value = "";
  });

  $("srv-save-badge-btn")?.addEventListener("click", async () => {
    if (!S.currentServerId || !S.currentServerData) return;
    const title = $("srv-badge-title")?.value.trim();
    const threshold = Number($("srv-badge-threshold")?.value || 1);
    const type = $("srv-badge-type")?.value || 'messages';
    const iconUrl = editAchIconData || $("srv-badge-icon-url")?.value.trim() || "";

    if (!title) { showToast("Preencha o nome da conquista!"); return; }
    const currentBadges = S.currentServerData.badges || {};
    if (Object.keys(currentBadges).length >= 3) { showToast("Limite máximo de 3 conquistas atingido!"); return; }

    const bid = "ach_" + Date.now();
    await set(ref(db, `communities/${S.currentServerId}/badges/${bid}`), {
      id: bid, title, type, threshold, iconUrl, createdAt: Date.now()
    });
    if ($("srv-badge-title")) $("srv-badge-title").value = "";
    if ($("srv-badge-threshold")) $("srv-badge-threshold").value = "10";
    if ($("srv-badge-icon-url")) $("srv-badge-icon-url").value = "";
    editAchIconData = "";
    showToast("Conquista criada!");
    renderServerBadgesTab();
  });

  $("to-confirm-btn").onclick = async () => {
    if (!timeoutTargetUid || !S.currentServerId) return;
    const sec = Number($("to-duration").value || 60);
    await update(ref(db, `communities/${S.currentServerId}/members/${timeoutTargetUid}`), { timeoutUntil: Date.now() + sec * 1000 });
    closeModals(); renderServerMembersList(); showToast("Timeout aplicado!");
  };

  $("srv-role-create-btn").onclick = async () => {
    const name = $("srv-role-name").value.trim(), color = $("srv-role-color").value;
    if (!name || !S.currentServerId) return;
    await set(ref(db, `communities/${S.currentServerId}/roles/role_${Date.now()}`), {
      name, color, perms: { sendMessages: true, manageMessages: false, manageChannels: false, timeoutMembers: false, manageRoles: false, admin: false }
    });
    $("srv-role-name").value = ""; renderServerRolesList(); showToast("Cargo criado!");
  };

  $("rem-save-btn").onclick = async () => {
    if (!editingRoleId || !S.currentServerId) return;
    const perms = {};
    $("rem-perms").querySelectorAll("input[data-perm]").forEach(cb => { perms[cb.dataset.perm] = cb.checked; });
    await update(ref(db, `communities/${S.currentServerId}/roles/${editingRoleId}`), { perms });
    closeModals(); showToast("Permissões salvas!");
  };

  $("tk-create-btn").onclick = async () => {
    const id = $("tk-id").value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const title = $("tk-title").value.trim(), text = $("tk-text").value.trim(), roleId = $("tk-role").value;
    if (!id || !title) { showToast("Preencha ID e Título do ticket"); return; }
    await set(ref(db, `communities/${S.currentServerId}/ticketConfigs/${id}`), { id, title, text, roleId });
    $("tk-id").value = ""; $("tk-title").value = ""; $("tk-text").value = "";
    renderExistingTickets(); showToast(`Ticket salvo! Use /send-${id} no chat.`);
  };

  $("server-btn-tools").onclick = (e) => { e.stopPropagation(); $("server-tools-menu").classList.toggle("show"); };
  $("tool-poll").onclick = () => { $("server-tools-menu").classList.remove("show"); openModal("poll-modal"); };
  $("tool-cinema").onclick = () => { $("server-tools-menu").classList.remove("show"); openCinemaFromAnywhere(); };

  $("poll-create-btn").onclick = async () => {
    const q = $("poll-question").value.trim();
    const opts = [$("poll-opt1").value.trim(), $("poll-opt2").value.trim(), $("poll-opt3").value.trim()].filter(Boolean);
    if (!q || opts.length < 2) { showToast("Coloque pergunta e pelo menos 2 opções"); return; }
    await sendServerMessage({ type: 'poll', question: q, options: opts, votes: {} });
    $("poll-question").value = ""; $("poll-opt1").value = ""; $("poll-opt2").value = ""; $("poll-opt3").value = "";
    closeModals();
  };

  bindTyping("server-chat-input", () => S.currentServerId ? `communities/${S.currentServerId}/typing_${S.currentChannelId}` : null);
  setupInputPopups($("server-chat-input"), $("server-mention-popup"), $("server-slash-popup"), true);

  $("server-btn-send").addEventListener("click", async () => {
    const inp = $("server-chat-input");
    const text = inp.value.trim();
    if (!text) return;
    $("server-slash-popup").classList.remove("show");
    $("server-mention-popup").classList.remove("show");

    if (text.startsWith('/')) {
      const cmd = text.split(/\s+/)[0].toLowerCase();
      const perms = myMemberPerms();
      if (cmd === '/setup') {
        if (!perms.admin && !perms.manageChannels) return showToast("Apenas admins podem usar /setup");
        inp.value = ""; openSetupTicketModal(); return;
      }
      if (cmd === '/poll') { inp.value = ""; openModal("poll-modal"); return; }
      if (cmd === '/cinema') { inp.value = ""; openCinemaFromAnywhere(); return; }
      if (cmd.startsWith('/send-')) {
        if (!perms.admin && !perms.manageChannels) return showToast("Apenas admins podem usar /send");
        const tkId = cmd.replace('/send-', '');
        const cfg = S.currentServerData?.ticketConfigs?.[tkId];
        if (!cfg) return showToast("Ticket não encontrado. Crie com /setup");
        inp.value = "";
        const tb = S.currentServerData.ticketBot || { name: 'Hezz Ticket', avatarUrl: 'foto.png' };
        const path = S.currentChannelId === 'geral' && !S.currentServerData?.channels?.geral
          ? `communities/${S.currentServerId}/chats/geral`
          : `communities/${S.currentServerId}/messages/${S.currentChannelId}`;
        await push(ref(db, path), {
          type: 'ticket_panel', ticketId: tkId, title: cfg.title, text: cfg.text,
          senderUid: 'hezz_ticket_bot', senderNick: tb.name || 'Hezz Ticket', senderAvatar: tb.avatarUrl || 'foto.png', timestamp: Date.now()
        });
        return;
      }
    }

    await sendServerMessage({ type: 'text', text });
    inp.value = "";
  });

  $("server-chat-input").addEventListener("keypress", (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $("server-btn-send").click();
    }
  });

  $("server-image-upload").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const maxBytes = maxUploadMB() * 1024 * 1024;
    if (f.size > maxBytes) { showToast(`Imagem muito grande (máx ${maxUploadMB()}MB no seu plano)`); e.target.value = ""; return; }
    try { const base64 = await fileToBase64(f, maxBytes); sendServerMessage({ type: 'image', imageUrl: base64 }); }
    catch (err) { showToast(err.message); }
    e.target.value = "";
  });
}