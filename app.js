const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbyIqooRGsHdwRAdDxm75U_UH4hp0Mtmxl9Pv_FkxBUU21_A_RwdqCfvsAcYtNft3cHN/exec";
const FALLBACK_TERMS_URL = "https://www.cordel2pontozero.com/s/laboratorio_cordel_2_0_termos_referencias_ABRIL2026.pdf";
const DEFAULT_PROJECT_URL = "https://www.cordel2pontozero.com/";
const DEFAULT_LAB_URL = "https://www.cordel2pontozero.com/laboratorio";
const DEFAULT_CHECKIN_URL =
  typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : "";
const DEFAULT_FORM_PUBLISHED_URL = "https://docs.google.com/forms/d/e/1FAIpQLSfXupYcDt274DeqAbrPip5UMe2_bciEWvKvm3Ot_1YKiw0-Eg/viewform";
const DEFAULT_FORM_EMBED_URL = "https://docs.google.com/forms/d/e/1FAIpQLSfXupYcDt274DeqAbrPip5UMe2_bciEWvKvm3Ot_1YKiw0-Eg/viewform?embedded=true";
const DEFAULT_PROJECT_NAME = "Laboratorio Cordel 2.0";
const DEFAULT_TERMS_VERSION = "2026-04-v1";
const DEFAULT_PRIVACY_NOTICE =
  "Coletamos dados minimos de identificacao, acesso e participacao para o funcionamento etico e organizado do Laboratorio Cordel 2.0.";

const state = {
  config: {
    projectName: DEFAULT_PROJECT_NAME,
    termsVersion: DEFAULT_TERMS_VERSION,
    termsUrl: FALLBACK_TERMS_URL,
    privacyNoticeShort: DEFAULT_PRIVACY_NOTICE,
    projectUrl: DEFAULT_PROJECT_URL,
    labUrl: DEFAULT_LAB_URL,
    checkinUrl: DEFAULT_CHECKIN_URL,
    formPublishedUrl: DEFAULT_FORM_PUBLISHED_URL,
    formEmbedUrl: DEFAULT_FORM_EMBED_URL
  },
  quoteTimerId: null
};

document.addEventListener("DOMContentLoaded", () => {
  if (handleBridgeRoute()) {
    return;
  }

  setupTabs();
  setupMasks();
  setupConsentLocks();
  setupForms();
  hydrateUi();
  loadRemoteConfig();
});

function handleBridgeRoute() {
  const currentUrl = new URL(window.location.href);
  const action = currentUrl.searchParams.get("action");
  const email = currentUrl.searchParams.get("email");
  const token = currentUrl.searchParams.get("token");

  if (action === "confirm" && email && token) {
    startConfirmationBridge(email, token);
    return true;
  }

  if (action === "set_password" && email && token) {
    renderPasswordSetupBridge(email, token);
    return true;
  }

  return false;
}

function startConfirmationBridge(email, token) {
  renderBridgeState({
    eyebrow: "Confirmacao em andamento",
    title: "Validando seu email com cuidado",
    message:
      "Estamos confirmando seu acesso em ambiente seguro para preparar a proxima etapa do Laboratorio Cordel 2.0.",
    quote: getBridgeQuote(0),
    loading: true,
    actions: []
  });
  rotateBridgeQuotes();
  runConfirmationJsonp(email, token);
}

function renderBridgeState(options) {
  stopBridgeQuoteRotation();
  document.body.textContent = "";

  const shell = document.createElement("main");
  shell.className = "redirect-shell";

  const card = document.createElement("section");
  card.className = "redirect-shell__card";

  if (options.eyebrow) {
    const eyebrow = document.createElement("p");
    eyebrow.className = "redirect-shell__eyebrow";
    eyebrow.textContent = options.eyebrow;
    card.appendChild(eyebrow);
  }

  const heading = document.createElement("h1");
  heading.textContent = options.title;

  const paragraph = document.createElement("p");
  paragraph.className = "redirect-shell__message";
  paragraph.textContent = options.message;

  card.appendChild(heading);
  card.appendChild(paragraph);

  if (options.loading) {
    const loader = document.createElement("div");
    loader.className = "redirect-shell__loader";
    card.appendChild(loader);
  }

  if (options.quote) {
    const quote = document.createElement("blockquote");
    quote.className = "redirect-shell__quote";
    quote.id = "bridgeQuote";
    quote.textContent = options.quote;
    card.appendChild(quote);
  }

  if (options.note) {
    const note = document.createElement("p");
    note.className = "redirect-shell__note";
    note.textContent = options.note;
    card.appendChild(note);
  }

  const actions = document.createElement("div");
  actions.className = "redirect-shell__actions";

  (options.actions || []).forEach((action) => {
    if (!action || !action.label) return;

    if (action.type === "button") {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `redirect-shell__button ${action.tone || "ghost"}`;
      button.textContent = action.label;
      button.addEventListener("click", action.onClick);
      actions.appendChild(button);
      return;
    }

    const link = document.createElement("a");
    link.className = `redirect-shell__button ${action.tone || "ghost"}`;
    link.textContent = action.label;
    link.href = action.href || "#";
    if (action.newTab) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    actions.appendChild(link);
  });

  if (actions.children.length) {
    card.appendChild(actions);
  }

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
    renderBridgeState({
      eyebrow: "Confirmacao indisponivel",
      title: "Nao foi possivel validar o email",
      message:
        "O servico de confirmacao nao respondeu corretamente. Tente novamente pelo link do email ou solicite um novo envio pelo cadastro.",
      quote: getBridgeQuote(1),
      actions: buildBridgeActions({
        primaryLabel: "Voltar ao cadastro",
        primaryUrl: state.config.checkinUrl || DEFAULT_CHECKIN_URL,
        secondaryLabel: "Conhecer o projeto",
        secondaryUrl: state.config.projectUrl || DEFAULT_PROJECT_URL,
        allowClose: true
      })
    });
  };

  script.src = targetUrl.toString();
  document.body.appendChild(script);
}

function renderConfirmationResult(payload) {
  const safePayload = payload && typeof payload === "object" ? payload : {};

  renderBridgeState({
    eyebrow: safePayload.ok ? "Acesso preparado" : "Atencao",
    title: safePayload.title || "Confirmacao de email",
    message: safePayload.message || "Seu link foi processado.",
    quote: getBridgeQuote(safePayload.ok ? 2 : 3),
    actions: buildBridgeActions({
      primaryLabel: safePayload.primaryActionLabel,
      primaryUrl: safePayload.primaryActionUrl,
      secondaryLabel: safePayload.secondaryActionLabel,
      secondaryUrl: safePayload.secondaryActionUrl,
      allowClose: true,
      closeLabel: safePayload.closeLabel
    })
  });
}

function renderPasswordSetupBridge(email, token) {
  stopBridgeQuoteRotation();
  document.body.textContent = "";

  const shell = document.createElement("main");
  shell.className = "redirect-shell";

  const card = document.createElement("section");
  card.className = "redirect-shell__card redirect-shell__card--form";

  const eyebrow = document.createElement("p");
  eyebrow.className = "redirect-shell__eyebrow";
  eyebrow.textContent = "Escolha sua senha";

  const heading = document.createElement("h1");
  heading.textContent = "Defina seu acesso com seguranca";

  const message = document.createElement("p");
  message.className = "redirect-shell__message";
  message.textContent =
    "Crie uma senha com pelo menos 10 caracteres, usando letras e numeros. Depois disso, seu acesso ficara pronto para uso nos apps.";

  const quote = document.createElement("blockquote");
  quote.className = "redirect-shell__quote";
  quote.textContent = getBridgeQuote(4);

  const form = document.createElement("form");
  form.className = "password-bridge-form";
  form.method = "POST";
  form.action = WEB_APP_URL;

  addHiddenInput(form, "action", "set_password");
  addHiddenInput(form, "email", email);
  addHiddenInput(form, "token", token);
  addHiddenInput(form, "page", "checkin_set_password");

  const passwordField = createPasswordField("Nova senha", "senha", "Crie sua senha");
  const confirmationField = createPasswordField(
    "Confirmar senha",
    "senhaConfirmacao",
    "Repita a nova senha"
  );

  const helper = document.createElement("p");
  helper.className = "redirect-shell__note";
  helper.textContent =
    "Dica: combine uma frase curta que faca sentido para voce com numeros. Exemplo de estrutura: cordel2026lab.";

  const feedback = document.createElement("div");
  feedback.className = "feedback";

  const actions = document.createElement("div");
  actions.className = "redirect-shell__actions";

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "redirect-shell__button primary";
  submit.textContent = "Salvar minha senha";

  const back = document.createElement("a");
  back.className = "redirect-shell__button secondary";
  back.href = state.config.checkinUrl || DEFAULT_CHECKIN_URL || DEFAULT_PROJECT_URL;
  back.textContent = "Voltar ao cadastro";

  const close = document.createElement("button");
  close.type = "button";
  close.className = "redirect-shell__button ghost";
  close.textContent = "Fechar janela";
  close.addEventListener("click", closeBridgeWindow);

  actions.appendChild(submit);
  actions.appendChild(back);
  actions.appendChild(close);

  form.appendChild(passwordField);
  form.appendChild(confirmationField);
  form.appendChild(helper);
  form.appendChild(feedback);
  form.appendChild(actions);

  form.addEventListener("submit", (event) => {
    const password = form.elements.senha.value.trim();
    const confirmation = form.elements.senhaConfirmacao.value.trim();
    const validationMessage = validatePasswordChoice(password, confirmation);

    if (validationMessage) {
      event.preventDefault();
      showFeedback(feedback, "error", validationMessage);
      return;
    }

    showFeedback(feedback, "success", "Salvando sua nova senha com seguranca...");
  });

  card.appendChild(eyebrow);
  card.appendChild(heading);
  card.appendChild(message);
  card.appendChild(quote);
  card.appendChild(form);
  shell.appendChild(card);
  document.body.appendChild(shell);
}

function addHiddenInput(form, name, value) {
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = name;
  input.value = value;
  form.appendChild(input);
}

function createPasswordField(labelText, name, placeholder) {
  const field = document.createElement("label");
  field.className = "password-bridge-form__field";

  const label = document.createElement("span");
  label.textContent = labelText;

  const input = document.createElement("input");
  input.type = "password";
  input.name = name;
  input.placeholder = placeholder;
  input.autocomplete = "new-password";
  input.minLength = 10;
  input.required = true;

  field.appendChild(label);
  field.appendChild(input);
  return field;
}

function validatePasswordChoice(password, confirmation) {
  if (!password || !confirmation) {
    return "Preencha e confirme sua nova senha.";
  }

  if (password !== confirmation) {
    return "Os dois campos de senha precisam ser iguais.";
  }

  if (password.length < 10) {
    return "Sua senha precisa ter pelo menos 10 caracteres.";
  }

  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Use ao menos uma letra e um numero na nova senha.";
  }

  return "";
}

function buildBridgeActions(options) {
  const actions = [];

  if (options.primaryLabel && options.primaryUrl) {
    actions.push({
      label: options.primaryLabel,
      href: options.primaryUrl,
      tone: "primary"
    });
  }

  if (options.secondaryLabel && options.secondaryUrl) {
    actions.push({
      label: options.secondaryLabel,
      href: options.secondaryUrl,
      tone: "secondary",
      newTab:
        /^https?:\/\//i.test(options.secondaryUrl) &&
        options.secondaryUrl !== (state.config.checkinUrl || DEFAULT_CHECKIN_URL)
    });
  }

  if (options.allowClose) {
    actions.push({
      label: options.closeLabel || "Fechar janela",
      type: "button",
      tone: "ghost",
      onClick: closeBridgeWindow
    });
  }

  return actions;
}

function closeBridgeWindow() {
  window.close();
  window.setTimeout(() => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.href = state.config.checkinUrl || DEFAULT_CHECKIN_URL || DEFAULT_PROJECT_URL;
  }, 120);
}

function rotateBridgeQuotes() {
  stopBridgeQuoteRotation();

  const quoteElement = document.querySelector("#bridgeQuote");
  if (!quoteElement) return;

  const quotes = getBridgeQuotes();
  let index = 0;

  state.quoteTimerId = window.setInterval(() => {
    index = (index + 1) % quotes.length;
    quoteElement.textContent = quotes[index];
  }, 3200);
}

function stopBridgeQuoteRotation() {
  if (state.quoteTimerId) {
    window.clearInterval(state.quoteTimerId);
    state.quoteTimerId = null;
  }
}

function getBridgeQuote(index) {
  const quotes = getBridgeQuotes();
  return quotes[index % quotes.length];
}

function getBridgeQuotes() {
  return [
    "Entrar em um processo de aprendizagem tambem e um gesto de autonomia e cuidado.",
    "Cada presenca que chega soma memoria, voz e futuro ao que estamos construindo.",
    "Informar com clareza tambem e parte do respeito que sustenta qualquer experiencia transformadora.",
    "Seguimos com delicadeza, porque toda travessia merece acolhimento e escuta.",
    "Sua escolha de senha tambem e um gesto de autoria sobre o proprio caminho."
  ];
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
  const signupForm = document.querySelector("#signupForm");

  signupForm?.addEventListener("submit", handleSignupSubmit);
}

function hydrateUi() {
  setText("#projectName", `Cadastro do ${state.config.projectName}`);
  setText("#termsVersion", state.config.termsVersion);
  setText("#privacyNotice", state.config.privacyNoticeShort);
  updateTermsLink();
  updateProjectLink();
  updateSignupEmbed();
}

function parseTermsVersion(value) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-v(\d+)$/i);
  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    revision: Number(match[3])
  };
}

function compareTermsVersion(a, b) {
  const versionA = parseTermsVersion(a);
  const versionB = parseTermsVersion(b);

  if (!versionA || !versionB) return 0;
  if (versionA.year !== versionB.year) return versionA.year - versionB.year;
  if (versionA.month !== versionB.month) return versionA.month - versionB.month;
  return versionA.revision - versionB.revision;
}

function resolveTermsConfig(remoteVersion, remoteUrl) {
  const safeRemoteVersion = cleanValue(remoteVersion, DEFAULT_TERMS_VERSION);
  const safeRemoteUrl = cleanValue(remoteUrl, FALLBACK_TERMS_URL);
  const isOlderRemoteVersion = compareTermsVersion(safeRemoteVersion, DEFAULT_TERMS_VERSION) < 0;
  const isKnownLegacyUrl =
    safeRemoteUrl === "https://www.cordel2pontozero.com/s/Termos-Uso-Laboratorio-WEB-Cordel-20.pdf";

  if (isOlderRemoteVersion || isKnownLegacyUrl) {
    return {
      termsVersion: DEFAULT_TERMS_VERSION,
      termsUrl: FALLBACK_TERMS_URL
    };
  }

  return {
    termsVersion: safeRemoteVersion,
    termsUrl: safeRemoteUrl
  };
}

async function loadRemoteConfig() {
  if (!hasWebAppUrl()) {
    setText(
      "#termsStatus",
      "Configure a URL do Web App e do PDF em app.js para ativar a integracao completa."
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

    const resolvedTerms = resolveTermsConfig(data.termsVersion, data.termsUrl);

    state.config = {
      projectName: cleanValue(data.projectName, DEFAULT_PROJECT_NAME),
      termsVersion: resolvedTerms.termsVersion,
      termsUrl: resolvedTerms.termsUrl,
      privacyNoticeShort: cleanValue(data.privacyNoticeShort, DEFAULT_PRIVACY_NOTICE),
      projectUrl: cleanValue(data.projectUrl, DEFAULT_PROJECT_URL),
      labUrl: cleanValue(data.labUrl, DEFAULT_LAB_URL),
      checkinUrl: cleanValue(data.checkinUrl, DEFAULT_CHECKIN_URL),
      formPublishedUrl: cleanValue(data.formPublishedUrl, DEFAULT_FORM_PUBLISHED_URL),
      formEmbedUrl: cleanValue(data.formEmbedUrl, DEFAULT_FORM_EMBED_URL)
    };

    hydrateUi();
  } catch (error) {
    setText(
      "#termsStatus",
      "Nao foi possivel carregar a configuracao remota. O site segue com os valores locais."
    );
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
    showFeedback(feedback, "error", "Informe um email valido.");
    return;
  }

  if (!isValidBirthDate(dataAniversario)) {
    showFeedback(feedback, "error", "Use a data no formato dd/mm/aa ou dd/mm/aaaa.");
    return;
  }

  if (!instituicao) {
    showFeedback(feedback, "error", "Informe a instituicao ou escreva 'Nao se aplica'.");
    return;
  }

  if (!["SIM", "NAO"].includes(oficinasCordel)) {
    showFeedback(
      feedback,
      "error",
      "Informe se voce fez ou esta nas oficinas do Cordel 2.0."
    );
    return;
  }

  if (!isValidPhone(telefone)) {
    showFeedback(feedback, "error", "Informe telefone com DDD.");
    return;
  }

  if (!consentAccepted) {
    showFeedback(feedback, "error", "E necessario aceitar o consentimento informado.");
    return;
  }

  if (!hasWebAppUrl()) {
    showFeedback(
      feedback,
      "error",
      "A URL do Google Apps Script ainda nao foi configurada em app.js."
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
          ? "Ja existe um registro com este email. Voce ja pode usar esse email nos apps do laboratorio."
          : data?.message || "Nao foi possivel concluir o cadastro agora.";
      showFeedback(feedback, "error", message);
      return;
    }

    const successMessage =
      "Cadastro recebido com sucesso. Enviaremos as proximas orientacoes de acordo com o perfil informado.";

    showFeedback(feedback, "success", successMessage);
    form.reset();
    document.querySelector("#signupButton").disabled = true;
  } catch (error) {
    showFeedback(
      feedback,
      "error",
      "Falha de comunicacao com o servico. Tente novamente em instantes."
    );
  } finally {
    setLoading(button, false, "Cadastrar");
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

function updateTermsLink() {
  const link = document.querySelector("#termsLink");
  const attentionLink = document.querySelector("#attentionTermsLink");
  const status = document.querySelector("#termsStatus");
  const termsUrl = cleanValue(state.config.termsUrl, FALLBACK_TERMS_URL);
  const hasTermsUrl = hasUsableUrl(termsUrl);

  if (!link || !status) return;

  link.href = hasTermsUrl ? termsUrl : "#";
  link.setAttribute("aria-disabled", String(!hasTermsUrl));
  link.classList.toggle("is-disabled", !hasTermsUrl);

  if (attentionLink) {
    attentionLink.href = hasTermsUrl ? termsUrl : "#";
    attentionLink.setAttribute("aria-disabled", String(!hasTermsUrl));
    attentionLink.classList.toggle("is-disabled", !hasTermsUrl);
  }

  if (hasTermsUrl) {
    status.textContent = `Versao atual do termo: ${state.config.termsVersion}.`;
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
      "Preencha o formulario abaixo. Depois do envio, voce recebera as proximas orientacoes do laboratorio.";
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




