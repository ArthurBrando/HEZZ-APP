import { ref, set, get, push, remove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { db, S, esc, DEFAULT_AVATAR, userStrikes, ageBadgeLabel } from "./state.js";
import { showToast, fmt, createAudioPlayerHTML, bindAudioPlayer } from "./ui.js";
import { joinRoom } from "./calls.js";
import { openUserProfileModal } from "./profile.js";

export function myMemberPerms(){
  if (!S.currentServerData || !S.currentUser) return {};
  if (S.currentServerData.ownerUid === S.currentUser.uid) {
    return { admin: true, manageChannels: true, manageMessages: true, timeoutMembers: true, manageRoles: true, sendMessages: true };
  }
  const m = S.currentServerData.members?.[S.currentUser.uid];
  if (m && m.roleId && S.currentServerData.roles?.[m.roleId]) {
    return S.currentServerData.roles[m.roleId].perms || { sendMessages: true };
  }
  return { sendMessages: true };
}

export function checkSendCooldown(slowmodeSec = 0){
  const strikeDelay = userStrikes() >= 2 ? 15 : 0;
  const reqSec = Math.max(slowmodeSec, strikeDelay);
  if (!reqSec) return true;
  const elapsed = (Date.now() - S.lastSentMsgAt) / 1000;
  if (elapsed < reqSec) {
    showToast(`Aguarde ${Math.ceil(reqSec - elapsed)}s para enviar outra mensagem`);
    return false;
  }
  return true;
}

export async function createTicketChannel(ticketId, onSwitchChannel){
  if (!S.currentServerId || !S.currentServerData) return;
  const cfg = S.currentServerData.ticketConfigs?.[ticketId] || {};
  const chId = `tk_${S.currentUser.uid.slice(0,5)}_${Date.now().toString().slice(-4)}`;
  const cats = S.currentServerData.categories || {};
  const catId = Object.keys(cats)[0] || 'cat_text';
  const chName = `ticket-${(S.userProfile.nick || 'user').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,10)}`;

  await set(ref(db, `communities/${S.currentServerId}/channels/${chId}`), {
    name: chName, type: 'ticket', categoryId: catId, rules: cfg.title || 'Ticket de atendimento', syncCat: false, ticketOwnerUid: S.currentUser.uid
  });
  const tb = S.currentServerData.ticketBot || { name: 'Hezz Ticket', avatarUrl: 'foto.png' };
  const roleMention = cfg.roleId && S.currentServerData.roles?.[cfg.roleId] ? ` (@${S.currentServerData.roles[cfg.roleId].name})` : '';
  await push(ref(db, `communities/${S.currentServerId}/messages/${chId}`), {
    type: 'text',
    text: `🎫 Ticket aberto por @${S.userProfile.nick || 'Usuário'}${roleMention}.\nDescreva seu atendimento abaixo.`,
    senderUid: 'hezz_ticket_bot', senderNick: tb.name || 'Hezz Ticket', senderAvatar: tb.avatarUrl || 'foto.png', timestamp: Date.now()
  });
  onSwitchChannel?.(chId);
  showToast("Ticket criado!");
}

export function renderMessage(m, container, ctx = {}){
  const isOwn = m.senderUid === (S.currentUser ? S.currentUser.uid : '');
  const msgEl = document.createElement("div");
  msgEl.className = `message ${isOwn ? 'own' : ''}`;

  let roleBadge = '';
  if (ctx.isServer && S.currentServerData?.members?.[m.senderUid]?.roleId) {
    const r = S.currentServerData.roles?.[S.currentServerData.members[m.senderUid].roleId];
    if (r) roleBadge = `<span class="role-pill" style="background:${r.color || '#e8b923'}">${esc(r.name)}</span>`;
  }

  let contentHtml = '';
  if (m.type === 'text') contentHtml = `<div class="message-text">${fmt(m.text || '')}</div>`;
  else if (m.type === 'image') contentHtml = `<img src="${m.imageUrl}" class="message-image" onclick="window.open(this.src,'_blank')" />`;
  else if (m.type === 'audio') contentHtml = createAudioPlayerHTML(m.audioUrl);
  else if (m.type === 'invite') contentHtml = `<div class="message-text">📞 Convite para call <button class="btn btn-primary" data-room="${esc(m.roomId)}" style="padding:6px 12px;margin-left:6px">Entrar</button></div>`;
  else if (m.type === 'server_invite') {
    contentHtml = `<div class="ticket-panel">
      <b>📨 Convite de Servidor</b>
      <span style="font-size:.82rem;">${esc(m.serverName || 'Servidor')} (${ageBadgeLabel(m.serverAge)})</span>
      <button class="mini-btn gold" data-srv-inv="${esc(m.serverId)}">Ver Convite</button>
    </div>`;
  }
  else if (m.type === 'poll') {
    const votes = m.votes || {};
    const total = Object.keys(votes).length;
    const myVote = S.currentUser ? votes[S.currentUser.uid] : undefined;
    const optsHtml = (m.options || []).map((opt, idx) => {
      const cnt = Object.values(votes).filter(v => v === idx).length;
      const pct = total ? Math.round((cnt / total) * 100) : 0;
      return `<div class="poll-opt ${myVote === idx ? 'voted' : ''}" data-poll-opt="${idx}">
        <span>${esc(opt)}</span><span>${cnt} (${pct}%)</span>
      </div>`;
    }).join('');
    contentHtml = `<div class="poll-card"><b>📊 ${esc(m.question)}</b>${optsHtml}<span style="font-size:.7rem;color:var(--text-soft);">${total} voto(s)</span></div>`;
  }
  else if (m.type === 'ticket_panel') {
    contentHtml = `<div class="ticket-panel">
      <b>🎫 ${esc(m.title || 'Atendimento')}</b>
      <span style="font-size:.82rem;">${fmt(m.text || '')}</span>
      <button class="mini-btn gold" data-open-ticket="${esc(m.ticketId)}">Abrir Ticket</button>
    </div>`;
  }

  const time = new Date(m.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const avatar = m.senderAvatar || DEFAULT_AVATAR;

  msgEl.innerHTML = `
    <img src="${avatar}" class="message-avatar" data-user="${esc(m.senderUid || '')}" />
    <div class="message-content">
      <div class="message-header">
        <span class="message-sender" data-user="${esc(m.senderUid || '')}">${esc(m.senderNick || 'Anônimo')} ${roleBadge}</span>
        <span class="message-time">${time}</span>
      </div>
      ${contentHtml}
    </div>
  `;

  if (ctx.isServer && ctx.path && m.id) {
    const perms = myMemberPerms();
    if (isOwn || perms.manageMessages || perms.admin) {
      const acts = document.createElement("div"); acts.className = "msg-actions";
      if (perms.manageMessages || perms.admin) {
        const pinB = document.createElement("button"); pinB.className = "msg-act-btn"; pinB.textContent = "📌"; pinB.title = "Fixar";
        pinB.onclick = () => {
          set(ref(db, `communities/${S.currentServerId}/pinned/${S.currentChannelId}/${m.id}`), m);
          showToast("Mensagem fixada!");
        };
        acts.appendChild(pinB);
      }
      const delB = document.createElement("button"); delB.className = "msg-act-btn"; delB.textContent = "🗑️"; delB.title = "Apagar";
      delB.onclick = () => remove(ref(db, `${ctx.path}/${m.id}`));
      acts.appendChild(delB);
      msgEl.appendChild(acts);
    }
  }

  container.appendChild(msgEl);

  msgEl.querySelectorAll('[data-user]').forEach(el => {
    if (el.dataset.user) el.onclick = () => openUserProfileModal(el.dataset.user);
  });
  const rb = msgEl.querySelector('[data-room]');
  if (rb) rb.onclick = () => joinRoom(rb.dataset.room);

  const si = msgEl.querySelector('[data-srv-inv]');
  if (si) si.onclick = async () => {
    const s = await get(ref(db, `communities/${si.dataset.srvInv}`));
    if (s.exists()) S.onShowInviteModal?.(si.dataset.srvInv, s.val());
    else showToast("Servidor não encontrado");
  };

  if (m.type === 'poll' && ctx.path && m.id) {
    msgEl.querySelectorAll('[data-poll-opt]').forEach(optEl => {
      optEl.onclick = () => set(ref(db, `${ctx.path}/${m.id}/votes/${S.currentUser.uid}`), Number(optEl.dataset.pollOpt));
    });
  }

  const tkBtn = msgEl.querySelector('[data-open-ticket]');
  if (tkBtn) tkBtn.onclick = () => createTicketChannel(tkBtn.dataset.openTicket, ctx.onSwitchChannel);

  if (m.type === 'audio') bindAudioPlayer(msgEl);
}

export function setupInputPopups(inputEl, mentionPopup, slashPopup, isServer){
  inputEl.addEventListener("input", () => {
    const val = inputEl.value;
    if (isServer && val.startsWith('/')) {
      const perms = myMemberPerms();
      const cmds = [
        { cmd: '/poll', desc: 'Criar uma enquete' },
        { cmd: '/cinema', desc: 'Abrir Modo Cinema' }
      ];
      if (perms.admin || perms.manageChannels) {
        cmds.unshift({ cmd: '/setup', desc: 'Configurar Bot de Tickets' });
        Object.keys(S.currentServerData?.ticketConfigs || {}).forEach(id => {
          cmds.push({ cmd: `/send-${id}`, desc: `Enviar painel de ticket (${id})` });
        });
      }
      const q = val.toLowerCase();
      const hits = cmds.filter(c => c.cmd.startsWith(q));
      slashPopup.innerHTML = "";
      hits.forEach(c => {
        const it = document.createElement("div"); it.className = "autocomplete-item";
        it.innerHTML = `<b>${esc(c.cmd)}</b><span style="font-size:.72rem;color:var(--text-soft);">${esc(c.desc)}</span>`;
        it.onclick = () => { inputEl.value = c.cmd + " "; slashPopup.classList.remove("show"); inputEl.focus(); };
        slashPopup.appendChild(it);
      });
      slashPopup.classList.toggle("show", hits.length > 0);
      mentionPopup.classList.remove("show");
      return;
    }
    if (slashPopup) slashPopup.classList.remove("show");

    const match = /(^|\s)@([^\s@]*)$/.exec(val);
    if (match) {
      const q = match[2].toLowerCase();
      const candidates = [];
      if (isServer && S.currentServerData) {
        Object.values(S.currentServerData.members || {}).forEach(m => candidates.push({ label: '@' + (m.nick || 'user'), sub: 'Membro' }));
        Object.values(S.currentServerData.roles || {}).forEach(r => candidates.push({ label: '@' + r.name, sub: 'Cargo' }));
      } else if (S.currentDmType === 'group' && S.currentGroupData) {
        Object.keys(S.currentGroupData.members || {}).forEach(uid => {
          const f = S.friendsMap[uid];
          if (f) candidates.push({ label: '@' + f.nick, sub: 'Grupo' });
        });
      } else if (S.currentDmUid && S.friendsMap[S.currentDmUid]) {
        candidates.push({ label: '@' + S.friendsMap[S.currentDmUid].nick, sub: 'Amigo' });
      }
      const hits = candidates.filter(c => c.label.toLowerCase().includes('@' + q)).slice(0, 8);
      mentionPopup.innerHTML = "";
      hits.forEach(c => {
        const it = document.createElement("div"); it.className = "autocomplete-item";
        it.innerHTML = `<b>${esc(c.label)}</b><span style="font-size:.7rem;color:var(--text-soft);">${esc(c.sub)}</span>`;
        it.onclick = () => {
          inputEl.value = val.replace(/@([^\s@]*)$/, c.label + ' ');
          mentionPopup.classList.remove("show");
          inputEl.focus();
        };
        mentionPopup.appendChild(it);
      });
      mentionPopup.classList.toggle("show", hits.length > 0);
    } else {
      mentionPopup.classList.remove("show");
    }
  });
}