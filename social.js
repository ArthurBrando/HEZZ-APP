import { ref, set, update, get, onValue, query, limitToLast, push, onChildAdded } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { db, S, $, esc, DEFAULT_AVATAR, dmPairId, maxUploadMB, labelState, fileToBase64 } from "./state.js";
import { showToast, openView, openModal, closeModals, watchTyping, bindTyping } from "./ui.js";
import { joinRoom, logCall, sendInviteTo } from "./calls.js";
import { openUserProfileModal } from "./profile.js";
import { renderMessage, setupInputPopups, attachReplyToPayload } from "./chat.js";

let friendsUnsub = null;
let groupsUnsub = null;
let requestsUnsub = null;
let groupModalMode = 'create';
const dmNotifMap = {};

export function subscribeFriends(uid){
  if (friendsUnsub) friendsUnsub();
  friendsUnsub = onValue(ref(db, `users/${uid}/friends`), (snap) => {
    S.friendsMap = snap.val() || {};
    renderFriendsLists();
  });
}

export function subscribeGroups(uid){
  if (groupsUnsub) groupsUnsub();
  groupsUnsub = onValue(ref(db, `users/${uid}/groups`), (snap) => {
    S.groupsMap = snap.val() || {};
    renderGroupsList();
  });
}

export function subscribeRequests(uid){
  if (requestsUnsub) requestsUnsub();
  requestsUnsub = onValue(ref(db, `friend_requests/${uid}`), (snap) => renderRequests(snap.val() || {}));
}

export function subscribeDmAlerts(uid){
  onChildAdded(ref(db, `dms`), (snap) => {
    const pair = snap.key;
    if (!pair.includes(uid) || dmNotifMap[pair]) return;
    dmNotifMap[pair] = true;
    const firstBoot = Date.now();
    onChildAdded(query(ref(db, `dms/${pair}/messages`), limitToLast(1)), (ms) => {
      const m = ms.val();
      if (!m || m.senderUid === uid || (m.timestamp || 0) < firstBoot) return;
      if (document.hidden && "Notification" in window && Notification.permission === "granted") {
        new Notification(`HEZZ • ${m.senderNick || 'Mensagem'}`, { body: m.text || 'Nova mensagem', icon: 'foto.png' });
      }
    });
  });
}

function makeFriendItem(f){
  const item = document.createElement('div');
  item.className = 'list-item';
  item.innerHTML = `<img class="avatar round" src="${f.avatarUrl || DEFAULT_AVATAR}" />
    <div class="list-item-info">
      <div class="list-item-name">${esc(f.nick || 'Amigo')}</div>
      <div class="list-item-sub">ID: ${esc((f.uid || '').slice(0,10))}…</div>
    </div>`;
  item.onclick = () => openDm(f.uid);
  return item;
}

function renderFriendsLists(){
  const arr = Object.entries(S.friendsMap).map(([k,v]) => ({ ...v, uid: v.uid || k })).sort((a,b) => (a.nick || '').localeCompare(b.nick || ''));
  const fEl = $("friends-list"), dEl = $("dm-friends-list");
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

function renderGroupsList(){
  const el = $("groups-list");
  if (!el) return;
  el.innerHTML = "";
  const arr = Object.entries(S.groupsMap);
  if (!arr.length) { el.innerHTML = '<div class="empty">Nenhum grupo privado ainda.</div>'; return; }
  arr.forEach(([gid, g]) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `<img class="avatar round" src="${g.avatarUrl || 'foto.png'}" onerror="this.src='${DEFAULT_AVATAR}'" />
      <div class="list-item-info">
        <div class="list-item-name">${esc(g.name || 'Grupo Privado')}</div>
        <div class="list-item-sub">Grupo Privado</div>
      </div>`;
    item.onclick = () => openGroupDm(gid);
    el.appendChild(item);
  });
}

export async function sendFriendRequest(targetUid){
  if (!S.currentUser) return;
  targetUid = (targetUid || '').trim();
  if (!targetUid) { showToast("Informe o ID do usuário"); return; }
  if (targetUid === S.currentUser.uid) { showToast("Você não pode adicionar a si mesmo"); return; }
  if (S.friendsMap[targetUid]) { showToast("Essa pessoa já é seu amigo"); return; }
  try {
    const snap = await get(ref(db, `users/${targetUid}`));
    if (!snap.exists()) { showToast("Usuário não encontrado"); return; }
    const target = snap.val();
    const privacy = (target.privacy && target.privacy.friendRequests) || "all";
    if (privacy === "none") { showToast("Este usuário não aceita pedidos de amizade"); return; }
    await set(ref(db, `friend_requests/${targetUid}/${S.currentUser.uid}`), {
      fromUid: S.currentUser.uid, fromNick: S.userProfile.nick || "Anônimo",
      fromAvatar: S.userProfile.avatarUrl || "", createdAt: Date.now()
    });
    $("friend-id-input").value = "";
    showToast("Pedido de amizade enviado!");
  } catch (err) { showToast("Erro: " + err.message); }
}

function renderRequests(list){
  const el = $("requests-list");
  if (!el) return;
  el.innerHTML = "";
  const arr = Object.entries(list);
  if (!arr.length) { el.innerHTML = '<div class="empty">Nenhum convite no momento.</div>'; return; }
  arr.forEach(([fromUid, r]) => {
    const item = document.createElement('div');
    item.className = 'list-item'; item.style.cursor = 'default';
    item.innerHTML = `<img class="avatar round" src="${r.fromAvatar || DEFAULT_AVATAR}" />
      <div class="list-item-info">
        <div class="list-item-name">${esc(r.fromNick || 'Usuário')}</div>
        <div class="list-item-sub">quer ser seu amigo</div>
      </div>`;
    const actions = document.createElement('div');
    actions.style.display = 'flex'; actions.style.gap = '6px';
    const ok = document.createElement('button'); ok.className = 'mini-btn accept'; ok.textContent = 'Aceitar';
    ok.onclick = () => acceptRequest(fromUid);
    const no = document.createElement('button'); no.className = 'mini-btn decline'; no.textContent = 'Recusar';
    no.onclick = () => declineRequest(fromUid);
    actions.append(ok, no); item.appendChild(actions); el.appendChild(item);
  });
}

async function acceptRequest(fromUid){
  if (!S.currentUser) return;
  try {
    const snap = await get(ref(db, `users/${fromUid}`));
    const f = snap.val() || {};
    const updates = {};
    updates[`users/${S.currentUser.uid}/friends/${fromUid}`] = { uid: fromUid, nick: f.nick || 'Anônimo', avatarUrl: f.avatarUrl || '', since: Date.now() };
    updates[`users/${fromUid}/friends/${S.currentUser.uid}`] = { uid: S.currentUser.uid, nick: S.userProfile.nick || 'Anônimo', avatarUrl: S.userProfile.avatarUrl || '', since: Date.now() };
    updates[`friend_requests/${S.currentUser.uid}/${fromUid}`] = null;
    await update(ref(db), updates);
    showToast("Amizade aceita!");
  } catch (err) { showToast("Erro: " + err.message); }
}

async function declineRequest(fromUid){
  try { await set(ref(db, `friend_requests/${S.currentUser.uid}/${fromUid}`), null); showToast("Convite recusado"); }
  catch (err) { showToast("Erro: " + err.message); }
}

function openHezzBotDm(){
  if (!S.currentUser) return;
  S.currentDmType = 'bot';
  S.currentDmUid = 'hezz_bot';
  S.currentGroupId = null;
  S.replyTo = null;
  $("dm-header-name").textContent = "Hezz Bot";
  $("dm-header-sub").textContent = "BOT OFICIAL • Suporte & Alertas";
  $("dm-header-avatar").src = "foto.png";
  $("dm-header-deco").style.display = "none";
  $("dm-make-group-btn").style.display = "none";
  $("dm-group-add-btn").style.display = "none";
  $("dm-call-btn").style.display = "none";
  $("dm-support-banner").style.display = "flex";
  openView('view-dm');
  loadDmPath(`dms/${dmPairId(S.currentUser.uid, 'hezz_bot')}/messages`, "dm-typing", null);
}

export async function openDm(friendUid){
  if (!S.currentUser) return;
  const f = S.friendsMap[friendUid];
  if (!f) { showToast("Amigo não encontrado"); return; }
  S.currentDmType = 'dm';
  S.currentDmUid = friendUid;
  S.currentGroupId = null;
  S.replyTo = null;
  $("dm-header-name").textContent = f.nick || "Amigo";
  $("dm-header-sub").textContent = "Conversa privada";
  $("dm-header-avatar").src = f.avatarUrl || DEFAULT_AVATAR;
  $("dm-header-deco").style.display = "none";
  $("dm-make-group-btn").style.display = "inline-flex";
  $("dm-group-add-btn").style.display = "none";
  $("dm-call-btn").style.display = "grid";
  $("dm-support-banner").style.display = "none";
  openView('view-dm');
  get(ref(db, `users/${friendUid}`)).then(s => {
    const u = s.val() || {};
    if (u.decoUrl) { $("dm-header-deco").src = u.decoUrl; $("dm-header-deco").style.display = "block"; }
    $("dm-header-sub").textContent = u.status || labelState(u.state);
  }).catch(() => {});
  const pairId = dmPairId(S.currentUser.uid, friendUid);
  loadDmPath(`dms/${pairId}/messages`, "dm-typing", `dms/${pairId}/typing`);
}

async function openGroupDm(gid){
  if (!S.currentUser) return;
  const snap = await get(ref(db, `groups/${gid}`));
  if (!snap.exists()) { showToast("Grupo não encontrado"); return; }
  S.currentDmType = 'group';
  S.currentGroupId = gid;
  S.currentGroupData = snap.val();
  S.currentDmUid = null;
  S.replyTo = null;
  $("dm-header-name").textContent = S.currentGroupData.name || "Grupo Privado";
  $("dm-header-sub").textContent = `${Object.keys(S.currentGroupData.members || {}).length} membros`;
  $("dm-header-avatar").src = S.currentGroupData.avatarUrl || "foto.png";
  $("dm-header-deco").style.display = "none";
  $("dm-make-group-btn").style.display = "none";
  $("dm-group-add-btn").style.display = "inline-flex";
  $("dm-call-btn").style.display = "grid";
  $("dm-support-banner").style.display = "none";
  openView('view-dm');
  loadDmPath(`groups/${gid}/messages`, "dm-typing", `groups/${gid}/typing`);
}

function loadDmPath(msgPath, typingBarId, typingPath){
  const box = $("dm-messages");
  box.innerHTML = '<div class="empty">Carregando mensagens...</div>';
  if (S.dmUnsub) S.dmUnsub();
  S.dmUnsub = onValue(query(ref(db, msgPath), limitToLast(60)), (snap) => {
    box.innerHTML = "";
    const msgs = [];
    // ✅ CORREÇÃO: uso de chaves para evitar retornar o resultado de push() ao Firebase
    snap.forEach(c => {
      msgs.push({ id: c.key, ...c.val() });
    });
    if (!msgs.length) {
      box.innerHTML = S.currentDmType === 'bot'
        ? '<div class="empty">Olá! Aqui chegam os avisos oficiais e respostas do Suporte HEZZ.</div>'
        : '<div class="empty">Nenhuma mensagem ainda. Diga oi!</div>';
      return;
    }
    msgs.forEach(m => renderMessage(m, box, { isServer: false, path: msgPath }));
    box.scrollTop = box.scrollHeight;
  }, (err) => {
    box.innerHTML = '<div class="empty">Erro ao carregar: ' + esc(err.message) + '</div>';
  });
  if (typingPath) watchTyping(typingPath, typingBarId);
  else $(typingBarId).innerHTML = "";
}

// ✅ CORRIGIDO: retorna true/false, só marca lastSentMsgAt APÓS push bem-sucedido,
// usa anti-duplo-clique de 150ms (não trava mais o envio), anexa replyTo.
export async function sendDm(payload){
  if (!S.currentUser) return false;

  // Anti duplo-clique leve (150ms) — não bloqueia envios normais
  if (S.lastSentMsgAt && Date.now() - S.lastSentMsgAt < 150) return false;

  payload.senderUid = S.currentUser.uid;
  payload.senderNick = S.userProfile.nick || "Anônimo";
  payload.senderAvatar = S.userProfile.avatarUrl || "";
  payload.timestamp = Date.now();

  // ✅ Anexa citação de resposta (Responder)
  attachReplyToPayload(payload);

  let targetPath = null;
  if (S.currentDmType === 'group' && S.currentGroupId) targetPath = `groups/${S.currentGroupId}/messages`;
  else if (S.currentDmUid) targetPath = `dms/${dmPairId(S.currentUser.uid, S.currentDmUid)}/messages`;
  if (!targetPath) return false;

  try {
    await push(ref(db, targetPath), payload);
    S.lastSentMsgAt = Date.now();
    return true;
  } catch (err) {
    showToast("Erro ao enviar: " + err.message);
    return false;
  }
}

function openGroupModal(mode, preselectUid = null){
  groupModalMode = mode;
  $("grp-modal-title").textContent = mode === 'create' ? "Criar Grupo Privado" : "Adicionar Pessoas ao Grupo";
  $("grp-name-input").style.display = mode === 'create' ? "block" : "none";
  $("grp-name-input").value = "";
  const box = $("grp-friends-pick"); box.innerHTML = "";
  const arr = Object.entries(S.friendsMap);
  if (!arr.length) box.innerHTML = '<div class="empty">Adicione amigos primeiro.</div>';
  arr.forEach(([fid, f]) => {
    if (mode === 'add' && S.currentGroupData?.members?.[fid]) return;
    const lbl = document.createElement("label");
    lbl.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px;border-radius:8px;background:var(--gold-soft);cursor:pointer;font-size:.85rem;";
    lbl.innerHTML = `<input type="checkbox" value="${fid}" ${preselectUid === fid ? 'checked' : ''} /> <span>${esc(f.nick || 'Amigo')}</span>`;
    box.appendChild(lbl);
  });
  openModal("group-modal");
}

export function initSocial(){
  S.onSendFriendRequest = sendFriendRequest;
  S.onOpenDm = openDm;
  S.onSendDmAudio = (audioUrl) => sendDm({ type: 'audio', audioUrl });
  S.onSendDmPayload = (payload) => sendDm(payload);
  S.onOpenSupportModal = () => { $("sup-subject").value = ""; $("sup-message").value = ""; openModal("support-modal"); };

  $("btn-add-friend").addEventListener("click", () => sendFriendRequest($("friend-id-input").value));
  $("friend-id-input").addEventListener("keypress", (e) => { if (e.key === 'Enter') sendFriendRequest($("friend-id-input").value); });

  $("hezz-bot-dm-item").onclick = openHezzBotDm;
  $("dm-open-support-btn").onclick = S.onOpenSupportModal;

  $("sup-submit-btn").onclick = async () => {
    if (!S.currentUser) return;
    const subject = $("sup-subject").value.trim() || "Suporte";
    const message = $("sup-message").value.trim();
    if (!message) { showToast("Escreva sua mensagem"); return; }
    try {
      await push(ref(db, "support_tickets"), {
        uid: S.currentUser.uid, nick: S.userProfile.nick || "Anônimo", avatarUrl: S.userProfile.avatarUrl || "",
        subject, message, status: "pending", createdAt: Date.now()
      });
      closeModals();
      showToast("Ticket enviado! A resposta chegará aqui pelo Hezz Bot.");
    } catch (err) { showToast("Erro ao enviar: " + err.message); }
  };

  bindTyping("dm-input", () => {
    if (S.currentDmType === 'group' && S.currentGroupId) return `groups/${S.currentGroupId}/typing`;
    if (S.currentDmUid && S.currentDmType === 'dm') return `dms/${dmPairId(S.currentUser.uid, S.currentDmUid)}/typing`;
    return null;
  });
  setupInputPopups($("dm-input"), $("dm-mention-popup"), null, false);

  // ✅ CORRIGIDO: só limpa o input se o envio der certo
  $("dm-send").addEventListener("click", async () => {
    const text = $("dm-input").value.trim();
    if (!text) return;
    $("dm-mention-popup").classList.remove("show");
    const ok = await sendDm({ type: 'text', text });
    if (ok) $("dm-input").value = "";
  });
  $("dm-input").addEventListener("keypress", (e) => { if (e.key === 'Enter') $("dm-send").click(); });

  $("dm-image-upload").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const maxBytes = maxUploadMB() * 1024 * 1024;
    if (f.size > maxBytes) { showToast(`Imagem muito grande (máx ${maxUploadMB()}MB)`); e.target.value = ""; return; }
    try { const base64 = await fileToBase64(f, maxBytes); await sendDm({ type: 'image', imageUrl: base64 }); }
    catch (err) { showToast(err.message); }
    e.target.value = "";
  });

  $("dm-profile-btn").onclick = () => {
    if (S.currentDmType === 'bot') openUserProfileModal('hezz_bot');
    else if (S.currentDmType === 'dm' && S.currentDmUid) openUserProfileModal(S.currentDmUid);
    else showToast("Perfil disponível para conversas 1:1");
  };
  $("dm-header-clickable").onclick = () => $("dm-profile-btn").click();
  $("dm-header-info").onclick = () => $("dm-profile-btn").click();

  $("dm-call-btn").addEventListener("click", async () => {
    if (!S.currentUser || S.room) return;
    const id = push(ref(db, "rooms")).key;
    if (S.currentDmType === 'dm' && S.currentDmUid) {
      const f = S.friendsMap[S.currentDmUid];
      logCall(S.currentDmUid, f ? (f.nick || 'Amigo') : 'Amigo');
      await sendInviteTo(S.currentDmUid, id);
    } else if (S.currentDmType === 'group' && S.currentGroupId && S.currentGroupData) {
      await push(ref(db, `groups/${S.currentGroupId}/messages`), {
        type: 'invite', roomId: id, text: 'Convite para call do grupo',
        senderUid: S.currentUser.uid, senderNick: S.userProfile.nick || 'Anônimo', senderAvatar: S.userProfile.avatarUrl || '', timestamp: Date.now()
      });
    }
    joinRoom(id);
  });

  $("btn-new-group-dm").onclick = () => openGroupModal('create');
  $("dm-make-group-btn").onclick = () => openGroupModal('create', S.currentDmUid);
  $("dm-group-add-btn").onclick = () => openGroupModal('add');

  $("grp-save-btn").onclick = async () => {
    const picked = Array.from($("grp-friends-pick").querySelectorAll("input:checked")).map(c => c.value);
    if (!picked.length) { showToast("Selecione pelo menos 1 amigo"); return; }
    if (groupModalMode === 'create') {
      const name = $("grp-name-input").value.trim() || "Grupo Privado";
      const gRef = push(ref(db, "groups"));
      const gid = gRef.key;
      const members = { [S.currentUser.uid]: true };
      picked.forEach(uid => { members[uid] = true; });
      await set(gRef, { id: gid, name, ownerUid: S.currentUser.uid, members, avatarUrl: "foto.png", createdAt: Date.now() });
      const updates = {};
      Object.keys(members).forEach(uid => { updates[`users/${uid}/groups/${gid}`] = { id: gid, name, avatarUrl: "foto.png", joinedAt: Date.now() }; });
      await update(ref(db), updates);
      closeModals(); openGroupDm(gid); showToast("Grupo criado!");
    } else if (S.currentGroupId && S.currentGroupData) {
      const updates = {};
      picked.forEach(uid => {
        updates[`groups/${S.currentGroupId}/members/${uid}`] = true;
        updates[`users/${uid}/groups/${S.currentGroupId}`] = { id: S.currentGroupId, name: S.currentGroupData.name, avatarUrl: S.currentGroupData.avatarUrl || "foto.png", joinedAt: Date.now() };
      });
      await update(ref(db), updates);
      S.currentGroupData.members = { ...(S.currentGroupData.members || {}), ...Object.fromEntries(picked.map(u => [u, true])) };
      $("dm-header-sub").textContent = `${Object.keys(S.currentGroupData.members).length} membros`;
      closeModals(); showToast("Pessoas adicionadas!");
    }
  };
}
