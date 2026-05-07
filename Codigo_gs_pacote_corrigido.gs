const LAB_CFG = {
  PROPERTIES: {
    SPREADSHEET_ID: 'LAB_CHECKIN_SPREADSHEET_ID'
  },
  SHEETS: {
    SETTINGS: 'SETTINGS',
    USERS: 'USERS',
    ALLOWLIST: 'ALLOWLIST',
    CONSENT_LOG: 'CONSENT_LOG',
    ACCESS_LOG: 'ACCESS_LOG'
  },
  DEFAULTS: {
    SPREADSHEET_ID: '',
    PROJECT_NAME: 'Laboratório Cordel 2.0',
    TERMS_VERSION: '2026-04-v1',
    TERMS_URL: 'https://www.cordel2pontozero.com/s/laboratorio_cordel_2_0_termos_referencias_ABRIL2026.pdf',
    PRIVACY_NOTICE_SHORT: 'Coletamos dados mínimos de identificação, acesso e participação para o funcionamento ético e organizado do Laboratório Cordel 2.0.',
    PROJECT_URL: 'https://www.cordel2pontozero.com/',
    LAB_URL: 'https://cordel2pontozero.com/laboratorio',
    CHECKIN_URL: 'https://cadastro.cordel2pontozero.com/',
    WEB_APP_URL: '',
    PROJECT_TIME_ZONE: 'America/Sao_Paulo',
    LAB_ACCESS_TOKEN_TTL_MINUTES: '10',
    LAB_BROWSER_SESSION_TTL_MINUTES: '240',
    TOKEN_HOUSEKEEPING_INTERVAL_MINUTES: '180',
    BACKUP_FOLDER_ID: ''
  }
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Administração Cadastro')
    .addItem('Apagar cadastro por email', 'abrirPromptApagarCadastroPorEmail')
    .addSeparator()
    .addItem('Testar email adulto', 'testarEmailBoasVindasAdulto')
    .addItem('Testar email menor', 'testarEmailBoasVindasMenor')
    .addToUi();
}

function onInstall() {
  onOpen();
}

function getUsersSheetHeaders_() {
  return [
    'user_id', 'created_at', 'updated_at', 'status', 'nome', 'email', 'faixa_etaria_cadastro',
    'is_minor', 'instituicao', 'oficinas_cordel', 'phone_hash', 'phone_last4',
    'consent_current_version', 'consent_current_at', 'source_page', 'signup_source',
    'signup_at', 'email_confirmed_at', 'email_confirmation_token', 'email_confirmation_sent_at',
    'welcome_email_template',
    'welcome_email_sent_at', 'notes'
  ];
}

// =====================================================================
// FUNÇÃO DE EMERGÊNCIA: RODE ESTA FUNÇÃO UMA VEZ NO PAINEL
// =====================================================================
function CONSERTAR_CABECALHOS_AGORA() {
  const ss = SpreadsheetApp.openById(LAB_CFG.DEFAULTS.SPREADSHEET_ID);
  const sh = ss.getSheetByName(LAB_CFG.SHEETS.USERS);
  const correctHeaders = getUsersSheetHeaders_();
  
  // Limpa APENAS a linha 1 (cabeçalhos bagunçados), preservando todos os dados abaixo
  sh.getRange("1:1").clearContent();
  
  // Escreve os cabeçalhos perfeitos
  sh.getRange(1, 1, 1, correctHeaders.length).setValues([correctHeaders]);
  
  return "Cabeçalhos consertados com sucesso! O sistema já pode ler os emails novamente.";
}
// =====================================================================

function doGet(e) { return handleRequest_(e, 'GET'); }
function doPost(e) { return handleRequest_(e, 'POST'); }

function handleRequest_(e, method) {
  let payload = {};
  try {
    payload = parsePayload_(e, method);
    const action = String(payload.action || '').trim();

    if (!action) return jsonOut_({ ok: false, code: 'MISSING_ACTION', message: 'Ação não informada.' });

    if (action === 'config') return getConfig_();
    if (action === 'confirm') return confirmEmail_(payload);
    if (action === 'confirm_jsonp') return confirmEmailJsonp_(payload);
    if (action === 'validate_lab_access_jsonp') return validateLabAccessJsonp_(payload);
    if (action === 'validate_email_access') return validateEmailAccess_(payload);
    if (action === 'validate_email_access_jsonp') return validateEmailAccessJsonp_(payload);
    if (action === 'signup') return signup_(payload);
    if (action === 'login') return login_(payload);
    if (action === 'login_jsonp') return loginJsonp_(payload);

    return jsonOut_({ ok: false, code: 'INVALID_ACTION', message: 'Ação inválida.' });
  } catch (err) {
    const errorPayload = { ok: false, code: 'SERVER_ERROR', message: String(err) };
    if (String(payload.callback || '').trim()) return jsonpOut_(payload.callback, errorPayload);
    return jsonOut_(errorPayload);
  }
}

function setupLabCheckin() {
  const ss = getLabSpreadsheet_(true);
  createSheetIfMissing_(ss, LAB_CFG.SHEETS.SETTINGS, ['key', 'value']);
  createSheetIfMissing_(ss, LAB_CFG.SHEETS.USERS, getUsersSheetHeaders_());
  createSheetIfMissing_(ss, LAB_CFG.SHEETS.ALLOWLIST, ['email', 'status', 'notes', 'created_at']);
  createSheetIfMissing_(ss, LAB_CFG.SHEETS.CONSENT_LOG, ['log_id', 'timestamp', 'event_type', 'user_id', 'email', 'terms_version', 'consent_accepted', 'page', 'source', 'user_agent', 'notes']);
  createSheetIfMissing_(ss, LAB_CFG.SHEETS.ACCESS_LOG, ['log_id', 'timestamp', 'event_type', 'email', 'result', 'reason', 'page', 'source', 'user_agent', 'notes']);
  
  seedSettings_(ss);
  syncCriticalSettings_(ss);
  clearLegacyFormSettings_(ss);
  cleanupLegacySignupFormTriggers_();
  formatSheets_(ss);
  const housekeeping = runTokenHousekeeping_(ss, readSettingsMap_(ss), true);
  return 'Setup concluído. Planilha: ' + ss.getUrl();
}

function resetPlanilhaCheckin() {
  const ss = getLabSpreadsheet_(false);
  const settings = readSettingsMap_(ss);
  const backupSheets = [ss.getSheetByName(LAB_CFG.SHEETS.USERS), ss.getSheetByName(LAB_CFG.SHEETS.CONSENT_LOG), ss.getSheetByName(LAB_CFG.SHEETS.ACCESS_LOG)];
  const backupFolder = getOrCreateBackupFolder_(settings, ss);
  const backupFiles = backupSheetsAsCsv_(ss, backupSheets, backupFolder);
  backupSheets.forEach(function(sh) { clearSheetDataRows_(sh); });
  return 'Reset concluído. Backups CSV salvos em: ' + backupFolder.getUrl();
}

function restaurarUltimoBackupCheckin() {
  const ss = getLabSpreadsheet_(false);
  const settings = readSettingsMap_(ss);
  const folder = getOrCreateBackupFolder_(settings, ss);
  const targetSheets = [LAB_CFG.SHEETS.USERS, LAB_CFG.SHEETS.CONSENT_LOG, LAB_CFG.SHEETS.ACCESS_LOG];
  const restored = [];
  targetSheets.forEach(function(sheetName) {
    const file = findLatestBackupFileForSheet_(folder, ss.getName(), sheetName);
    if (!file) return;
    const csv = file.getBlob().getDataAsString('UTF-8');
    const rows = Utilities.parseCsv(csv);
    const sh = ss.getSheetByName(sheetName);
    if (!sh || !rows.length) return;
    clearSheetDataRows_(sh);
    if (rows.length > 1) sh.getRange(2, 1, rows.length - 1, rows[1].length).setValues(rows.slice(1));
    restored.push(sheetName);
  });
  if (!restored.length) return 'Nenhum backup CSV compatível foi encontrado.';
  return 'Restauração concluída para: ' + restored.join(', ') + '.';
}

function seedSettings_(ss) {
  const sh = ss.getSheetByName(LAB_CFG.SHEETS.SETTINGS);
  const existing = readSettingsMap_(ss);
  const defaults = {
    PROJECT_NAME: LAB_CFG.DEFAULTS.PROJECT_NAME, TERMS_VERSION: LAB_CFG.DEFAULTS.TERMS_VERSION,
    TERMS_URL: LAB_CFG.DEFAULTS.TERMS_URL, PRIVACY_NOTICE_SHORT: LAB_CFG.DEFAULTS.PRIVACY_NOTICE_SHORT,
    PROJECT_URL: LAB_CFG.DEFAULTS.PROJECT_URL, LAB_URL: LAB_CFG.DEFAULTS.LAB_URL,
    CHECKIN_URL: LAB_CFG.DEFAULTS.CHECKIN_URL, WEB_APP_URL: LAB_CFG.DEFAULTS.WEB_APP_URL,
    PROJECT_TIME_ZONE: LAB_CFG.DEFAULTS.PROJECT_TIME_ZONE, LAB_ACCESS_TOKEN_TTL_MINUTES: LAB_CFG.DEFAULTS.LAB_ACCESS_TOKEN_TTL_MINUTES,
    LAB_BROWSER_SESSION_TTL_MINUTES: LAB_CFG.DEFAULTS.LAB_BROWSER_SESSION_TTL_MINUTES, TOKEN_HOUSEKEEPING_INTERVAL_MINUTES: LAB_CFG.DEFAULTS.TOKEN_HOUSEKEEPING_INTERVAL_MINUTES,
    BACKUP_FOLDER_ID: LAB_CFG.DEFAULTS.BACKUP_FOLDER_ID
  };
  const rowsToAppend = [];
  Object.keys(defaults).forEach(function(key) { if (!existing[key]) rowsToAppend.push([key, defaults[key]]); });
  if (rowsToAppend.length) sh.getRange(sh.getLastRow() + 1, 1, rowsToAppend.length, 2).setValues(rowsToAppend);
}

function syncCriticalSettings_(ss) {
  upsertSetting_(ss, 'PROJECT_URL', LAB_CFG.DEFAULTS.PROJECT_URL);
  upsertSetting_(ss, 'LAB_URL', LAB_CFG.DEFAULTS.LAB_URL);
  upsertSetting_(ss, 'CHECKIN_URL', LAB_CFG.DEFAULTS.CHECKIN_URL);
  upsertSetting_(ss, 'WEB_APP_URL', LAB_CFG.DEFAULTS.WEB_APP_URL);
  upsertSetting_(ss, 'PROJECT_TIME_ZONE', LAB_CFG.DEFAULTS.PROJECT_TIME_ZONE);
  upsertSetting_(ss, 'TERMS_VERSION', LAB_CFG.DEFAULTS.TERMS_VERSION);
  upsertSetting_(ss, 'TERMS_URL', LAB_CFG.DEFAULTS.TERMS_URL);
  upsertSetting_(ss, 'TOKEN_HOUSEKEEPING_INTERVAL_MINUTES', LAB_CFG.DEFAULTS.TOKEN_HOUSEKEEPING_INTERVAL_MINUTES);
}

function syncCriticalSettings() {
  const ss = getLabSpreadsheet_(true);
  syncCriticalSettings_(ss);
  return 'Configurações críticas sincronizadas com sucesso.';
}

function formatSheets_(ss) {
  Object.keys(LAB_CFG.SHEETS).forEach(function(k) {
    const sh = ss.getSheetByName(LAB_CFG.SHEETS[k]);
    if (!sh) return;
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
    sh.autoResizeColumns(1, sh.getLastColumn());
  });
}

function getProjectTimeZone_(settings) { return cleanText_(settings && settings.PROJECT_TIME_ZONE) || cleanText_(LAB_CFG.DEFAULTS.PROJECT_TIME_ZONE) || cleanText_(Session.getScriptTimeZone()) || 'America/Sao_Paulo'; }
function getLocalIsoDate_(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value);
  if (String(date) === 'Invalid Date') return '';
  return Utilities.formatDate(date, timeZone || getProjectTimeZone_(), 'yyyy-MM-dd');
}
function parseIsoDateParts_(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}
function normalizeAgeBracket_(value) {
  const text = String(value || '').trim().toUpperCase();
  if (text === 'MENOR') return 'MENOR';
  if (text === 'MAIOR' || text === 'ADULTO') return 'MAIOR';
  return '';
}
function normalizeBooleanCellValue_(value) {
  if (value === true) return true;
  if (value === false) return false;
  const text = String(value || '').trim().toUpperCase();
  if (text === 'TRUE' || text === '1' || text === 'SIM' || text === 'YES') return true;
  if (text === 'FALSE' || text === '0' || text === 'NAO' || text === 'NÃO' || text === 'NO') return false;
  return '';
}
function getWelcomeTemplateFromBracket_(faixaEtaria) {
  const normalized = normalizeAgeBracket_(faixaEtaria);
  if (normalized === 'MENOR') return 'menor';
  if (normalized === 'MAIOR') return 'adulto';
  return '';
}
function calculateAgeAtIsoDate_(birthIso, referenceIso) {
  const birth = parseIsoDateParts_(birthIso);
  const reference = parseIsoDateParts_(referenceIso);
  if (!birth || !reference) return null;
  let age = reference.year - birth.year;
  const beforeBirthday = reference.month < birth.month || (reference.month === birth.month && reference.day < birth.day);
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}
function classifyBirthDateAtReference_(birthIso, referenceIso) {
  const age = calculateAgeAtIsoDate_(birthIso, referenceIso);
  if (age == null) return null;
  const isMinor = age < 18;
  const faixaEtaria = isMinor ? 'MENOR' : 'MAIOR';
  return { age: age, isMinor: isMinor, faixaEtaria: faixaEtaria, welcomeTemplate: getWelcomeTemplateFromBracket_(faixaEtaria) };
}
function getReferenceIsoDateFromValue_(value, timeZone) {
  if (!value) return '';
  if (value instanceof Date && String(value) !== 'Invalid Date') return getLocalIsoDate_(value, timeZone);
  const text = cleanText_(value);
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (String(parsed) === 'Invalid Date') return '';
  return getLocalIsoDate_(parsed, timeZone);
}
function buildSignupAudienceProfile_(settings, birthIso, referenceDate) {
  const referenceIso = getReferenceIsoDateFromValue_(referenceDate || new Date(), getProjectTimeZone_(settings));
  if (!referenceIso) return null;
  const classification = classifyBirthDateAtReference_(birthIso, referenceIso);
  if (!classification) return null;
  classification.referenceIso = referenceIso;
  return classification;
}
function appendObjectRow_(sh, fieldMap) {
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues().map(function(value) { return String(value || '').trim(); });
  const row = headers.map(function(header) { return Object.prototype.hasOwnProperty.call(fieldMap, header) ? fieldMap[header] : ''; });
  sh.appendRow(row);
}

// ATENÇÃO: Esta função foi simplificada para não tentar reescrever planilhas corrompidas.
function ensureUsersSheetSchema_(ss, settings) {
  const sh = ss.getSheetByName(LAB_CFG.SHEETS.USERS);
  const desiredHeaders = getUsersSheetHeaders_();
  if (!sh) {
    createSheetIfMissing_(ss, LAB_CFG.SHEETS.USERS, desiredHeaders);
    return;
  }
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, desiredHeaders.length).setValues([desiredHeaders]);
  }
}

function clearLegacyFormSettings_(ss) {
  ['FORM_ID', 'FORM_PUBLISHED_URL', 'FORM_EMBED_URL'].forEach(function(key) { upsertSetting_(ss, key, ''); });
}
function cleanupLegacySignupFormTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'onSignupFormSubmit') ScriptApp.deleteTrigger(trigger);
  });
}
function resolveLabUrl_(settings) {
  const url = cleanText_(settings && settings.LAB_URL);
  if (!url || url === 'https://www.cordel2pontozero.com/laboratorio') return LAB_CFG.DEFAULTS.LAB_URL;
  return url;
}
function resolveCadastroUrl_(settings) {
  const url = cleanText_(settings && settings.CHECKIN_URL);
  if (!url || url === 'https://www.cordel2pontozero.com/checkin') return LAB_CFG.DEFAULTS.CHECKIN_URL;
  return url;
}
function getConfig_() {
  const ss = getLabSpreadsheet_(false);
  const settings = readSettingsMap_(ss);
  runTokenHousekeeping_(ss, settings, false);
  return jsonOut_({
    ok: true, projectName: settings.PROJECT_NAME || LAB_CFG.DEFAULTS.PROJECT_NAME,
    termsVersion: settings.TERMS_VERSION || LAB_CFG.DEFAULTS.TERMS_VERSION,
    termsUrl: settings.TERMS_URL || LAB_CFG.DEFAULTS.TERMS_URL,
    privacyNoticeShort: settings.PRIVACY_NOTICE_SHORT || LAB_CFG.DEFAULTS.PRIVACY_NOTICE_SHORT,
    projectUrl: settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL,
    labUrl: resolveLabUrl_(settings), cadastroUrl: resolveCadastroUrl_(settings), checkinUrl: resolveCadastroUrl_(settings)
  });
}

function issueLabAccessToken_(settings, email, userId) {
  const props = PropertiesService.getScriptProperties();
  const now = new Date();
  const ttlMinutes = readPositiveIntegerSetting_(settings.LAB_ACCESS_TOKEN_TTL_MINUTES, 10, 3);
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
  const rawToken = generateId_('LAB') + generateId_('TOK');
  const hashedToken = sha256_(rawToken);
  props.setProperty('LAB_ACCESS_TOKEN_' + hashedToken, JSON.stringify({ email: cleanText_(email), userId: cleanText_(userId), createdAt: now.toISOString(), expiresAt: expiresAt.toISOString() }));
  return { token: rawToken, expiresAt: expiresAt };
}

function buildLabEntryUrl_(settings, token) {
  const baseUrl = resolveLabUrl_(settings);
  const sep = baseUrl.indexOf('?') >= 0 ? '&' : '?';
  return baseUrl + sep + 'access_token=' + encodeURIComponent(token);
}

function housekeepingTokensCheckin() {
  const ss = getLabSpreadsheet_(false);
  const settings = readSettingsMap_(ss);
  const summary = runTokenHousekeeping_(ss, settings, true);
  return 'Housekeeping concluído: lab_tokens_removidos=' + summary.labTokensRemoved + '; lab_tokens_corrompidos=' + summary.labTokensCorrupted + '.';
}

function runTokenHousekeeping_(ss, settings, force) {
  const props = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  const now = new Date();
  const intervalMinutes = readPositiveIntegerSetting_(settings.TOKEN_HOUSEKEEPING_INTERVAL_MINUTES, 180, 15);
  const lastRunAt = cleanText_(props.getProperty('LAB_TOKEN_HOUSEKEEPING_LAST_AT'));

  if (!force && lastRunAt && !isExpiredDateValue_(new Date(new Date(lastRunAt).getTime() + intervalMinutes * 60 * 1000))) {
    return { ok: true, skipped: true, reason: 'NOT_DUE', labTokensRemoved: 0, labTokensCorrupted: 0 };
  }

  if (!lock.tryLock(5000)) return { ok: false, skipped: true, reason: 'LOCKED', labTokensRemoved: 0, labTokensCorrupted: 0 };

  try {
    let labTokensRemoved = 0, labTokensCorrupted = 0;
    const allProperties = props.getProperties();

    Object.keys(allProperties).forEach(function(key) {
      if (key.indexOf('LAB_ACCESS_TOKEN_') !== 0) return;
      const raw = allProperties[key];
      try {
        const record = JSON.parse(raw);
        if (!record || isExpiredDateValue_(record.expiresAt)) {
          props.deleteProperty(key);
          labTokensRemoved++;
        }
      } catch (err) {
        props.deleteProperty(key);
        labTokensCorrupted++;
      }
    });

    props.setProperty('LAB_TOKEN_HOUSEKEEPING_LAST_AT', now.toISOString());
    return { ok: true, skipped: false, reason: 'RUN', labTokensRemoved: labTokensRemoved, labTokensCorrupted: labTokensCorrupted };
  } finally { lock.releaseLock(); }
}

function validateLabAccessJsonp_(payload) {
  const ss = getLabSpreadsheet_(false);
  const settings = readSettingsMap_(ss);
  const callback = sanitizeJsonpCallback_(payload.callback);
  const result = processValidateLabAccessPayload_(ss, settings, payload);
  return ContentService.createTextOutput(callback + '(' + JSON.stringify(result) + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function processValidateLabAccessPayload_(ss, settings, payload) {
  runTokenHousekeeping_(ss, settings, false);
  const token = cleanText_(payload.token);
  const page = cleanText_(payload.page || 'laboratório');
  const userAgent = cleanText_(payload.userAgent || '');

  if (!token) return { ok: false, code: 'TOKEN_OBRIGATORIO', message: 'O acesso ao laboratório precisa de um token valido.' };

  const props = PropertiesService.getScriptProperties();
  const hashedToken = sha256_(token);
  const propertyKey = 'LAB_ACCESS_TOKEN_' + hashedToken;
  const raw = props.getProperty(propertyKey);

  if (!raw) return { ok: false, code: 'TOKEN_INVALIDO', message: 'Este link de acesso não está mais disponível. Volte ao cadastro para gerar um novo.' };

  let record = null;
  try { record = JSON.parse(raw); } catch (err) {
    props.deleteProperty(propertyKey);
    return { ok: false, code: 'TOKEN_INVALIDO', message: 'Não foi possível validar este acesso. Gere um novo link pelo cadastro.' };
  }

  if (isExpiredDateValue_(record.expiresAt)) {
    props.deleteProperty(propertyKey);
    return { ok: false, code: 'TOKEN_EXPIRADO', message: 'Este link de acesso expirou. Gere um novo acesso pelo cadastro.' };
  }

  props.deleteProperty(propertyKey);
  logAccess_(ss, 'lab_access', cleanText_(record.email), 'ALLOWED', 'OK', page, 'site', userAgent, 'token_ref=' + tokenFingerprint_(token));
  return { ok: true, code: 'LAB_ACCESS_OK', message: 'Acesso ao laboratório validado.', email: cleanText_(record.email), sessionTtlMinutes: readPositiveIntegerSetting_(settings.LAB_BROWSER_SESSION_TTL_MINUTES, 240, 30) };
}

function login_(payload) {
  const ss = getLabSpreadsheet_(false);
  const settings = readSettingsMap_(ss);
  ensureUsersSheetSchema_(ss, settings);
  const result = processLoginJsonpPayload_(ss, settings, payload);
  const content = result.ok
    ? { ok: true, title: 'Acesso confirmado', message: 'Seu acesso foi validado com sucesso. Estamos preparando sua entrada segura no laboratório.', primaryActionLabel: 'Ir para o laboratório', primaryActionUrl: cleanText_(result.redirectUrl), secondaryActionLabel: 'Voltar ao cadastro', secondaryActionUrl: cleanText_(settings.CHECKIN_URL || LAB_CFG.DEFAULTS.CHECKIN_URL), closeLabel: 'Fechar janela' }
    : { ok: false, title: 'Não foi possível entrar', message: cleanText_(result.message || 'Revise seus dados e tente novamente.'), primaryActionLabel: 'Voltar ao cadastro', primaryActionUrl: cleanText_(settings.CHECKIN_URL || LAB_CFG.DEFAULTS.CHECKIN_URL), secondaryActionLabel: 'Conhecer o projeto', secondaryActionUrl: cleanText_(settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL), closeLabel: 'Fechar janela' };
  return accessResultPage_(content, settings);
}

function loginJsonp_(payload) {
  const ss = getLabSpreadsheet_(false);
  const settings = readSettingsMap_(ss);
  ensureUsersSheetSchema_(ss, settings);
  const callback = sanitizeJsonpCallback_(payload.callback);
  const result = processLoginJsonpPayload_(ss, settings, payload);
  return ContentService.createTextOutput(callback + '(' + JSON.stringify(result) + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function validateEmailAccess_(payload) {
  const ss = getLabSpreadsheet_(false);
  const settings = readSettingsMap_(ss);
  ensureUsersSheetSchema_(ss, settings);
  return jsonOut_(processLoginJsonpPayload_(ss, settings, payload));
}

function validateEmailAccessJsonp_(payload) {
  const ss = getLabSpreadsheet_(false);
  const settings = readSettingsMap_(ss);
  ensureUsersSheetSchema_(ss, settings);
  const callback = sanitizeJsonpCallback_(payload.callback);
  const result = processLoginJsonpPayload_(ss, settings, payload);
  return ContentService.createTextOutput(callback + '(' + JSON.stringify(result) + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function processLoginJsonpPayload_(ss, settings, payload) {
  runTokenHousekeeping_(ss, settings, false);
  const email = normalizeEmail_(payload.email);
  const consentAccepted = toBoolean_(payload.consentAccepted);
  const termsVersion = String(payload.termsVersion || settings.TERMS_VERSION || '').trim();
  const page = String(payload.page || 'cadastro').trim();
  const userAgent = String(payload.userAgent || '').trim();

  if (!email) return { ok: false, code: 'EMAIL_INVALIDO', message: 'Informe um email válido.' };

  const userRecord = findUserByEmail_(ss, email);
  const allowRecord = findAllowlistedEmail_(ss, email);
  if (!userRecord && !allowRecord) return { ok: false, code: 'EMAIL_NAO_AUTORIZADO', message: 'Este email não foi encontrado. Você pode realizar o cadastro para solicitar acesso.' };

  if (userRecord) {
    const status = String(userRecord.status || '').toUpperCase();
    if (status === 'PENDING_EMAIL') return { ok: false, code: 'EMAIL_NAO_CONFIRMADO', message: 'Seu cadastro foi recebido, mas o email ainda não foi confirmado. Verifique sua caixa de entrada.' };
    if (status !== 'ACTIVE') return { ok: false, code: 'USUARIO_INATIVO', message: 'Seu cadastro existe, mas não está ativo no momento.' };
  }

  if (consentAccepted) {
    logConsent_(ss, 'email_access', userRecord ? userRecord.user_id : '', email, termsVersion, true, page, 'app', userAgent, 'Consentimento no fluxo de acesso por email');
  }
  const labAccess = issueLabAccessToken_(settings, email, userRecord ? userRecord.user_id : '');
  const redirectUrl = buildLabEntryUrl_(settings, labAccess.token);
  logAccess_(ss, 'email_access', email, 'ALLOWED', 'OK', page, 'app', userAgent, 'redirect_url=' + redirectUrl);
  
  return { ok: true, code: 'EMAIL_ACCESS_OK', message: 'Email validado com sucesso.', redirectUrl: redirectUrl, userType: userRecord ? 'registered' : 'allowlisted' };
}

function signup_(payload) {
  const ss = getLabSpreadsheet_(false);
  const settings = readSettingsMap_(ss);
  ensureUsersSheetSchema_(ss, settings);
  return jsonOut_(processSignupPayload_(ss, settings, payload, 'native_cadastro_form'));
}

function confirmEmail_(payload) {
  const result = processConfirmEmail_(payload);
  return confirmationPage_(result.content, result.settings);
}

function confirmEmailJsonp_(payload) {
  const result = processConfirmEmail_(payload);
  const callback = sanitizeJsonpCallback_(payload.callback);
  return ContentService.createTextOutput(callback + '(' + JSON.stringify(result.content) + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function processConfirmEmail_(payload) {
  const ss = getLabSpreadsheet_(false);
  const settings = readSettingsMap_(ss);
  ensureUsersSheetSchema_(ss, settings);
  runTokenHousekeeping_(ss, settings, false);
  const email = normalizeEmail_(payload.email);
  const token = cleanText_(payload.token);
  const page = cleanText_(payload.page || 'email_confirmation');

  if (!email || !token) return { settings: settings, content: { ok: false, title: 'Link de confirmação inválido', message: 'O link de confirmação está incompleto ou expirado. Volte ao cadastro e solicite novo envio.', primaryActionLabel: 'Voltar ao cadastro', primaryActionUrl: settings.CHECKIN_URL || LAB_CFG.DEFAULTS.CHECKIN_URL, secondaryActionLabel: 'Conhecer o projeto', secondaryActionUrl: settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL, closeLabel: 'Fechar janela' } };

  const userRecord = findUserByEmail_(ss, email);
  if (!userRecord) return { settings: settings, content: { ok: false, title: 'Cadastro não encontrado', message: 'Não localizamos um cadastro compatível com esse link. Você pode realizar um novo cadastro na página de cadastro.', primaryActionLabel: 'Voltar ao cadastro', primaryActionUrl: settings.CHECKIN_URL || LAB_CFG.DEFAULTS.CHECKIN_URL, secondaryActionLabel: 'Conhecer o projeto', secondaryActionUrl: settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL, closeLabel: 'Fechar janela' } };

  if (String(userRecord.status || '').toUpperCase() === 'ACTIVE' && cleanText_(userRecord.email_confirmed_at)) {
    return { settings: settings, content: { ok: true, title: 'Email já confirmado', message: 'Seu email já foi confirmado anteriormente. Cada aplicativo validará seu acesso pelo email cadastrado.', primaryActionLabel: 'Conhecer o laboratório', primaryActionUrl: resolveLabUrl_(settings), secondaryActionLabel: 'Conhecer o projeto', secondaryActionUrl: settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL, closeLabel: 'Fechar janela' } };
  }

  if (cleanText_(userRecord.email_confirmation_token) !== token) {
    return { settings: settings, content: { ok: false, title: 'Token de confirmação inválido', message: 'Este link não corresponde ao cadastro atual. Solicite um novo email de confirmação na página de cadastro.', primaryActionLabel: 'Voltar ao cadastro', primaryActionUrl: settings.CHECKIN_URL || LAB_CFG.DEFAULTS.CHECKIN_URL, secondaryActionLabel: 'Conhecer o projeto', secondaryActionUrl: settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL, closeLabel: 'Fechar janela' } };
  }

  const now = new Date();
  updateUserFields_(ss, userRecord._rowNumber, { updated_at: now, status: 'ACTIVE', email_confirmed_at: now, email_confirmation_token: '', notes: 'Email confirmado com sucesso.' });

  if (!cleanText_(userRecord.welcome_email_sent_at)) {
    try {
      const welcomeTemplate = resolveWelcomeEmailTemplate_(userRecord);
      if (welcomeTemplate) {
        sendWelcomeEmail_(settings, email, userRecord.nome, welcomeTemplate);
        updateUserFields_(ss, userRecord._rowNumber, { updated_at: new Date(), welcome_email_template: welcomeTemplate, welcome_email_sent_at: new Date() });
      }
    } catch (err) {}
  }

  return { settings: settings, content: { ok: true, title: 'Email confirmado com sucesso', message: 'Seu cadastro está ativo. Cada aplicativo validará seu acesso pelo email cadastrado.', primaryActionLabel: 'Conhecer o laboratório', primaryActionUrl: resolveLabUrl_(settings), secondaryActionLabel: 'Conhecer o projeto', secondaryActionUrl: settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL, closeLabel: 'Fechar janela' } };
}

function sendConfirmationEmail_(settings, email, nome, token) {
  const projectName = settings.PROJECT_NAME || LAB_CFG.DEFAULTS.PROJECT_NAME;
  const projectUrl = settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL;
  const confirmationUrl = buildConfirmationUrl_(settings, email, token);
  const participantName = cleanText_(nome) || 'participante';
  const subject = projectName + ' | Confirme seu email para ativar o acesso';
  const plainBody = [
    'Olá, ' + participantName + '!',
    '',
    'Recebemos seu cadastro no ' + projectName + '.',
    'Para ativar seu acesso com segurança, confirme seu email pelo link abaixo:',
    confirmationUrl,
    '',
    'Depois da confirmação, seu cadastro ficará ativo para validação por email nos aplicativos do projeto.'
  ].join('\n');
  const htmlBody = buildEmailCardHtml_(settings, {
    eyebrow: 'Confirmação de email',
    title: 'Seu acesso está quase pronto',
    greeting: 'Olá, ' + participantName + '.',
    paragraphs: [
      'Recebemos seu cadastro no ' + projectName + ' e deixamos seu acesso preparado para a próxima etapa.',
      'Para ativar seu cadastro com segurança, confirme seu email no botão abaixo.',
      'Depois da confirmação, os aplicativos do projeto validarão seu acesso pelo email cadastrado.'
    ],
    primaryLabel: 'Confirmar meu email',
    primaryUrl: confirmationUrl,
    secondaryLabel: 'Conhecer o projeto',
    secondaryUrl: projectUrl,
    footerText: 'Se o botão não abrir, você pode usar o link direto exibido no corpo do email.'
  });
  MailApp.sendEmail({ to: email, subject: subject, body: plainBody, htmlBody: htmlBody, name: projectName });
}

function resolveWelcomeEmailTemplate_(userRecord) {
  const explicitTemplate = cleanText_(userRecord && userRecord.welcome_email_template).toLowerCase();
  if (explicitTemplate === 'adulto' || explicitTemplate === 'menor') return explicitTemplate;
  const faixaEtaria = normalizeAgeBracket_(userRecord && userRecord.faixa_etaria_cadastro);
  if (faixaEtaria) return getWelcomeTemplateFromBracket_(faixaEtaria);
  const minorValue = normalizeBooleanCellValue_(userRecord && userRecord.is_minor);
  if (minorValue === true) return 'menor';
  if (minorValue === false) return 'adulto';
  return '';
}

function getBrandLogoUrl_(settings) {
  return cleanText_(settings.EMAIL_LOGO_URL || '') || 'https://outcast2020.github.io/checkin-LAB/logo_cordel_color.png';
}

function buildEmailButtonHtml_(label, url, theme) {
  const safeUrl = cleanText_(url);
  if (!label || !isUsableUrl_(safeUrl)) return '';
  const isDark = String(theme || '').toLowerCase() === 'dark';
  const background = isDark ? '#123946' : '#ea8200';
  const color = isDark ? '#fff8f1' : '#10212b';
  return '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px;">' +
    '<tr><td style="border-radius:999px;background:' + background + ';">' +
    '<a href="' + htmlEscape_(safeUrl) + '" style="display:inline-block;padding:14px 22px;border-radius:999px;color:' + color + ';font-size:15px;font-weight:700;text-decoration:none;">' +
      htmlEscape_(label) +
    '</a>' +
    '</td></tr></table>';
}

function buildEmailParagraphsHtml_(paragraphs) {
  return (paragraphs || []).map(function(paragraph) {
    return '<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#2d241f;">' +
      htmlEscape_(paragraph) +
    '</p>';
  }).join('');
}

function buildEmailListHtml_(items) {
  if (!items || !items.length) return '';
  return '<ul style="margin:0 0 18px 20px;padding:0;color:#2d241f;">' +
    items.map(function(item) {
      return '<li style="margin:0 0 10px;font-size:15px;line-height:1.65;">' + htmlEscape_(item) + '</li>';
    }).join('') +
  '</ul>';
}

function buildEmailCardHtml_(settings, options) {
  const projectName = settings.PROJECT_NAME || LAB_CFG.DEFAULTS.PROJECT_NAME;
  const projectUrl = cleanText_(settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL);
  const logoUrl = getBrandLogoUrl_(settings);
  const greeting = cleanText_(options.greeting || '');
  const footerText = cleanText_(options.footerText || '');
  const primaryUrl = cleanText_(options.primaryUrl || '');
  const secondaryUrl = cleanText_(options.secondaryUrl || projectUrl);
  const helperLinkHtml = isUsableUrl_(primaryUrl)
    ? '<p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:#6f6258;">Link direto:<br><a href="' + htmlEscape_(primaryUrl) + '" style="color:#8a4a00;text-decoration:underline;word-break:break-all;">' + htmlEscape_(primaryUrl) + '</a></p>'
    : '';
  const secondaryLinkHtml = isUsableUrl_(secondaryUrl) && options.secondaryLabel
    ? '<p style="margin:0;font-size:14px;line-height:1.6;color:#6f6258;"><a href="' + htmlEscape_(secondaryUrl) + '" style="color:#123946;text-decoration:underline;">' + htmlEscape_(options.secondaryLabel) + '</a></p>'
    : '';
  const contentHtml = options.contentHtml || (buildEmailParagraphsHtml_(options.paragraphs || []) + buildEmailListHtml_(options.listItems || []));

  return '<div style="margin:0;padding:28px 0;background:#f5efe6;">' +
    '<div style="width:100%;max-width:640px;margin:0 auto;padding:0 16px;">' +
      '<div style="margin:0 0 14px;text-align:center;">' +
        '<a href="' + htmlEscape_(projectUrl) + '" style="text-decoration:none;display:inline-block;">' +
          '<img src="' + htmlEscape_(logoUrl) + '" alt="' + htmlEscape_(projectName) + '" style="width:180px;max-width:100%;height:auto;border:0;">' +
        '</a>' +
      '</div>' +
      '<div style="background:#fffaf4;border:1px solid #ead9c9;border-radius:24px;overflow:hidden;box-shadow:0 18px 40px rgba(18,57,70,0.08);">' +
        '<div style="height:8px;background:linear-gradient(90deg,#123946,#ea8200,#f6be4b,#123946);"></div>' +
        '<div style="padding:30px 28px 26px;">' +
          '<p style="margin:0 0 10px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;font-weight:700;color:#123946;">' + htmlEscape_(options.eyebrow || projectName) + '</p>' +
          '<h1 style="margin:0 0 14px;font-size:28px;line-height:1.2;color:#1f1712;">' + htmlEscape_(options.title || projectName) + '</h1>' +
          (greeting ? '<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#2d241f;">' + htmlEscape_(greeting) + '</p>' : '') +
          contentHtml +
          buildEmailButtonHtml_(options.primaryLabel, primaryUrl, options.primaryTheme) +
          helperLinkHtml +
          (footerText ? '<p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#6f6258;">' + htmlEscape_(footerText) + '</p>' : '') +
          secondaryLinkHtml +
        '</div>' +
      '</div>' +
      '<p style="margin:14px 4px 0;font-size:12px;line-height:1.6;color:#7c6d62;text-align:center;">Equipe do ' + htmlEscape_(projectName) + '</p>' +
    '</div>' +
  '</div>';
}

function buildWelcomeEmailPayload_(settings, nome, templateKey) {
  const projectName = settings.PROJECT_NAME || LAB_CFG.DEFAULTS.PROJECT_NAME;
  const projectUrl = cleanText_(settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL);
  const labUrl = cleanText_(settings.LAB_URL || LAB_CFG.DEFAULTS.LAB_URL || projectUrl);
  const participantName = cleanText_(nome) || 'participante';
  const normalizedTemplate = String(templateKey || '').trim().toLowerCase() === 'menor' ? 'menor' : 'adulto';

  if (normalizedTemplate === 'menor') {
    const subject = projectName + ' | Boas-vindas com cuidados de participação';
    const paragraphs = [
      'Seja bem-vindo(a) ao Laboratório Cordel 2.0.',
      'Recebemos seu cadastro com alegria e queremos acolher sua entrada neste espaço de escrita, criação e letramento digital. O laboratório foi pensado como um ambiente educativo, cultural e experimental, onde a tecnologia funciona como apoio à reflexão e à autoria, sem substituir sua voz, sua criatividade e a mediação humana.',
      'Pelo cadastro, percebemos que você é menor de idade. Por isso, reforçamos com atenção especial alguns cuidados importantes para sua participação:',
      'Também lembramos que as ferramentas digitais do laboratório apoiam o processo de aprendizagem e criação, mas não substituem sua autoria, nem a revisão humana, nem a mediação pedagógica.',
      'Queremos que sua experiência aqui seja segura, criativa e inspiradora.',
      'Seja muito bem-vindo(a).',
      'Com carinho,',
      'Equipe do Laboratório Cordel 2.0'
    ];
    const listItems = [
      'este é um ambiente educativo e acompanhado, voltado à escrita e ao uso responsável das tecnologias;',
      'use apenas os dados necessários para participar;',
      'não informe documentos, endereço residencial, dados de saúde, religião, biometria ou outras informações sensíveis;',
      'sua produção autoral deve ser feita com cuidado, respeito e responsabilidade;',
      'sempre que houver possibilidade de publicação com nome, imagem, voz, participação em pesquisa, antologia, redes sociais ou outras formas de divulgação pública, isso poderá depender de autorização específica do responsável legal, quando aplicável.'
    ];
    return {
      template: normalizedTemplate,
      subject: subject,
      plainBody: [
        'Olá, ' + participantName + ',',
        '',
        'Seja bem-vindo(a) ao Laboratório Cordel 2.0.',
        '',
        'Recebemos seu cadastro com alegria e queremos acolher sua entrada neste espaço de escrita, criação e letramento digital. O laboratório foi pensado como um ambiente educativo, cultural e experimental, onde a tecnologia funciona como apoio à reflexão e à autoria, sem substituir sua voz, sua criatividade e a mediação humana.',
        '',
        'Pelo cadastro, percebemos que você é menor de idade. Por isso, reforçamos com atenção especial alguns cuidados importantes para sua participação:',
        '',
        'este é um ambiente educativo e acompanhado, voltado à escrita e ao uso responsável das tecnologias;',
        'use apenas os dados necessários para participar;',
        'não informe documentos, endereço residencial, dados de saúde, religião, biometria ou outras informações sensíveis;',
        'sua produção autoral deve ser feita com cuidado, respeito e responsabilidade;',
        'sempre que houver possibilidade de publicação com nome, imagem, voz, participação em pesquisa, antologia, redes sociais ou outras formas de divulgação pública, isso poderá depender de autorização específica do responsável legal, quando aplicável.',
        '',
        'Também lembramos que as ferramentas digitais do laboratório apoiam o processo de aprendizagem e criação, mas não substituem sua autoria, nem a revisão humana, nem a mediação pedagógica.',
        '',
        'Queremos que sua experiência aqui seja segura, criativa e inspiradora.',
        '',
        'Seja muito bem-vindo(a).',
        '',
        'Com carinho,',
        'Equipe do Laboratório Cordel 2.0',
        projectUrl
      ].join('\n'),
      htmlBody: buildEmailCardHtml_(settings, {
        eyebrow: 'Boas-vindas',
        title: 'Seu acesso ao laboratório está pronto',
        greeting: 'Olá, ' + participantName + '.',
        contentHtml:
          buildEmailParagraphsHtml_([
            'Seja bem-vindo(a) ao Laboratório Cordel 2.0.',
            'Recebemos seu cadastro com alegria e queremos acolher sua entrada neste espaço de escrita, criação e letramento digital. O laboratório foi pensado como um ambiente educativo, cultural e experimental, onde a tecnologia funciona como apoio à reflexão e à autoria, sem substituir sua voz, sua criatividade e a mediação humana.',
            'Pelo cadastro, percebemos que você é menor de idade. Por isso, reforçamos com atenção especial alguns cuidados importantes para sua participação:'
          ]) +
          buildEmailListHtml_(listItems) +
          buildEmailParagraphsHtml_([
            'Também lembramos que as ferramentas digitais do laboratório apoiam o processo de aprendizagem e criação, mas não substituem sua autoria, nem a revisão humana, nem a mediação pedagógica.',
            'Queremos que sua experiência aqui seja segura, criativa e inspiradora.',
            'Seja muito bem-vindo(a).',
            'Com carinho,',
            'Equipe do Laboratório Cordel 2.0',
            'www.cordel2pontozero.com'
          ]),
        primaryLabel: 'Conhecer o laboratório',
        primaryUrl: labUrl,
        secondaryLabel: 'Conhecer o projeto',
        secondaryUrl: projectUrl,
        footerText: 'O texto acima segue o modelo de acolhimento e cuidado previsto para participantes menores de idade.'
      })
    };
  }

  const subject = projectName + ' | Boas-vindas ao laboratório';
  const paragraphs = [
    'Seja bem-vindo(a) ao Laboratório Cordel 2.0.',
    'Recebemos seu cadastro com alegria e queremos acolher sua entrada neste espaço de escrita, criação e letramento digital. O laboratório foi pensado como um ambiente educativo, cultural e experimental, no qual a tecnologia atua como apoio à reflexão, à autoria e à aprendizagem, sem substituir o protagonismo humano.',
    'Queremos lembrar você que os dispositivos digitais utilizados neste espaço devem ser compreendidos como instrumentos de apoio. Eles podem sugerir, organizar, analisar ou provocar reflexão, mas não substituem a responsabilidade humana, a revisão crítica nem a mediação pedagógica quando aplicável.',
    'Queremos que sua experiência no Laboratório Cordel 2.0 seja criativa, segura e significativa. Por isso, aproveitamos para reforçar alguns princípios importantes da sua participação:',
    'Seja muito bem-vindo(a).',
    'Com estima,',
    'Equipe do Laboratório Cordel 2.0'
  ];
  const listItems = [
    'ética: esperamos um uso respeitoso, responsável e compatível com as finalidades educativas do laboratório;',
    'protagonismo humano: sua voz, sua autoria e sua leitura crítica permanecem centrais em todo o processo;',
    'equidade: buscamos um ambiente inclusivo, atento às diferenças, à dignidade das pessoas e à valorização da cultura popular;',
    'proteção de dados: em conformidade com a LGPD, orientamos que você compartilhe apenas os dados necessários para participação e evite inserir informações sensíveis ou desnecessárias nos ambientes do laboratório.'
  ];
  return {
    template: normalizedTemplate,
    subject: subject,
    plainBody: [
      'Olá, ' + participantName + ',',
      '',
      'Seja bem-vindo(a) ao Laboratório Cordel 2.0.',
      '',
      'Recebemos seu cadastro com alegria e queremos acolher sua entrada neste espaço de escrita, criação e letramento digital. O laboratório foi pensado como um ambiente educativo, cultural e experimental, no qual a tecnologia atua como apoio à reflexão, à autoria e à aprendizagem, sem substituir o protagonismo humano.',
      '',
      'Queremos lembrar você que os dispositivos digitais utilizados neste espaço devem ser compreendidos como instrumentos de apoio. Eles podem sugerir, organizar, analisar ou provocar reflexão, mas não substituem a responsabilidade humana, a revisão crítica nem a mediação pedagógica quando aplicável.',
      '',
      'Queremos que sua experiência no Laboratório Cordel 2.0 seja criativa, segura e significativa. Por isso, aproveitamos para reforçar alguns princípios importantes da sua participação:',
      '',
      'ética: esperamos um uso respeitoso, responsável e compatível com as finalidades educativas do laboratório;',
      'protagonismo humano: sua voz, sua autoria e sua leitura crítica permanecem centrais em todo o processo;',
      'equidade: buscamos um ambiente inclusivo, atento às diferenças, à dignidade das pessoas e à valorização da cultura popular;',
      'proteção de dados: em conformidade com a LGPD, orientamos que você compartilhe apenas os dados necessários para participação e evite inserir informações sensíveis ou desnecessárias nos ambientes do laboratório.',
      '',
      'Seja muito bem-vindo(a).',
      '',
      'Com estima,',
      'Equipe do Laboratório Cordel 2.0',
      projectUrl
    ].join('\n'),
    htmlBody: buildEmailCardHtml_(settings, {
      eyebrow: 'Boas-vindas',
      title: 'Seu acesso ao laboratório está pronto',
      greeting: 'Olá, ' + participantName + '.',
      contentHtml:
        buildEmailParagraphsHtml_([
          'Seja bem-vindo(a) ao Laboratório Cordel 2.0.',
          'Recebemos seu cadastro com alegria e queremos acolher sua entrada neste espaço de escrita, criação e letramento digital. O laboratório foi pensado como um ambiente educativo, cultural e experimental, no qual a tecnologia atua como apoio à reflexão, à autoria e à aprendizagem, sem substituir o protagonismo humano.',
          'Queremos lembrar você que os dispositivos digitais utilizados neste espaço devem ser compreendidos como instrumentos de apoio. Eles podem sugerir, organizar, analisar ou provocar reflexão, mas não substituem a responsabilidade humana, a revisão crítica nem a mediação pedagógica quando aplicável.',
          'Queremos que sua experiência no Laboratório Cordel 2.0 seja criativa, segura e significativa. Por isso, aproveitamos para reforçar alguns princípios importantes da sua participação:'
        ]) +
        buildEmailListHtml_(listItems) +
        buildEmailParagraphsHtml_([
          'Seja muito bem-vindo(a).',
          'Com estima,',
          'Equipe do Laboratório Cordel 2.0',
          'www.cordel2pontozero.com'
        ]),
      primaryLabel: 'Conhecer o laboratório',
      primaryUrl: labUrl,
      secondaryLabel: 'Conhecer o projeto',
      secondaryUrl: projectUrl,
      footerText: 'O texto acima segue o modelo de acolhimento previsto para participantes maiores de idade.'
    })
  };
}

function sendWelcomeEmail_(settings, email, nome, templateKey) {
  const payload = buildWelcomeEmailPayload_(settings, nome, templateKey);
  const projectName = settings.PROJECT_NAME || LAB_CFG.DEFAULTS.PROJECT_NAME;
  MailApp.sendEmail({
    to: email,
    subject: payload.subject,
    body: payload.plainBody,
    htmlBody: payload.htmlBody,
    name: projectName
  });
  return { template: payload.template, subject: payload.subject };
}

function getSettingsForManualEmailTests_() {
  const merged = {};
  Object.keys(LAB_CFG.DEFAULTS || {}).forEach(function(key) {
    merged[key] = LAB_CFG.DEFAULTS[key];
  });

  try {
    const ss = getLabSpreadsheet_(false);
    const runtimeSettings = readSettingsMap_(ss);
    Object.keys(runtimeSettings || {}).forEach(function(key) {
      if (String(runtimeSettings[key] || '') !== '') {
        merged[key] = runtimeSettings[key];
      }
    });
  } catch (err) {}

  return merged;
}

function testarEmailBoasVindasAdulto() {
  const email = 'cjaviervidalg@gmail.com';
  const nome = 'Carlos Javier Vidal Guerrero';
  const settings = getSettingsForManualEmailTests_();
  const result = sendWelcomeEmail_(settings, email, nome, 'adulto');
  return 'Email de boas-vindas adulto enviado para ' + email + ' com assunto: ' + result.subject;
}

function testarEmailBoasVindasMenor() {
  const email = 'cjaviervidalg@gmail.com';
  const nome = 'Carlos Javier Vidal Guerrero';
  const settings = getSettingsForManualEmailTests_();
  const result = sendWelcomeEmail_(settings, email, nome, 'menor');
  return 'Email de boas-vindas menor enviado para ' + email + ' com assunto: ' + result.subject;
}

function apagarCadastroPorEmail() {
  const EMAIL = 'EMAIL';
  if (EMAIL === 'EMAIL') {
    throw new Error("Substitua 'EMAIL' pelo email do cadastro que deve ser apagado.");
  }
  return apagarCadastroPorEmail_(EMAIL);
}

function abrirPromptApagarCadastroPorEmail() {
  const ui = SpreadsheetApp.getUi();
  const prompt = ui.prompt(
    'Apagar cadastro por email',
    'Digite o email do cadastro que deve ser apagado.',
    ui.ButtonSet.OK_CANCEL
  );

  if (prompt.getSelectedButton() !== ui.Button.OK) {
    return 'Operação cancelada.';
  }

  const targetEmail = normalizeEmail_(prompt.getResponseText());
  if (!targetEmail) {
    ui.alert('Email inválido', 'Informe um email válido para continuar.', ui.ButtonSet.OK);
    return 'Email inválido.';
  }

  const confirmation = ui.alert(
    'Confirmar exclusão',
    'Isso vai apagar o cadastro, os logs relacionados e os tokens ativos de "' + targetEmail + '". Deseja continuar?',
    ui.ButtonSet.OK_CANCEL
  );

  if (confirmation !== ui.Button.OK) {
    return 'Operação cancelada.';
  }

  const result = apagarCadastroPorEmail_(targetEmail);
  ui.alert('Cadastro apagado', result, ui.ButtonSet.OK);
  return result;
}

function apagarCadastroPorEmail_(email) {
  const targetEmail = normalizeEmail_(email);
  if (!targetEmail) {
    throw new Error('Informe um email válido para apagar o cadastro.');
  }

  const ss = getLabSpreadsheet_(false);
  const settings = readSettingsMap_(ss);
  ensureUsersSheetSchema_(ss, settings);

  const usersSheet = ss.getSheetByName(LAB_CFG.SHEETS.USERS);
  const consentSheet = ss.getSheetByName(LAB_CFG.SHEETS.CONSENT_LOG);
  const accessSheet = ss.getSheetByName(LAB_CFG.SHEETS.ACCESS_LOG);
  const backupFolder = getOrCreateBackupFolder_(settings, ss);
  const backupFiles = backupSheetsAsCsv_(ss, [usersSheet, consentSheet, accessSheet], backupFolder);

  const usersDeleted = deleteRowsByEmailMatch_(usersSheet, targetEmail);
  const consentDeleted = deleteRowsByEmailMatch_(consentSheet, targetEmail);
  const accessDeleted = deleteRowsByEmailMatch_(accessSheet, targetEmail);
  const tokensDeleted = deleteLabAccessTokensByEmail_(targetEmail);

  return [
    'Cadastro removido para: ' + targetEmail,
    'users_removidos=' + usersDeleted,
    'consent_logs_removidos=' + consentDeleted,
    'access_logs_removidos=' + accessDeleted,
    'lab_tokens_removidos=' + tokensDeleted,
    'backup_gerado=' + backupFiles.length + ' arquivo(s)'
  ].join(' | ');
}

function buildBrandedPageHtml_(settings, options) {
  const projectName = settings.PROJECT_NAME || LAB_CFG.DEFAULTS.PROJECT_NAME;
  const projectUrl = cleanText_(settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL);
  const checkinUrl = resolveCadastroUrl_(settings);
  const primaryUrl = cleanText_(options.primaryActionUrl || '') || checkinUrl || projectUrl;
  const secondaryUrl = cleanText_(options.secondaryActionUrl || '') || checkinUrl || projectUrl;
  const primaryLabel = cleanText_(options.primaryActionLabel || 'Continuar');
  const secondaryLabel = cleanText_(options.secondaryActionLabel || 'Voltar ao cadastro');
  const eyebrow = cleanText_(options.eyebrow || (options.ok ? 'Acesso preparado' : 'Atenção'));
  const note = cleanText_(options.note || '');
  const logoUrl = getBrandLogoUrl_(settings);
  const canAutoRedirect = !!options.autoRedirect && isUsableUrl_(primaryUrl);
  const accent = options.ok ? '#ea8200' : '#123946';
  const primaryTextColor = options.ok ? '#10212b' : '#fff8f1';
  const refreshTag = canAutoRedirect
    ? '<meta http-equiv="refresh" content="2;url=' + htmlEscape_(primaryUrl) + '">'
    : '';
  const redirectLabel = canAutoRedirect
    ? '<p class="redirect-chip">Redirecionamento automático em andamento...</p>'
    : '';

  return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<title>' + htmlEscape_(options.title || projectName) + '</title>' +
    refreshTag +
    '<style>' +
      'html,body{margin:0;min-height:100%;}' +
      'body{background:linear-gradient(180deg,#f7f1e8 0%,#f1e7d8 100%);font-family:Arial,sans-serif;color:#241b16;-webkit-text-size-adjust:100%;}' +
      '.shell{min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;}' +
      '.card{width:min(720px,100%);background:#fffaf4;border:1px solid #ead9c9;border-radius:28px;overflow:hidden;box-shadow:0 24px 60px rgba(18,57,70,0.10);}' +
      '.stripe{height:10px;background:linear-gradient(90deg,#123946,#ea8200,#f6be4b,#123946);}' +
      '.content{padding:32px 30px 28px;}' +
      '.logo{width:190px;max-width:100%;height:auto;display:block;margin:0 auto 22px;}' +
      '.eyebrow{margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#123946;}' +
      'h1{margin:0 0 14px;font-size:34px;line-height:1.15;color:#1d1511;}' +
      '.message{margin:0 0 18px;font-size:18px;line-height:1.7;color:#382c25;}' +
      '.note{margin:0 0 20px;font-size:14px;line-height:1.6;color:#6f6258;}' +
      '.redirect-chip{display:inline-flex;align-items:center;gap:8px;margin:0 0 18px;padding:10px 14px;border-radius:999px;background:#fff3e4;color:#8a4a00;font-size:13px;font-weight:700;}' +
      '.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:20px;}' +
      '.btn{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:0 20px;border-radius:999px;text-decoration:none;font-weight:700;font-size:15px;border:1px solid transparent;box-sizing:border-box;-webkit-tap-highlight-color:transparent;}' +
      '.btn-primary{background:' + accent + ';color:' + primaryTextColor + ';}' +
      '.btn-secondary{background:#fff3e4;color:#123946;border-color:#dcc7b4;}' +
      '.foot{margin-top:18px;font-size:13px;line-height:1.6;color:#7c6d62;}' +
      '.foot a{color:#8a4a00;word-break:break-all;}' +
      '@media (max-width:640px){.shell{align-items:flex-start;padding:16px 14px max(18px,env(safe-area-inset-bottom));}.card{border-radius:22px;}.content{padding:24px 18px 20px;}.logo{width:154px;margin-bottom:18px;}.eyebrow{font-size:11px;}.h1,h1{font-size:27px;}.message{font-size:16px;line-height:1.65;}.note{font-size:14px;}.actions{flex-direction:column;}.btn{width:100%;min-height:54px;padding:0 18px;}.foot{font-size:12px;}}' +
    '</style></head><body>' +
      '<main class="shell"><section class="card"><div class="stripe"></div><div class="content">' +
        '<a href="' + htmlEscape_(projectUrl) + '"><img class="logo" src="' + htmlEscape_(logoUrl) + '" alt="' + htmlEscape_(projectName) + '"></a>' +
        '<p class="eyebrow">' + htmlEscape_(eyebrow) + '</p>' +
        '<h1>' + htmlEscape_(options.title || projectName) + '</h1>' +
        '<p class="message">' + htmlEscape_(options.message || '').replace(/\n/g, '<br>') + '</p>' +
        (note ? '<p class="note">' + htmlEscape_(note) + '</p>' : '') +
        redirectLabel +
        '<div class="actions">' +
          '<a class="btn btn-primary" href="' + htmlEscape_(primaryUrl) + '" target="_top" rel="noopener noreferrer">' + htmlEscape_(primaryLabel) + '</a>' +
          (secondaryLabel && isUsableUrl_(secondaryUrl) ? '<a class="btn btn-secondary" href="' + htmlEscape_(secondaryUrl) + '" target="_top" rel="noopener noreferrer">' + htmlEscape_(secondaryLabel) + '</a>' : '') +
        '</div>' +
        '<p class="foot">Se o botão principal não abrir automaticamente, use este link direto:<br><a href="' + htmlEscape_(primaryUrl) + '" target="_top" rel="noopener noreferrer">' + htmlEscape_(primaryUrl) + '</a></p>' +
      '</div></section></main>' +
    '</body></html>';
}

function buildDirectRedirectPageHtml_(settings, options) {
  const projectName = settings.PROJECT_NAME || LAB_CFG.DEFAULTS.PROJECT_NAME;
  const projectUrl = cleanText_(settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL);
  const targetUrl = cleanText_(options.primaryActionUrl || resolveLabUrl_(settings) || projectUrl);
  const safeTargetUrl = isUsableUrl_(targetUrl) ? targetUrl : projectUrl;
  const secondaryUrl = cleanText_(options.secondaryActionUrl || resolveLabUrl_(settings) || projectUrl);
  const safeSecondaryUrl = isUsableUrl_(secondaryUrl) ? secondaryUrl : safeTargetUrl;
  const title = cleanText_(options.title || 'Redirecionando');
  const message = cleanText_(options.message || 'Seu acesso foi preparado. Você está sendo encaminhado ao laboratório.');
  const logoUrl = getBrandLogoUrl_(settings);

  return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<title>' + htmlEscape_(title) + '</title>' +
    '<meta http-equiv="refresh" content="0;url=' + htmlEscape_(safeTargetUrl) + '">' +
    '<style>' +
      'html,body{margin:0;min-height:100%;}' +
      'body{display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:#f7f1e8;font-family:Arial,sans-serif;color:#241b16;-webkit-text-size-adjust:100%;}' +
      '.card{width:min(560px,100%);padding:28px 22px;background:#fffaf4;border:1px solid #ead9c9;border-radius:24px;box-shadow:0 18px 40px rgba(18,57,70,0.08);text-align:center;}' +
      '.logo{width:170px;max-width:100%;height:auto;display:block;margin:0 auto 18px;}' +
      'h1{margin:0 0 12px;font-size:28px;line-height:1.2;}' +
      'p{margin:0 0 16px;font-size:16px;line-height:1.6;color:#45362d;}' +
      '.btn{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:0 18px;border-radius:999px;background:#ea8200;color:#10212b;text-decoration:none;font-weight:700;width:100%;max-width:320px;box-sizing:border-box;}' +
      '.link{display:block;margin-top:14px;font-size:13px;line-height:1.6;color:#8a4a00;word-break:break-all;}' +
      '@media (max-width:640px){body{padding:16px;align-items:flex-start;}.card{padding:24px 18px;}.logo{width:150px;}h1{font-size:25px;}}' +
    '</style>' +
    '</head><body>' +
      '<main class="card">' +
        '<a href="' + htmlEscape_(projectUrl) + '" target="_top" rel="noopener noreferrer"><img class="logo" src="' + htmlEscape_(logoUrl) + '" alt="' + htmlEscape_(projectName) + '"></a>' +
        '<h1>' + htmlEscape_(title) + '</h1>' +
        '<p>' + htmlEscape_(message) + '</p>' +
        '<a class="btn" href="' + htmlEscape_(safeTargetUrl) + '" target="_top" rel="noopener noreferrer">Ir agora para o laboratório</a>' +
        '<a class="link" href="' + htmlEscape_(safeTargetUrl) + '" target="_top" rel="noopener noreferrer">' + htmlEscape_(safeTargetUrl) + '</a>' +
        (safeSecondaryUrl && safeSecondaryUrl !== safeTargetUrl ? '<p style="margin-top:14px;"><a href="' + htmlEscape_(safeSecondaryUrl) + '" target="_top" rel="noopener noreferrer" style="color:#123946;">Voltar ao laboratório</a></p>' : '') +
      '</main>' +
    '</body></html>';
}

function confirmationPage_(content, settings) {
  const html = buildBrandedPageHtml_(settings, {
    ok: !!content.ok,
    eyebrow: content.ok ? 'Confirmação concluída' : 'Atenção',
    title: cleanText_(content.title || 'Confirmação de email'),
    message: cleanText_(content.message || 'Seu link foi processado.'),
    primaryActionLabel: cleanText_(content.primaryActionLabel || 'Voltar ao cadastro'),
    primaryActionUrl: cleanText_(content.primaryActionUrl || settings.CHECKIN_URL || LAB_CFG.DEFAULTS.CHECKIN_URL),
    secondaryActionLabel: cleanText_(content.secondaryActionLabel || 'Conhecer o projeto'),
    secondaryActionUrl: cleanText_(content.secondaryActionUrl || settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL)
  });
  return HtmlService.createHtmlOutput(html).setTitle('Confirmação de email');
}

function accessResultPage_(content, settings) {
  if (content && content.ok) {
    const html = buildDirectRedirectPageHtml_(settings, {
      title: cleanText_(content.title || 'Acesso confirmado'),
      message: cleanText_(content.message || 'Seu acesso foi validado. Estamos abrindo o Laboratório Cordel 2.0 para você.'),
      primaryActionUrl: cleanText_(content.primaryActionUrl || settings.LAB_URL || LAB_CFG.DEFAULTS.LAB_URL),
      secondaryActionUrl: cleanText_(settings.LAB_URL || LAB_CFG.DEFAULTS.LAB_URL)
    });
    return HtmlService.createHtmlOutput(html).setTitle(content.title || 'Acesso confirmado');
  }

  const html = buildBrandedPageHtml_(settings, {
    ok: !!content.ok,
    eyebrow: content.ok ? 'Acesso confirmado' : 'Ajuste necessário',
    title: cleanText_(content.title || 'Validar acesso'),
    message: cleanText_(content.message || ''),
    primaryActionLabel: cleanText_(content.primaryActionLabel || 'Continuar'),
    primaryActionUrl: cleanText_(content.primaryActionUrl || settings.CHECKIN_URL || LAB_CFG.DEFAULTS.CHECKIN_URL),
    secondaryActionLabel: cleanText_(content.secondaryActionLabel || (content.ok ? 'Conhecer o projeto' : 'Voltar ao cadastro')),
    secondaryActionUrl: cleanText_(content.secondaryActionUrl || (content.ok ? settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL : settings.CHECKIN_URL || LAB_CFG.DEFAULTS.CHECKIN_URL)),
    note: content.ok ? 'Seu acesso já foi preparado. Se preferir, toque no botão para entrar agora no laboratório.' : '',
    autoRedirect: !!content.ok
  });
  return HtmlService.createHtmlOutput(html).setTitle(content.title || 'Validar acesso');
}

function resolveCheckinBridgeUrl_(settings) {
  return cleanText_(
    resolveCadastroUrl_(settings) ||
    settings.WEB_APP_URL ||
    LAB_CFG.DEFAULTS.WEB_APP_URL ||
    ScriptApp.getService().getUrl() ||
    ''
  );
}

function buildConfirmationUrl_(settings, email, token) {
  const baseUrl = resolveCheckinBridgeUrl_(settings);
  const sep = baseUrl.indexOf('?') >= 0 ? '&' : '?';
  return (
    baseUrl +
    sep +
    'action=confirm&email=' +
    encodeURIComponent(email) +
    '&token=' +
    encodeURIComponent(token)
  );
}

function appendObjectRow_(sh, fieldMap) {
  const lastColumn = sh.getLastColumn();
  if (lastColumn < 1) return;

  const headers = sh
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map(function(header) {
      return String(header || '').trim();
    });

  const row = headers.map(function(header) {
    return Object.prototype.hasOwnProperty.call(fieldMap, header)
      ? fieldMap[header]
      : '';
  });

  sh.appendRow(row);
}

// =====================================================================
// FUNÇÃO SUPER BLINDADA PARA LER A ABA USERS (IGNORA A BAGUNÇA)
// =====================================================================
function findUserByEmail_(ss, email) {
  const sh = ss.getSheetByName(LAB_CFG.SHEETS.USERS);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return null;
  
  // Transforma todos os cabeçalhos para minúsculo e tira espaços, pra não errar
  const headers = values[0].map(function(h) {
    return String(h || '').trim().toLowerCase();
  });
  
  const emailIdx = headers.indexOf('email');
  if (emailIdx === -1) return null; // Se mesmo assim não achar a coluna, aborta em segurança

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (normalizeEmail_(row[emailIdx]) === email) {
      const out = mapRow_(headers, row);
      out._rowNumber = i + 1;
      return out;
    }
  }
  return null;
}

function findAllowlistedEmail_(ss, email) {
  const sh = ss.getSheetByName(LAB_CFG.SHEETS.ALLOWLIST);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return null;
  const headers = values[0].map(function(h) { return String(h || '').trim().toLowerCase(); });
  const emailIdx = headers.indexOf('email');
  const statusIdx = headers.indexOf('status');
  
  if (emailIdx === -1 || statusIdx === -1) return null;

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowEmail = normalizeEmail_(row[emailIdx]);
    const status = String(row[statusIdx] || '').toUpperCase();
    if (rowEmail === email && status === 'ACTIVE') return mapRow_(headers, row);
  }
  return null;
}

function updateUserFields_(ss, rowNumber, fieldMap) {
  const sh = ss.getSheetByName(LAB_CFG.SHEETS.USERS);
  if (!sh || !rowNumber || rowNumber < 2) return;

  const lastColumn = sh.getLastColumn();
  if (lastColumn < 1) return;

  const headers = sh
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map(function(h) {
      return String(h || '').trim().toLowerCase();
    });

  Object.keys(fieldMap || {}).forEach(function(key) {
    const idx = headers.indexOf(String(key || '').trim().toLowerCase());
    if (idx >= 0) {
      sh.getRange(rowNumber, idx + 1).setValue(fieldMap[key]);
    }
  });
}

function deleteRowsByEmailMatch_(sh, email) {
  if (!sh) return 0;

  const lastRow = sh.getLastRow();
  const lastColumn = sh.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) return 0;

  const values = sh.getRange(1, 1, lastRow, lastColumn).getValues();
  const headers = values[0].map(function(h) {
    return String(h || '').trim().toLowerCase();
  });
  const emailIdx = headers.indexOf('email');
  if (emailIdx === -1) return 0;

  let deleted = 0;
  for (let rowIndex = values.length - 1; rowIndex >= 1; rowIndex--) {
    if (normalizeEmail_(values[rowIndex][emailIdx]) === email) {
      sh.deleteRow(rowIndex + 1);
      deleted++;
    }
  }

  return deleted;
}

function deleteLabAccessTokensByEmail_(email) {
  const props = PropertiesService.getScriptProperties();
  const allProperties = props.getProperties();
  let deleted = 0;

  Object.keys(allProperties).forEach(function(key) {
    if (key.indexOf('LAB_ACCESS_TOKEN_') !== 0) return;
    try {
      const record = JSON.parse(allProperties[key]);
      if (normalizeEmail_(record && record.email) === email) {
        props.deleteProperty(key);
        deleted++;
      }
    } catch (err) {
      // Ignora tokens corrompidos; o housekeeping cuida deles depois.
    }
  });

  return deleted;
}

function logConsent_(ss, eventType, userId, email, termsVersion, accepted, page, source, userAgent, notes) {
  ss.getSheetByName(LAB_CFG.SHEETS.CONSENT_LOG).appendRow([generateId_('CNS'), new Date(), eventType, userId || '', email || '', termsVersion || '', accepted ? 'TRUE' : 'FALSE', page || '', source || '', userAgent || '', notes || '']);
}

function logAccess_(ss, eventType, email, result, reason, page, source, userAgent, notes) {
  ss.getSheetByName(LAB_CFG.SHEETS.ACCESS_LOG).appendRow([generateId_('ACC'), new Date(), eventType, email || '', result || '', reason || '', page || '', source || '', userAgent || '', notes || '']);
}

function upsertSetting_(ss, key, value) {
  const sh = ss.getSheetByName(LAB_CFG.SHEETS.SETTINGS);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === key) {
      sh.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sh.appendRow([key, value]);
}

function findUserByEmail_(ss, email) {
  const sh = ss.getSheetByName(LAB_CFG.SHEETS.USERS);
  if (!sh) return null;

  const values = sh.getDataRange().getValues();
  if (values.length < 2) return null;

  const headers = values[0].map(function(h) {
    return String(h || '').trim().toLowerCase();
  });

  const emailIdx = headers.indexOf('email');
  if (emailIdx === -1) return null;

  const targetEmail = normalizeEmail_(email);
  if (!targetEmail) return null;

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (normalizeEmail_(row[emailIdx]) === targetEmail) {
      const out = mapRow_(headers, row);
      out._rowNumber = i + 1;
      return out;
    }
  }

  return null;
}

function findAllowlistedEmail_(ss, email) {
  const sh = ss.getSheetByName(LAB_CFG.SHEETS.ALLOWLIST);
  if (!sh) return null;

  const values = sh.getDataRange().getValues();
  if (values.length < 2) return null;

  const headers = values[0].map(function(h) {
    return String(h || '').trim().toLowerCase();
  });

  const emailIdx = headers.indexOf('email');
  const statusIdx = headers.indexOf('status');
  if (emailIdx === -1 || statusIdx === -1) return null;

  const targetEmail = normalizeEmail_(email);
  if (!targetEmail) return null;

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowEmail = normalizeEmail_(row[emailIdx]);
    const status = String(row[statusIdx] || '').trim().toUpperCase();

    if (rowEmail === targetEmail && status === 'ACTIVE') {
      const out = mapRow_(headers, row);
      out._rowNumber = i + 1;
      return out;
    }
  }

  return null;
}

function readSettingsMap_(ss) {
  const sh = ss.getSheetByName(LAB_CFG.SHEETS.SETTINGS);
  const map = {};
  if (!sh) return map;

  const values = sh.getDataRange().getValues();
  if (values.length < 2) return map;

  for (let i = 1; i < values.length; i++) {
    const key = String(values[i][0] || '').trim();
    if (key) map[key] = values[i][1];
  }

  return map;
}

function upsertSetting_(ss, key, value) {
  const sh = ss.getSheetByName(LAB_CFG.SHEETS.SETTINGS);
  if (!sh) return;

  const values = sh.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === key) {
      sh.getRange(i + 1, 2).setValue(value);
      return;
    }
  }

  sh.appendRow([key, value]);
}

function getOrCreateBackupFolder_(settings, ss) {
  const configuredId = cleanText_(settings.BACKUP_FOLDER_ID);
  if (configuredId) { try { return DriveApp.getFolderById(configuredId); } catch (err) {} }
  const folderName = (settings.PROJECT_NAME || LAB_CFG.DEFAULTS.PROJECT_NAME) + ' | Backups CSV';
  const folders = DriveApp.getFoldersByName(folderName);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  upsertSetting_(ss, 'BACKUP_FOLDER_ID', folder.getId());
  return folder;
}

function backupSheetsAsCsv_(ss, sheets, folder) {
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
  const savedFiles = [];
  sheets.forEach(function(sh) {
    if (!sh) return;
    const values = sh.getDataRange().getDisplayValues();
    const csv = valuesToCsv_(values);
    const file = folder.createFile(sanitizeFileName_(ss.getName()) + '__' + sanitizeFileName_(sh.getName()) + '__' + timestamp + '.csv', csv, MimeType.CSV);
    savedFiles.push(file);
  });
  return savedFiles;
}

function valuesToCsv_(values) { return values.map(function(row) { return row.map(csvEscapeCell_).join(','); }).join('\r\n'); }
function csvEscapeCell_(value) {
  const text = String(value == null ? '' : value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}
function sanitizeFileName_(value) { return String(value || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim(); }
function findLatestBackupFileForSheet_(folder, spreadsheetName, sheetName) {
  const prefix = sanitizeFileName_(spreadsheetName) + '__' + sanitizeFileName_(sheetName) + '__';
  const files = folder.getFiles();
  let latest = null, latestTime = 0;
  while (files.hasNext()) {
    const file = files.next();
    if (file.getName().indexOf(prefix) !== 0 || !/\.csv$/i.test(file.getName())) continue;
    const updated = file.getLastUpdated().getTime();
    if (updated > latestTime) { latest = file; latestTime = updated; }
  }
  return latest;
}

function getLabSpreadsheet_(allowCreate) {
  const props = PropertiesService.getScriptProperties();
  const savedId = cleanText_(props.getProperty(LAB_CFG.PROPERTIES.SPREADSHEET_ID));
  const fallbackId = cleanText_(LAB_CFG.DEFAULTS.SPREADSHEET_ID);
  const resolvedId = savedId || fallbackId;

  if (resolvedId) {
    try {
      const resolvedSpreadsheet = SpreadsheetApp.openById(resolvedId);
      if (resolvedSpreadsheet && cleanText_(resolvedSpreadsheet.getId())) {
        props.setProperty(LAB_CFG.PROPERTIES.SPREADSHEET_ID, resolvedSpreadsheet.getId());
      }
      return resolvedSpreadsheet;
    } catch (err) {
      if (!allowCreate) throw new Error('Planilha configurada não encontrada.');
    }
  }

  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    props.setProperty(LAB_CFG.PROPERTIES.SPREADSHEET_ID, active.getId());
    return active;
  }

  if (!allowCreate) throw new Error('Nenhuma planilha vinculada encontrada.');
  const ss = SpreadsheetApp.create((LAB_CFG.DEFAULTS.PROJECT_NAME || 'Laboratório') + ' | Cadastro');
  props.setProperty(LAB_CFG.PROPERTIES.SPREADSHEET_ID, ss.getId());
  return ss;
}

function createSheetIfMissing_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sh;
}

function clearSheetDataRows_(sh) {
  if (!sh) return;
  const lastRow = sh.getLastRow(), lastColumn = sh.getLastColumn();
  if (lastRow <= 1 || lastColumn < 1) return;
  sh.getRange(2, 1, lastRow - 1, lastColumn).clearContent();
}

function parsePayload_(e, method) {
  if (method === 'GET') return (e && e.parameter) ? e.parameter : {};
  if (e && e.parameter && Object.keys(e.parameter).length) return e.parameter;
  if (e && e.postData && e.postData.contents) {
    try { return JSON.parse(e.postData.contents); } catch (err) { return (e && e.parameter) ? e.parameter : {}; }
  }
  return {};
}

function jsonOut_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function jsonpOut_(callbackName, obj) { return ContentService.createTextOutput(sanitizeJsonpCallback_(callbackName) + '(' + JSON.stringify(obj) + ');').setMimeType(ContentService.MimeType.JAVASCRIPT); }
function mapRow_(headers, row) { const out = {}; headers.forEach(function(h, i) { out[h] = row[i]; }); return out; }
function cleanText_(value) { return String(value || '').trim(); }
function normalizeUnicodeText_(value) { const text = String(value == null ? '' : value); return typeof text.normalize === 'function' ? text.normalize('NFC') : text; }
function normalizeEmail_(value) { const email = String(value || '').trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''; }
function normalizePhone_(value) { return String(value || '').replace(/\D/g, ''); }
function normalizeSimNao_(value) { const v = String(value || '').trim().toUpperCase(); if (v === 'SIM' || v === 'S') return 'SIM'; if (v === 'NÃO' || v === 'NAO' || v === 'N') return 'NAO'; return ''; }
function toBoolean_(value) { if (value === true) return true; const v = String(value || '').trim().toLowerCase(); return v === 'true' || v === '1' || v === 'sim' || v === 'yes'; }
function parseBirthDateToIso_(raw) {
  const timeZone = cleanText_(LAB_CFG.DEFAULTS.PROJECT_TIME_ZONE) || Session.getScriptTimeZone();
  if (raw instanceof Date && String(raw) !== 'Invalid Date') return Utilities.formatDate(raw, timeZone, 'yyyy-MM-dd');
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const m = value.replace(/\s+/g, '').replace(/[.\-]/g, '/').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return '';
  let day = parseInt(m[1], 10), month = parseInt(m[2], 10), year = parseInt(m[3], 10);
  if (String(m[3]).length === 2) year = year <= 29 ? 2000 + year : 1900 + year;
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  return Utilities.formatDate(date, timeZone, 'yyyy-MM-dd');
}
function sha256_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function(b) { const v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
}
function isExpiredDateValue_(value) { if (!value) return true; const date = value instanceof Date ? value : new Date(value); return String(date) === 'Invalid Date' ? true : date.getTime() < new Date().getTime(); }
function isUsableUrl_(value) { return /^https?:\/\//i.test(String(value || '').trim()); }
function htmlEscape_(value) { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function tokenFingerprint_(value) { const text = cleanText_(value); return text ? sha256_(text).slice(0, 12) : ''; }
function sanitizeJsonpCallback_(value) { const callback = String(value || '').trim(); return /^[a-zA-Z_$][\w.$]*$/.test(callback) ? callback : 'labConfirmCallback'; }
function readPositiveIntegerSetting_(value, fallback, minimum) { const parsed = parseInt(String(value || '').trim(), 10); return Math.max(Number(minimum || 0), Number.isFinite(parsed) ? parsed : fallback); }
function generateId_(prefix) { return prefix + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 16); }

function processSignupPayload_(ss, settings, payload, source) {
  const nome = cleanText_(payload.nome), email = normalizeEmail_(payload.email), birthRaw = cleanText_(payload.dataAniversario), birthIso = parseBirthDateToIso_(birthRaw);
  const instituicao = cleanText_(payload.instituicao), oficinasCordel = normalizeSimNao_(payload.oficinasCordel), telefoneDigits = normalizePhone_(payload.telefone);
  const consentAccepted = toBoolean_(payload.consentAccepted), termsVersion = cleanText_(payload.termsVersion || settings.TERMS_VERSION);
  const page = cleanText_(payload.page || 'cadastro'), userAgent = cleanText_(payload.userAgent || ''), flowSource = cleanText_(source || 'native_cadastro_form'), now = new Date();
  
  const denySignup = function(code, message, details) {
    logAccess_(ss, 'signup', email, 'DENIED', code, page, flowSource, userAgent, details || message || '');
    return { ok: false, code: code, message: message, details: details || '' };
  };

  if (!nome || nome.length < 3) return denySignup('NOME_INVALIDO', 'Informe seu nome completo.');
  if (!email) return denySignup('EMAIL_INVALIDO', 'Informe um email valido.');
  if (!birthIso) return denySignup('DATA_INVALIDA', 'Informe a data de nascimento no formato dd/mm/aaaa.', 'valor_recebido=' + birthRaw);
  
  const audience = buildSignupAudienceProfile_(settings, birthIso, now);
  if (!audience) return denySignup('DATA_INVALIDA', 'Nao foi possivel classificar a idade.', 'valor_recebido=' + birthRaw);
  if (!instituicao) return denySignup('INSTITUICAO_OBRIGATORIA', "Informe a instituicao.");
  if (!oficinasCordel) return denySignup('OFICINAS_OBRIGATORIO', 'Informe se voce fez as oficinas.');
  if (!telefoneDigits || telefoneDigits.length < 8 || telefoneDigits.length > 15) {
    return denySignup('TELEFONE_INVALIDO', 'Informe telefone com código do país e número válido.');
  }
  if (!consentAccepted) return denySignup('CONSENTIMENTO_OBRIGATORIO', 'E necessario aceitar o termo.');

  const existingUser = findUserByEmail_(ss, email);
  if (existingUser) {
    logAccess_(ss, 'signup', email, 'DENIED', 'EMAIL_JA_CADASTRADO', page, flowSource, userAgent, 'user_id=' + cleanText_(existingUser.user_id));
    return { ok: false, code: 'EMAIL_JA_CADASTRADO', message: 'Ja existe um registro com este email.' };
  }

  const userId = generateId_('USR');
  appendObjectRow_(ss.getSheetByName(LAB_CFG.SHEETS.USERS), {
    user_id: userId, created_at: now, updated_at: now, status: 'ACTIVE', nome: nome, email: email,
    faixa_etaria_cadastro: audience.faixaEtaria, is_minor: audience.isMinor, instituicao: instituicao,
    oficinas_cordel: oficinasCordel, phone_hash: sha256_(telefoneDigits), phone_last4: telefoneDigits.slice(-4),
    consent_current_version: termsVersion, consent_current_at: now, source_page: page, signup_source: flowSource, signup_at: now,
    email_confirmed_at: now, email_confirmation_token: '', email_confirmation_sent_at: '',
    welcome_email_template: audience.welcomeTemplate, welcome_email_sent_at: '', notes: 'Cadastro ativo após aceite do termo.'
  });
  logConsent_(ss, 'signup', userId, email, termsVersion, true, page, flowSource, userAgent, 'Consentimento no cadastro');
  
  try {
    sendWelcomeEmail_(settings, email, nome, audience.welcomeTemplate);
    const savedUserRecord = findUserByEmail_(ss, email);
    if (savedUserRecord) {
      updateUserFields_(ss, savedUserRecord._rowNumber, { updated_at: new Date(), welcome_email_sent_at: new Date(), notes: 'Cadastro ativo; email de boas-vindas enviado.' });
    }
    logAccess_(ss, 'signup', email, 'ALLOWED', 'WELCOME_EMAIL_SENT', page, flowSource, userAgent, 'classificacao=' + audience.faixaEtaria);
  } catch (err) {
    logAccess_(ss, 'signup', email, 'ERROR', 'ENVIO_BOAS_VINDAS_FALHOU', page, flowSource, userAgent, String(err));
    return { ok: false, code: 'ENVIO_BOAS_VINDAS_FALHOU', message: 'Cadastro salvo, mas nao foi possivel enviar o email de boas-vindas. Tente depois.' };
  }
  return {
    ok: true,
    code: 'SIGNUP_WELCOME_SENT',
    message: 'Cadastro recebido. Enviamos o email de boas-vindas e vamos direcionar você ao laboratório.',
    userId: userId,
    redirectUrl: resolveLabUrl_(settings)
  };
}
