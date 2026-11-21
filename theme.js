import { ref, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { db, S, $, esc, NICK_FONTS } from "./state.js";
import { showToast } from "./ui.js";

const THEME_LIST = [
  { id: 'light', name: 'Claro', bg: '#ffffff' },
  { id: 'dark', name: 'Escuro', bg: '#18191c' },
  { id: 'amoled', name: 'AMOLED Preto', bg: '#000000' },
  { id: 'pastel-pink', name: 'Pastel Rosa', bg: '#ffd9e8' },
  { id: 'ocean', name: 'Oceano', bg: '#0f172a' },
  { id: 'custom', name: 'Personalizado', bg: 'linear-gradient(135deg,#e8b923,#d6e4f0)' }
];

function injectFontsAndCSS(){
  if (!document.getElementById("hezz-fonts")) {
    const l = document.createElement("link");
    l.id = "hezz-fonts"; l.rel = "stylesheet";
    const fam = NICK_FONTS.map(f => "family=" + encodeURIComponent(f) + ":wght@400;700;800").join("&");
    l.href = `https://fonts.googleapis.com/css2?${fam}&display=swap`;
    document.head.appendChild(l);
  }
  if (!document.getElementById("hezz-dyn-css")) {
    const st = document.createElement("style");
    st.id = "hezz-dyn-css";
    st.textContent = `
      :root{--surface:#fff;--surface-2:#fffaeb;--border:#fdeaa8;--input-bg:#fff;--msg-bg:#fff;--msg-own-bg:#fdeaa8;}
      [data-theme="dark"]{--white:#18191c;--surface:#22242a;--surface-2:#2a2d35;--gold:#e8b923;--gold-light:#3c3522;--gold-soft:#25272e;--pastel-blue:#263240;--pastel-pink:#362634;--pastel-green:#243528;--text:#f1f3f5;--text-soft:#adb5bd;--muted:#7c848e;--border:#343741;--input-bg:#1e2025;--msg-bg:#24272e;--msg-own-bg:#3c3318;}
      [data-theme="amoled"]{--white:#000;--surface:#0a0a0c;--surface-2:#121216;--gold:#e8b923;--gold-light:#332a12;--gold-soft:#111114;--pastel-blue:#141b24;--pastel-pink:#21141e;--pastel-green:#122015;--text:#fff;--text-soft:#a0a5ad;--muted:#666b73;--border:#222228;--input-bg:#0d0d10;--msg-bg:#111115;--msg-own-bg:#29220d;}
      [data-theme="pastel-pink"]{--white:#fff7fa;--surface:#fff;--surface-2:#fff0f6;--gold:#d96b98;--gold-light:#f8d2e2;--gold-soft:#fff0f6;--pastel-blue:#e5dff6;--pastel-pink:#ffd9e8;--pastel-green:#dff3e4;--text:#38242d;--text-soft:#7a5968;--muted:#aa8b98;--border:#f5cbe0;--input-bg:#fff;--msg-bg:#fff;--msg-own-bg:#ffe0ee;}
      [data-theme="ocean"]{--white:#0f172a;--surface:#16223b;--surface-2:#1e293b;--gold:#38bdf8;--gold-light:#1e3a5f;--gold-soft:#17253d;--pastel-blue:#1e3a5f;--pastel-pink:#2e254d;--pastel-green:#143b38;--text:#f1f5f9;--text-soft:#94a3b8;--muted:#64748b;--border:#263859;--input-bg:#111c33;--msg-bg:#1a2844;--msg-own-bg:#173d5c;}
      body,.view,.sidebar,.card,.hezz-modal,.view-header,.tabs,.server-drawer,.chat-input-area,.list-item{background-color:var(--surface);color:var(--text);}
      .view,.chat-messages{background:var(--white);color:var(--text);}
      .message-content{background:var(--msg-bg);border-color:var(--border);color:var(--text);}
      .message.own .message-content{background:var(--msg-own-bg);}
      .chat-input-area{z-index:12;border-color:var(--border);}
      .verified-badge{display:inline-flex;align-items:center;width:16px;height:16px;vertical-align:middle;flex-shrink:0;}
      .verified-badge svg{width:16px;height:16px;display:block;}
      .nick-grad{-webkit-background-clip:text!important;background-clip:text!important;-webkit-text-fill-color:transparent!important;color:transparent!important;}
      .emoji-picker{width:320px;max-width:calc(100vw - 28px);height:320px;max-height:none;padding:0;flex-direction:column;overflow:hidden;z-index:35;}
      .emoji-picker.show{display:flex;}
      .picker-tabs{display:flex;gap:6px;padding:8px 10px;border-bottom:1px solid var(--border);background:var(--gold-soft);}
      .picker-tab{flex:1;padding:7px 10px;border-radius:9px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-family:inherit;font-size:.78rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;}
      .picker-tab.active{background:var(--gold);color:#fff;border-color:var(--gold);}
      .picker-body{flex:1;overflow-y:auto;padding:10px;}
      .emoji-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:4px;}
      .emoji-locked{position:relative;opacity:.75;}.emoji-locked img{filter:brightness(.55);}
      .emoji-locked::after{content:"";position:absolute;right:2px;bottom:2px;width:15px;height:15px;background:rgba(0,0,0,.8) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='11' width='18' height='11' rx='2'/%3E%3Cpath d='M7 11V7a5 5 0 0 1 10 0v4'/%3E%3C/svg%3E") center/10px no-repeat;border-radius:50%;border:1px solid rgba(255,255,255,.35);}
      .gif-box{display:none;flex-direction:column;gap:8px;height:100%;}.gif-box.active{display:flex;}
      .gif-search-row{display:flex;gap:6px;}.gif-search-row input{flex:1;padding:7px 10px;border:1px solid var(--border);border-radius:8px;background:var(--input-bg);color:var(--text);font-size:.8rem;outline:none;}
      .gif-grid{flex:1;overflow-y:auto;display:grid;grid-template-columns:repeat(2,1fr);gap:6px;align-content:start;}
      .gif-item{border-radius:8px;overflow:hidden;background:var(--gold-soft);cursor:pointer;height:94px;border:1px solid var(--border);}
      .gif-item img{width:100%;height:100%;object-fit:cover;display:block;}
      .klipy-attr{font-size:.66rem;color:var(--text-soft);text-align:right;font-weight:600;}
      .gif-msg-wrap{position:relative;display:inline-block;margin-top:4px;}
      .gif-msg-tag{position:absolute;left:6px;bottom:6px;background:rgba(0,0,0,.68);color:#fff;font-size:.6rem;font-weight:800;padding:2px 6px;border-radius:6px;}
      .theme-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;}
      .theme-btn{padding:11px;border-radius:12px;border:2px solid var(--border);background:var(--surface);color:var(--text);font-weight:700;font-size:.8rem;cursor:pointer;display:flex;align-items:center;gap:8px;}
      .theme-btn.active{border-color:var(--gold);background:var(--gold-soft);}
      .theme-swatch{width:16px;height:16px;border-radius:50%;border:1px solid rgba(0,0,0,.25);flex-shrink:0;}
      .font-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;}
      .font-opt{padding:8px 10px;border:2px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);cursor:pointer;font-size:.84rem;display:flex;align-items:center;justify-content:center;gap:5px;white-space:nowrap;overflow:hidden;}
      .font-opt.active{border-color:var(--gold);background:var(--gold-soft);}.font-opt.locked{opacity:.6;}
      .profile-badges-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;}
      .badge-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.88);color:#222;border:1px solid var(--gold-light);font-size:.73rem;font-weight:700;}
      .badge-chip img{width:18px;height:18px;border-radius:50%;object-fit:cover;}
      .ach-icon-grid{display:flex;gap:6px;flex-wrap:wrap;}
      .ach-icon-btn{width:38px;height:38px;border-radius:10px;border:2px solid var(--border);background:var(--surface);color:var(--text);display:grid;place-items:center;cursor:pointer;}
      .ach-icon-btn.active{border-color:var(--gold);background:var(--gold-soft);color:var(--gold);}
      .ach-card{display:flex;align-items:center;gap:10px;padding:10px;border-radius:12px;background:var(--gold-soft);border:1px solid var(--border);}
      .ach-thumb{width:36px;height:36px;border-radius:10px;background:var(--surface);display:grid;place-items:center;overflow:hidden;border:1px solid var(--border);flex-shrink:0;color:var(--gold);}
      .ach-thumb img{width:100%;height:100%;object-fit:cover;}
      .pm-panel-box{background:rgba(255,255,255,.82);color:#222;border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:6px;backdrop-filter:blur(6px);}
      [data-theme="dark"] .pm-panel-box,[data-theme="amoled"] .pm-panel-box,[data-theme="ocean"] .pm-panel-box{background:rgba(18,20,26,.84);color:#f3f4f6;}
      .cinema-theater{background:radial-gradient(circle at center top,#25141a 0%,#08080b 70%)!important;}
      .cinema-screen-frame{flex:1;display:flex;flex-direction:column;min-height:220px;border-radius:16px;overflow:hidden;border:3px solid #302824;box-shadow:0 0 42px rgba(232,185,35,.16),0 18px 40px rgba(0,0,0,.85);background:#000;}
      .cinema-seats-bar{display:flex;justify-content:center;gap:10px;padding:6px 0;opacity:.4;pointer-events:none;}
      .cinema-seat{width:22px;height:14px;border-radius:6px 6px 2px 2px;background:#611925;border-top:3px solid #8f2a3a;}
    `;
    document.head.appendChild(st);
  }
}

export function nickStyleCss(u){
  if (!u) return '';
  let css = u.nickFont ? `font-family:'${u.nickFont}',sans-serif;` : '';
  if (u.nickGradEnabled && u.nickGrad1 && u.nickGrad2) {
    css += `background:linear-gradient(90deg,${u.nickGrad1},${u.nickGrad2});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;`;
  }
  return css;
}

export function applyTheme(cfg){
  const theme = cfg?.mode || localStorage.getItem("hezz_theme_mode") || "light";
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  localStorage.setItem("hezz_theme_mode", theme);
  const vars = ['--white','--surface','--surface-2','--gold','--gold-light','--gold-soft','--text','--text-soft','--border','--input-bg','--msg-bg','--msg-own-bg'];
  vars.forEach(v => root.style.removeProperty(v));
  if (theme === 'custom' && cfg) {
    localStorage.setItem("hezz_theme_custom", JSON.stringify(cfg));
    root.style.setProperty('--white', cfg.bg || '#1a1b26');
    root.style.setProperty('--surface', cfg.surface || '#24283b');
    root.style.setProperty('--surface-2', cfg.surface || '#24283b');
    root.style.setProperty('--gold', cfg.accent || '#7aa2f7');
    root.style.setProperty('--text', cfg.text || '#c0caf5');
    root.style.setProperty('--text-soft', cfg.text || '#a9b1d6');
    root.style.setProperty('--border', cfg.accent || '#7aa2f7');
    root.style.setProperty('--input-bg', cfg.bg || '#1a1b26');
    root.style.setProperty('--msg-bg', cfg.surface || '#24283b');
    root.style.setProperty('--msg-own-bg', cfg.surface || '#292e42');
    root.style.setProperty('--gold-soft', cfg.surface || '#24283b');
  }
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.themeBtn === theme));
  const cw = $("custom-theme-box"); if (cw) cw.style.display = theme === 'custom' ? 'flex' : 'none';
}

export function initTheme(){
  injectFontsAndCSS();
  const savedCustom = JSON.parse(localStorage.getItem("hezz_theme_custom") || "null");
  applyTheme({ mode: localStorage.getItem("hezz_theme_mode") || "light", ...(savedCustom || {}) });

  const tabs = $("settings-tabs"), body = document.querySelector("#view-settings .settings-body");
  if (tabs && body && !$("sub-appearance")) {
    const tBtn = document.createElement("button");
    tBtn.className = "tab"; tBtn.dataset.sub = "appearance"; tBtn.textContent = "Aparência";
    tabs.appendChild(tBtn);

    const sub = document.createElement("div");
    sub.className = "subview"; sub.id = "sub-appearance";
    sub.innerHTML = `<div class="card"><h3>Tema do Aplicativo</h3>
      <div class="theme-grid">${THEME_LIST.map(t => `<button type="button" class="theme-btn" data-theme-btn="${t.id}"><span class="theme-swatch" style="background:${t.bg}"></span>${esc(t.name)}</button>`).join('')}</div>
      <div id="custom-theme-box" class="gradient-controls" style="display:none;flex-direction:column;align-items:stretch;gap:8px;">
        <div class="row"><label>Fundo <input type="color" id="ct-bg" value="${savedCustom?.bg || '#1a1b26'}"></label>
        <label>Cards <input type="color" id="ct-surface" value="${savedCustom?.surface || '#24283b'}"></label>
        <label>Texto <input type="color" id="ct-text" value="${savedCustom?.text || '#c0caf5'}"></label>
        <label>Destaque <input type="color" id="ct-accent" value="${savedCustom?.accent || '#7aa2f7'}"></label></div>
        <button type="button" class="btn btn-primary" id="ct-save-btn">Aplicar Cores Personalizadas</button>
      </div></div>`;
    body.appendChild(sub);

    sub.querySelectorAll(".theme-btn").forEach(b => b.onclick = () => {
      const mode = b.dataset.themeBtn;
      const cfg = { mode, bg: $("ct-bg").value, surface: $("ct-surface").value, text: $("ct-text").value, accent: $("ct-accent").value };
      applyTheme(cfg);
      if (S.currentUser) update(ref(db, `users/${S.currentUser.uid}`), { theme: cfg }).catch(() => {});
      showToast("Tema atualizado!");
    });
    $("ct-save-btn").onclick = () => {
      const cfg = { mode: 'custom', bg: $("ct-bg").value, surface: $("ct-surface").value, text: $("ct-text").value, accent: $("ct-accent").value };
      applyTheme(cfg);
      if (S.currentUser) update(ref(db, `users/${S.currentUser.uid}`), { theme: cfg }).catch(() => {});
      showToast("Tema personalizado salvo!");
    };
    applyTheme({ mode: localStorage.getItem("hezz_theme_mode") || "light", ...(savedCustom || {}) });
  }
}