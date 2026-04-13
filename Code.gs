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
    PROJECT_NAME: 'Laboratório Cordel 2.0',
    TERMS_VERSION: '2026-04-v1',
    TERMS_URL: 'https://www.cordel2pontozero.com/s/laboratorio_cordel_2_0_termos_referencias_ABRIL2026.pdf',
    PRIVACY_NOTICE_SHORT: 'Coletamos dados mínimos de identificação, acesso e participação para o funcionamento ético e organizado do Laboratório Cordel 2.0.',
    PROJECT_URL: 'https://www.cordel2pontozero.com/',
    LAB_URL: 'https://www.cordel2pontozero.com/laboratorio',
    CHECKIN_URL: 'https://www.cordel2pontozero.com/checkin',
    WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbxbMB-LjETyDv0up9rnbyU7OblhzFLUW9GYhFeE8OcggbvwtW7sYtYy5qxfuiIhIfFo/exec',
    PROJECT_TIME_ZONE: 'America/Sao_Paulo',
    LAB_ACCESS_TOKEN_TTL_MINUTES: '10',
    LAB_BROWSER_SESSION_TTL_MINUTES: '240',
    TOKEN_HOUSEKEEPING_INTERVAL_MINUTES: '180',
    PASSWORD_SETUP_TOKEN_TTL_HOURS: '24',
    BACKUP_FOLDER_ID: ''
  }
};

function getUsersSheetHeaders_() {
  return [
    'user_id',
    'created_at',
    'updated_at',
    'status',
    'nome',
    'email',
    'faixa_etaria_cadastro',
    'is_minor',
    'instituicao',
    'oficinas_cordel',
    'phone_hash',
    'phone_last4',
    'consent_current_version',
    'consent_current_at',
    'source_page',
    'signup_source',
    'signup_at',
    'email_confirmed_at',
    'email_confirmation_token',
    'email_confirmation_sent_at',
    'auth_password_hash',
    'auth_password_updated_at',
    'auth_password_token',
    'auth_password_token_sent_at',
    'auth_password_token_expires_at',
    'welcome_email_template',
    'welcome_email_sent_at',
    'notes'
  ];
}

function doGet(e) {
  return handleRequest_(e, 'GET');
}

function doPost(e) {
  return handleRequest_(e, 'POST');
}

function handleRequest_(e, method) {
  let payload = {};
  try {
    payload = parsePayload_(e, method);
    const action = String(payload.action || '').trim();

    if (!action) {
      return jsonOut_({ ok: false, code: 'MISSING_ACTION', message: 'Ação não informada.' });
    }

    if (action === 'config') return getConfig_();
    if (action === 'confirm') return confirmEmail_(payload);
    if (action === 'confirm_jsonp') return confirmEmailJsonp_(payload);
    if (action === 'set_password') return setPassword_(payload);
    if (action === 'validate_lab_access_jsonp') return validateLabAccessJsonp_(payload);
    if (action === 'signup') return signup_(payload);
    if (action === 'reset_password') return resetPassword_(payload);
    if (action === 'reset_password_jsonp') return resetPasswordJsonp_(payload);
    if (action === 'login') return login_(payload);
    if (action === 'login_jsonp') return loginJsonp_(payload);

    return jsonOut_({ ok: false, code: 'INVALID_ACTION', message: 'Ação inválida.' });
  } catch (err) {
    const errorPayload = {
      ok: false,
      code: 'SERVER_ERROR',
      message: String(err)
    };

    if (String(payload.callback || '').trim()) {
      return jsonpOut_(payload.callback, errorPayload);
    }

    return jsonOut_(errorPayload);
  }
}

/**
 * Execute manualmente esta função uma vez para montar ou atualizar a planilha.
 */
function setupLabCheckin() {
  const ss = getLabSpreadsheet_(true);

  createSheetIfMissing_(ss, LAB_CFG.SHEETS.SETTINGS, [
    'key', 'value'
  ]);

  createSheetIfMissing_(ss, LAB_CFG.SHEETS.USERS, getUsersSheetHeaders_());

  createSheetIfMissing_(ss, LAB_CFG.SHEETS.ALLOWLIST, [
    'email',
    'status',
    'notes',
    'created_at'
  ]);

  createSheetIfMissing_(ss, LAB_CFG.SHEETS.CONSENT_LOG, [
    'log_id',
    'timestamp',
    'event_type',
    'user_id',
    'email',
    'terms_version',
    'consent_accepted',
    'page',
    'source',
    'user_agent',
    'notes'
  ]);

  createSheetIfMissing_(ss, LAB_CFG.SHEETS.ACCESS_LOG, [
    'log_id',
    'timestamp',
    'event_type',
    'email',
    'result',
    'reason',
    'page',
    'source',
    'user_agent',
    'notes'
  ]);

  seedSettings_(ss);
  syncCriticalSettings_(ss);
  ensureUsersSheetSchema_(ss, readSettingsMap_(ss));
  clearLegacyFormSettings_(ss);
  cleanupLegacySignupFormTriggers_();
  formatSheets_(ss);
  const housekeeping = runTokenHousekeeping_(ss, readSettingsMap_(ss), true);

  return 'Setup concluído. Planilha: ' + ss.getUrl() +
    '\nHousekeeping: lab_tokens_removidos=' + housekeeping.labTokensRemoved +
    ', password_tokens_limpos=' + housekeeping.passwordTokensCleared + '.';
}

/**
 * Limpa cadastros e logs, preservando SETTINGS e ALLOWLIST.
 */
function resetPlanilhaCheckin() {
  const ss = getLabSpreadsheet_(false);
  const settings = readSettingsMap_(ss);
  const backupSheets = [
    ss.getSheetByName(LAB_CFG.SHEETS.USERS),
    ss.getSheetByName(LAB_CFG.SHEETS.CONSENT_LOG),
    ss.getSheetByName(LAB_CFG.SHEETS.ACCESS_LOG)
  ];
  const backupFolder = getOrCreateBackupFolder_(settings, ss);
  const backupFiles = backupSheetsAsCsv_(ss, backupSheets, backupFolder);

  backupSheets.forEach(function(sh) {
    clearSheetDataRows_(sh);
  });

  return 'Reset concluído: USERS, CONSENT_LOG e ACCESS_LOG foram limpas. ' +
    'Backups CSV salvos em: ' + backupFolder.getUrl() + ' (' + backupFiles.length + ' arquivo(s)).';
}

/**
 * Restaura o backup CSV mais recente das abas USERS, CONSENT_LOG e ACCESS_LOG.
 */
function restaurarUltimoBackupCheckin() {
  const ss = getLabSpreadsheet_(false);
  const settings = readSettingsMap_(ss);
  const folder = getOrCreateBackupFolder_(settings, ss);
  const targetSheets = [
    LAB_CFG.SHEETS.USERS,
    LAB_CFG.SHEETS.CONSENT_LOG,
    LAB_CFG.SHEETS.ACCESS_LOG
  ];
  const restored = [];

  targetSheets.forEach(function(sheetName) {
    const file = findLatestBackupFileForSheet_(folder, ss.getName(), sheetName);
    if (!file) return;

    const csv = file.getBlob().getDataAsString('UTF-8');
    const rows = Utilities.parseCsv(csv);
    const sh = ss.getSheetByName(sheetName);
    if (!sh || !rows.length) return;

    clearSheetDataRows_(sh);
    if (rows.length > 1) {
      sh.getRange(2, 1, rows.length - 1, rows[1].length).setValues(rows.slice(1));
    }
    restored.push(sheetName);
  });

  if (!restored.length) {
    return 'Nenhum backup CSV compatível foi encontrado para restauração.';
  }

  return 'Restauração concluída para: ' + restored.join(', ') + '.';
}

function seedSettings_(ss) {
  const sh = ss.getSheetByName(LAB_CFG.SHEETS.SETTINGS);
  const existing = readSettingsMap_(ss);

  const defaults = {
    PROJECT_NAME: LAB_CFG.DEFAULTS.PROJECT_NAME,
    TERMS_VERSION: LAB_CFG.DEFAULTS.TERMS_VERSION,
    TERMS_URL: LAB_CFG.DEFAULTS.TERMS_URL,
    PRIVACY_NOTICE_SHORT: LAB_CFG.DEFAULTS.PRIVACY_NOTICE_SHORT,
    PROJECT_URL: LAB_CFG.DEFAULTS.PROJECT_URL,
    LAB_URL: LAB_CFG.DEFAULTS.LAB_URL,
    CHECKIN_URL: LAB_CFG.DEFAULTS.CHECKIN_URL,
    WEB_APP_URL: LAB_CFG.DEFAULTS.WEB_APP_URL,
    PROJECT_TIME_ZONE: LAB_CFG.DEFAULTS.PROJECT_TIME_ZONE,
    LAB_ACCESS_TOKEN_TTL_MINUTES: LAB_CFG.DEFAULTS.LAB_ACCESS_TOKEN_TTL_MINUTES,
    LAB_BROWSER_SESSION_TTL_MINUTES: LAB_CFG.DEFAULTS.LAB_BROWSER_SESSION_TTL_MINUTES,
    TOKEN_HOUSEKEEPING_INTERVAL_MINUTES: LAB_CFG.DEFAULTS.TOKEN_HOUSEKEEPING_INTERVAL_MINUTES,
    PASSWORD_SETUP_TOKEN_TTL_HOURS: LAB_CFG.DEFAULTS.PASSWORD_SETUP_TOKEN_TTL_HOURS,
    BACKUP_FOLDER_ID: LAB_CFG.DEFAULTS.BACKUP_FOLDER_ID
  };

  const rowsToAppend = [];
  Object.keys(defaults).forEach(function(key) {
    if (!existing[key]) {
      rowsToAppend.push([key, defaults[key]]);
    }
  });

  if (rowsToAppend.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rowsToAppend.length, 2).setValues(rowsToAppend);
  }
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
  upsertSetting_(ss, 'PASSWORD_SETUP_TOKEN_TTL_HOURS', LAB_CFG.DEFAULTS.PASSWORD_SETUP_TOKEN_TTL_HOURS);
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

function getProjectTimeZone_(settings) {
  return cleanText_(settings && settings.PROJECT_TIME_ZONE) ||
    cleanText_(LAB_CFG.DEFAULTS.PROJECT_TIME_ZONE) ||
    cleanText_(Session.getScriptTimeZone()) ||
    'America/Sao_Paulo';
}

function getLocalIsoDate_(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value);
  if (String(date) === 'Invalid Date') return '';
  return Utilities.formatDate(date, timeZone || getProjectTimeZone_(), 'yyyy-MM-dd');
}

function parseIsoDateParts_(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
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
  const beforeBirthday =
    reference.month < birth.month ||
    (reference.month === birth.month && reference.day < birth.day);

  if (beforeBirthday) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

function classifyBirthDateAtReference_(birthIso, referenceIso) {
  const age = calculateAgeAtIsoDate_(birthIso, referenceIso);
  if (age == null) return null;

  const isMinor = age < 18;
  const faixaEtaria = isMinor ? 'MENOR' : 'MAIOR';

  return {
    age: age,
    isMinor: isMinor,
    faixaEtaria: faixaEtaria,
    welcomeTemplate: getWelcomeTemplateFromBracket_(faixaEtaria)
  };
}

function getReferenceIsoDateFromValue_(value, timeZone) {
  if (!value) return '';

  if (value instanceof Date && String(value) !== 'Invalid Date') {
    return getLocalIsoDate_(value, timeZone);
  }

  const text = cleanText_(value);
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const parsed = new Date(text);
  if (String(parsed) === 'Invalid Date') return '';

  return getLocalIsoDate_(parsed, timeZone);
}

function buildSignupAudienceProfile_(settings, birthIso, referenceDate) {
  const referenceIso = getReferenceIsoDateFromValue_(
    referenceDate || new Date(),
    getProjectTimeZone_(settings)
  );

  if (!referenceIso) return null;

  const classification = classifyBirthDateAtReference_(birthIso, referenceIso);
  if (!classification) return null;

  classification.referenceIso = referenceIso;
  return classification;
}

function appendObjectRow_(sh, fieldMap) {
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function(value) {
    return String(value || '').trim();
  });

  const row = headers.map(function(header) {
    return Object.prototype.hasOwnProperty.call(fieldMap, header) ? fieldMap[header] : '';
  });

  sh.appendRow(row);
}

function getLegacyUserHeadersToDrop_() {
  return ['birth_date_raw', 'birth_date_iso'];
}

function buildMigratedUserRecord_(record, settings) {
  const migrated = {};
  Object.keys(record || {}).forEach(function(key) {
    migrated[key] = record[key];
  });

  const timeZone = getProjectTimeZone_(settings);
  const birthIso = parseBirthDateToIso_(record.birth_date_iso || record.birth_date_raw);
  const signupAt = record.signup_at || record.created_at || '';
  const audience = buildSignupAudienceProfile_(settings, birthIso, signupAt);
  const faixaEtaria = normalizeAgeBracket_(record.faixa_etaria_cadastro) ||
    (audience ? audience.faixaEtaria : '');
  const normalizedMinor = normalizeBooleanCellValue_(record.is_minor);
  const isMinor = normalizedMinor === '' ? (faixaEtaria === 'MENOR') : normalizedMinor;

  migrated.faixa_etaria_cadastro = faixaEtaria;
  migrated.is_minor = isMinor === '' ? '' : Boolean(isMinor);
  migrated.signup_at = signupAt || getReferenceIsoDateFromValue_(record.created_at, timeZone) || '';
  migrated.signup_source = cleanText_(record.signup_source) ||
    (cleanText_(record.source_page) ? 'legacy_checkin_form' : '');
  migrated.welcome_email_template = cleanText_(record.welcome_email_template) ||
    getWelcomeTemplateFromBracket_(faixaEtaria);
  migrated.welcome_email_sent_at = record.welcome_email_sent_at || '';

  delete migrated.birth_date_raw;
  delete migrated.birth_date_iso;

  return migrated;
}

function ensureUsersSheetSchema_(ss, settings) {
  const sh = ss.getSheetByName(LAB_CFG.SHEETS.USERS);
  const desiredHeaders = getUsersSheetHeaders_();
  if (!sh) {
    createSheetIfMissing_(ss, LAB_CFG.SHEETS.USERS, desiredHeaders);
    return;
  }

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, desiredHeaders.length).setValues([desiredHeaders]);
    return;
  }

  const currentHeaders = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function(value) {
    return String(value || '').trim();
  });
  const legacyHeaders = getLegacyUserHeadersToDrop_();
  const extraHeaders = currentHeaders.filter(function(header) {
    return header &&
      desiredHeaders.indexOf(header) === -1 &&
      legacyHeaders.indexOf(header) === -1;
  });
  const targetHeaders = desiredHeaders.concat(extraHeaders);
  const isSameSchema =
    currentHeaders.length === targetHeaders.length &&
    currentHeaders.every(function(header, index) {
      return header === targetHeaders[index];
    });

  if (isSameSchema) return;

  const values = sh.getDataRange().getValues();
  const rewrittenRows = values.slice(1).map(function(row) {
    const migrated = buildMigratedUserRecord_(mapRow_(currentHeaders, row), settings);
    return targetHeaders.map(function(header) {
      return Object.prototype.hasOwnProperty.call(migrated, header) ? migrated[header] : '';
    });
  });

  sh.clearContents();
  sh.getRange(1, 1, 1, targetHeaders.length).setValues([targetHeaders]);

  if (rewrittenRows.length) {
    sh.getRange(2, 1, rewrittenRows.length, targetHeaders.length).setValues(rewrittenRows);
  }
}

function clearLegacyFormSettings_(ss) {
  ['FORM_ID', 'FORM_PUBLISHED_URL', 'FORM_EMBED_URL'].forEach(function(key) {
    upsertSetting_(ss, key, '');
  });
}

function cleanupLegacySignupFormTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'onSignupFormSubmit') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function getConfig_() {
  const ss = getLabSpreadsheet_(false);
  const settings = readSettingsMap_(ss);
  runTokenHousekeeping_(ss, settings, false);

  return jsonOut_({
    ok: true,
    projectName: settings.PROJECT_NAME || LAB_CFG.DEFAULTS.PROJECT_NAME,
    termsVersion: settings.TERMS_VERSION || LAB_CFG.DEFAULTS.TERMS_VERSION,
    termsUrl: settings.TERMS_URL || LAB_CFG.DEFAULTS.TERMS_URL,
    privacyNoticeShort: settings.PRIVACY_NOTICE_SHORT || LAB_CFG.DEFAULTS.PRIVACY_NOTICE_SHORT,
    projectUrl: settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL,
    labUrl: settings.LAB_URL || LAB_CFG.DEFAULTS.LAB_URL,
    checkinUrl: settings.CHECKIN_URL || ''
  });
}

function issueLabAccessToken_(settings, email, userId) {
  const props = PropertiesService.getScriptProperties();
  const now = new Date();
  const ttlMinutes = readPositiveIntegerSetting_(settings.LAB_ACCESS_TOKEN_TTL_MINUTES, 10, 3);
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
  const rawToken = generateId_('LAB') + generateId_('TOK');
  const hashedToken = sha256_(rawToken);

  props.setProperty(
    'LAB_ACCESS_TOKEN_' + hashedToken,
    JSON.stringify({
      email: cleanText_(email),
      userId: cleanText_(userId),
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString()
    })
  );

  return {
    token: rawToken,
    expiresAt: expiresAt
  };
}

function buildLabEntryUrl_(settings, token) {
  const baseUrl = cleanText_(settings.LAB_URL || LAB_CFG.DEFAULTS.LAB_URL);
  const sep = baseUrl.indexOf('?') >= 0 ? '&' : '?';
  return baseUrl + sep + 'access_token=' + encodeURIComponent(token);
}

function housekeepingTokensCheckin() {
  const ss = getLabSpreadsheet_(false);
  const settings = readSettingsMap_(ss);
  const summary = runTokenHousekeeping_(ss, settings, true);
  return 'Housekeeping concluído: ' +
    'lab_tokens_removidos=' + summary.labTokensRemoved +
    '; lab_tokens_corrompidos=' + summary.labTokensCorrupted +
    '; password_tokens_limpos=' + summary.passwordTokensCleared + '.';
}

function runTokenHousekeeping_(ss, settings, force) {
  const props = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  const now = new Date();
  const intervalMinutes = readPositiveIntegerSetting_(
    settings.TOKEN_HOUSEKEEPING_INTERVAL_MINUTES,
    180,
    15
  );
  const lastRunAt = cleanText_(props.getProperty('LAB_TOKEN_HOUSEKEEPING_LAST_AT'));

  if (!force && lastRunAt && !isExpiredDateValue_(new Date(new Date(lastRunAt).getTime() + intervalMinutes * 60 * 1000))) {
    return {
      ok: true,
      skipped: true,
      reason: 'NOT_DUE',
      labTokensRemoved: 0,
      labTokensCorrupted: 0,
      passwordTokensCleared: 0
    };
  }

  if (!lock.tryLock(5000)) {
    return {
      ok: false,
      skipped: true,
      reason: 'LOCKED',
      labTokensRemoved: 0,
      labTokensCorrupted: 0,
      passwordTokensCleared: 0
    };
  }

  try {
    let labTokensRemoved = 0;
    let labTokensCorrupted = 0;
    let passwordTokensCleared = 0;
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

    const usersSheet = ss.getSheetByName(LAB_CFG.SHEETS.USERS);
    if (usersSheet && usersSheet.getLastRow() > 1) {
      const range = usersSheet.getDataRange();
      const values = range.getValues();
      const headers = values[0];
      const updatedAtIndex = headers.indexOf('updated_at');
      const tokenIndex = headers.indexOf('auth_password_token');
      const tokenSentAtIndex = headers.indexOf('auth_password_token_sent_at');
      const tokenExpiresAtIndex = headers.indexOf('auth_password_token_expires_at');
      let usersChanged = false;

      if (tokenIndex >= 0 && tokenExpiresAtIndex >= 0) {
        for (let i = 1; i < values.length; i++) {
          const row = values[i];
          if (!cleanText_(row[tokenIndex])) continue;
          if (!isExpiredDateValue_(row[tokenExpiresAtIndex])) continue;

          row[tokenIndex] = '';
          if (tokenSentAtIndex >= 0) row[tokenSentAtIndex] = '';
          row[tokenExpiresAtIndex] = '';
          if (updatedAtIndex >= 0) row[updatedAtIndex] = now;
          passwordTokensCleared++;
          usersChanged = true;
        }
      }

      if (usersChanged) {
        range.setValues(values);
      }
    }

    props.setProperty('LAB_TOKEN_HOUSEKEEPING_LAST_AT', now.toISOString());

    if (force || labTokensRemoved || labTokensCorrupted || passwordTokensCleared) {
      logAccess_(
        ss,
        'housekeeping_tokens',
        '',
        'OK',
        'RUN',
        'system',
        'script',
        '',
        'lab_tokens_removidos=' + labTokensRemoved +
          '; lab_tokens_corrompidos=' + labTokensCorrupted +
          '; password_tokens_limpos=' + passwordTokensCleared +
          '; intervalo_min=' + intervalMinutes
      );
    }

    return {
      ok: true,
      skipped: false,
      reason: 'RUN',
      labTokensRemoved: labTokensRemoved,
      labTokensCorrupted: labTokensCorrupted,
      passwordTokensCleared: passwordTokensCleared
    };
  } finally {
    lock.releaseLock();
  }
}

function validateLabAccessJsonp_(payload) {
  const ss = getLabSpreadsheet_(false);
  const settings = readSettingsMap_(ss);
  const callback = sanitizeJsonpCallback_(payload.callback);
  const result = processValidateLabAccessPayload_(ss, settings, payload);
  return ContentService
    .createTextOutput(callback + '(' + JSON.stringify(result) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function processValidateLabAccessPayload_(ss, settings, payload) {
  runTokenHousekeeping_(ss, settings, false);
  const token = cleanText_(payload.token);
  const page = cleanText_(payload.page || 'laboratório');
  const userAgent = cleanText_(payload.userAgent || '');

  if (!token) {
    logAccess_(ss, 'lab_access', '', 'DENIED', 'TOKEN_OBRIGATORIO', page, 'site', userAgent, '');
    return {
      ok: false,
      code: 'TOKEN_OBRIGATORIO',
      message: 'O acesso ao laboratório precisa de um token valido.'
    };
  }

  const props = PropertiesService.getScriptProperties();
  const hashedToken = sha256_(token);
  const propertyKey = 'LAB_ACCESS_TOKEN_' + hashedToken;
  const raw = props.getProperty(propertyKey);

  if (!raw) {
    logAccess_(ss, 'lab_access', '', 'DENIED', 'TOKEN_INVALIDO', page, 'site', userAgent, 'token_ref=' + tokenFingerprint_(token));
    return {
      ok: false,
      code: 'TOKEN_INVALIDO',
      message: 'Este link de acesso não está mais disponível. Volte ao check-in para gerar um novo.'
    };
  }

  let record = null;
  try {
    record = JSON.parse(raw);
  } catch (err) {
    props.deleteProperty(propertyKey);
    logAccess_(ss, 'lab_access', '', 'ERROR', 'TOKEN_CORROMPIDO', page, 'site', userAgent, 'token_ref=' + tokenFingerprint_(token) + '; erro=' + String(err));
    return {
      ok: false,
      code: 'TOKEN_INVALIDO',
      message: 'Não foi possível validar este acesso. Gere um novo link pelo check-in.'
    };
  }

  if (isExpiredDateValue_(record.expiresAt)) {
    props.deleteProperty(propertyKey);
    logAccess_(ss, 'lab_access', cleanText_(record.email), 'DENIED', 'TOKEN_EXPIRADO', page, 'site', userAgent, 'token_ref=' + tokenFingerprint_(token));
    return {
      ok: false,
      code: 'TOKEN_EXPIRADO',
      message: 'Este link de acesso expirou. Entre novamente pelo check-in.'
    };
  }

  props.deleteProperty(propertyKey);
  logAccess_(
    ss,
    'lab_access',
    cleanText_(record.email),
    'ALLOWED',
    'OK',
    page,
    'site',
    userAgent,
    'token_ref=' + tokenFingerprint_(token) +
      '; session_ttl=' + readPositiveIntegerSetting_(settings.LAB_BROWSER_SESSION_TTL_MINUTES, 240, 30)
  );

  return {
    ok: true,
    code: 'LAB_ACCESS_OK',
    message: 'Acesso ao laboratório validado.',
    email: cleanText_(record.email),
    sessionTtlMinutes: readPositiveIntegerSetting_(settings.LAB_BROWSER_SESSION_TTL_MINUTES, 240, 30)
  };
}

function login_(payload) {
  const ss = getLabSpreadsheet_(false);
  const settings = readSettingsMap_(ss);
  ensureUsersSheetSchema_(ss, settings);
  const result = processLoginJsonpPayload_(ss, settings, payload);

  const content = result.ok
    ? {
        ok: true,
        title: 'Acesso confirmado',
        message: 'Seu acesso foi validado com sucesso. Estamos preparando sua entrada segura no laboratório.',
        primaryActionLabel: 'Ir para o laboratório',
        primaryActionUrl: cleanText_(result.redirectUrl),
        secondaryActionLabel: 'Voltar ao check-in',
        secondaryActionUrl: cleanText_(settings.CHECKIN_URL || LAB_CFG.DEFAULTS.CHECKIN_URL),
        closeLabel: 'Fechar janela'
      }
    : {
        ok: false,
        title: 'Não foi possível entrar',
        message: cleanText_(result.message || 'Revise seus dados e tente novamente.'),
        primaryActionLabel: 'Voltar ao check-in',
        primaryActionUrl: cleanText_(settings.CHECKIN_URL || LAB_CFG.DEFAULTS.CHECKIN_URL),
        secondaryActionLabel: 'Conhecer o projeto',
        secondaryActionUrl: cleanText_(settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL),
        closeLabel: 'Fechar janela'
      };

  return passwordResultPage_(content, settings);
}

function loginJsonp_(payload) {
  const ss = getLabSpreadsheet_(false);
  const settings = readSettingsMap_(ss);
  ensureUsersSheetSchema_(ss, settings);
  const callback = sanitizeJsonpCallback_(payload.callback);
  const result = processLoginJsonpPayload_(ss, settings, payload);
  return ContentService
    .createTextOutput(callback + '(' + JSON.stringify(result) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function processLoginJsonpPayload_(ss, settings, payload) {
  runTokenHousekeeping_(ss, settings, false);
  const email = normalizeEmail_(payload.email);
  const senha = cleanText_(payload.senha);
  const senhaNormalizada = normalizeAccessPassword_(senha);
  const consentAccepted = toBoolean_(payload.consentAccepted);
  const termsVersion = String(payload.termsVersion || settings.TERMS_VERSION || '').trim();
  const page = String(payload.page || 'checkin').trim();
  const userAgent = String(payload.userAgent || '').trim();

  if (!email) {
    logAccess_(ss, 'login', email, 'DENIED', 'EMAIL_INVALIDO', page, 'site', userAgent, '');
    return { ok: false, code: 'EMAIL_INVALIDO', message: 'Informe um email válido.' };
  }

  if (!consentAccepted) {
    logAccess_(ss, 'login', email, 'DENIED', 'CONSENTIMENTO_OBRIGATORIO', page, 'site', userAgent, '');
    return { ok: false, code: 'CONSENTIMENTO_OBRIGATORIO', message: 'É necessário aceitar o termo para continuar.' };
  }

  const userRecord = findUserByEmail_(ss, email);
  const allowRecord = findAllowlistedEmail_(ss, email);

  if (!userRecord && !allowRecord) {
    logAccess_(ss, 'login', email, 'DENIED', 'EMAIL_NAO_AUTORIZADO', page, 'site', userAgent, '');
    return {
      ok: false,
      code: 'EMAIL_NAO_AUTORIZADO',
      message: 'Este email não foi encontrado. Você pode realizar o cadastro para solicitar acesso.'
    };
  }

  if (userRecord) {
    const status = String(userRecord.status || '').toUpperCase();

    if (status === 'PENDING_EMAIL') {
      logAccess_(ss, 'login', email, 'DENIED', 'EMAIL_NAO_CONFIRMADO', page, 'site', userAgent, '');
      return {
        ok: false,
        code: 'EMAIL_NAO_CONFIRMADO',
        message: 'Seu cadastro foi recebido, mas o email ainda não foi confirmado. Verifique sua caixa de entrada.'
      };
    }

    if (status !== 'ACTIVE') {
      logAccess_(ss, 'login', email, 'DENIED', 'USUARIO_INATIVO', page, 'site', userAgent, '');
      return {
        ok: false,
        code: 'USUARIO_INATIVO',
        message: 'Seu cadastro existe, mas não está ativo no momento.'
      };
    }

    if (!senha) {
      logAccess_(ss, 'login', email, 'DENIED', 'SENHA_OBRIGATORIA', page, 'site', userAgent, '');
      return {
        ok: false,
        code: 'SENHA_OBRIGATORIA',
        message: 'Informe a senha que você definiu para continuar.'
      };
    }

    if (!cleanText_(userRecord.auth_password_hash)) {
      logAccess_(ss, 'login', email, 'DENIED', 'SENHA_NAO_CONFIGURADA', page, 'site', userAgent, '');
      return {
        ok: false,
        code: 'SENHA_NAO_CONFIGURADA',
        message: 'Sua senha ainda não está pronta. Use a opção de gerar nova senha por email.'
      };
    }

    const storedPasswordHash = cleanText_(userRecord.auth_password_hash);
    const passwordMatches =
      sha256_(senha) === storedPasswordHash ||
      (senhaNormalizada && sha256_(senhaNormalizada) === storedPasswordHash);

    if (!passwordMatches) {
      logAccess_(ss, 'login', email, 'DENIED', 'SENHA_INVALIDA', page, 'site', userAgent, '');
      return {
        ok: false,
        code: 'SENHA_INVALIDA',
        message: 'A senha informada não confere com a senha cadastrada para este acesso.'
      };
    }
  }

  logConsent_(
    ss,
    'login',
    userRecord ? userRecord.user_id : '',
    email,
    termsVersion,
    true,
    page,
    'site',
    userAgent,
    'Consentimento no fluxo de entrada'
  );

  const labAccess = issueLabAccessToken_(settings, email, userRecord ? userRecord.user_id : '');
  const redirectUrl = buildLabEntryUrl_(settings, labAccess.token);

  logAccess_(
    ss,
    'login',
    email,
    'ALLOWED',
    'OK',
    page,
    'site',
    userAgent,
    'redirect_emitido=' + String(redirectUrl ? 'SIM' : 'NAO') +
      '; token_ref=' + tokenFingerprint_(labAccess.token) +
      '; expira_em=' + labAccess.expiresAt.toISOString() +
      '; redirect_url=' + redirectUrl
  );

  return {
    ok: true,
    code: 'LOGIN_OK',
    message: 'Acesso validado com sucesso.',
    redirectUrl: redirectUrl,
    userType: userRecord ? 'registered' : 'allowlisted'
  };
}

function signup_(payload) {
  const ss = getLabSpreadsheet_(false);
  const settings = readSettingsMap_(ss);
  ensureUsersSheetSchema_(ss, settings);
  return jsonOut_(processSignupPayload_(ss, settings, payload, 'custom_checkin_form'));
}

function confirmEmail_(payload) {
  const result = processConfirmEmail_(payload);
  return confirmationPage_(result.content, result.settings);
}

function confirmEmailJsonp_(payload) {
  const result = processConfirmEmail_(payload);
  const callback = sanitizeJsonpCallback_(payload.callback);
  const body = callback + '(' + JSON.stringify(result.content) + ');';
  return ContentService
    .createTextOutput(body)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function processConfirmEmail_(payload) {
  const ss = getLabSpreadsheet_(false);
  const settings = readSettingsMap_(ss);
  ensureUsersSheetSchema_(ss, settings);
  runTokenHousekeeping_(ss, settings, false);
  const email = normalizeEmail_(payload.email);
  const token = cleanText_(payload.token);
  const page = cleanText_(payload.page || 'email_confirmation');

  if (!email || !token) {
    logAccess_(ss, 'confirm_email', email, 'DENIED', 'LINK_INVALIDO', page, 'email', '', '');
    return {
      settings: settings,
      content: {
        ok: false,
        title: 'Link de confirmação inválido',
        message: 'O link de confirmação está incompleto ou expirado. Volte ao check-in e solicite novo envio.',
        primaryActionLabel: 'Voltar ao check-in',
        primaryActionUrl: settings.CHECKIN_URL || LAB_CFG.DEFAULTS.CHECKIN_URL,
        secondaryActionLabel: 'Conhecer o projeto',
        secondaryActionUrl: settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL,
        closeLabel: 'Fechar janela'
      }
    };
  }

  const userRecord = findUserByEmail_(ss, email);
  if (!userRecord) {
    logAccess_(ss, 'confirm_email', email, 'DENIED', 'USUARIO_NAO_ENCONTRADO', page, 'email', '', '');
    return {
      settings: settings,
      content: {
        ok: false,
        title: 'Cadastro não encontrado',
        message: 'Não localizamos um cadastro compatível com esse link. Você pode realizar um novo cadastro no check-in.',
        primaryActionLabel: 'Voltar ao check-in',
        primaryActionUrl: settings.CHECKIN_URL || LAB_CFG.DEFAULTS.CHECKIN_URL,
        secondaryActionLabel: 'Conhecer o projeto',
        secondaryActionUrl: settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL,
        closeLabel: 'Fechar janela'
      }
    };
  }

  if (String(userRecord.status || '').toUpperCase() === 'ACTIVE' && cleanText_(userRecord.email_confirmed_at)) {
    logAccess_(ss, 'confirm_email', email, 'ALLOWED', 'JA_CONFIRMADO', page, 'email', '', '');
    return {
      settings: settings,
      content: {
        ok: true,
        title: 'Email já confirmado',
        message: 'Seu email já foi confirmado anteriormente. Você já pode entrar com a senha que escolheu ou solicitar um novo link para trocar sua senha no check-in.',
        primaryActionLabel: 'Voltar ao check-in',
        primaryActionUrl: settings.CHECKIN_URL || LAB_CFG.DEFAULTS.CHECKIN_URL,
        secondaryActionLabel: 'Conhecer o projeto',
        secondaryActionUrl: settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL,
        closeLabel: 'Fechar janela'
      }
    };
  }

  if (cleanText_(userRecord.email_confirmation_token) !== token) {
    logAccess_(ss, 'confirm_email', email, 'DENIED', 'TOKEN_INVALIDO', page, 'email', '', 'token_ref=' + tokenFingerprint_(token));
    return {
      settings: settings,
      content: {
        ok: false,
        title: 'Token de confirmação inválido',
        message: 'Este link não corresponde ao cadastro atual. Solicite um novo email de confirmação no check-in.',
        primaryActionLabel: 'Voltar ao check-in',
        primaryActionUrl: settings.CHECKIN_URL || LAB_CFG.DEFAULTS.CHECKIN_URL,
        secondaryActionLabel: 'Conhecer o projeto',
        secondaryActionUrl: settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL,
        closeLabel: 'Fechar janela'
      }
    };
  }

  const now = new Date();
  updateUserFields_(ss, userRecord._rowNumber, {
    updated_at: now,
    status: 'ACTIVE',
    email_confirmed_at: now,
    email_confirmation_token: '',
    notes: 'Email confirmado com sucesso.'
  });

  let passwordMessage = 'Seu email foi confirmado. Se precisar, use a opção de criar uma senha no check-in.';
  let passwordSetupMeta = null;
  try {
    passwordSetupMeta = issuePasswordSetupLinkForUser_(ss, settings, userRecord, 'Link inicial para definir senha enviado após confirmação de email');
    passwordMessage = 'Seu email foi confirmado e enviamos um link seguro para você definir sua senha.';
  } catch (err) {
    logAccess_(ss, 'set_password', email, 'ERROR', 'ENVIO_LINK_SENHA_FALHOU', page, 'email', '', String(err));
  }

  logAccess_(
    ss,
    'confirm_email',
    email,
    'ALLOWED',
    'OK',
    page,
    'email',
    '',
    'token_ref=' + tokenFingerprint_(token) +
      '; password_link_emitido=' + String(passwordSetupMeta ? 'SIM' : 'NAO') +
      '; password_token_ref=' + (passwordSetupMeta ? tokenFingerprint_(passwordSetupMeta.token) : '')
  );

  const refreshedUserRecord = findUserByEmail_(ss, email);
  const passwordSetupUrl = refreshedUserRecord
    ? buildPasswordSetupUrl_(settings, email, cleanText_(refreshedUserRecord.auth_password_token))
    : cleanText_(settings.CHECKIN_URL || LAB_CFG.DEFAULTS.CHECKIN_URL);

  return {
    settings: settings,
    content: {
      ok: true,
      title: 'Email confirmado com sucesso',
      message: 'Seu email foi confirmado com sucesso. ' + passwordMessage,
      primaryActionLabel: 'Definir minha senha',
      primaryActionUrl: passwordSetupUrl,
      secondaryActionLabel: 'Conhecer o projeto',
      secondaryActionUrl: settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL,
      closeLabel: 'Fechar janela'
    }
  };
}

function sendConfirmationEmail_(settings, email, nome, token) {
  const projectName = settings.PROJECT_NAME || LAB_CFG.DEFAULTS.PROJECT_NAME;
  const projectUrl = settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL;
  const confirmationUrl = buildConfirmationUrl_(settings, email, token);
  const safeName = htmlEscape_(nome || 'participante');

  const subject = projectName + ' | Confirme seu email para ativar o acesso';
  const plainBody =
    'Olá, ' + (nome || 'participante') + '!\n\n' +
    'Seja bem-vindo ao ' + projectName + '.\n' +
    'Para ativar seu acesso, confirme seu email pelo link abaixo:\n' +
    confirmationUrl + '\n\n' +
    'Depois da confirmação, enviaremos um link seguro para você definir sua própria senha.\n\n' +
    'Conheça o projeto: ' + projectUrl;

  const htmlBody =
    '<div style="font-family:Arial,sans-serif;background:#f7efe2;padding:24px;color:#1f1712;">' +
      '<div style="max-width:620px;margin:0 auto;background:#fffaf1;border:1px solid #ead6bc;border-radius:20px;overflow:hidden;">' +
        '<div style="padding:28px 28px 12px;background:linear-gradient(135deg,#f28c00,#c85d00);color:#fff8ef;">' +
          '<p style="margin:0 0 8px;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;font-weight:700;">Boas-vindas</p>' +
          '<h1 style="margin:0;font-size:28px;line-height:1.2;">' + htmlEscape_(projectName) + '</h1>' +
        '</div>' +
        '<div style="padding:28px;">' +
          '<p style="margin:0 0 14px;font-size:16px;line-height:1.6;">Olá, ' + safeName + '.</p>' +
          '<p style="margin:0 0 14px;font-size:16px;line-height:1.6;">Seu cadastro foi recebido. Para ativar o login, confirme seu email no botão abaixo.</p>' +
          '<p style="margin:0 0 20px;font-size:16px;line-height:1.6;">Após a confirmação, enviaremos um <strong>link seguro</strong> para você definir sua própria senha. Se quiser, você poderá trocar novamente sempre que precisar.</p>' +
          '<p style="margin:0 0 22px;">' +
            '<a href="' + htmlEscape_(confirmationUrl) + '" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#e98200;color:#fffaf2;text-decoration:none;font-weight:700;">Confirmar meu email</a>' +
          '</p>' +
          '<p style="margin:0 0 10px;font-size:15px;line-height:1.6;">Você também pode conhecer melhor o projeto antes de entrar:</p>' +
          '<p style="margin:0;">' +
            '<a href="' + htmlEscape_(projectUrl) + '" style="color:#8b3d00;font-weight:700;">Conhecer o projeto Cordel 2.0</a>' +
          '</p>' +
        '</div>' +
      '</div>' +
    '</div>';

  MailApp.sendEmail({
    to: email,
    subject: subject,
    body: plainBody,
    htmlBody: htmlBody,
    name: projectName
  });
}

function resolveWelcomeEmailTemplate_(userRecord) {
  const explicitTemplate = cleanText_(userRecord && userRecord.welcome_email_template).toLowerCase();
  if (explicitTemplate === 'adulto' || explicitTemplate === 'menor') {
    return explicitTemplate;
  }

  const faixaEtaria = normalizeAgeBracket_(userRecord && userRecord.faixa_etaria_cadastro);
  if (faixaEtaria) {
    return getWelcomeTemplateFromBracket_(faixaEtaria);
  }

  const minorValue = normalizeBooleanCellValue_(userRecord && userRecord.is_minor);
  if (minorValue === true) return 'menor';
  if (minorValue === false) return 'adulto';
  return '';
}

function sendWelcomeEmail_(settings, email, nome, templateKey) {
  const projectName = settings.PROJECT_NAME || LAB_CFG.DEFAULTS.PROJECT_NAME;
  const projectUrl = settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL;
  const safeName = htmlEscape_(nome || 'participante');
  const safeProjectName = htmlEscape_(projectName);
  const safeProjectUrl = htmlEscape_(projectUrl);
  const normalizedTemplate = String(templateKey || '').trim().toLowerCase() === 'menor'
    ? 'menor'
    : 'adulto';
  const subject = normalizedTemplate === 'menor'
    ? projectName + ' | Boas-vindas com cuidados de participacao'
    : projectName + ' | Boas-vindas ao laboratorio';

  let plainBody = '';
  let htmlBody = '';

  if (normalizedTemplate === 'menor') {
    plainBody =
      'Ola, ' + (nome || 'participante') + '!\n\n' +
      'Seu acesso ao ' + projectName + ' ja esta pronto.\n\n' +
      'Como este cadastro foi classificado como de menor de idade, reforcamos alguns cuidados especiais:\n' +
      '- use apenas os dados necessarios para participar;\n' +
      '- nao informe documentos, endereco, dados de saude, religiao, biometria ou outras informacoes sensiveis;\n' +
      '- mantenha sua producao autoral com cuidado, respeito e responsabilidade;\n' +
      '- usos publicos de nome, imagem, voz, pesquisa, antologia ou redes sociais podem exigir autorizacao especifica do responsavel legal, quando aplicavel.\n\n' +
      'As ferramentas digitais do laboratorio apoiam a aprendizagem e a criacao, mas nao substituem autoria, revisao humana nem mediacao pedagogica.\n\n' +
      'Conheca o projeto: ' + projectUrl;

    htmlBody =
      '<div style="font-family:Arial,sans-serif;background:#f7efe2;padding:24px;color:#1f1712;">' +
        '<div style="max-width:620px;margin:0 auto;background:#fffaf1;border:1px solid #ead6bc;border-radius:20px;overflow:hidden;">' +
          '<div style="padding:28px 28px 12px;background:linear-gradient(135deg,#f28c00,#c85d00);color:#fff8ef;">' +
            '<p style="margin:0 0 8px;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;font-weight:700;">Boas-vindas</p>' +
            '<h1 style="margin:0;font-size:28px;line-height:1.2;">' + safeProjectName + '</h1>' +
          '</div>' +
          '<div style="padding:28px;">' +
            '<p style="margin:0 0 14px;font-size:16px;line-height:1.6;">Ola, ' + safeName + '.</p>' +
            '<p style="margin:0 0 14px;font-size:16px;line-height:1.6;">Seu acesso ja esta pronto. Como este cadastro foi classificado como de menor de idade, reforcamos alguns cuidados especiais para sua participacao.</p>' +
            '<ul style="margin:0 0 18px 18px;padding:0;font-size:15px;line-height:1.7;">' +
              '<li>Use apenas os dados necessarios para participar.</li>' +
              '<li>Evite informar documentos, endereco, dados de saude, religiao, biometria ou outras informacoes sensiveis.</li>' +
              '<li>Cuide da sua producao autoral com respeito, responsabilidade e atencao.</li>' +
              '<li>Usos publicos de nome, imagem, voz, pesquisa, antologia ou redes sociais podem depender de autorizacao especifica do responsavel legal, quando aplicavel.</li>' +
            '</ul>' +
            '<p style="margin:0 0 14px;font-size:15px;line-height:1.6;">As ferramentas digitais do laboratorio apoiam aprendizagem e criacao, mas nao substituem autoria, revisao humana nem mediacao pedagogica.</p>' +
            '<p style="margin:0;">' +
              '<a href="' + safeProjectUrl + '" style="color:#8b3d00;font-weight:700;">Conhecer o projeto Cordel 2.0</a>' +
            '</p>' +
          '</div>' +
        '</div>' +
      '</div>';
  } else {
    plainBody =
      'Ola, ' + (nome || 'participante') + '!\n\n' +
      'Seu acesso ao ' + projectName + ' ja esta pronto.\n\n' +
      'Reforcamos alguns principios importantes para sua participacao:\n' +
      '- etica no uso das tecnologias e no convivio com outras pessoas;\n' +
      '- protagonismo humano, com autoria e leitura critica sempre no centro;\n' +
      '- equidade, respeito as diferencas e valorizacao da cultura popular;\n' +
      '- protecao de dados, compartilhando apenas o necessario e evitando informacoes sensiveis ou desnecessarias.\n\n' +
      'As ferramentas digitais do laboratorio apoiam reflexao, organizacao e criacao, mas nao substituem responsabilidade humana nem revisao critica.\n\n' +
      'Conheca o projeto: ' + projectUrl;

    htmlBody =
      '<div style="font-family:Arial,sans-serif;background:#f7efe2;padding:24px;color:#1f1712;">' +
        '<div style="max-width:620px;margin:0 auto;background:#fffaf1;border:1px solid #ead6bc;border-radius:20px;overflow:hidden;">' +
          '<div style="padding:28px 28px 12px;background:linear-gradient(135deg,#f28c00,#c85d00);color:#fff8ef;">' +
            '<p style="margin:0 0 8px;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;font-weight:700;">Boas-vindas</p>' +
            '<h1 style="margin:0;font-size:28px;line-height:1.2;">' + safeProjectName + '</h1>' +
          '</div>' +
          '<div style="padding:28px;">' +
            '<p style="margin:0 0 14px;font-size:16px;line-height:1.6;">Ola, ' + safeName + '.</p>' +
            '<p style="margin:0 0 14px;font-size:16px;line-height:1.6;">Seu acesso ja esta pronto. Reforcamos quatro principios importantes para sua participacao no laboratorio.</p>' +
            '<ul style="margin:0 0 18px 18px;padding:0;font-size:15px;line-height:1.7;">' +
              '<li>Etica no uso das tecnologias e no convivio com outras pessoas.</li>' +
              '<li>Protagonismo humano, com autoria e leitura critica sempre no centro.</li>' +
              '<li>Equidade, respeito as diferencas e valorizacao da cultura popular.</li>' +
              '<li>Protecao de dados, compartilhando apenas o necessario e evitando informacoes sensiveis ou desnecessarias.</li>' +
            '</ul>' +
            '<p style="margin:0 0 14px;font-size:15px;line-height:1.6;">As ferramentas digitais do laboratorio apoiam reflexao, organizacao e criacao, mas nao substituem responsabilidade humana nem revisao critica.</p>' +
            '<p style="margin:0;">' +
              '<a href="' + safeProjectUrl + '" style="color:#8b3d00;font-weight:700;">Conhecer o projeto Cordel 2.0</a>' +
            '</p>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  MailApp.sendEmail({
    to: email,
    subject: subject,
    body: plainBody,
    htmlBody: htmlBody,
    name: projectName
  });

  return {
    template: normalizedTemplate,
    subject: subject
  };
}

function resetPassword_(payload) {
  const ss = getLabSpreadsheet_(false);
  const settings = readSettingsMap_(ss);
  const result = processResetPasswordPayload_(ss, settings, payload);
  const content = result.ok
    ? {
        ok: true,
        title: 'Pedido recebido',
        message: cleanText_(result.message || 'Se o email estiver ativo no sistema, enviaremos um link seguro para definir uma nova senha.'),
        primaryActionLabel: 'Voltar ao check-in',
        primaryActionUrl: cleanText_(settings.CHECKIN_URL || LAB_CFG.DEFAULTS.CHECKIN_URL),
        secondaryActionLabel: 'Conhecer o projeto',
        secondaryActionUrl: cleanText_(settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL),
        closeLabel: 'Fechar janela'
      }
    : {
        ok: false,
        title: 'Não foi possível concluir o pedido',
        message: cleanText_(result.message || 'Tente novamente em instantes.'),
        primaryActionLabel: 'Voltar ao check-in',
        primaryActionUrl: cleanText_(settings.CHECKIN_URL || LAB_CFG.DEFAULTS.CHECKIN_URL),
        secondaryActionLabel: 'Conhecer o projeto',
        secondaryActionUrl: cleanText_(settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL),
        closeLabel: 'Fechar janela'
      };

  return passwordResultPage_(content, settings);
}

function resetPasswordJsonp_(payload) {
  const ss = getLabSpreadsheet_(false);
  const settings = readSettingsMap_(ss);
  const callback = sanitizeJsonpCallback_(payload.callback);
  const result = processResetPasswordPayload_(ss, settings, payload);
  return ContentService
    .createTextOutput(callback + '(' + JSON.stringify(result) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function processResetPasswordPayload_(ss, settings, payload) {
  ensureUsersSheetSchema_(ss, settings);
  runTokenHousekeeping_(ss, settings, false);
  const email = normalizeEmail_(payload.email);
  const page = cleanText_(payload.page || 'checkin');
  const userAgent = cleanText_(payload.userAgent || '');

  const genericResponse = {
    ok: true,
    code: 'RESET_PASSWORD_REQUESTED',
    message: 'Se o email estiver ativo no sistema, enviaremos um link seguro para você definir uma nova senha.'
  };

  if (!email) {
    logAccess_(ss, 'reset_password', email, 'DENIED', 'EMAIL_INVALIDO', page, 'site', userAgent, '');
    return genericResponse;
  }

  const userRecord = findUserByEmail_(ss, email);
  if (!userRecord) {
    logAccess_(ss, 'reset_password', email, 'IGNORED', 'USUARIO_NAO_ENCONTRADO', page, 'site', userAgent, '');
    return genericResponse;
  }

  const status = String(userRecord.status || '').toUpperCase();

  if (status === 'PENDING_EMAIL') {
    try {
      const token = cleanText_(userRecord.email_confirmation_token) || generateId_('EML');
      updateUserFields_(ss, userRecord._rowNumber, {
        updated_at: new Date(),
        email_confirmation_token: token,
        email_confirmation_sent_at: new Date(),
        notes: 'Confirmação reenviada a partir da opção de senha.'
      });
      sendConfirmationEmail_(settings, email, userRecord.nome, token);
      logAccess_(ss, 'reset_password', email, 'PENDING', 'REENVIO_CONFIRMACAO', page, 'site', userAgent, 'Usuário pendente de confirmação; token_ref=' + tokenFingerprint_(token));
    } catch (err) {
      logAccess_(ss, 'reset_password', email, 'ERROR', 'REENVIO_CONFIRMACAO_FALHOU', page, 'site', userAgent, String(err));
    }
    return genericResponse;
  }

  if (status !== 'ACTIVE') {
    logAccess_(ss, 'reset_password', email, 'IGNORED', 'USUARIO_INATIVO', page, 'site', userAgent, '');
    return genericResponse;
  }

  try {
    const passwordSetupMeta = issuePasswordSetupLinkForUser_(ss, settings, userRecord, 'Link para definir nova senha enviado sob solicitação do usuário');
    logAccess_(
      ss,
      'reset_password',
      email,
      'ALLOWED',
      'OK',
      page,
      'site',
      userAgent,
      'password_token_ref=' + tokenFingerprint_(passwordSetupMeta.token) +
        '; expira_em=' + passwordSetupMeta.expiresAt.toISOString()
    );
  } catch (err) {
    logAccess_(ss, 'reset_password', email, 'ERROR', 'ENVIO_LINK_SENHA_FALHOU', page, 'site', userAgent, String(err));
  }

  return genericResponse;
}

function setPassword_(payload) {
  const result = processSetPasswordPayload_(payload);
  return passwordResultPage_(result.content, result.settings);
}

function issuePasswordSetupLinkForUser_(ss, settings, userRecord, notes) {
  const token = generateId_('PWD');
  const now = new Date();
  const ttlHours = readPositiveIntegerSetting_(settings.PASSWORD_SETUP_TOKEN_TTL_HOURS, 24, 1);
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

  updateUserFields_(ss, userRecord._rowNumber, {
    updated_at: now,
    auth_password_token: token,
    auth_password_token_sent_at: now,
    auth_password_token_expires_at: expiresAt,
    notes: (notes || 'Link para definir senha enviado por email.') +
      ' token_ref=' + tokenFingerprint_(token) +
      '; expira_em=' + expiresAt.toISOString()
  });

  sendPasswordSetupEmail_(settings, userRecord.email, userRecord.nome, token, ttlHours);
  return {
    token: token,
    expiresAt: expiresAt
  };
}

function sendPasswordSetupEmail_(settings, email, nome, token, ttlHours) {
  const projectName = settings.PROJECT_NAME || LAB_CFG.DEFAULTS.PROJECT_NAME;
  const projectUrl = settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL;
  const passwordSetupUrl = buildPasswordSetupUrl_(settings, email, token);
  const safeName = htmlEscape_(nome || 'participante');
  const subject = projectName + ' | Defina sua senha de acesso';
  const ttlLabel = String(ttlHours || 24) + ' horas';
  const plainBody =
    'Olá, ' + (nome || 'participante') + '!\n\n' +
    'Use o link abaixo para definir sua senha de acesso ao ' + projectName + ':\n' +
    passwordSetupUrl + '\n\n' +
    'Esse link é pessoal e expira em ' + ttlLabel + '.\n\n' +
    'Conheça o projeto: ' + projectUrl;

  const htmlBody =
    '<div style="font-family:Arial,sans-serif;background:#f7efe2;padding:24px;color:#1f1712;">' +
      '<div style="max-width:620px;margin:0 auto;background:#fffaf1;border:1px solid #ead6bc;border-radius:20px;overflow:hidden;">' +
        '<div style="padding:28px 28px 12px;background:linear-gradient(135deg,#f28c00,#c85d00);color:#fff8ef;">' +
          '<p style="margin:0 0 8px;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;font-weight:700;">Acesso seguro</p>' +
          '<h1 style="margin:0;font-size:28px;line-height:1.2;">Defina sua senha</h1>' +
        '</div>' +
        '<div style="padding:28px;">' +
          '<p style="margin:0 0 14px;font-size:16px;line-height:1.6;">Olá, ' + safeName + '.</p>' +
          '<p style="margin:0 0 18px;font-size:16px;line-height:1.6;">Seu acesso está quase pronto. Use o botão abaixo para escolher sua própria senha com segurança.</p>' +
          '<p style="margin:0 0 22px;">' +
            '<a href="' + htmlEscape_(passwordSetupUrl) + '" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#e98200;color:#fffaf2;text-decoration:none;font-weight:700;">Definir minha senha</a>' +
          '</p>' +
          '<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Esse link é pessoal e expira em ' + htmlEscape_(ttlLabel) + '. Se preferir, você poderá solicitar outro depois no check-in.</p>' +
          '<p style="margin:0;">' +
            '<a href="' + htmlEscape_(projectUrl) + '" style="color:#8b3d00;font-weight:700;">Conhecer o projeto Cordel 2.0</a>' +
          '</p>' +
        '</div>' +
      '</div>' +
    '</div>';

  MailApp.sendEmail({
    to: email,
    subject: subject,
    body: plainBody,
    htmlBody: htmlBody,
    name: projectName
  });
}

function confirmationPage_(content, settings) {
  const isSuccess = !!content.ok;
  const checkinUrl = cleanText_(settings.CHECKIN_URL || '');
  const projectUrl = cleanText_(settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL);
  const primaryLabel = isSuccess ? 'Voltar ao check-in' : 'Ir para o check-in';
  const primaryLink = isUsableUrl_(checkinUrl) ? checkinUrl : projectUrl;
  const secondaryLink = isUsableUrl_(projectUrl) ? projectUrl : '';

  const html =
    '<!DOCTYPE html>' +
    '<html lang="pt-BR">' +
    '<head>' +
      '<meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
      '<title>Confirmação de email</title>' +
      '<style>' +
        'body{margin:0;font-family:Arial,sans-serif;background:linear-gradient(180deg,#fbf2e4,#f1e3cd);color:#1c1511;}' +
        '.wrap{min-height:100vh;display:grid;place-items:center;padding:24px;}' +
        '.card{max-width:720px;background:#fffaf3;border:1px solid #e7d4b7;border-radius:26px;box-shadow:0 20px 50px rgba(62,31,7,.12);overflow:hidden;}' +
        '.head{padding:30px;background:' + (isSuccess ? 'linear-gradient(135deg,#ef9208,#c86400)' : 'linear-gradient(135deg,#7b2f23,#a83d24)') + ';color:#fff8f1;}' +
        '.head small{display:block;margin-bottom:8px;text-transform:uppercase;letter-spacing:1.3px;font-weight:700;opacity:.92;}' +
        '.body{padding:28px;}' +
        'h1{margin:0;font-size:30px;line-height:1.15;}' +
        'p{font-size:17px;line-height:1.7;color:#4d433d;}' +
        '.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px;}' +
        '.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 18px;border-radius:999px;text-decoration:none;font-weight:700;}' +
        '.btn-primary{background:#e98200;color:#fff8f1;}' +
        '.btn-secondary{background:#fff1db;color:#8b3d00;border:1px solid #efc68f;}' +
      '</style>' +
    '</head>' +
    '<body>' +
      '<div class="wrap">' +
        '<div class="card">' +
          '<div class="head">' +
            '<small>Laboratório Cordel 2.0</small>' +
            '<h1>' + htmlEscape_(content.title || 'Confirmação de email') + '</h1>' +
          '</div>' +
          '<div class="body">' +
            '<p>' + htmlEscape_(content.message || '') + '</p>' +
            '<div class="actions">' +
              '<a class="btn btn-primary" href="' + htmlEscape_(primaryLink || '#') + '">' + htmlEscape_(primaryLabel) + '</a>' +
              (secondaryLink ? '<a class="btn btn-secondary" href="' + htmlEscape_(secondaryLink) + '">Conhecer o projeto</a>' : '') +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</body>' +
    '</html>';

  return HtmlService.createHtmlOutput(html).setTitle('Confirmação de email');
}

function passwordResultPage_(content, settings) {
  const checkinUrl = cleanText_(settings.CHECKIN_URL || LAB_CFG.DEFAULTS.CHECKIN_URL);
  const projectUrl = cleanText_(settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL);
  const primaryLink = cleanText_(content.primaryActionUrl || '') || checkinUrl || projectUrl;
  const secondaryLink = cleanText_(content.secondaryActionUrl || '') || checkinUrl || projectUrl;
  const closeLabel = cleanText_(content.closeLabel || 'Fechar janela');
  const topNavigationScript =
    '<script>' +
      'function goTop(url){' +
        'if(!url){return;}' +
        'try{if(window.top&&window.top!==window){window.top.location.href=url;return;}}catch(e){}' +
        'try{window.open(url,\"_top\");return;}catch(e){}' +
        'window.location.href=url;' +
      '}' +
    '</script>';
  const autoRedirectScript = content.ok && checkinUrl
    ? '<script>window.setTimeout(function(){goTop(' + JSON.stringify(primaryLink) + ');},2200);</script>'
    : '';
  const html =
    '<!DOCTYPE html>' +
    '<html lang="pt-BR">' +
    '<head>' +
      '<meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
      '<title>' + htmlEscape_(content.title || 'Definir senha') + '</title>' +
      '<style>' +
        'body{margin:0;font-family:Arial,sans-serif;background:linear-gradient(180deg,#fbf2e4,#f1e3cd);color:#1c1511;}' +
        '.wrap{min-height:100vh;display:grid;place-items:center;padding:24px;}' +
        '.card{max-width:760px;background:#fffaf3;border:1px solid #e7d4b7;border-radius:26px;box-shadow:0 20px 50px rgba(62,31,7,.12);overflow:hidden;}' +
        '.head{padding:30px;background:' + (content.ok ? 'linear-gradient(135deg,#ef9208,#c86400)' : 'linear-gradient(135deg,#7b2f23,#a83d24)') + ';color:#fff8f1;}' +
        '.head small{display:block;margin-bottom:8px;text-transform:uppercase;letter-spacing:1.3px;font-weight:700;opacity:.92;}' +
        '.body{padding:28px;}' +
        'h1{margin:0;font-size:30px;line-height:1.15;}' +
        'p{font-size:17px;line-height:1.7;color:#4d433d;}' +
        '.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px;}' +
        '.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 18px;border-radius:999px;text-decoration:none;font-weight:700;border:0;cursor:pointer;font:inherit;}' +
        '.btn-primary{background:#e98200;color:#fff8f1;}' +
        '.btn-secondary{background:#fff1db;color:#8b3d00;border:1px solid #efc68f;}' +
        '.btn-ghost{background:transparent;color:#5c524c;border:1px solid #d8c5a6;}' +
      '</style>' +
      topNavigationScript +
    '</head>' +
    '<body>' +
      '<div class="wrap">' +
        '<div class="card">' +
          '<div class="head">' +
            '<small>Laboratório Cordel 2.0</small>' +
            '<h1>' + htmlEscape_(content.title || 'Definir senha') + '</h1>' +
          '</div>' +
          '<div class="body">' +
            '<p>' + htmlEscape_(content.message || '') + '</p>' +
            '<div class="actions">' +
              '<a class="btn btn-primary" href="' + htmlEscape_(primaryLink || '#') + '" onclick="goTop(this.href);return false;">' + htmlEscape_(content.primaryActionLabel || 'Continuar') + '</a>' +
              '<a class="btn btn-secondary" href="' + htmlEscape_(secondaryLink || '#') + '" onclick="goTop(this.href);return false;">' + htmlEscape_(content.secondaryActionLabel || 'Voltar ao check-in') + '</a>' +
              '<button class="btn btn-ghost" type="button" onclick="window.close();setTimeout(function(){history.back();},120);">' + htmlEscape_(closeLabel) + '</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      autoRedirectScript +
    '</body>' +
    '</html>';

  return HtmlService.createHtmlOutput(html).setTitle(content.title || 'Definir senha');
}

function buildConfirmationUrl_(settings, email, token) {
  const bridgeUrl = cleanText_(settings.CHECKIN_URL || LAB_CFG.DEFAULTS.CHECKIN_URL || '');
  const baseUrl = isUsableUrl_(bridgeUrl)
    ? bridgeUrl
    : cleanText_(LAB_CFG.DEFAULTS.WEB_APP_URL || settings.WEB_APP_URL || ScriptApp.getService().getUrl() || '');
  if (!isUsableUrl_(baseUrl)) {
    throw new Error('Não foi possível determinar a URL do Web App para confirmação.');
  }

  const sep = baseUrl.indexOf('?') >= 0 ? '&' : '?';
  return baseUrl +
    sep +
    'action=confirm' +
    '&email=' + encodeURIComponent(email) +
    '&token=' + encodeURIComponent(token);
}

function buildPasswordSetupUrl_(settings, email, token) {
  const bridgeUrl = cleanText_(settings.CHECKIN_URL || LAB_CFG.DEFAULTS.CHECKIN_URL || '');
  const baseUrl = isUsableUrl_(bridgeUrl)
    ? bridgeUrl
    : cleanText_(LAB_CFG.DEFAULTS.WEB_APP_URL || settings.WEB_APP_URL || ScriptApp.getService().getUrl() || '');
  if (!isUsableUrl_(baseUrl)) {
    throw new Error('Não foi possível determinar a URL do check-in para definir senha.');
  }

  const sep = baseUrl.indexOf('?') >= 0 ? '&' : '?';
  return baseUrl +
    sep +
    'action=set_password' +
    '&email=' + encodeURIComponent(email) +
    '&token=' + encodeURIComponent(token);
}

function findUserByEmail_(ss, email) {
  const sh = ss.getSheetByName(LAB_CFG.SHEETS.USERS);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return null;

  const headers = values[0];
  const emailIdx = headers.indexOf('email');

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

  const headers = values[0];
  const emailIdx = headers.indexOf('email');
  const statusIdx = headers.indexOf('status');

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowEmail = normalizeEmail_(row[emailIdx]);
    const status = String(row[statusIdx] || '').toUpperCase();
    if (rowEmail === email && status === 'ACTIVE') {
      return mapRow_(headers, row);
    }
  }
  return null;
}

function updateUserFields_(ss, rowNumber, fieldMap) {
  const sh = ss.getSheetByName(LAB_CFG.SHEETS.USERS);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

  Object.keys(fieldMap).forEach(function(key) {
    const idx = headers.indexOf(key);
    if (idx >= 0) {
      sh.getRange(rowNumber, idx + 1).setValue(fieldMap[key]);
    }
  });
}

function logConsent_(ss, eventType, userId, email, termsVersion, accepted, page, source, userAgent, notes) {
  const sh = ss.getSheetByName(LAB_CFG.SHEETS.CONSENT_LOG);
  sh.appendRow([
    generateId_('CNS'),
    new Date(),
    eventType,
    userId || '',
    email || '',
    termsVersion || '',
    accepted ? 'TRUE' : 'FALSE',
    page || '',
    source || '',
    userAgent || '',
    notes || ''
  ]);
}

function logAccess_(ss, eventType, email, result, reason, page, source, userAgent, notes) {
  const sh = ss.getSheetByName(LAB_CFG.SHEETS.ACCESS_LOG);
  sh.appendRow([
    generateId_('ACC'),
    new Date(),
    eventType,
    email || '',
    result || '',
    reason || '',
    page || '',
    source || '',
    userAgent || '',
    notes || ''
  ]);
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

function readSettingsMap_(ss) {
  const sh = ss.getSheetByName(LAB_CFG.SHEETS.SETTINGS);
  const values = sh.getDataRange().getValues();
  const map = {};
  if (values.length < 2) return map;

  for (let i = 1; i < values.length; i++) {
    const key = String(values[i][0] || '').trim();
    const value = values[i][1];
    if (key) map[key] = value;
  }
  return map;
}

function getOrCreateBackupFolder_(settings, ss) {
  const configuredId = cleanText_(settings.BACKUP_FOLDER_ID);
  if (configuredId) {
    try {
      return DriveApp.getFolderById(configuredId);
    } catch (err) {
      // Segue para criação automática da pasta.
    }
  }

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
    const fileName =
      sanitizeFileName_(ss.getName()) +
      '__' +
      sanitizeFileName_(sh.getName()) +
      '__' +
      timestamp +
      '.csv';

    const file = folder.createFile(fileName, csv, MimeType.CSV);
    savedFiles.push(file);
  });

  return savedFiles;
}

function valuesToCsv_(values) {
  return values.map(function(row) {
    return row.map(csvEscapeCell_).join(',');
  }).join('\r\n');
}

function csvEscapeCell_(value) {
  const text = String(value == null ? '' : value);
  if (/[",\r\n]/.test(text)) {
    return '"' + text.replace(/"/g, '""') + '"';
  }
  return text;
}

function sanitizeFileName_(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function findLatestBackupFileForSheet_(folder, spreadsheetName, sheetName) {
  const prefix =
    sanitizeFileName_(spreadsheetName) +
    '__' +
    sanitizeFileName_(sheetName) +
    '__';
  const files = folder.getFiles();
  let latest = null;
  let latestTime = 0;

  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName();
    if (name.indexOf(prefix) !== 0 || !/\.csv$/i.test(name)) continue;

    const updated = file.getLastUpdated().getTime();
    if (updated > latestTime) {
      latest = file;
      latestTime = updated;
    }
  }

  return latest;
}

function getLabSpreadsheet_(allowCreate) {
  const props = PropertiesService.getScriptProperties();
  const savedId = cleanText_(props.getProperty(LAB_CFG.PROPERTIES.SPREADSHEET_ID));

  if (savedId) {
    try {
      return SpreadsheetApp.openById(savedId);
    } catch (err) {
      if (!allowCreate) {
        throw new Error('A planilha configurada não foi encontrada. Execute setupLabCheckin() novamente.');
      }
    }
  }

  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    props.setProperty(LAB_CFG.PROPERTIES.SPREADSHEET_ID, active.getId());
    return active;
  }

  if (!allowCreate) {
    throw new Error('Nenhuma planilha vinculada foi encontrada. Execute setupLabCheckin() primeiro para criar a planilha.');
  }

  const projectName = LAB_CFG.DEFAULTS.PROJECT_NAME || 'Laboratório Cordel 2.0';
  const ss = SpreadsheetApp.create(projectName + ' | Check-in');
  props.setProperty(LAB_CFG.PROPERTIES.SPREADSHEET_ID, ss.getId());
  return ss;
}

function createSheetIfMissing_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sh;
  }

  ensureSheetHeaders_(sh, headers);
  return sh;
}

function ensureSheetHeaders_(sh, headers) {
  const existing = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function(v) {
    return String(v || '').trim();
  });
  const missing = headers.filter(function(header) {
    return existing.indexOf(header) === -1;
  });

  if (!missing.length) return;

  sh.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
}

function clearSheetDataRows_(sh) {
  if (!sh) return;
  const lastRow = sh.getLastRow();
  const lastColumn = sh.getLastColumn();

  if (lastRow <= 1 || lastColumn < 1) return;

  sh.getRange(2, 1, lastRow - 1, lastColumn).clearContent();
}

function parsePayload_(e, method) {
  if (method === 'GET') {
    return (e && e.parameter) ? e.parameter : {};
  }

  if (e && e.parameter && Object.keys(e.parameter).length) {
    return e.parameter;
  }

  if (e && e.postData && e.postData.contents) {
    const raw = e.postData.contents;
    try {
      return JSON.parse(raw);
    } catch (err) {
      return (e && e.parameter) ? e.parameter : {};
    }
  }

  return {};
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonpOut_(callbackName, obj) {
  const callback = sanitizeJsonpCallback_(callbackName);
  return ContentService
    .createTextOutput(callback + '(' + JSON.stringify(obj) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function mapRow_(headers, row) {
  const out = {};
  headers.forEach(function(h, i) {
    out[h] = row[i];
  });
  return out;
}

function cleanText_(value) {
  return String(value || '').trim();
}

function normalizeUnicodeText_(value) {
  const text = String(value == null ? '' : value);
  return typeof text.normalize === 'function' ? text.normalize('NFC') : text;
}

function normalizeEmail_(value) {
  const email = String(value || '').trim().toLowerCase();
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email) ? email : '';
}

function normalizePhone_(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeSimNao_(value) {
  const v = String(value || '').trim().toUpperCase();
  if (v === 'SIM' || v === 'S') return 'SIM';
  if (v === 'NÃO' || v === 'NAO' || v === 'N') return 'NAO';
  return '';
}

function toBoolean_(value) {
  if (value === true) return true;
  const v = String(value || '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'sim' || v === 'yes';
}

function parseBirthDateToIso_(raw) {
  const timeZone = cleanText_(LAB_CFG.DEFAULTS.PROJECT_TIME_ZONE) || Session.getScriptTimeZone();

  if (raw instanceof Date && String(raw) !== 'Invalid Date') {
    return Utilities.formatDate(raw, timeZone, 'yyyy-MM-dd');
  }

  const value = String(raw || '').trim();

  if (!value) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const normalized = value
    .replace(/\s+/g, '')
    .replace(/[.\-]/g, '/');

  const m = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return '';

  let day = parseInt(m[1], 10);
  let month = parseInt(m[2], 10);
  let year = parseInt(m[3], 10);

  if (String(m[3]).length === 2) {
    year = year <= 29 ? 2000 + year : 1900 + year;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return '';

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return '';
  }

  return Utilities.formatDate(date, timeZone, 'yyyy-MM-dd');
}

function sha256_(text) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    text,
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function generatePassword_(length) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*?';
  const size = Math.max(12, Number(length || 14));
  let out = '';

  for (let i = 0; i < size; i++) {
    const idx = Math.floor(Math.random() * chars.length);
    out += chars.charAt(idx);
  }

  return out;
}

function normalizeAccessPassword_(value) {
  return normalizeUnicodeText_(value)
    .trim()
    .replace(/[\s-]+/g, '')
    .toUpperCase();
}

function generateAccessPassword_(length) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const size = Math.max(12, Number(length || 16));
  let out = '';

  for (let i = 0; i < size; i++) {
    const idx = Math.floor(Math.random() * chars.length);
    out += chars.charAt(idx);
  }

  return out;
}

function formatAccessPassword_(value) {
  return String(value || '')
    .match(/.{1,4}/g)
    .join('-');
}

function validateAccessPassword_(password, confirmation) {
  const normalizedPassword = normalizeUnicodeText_(password).trim();
  const normalizedConfirmation = normalizeUnicodeText_(confirmation).trim();

  if (!normalizedPassword || !normalizedConfirmation) {
    return 'Preencha e confirme sua nova senha.';
  }

  if (normalizedPassword !== normalizedConfirmation) {
    return 'Os dois campos de senha precisam ser iguais.';
  }

  if (normalizedPassword.length < 10) {
    return 'Sua senha precisa ter pelo menos 10 caracteres.';
  }

  if (!hasLetterCharacter_(normalizedPassword) || !/\d/.test(normalizedPassword)) {
    return 'Use ao menos uma letra e um número na nova senha.';
  }

  return '';
}

function hasLetterCharacter_(value) {
  const text = String(value || '');

  try {
    return new RegExp('\\p{L}', 'u').test(text);
  } catch (error) {
    return /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(text);
  }
}

function isExpiredDateValue_(value) {
  if (!value) return true;
  const date = value instanceof Date ? value : new Date(value);
  if (String(date) === 'Invalid Date') return true;
  return date.getTime() < new Date().getTime();
}

function isUsableUrl_(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function htmlEscape_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function tokenFingerprint_(value) {
  const text = cleanText_(value);
  return text ? sha256_(text).slice(0, 12) : '';
}

function sanitizeJsonpCallback_(value) {
  const callback = String(value || '').trim();
  return /^[a-zA-Z_$][\w.$]*$/.test(callback) ? callback : 'labConfirmCallback';
}

function readPositiveIntegerSetting_(value, fallback, minimum) {
  const parsed = parseInt(String(value || '').trim(), 10);
  const safeValue = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(Number(minimum || 0), safeValue);
}

function generateId_(prefix) {
  return prefix + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
}

function processSignupPayload_(ss, settings, payload, source) {
  const nome = cleanText_(payload.nome);
  const email = normalizeEmail_(payload.email);
  const birthRaw = cleanText_(payload.dataAniversario);
  const birthIso = parseBirthDateToIso_(birthRaw);
  const instituicao = cleanText_(payload.instituicao);
  const oficinasCordel = normalizeSimNao_(payload.oficinasCordel);
  const telefoneDigits = normalizePhone_(payload.telefone);
  const consentAccepted = toBoolean_(payload.consentAccepted);
  const termsVersion = cleanText_(payload.termsVersion || settings.TERMS_VERSION);
  const page = cleanText_(payload.page || 'checkin');
  const userAgent = cleanText_(payload.userAgent || '');
  const flowSource = cleanText_(source || 'custom_checkin_form');
  const now = new Date();

  const denySignup = function(code, message, details) {
    logAccess_(ss, 'signup', email, 'DENIED', code, page, flowSource, userAgent, details || message || '');
    return {
      ok: false,
      code: code,
      message: message,
      details: details || ''
    };
  };

  if (!nome || nome.length < 3) {
    return denySignup('NOME_INVALIDO', 'Informe seu nome completo.');
  }

  if (!email) {
    return denySignup('EMAIL_INVALIDO', 'Informe um email valido.');
  }

  if (!birthIso) {
    return denySignup(
      'DATA_INVALIDA',
      'Informe a data de nascimento no formato dd/mm/aa ou dd/mm/aaaa.',
      'valor_recebido=' + birthRaw
    );
  }

  const audience = buildSignupAudienceProfile_(settings, birthIso, now);
  if (!audience) {
    return denySignup(
      'DATA_INVALIDA',
      'Nao foi possivel classificar a idade informada para o cadastro.',
      'valor_recebido=' + birthRaw
    );
  }

  if (!instituicao) {
    return denySignup('INSTITUICAO_OBRIGATORIA', "Informe a instituicao ou escreva 'Nao se aplica'.");
  }

  if (!oficinasCordel) {
    return denySignup('OFICINAS_OBRIGATORIO', 'Informe se voce fez ou esta nas oficinas do Cordel 2.0.');
  }

  if (!telefoneDigits || telefoneDigits.length < 10 || telefoneDigits.length > 11) {
    return denySignup('TELEFONE_INVALIDO', 'Informe telefone com DDD.');
  }

  if (!consentAccepted) {
    return denySignup('CONSENTIMENTO_OBRIGATORIO', 'E necessario aceitar o termo para continuar.');
  }

  const existingUser = findUserByEmail_(ss, email);
  const phoneHash = sha256_(telefoneDigits);
  const phoneLast4 = telefoneDigits.slice(-4);
  const token = generateId_('EML');

  if (existingUser) {
    logAccess_(
      ss,
      'signup',
      email,
      'DENIED',
      'EMAIL_JA_CADASTRADO',
      page,
      flowSource,
      userAgent,
      'user_id=' + cleanText_(existingUser.user_id) + '; status=' + cleanText_(existingUser.status)
    );
    return {
      ok: false,
      code: 'EMAIL_JA_CADASTRADO',
      message: 'Ja existe um registro com este email. Use a aba Entrar para continuar.'
    };
  }

  const userId = generateId_('USR');
  const usersSheet = ss.getSheetByName(LAB_CFG.SHEETS.USERS);
  appendObjectRow_(usersSheet, {
    user_id: userId,
    created_at: now,
    updated_at: now,
    status: 'PENDING_EMAIL',
    nome: nome,
    email: email,
    faixa_etaria_cadastro: audience.faixaEtaria,
    is_minor: audience.isMinor,
    instituicao: instituicao,
    oficinas_cordel: oficinasCordel,
    phone_hash: phoneHash,
    phone_last4: phoneLast4,
    consent_current_version: termsVersion,
    consent_current_at: now,
    source_page: page,
    signup_source: flowSource,
    signup_at: now,
    email_confirmed_at: '',
    email_confirmation_token: token,
    email_confirmation_sent_at: now,
    auth_password_hash: '',
    auth_password_updated_at: '',
    auth_password_token: '',
    auth_password_token_sent_at: '',
    auth_password_token_expires_at: '',
    welcome_email_template: audience.welcomeTemplate,
    welcome_email_sent_at: '',
    notes: 'Aguardando confirmacao de email.'
  });

  logConsent_(
    ss,
    'signup',
    userId,
    email,
    termsVersion,
    true,
    page,
    flowSource,
    userAgent,
    'Consentimento no cadastro'
  );

  try {
    sendConfirmationEmail_(settings, email, nome, token);
    logAccess_(
      ss,
      'signup',
      email,
      'PENDING',
      'EMAIL_CONFIRMATION_SENT',
      page,
      flowSource,
      userAgent,
      'classificacao=' + audience.faixaEtaria + '; welcome_template=' + audience.welcomeTemplate
    );
  } catch (err) {
    logAccess_(ss, 'signup', email, 'ERROR', 'ENVIO_EMAIL_FALHOU', page, flowSource, userAgent, String(err));
    return {
      ok: false,
      code: 'ENVIO_EMAIL_FALHOU',
      message: 'Cadastro salvo, mas nao foi possivel enviar o email de confirmacao agora. Tente novamente em instantes.'
    };
  }

  return {
    ok: true,
    code: 'SIGNUP_PENDING_EMAIL',
    message: 'Cadastro recebido. Enviamos um link de confirmacao para seu email. Apos confirmar, voce recebera um link para definir sua propria senha.',
    userId: userId
  };
}

// Override para permitir entrada imediata no laboratório após definir a senha.
function processSetPasswordPayload_(payload) {
  const ss = getLabSpreadsheet_(false);
  const settings = readSettingsMap_(ss);
  ensureUsersSheetSchema_(ss, settings);
  runTokenHousekeeping_(ss, settings, false);
  const email = normalizeEmail_(payload.email);
  const token = cleanText_(payload.token);
  const senha = cleanText_(payload.senha);
  const senhaConfirmacao = cleanText_(payload.senhaConfirmacao);
  const page = cleanText_(payload.page || 'set_password');
  const setupUrl = buildPasswordSetupUrl_(settings, email, token);

  if (!email || !token) {
    logAccess_(ss, 'set_password', email, 'DENIED', 'LINK_INVALIDO', page, 'site', '', '');
    return {
      settings: settings,
      content: {
        ok: false,
        title: 'Link de senha invalido',
        message: 'O link para definir senha está incompleto ou expirado. Solicite um novo envio no check-in.',
        primaryActionLabel: 'Voltar ao check-in',
        primaryActionUrl: cleanText_(settings.CHECKIN_URL || LAB_CFG.DEFAULTS.CHECKIN_URL),
        secondaryActionLabel: 'Conhecer o projeto',
        secondaryActionUrl: cleanText_(settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL),
        closeLabel: 'Fechar janela'
      }
    };
  }

  const userRecord = findUserByEmail_(ss, email);
  if (!userRecord) {
    logAccess_(ss, 'set_password', email, 'DENIED', 'USUARIO_NAO_ENCONTRADO', page, 'site', '', '');
    return {
      settings: settings,
      content: {
        ok: false,
        title: 'Cadastro não encontrado',
        message: 'Não localizamos um cadastro compatível com este link. Você pode realizar um novo cadastro no check-in.',
        primaryActionLabel: 'Voltar ao check-in',
        primaryActionUrl: cleanText_(settings.CHECKIN_URL || LAB_CFG.DEFAULTS.CHECKIN_URL),
        secondaryActionLabel: 'Conhecer o projeto',
        secondaryActionUrl: cleanText_(settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL),
        closeLabel: 'Fechar janela'
      }
    };
  }

  const isFirstPasswordDefinition =
    !cleanText_(userRecord.auth_password_hash) &&
    !cleanText_(userRecord.welcome_email_sent_at);

  if (String(userRecord.status || '').toUpperCase() !== 'ACTIVE') {
    logAccess_(ss, 'set_password', email, 'DENIED', 'USUARIO_INATIVO', page, 'site', '', '');
    return {
      settings: settings,
      content: {
        ok: false,
        title: 'Cadastro ainda não está ativo',
        message: 'Este cadastro ainda não pode definir senha. Confirme primeiro o email ou solicite um novo envio.',
        primaryActionLabel: 'Voltar ao check-in',
        primaryActionUrl: cleanText_(settings.CHECKIN_URL || LAB_CFG.DEFAULTS.CHECKIN_URL),
        secondaryActionLabel: 'Conhecer o projeto',
        secondaryActionUrl: cleanText_(settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL),
        closeLabel: 'Fechar janela'
      }
    };
  }

  if (cleanText_(userRecord.auth_password_token) !== token) {
    logAccess_(ss, 'set_password', email, 'DENIED', 'TOKEN_INVALIDO', page, 'site', '', 'token_ref=' + tokenFingerprint_(token));
    return {
      settings: settings,
      content: {
        ok: false,
        title: 'Token de senha invalido',
        message: 'Este link não corresponde a solicitação atual. Gere um novo link no check-in.',
        primaryActionLabel: 'Voltar ao check-in',
        primaryActionUrl: cleanText_(settings.CHECKIN_URL || LAB_CFG.DEFAULTS.CHECKIN_URL),
        secondaryActionLabel: 'Conhecer o projeto',
        secondaryActionUrl: cleanText_(settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL),
        closeLabel: 'Fechar janela'
      }
    };
  }

  if (isExpiredDateValue_(userRecord.auth_password_token_expires_at)) {
    updateUserFields_(ss, userRecord._rowNumber, {
      auth_password_token: '',
      auth_password_token_sent_at: '',
      auth_password_token_expires_at: '',
      updated_at: new Date()
    });

    logAccess_(ss, 'set_password', email, 'DENIED', 'TOKEN_EXPIRADO', page, 'site', '', 'token_ref=' + tokenFingerprint_(token));
    return {
      settings: settings,
      content: {
        ok: false,
        title: 'Link expirado',
        message: 'O prazo deste link terminou. Volte ao check-in e solicite um novo link para definir sua senha.',
        primaryActionLabel: 'Voltar ao check-in',
        primaryActionUrl: cleanText_(settings.CHECKIN_URL || LAB_CFG.DEFAULTS.CHECKIN_URL),
        secondaryActionLabel: 'Conhecer o projeto',
        secondaryActionUrl: cleanText_(settings.PROJECT_URL || LAB_CFG.DEFAULTS.PROJECT_URL),
        closeLabel: 'Fechar janela'
      }
    };
  }

  const validationMessage = validateAccessPassword_(senha, senhaConfirmacao);
  if (validationMessage) {
    logAccess_(ss, 'set_password', email, 'DENIED', 'SENHA_INVALIDA', page, 'site', '', validationMessage);
    return {
      settings: settings,
      content: {
        ok: false,
        title: 'Sua senha precisa de ajuste',
        message: validationMessage,
        primaryActionLabel: 'Tentar novamente',
        primaryActionUrl: setupUrl,
        secondaryActionLabel: 'Voltar ao check-in',
        secondaryActionUrl: cleanText_(settings.CHECKIN_URL || LAB_CFG.DEFAULTS.CHECKIN_URL),
        closeLabel: 'Fechar janela'
      }
    };
  }

  updateUserFields_(ss, userRecord._rowNumber, {
    updated_at: new Date(),
    auth_password_hash: sha256_(normalizeAccessPassword_(senha)),
    auth_password_updated_at: new Date(),
    auth_password_token: '',
    auth_password_token_sent_at: '',
    auth_password_token_expires_at: '',
    notes: 'Senha definida pelo proprio usuario.'
  });

  let welcomeTemplate = '';
  let welcomeEmailSent = false;

  if (isFirstPasswordDefinition) {
    welcomeTemplate = resolveWelcomeEmailTemplate_(userRecord);

    if (!welcomeTemplate) {
      logAccess_(
        ss,
        'welcome_email',
        email,
        'ERROR',
        'CLASSIFICACAO_AUSENTE',
        page,
        'system',
        '',
        'Nao foi possivel resolver o template de boas-vindas para o primeiro acesso.'
      );
    } else {
      try {
        sendWelcomeEmail_(settings, email, userRecord.nome, welcomeTemplate);
        const welcomeSentAt = new Date();
        updateUserFields_(ss, userRecord._rowNumber, {
          updated_at: welcomeSentAt,
          welcome_email_template: welcomeTemplate,
          welcome_email_sent_at: welcomeSentAt
        });
        welcomeEmailSent = true;

        logAccess_(
          ss,
          'welcome_email',
          email,
          'ALLOWED',
          'OK',
          page,
          'system',
          '',
          'template=' + welcomeTemplate
        );
      } catch (err) {
        logAccess_(
          ss,
          'welcome_email',
          email,
          'ERROR',
          'ENVIO_EMAIL_FALHOU',
          page,
          'system',
          '',
          'template=' + welcomeTemplate + '; erro=' + String(err)
        );
      }
    }
  }

  const labAccess = issueLabAccessToken_(settings, email, userRecord.user_id || '');
  logAccess_(
    ss,
    'set_password',
    email,
    'ALLOWED',
    'OK',
    page,
    'site',
    '',
    'token_ref=' + tokenFingerprint_(token) +
      '; lab_token_ref=' + tokenFingerprint_(labAccess.token) +
      '; lab_expira_em=' + labAccess.expiresAt.toISOString() +
      '; primeira_senha=' + (isFirstPasswordDefinition ? 'SIM' : 'NAO') +
      '; welcome_email_enviado=' + (welcomeEmailSent ? 'SIM' : 'NAO') +
      '; welcome_template=' + welcomeTemplate
  );

  return {
    settings: settings,
    content: {
      ok: true,
      title: 'Senha definida com sucesso',
      message: 'Sua senha foi salva com sucesso. Estamos preparando sua entrada segura no laboratório.',
      primaryActionLabel: 'Ir para o laboratório',
      primaryActionUrl: buildLabEntryUrl_(settings, labAccess.token),
      secondaryActionLabel: 'Voltar ao check-in',
      secondaryActionUrl: cleanText_(settings.CHECKIN_URL || LAB_CFG.DEFAULTS.CHECKIN_URL),
      closeLabel: 'Fechar janela'
    }
  };
}




