import { ref, set, get, push, remove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { db, S, esc, DEFAULT_AVATAR, ageBadgeLabel, isPulse } from "./state.js";
import { showToast, fmt, createAudioPlayerHTML, bindAudioPlayer } from "./ui.js";
import { joinRoom } from "./calls.js";
import { openUserProfileModal } from "./profile.js";

const SVG_PHONE = '<svg class="ui-icon sm" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z"/></svg>';
const SVG_MAIL = '<svg class="ui-icon sm" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>';
const SVG_CHART = '<svg class="ui-icon sm" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>';
const SVG_TAG = '<svg class="ui-icon sm" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>';
const SVG_PIN = '<svg class="ui-icon sm" viewBox="0 0 24 24"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>';
const SVG_TRASH = '<svg class="ui-icon sm" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
const SVG_REPLY = '<svg class="ui-icon sm" viewBox="0 0 24 24"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>';
const SVG_VERIFIED = '<svg class="verified-badge" viewBox="0 0 24 24"><path fill="#0095f6" d="M12 2l2.4 2.1 3.2-.4 1.3 2.9 3.1 1-.4 3.2 2.1 2.4-2.1 2.4.4 3.2-3.1 1-1.3 2.9-3.2-.4L12 22l-2.4-2.1-3.2.4-1.3-2.9-3.1-1 .4-3.2-2.1-2.4 2.1-2.4-.4-3.2 3.1-1 1.3-2.9 3.2.4z"/><polyline points="8.5 12 11 14.5 15.5 9.5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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
  const reqSec = Math.max(0, slowmodeSec);
  if (!reqSec) return true;
  const elapsed = (Date.now() - S.lastSentMsgAt) / 1000;
  if (elapsed < reqSec) {
    showToast(`Slowmode ativo: aguarde ${Math.ceil(reqSec - elapsed)}s`);
    return false;
  }
  return true;
}

/* ============================================================
   MENU SEGURAR MENSAGEM (long-press / right-click)
   ============================================================ */
let msgMenuEl = null;

function getMsgMenu(){
  if (msgMenuEl) return msgMenuEl;
  msgMenuEl = document.createElement("div");
  msgMenuEl.id = "msg-ctx-menu";
  msgMenuEl.style.cssText = "position:fixed;z-index:99999;background:#fff;border:1px solid #e8b923;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.22);padding:6px;min-width:180px;display:none;font-size:.85rem;color:#222;";
  document.body.appendChild(msgMenuEl);
  document.addEventListener("click", (e) => {
    if (msgMenuEl && !msgMenuEl.contains(e.target)) msgMenuEl.style.display = "none";
  }, true);
  return msgMenuEl;
}

function openMsgMenu(clientX, clientY, m, ctx){
  const menu = getMsgMenu();
  menu.innerHTML = "";
  const isOwn = m.senderUid === (S.currentUser?.uid || "");
  const perms = ctx.isServer ? myMemberPerms() : {};
  const isAdm = !!(perms.admin || perms.manageMessages);
  const canDel = isOwn || isAdm;

  const mkBtn = (html, cb) => {
    const b = document.createElement("button");
    b.type = "button";
    b.style.cssText = "display:flex;align-items:center;gap:8px;width:100%;padding:9px 12px;border:none;background:transparent;cursor:pointer;text-align:left;border-radius:8px;color:#222;font-size:.85rem;";
    b.innerHTML = html;
    b.onmouseenter = () => (b.style.background = "rgba(232,185,35,.15)");
    b.onmouseleave = () => (b.style.background = "transparent");
    b.onclick = cb;
    menu.appendChild(b);
  };

  // Responder — sempre disponível
  mkBtn(`${SVG_REPLY} <span>Responder</span>`, () => {
    S.replyTo = m;
    menu.style.display = "none";
    showReplyBar(m, ctx);
  });

  // Excluir — se for dono OU admin do servidor
  if (canDel && ctx.path && m.id) {
    mkBtn(`<span style="color:#d9534f;display:flex;align-items:center;gap:8px;">${SVG_TRASH} Excluir</span>`, async () => {
      menu.style.display = "none";
      if (!confirm("Apagar esta mensagem?")) return;
      try {
        await remove(ref(db, `${ctx.path}/${m.id}`));
        showToast("Mensagem apagada");
      } catch (err) {
        showToast("Erro: " + err.message);
      }
    });
  }

  menu.style.display = "block";
  const r = menu.getBoundingClientRect();
  const x = Math.max(8, Math.min(clientX, window.innerWidth - r.width - 8));
  const y = Math.max(8, Math.min(clientY, window.innerHeight - r.height - 8));
  menu.style.left = x + "px";
  menu.style.top = y + "px";
}

function attachMsgLongPress(msgEl, m, ctx){
  let timer = null;
  let startX = 0, startY = 0;

  const shouldSkip = (t) => t.closest("button, a, input, video, iframe, .poll-opt, .msg-act-btn, .emoji-btn");

  const start = (e) => {
    if (shouldSkip(e.target)) return;
    startX = e.clientX;
    startY = e.clientY;
    timer = setTimeout(() => {
      timer = null;
      openMsgMenu(e.clientX, e.clientY, m, ctx);
      if (navigator.vibrate) navigator.vibrate(30);
    }, 500);
  };
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const move = (e) => {
    if (timer && (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10)) cancel();
  };

  msgEl.addEventListener("pointerdown", start);
  msgEl.addEventListener("pointerup", cancel);
  msgEl.addEventListener("pointercancel", cancel);
  msgEl.addEventListener("pointerleave", cancel);
  msgEl.addEventListener("pointermove", move);

  msgEl.addEventListener("contextmenu", (e) => {
    if (shouldSkip(e.target)) return;
    e.preventDefault();
    openMsgMenu(e.clientX, e.clientY, m, ctx);
  });
}

function showReplyBar(m, ctx){
  const inputId = ctx.isServer ? "server-chat-input" : "dm-input";
  const input = document.getElementById(inputId);
  if (!input) return;

  let bar = document.getElementById("reply-bar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "reply-bar";
    bar.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 10px;margin:6px 8px;background:rgba(232,185,35,.15);border-left:3px solid #e8b923;border-radius:10px;font-size:.78rem;";
    const composer = input.closest(".composer, .chat-composer, .input-row, .msg-input-row") || input.parentNode;
    composer.parentNode.insertBefore(bar, composer);
  }
  bar.style.display = "flex";

  const preview = m.text
    || (m.type === "image" ? "[imagem]" : m.type === "audio" ? "[áudio]" : m.type === "gif" ? "[GIF]" : m.type === "invite" ? "[convite]" : "[mídia]");

  bar.innerHTML = `
    <div style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#333;">
      <b style="color:#b8860b;">↪ ${esc(m.senderNick || "Anônimo")}</b> · ${esc(String(preview).slice(0, 80))}
    </div>
    <button type="button" style="background:transparent;border:none;cursor:pointer;font-size:1.1rem;color:#666;padding:0 4px;" aria-label="Cancelar">✕</button>
  `;
  bar.querySelector("button").onclick = () => {
    S.replyTo = null;
    bar.style.display = "none";
  };
}

/* Helper: enriquece um payload com o campo replyTo antes do envio.
   Usado por social.js (DM) e servers.js (servidor). */
export function attachReplyToPayload(payload){
  if (S.replyTo) {
    payload.replyTo = {
      nick: S.replyTo.senderNick || "Anônimo",
      text: S.replyTo.text || "",
      type: S.replyTo.type || "text"
    };
    S.replyTo = null;
    const rb = document.getElementById("reply-bar");
    if (rb) rb.style.display = "none";
  }
  return payload;
}

/* ============================================================
   TICKETS
   ============================================================ */
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
    text: `Ticket aberto por @${S.userProfile.nick || 'Usuário'}${roleMention}.\nDescreva seu atendimento abaixo.`,
    senderUid: 'hezz_ticket_bot', senderNick: tb.name || 'Hezz Ticket', senderAvatar: tb.avatarUrl || 'foto.png', timestamp: Date.now()
  });
  onSwitchChannel?.(chId);
  showToast("Ticket criado!");
}

/* ============================================================
   RENDER DE MENSAGEM
   ============================================================ */
export function renderMessage(m, container, ctx = {}){
  const isOwn = m.senderUid === (S.currentUser ? S.currentUser.uid : '');
  const msgEl = document.createElement("div");
  msgEl.className = `message ${isOwn ? 'own' : ''}`;

  let roleBadge = '';
  if (ctx.isServer && S.currentServerData?.members?.[m.senderUid]?.roleId) {
    const r = S.currentServerData.roles?.[S.currentServerData.members[m.senderUid].roleId];
    if (r) roleBadge = `<span class="role-pill" style="background:${r.color || '#e8b923'}">${esc(r.name)}</span>`;
  }

  const verifiedIcon = (m.plan === 'pulse' || (m.senderUid === S.currentUser?.uid && isPulse())) ? SVG_VERIFIED : '';

  let contentHtml = '';
  if (m.type === 'text') contentHtml = `<div class="message-text">${fmt(m.text || '')}</div>`;
  else if (m.type === 'gif') {
    contentHtml = `<div class="gif-msg-wrap"><img src="${esc(m.gifUrl)}" class="message-image" /><span class="gif-msg-tag">GIF KLIPY</span></div>`;
  }
  else if (m.type === 'image') contentHtml = `<img src="${m.imageUrl}" class="message-image" onclick="window.open(this.src,'_blank')" />`;
  else if (m.type === 'audio') contentHtml = createAudioPlayerHTML(m.audioUrl);
  else if (m.type === 'invite') contentHtml = `<div class="message-text">${SVG_PHONE} Convite para call <button class="btn btn-primary" data-room="${esc(m.roomId)}" style="padding:6px 12px;margin-left:6px">Entrar</button></div>`;
  else if (m.type === 'server_invite') {
    contentHtml = `<div class="ticket-panel">
      <b>${SVG_MAIL} Convite de Servidor</b>
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
    contentHtml = `<div class="poll-card"><b>${SVG_CHART} ${esc(m.question)}</b>${optsHtml}<span style="font-size:.7rem;color:var(--text-soft);">${total} voto(s)</span></div>`;
  }
  else if (m.type === 'ticket_panel') {
    contentHtml = `<div class="ticket-panel">
      <b>${SVG_TAG} ${esc(m.title || 'Atendimento')}</b>
      <span style="font-size:.82rem;">${fmt(m.text || '')}</span>
      <button class="mini-btn gold" data-open-ticket="${esc(m.ticketId)}">Abrir Ticket</button>
    </div>`;
  }

  // Citação da mensagem respondida
  if (m.replyTo) {
    const preview = m.replyTo.text
      || (m.replyTo.type === "image" ? "[imagem]"
        : m.replyTo.type === "audio" ? "[áudio]"
        : m.replyTo.type === "gif" ? "[GIF]" : "[mídia]");
    contentHtml = `<div class="msg-reply-quote" style="border-left:3px solid #e8b923;padding:4px 10px;margin:0 0 4px;background:rgba(232,185,35,.08);border-radius:6px;font-size:.75rem;color:#666;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;">
      <b style="color:#b8860b;">↪ ${esc(m.replyTo.nick || 'Anônimo')}</b> · ${esc(String(preview).slice(0, 80))}
    </div>${contentHtml}`;
  }

  const time = new Date(m.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const avatar = m.senderAvatar || DEFAULT_AVATAR;

  msgEl.innerHTML = `
    <img src="${avatar}" class="message-avatar" data-user="${esc(m.senderUid || '')}" />
    <div class="message-content">
      <div class="message-header">
        <span class="message-sender" data-user="${esc(m.senderUid || '')}">${esc(m.senderNick || 'Anônimo')} ${verifiedIcon} ${roleBadge}</span>
        <span class="message-time">${time}</span>
      </div>
      ${contentHtml}
    </div>
  `;

  // Menu segurar (Responder / Excluir / ADM Excluir)
  attachMsgLongPress(msgEl, m, ctx);

  // Ações de hover (mantidas como atalho — desktop)
  if (ctx.isServer && ctx.path && m.id) {
    const perms = myMemberPerms();
    if (isOwn || perms.manageMessages || perms.admin) {
      const acts = document.createElement("div"); acts.className = "msg-actions";
      if (perms.manageMessages || perms.admin) {
        const pinB = document.createElement("button"); pinB.className = "msg-act-btn"; pinB.innerHTML = SVG_PIN; pinB.title = "Fixar";
        pinB.onclick = () => {
          set(ref(db, `communities/${S.currentServerId}/pinned/${S.currentChannelId}/${m.id}`), m);
          showToast("Mensagem fixada!");
        };
        acts.appendChild(pinB);
      }
      const delB = document.createElement("button"); delB.className = "msg-act-btn"; delB.innerHTML = SVG_TRASH; delB.title = "Apagar";
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

/* ============================================================
   AUTOCOMPLETE / SLASH
   ============================================================ */
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