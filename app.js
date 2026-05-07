const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzuAybNf09Yaou4EslHRUqJMVXDrt0W8MxFM81cnYcGE5Bz36aJovDPvsbs3n5MRw1b/exec";
const FALLBACK_TERMS_URL = "https://www.cordel2pontozero.com/s/laboratorio_cordel_2_0_termos_referencias_ABRIL2026.pdf";
const DEFAULT_PROJECT_URL = "https://www.cordel2pontozero.com/";
const DEFAULT_LAB_URL = "https://cordel2pontozero.com/laboratorio";
const EDUCATOR_LAB_URL = "https://www.cordel2pontozero.com/lab-educador";
const EDUCATOR_LAB_LABEL = "Saiba mais sem cadastro";
const DEFAULT_CADASTRO_URL =
  typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : "";
const DEFAULT_PROJECT_NAME = "Laboratório Cordel 2.0";
const DEFAULT_TERMS_VERSION = "2026-04-v1";
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
    cadastroUrl: DEFAULT_CADASTRO_URL
  },
  quoteTimerId: null
};

document.addEventListener("DOMContentLoaded", () => {
  ensureEducatorFloatingLink();

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

function ensureEducatorFloatingLink() {
  if (!document.body) {
    return;
  }

  let link = document.getElementById("educatorFloatingLink");

  if (!link) {
    link = document.createElement("a");
    link.id = "educatorFloatingLink";
    link.className = "floating-educator-link";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
  }

  link.href = EDUCATOR_LAB_URL;
  link.textContent = EDUCATOR_LAB_LABEL;
  link.title = EDUCATOR_LAB_LABEL;
  link.setAttribute("aria-label", EDUCATOR_LAB_LABEL);
}

function handleBridgeRoute() {
  const currentUrl = new URL(window.location.href);
  const action = currentUrl.searchParams.get("action");
  const email = currentUrl.searchParams.get("email");
  const token = currentUrl.searchParams.get("token");

  if (action === "confirm" && email && token) {
    startConfirmationBridge(email, token);
    return true;
  }

  return false;
}

function startConfirmationBridge(email, token) {
  renderBridgeState({
    eyebrow: "Confirmação em andamento",
    title: "Validando seu email com cuidado",
    message:
      "Estamos confirmando seu acesso em ambiente seguro para preparar a próxima etapa do Laboratório Cordel 2.0.",
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
  ensureEducatorFloatingLink();
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
      eyebrow: "Confirmação indisponível",
      title: "Não foi possível validar o email",
      message:
        "O serviço de confirmação não respondeu corretamente. Tente novamente pelo link do email ou solicite um novo envio no cadastro.",
      quote: getBridgeQuote(1),
      actions: buildBridgeActions({
        primaryLabel: "Voltar ao cadastro",
        primaryUrl: state.config.cadastroUrl || DEFAULT_CADASTRO_URL,
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
  const safePayload = sanitizeConfirmationPayload(payload && typeof payload === "object" ? payload : {});

  renderBridgeState({
    eyebrow: safePayload.ok ? "Acesso preparado" : "Atenção",
    title: safePayload.title || "Confirmação de email",
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

function sanitizeConfirmationPayload(payload) {
  const safePayload = { ...payload };
  const textToInspect = [
    safePayload.title,
    safePayload.message,
    safePayload.primaryActionLabel,
    safePayload.primaryActionUrl,
    safePayload.redirectUrl
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  const legacyCredentialTerms = ["se" + "nha", "pass" + "word", "set_" + "pass" + "word"];
  const hasLegacyCredentialStep = legacyCredentialTerms.some((term) =>
    textToInspect.includes(term)
  );

  if (!hasLegacyCredentialStep) {
    return safePayload;
  }

  if (safePayload.ok === false) {
    return {
      ...safePayload,
      title: safePayload.title || "Link indisponível",
      message:
        "Este link não corresponde ao fluxo atual. Volte ao cadastro ou use o acesso indicado pelo aplicativo.",
      primaryActionLabel: "Voltar ao cadastro",
      primaryActionUrl: state.config.cadastroUrl || DEFAULT_CADASTRO_URL,
      secondaryActionLabel: "Conhecer o projeto",
      secondaryActionUrl: state.config.projectUrl || DEFAULT_PROJECT_URL
    };
  }

  return {
    ...safePayload,
    title: safePayload.title || "Email confirmado com sucesso",
    message:
      "Seu cadastro está ativo. Cada aplicativo validará seu acesso pelo email cadastrado.",
    primaryActionLabel: "Conhecer o laboratório",
    primaryActionUrl: state.config.labUrl || DEFAULT_LAB_URL,
    secondaryActionLabel: "Conhecer o projeto",
    secondaryActionUrl: state.config.projectUrl || DEFAULT_PROJECT_URL
  };
}

function submitWebAppForm(payload) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = WEB_APP_URL;
  form.acceptCharset = "UTF-8";
  form.style.display = "none";
  form.target = window.top && window.top !== window ? "_top" : "_self";

  Object.entries(payload || {}).forEach(([name, value]) => {
    if (value === undefined || value === null) return;
    addHiddenInput(form, name, String(value));
  });

  document.body.appendChild(form);
  form.submit();
}

function addHiddenInput(form, name, value) {
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = name;
  input.value = value;
  form.appendChild(input);
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
        options.secondaryUrl !== (state.config.cadastroUrl || DEFAULT_CADASTRO_URL)
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
    window.location.href = state.config.cadastroUrl || DEFAULT_CADASTRO_URL || DEFAULT_PROJECT_URL;
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
    "Entrar em um processo de aprendizagem também é um gesto de autonomia e cuidado.",
    "Cada presença que chega soma memória, voz e futuro ao que estamos construindo.",
    "Informar com clareza também é parte do respeito que sustenta qualquer experiência transformadora.",
    "Seguimos com delicadeza, porque toda travessia merece acolhimento e escuta.",
    "Validar seu email também protege o caminho que cada aplicativo vai abrir."
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
  const phoneCountryInput = document.querySelector("#signupPhoneCountry");
  const phoneCountryCustomInput = document.querySelector("#signupPhoneCountryCustom");
  const phoneInput = document.querySelector("#signupPhone");

  birthInput?.addEventListener("input", () => {
    birthInput.value = maskDate(birthInput.value);
  });

  const syncPhoneField = () => {
    const dialCode = resolvePhoneDialCode(
      phoneCountryInput?.value,
      phoneCountryCustomInput?.value
    );
    const usesCustomCode = phoneCountryInput?.value === "custom";
    const isBrazil = dialCode === "+55";

    if (phoneCountryCustomInput) {
      phoneCountryCustomInput.hidden = !usesCustomCode;
      phoneCountryCustomInput.disabled = !usesCustomCode;

      if (usesCustomCode) {
        phoneCountryCustomInput.value = dialCode || phoneCountryCustomInput.value || "+";
      } else {
        phoneCountryCustomInput.value = "";
      }
    }

    if (phoneInput) {
      phoneInput.maxLength = isBrazil ? 15 : 18;
      phoneInput.placeholder = isBrazil ? "(71) 99999-9999" : "650 555 1234";
      phoneInput.value = maskPhone(phoneInput.value, dialCode);
    }
  };

  phoneCountryInput?.addEventListener("change", syncPhoneField);
  phoneCountryCustomInput?.addEventListener("input", () => {
    phoneCountryCustomInput.value = normalizePhoneDialCode(phoneCountryCustomInput.value);
    syncPhoneField();
  });

  phoneInput?.addEventListener("input", () => {
    const dialCode = resolvePhoneDialCode(
      phoneCountryInput?.value,
      phoneCountryCustomInput?.value
    );
    phoneInput.value = maskPhone(phoneInput.value, dialCode);
  });

  syncPhoneField();
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
  updateSignupFormVisibility();
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
      cadastroUrl: cleanValue(data.cadastroUrl || data.checkinUrl, DEFAULT_CADASTRO_URL)
    };

    hydrateUi();
  } catch (error) {
    setText(
      "#termsStatus",
      "Não foi possível carregar a configuração remota. O site segue com os valores locais."
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
  const phoneDialCode = resolvePhoneDialCode(
    form.telefonePais?.value,
    form.telefonePaisCustom?.value
  );
  const telefoneLocal = maskPhone(form.telefone.value, phoneDialCode);
  const telefone = buildPhonePayload(phoneDialCode, telefoneLocal);

  form.dataAniversario.value = dataAniversario;
  form.telefone.value = telefoneLocal;
  if (form.telefonePaisCustom && form.telefonePais?.value === "custom") {
    form.telefonePaisCustom.value = phoneDialCode;
  }

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

  if (!isValidPhone(telefoneLocal, phoneDialCode)) {
    showFeedback(feedback, "error", "Informe telefone com código do país e número válido.");
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
    page: "cadastro",
    userAgent: navigator.userAgent
  };

  setLoading(button, true, "Cadastrando...");

  try {
    const data = await postJson(payload);

    if (!data?.ok) {
      const message =
        data?.code === "EMAIL_JA_CADASTRADO"
          ? "Já existe um registro com este email. Se precisar atualizar o acesso, use o fluxo indicado pelo aplicativo que solicitou cadastro."
          : data?.message || "Não foi possível concluir o cadastro agora.";
      showFeedback(feedback, "error", message);
      return;
    }

    const redirectUrl = cleanValue(data?.redirectUrl || data?.primaryActionUrl, "");

    showFeedback(
      feedback,
      "success",
      data?.message ||
        "Cadastro recebido com sucesso. Enviamos um email de confirmação. As boas-vindas serão enviadas depois que o email for confirmado."
    );
    form.reset();
    document.querySelector("#signupButton").disabled = true;
    if (redirectUrl) safeRedirect(redirectUrl);
  } catch (error) {
    showFeedback(
      feedback,
      "error",
      "Falha de comunicação com o serviço. Tente novamente em instantes."
    );
  } finally {
    setLoading(button, false, "Enviar cadastro");
  }
}

async function postJson(payload) {
  const response = await fetch(WEB_APP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(payload || {})
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
  const target = cleanValue(url, "");
  if (!target) return;

  window.setTimeout(() => {
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage(
          {
            type: "cordel-cadastro:navigate",
            href: target
          },
          "*"
        );
      } catch (error) {
        // Se postMessage falhar, segue para os fallbacks abaixo.
      }
    }

    try {
      if (window.top && window.top !== window) {
        window.top.location.href = target;
        return;
      }
    } catch (error) {
      // Se o navegador bloquear acesso ao topo, segue para os fallbacks abaixo.
    }

    try {
      window.open(target, "_top");
      return;
    } catch (error) {
      // Fallback final para navegacao na propria janela.
    }

    window.location.href = target;
  }, REDIRECT_DELAY_MS);
}

function hasLabAccessRedirect(url) {
  const target = cleanValue(url, "");
  if (!target) return false;

  try {
    const parsed = new URL(target, window.location.origin);
    return parsed.searchParams.has("access_token");
  } catch (error) {
    return false;
  }
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

function updateSignupFormVisibility() {
  const signupForm = document.querySelector("#signupForm");

  if (signupForm) {
    signupForm.hidden = false;
  }
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

function normalizePhoneDialCode(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 4);
  return digits ? `+${digits}` : "";
}

function resolvePhoneDialCode(selectedValue, customValue) {
  if (String(selectedValue || "").trim() === "custom") {
    return normalizePhoneDialCode(customValue);
  }

  return normalizePhoneDialCode(selectedValue || "+55");
}

function buildPhonePayload(dialCode, localPhone) {
  const safeDialCode = normalizePhoneDialCode(dialCode || "+55");
  const localDigits = String(localPhone || "").replace(/\D/g, "");

  if (!safeDialCode || !localDigits) return localDigits;
  return `${safeDialCode} ${localDigits}`;
}

function maskPhone(value, dialCode = "+55") {
  const digits = String(value || "").replace(/\D/g, "");

  if (dialCode === "+55") {
    const localDigits = digits.slice(0, 11);

    if (localDigits.length <= 2) return localDigits ? `(${localDigits}` : "";
    if (localDigits.length <= 6) return `(${localDigits.slice(0, 2)}) ${localDigits.slice(2)}`;
    if (localDigits.length <= 10) {
      return `(${localDigits.slice(0, 2)}) ${localDigits.slice(2, 6)}-${localDigits.slice(6)}`;
    }
    return `(${localDigits.slice(0, 2)}) ${localDigits.slice(2, 7)}-${localDigits.slice(7)}`;
  }

  const localDigits = digits.slice(0, 15);
  if (localDigits.length <= 3) return localDigits;
  if (localDigits.length <= 7) return `${localDigits.slice(0, 3)} ${localDigits.slice(3)}`;
  if (localDigits.length <= 11) {
    return `${localDigits.slice(0, 3)} ${localDigits.slice(3, 7)} ${localDigits.slice(7)}`;
  }
  return `${localDigits.slice(0, 3)} ${localDigits.slice(3, 7)} ${localDigits.slice(7, 11)} ${localDigits.slice(11)}`;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isValidPhone(value, dialCode = "+55") {
  const localDigits = String(value || "").replace(/\D/g, "");
  const dialDigits = String(dialCode || "").replace(/\D/g, "");
  const totalDigits = `${dialDigits}${localDigits}`;

  if (!dialDigits) return false;
  if (dialCode === "+55") {
    return localDigits.length >= 10 && localDigits.length <= 11;
  }

  return localDigits.length >= 6 && totalDigits.length >= 8 && totalDigits.length <= 15;
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
