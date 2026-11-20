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

export const SIDEBAR_W = 280;
export const MAX_FILE_SIZE = 5 * 1024 * 1024;
export const TTL_OFFLINE_MS = 30 * 60 * 1000;
export const HEARTBEAT_MS = 60 * 1000;
export const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' fill='%23d6e4f0'/%3E%3Ccircle cx='20' cy='16' r='7' fill='%23e8b923'/%3E%3Cpath d='M6 40c2-8 8-12 14-12s12 4 14 12z' fill='%23e8b923'/%3E%3C/svg%3E";
export const DECO_PRESETS = [
  { id: 'none', label: 'Nenhuma', url: '', pulse: false },
  { id: 'natal', label: 'Natal', url: 'natal.png', pulse: true }
];
export const RTC = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export let app = null;
export let auth = null;
export let db = null;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);
} catch (e) {
  console.error("[HEZZ] Falha ao inicializar Firebase:", e);
}

export const S = {
  currentUser: null,
  userProfile: {},
  isSidebarOpen: false,
  friendsMap: {},
  groupsMap: {},
  allCommunitiesMap: {},
  myCommunitiesMap: {},
  currentServerId: null,
  currentServerData: null,
  currentChannelId: 'geral',
  currentDmType: 'dm',
  currentDmUid: null,
  currentGroupId: null,
  currentGroupData: null,
  lastSentMsgAt: 0,
  room: null,
  onOpenSettings: null,
  onRenderAccount: null,
  onRenderPlanState: null,
  onRenderDiscover: null,
  onSendServerAudio: null,
  onSendDmAudio: null,
  onShowInviteModal: null,
  onSendFriendRequest: null,
  onOpenSupportModal: null,
  onOpenDm: null
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

export function ageBadgeLabel(a){
  if (a === '18+') return '18+';
  if (a === '16+') return '16+';
  return 'Livre';
}

export function applyAgeBadge(el, a){
  if (!el) return;
  el.textContent = ageBadgeLabel(a);
  el.className = 'age-badge' + (a === '18+' ? ' r18' : a === '16+' ? ' r16' : '');
}

export function labelState(s){
  if (s === "online") return "Online";
  if (s === "disabled") return "Desativado";
  return "Offline";
}

export function fileToBase64(file, maxBytes = MAX_FILE_SIZE){
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) {
      reject(new Error(`Arquivo muito grande (máx ${(maxBytes / 1024 / 1024).toFixed(0)}MB)`));
      return;
    }
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}