import { signInAnonymously, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth, S, $ } from "./state.js";
import { initUI, showErrorBanner, copyText } from "./ui.js";
import { initCalls, subscribeCalls } from "./calls.js";
import { initProfile, ensureUserDoc, startHeartbeat, setupDisconnect, subscribeProfile } from "./profile.js";
import { initSocial, subscribeFriends, subscribeGroups, subscribeRequests, subscribeDmAlerts } from "./social.js";
import { initServers, subscribeCommunities, subscribeAllCommunities, openInviteByCode } from "./servers.js";
import { initSettings } from "./settings.js";

initUI();
initCalls();
initProfile();
initSocial();
initServers();
initSettings();

if (!auth) {
  showErrorBanner("Falha ao inicializar Firebase Auth.");
} else {
  const tryAuth = (fn) => async () => {
    $("login-err").textContent = "";
    try { await fn(); } catch (e) { $("login-err").textContent = e.code || e.message; }
  };
  const cred = () => [$("login-email").value.trim(), $("login-pass").value];

  $("login-btn").onclick  = tryAuth(() => signInWithEmailAndPassword(auth, ...cred()));
  $("signup-btn").onclick = tryAuth(() => createUserWithEmailAndPassword(auth, ...cred()));
  $("google-btn").onclick = tryAuth(() => signInWithPopup(auth, new GoogleAuthProvider()));
  $("anon-btn").onclick   = tryAuth(() => signInAnonymously(auth));
  $("banned-logout-btn").onclick = () => signOut(auth);

  const t0 = Date.now();
  const hideSplash = () => setTimeout(() => {
    const s = $("splash");
    if (!s) return;
    s.style.opacity = 0;
    setTimeout(() => s.remove(), 500);
  }, Math.max(0, 1400 - (Date.now() - t0)));

  onAuthStateChanged(auth, async (user) => {
    hideSplash();
    $("login-overlay").style.display = user ? "none" : "grid";
    if (!user) {
      S.currentUser = null;
      $("banned-overlay").style.display = "none";
      return;
    }
    S.currentUser = user;
    try {
      await ensureUserDoc(user.uid);
      startHeartbeat(user.uid);
      setupDisconnect(user.uid);
      subscribeProfile(user.uid);
      subscribeFriends(user.uid);
      subscribeGroups(user.uid);
      subscribeRequests(user.uid);
      subscribeCommunities(user.uid);
      subscribeAllCommunities();
      subscribeCalls(user.uid);
      subscribeDmAlerts(user.uid);

      const myIdEl = $("my-id-short");
      if (myIdEl) {
        myIdEl.textContent = user.uid.slice(0, 10) + "…";
        myIdEl.onclick = () => copyText(user.uid);
      }

      const urlInv = new URLSearchParams(location.search).get('invite');
      if (urlInv) openInviteByCode(urlInv);
    } catch (err) {
      showErrorBanner("Erro no banco: " + (err.code || err.message));
    }
  });
}