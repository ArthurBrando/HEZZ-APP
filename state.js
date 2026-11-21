import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

export const firebaseConfig = {
  apiKey: "AIzaSyBk0TzSvq4T4f27RbCUtHblQxvmkAI0dHE",
  authDomain: "hezz-gg.firebaseapp.com",
  databaseURL: "https://hezz-gg-default-rtdb.firebaseio.com",
  projectId: "hezz-gg",
  storageBucket: "hezz-gg.firebasestorage.app",
  messagingSenderId: "944032998353",
  appId: "1:944032998353:web:e5b079c669c2f6f3a736f0"
};

export const KLIPY_KEY = "79whYGf04yCSr7G5vVkyftxnxkFnZAFhH5bwUakdBSkskjc3QBSbRwyYEn5Xtl7v";
export const SIDEBAR_W = 280;
export const MAX_FILE_SIZE = 5 * 1024 * 1024;
export const TTL_OFFLINE_MS = 30 * 60 * 1000;
export const HEARTBEAT_MS = 60 * 1000;
export const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' fill='%23d6e4f0'/%3E%3Ccircle cx='20' cy='16' r='7' fill='%23e8b923'/%3E%3Cpath d='M6 40c2-8 8-12 14-12s12 4 14 12z' fill='%23e8b923'/%3E%3C/svg%3E";
export const RTC = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export const SVG_VERIFIED = '<span class="verified-badge" title="Assinante PULSE Verificado"><svg viewBox="0 0 24 24"><path fill="#0095F6" d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484z"/><path fill="#fff" d="M10.5 16.2l-3.7-3.7 1.4-1.4 2.3 2.3 5.3-5.3 1.4 1.4z"/></svg></span>';

export const NICK_FONTS = [
  "Inter", "Playfair Display", "Orbitron", "Pacifico", "Bebas Neue",
  "Space Mono", "Press Start 2P", "Lobster", "Cinzel", "Caveat",
  "Abril Fatface", "Righteous", "Dancing Script", "Bangers", "Fredoka"
];

const mkFrame = (stroke, extra = "") => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="none" stroke="${stroke}" stroke-width="5"/>${extra}</svg>`)}`;

// ✅ +9 MOLDURAS NOVAS (6 free + 3 PULSE extras)
export const DECO_PRESETS = [
  { id: 'none', label: 'Nenhuma', url: '', pulse: false },
  // --- FREE ---
  { id: 'gold', label: 'Ouro', url: mkFrame('#e8b923', '<circle cx="50" cy="4" r="4" fill="#e8b923"/>'), pulse: false },
  { id: 'pastel', label: 'Pastel', url: mkFrame('#f0a8cc', '<circle cx="15" cy="20" r="4" fill="#a8d1f0"/><circle cx="85" cy="80" r="4" fill="#a8d1f0"/>'), pulse: false },
  { id: 'silver', label: 'Prata', url: mkFrame('#b0b8c4', '<circle cx="50" cy="50" r="44" fill="none" stroke="#e8e8e8" stroke-width="2"/>'), pulse: false },
  { id: 'rose', label: 'Rosa', url: mkFrame('#ec4899', '<circle cx="50" cy="4" r="5" fill="#ec4899"/><circle cx="50" cy="96" r="5" fill="#ec4899"/>'), pulse: false },
  { id: 'sky', label: 'Céu', url: mkFrame('#38bdf8', '<circle cx="20" cy="20" r="3" fill="#fff"/><circle cx="80" cy="30" r="3" fill="#fff"/><circle cx="30" cy="80" r="3" fill="#fff"/><circle cx="75" cy="75" r="3" fill="#fff"/>'), pulse: false },
  { id: 'emerald', label: 'Esmeralda', url: mkFrame('#10b981', '<circle cx="50" cy="50" r="42" fill="none" stroke="#34d399" stroke-width="3" stroke-dasharray="4 4"/>'), pulse: false },
  { id: 'flower', label: 'Flor', url: mkFrame('#f472b6', '<circle cx="50" cy="8" r="6" fill="#fbbf24"/><circle cx="92" cy="50" r="6" fill="#fbbf24"/><circle cx="50" cy="92" r="6" fill="#fbbf24"/><circle cx="8" cy="50" r="6" fill="#fbbf24"/>'), pulse: false },
  { id: 'thunder', label: 'Trovão', url: mkFrame('#fbbf24', '<path d="M50 8 L60 40 L45 40 L55 70 L35 40 L48 40 Z" fill="#fbbf24"/>'), pulse: false },
  // --- PULSE ---
  { id: 'natal', label: 'Natal', url: 'natal.png', pulse: true },
  { id: 'cyber', label: 'Neon Cyber', url: mkFrame('#00f0ff', '<circle cx="50" cy="50" r="41" fill="none" stroke="#ff00c8" stroke-width="2" stroke-dasharray="10 6"/>'), pulse: true },
  { id: 'aura', label: 'Aura Fogo', url: mkFrame('#ff5722', '<circle cx="50" cy="50" r="42" fill="none" stroke="#ffc107" stroke-width="3" stroke-dasharray="14 8"/>'), pulse: true },
  { id: 'royal', label: 'Coroa Real', url: mkFrame('#9c27b0', '<path d="M36 12 L43 3 L50 10 L57 3 L64 12 Z" fill="#e8b923"/>'), pulse: true },
  { id: 'galaxy', label: 'Galáxia', url: mkFrame('#7c3aed', '<circle cx="20" cy="30" r="2" fill="#fff"/><circle cx="80" cy="20" r="2" fill="#fff"/><circle cx="30" cy="70" r="2" fill="#fff"/><circle cx="70" cy="85" r="2" fill="#fff"/><circle cx="90" cy="60" r="2" fill="#fff"/><circle cx="10" cy="55" r="2" fill="#fff"/>'), pulse: true },
  { id: 'rainbow', label: 'Arco-Íris', url: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff0000"/><stop offset="16%" stop-color="#ff8800"/><stop offset="32%" stop-color="#ffee00"/><stop offset="48%" stop-color="#00cc00"/><stop offset="64%" stop-color="#0099ff"/><stop offset="80%" stop-color="#4400ff"/><stop offset="100%" stop-color="#cc00ff"/></linearGradient></defs><circle cx="50" cy="50" r="46" fill="none" stroke="url(#g)" stroke-width="5"/></svg>`)}`, pulse: true },
  { id: 'diamond', label: 'Diamante', url: mkFrame('#e0f7ff', '<path d="M50 2 L58 10 L50 18 L42 10 Z" fill="#7dd3fc"/><path d="M50 82 L58 90 L50 98 L42 90 Z" fill="#7dd3fc"/><path d="M2 50 L10 58 L18 50 L10 42 Z" fill="#7dd3fc"/><path d="M82 50 L90 58 L98 50 L90 42 Z" fill="#7dd3fc"/>'), pulse: true }
];

export const ACH_ICONS = {
  trophy: '<svg class="ui-icon" viewBox="0 0 24 24"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
  star: '<svg class="ui-icon" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  zap: '<svg class="ui-icon" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  shield: '<svg class="ui-icon" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  heart: '<svg class="ui-icon" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  award: '<svg class="ui-icon" viewBox="0 0 24 24"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>'
};

export let app = null, auth = null, db = null;
try { app = initializeApp(firebaseConfig); auth = getAuth(app); db = getDatabase(app); }
catch (e) { console.error("[HEZZ] Firebase init error:", e); }

export const S = {
  currentUser: null, userProfile: {}, isSidebarOpen: false,
  friendsMap: {}, groupsMap: {}, allCommunitiesMap: {}, myCommunitiesMap: {},
  currentServerId: null, currentServerData: null, currentChannelId: 'geral',
  currentDmType: 'dm', currentDmUid: null, currentGroupId: null, currentGroupData: null,
  lastSentMsgAt: 0, room: null,
  replyTo: null,             // ✅ Mensagem sendo respondida
  serverEmojis: {},          // ✅ Emojis customizados do servidor (opcional)
  onOpenSettings: null, onRenderAccount: null, onRenderPlanState: null, onRenderDiscover: null,
  onSendServerAudio: null, onSendServerGif: null, onSendDmAudio: null, onSendDmGif: null,
  onShowInviteModal: null, onSendFriendRequest: null, onOpenSupportModal: null, onOpenDm: null,
  onCheckAchievements: null
};

export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, t => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[t]));
export const todayKey = () => new Date().toISOString().slice(0, 10);
export const dmPairId = (a, b) => [a, b].sort().join('_');
export const isPulse = () => (S.userProfile.plan || 'free') === 'pulse';
export const maxUploadMB = () => isPulse() ? 10 : 5;
export const maxAudioSec = () => isPulse() ? 300 : 60;
export const maxCommunities = () => isPulse() ? 20 : 10;
export const userStrikes = () => Number(S.userProfile.strikes || 0);

export function canAccessAge(serverAge){
  const a = serverAge || 'all';
  if (a === 'all') return true;
  const uAge = S.userProfile.ageRating || 'under16';
  if (a === '16+') return uAge === '16+' || uAge === '18+';
  if (a === '18+') return uAge === '18+';
  return true;
}
export const ageBadgeLabel = (a) => a === '18+' ? '18+' : a === '16+' ? '16+' : 'Livre';
export function applyAgeBadge(el, a){
  if (!el) return;
  el.textContent = ageBadgeLabel(a);
  el.className = 'age-badge' + (a === '18+' ? ' r18' : a === '16+' ? ' r16' : '');
}
export const labelState = (s) => s === "online" ? "Online" : s === "disabled" ? "Desativado" : "Offline";
export function fileToBase64(file, maxBytes = MAX_FILE_SIZE){
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) return reject(new Error(`Arquivo muito grande (máx ${(maxBytes / 1024 / 1024).toFixed(0)}MB)`));
    const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file);
  });
}