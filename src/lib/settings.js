// ========== НАЛАШТУВАННЯ ==========
// Ключі для зберігання в localStorage
const SETTINGS_KEYS = {
    AUTO_LOAD_LAST_DB: 'app_settings_autoLoadLastDb',
    DARK_THEME: 'app_settings_darkTheme',
    LANGUAGE: 'app_settings_language',
    STORE_FILES_IN_DB: 'app_settings_storeFilesInDb'
};

// Стилі темної теми винесені в styles.css.
// Зчитування налаштування з localStorage з дефолтом
function getSetting(key, defaultValue) {
    const raw = localStorage.getItem(key);
    if (raw === null) {
        localStorage.setItem(key, String(defaultValue));
        return defaultValue;
    }
    // Повертаємо boolean для булевих значень, рядок — для решти
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return raw;
}

// Визначення мови за налаштуваннями браузера
function detectBrowserLanguage() {
    const SUPPORTED_LANGS = ['en', 'uk', 'pl', 'de', 'fr', 'es', 'it'];
    const CIS_LANGS = ['uk', 'ru', 'be']; // українська, російська, білоруська → 'uk'

    const browserLang = (navigator.languages[0] || navigator.userLanguage || 'en')
        .toLowerCase()
        .split('-')[0];
	console.log("browserLang=",browserLang);
    if (CIS_LANGS.includes(browserLang)) return 'uk';
    if (SUPPORTED_LANGS.includes(browserLang)) return browserLang;
    return 'en';
}

// Визначення теми за налаштуваннями браузера
function detectBrowserTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Завантаження налаштувань при старті 
function loadSettings() {
    document.getElementById('autoLoadLastDbCheckbox').checked =
        getSetting(SETTINGS_KEYS.AUTO_LOAD_LAST_DB, true);

    // Тема: якщо раніше не збережено — визначаємо з браузера і зберігаємо
    let darkTheme;
    if (localStorage.getItem(SETTINGS_KEYS.DARK_THEME) === null) {
        darkTheme = detectBrowserTheme();
        localStorage.setItem(SETTINGS_KEYS.DARK_THEME, String(darkTheme));
    } else {
        darkTheme = getSetting(SETTINGS_KEYS.DARK_THEME, false);
    }
    document.getElementById('darkThemeCheckbox').checked = darkTheme;
    applyDarkTheme(darkTheme);

    // Мова: якщо раніше не збережено — визначаємо з браузера і зберігаємо
    let lang = localStorage.getItem(SETTINGS_KEYS.LANGUAGE);
    if (!lang) {
        lang = detectBrowserLanguage();
        localStorage.setItem(SETTINGS_KEYS.LANGUAGE, lang);
    }
    document.getElementById('languageSelect').value = lang;
}

//  Застосування темної теми 
// Перемикання теми зводиться лише до toggle класу на body.
function applyDarkTheme(enabled) {
    document.body.classList.toggle('dark-theme', enabled);
    localStorage.setItem(SETTINGS_KEYS.DARK_THEME, enabled);
    applyQuickAccessPanelBg(enabled);
}

// Встановлює фон панелі швидкого запуску залежно від теми
function applyQuickAccessPanelBg(isDark) {
    const panel = document.getElementById('quickAccessPanel');
    if (!panel) return;
    const img = isDark ? 'pattern-dark.png' : 'pattern.png';
    panel.style.backgroundImage = `url('${img}')`;
    panel.style.backgroundRepeat = 'repeat';
    panel.style.backgroundSize = 'auto';
}

/**
 * Отримує налаштування з прив'язаного ключа "dbName.app-settings" і застосовує до UI.
 * Викликається автоматично з io.js → syncAllAppSettings() після кожного
 * завантаження бази (з localStorage, IndexedDB або .DTA файлу).
 * @param {Object} s  { darkTheme, language, simpleInterface, storeFilesInDb, autoLoadLastDb }
 */
function applyAppSettingsToUI(s) {
    if (!s) return;

    if (s.darkTheme !== undefined) {
        const v = s.darkTheme === true || s.darkTheme === "true";
        const cb = document.getElementById('darkThemeCheckbox');
        if (cb) cb.checked = v;
        document.body.classList.toggle('dark-theme', v);
        localStorage.setItem(SETTINGS_KEYS.DARK_THEME, String(v));
        applyQuickAccessPanelBg(v);
    }

    if (s.language) {
        const prevLang = localStorage.getItem(SETTINGS_KEYS.LANGUAGE);
        const sel = document.getElementById('languageSelect');
        if (sel) sel.value = s.language;
        localStorage.setItem(SETTINGS_KEYS.LANGUAGE, s.language);
        if (s.language !== prevLang && typeof setLang === 'function') setLang(s.language);
    }

    if (s.storeFilesInDb !== undefined) {
        const cb = document.getElementById('storeFilesInDbCheckbox');
        if (cb) cb.checked = s.storeFilesInDb === true || s.storeFilesInDb === "true";
        localStorage.setItem(SETTINGS_KEYS.STORE_FILES_IN_DB, String(s.storeFilesInDb));
    }

    if (s.autoLoadLastDb !== undefined) {
        const cb = document.getElementById('autoLoadLastDbCheckbox');
        if (cb) cb.checked = s.autoLoadLastDb === true || s.autoLoadLastDb === "true";
        localStorage.setItem(SETTINGS_KEYS.AUTO_LOAD_LAST_DB, String(s.autoLoadLastDb));
    }
}

// Відкриття / закриття налаштувань 
function openSettingsModal() {
    // Якщо база відкрита — показуємо її власні налаштування; інакше — глобальні
    const hasDb = typeof database !== "undefined" && database.fileName;
    const dbS = (hasDb && typeof loadDbSettings === "function")
        ? loadDbSettings(database.fileName) : {};
    const bool = (k, lsKey) => k in dbS
        ? (dbS[k] === true || dbS[k] === "true")
        : localStorage.getItem(lsKey) === 'true';
    const str  = (k, lsKey, fb) => k in dbS
        ? (dbS[k] || fb) : (localStorage.getItem(lsKey) || fb);

    document.getElementById('autoLoadLastDbCheckbox').checked =
        bool('autoLoadLastDb', SETTINGS_KEYS.AUTO_LOAD_LAST_DB);
    document.getElementById('darkThemeCheckbox').checked =
        bool('darkTheme', SETTINGS_KEYS.DARK_THEME);
    document.getElementById('storeFilesInDbCheckbox').checked =
        bool('storeFilesInDb', SETTINGS_KEYS.STORE_FILES_IN_DB);
    document.getElementById('languageSelect').value =
        str('language', SETTINGS_KEYS.LANGUAGE, 'uk');

    // Показати/приховати кнопку блокування залежно від наявності бази
    const lockBtn = document.getElementById('openLockModalBtn');
    if (lockBtn) lockBtn.style.display = hasDb ? 'block' : 'none';

    document.getElementById('settingsModal').style.display = 'flex';
}

function closeSettingsModal() {
    document.getElementById('settingsModal').style.display = 'none';
}

// Збереження налаштувань
async function saveSettings() {
    const autoLoad        = document.getElementById('autoLoadLastDbCheckbox').checked;
    const darkTheme       = document.getElementById('darkThemeCheckbox').checked;
    const storeFilesInDb  = document.getElementById('storeFilesInDbCheckbox').checked;
    const language        = document.getElementById('languageSelect').value;
    const prevLang        = localStorage.getItem(SETTINGS_KEYS.LANGUAGE);

    // Завжди зберігаємо глобально (для роботи до відкриття будь-якої бази)
    localStorage.setItem(SETTINGS_KEYS.AUTO_LOAD_LAST_DB,  String(autoLoad));
    localStorage.setItem(SETTINGS_KEYS.DARK_THEME,         String(darkTheme));
    localStorage.setItem(SETTINGS_KEYS.STORE_FILES_IN_DB,  String(storeFilesInDb));
    localStorage.setItem(SETTINGS_KEYS.LANGUAGE,           language);

    // Якщо відкрита база — зберегти прив'язано до її файлу
    const hasDb = typeof database !== "undefined" && database.fileName;
    if (hasDb && typeof saveDbSettings === "function") {
        const dbS = {
            autoLoadLastDb:  String(autoLoad),
            darkTheme:       String(darkTheme),
            storeFilesInDb:  String(storeFilesInDb),
            language
        };
        saveDbSettings(database.fileName, dbS);
        // Оновити appSettings у пам'яті
        if (typeof appSettingSet === "function")
            Object.entries(dbS).forEach(([k,v]) => appSettingSet(k, v));
    }

    applyDarkTheme(darkTheme);

    if (language !== prevLang) {
        await setLang(language);
        const selectedLangText = document.getElementById('languageSelect')
            .options[document.getElementById('languageSelect').selectedIndex].text;
        const langText = selectedLangText.trim().split(/\s+/).slice(1).join(" ");
        Message(t("settingsLangChanged", langText));
    } else {
        Message(t("settingsSaved"));
    }
    closeSettingsModal();
}

// Очищення сховища 
function clearStorage() {
    if (!confirm(t("settingsClearConfirm"))) return;

    const suffixes = [
        '.db-data', '.tables-data', '.queries-data',
        '.query-results', '.reports-data', '.forms-data', '.relations-data', '.app-settings'
    ];
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && suffixes.some(s => key.endsWith(s))) keysToRemove.push(key);
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));

    openAppDB().then(idb => {
        const tx = idb.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        store.clear();
        tx.oncomplete = () => console.log(t("settingsIndexedDbCleared"));
        tx.onerror = e => console.error(t("settingsIndexedDbClearError"), e);
    }).catch(e => console.error(t("settingsIndexedDbOpenError"), e));

    if (db) {
        db = null;
        clearDB();
        updateMainTitle();
        document.getElementById("import-table-link").style.display = "none";
    }
    localStorage.removeItem('lastOpenedFile');
    Message(t("settingsStorageCleared"));
    closeSettingsModal();
    setTimeout(() => location.reload(), 1500);
}

// Налаштування застосовуються через applyAppSettingsToUI() що викликається
// з io.js → syncAllAppSettings() після кожного завантаження бази.

// ========== БЛОКУВАННЯ ОБ'ЄКТІВ БД ==========

/**
 * Зберігає стан блокування для поточної бази у localStorage.
 * Структура: { tables: ["Назва1", ...], queries: [...], reports: [...], forms: [...] }
 */
function saveLockSettings(lockData) {
    if (typeof database === "undefined" || !database.fileName) return;
    const json = JSON.stringify(lockData);
    // Зберігаємо в appSettings — звідси io.js підхопить при saveDatabase() та експорті .DTA
    if (typeof appSettingSet === "function") appSettingSet("lockSettings", json);
    // Дублюємо в окремий ключ localStorage для швидкого читання без appSettingGet
    localStorage.setItem(database.fileName + ".lock-settings", json);
    // Одразу персистуємо через saveDbSettings, щоб не чекати наступного saveDatabase()
    if (typeof saveDbSettings === "function")
        saveDbSettings(database.fileName, Object.assign(
            typeof loadDbSettings === "function" ? loadDbSettings(database.fileName) : {},
            { lockSettings: json }
        ));
}

/**
 * Завантажує стан блокування для поточної бази.
 * @returns {Object} { tables: [], queries: [], reports: [], forms: [] }
 */
function getLockSettings() {
    const empty = { tables: [], queries: [], reports: [], forms: [] };
    if (typeof database === "undefined" || !database.fileName) return empty;
    // 1. Першочергово — з appSettings (актуально після завантаження з .DTA)
    try {
        const fromApp = (typeof appSettingGet === "function") ? appSettingGet("lockSettings") : null;
        if (fromApp) return Object.assign({}, empty, JSON.parse(fromApp));
    } catch (e) { /* ignore */ }
    // 2. Fallback — прямий localStorage-ключ
    try {
        const raw = localStorage.getItem(database.fileName + ".lock-settings");
        if (raw) return Object.assign({}, empty, JSON.parse(raw));
    } catch (e) { /* ignore */ }
    // 3. Fallback — з app-settings збереженого файлу
    try {
        if (typeof loadDbSettings === "function") {
            const dbS = loadDbSettings(database.fileName);
            if (dbS.lockSettings) return Object.assign({}, empty, JSON.parse(dbS.lockSettings));
        }
    } catch (e) { /* ignore */ }
    return empty;
}

/**
 * Публічний API: перевірка, чи заблокований конкретний об'єкт.
 * @param {string} type  — 'table' | 'query' | 'report' | 'form'
 * @param {string} name  — назва об'єкта
 * @returns {boolean}
 */
function isLocked(type, name) {
    const ls = getLockSettings();
    var key = type + "s"; // table → tables, query → queries, etc.
    if (type==="query") { 
			key="queries"
		}
    return Array.isArray(ls[key]) && ls[key].includes(name);
}

/**
 * Відкриває модальне вікно блокування об'єктів.
 * Збирає всі таблиці, запити, звіти та форми з database/queries
 * і показує їх зі станом чекбоксів.
 */
function openLockModal() {
    if (typeof database === "undefined" || !database.fileName) {
        Message(t ? t("lockNoDb") : "Спочатку відкрийте базу даних.");
        return;
    }

    const lockData = getLockSettings();
    const modal = document.getElementById("lockModal");
    if (!modal) {
        console.error("lockModal не знайдено в DOM");
        return;
    }

    // Очищення попереднього вмісту
    const container = document.getElementById("lockObjectsList");
    container.innerHTML = "";

    const sections = [
        {
            titleKey: "lockSectionTables",
            titleFallback: "Таблиці",
            type: "tables",
            items: (typeof database !== "undefined" && database.tables)
                ? database.tables.map(t => t.name) : []
        },
        {
            titleKey: "lockSectionQueries",
            titleFallback: "Запити",
            type: "queries",
            items: (typeof queries !== "undefined" && queries.definitions)
                ? queries.definitions.map(q => q.name) : []
        },
        {
            titleKey: "lockSectionReports",
            titleFallback: "Звіти",
            type: "reports",
            items: (typeof database !== "undefined" && database.reports)
                ? database.reports.map(r => r.name) : []
        },
        {
            titleKey: "lockSectionForms",
            titleFallback: "Форми",
            type: "forms",
            items: (typeof database !== "undefined" && database.forms)
                ? database.forms.map(f => f.name) : []
        }
    ];

    let hasAny = false;

    sections.forEach(section => {
        if (!section.items.length) return;
        hasAny = true;

        // Заголовок секції
        const heading = document.createElement("div");
        heading.className = "lock-section-heading";
        heading.textContent = (typeof t === "function" && t(section.titleKey) !== section.titleKey)
            ? t(section.titleKey) : section.titleFallback;
        container.appendChild(heading);

        // Чекбокс «виділити всю секцію»
        const selectAllRow = document.createElement("div");
        selectAllRow.className = "lock-item lock-item-all";
        const selectAllCb = document.createElement("input");
        selectAllCb.type = "checkbox";
        selectAllCb.id = `lockAll_${section.type}`;
        const selectAllLabel = document.createElement("label");
        selectAllLabel.htmlFor = `lockAll_${section.type}`;
        selectAllLabel.textContent = (typeof t === "function" && t("lockSelectAll") !== "lockSelectAll")
            ? t("lockSelectAll") : "Виділити всі";
        selectAllLabel.style.fontStyle = "italic";
        selectAllRow.appendChild(selectAllCb);
        selectAllRow.appendChild(selectAllLabel);
        container.appendChild(selectAllRow);

        // Рядки об'єктів
        const lockedArr = lockData[section.type] || [];
        section.items.forEach(name => {
            const row = document.createElement("div");
            row.className = "lock-item";

            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.dataset.type = section.type;
            cb.dataset.name = name;
            cb.id = `lock_${section.type}_${name.replace(/\W/g, "_")}`;
            cb.checked = lockedArr.includes(name);

            // Іконка замка для заблокованих
            const lockIcon = document.createElement("span");
            lockIcon.className = "lock-icon";
            lockIcon.textContent = cb.checked ? "🔒" : "🔓";
            cb.addEventListener("change", () => {
                lockIcon.textContent = cb.checked ? "🔒" : "🔓";
                // Оновлюємо «виділити всі»
                updateSectionSelectAll(section.type);
            });

            const label = document.createElement("label");
            label.htmlFor = cb.id;
            label.textContent = name;

            row.appendChild(cb);
            row.appendChild(lockIcon);
            row.appendChild(label);
            container.appendChild(row);
        });

        // Ініціалізація «виділити всі» + обробник
        updateSectionSelectAll(section.type);
        selectAllCb.addEventListener("change", () => {
            container.querySelectorAll(`input[data-type="${section.type}"]`)
                .forEach(cb => {
                    cb.checked = selectAllCb.checked;
                    cb.dispatchEvent(new Event("change"));
                });
        });
    });

    if (!hasAny) {
        const empty = document.createElement("div");
        empty.style.padding = "16px";
        empty.style.textAlign = "center";
        empty.style.opacity = "0.6";
        empty.textContent = (typeof t === "function" && t("lockNoObjects") !== "lockNoObjects")
            ? t("lockNoObjects") : "У базі немає об'єктів для блокування.";
        container.appendChild(empty);
    }

    modal.style.display = "flex";
}

/**
 * Оновлює стан чекбокса «виділити всі» для секції.
 */
function updateSectionSelectAll(type) {
    const container = document.getElementById("lockObjectsList");
    if (!container) return;
    const all = [...container.querySelectorAll(`input[data-type="${type}"]`)];
    const selectAllCb = document.getElementById(`lockAll_${type}`);
    if (!selectAllCb || !all.length) return;
    const checkedCount = all.filter(c => c.checked).length;
    selectAllCb.checked = checkedCount === all.length;
    selectAllCb.indeterminate = checkedCount > 0 && checkedCount < all.length;
}

/**
 * Закриває модальне вікно блокування без збереження.
 */
function closeLockModal() {
    const modal = document.getElementById("lockModal");
    if (modal) modal.style.display = "none";
}

/**
 * Зберігає вибраний стан блокування з модального вікна.
 */
function saveLockModal() {
    const container = document.getElementById("lockObjectsList");
    if (!container) return;

    const lockData = { tables: [], queries: [], reports: [], forms: [] };

    container.querySelectorAll("input[data-type][data-name]").forEach(cb => {
        if (cb.checked) {
            const type = cb.dataset.type;
            if (lockData[type]) lockData[type].push(cb.dataset.name);
        }
    });

    saveLockSettings(lockData);

    // Підраховуємо загальну кількість заблокованих об'єктів
    const total = Object.values(lockData).reduce((s, arr) => s + arr.length, 0);
    const msg = (typeof t === "function" && t("lockSaved") !== "lockSaved")
        ? t("lockSaved", total)
        : `Заблоковано об'єктів: ${total}`;
    Message(msg);

    closeLockModal();

    // Оновлюємо панель швидкого доступу — замки на іконках відображають актуальний стан
    if (typeof refreshQuickAccessPanel === "function") refreshQuickAccessPanel();
}

// ========== ІНІЦІАЛІЗАЦІЯ DOM ==========

/**
 * Зчитує параметр ?lang= з URL і повертає код мови, якщо він підтримується.
 * Якщо параметр відсутній — повертає null.
 * Якщо параметр є, але мова не підтримується — повертає 'en' (fallback).
 */
function getLangFromUrl() {
    const SUPPORTED_LANGS = ['en', 'uk', 'pl', 'de', 'fr', 'es', 'it'];
    const params = new URLSearchParams(window.location.search);
    const urlLang = params.get('lang');
    if (urlLang === null) return null;                          // параметра немає — не втручаємось
    const normalized = urlLang.toLowerCase().split('-')[0];
    return SUPPORTED_LANGS.includes(normalized) ? normalized : 'en'; // невідома мова → 'en'
}

document.addEventListener('DOMContentLoaded', async () => {
    // Пріоритет вибору мови:
    //   1. ?lang=<код> в URL (якщо параметр присутній)
    //   2. збережена мова з localStorage
    //   3. визначення з налаштувань браузера (перший запуск)
    const urlLang = getLangFromUrl();
    let initialLang;

    if (urlLang !== null) {
        // Мова задана через URL — використовуємо її, але НЕ перезаписуємо localStorage,
        // щоб наступне відкриття без параметра взяло збережені налаштування користувача.
        initialLang = urlLang;
        console.log(`Lang override from URL: ${initialLang}`);
    } else {
        // Звичайна логіка: localStorage або автовизначення з браузера
        initialLang = localStorage.getItem(SETTINGS_KEYS.LANGUAGE);
        if (!initialLang) {
            initialLang = detectBrowserLanguage();
            localStorage.setItem(SETTINGS_KEYS.LANGUAGE, initialLang);
        }
    }

    await loadLanguage(initialLang);
    loadSettings();

    const clearBtn = document.getElementById('clearStorageBtn');
    if (clearBtn) clearBtn.onclick = clearStorage;

    const saveBtn = document.getElementById('saveSettingsBtn');
    if (saveBtn) saveBtn.onclick = saveSettings;

    // Кнопка відкриття модалки блокування
    const lockBtn = document.getElementById('openLockModalBtn');
    if (lockBtn) lockBtn.onclick = () => { closeSettingsModal(); openLockModal(); };

    // Кнопки всередині lockModal
    const saveLockBtn = document.getElementById('saveLockBtn');
    if (saveLockBtn) saveLockBtn.onclick = saveLockModal;

    const cancelLockBtn = document.getElementById('cancelLockBtn');
    if (cancelLockBtn) cancelLockBtn.onclick = closeLockModal;
});
