import { S, $, esc, isPulse } from "./state.js";
import { showToast } from "./ui.js";

const KLIPY_KEY = "79whYGf04yCSr7G5vVkyftxnxkFnZAFhH5bwUakdBSkskjc3QBSbRwyYEn5Xtl7v";
const SVG_SEARCH = '<svg class="ui-icon sm" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
let gifDebounce = null;

async function fetchKlipy(queryText = ""){
  const q = encodeURIComponent(queryText.trim());
  const url = q
    ? `https://api.klipy.com/v2/search?q=${q}&key=${KLIPY_KEY}&limit=20&contentfilter=low`
    : `https://api.klipy.com/v2/trending?key=${KLIPY_KEY}&limit=20&contentfilter=low`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    return (data.results || data.data || []).map(item => {
      const media = item.media_formats || item.media || {};
      const gifUrl = media.gif?.url || media.mediumgif?.url || media.tinygif?.url || item.url || "";
      const preview = media.nanogif?.url || media.tinygif?.url || gifUrl;
      return { url: gifUrl, preview };
    }).filter(g => g.url);
  } catch (err) {
    // Fallback seguro em caso de indisponibilidade de rede
    return [
      { url: "https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif", preview: "https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/200_d.gif" },
      { url: "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif", preview: "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/200_d.gif" },
      { url: "https://media.giphy.com/media/xT9IgzoKnwFNmISR8I/giphy.gif", preview: "https://media.giphy.com/media/xT9IgzoKnwFNmISR8I/200_d.gif" }
    ];
  }
}

export function buildPickerUI(pickerEl, onPickEmoji, onPickGif){
  if (!pickerEl) return;
  pickerEl.innerHTML = `
    <div class="picker-tabs">
      <button type="button" class="picker-tab active" data-tab="emojis">Emojis</button>
      <button type="button" class="picker-tab" data-tab="gifs">GIFs (KLIPY)</button>
    </div>
    <div class="picker-body">
      <div class="emoji-view">
        <div class="emoji-sec">
          <span>EXCLUSIVOS PULSE</span>
          ${!isPulse() ? '<span style="font-size:.65rem;color:var(--text-soft)">Assine p/ desbloquear</span>' : ''}
        </div>
        <div class="emoji-grid pulse-emojis-row" style="margin-bottom:8px;"></div>
        <div class="emoji-sec"><span>PADRÃO</span></div>
        <div class="emoji-grid standard-emojis-row"></div>
      </div>
      <div class="gif-box">
        <div class="gif-search-row">
          <input type="text" class="gif-search-input" placeholder="Pesquisar GIFs no KLIPY..." />
          <button type="button" class="mini-btn gold gif-search-btn">${SVG_SEARCH}</button>
        </div>
        <div class="gif-grid"><div class="empty" style="grid-column:1/-1;">Carregando GIFs...</div></div>
        <div class="klipy-attr">Powered by KLIPY</div>
      </div>
    </div>
  `;

  // Renderiza Emojis PULSE
  const pulseRow = pickerEl.querySelector(".pulse-emojis-row");
  for (let i = 1; i <= 5; i++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "emoji-btn" + (isPulse() ? "" : " emoji-locked");
    b.innerHTML = `<img class="pemoji" src="emoji${i}.png" alt="pulse${i}">`;
    b.onclick = () => {
      if (!isPulse()) { showToast("Emojis exclusivos para assinantes PULSE!"); return; }
      onPickEmoji(`:pulse${i}:`);
    };
    pulseRow.appendChild(b);
  }

  // Renderiza Emojis Padrão
  const stdRow = pickerEl.querySelector(".standard-emojis-row");
  const stdList = "😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😋 😛 😜 🤪 😎 🤩 🥳 😏 😒 😞 😔 😟 😢 😭 😤 😠 😡 🤬 🤯 😳 😱 🤫 😴 🥱 💩 💀 👽 🤖 🎃 💖 🔥 ✨ 🎉 👍 👎 👏 🙌".split(" ");
  stdList.forEach(e => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "emoji-btn";
    btn.textContent = e;
    btn.onclick = () => onPickEmoji(e);
    stdRow.appendChild(btn);
  });

  // Alternância de abas Emoji / GIF
  const emojiView = pickerEl.querySelector(".emoji-view");
  const gifBox = pickerEl.querySelector(".gif-box");
  const tabs = pickerEl.querySelectorAll(".picker-tab");
  tabs.forEach(t => {
    t.addEventListener("click", () => {
      tabs.forEach(b => b.classList.remove("active"));
      t.classList.add("active");
      if (t.dataset.tab === "emojis") {
        emojiView.style.display = "block";
        gifBox.classList.remove("active");
      } else {
        emojiView.style.display = "none";
        gifBox.classList.add("active");
        loadGifs("");
      }
    });
  });

  // Busca de GIFs com KLIPY
  const gifGrid = pickerEl.querySelector(".gif-grid");
  const gifInput = pickerEl.querySelector(".gif-search-input");
  const gifBtn = pickerEl.querySelector(".gif-search-btn");

  async function loadGifs(q = ""){
    gifGrid.innerHTML = '<div class="empty" style="grid-column:1/-1;">Buscando no KLIPY...</div>';
    const items = await fetchKlipy(q);
    gifGrid.innerHTML = "";
    if (!items.length) {
      gifGrid.innerHTML = '<div class="empty" style="grid-column:1/-1;">Nenhum GIF encontrado.</div>';
      return;
    }
    items.forEach(it => {
      const el = document.createElement("div");
      el.className = "gif-item";
      el.innerHTML = `<img src="${esc(it.preview || it.url)}" loading="lazy" />`;
      el.onclick = () => {
        onPickGif(it.url);
        pickerEl.classList.remove("show");
      };
      gifGrid.appendChild(el);
    });
  }

  gifInput.addEventListener("input", () => {
    clearTimeout(gifDebounce);
    gifDebounce = setTimeout(() => loadGifs(gifInput.value), 450);
  });
  gifBtn.onclick = () => loadGifs(gifInput.value);
}