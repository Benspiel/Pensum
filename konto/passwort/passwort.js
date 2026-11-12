/* Zielseite des Links aus der „Passwort zurücksetzen“-Mail (?userId=…&secret=…). */
import { confirmPasswordReset, authMessage } from "/js/auth.js";
import { openAuth } from "/js/shell.js";

const q = new URLSearchParams(location.search);
const userId = q.get("userId"), secret = q.get("secret");

const form = document.getElementById("resetForm");
const message = document.getElementById("resetMessage");
const info = document.getElementById("resetInfo");
const infoText = document.getElementById("resetInfoText");
const infoAction = document.getElementById("resetInfoAction");

function showInfo(text, label, mode) {
  form.hidden = true;
  info.hidden = false;
  infoText.textContent = text;
  infoAction.textContent = label;
  infoAction.onclick = () => openAuth(mode);
}

if (!userId || !secret) {
  showInfo("Diese Seite öffnest du über den Link aus der Mail zum Zurücksetzen. Du hast noch keine Mail? Fordere hier eine an.", "Link anfordern", "forgot");
} else {
  // Kennung nicht in der Adresszeile stehen lassen
  history.replaceState(null, "", location.pathname);
  form.hidden = false;
  form.elements.password.focus();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = form.elements.password.value;
  message.hidden = true;
  if (password !== form.elements.repeat.value) {
    message.textContent = "Die beiden Passwörter stimmen nicht überein.";
    message.hidden = false;
    return;
  }
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    await confirmPasswordReset({ userId, secret, password });
    showInfo("Dein Passwort ist geändert. Du kannst dich jetzt damit anmelden.", "Anmelden", "login");
  } catch (err) {
    message.textContent = authMessage(err);
    message.hidden = false;
  } finally {
    button.disabled = false;
  }
});
