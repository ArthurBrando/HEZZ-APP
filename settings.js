import { ref, update, push } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { auth, db, S, $, isPulse, fileToBase64 } from "./state.js";
import { showToast, copyText, openView } from "./ui.js";
import { loadProfileIntoForm } from "./profile.js";

let editProof = "";

function openSettings(){
  openView('view-settings');
  renderAccount();
  renderPlanState();
}

function renderAccount(){
  if (!S.currentUser) return;
  $("acc-nick").textContent = S.userProfile.nick || "—";
  $("acc-uid").textContent = S.currentUser.uid;
  $("acc-plan").textContent = isPulse() ? "PULSE" : "FREE";
  $("acc-strikes").textContent = S.userProfile.strikes || 0;
  $("acc-created").textContent = S.userProfile.createdAt ? new Date(S.userProfile.createdAt).toLocaleString() : "—";
}

function renderPlanState(){
  const pulse = isPulse();
  $("plan-free-label").textContent = pulse ? "Grátis" : "Atual";
  $("plan-pulse-label").textContent = pulse ? "Atual" : "R$ 5,00";
  const btn = $("btn-buy-pulse");
  if (btn) {
    btn.style.display = pulse ? 'none' : 'inline-flex';
    btn.disabled = !!S.userProfile.pulsePending;
    btn.textContent = S.userProfile.pulsePending ? "Pedido em análise..." : "Quero o PULSE";
  }
  if (pulse) $("pulse-form").style.display = 'none';
  const rv = $("btn-revoke-pulse");
  if (rv) {
    rv.style.display = pulse ? 'inline-flex' : 'none';
    rv.disabled = !!S.userProfile.revokePending;
    rv.textContent = S.userProfile.revokePending ? "Revogação em análise..." : "Revogar assinatura";
  }
}

export function initSettings(){
  S.onOpenSettings = openSettings;
  S.onRenderAccount = renderAccount;
  S.onRenderPlanState = renderPlanState;

  document.querySelectorAll('#settings-tabs .tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#settings-tabs .tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('#view-settings .subview').forEach(s => s.classList.remove('active'));
      const sub = $('sub-' + btn.dataset.sub);
      if (sub) sub.classList.add('active');
    });
  });

  $("btn-copy-id").addEventListener("click", () => { if (S.currentUser) copyText(S.currentUser.uid); });
  $("btn-open-profile-edit").addEventListener("click", () => { loadProfileIntoForm(); openView('view-profile'); });

  $("btn-revoke-pulse").addEventListener("click", async () => {
    if (!S.currentUser || !isPulse() || S.userProfile.revokePending) return;
    if (!confirm("Pedir a revogação da sua assinatura PULSE?")) return;
    try {
      await push(ref(db, "pulse_requests"), {
        uid: S.currentUser.uid, nick: S.userProfile.nick || "Anônimo",
        type: "revoke", plan: "pulse", status: "pending", createdAt: Date.now()
      });
      await update(ref(db, `users/${S.currentUser.uid}`), { revokePending: true });
      showToast("Pedido de revogação enviado");
    } catch (err) { showToast("Erro: " + err.message); }
  });

  $("btn-buy-pulse").addEventListener("click", () => {
    const form = $("pulse-form");
    form.style.display = form.style.display === 'flex' ? 'none' : 'flex';
  });

  $("proof-file").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      editProof = await fileToBase64(f, 5 * 1024 * 1024);
      const prev = $("proof-preview"); prev.src = editProof; prev.style.display = 'block';
    } catch (err) { showToast(err.message); }
    e.target.value = "";
  });

  $("btn-send-proof").addEventListener("click", async () => {
    if (!S.currentUser) return;
    if (isPulse()) { showToast("Você já é PULSE!"); return; }
    if (S.userProfile.pulsePending) { showToast("Seu pedido já está em análise"); return; }
    if (!editProof) { showToast("Anexe o comprovante do Pix"); return; }
    const buyerName = $("buyer-name").value.trim();
    if (!buyerName) { showToast("Informe o nome do pagador"); return; }
    try {
      await push(ref(db, "pulse_requests"), {
        uid: S.currentUser.uid, nick: S.userProfile.nick || "Anônimo", buyerName,
        type: "subscribe", plan: "pulse", amount: 5, proofUrl: editProof, status: "pending", createdAt: Date.now()
      });
      await update(ref(db, `users/${S.currentUser.uid}`), { pulsePending: true });
      editProof = "";
      $("proof-preview").style.display = 'none';
      $("pulse-form").style.display = 'none';
      showToast("Pedido enviado! Aguarde a aprovação.");
    } catch (err) { showToast("Erro ao enviar pedido: " + err.message); }
  });

  $("btn-enable-notif").addEventListener("click", async () => {
    if (!("Notification" in window)) return showToast("Navegador não suporta notificações");
    const res = await Notification.requestPermission();
    showToast(res === "granted" ? "Notificações ativadas!" : "Permissão negada");
  });

  $("btn-save-privacy").addEventListener("click", async () => {
    if (!S.currentUser) return;
    try {
      await update(ref(db, `users/${S.currentUser.uid}`), { privacy: { friendRequests: $("privacy-friend-requests").value } });
      showToast("Privacidade salva!");
    } catch (err) { showToast("Erro: " + err.message); }
  });

  $("btn-delete-data").addEventListener("click", async () => {
    if (!S.currentUser) return;
    if (!confirm("Isso apagará seu perfil, amigos e pedidos. Deseja continuar?")) return;
    try {
      const updates = {};
      Object.keys(S.friendsMap).forEach(fid => { updates[`users/${fid}/friends/${S.currentUser.uid}`] = null; });
      updates[`users/${S.currentUser.uid}`] = null;
      updates[`friend_requests/${S.currentUser.uid}`] = null;
      await update(ref(db), updates);
      showToast("Dados excluídos. Saindo...");
      setTimeout(() => { auth.signOut().then(() => location.reload()); }, 900);
    } catch (err) { showToast("Erro ao excluir: " + err.message); }
  });
}