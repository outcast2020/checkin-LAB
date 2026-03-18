const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbz5MD5JZklOymXSAu_dX3cbaE5ibFUp5rCYsTPSZ0MagKjSe2c0hPn5gXDHXxCAKKQN/exec";
const FALLBACK_TERMS_URL = "https://www.cordel2pontozero.com/s/Termos-Uso-Laboratorio-WEB-Cordel-20.pdf";
const DEFAULT_PROJECT_URL = "https://www.cordel2pontozero.com/";
const DEFAULT_LAB_URL = "https://www.cordel2pontozero.com/labx9q2mz7vkp4r8tbn6wcy3hd5jfa1u0sln7e2gk9rvm4p8qz2hx";
const DEFAULT_FORM_PUBLISHED_URL = "https://docs.google.com/forms/d/e/1FAIpQLSfXupYcDt274DeqAbrPip5UMe2_bciEWvKvm3Ot_1YKiw0-Eg/viewform";
const DEFAULT_FORM_EMBED_URL = "https://docs.google.com/forms/d/e/1FAIpQLSfXupYcDt274DeqAbrPip5UMe2_bciEWvKvm3Ot_1YKiw0-Eg/viewform?embedded=true";
const DEFAULT_PROJECT_NAME = "Laboratório Cordel 2.0";
const DEFAULT_TERMS_VERSION = "2026-03-v1";
const DEFAULT_PRIVACY_NOTICE =
  "Coletamos dados mínimos de identificação, acesso e participação para o funcionamento ético e organizado do Laboratório Cordel 2.0.";
const REDIRECT_DELAY_MS = 1800;

const state = {
  config: {
    projectName: DEFAULT_PROJECT_NAME,
    termsVersion: DEFAULT_TERMS_VERSION,
    termsUrl: FALLBACK_TERMS_URL,
    privacyNoticeShort: DEFAULT_PRIVACY_NOTICE,
    projectUrl: DEFAULT_PROJECT_URL,
    labUrl: DEFAULT_LAB_URL,
    formPublishedUrl: DEFAULT_FORM_PUBLISHED_URL,
    formEmbedUrl: DEFAULT_FORM_EMBED_URL
  }
};

document.addEventListener("DOMContentLoaded", () => {
  if (handleConfirmationBridge()) {
    return;
  }

  setupTabs();
  setupMasks();
  setupConsentLocks();
  setupForms();
  hydrateUi();
  loadRemoteConfig();
});

function handleConfirmationBridge() {
  const currentUrl = new URL(window.location.href);
  const action = currentUrl.searchParams.get("action");
  const email = currentUrl.searchParams.get("email");
  const token = currentUrl.searchParams.get("token");

  if (action !== "confirm" || !email || !token) {
    return false;
  }

  renderRedirectState(
    "Confirmando seu email...",
    "Estamos validando seu link com segurança no ambiente do Laboratório Cordel 2.0."
  );
  runConfirmationJsonp(email, token);

  return true;
}

function renderRedirectState(title, message) {
  document.body.textContent = "";

  const shell = document.createElement("main");
  shell.className = "redirect-shell";

  const card = document.createElement("section");
  card.className = "redirect-shell__card";

  const heading = document.createElement("h1");
  heading.textContent = title;

  const paragraph = document.createElement("p");
  paragraph.textContent = message;

  card.appendChild(heading);
  card.appendChild(paragraph);
  shell.appendChild(card);
  document.body.appendChild(shell);
}

function runConfirmationJsonp(email, token) {
  const callbackName = `labConfirmCallback_${Date.now()}`;
  const script = document.createElement("script");
  const targetUrl = new URL(WEB_APP_URL);

  targetUrl.searchParams.set("action", "confirm_jsonp");
  targetUrl.searchParams.set("email", email);
  targetUrl.searchParams.set("token", token);
  targetUrl.searchParams.set("callback", callbackName);

  window[callbackName] = (payload) => {
    delete window[callbackName];
    script.remove();
    renderConfirmationResult(payload);
  };

  script.onerror = () => {
    delete window[callbackName];
    script.remove();
    renderRedirectState(
      "Não foi possível validar o email",
      "O serviço de confirmação não respondeu corretamente. Tente novamente pelo link do email ou solicite novo envio."
    );
  };

  script.src = targetUrl.toString();
  document.body.appendChild(script);
}

function renderConfirmationResult(payload) {
  const safePayload = payload && typeof payload === "object" ? payload : {};
  renderRedirectState(
    safePayload.title || "Confirmação de email",
    safePayload.message || "Seu link foi processado."
  );
}

function setupTabs() {
  const tabs = Array.from(document.querySelectorAll(".tab-button"));
  const panels = Array.from(document.querySelectorAll(".tab-panel"));

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const targetId = tab.getAttribute("aria-controls");

      tabs.forEach((item) => {
        item.classList.toggle("is-active", item === tab);
        item.setAttribute("aria-selected", String(item === tab));
      });

      panels.forEach((panel) => {
        const isTarget = panel.id === targetId;
        panel.classList.toggle("is-active", isTarget);
        panel.hidden = !isTarget;
      });
    });
  });
}

function setupMasks() {
  const birthInput = document.querySelector("#signupBirth");
  const phoneInput = document.querySelector("#signupPhone");

  birthInput?.addEventListener("input", () => {
    birthInput.value = maskDate(birthInput.value);
  });

  phoneInput?.addEventListener("input", () => {
    phoneInput.value = maskPhone(phoneInput.value);
  });
}

function setupConsentLocks() {
  bindConsentToButton("#loginConsent", "#loginButton");
  bindConsentToButton("#signupConsent", "#signupButton");
}

function bindConsentToButton(checkboxSelector, buttonSelector) {
  const checkbox = document.querySelector(checkboxSelector);
  const button = document.querySelector(buttonSelector);

  if (!checkbox || !button) return;

  const sync = () => {
    button.disabled = !checkbox.checked;
  };

  checkbox.addEventListener("change", sync);
  sync();
}

function setupForms() {
  const loginForm = document.querySelector("#loginForm");
  const signupForm = document.querySelector("#signupForm");
  const resetPasswordButton = document.querySelector("#resetPasswordButton");

  loginForm?.addEventListener("submit", handleLoginSubmit);
  signupForm?.addEventListener("submit", handleSignupSubmit);
  resetPasswordButton?.addEventListener("click", handleResetPasswordRequest);
}

function hydrateUi() {
  setText("#projectName", `CHECK-IN do ${state.config.projectName}`);
  setText("#termsVersion", state.config.termsVersion);
  setText("#privacyNotice", state.config.privacyNoticeShort);
  updateTermsLink();
  updateProjectLink();
  updateSignupEmbed();
}

async function loadRemoteConfig() {
  if (!hasWebAppUrl()) {
    setText(
      "#termsStatus",
      "Configure a URL do Web App e do PDF em app.js para ativar a integração completa."
    );
    return;
  }

  try {
    const url = new URL(WEB_APP_URL);
    url.searchParams.set("action", "config");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    const data = await response.json();
    if (!data?.ok) return;

    state.config = {
      projectName: cleanValue(data.projectName, DEFAULT_PROJECT_NAME),
      termsVersion: cleanValue(data.termsVersion, DEFAULT_TERMS_VERSION),
      termsUrl: cleanValue(data.termsUrl, FALLBACK_TERMS_URL),
      privacyNoticeShort: cleanValue(data.privacyNoticeShort, DEFAULT_PRIVACY_NOTICE),
      projectUrl: cleanValue(data.projectUrl, DEFAULT_PROJECT_URL),
      labUrl: cleanValue(data.labUrl, DEFAULT_LAB_URL),
      formPublishedUrl: cleanValue(data.formPublishedUrl, DEFAULT_FORM_PUBLISHED_URL),
      formEmbedUrl: cleanValue(data.formEmbedUrl, DEFAULT_FORM_EMBED_URL)
    };

    hydrateUi();
  } catch (error) {
    setText(
      "#termsStatus",
      "Não foi possível carregar a configuração remota. O site segue com os valores locais."
    );
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const feedback = document.querySelector("#loginFeedback");
  const button = document.querySelector("#loginButton");
  const email = form.email.value.trim().toLowerCase();
  const senha = String(form.senha?.value || "").trim();
  const consentAccepted = document.querySelector("#loginConsent")?.checked;

  if (form.senha) {
    form.senha.value = senha;
  }

  clearFeedback(feedback);

  if (!isValidEmail(email)) {
    showFeedback(feedback, "error", "Informe um email válido para continuar.");
    return;
  }

  if (!consentAccepted) {
    showFeedback(feedback, "error", "É necessário aceitar o termo para entrar.");
    return;
  }

  if (!hasWebAppUrl()) {
    showFeedback(
      feedback,
      "error",
      "A URL do Google Apps Script ainda não foi configurada em app.js."
    );
    return;
  }

  const payload = {
    email,
    senha,
    consentAccepted: true,
    termsVersion: state.config.termsVersion,
    page: "checkin",
    userAgent: navigator.userAgent
  };

  setLoading(button, true, "Entrando...");

  try {
    const data = await jsonpRequest("login_jsonp", payload);

    if (!data?.ok) {
      const message =
        data?.code === "EMAIL_NAO_AUTORIZADO"
          ? "Não encontramos esse email na lista de acesso. Você pode seguir pela aba de cadastro."
          : data?.code === "EMAIL_NAO_CONFIRMADO"
            ? "Seu cadastro está pendente de confirmação. Verifique o email recebido e ative seu acesso antes de entrar."
            : data?.code === "SENHA_NAO_CONFIGURADA"
              ? "Sua senha ainda não está pronta. Use a opção 'Esqueci a senha / Quero mudar' para receber uma nova senha por email."
          : data?.message || "Não foi possível validar seu acesso agora.";
      showFeedback(feedback, "error", message);
      return;
    }

    showFeedback(
      feedback,
      "success",
      "Acesso confirmado. Você será redirecionado para o ambiente do laboratório."
    );
    safeRedirect(data.redirectUrl);
  } catch (error) {
    showFeedback(
      feedback,
      "error",
      "Falha de comunicação com o serviço de acesso. Solicite uma nova senha e tente novamente em instantes."
    );
  } finally {
    setLoading(button, false, "Entrar");
  }
}

async function handleSignupSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const feedback = document.querySelector("#signupFeedback");
  const button = document.querySelector("#signupButton");
  const consentAccepted = document.querySelector("#signupConsent")?.checked;

  clearFeedback(feedback);

  const nome = form.nome.value.trim();
  const email = form.email.value.trim().toLowerCase();
  const dataAniversario = maskDate(form.dataAniversario.value);
  const instituicao = form.instituicao.value.trim();
  const oficinasCordel = form.oficinasCordel.value;
  const telefone = maskPhone(form.telefone.value);

  form.dataAniversario.value = dataAniversario;
  form.telefone.value = telefone;

  if (nome.length < 3) {
    showFeedback(feedback, "error", "Informe seu nome completo.");
    return;
  }

  if (!isValidEmail(email)) {
    showFeedback(feedback, "error", "Informe um email válido.");
    return;
  }

  if (!isValidBirthDate(dataAniversario)) {
    showFeedback(feedback, "error", "Use a data no formato dd/mm/aa ou dd/mm/aaaa.");
    return;
  }

  if (!instituicao) {
    showFeedback(feedback, "error", "Informe a instituição ou escreva 'Não se aplica'.");
    return;
  }

  if (!["SIM", "NAO"].includes(oficinasCordel)) {
    showFeedback(
      feedback,
      "error",
      "Informe se você fez ou está nas oficinas do Cordel 2.0."
    );
    return;
  }

  if (!isValidPhone(telefone)) {
    showFeedback(feedback, "error", "Informe telefone com DDD.");
    return;
  }

  if (!consentAccepted) {
    showFeedback(feedback, "error", "É necessário aceitar o consentimento informado.");
    return;
  }

  if (!hasWebAppUrl()) {
    showFeedback(
      feedback,
      "error",
      "A URL do Google Apps Script ainda não foi configurada em app.js."
    );
    return;
  }

  const payload = {
    action: "signup",
    nome,
    email,
    dataAniversario,
    instituicao,
    oficinasCordel,
    telefone,
    consentAccepted: true,
    termsVersion: state.config.termsVersion,
    page: "checkin",
    userAgent: navigator.userAgent
  };

  setLoading(button, true, "Cadastrando...");

  try {
    const data = await postJson(payload);

    if (!data?.ok) {
      const message =
        data?.code === "EMAIL_JA_CADASTRADO"
          ? "Este email já está cadastrado. Use a aba Entrar para continuar."
          : data?.message || "Não foi possível concluir o cadastro agora.";
      showFeedback(feedback, "error", message);
      return;
    }

    const successMessage =
      data?.code === "SIGNUP_PENDING_EMAIL_RESENT"
        ? "Seu cadastro já existia e reenviamos o link de confirmação. Verifique seu email para ativar o login."
        : "Cadastro recebido com sucesso. Enviamos um link de confirmação para seu email. Depois de confirmar, você receberá uma senha aleatória para entrar.";

    showFeedback(feedback, "success", successMessage);
    form.reset();
    document.querySelector("#signupButton").disabled = true;
  } catch (error) {
    showFeedback(
      feedback,
      "error",
      "Falha de comunicação com o serviço. Se o site estiver em outro domínio, confirme a liberação de CORS do Web App."
    );
  } finally {
    setLoading(button, false, "Cadastrar e continuar");
  }
}

async function handleResetPasswordRequest() {
  const form = document.querySelector("#loginForm");
  const feedback = document.querySelector("#loginFeedback");
  const button = document.querySelector("#resetPasswordButton");
  const email = form?.email?.value.trim().toLowerCase() || "";

  clearFeedback(feedback);

  if (!isValidEmail(email)) {
    showFeedback(feedback, "error", "Informe um email válido para receber uma nova senha.");
    return;
  }

  if (!hasWebAppUrl()) {
    showFeedback(
      feedback,
      "error",
      "A URL do Google Apps Script ainda não foi configurada em app.js."
    );
    return;
  }

  setLoading(button, true, "Enviando nova senha...");

  try {
    const data = await jsonpRequest("reset_password_jsonp", {
      email,
      page: "checkin",
      userAgent: navigator.userAgent
    });

    showFeedback(
      feedback,
      "success",
      data?.message || "Se o email estiver ativo no sistema, enviaremos uma nova senha por email em instantes."
    );
  } catch (error) {
    showFeedback(
      feedback,
      "error",
      "Falha de comunicação com o serviço ao solicitar nova senha."
    );
  } finally {
    setLoading(button, false, "Esqueci a senha / Quero mudar");
  }
}

async function postJson(payload) {
  const response = await fetch(WEB_APP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=utf-8",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });

  return response.json();
}

function jsonpRequest(action, params) {
  return new Promise((resolve, reject) => {
    const callbackName = `labJsonp_${action}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const script = document.createElement("script");
    const url = new URL(WEB_APP_URL);

    url.searchParams.set("action", action);
    url.searchParams.set("callback", callbackName);

    Object.entries(params || {}).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      url.searchParams.set(key, String(value));
    });

    const cleanup = () => {
      delete window[callbackName];
      script.remove();
    };

    window[callbackName] = (payload) => {
      cleanup();
      resolve(payload);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("JSONP_REQUEST_FAILED"));
    };

    script.src = url.toString();
    document.body.appendChild(script);
  });
}

function safeRedirect(url) {
  const target = cleanValue(url, state.config.labUrl || DEFAULT_LAB_URL);
  window.setTimeout(() => {
    window.location.href = target;
  }, REDIRECT_DELAY_MS);
}

function updateTermsLink() {
  const link = document.querySelector("#termsLink");
  const status = document.querySelector("#termsStatus");
  const termsUrl = cleanValue(state.config.termsUrl, FALLBACK_TERMS_URL);
  const hasTermsUrl = hasUsableUrl(termsUrl);

  link.href = hasTermsUrl ? termsUrl : "#";
  link.setAttribute("aria-disabled", String(!hasTermsUrl));
  link.classList.toggle("is-disabled", !hasTermsUrl);

  if (hasTermsUrl) {
    status.textContent = `Versão atual do termo: ${state.config.termsVersion}.`;
  } else {
    status.textContent =
      "Configure a URL do PDF no Apps Script ou no arquivo app.js para habilitar a leitura completa.";
  }
}

function updateProjectLink() {
  const link = document.querySelector("#projectLink");
  if (!link) return;

  link.href = cleanValue(state.config.projectUrl, DEFAULT_PROJECT_URL);
}

function updateSignupEmbed() {
  const shell = document.querySelector("#signupEmbedShell");
  const frame = document.querySelector("#signupEmbedFrame");
  const note = document.querySelector("#signupEmbedNote");
  const fallbackForm = document.querySelector("#signupForm");
  const embedUrl = cleanValue(state.config.formEmbedUrl, DEFAULT_FORM_EMBED_URL);

  if (!shell || !frame || !note || !fallbackForm) return;

  if (hasUsableUrl(embedUrl)) {
    frame.src = embedUrl;
    shell.hidden = false;
    fallbackForm.hidden = true;
    note.textContent =
      "Preencha o formulário abaixo. Depois da confirmação por email, você receberá uma senha aleatória para entrar.";
    return;
  }

  shell.hidden = true;
  fallbackForm.hidden = false;
}

function showFeedback(element, tone, message) {
  if (!element) return;
  element.dataset.tone = tone;
  element.textContent = "";
  const box = document.createElement("div");
  box.className = "feedback__box";
  box.textContent = message;
  element.appendChild(box);
}

function clearFeedback(element) {
  if (!element) return;
  element.removeAttribute("data-tone");
  element.textContent = "";
}

function setLoading(button, isLoading, loadingText) {
  if (!button) return;

  if (isLoading) {
    button.dataset.originalText = button.textContent;
    button.textContent = loadingText;
    button.classList.add("is-loading");
    button.disabled = true;
    return;
  }

  button.textContent = button.dataset.originalText || button.textContent;
  button.classList.remove("is-loading");

  if (button.id === "loginButton") {
    const consent = document.querySelector("#loginConsent");
    button.disabled = !consent?.checked;
    return;
  }

  if (button.id === "signupButton") {
    const consent = document.querySelector("#signupConsent");
    button.disabled = !consent?.checked;
    return;
  }

  button.disabled = false;
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = value;
  }
}

function maskDate(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
  const parts = [];

  if (digits.length > 0) parts.push(digits.slice(0, 2));
  if (digits.length > 2) parts.push(digits.slice(2, 4));
  if (digits.length > 4) parts.push(digits.slice(4, 8));

  return parts.join("/");
}

function maskPhone(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);

  if (digits.length <= 2) return digits ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isValidPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 11;
}

function isValidBirthDate(value) {
  const match = String(value || "").match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!match) return false;

  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);

  if (match[3].length === 2) {
    year = year <= 29 ? 2000 + year : 1900 + year;
  }

  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function hasUsableUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function hasWebAppUrl() {
  return hasUsableUrl(WEB_APP_URL);
}

function cleanValue(value, fallback) {
  const clean = String(value || "").trim();
  return clean || fallback;
}
