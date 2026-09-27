import { getUser, logout, recheckAccess } from "../auth.js";
import { escapeHtml } from "../router.js";
import { t } from "../i18n.js";
import { toast } from "../ui.js";

export function renderNoAccess(view) {
  const user = getUser();
  view.innerHTML = `
    <div class="login-wrap">
      <div class="login-card panel no-access">
        <div class="lock">🔒</div>
        <h1>${t("noAccess.title")}</h1>
        <p class="sub">${t("noAccess.body")}</p>
        <div class="who">
          ${user.photoURL ? `<img src="${escapeHtml(user.photoURL)}" alt="" referrerpolicy="no-referrer" />` : ""}
          <span>${escapeHtml(user.email)}</span>
        </div>
        <p class="hint">${t("noAccess.hint")}</p>
        <div class="row" style="justify-content:center">
          <button class="btn btn-primary" id="recheck">${t("noAccess.recheck")}</button>
          <button class="btn" id="switch">${t("noAccess.switch")}</button>
        </div>
      </div>
    </div>`;

  const recheck = view.querySelector("#recheck");
  recheck.onclick = async () => {
    recheck.disabled = true;
    const ok = await recheckAccess();
    if (!ok) {
      toast(t("noAccess.still"), "err");
      recheck.disabled = false;
    }
  };
  view.querySelector("#switch").onclick = () => logout();
}
