// ===== _app_settings: налаштування зберігаються у файлі _app_settings.json всередині .DTA =====
// Не є таблицею SQLite. У пам'яті зберігається як об'єкт appSettings.

const appSettings = {};

function appSettingGet(key) {
    return Object.prototype.hasOwnProperty.call(appSettings, key)
        ? appSettings[key]
        : null;
}

function appSettingSet(key, value) {
    appSettings[key] = String(value);
}

// Ключі налаштувань що зберігаються разом із базою (у localStorage під "dbName.app-settings")
const APP_SETTING_KEYS = ["storeFilesInDb","darkTheme","language","simpleInterface","autoLoadLastDb"];

// Читає прив'язані налаштування конкретного файлу бази з localStorage
function loadDbSettings(dbName) {
    try { 
		console.log("Settings load=",JSON.parse(localStorage.getItem(dbName + ".app-settings") || "{}"))
		return JSON.parse(localStorage.getItem(dbName + ".app-settings") || "{}"); }
    catch(e) { return {}; }
}

// Зберігає прив'язані налаштування конкретного файлу бази в localStorage
function saveDbSettings(dbName, obj) {
	console.log("Settings saved=",dbName + ".app-settings", JSON.stringify(obj))
    localStorage.setItem(dbName + ".app-settings", JSON.stringify(obj));
}

/**
 * Викликається після кожного завантаження бази.
 * 1. Якщо appSettings непорожній (прийшов з .DTA) — записує ці значення в "dbName.app-settings"
 * 2. Якщо appSettings порожній — завантажує з "dbName.app-settings"
 * 3. Fallback — глобальні "app_settings_*" (браузерні значення, лише якщо база нова)
 * Після цього викликає applyAppSettingsToUI() для оновлення інтерфейсу.
 */
function syncAllAppSettings(dbName) {
    const stored = loadDbSettings(dbName);
    const result = {};
    APP_SETTING_KEYS.forEach(key => {
        const fromDta = appSettingGet(key);
        if (fromDta !== undefined && fromDta !== null && fromDta !== "") {
            // Найвищий пріоритет: значення завантажене з .DTA (appSettings)
            result[key] = fromDta;
        } else if (stored[key] !== undefined) {
            // Другий пріоритет: збережені налаштування цієї бази в localStorage
            result[key] = stored[key];
        } else {
            // Fallback: глобальні браузерні налаштування
            result[key] = localStorage.getItem("app_settings_" + key) ?? "false";
        }
        appSettingSet(key, result[key]);
    });
    saveDbSettings(dbName, result);
    if (typeof applyAppSettingsToUI === "function") applyAppSettingsToUI(result);
}

// Зворотна сумісність
function syncStoreFilesInDbSetting() { syncAllAppSettings(database.fileName || "my_database"); }

async function idbSave(key, value) {
    console.log("idbSave (noop):", key);
}
async function idbLoad(key) {
    return null;
}
async function idbDelete(key) {
    const name = key.replace(".db-data", "");
    if (name && !key.endsWith(".db-data")) return;
    try {
        await window.__TAURI__.core.invoke("delete_database", { name });
    } catch (e) { console.warn(e); }
}
function openAppDB() { return Promise.resolve(null); }
//
/**
 * Автоматичне відкриття форми STARTUP після завантаження бази даних
 */
function autoOpenStartupForm() {
    // Перевіряємо наявність форми з назвою STARTUP
    if (!database.forms || database.forms.length === 0) {
        console.log("Немає форм для автоматичного відкриття");
        return;
    }
    const startupForm = database.forms.find(form => form.name.toUpperCase() === "STARTUP" || form.name.toUpperCase() === "STARTUP_FORM" || form.name === "Стартова");
    if (!startupForm) {
        console.log("Форму STARTUP не знайдено");
        return;
    }
    console.log("Знайдено стартову форму:", startupForm.name);
    // Невелика затримка, щоб DOM повністю завантажився
    setTimeout(() => {
        // Закриваємо всі можливі модальні вікна
        closeAllModals();
        // Відкриваємо форму в режимі перегляду
        previewForm(startupForm, true);
    }, 500);
}
// ===== File BLOB encode/decode =====
function encodeFileBlob(name, type, arrayBuffer) {
    const header = new TextEncoder().encode(JSON.stringify({ name, type }));
    const result = new Uint8Array(4 + header.length + arrayBuffer.byteLength);
    new DataView(result.buffer).setUint32(0, header.length);
    result.set(header, 4);
    result.set(new Uint8Array(arrayBuffer), 4 + header.length);
    return result;
}

function decodeFileBlob(uint8array) {
    const headerLen = new DataView(uint8array.buffer, uint8array.byteOffset).getUint32(0);
    const header = JSON.parse(new TextDecoder().decode(uint8array.slice(4, 4 + headerLen)));
    return { name: header.name, type: header.type, data: uint8array.slice(4 + headerLen) };
}

// Безпечна спроба декодувати наш формат-обгортку.
// Повертає { name, type, data } або null якщо формат не наш (наприклад, сирий BLOB з зовнішньої SQLite).
function tryDecodeFileBlob(uint8array) {
    try {
        if (!(uint8array instanceof Uint8Array) || uint8array.length < 5) return null;
        const headerLen = new DataView(uint8array.buffer, uint8array.byteOffset).getUint32(0);
        if (headerLen === 0 || headerLen > uint8array.length - 4) return null;
        const headerBytes = uint8array.slice(4, 4 + headerLen);
        const header = JSON.parse(new TextDecoder().decode(headerBytes));
        if (!header.name || !header.type) return null;
        return { name: header.name, type: header.type, data: uint8array.slice(4 + headerLen) };
    } catch (e) {
        return null;
    }
}

// Визначає MIME-тип зображення за magic bytes (для сирих BLOB з зовнішньої SQLite).
function detectImageMime(bytes) {
    if (!bytes || bytes.length < 4) return "application/octet-stream";
    if (bytes[0] === 0xFF && bytes[1] === 0xD8) return "image/jpeg";
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return "image/png";
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return "image/webp";
    if (bytes[0] === 0x42 && bytes[1] === 0x4D) return "image/bmp";
    return "application/octet-stream";
}

async function loadDatabase() {
    const name = database.fileName || "my_database";
    
    try {
        await dba.openDatabaseFile(name);
    } catch (e) {
        console.warn("Failed to open db:", e);
    }

    syncAllAppSettings(name);
    
    const savedQueries = localStorage.getItem(name + ".queries-data");
    queries.definitions = savedQueries ? JSON.parse(savedQueries) : [];
    
    const savedQueryResults = localStorage.getItem(name + ".query-results");
    queries.results = savedQueryResults ? JSON.parse(savedQueryResults) : [];
    
    const savedReports = localStorage.getItem(name + ".reports-data");
    database.reports = savedReports ? JSON.parse(savedReports) : [];
    
    const savedForms = localStorage.getItem(name + ".forms-data");
    database.forms = savedForms ? JSON.parse(savedForms) : [];
    
    const savedRelations = localStorage.getItem(name + ".relations-data");
    database.relations = savedRelations ? JSON.parse(savedRelations) : [];

    autoOpenStartupForm();

    newDbFile = false;
    queries.results = [];
    const itl = document.getElementById("import-table-link");
    if (itl) itl.style.display = "block";
    updateMainTitle();
    updateQuickAccessPanel(
        getCurrentTableNames(), getCurrentQueryNames(),
        getCurrentReportNames(), getCurrentFormNames()
    );
    localStorage.setItem('lastOpenedFile', name);
}

async function saveDatabase() {
    if (!db) return;
    const s = {};
    APP_SETTING_KEYS.forEach(k => { s[k] = appSettingGet(k) ?? "false"; });
    saveDbSettings(database.fileName, s);
    localStorage.setItem(database.fileName + ".tables-data", JSON.stringify(
        database.tables.map(({ data, ...rest }) => rest)
    ));
    localStorage.setItem(database.fileName + ".queries-data", JSON.stringify(queries.definitions));
    localStorage.setItem(database.fileName + ".query-results", JSON.stringify(queries.results || []));
    localStorage.setItem(database.fileName + ".reports-data", JSON.stringify(database.reports || []));
    localStorage.setItem(database.fileName + ".forms-data", JSON.stringify(database.forms || []));
    const relationsToSave = (database.relations || []).filter(r => r.readonly === true);
    localStorage.setItem(database.fileName + ".relations-data", JSON.stringify(relationsToSave));
    document.getElementById("import-table-link").style.display = "block";
    updateQuickAccessPanel(
        getCurrentTableNames(), getCurrentQueryNames(),
        getCurrentReportNames(), getCurrentFormNames()
    );
}

async function showStorageDialog() {
    const listEl = document.getElementById("storageList");
    listEl.innerHTML = "";
    selectedDbFile = null;
    const { invoke } = window.__TAURI__.core;
    let names;
    try {
        names = await invoke("list_databases");
    } catch (e) { names = []; }

    names.forEach(name => {
        const li = document.createElement("li");
        li.textContent = name;
        li.style.padding = "8px";
        li.style.cursor = "pointer";
        li.addEventListener("click", () => {
            [...listEl.children].forEach(el => el.style.background = "");
            const isDark = document.body.classList.contains("dark-theme");
            li.style.background = isDark ? "#242d43" : "#d0e0ff";
            selectedDbFile = name;
        });
        listEl.appendChild(li);
    });
    document.getElementById("storageModal").style.display = "flex";
}

async function loadSelectedDb() {
    setLoadingTitle(selectedDbFile || "бази даних");
    try {
        await yieldToUi();
        return await _loadSelectedDb();
    } finally {
        hideLoading();
    }
}

async function _loadSelectedDb() {
    if (!selectedDbFile) {
        Message(t("ioSelectDbFile"));
        hideLoading();
        return;
    }

    await dba.openDatabaseFile(selectedDbFile);
    db = dba.db;

    // Очистити database, queries та меню
    clearDB();
    // syncAllAppSettings викличеться з loadDatabase() нижче

    // Завантажити дані з локального сховища
    const fullDatabase = JSON.parse(localStorage.getItem(selectedDbFile + ".tables-data"));
    console.log("fullDatabase=", fullDatabase);

    queries.definitions = [];
    if (fullDatabase) {
        database.tables = fullDatabase;
    
        // Створити всі таблиці в SQLite, якщо вони відсутні
        for (const t of database.tables) {
            try {
                await dba.db.exec(`SELECT * FROM "${t.name}" LIMIT 1`);
            } catch (e) {
                console.warn(`Таблиця "${t.name}" відсутня в SQLite, створюємо...`);
                
                // Створення таблиці вручну з її schema
                const fields = t.schema.map(field => {
                    let type = (field.type || "").toUpperCase();
                    if (type === "ЦІЛЕ ЧИСЛО") type = "INTEGER";
                    else if (type === "ДРОБОВЕ ЧИСЛО") type = "REAL";
                    else if (type === "ТЕКСТ") type = "TEXT";
                    else if (type === "ТАК/НІ" || type === "BOOLEAN") type = "INTEGER";
                    else if (type === "ДАТА") type = "TEXT";
                    else if (type === "ЗОБРАЖЕННЯ" || type === "IMAGE") type = "TEXT";
                    else if (type === "ФАЙЛ") type = "BLOB";

                    let def = `"${field.title}" ${type}`;

                    if (field.primaryKey) {
                        if (field.autoInc && type === "INTEGER") {
                            def += " PRIMARY KEY AUTOINCREMENT";
                        } else {
                            def += " PRIMARY KEY";
                        }
                    }

                    return def;
                });

                // Додати FOREIGN KEY (якщо є)
                const foreignKeys = t.schema
                    .filter(f => f.foreignKey && f.refTable && f.refField)
                    .map(f => `FOREIGN KEY ("${f.title}") REFERENCES "${f.refTable}"("${f.refField}")`);

                const fullFields = [...fields, ...foreignKeys].join(", ");
                await dba.db.run(`CREATE TABLE "${t.name}" (${fullFields});`);
            }

            // 🔧 відновлюємо subst у схемі (щоб не губився після відновлення)
            t.schema = t.schema.map(f => ({
                ...f,
                subst: f.subst || false,
                autoInc: f.autoInc ?? false
            }));

            // Завантажити дані
            const res = await dba.db.exec(`SELECT * FROM "${t.name}"`);
            t.data = res.length ? res[0].values : [];
        }
    } else {
        Message(t("ioFileCorrupted"));
        hideLoading();
        return;
    }
    console.log("t.data=",database.tables)

    // Load
    database.fileName = selectedDbFile;
    await loadDatabase();

    // 🔄 Автоматично додати зв’язки з foreign key
    database.relations = [];
    database.tables.forEach(table => {
        table.schema.forEach(field => {
            if (field.foreignKey && field.refTable && field.refField) {
                database.relations.push({
                    fromTable: table.name,
                    fromField: field.title,
                    toTable: field.refTable,
                    toField: field.refField,
                    readonly: true,
                });
            }
        });
    });

    database.tables.forEach(t => addTableToMenu(t.name)); // 🔧 Оновити меню "Дані"
    Message(t("ioDbLoaded", selectedDbFile));
    database.fileName = selectedDbFile;
    localStorage.setItem('lastOpenedFile', selectedDbFile);
    closeStorageDialog();
    updateMainTitle();
}

async function exportDTA() {
    if (!db) {
        Message(t("ioNoActiveDb"));
        return;
    }
    const zip = new JSZip();

    // SQLite база
    const dbData = await dba.db.export();
    zip.file("database.sqlite", dbData);

    // Запити
    const queriesJson = JSON.stringify(queries.definitions, null, 2);
    zip.file("queries.json", queriesJson);

    // Звіти
    const reportsJson = JSON.stringify(database.reports, null, 2);
    zip.file("reports.json", reportsJson);

    // Результати запитів
    zip.file("query-results.json", JSON.stringify(queries.results || []));

    // Схеми (без data)
    const schemas = database.tables.map(t => ({
        name: t.name,
        schema: t.schema
    }));
    zip.file("schemas.json", JSON.stringify(schemas, null, 2));

    // 🆕 Форми
    const formsJson = JSON.stringify(database.forms || [], null, 2);
    zip.file("forms.json", formsJson);

    // Налаштування програми (_app_settings.json) — зберігаємо поточний стан appSettings
    // Доповнюємо ключами з localStorage лише якщо вони відсутні в appSettings
    { const s=loadDbSettings(database.fileName); APP_SETTING_KEYS.forEach(k=>{ if (!appSettingGet(k)) appSettingSet(k, s[k]??"false"); }); }
    zip.file("_app_settings.json", JSON.stringify(Object.assign({}, appSettings), null, 2));

    // Архів
    const content = await zip.generateAsync({ type: "uint8array" });
    const filename = (database.fileName || "my_database") + ".dta";

    await dba.saveBytesViaDialog(content, filename, ["dta"], "application/octet-stream");
}


async function importDTA(file) {
    setLoadingTitle(file?.name || "DTA-файлу");
    try {
        await yieldToUi();
        return await _importDTA(file);
    } finally {
        hideLoading();
    }
}

async function openDtaFile() {
    const path = await dba.pickOpenFile(["dta"]);
    if (!path) return;
    const bytes = await dba.readFileBytes(path);
    const name = path.split(/[\\/]/).pop() || "database.dta";
    await importDTA(new File([bytes], name, { type: "application/octet-stream" }));
}

async function _importDTA(file) {
    const zip = await JSZip.loadAsync(file);
    const dbFile = await zip.file("database.sqlite").async("uint8array");
    database.fileName = file.name.split('.')[0];
    await dba.importDatabaseFile(database.fileName, dbFile);
    db = dba.db;

    // Запити
    const queriesText = await zip.file("queries.json").async("string");
    queries.definitions = JSON.parse(queriesText);

    // Звіти
    const reportsText = await zip.file("reports.json").async("string");
    database.reports = JSON.parse(reportsText);

    // Результати запитів
    if (zip.file("query-results.json")) {
        const resultsText = await zip.file("query-results.json").async("string");
        queries.results = JSON.parse(resultsText);
    } else {
        queries.results = [];
    }

    // Схеми
    let savedSchemas = [];
    if (zip.file("schemas.json")) {
        const schemasText = await zip.file("schemas.json").async("string");
        savedSchemas = JSON.parse(schemasText);
    }

    // 🆕 Форми
    if (zip.file("forms.json")) {
        console.log("Знайдено форми")
        const formsText = await zip.file("forms.json").async("string");
        database.forms = JSON.parse(formsText);
        // Валідація форм після імпорту
        database.forms = database.forms.map(form => ({
            ...form,
            elements: form.elements.map(el => {
                if (el.type === "field") {
                    return {
                        ...el,
                        tableName: el.tableName || "",
                        fieldName: el.fieldName || ""
                    };
                }
                return el;
            })
        }));
     console.log(database.forms)   
    } else {
        database.forms = [];
    }

    // Налаштування програми (_app_settings.json)
    if (zip.file("_app_settings.json")) {
        try {
            const settingsText = await zip.file("_app_settings.json").async("string");
            const loaded = JSON.parse(settingsText);
            Object.assign(appSettings, loaded);
            console.log("Налаштування завантажено з _app_settings.json:", appSettings);
        } catch (e) {
            console.warn("Не вдалося прочитати _app_settings.json:", e);
        }
    }

    // Відновлення таблиць через sqlite_master + savedSchemas
    database.tables = [];
    syncAllAppSettings(database.fileName);
    const res = await dba.db.exec("SELECT name, sql FROM sqlite_master WHERE type='table';");
    if (res.length > 0) {
        const tableRows = res[0].values;
        for (const [name, sql] of tableRows) {
            if (name.startsWith("sqlite_") || name === "_app_settings") continue;

            const savedSchema = savedSchemas.find(s => s.name === name)?.schema;

            let schema = [];
            if (savedSchema) {
                schema = savedSchema;
            } else {
                const match = sql.match(/\((.+)\)/s);
                if (match) {
                    const schemaText = match[1];
                    const schemaParts = schemaText.split(",").map(s => s.trim());
                    schema = schemaParts.map(part => {
                        const [titleRaw, typeRaw, ...rest] = part.split(/\s+/);
                        return {
                            title: titleRaw.replace(/"/g, ''),
                            type: typeRaw === "INTEGER" ? "Ціле число" :
                                  typeRaw === "REAL"    ? "Дробове число" :
                                  typeRaw === "BOOLEAN" ? "Так/Ні" :
                                  typeRaw === "TEXT"    ? "Текст" :
                                  typeRaw === "BLOB"    ? "Файл" : typeRaw,
                            primaryKey: rest.includes("PRIMARY") || rest.includes("PRIMARY KEY"),
                            comment: rest.includes("PRIMARY") ? "Первинний ключ" : ""
                        };
                    });
                }
            }

            const selectRes = await dba.db.exec(`SELECT * FROM "${name}"`);
            const dataRows = selectRes.length ? selectRes[0].values : [];

            database.tables.push({
                name,
                schema,
                data: dataRows
            });
        }
    }

    // Оновлення меню
    document.getElementById("data-menu").innerHTML = "";
    database.tables.forEach(t => addTableToMenu(t.name));
    queries.results.forEach(q => addTableToMenu(`*${q.name}`));

    localStorage.setItem('lastOpenedFile', database.fileName);
    saveDatabase();
    Message(t("ioDtaImported"));
    updateMainTitle();
    updateQuickAccessPanel(
        getCurrentTableNames(),
        getCurrentQueryNames(),
        getCurrentReportNames(),
        getCurrentFormNames()
    );
}

// імпорт бази даних SQLite
async function importSQLiteDb(file) {
    setLoadingTitle(file?.name || "SQLite-файлу");

        if (!file) {
            Message(t("ioFileNotSelected"));
            hideLoading();
            return;
        }

        const reader = new FileReader();

        reader.onload = async function(event) {
            const arrayBuffer = event.target.result;
            const uIntArray = new Uint8Array(arrayBuffer);

            try {
                clearDB();
                const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
                const fileName = nameWithoutExt;

                // Зберігаємо файл в IndexedDB
                await dba.importDatabaseFile(fileName, uIntArray);
                db = dba.db;
                syncAllAppSettings(fileName);
    
                const res = await dba.db.exec("SELECT name, sql FROM sqlite_master WHERE type='table';");
                if (res.length > 0) {
                    const tableRows = res[0].values;
                    for (const [name] of tableRows) {
                        if (name.startsWith("sqlite_") || name === "_app_settings") continue;
    
                        const pragmaRes = await dba.db.exec(`PRAGMA table_info("${name}")`);
                        if (!pragmaRes.length) return;
                        
                        const columns = pragmaRes[0].values;
                        
                        // Зчитуємо зовнішні ключі
                        const fkRes = await dba.db.exec(`PRAGMA foreign_key_list("${name}")`);
                        const foreignKeys = fkRes.length ? fkRes[0].values.map(([id, seq, refTable, fromCol, toCol]) => ({
                            fromCol, refTable, toCol
                        })) : [];
                        
                        // Формуємо схему
                        const schema = columns.map(([cid, title, type, notnull, dflt_value, pk]) => {
                            const fk = foreignKeys.find(f => f.fromCol === title);
                            return {
                                title,
                                type: type.toUpperCase() === "INTEGER" ? "Ціле число"
                                    : type.toUpperCase() === "REAL" ? "Дробове число"
                                    : type.toUpperCase().includes("TEXT") ? "Текст"
                                    : type.toUpperCase().includes("BOOL") ? "Так/Ні"
                                    : type.toUpperCase() === "BLOB" ? "Файл"
                                    : type,
                                primaryKey: pk > 0,
                                comment: pk > 0 ? "Первинний ключ" : "",
                                foreignKey: !!fk,
                                refTable: fk ? fk.refTable : null,
                                refField: fk ? fk.toCol : null,
                                subst: false // за замовчуванням
                            };
                        });
    
                        const selectRes = await dba.db.exec(`SELECT * FROM "${name}"`);
                        const dataRows = selectRes.length ? selectRes[0].values : [];
                        
                        database.tables.push({
                            name: name,
                            schema: schema,
                            data: dataRows
                        });
                    }
                }
    
                // 🆕 Додати зовнішні ключі до database.relations
                // Спочатку очистимо relations
                database.relations = [];
                
                // Пройдемо по всіх таблицях і зберемо foreign keys
                database.tables.forEach(table => {
                    table.schema.forEach(field => {
                        if (field.foreignKey && field.refTable && field.refField) {
                            // Перевіряємо чи такий зв'язок вже існує
                            const exists = database.relations.some(r =>
                                r.fromTable === table.name &&
                                r.fromField === field.title &&
                                r.toTable === field.refTable &&
                                r.toField === field.refField
                            );
    
                            if (!exists) {
                                database.relations.push({
                                    fromTable: table.name,
                                    fromField: field.title,
                                    toTable: field.refTable,
                                    toField: field.refField,
                                    color: "red",
                                    readonly: true
                                });
                            }
                        }
                    });
                });
    
                database.fileName = fileName;
                saveDatabase();
                
                database.tables.forEach(t => addTableToMenu(t.name));
                updateMainTitle();
                
                Message(t("ioSqliteImported", fileName));
                
                updateQuickAccessPanel(
                    getCurrentTableNames(),
                    getCurrentQueryNames(),
                    getCurrentReportNames(),
                    getCurrentFormNames()
                );
                hideLoading();
                
            } catch (e) {
        Message(t("ioImportError", e.message));
        hideLoading();
        }
        };
    
        reader.readAsArrayBuffer(file);
    }
    
// експорт в базу даних SQLite
async function exportSQLiteDb() {
        if (!db) {
            Message(t("ioNoActiveDb"));
            return;
        }

        const data = await dba.db.export();

        // Використовуємо назву з database.fileName або "my_database"
        const fileName = (database.fileName || "my_database") + ".sqlite";

        await dba.saveBytesViaDialog(data, fileName, ["sqlite", "db"], "application/x-sqlite3");
    }
    
/**
 * ============================================================
 * Імпорт з CSV файлу — новий багатоетапний флоу
 * Спільна логіка з імпортом через буфер обміну (clipboard).
 *
 * Етап 1 (CSV):    вибір файлу → парсинг → показ прев'ю
 * Етап 1 (Clipboard): вставка тексту → показ прев'ю
 * Етап 2 (спільний): вибір назви таблиці, перегляд полів,
 *                    вибір ключового поля → збереження
 * ============================================================
 */

// Парсинг CSV-тексту у масив рядків (RFC 4180 — підтримка лапок і символів-розділювачів у комірках)
function parseCsvText(csvText) {
    // Нормалізуємо переводи рядків
    const text = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (!text.trim()) return null;

    // Визначаємо роздільник за першим рядком (враховуємо лапки при підрахунку)
    const firstLine = text.split("\n")[0];
    const countDelim = (str, delim) => {
        let count = 0, inQ = false;
        for (let i = 0; i < str.length; i++) {
            if (str[i] === '"') inQ = !inQ;
            else if (!inQ && str[i] === delim) count++;
        }
        return count;
    };
    const hasSemicolon = countDelim(firstLine, ";");
    const hasComma     = countDelim(firstLine, ",");
    const delimiter    = hasSemicolon > hasComma ? ";" : ",";

    // Повноцінний RFC 4180 парсер: розуміє лапки, екранування (""), багаторядкові комірки
    const rows = [];
    let row = [];
    let i = 0;

    while (i < text.length) {
        if (text[i] === '"') {
            // Quoted field
            let cell = "";
            i++; // пропускаємо відкриваючу лапку
            while (i < text.length) {
                if (text[i] === '"') {
                    if (text[i + 1] === '"') {
                        // Екранована лапка "" → одна лапка
                        cell += '"';
                        i += 2;
                    } else {
                        // Закриваюча лапка
                        i++;
                        break;
                    }
                } else {
                    cell += text[i];
                    i++;
                }
            }
            row.push(cell);
            // Пропускаємо роздільник або кінець рядка після закриваючої лапки
            if (text[i] === delimiter) i++;
            else if (text[i] === "\n") { rows.push(row); row = []; i++; }
        } else {
            // Unquoted field — читаємо до роздільника або кінця рядка
            let cell = "";
            while (i < text.length && text[i] !== delimiter && text[i] !== "\n") {
                cell += text[i];
                i++;
            }
            row.push(cell.trim());
            if (text[i] === delimiter) i++;
            else if (text[i] === "\n") { rows.push(row); row = []; i++; }
        }
    }
    // Останній рядок (якщо немає фінального \n)
    if (row.length > 0) rows.push(row);

    // Фільтруємо порожні рядки (наприклад, порожній останній рядок файлу)
    return rows.filter(r => r.some(cell => cell !== "")) || null;
}

// Обробка вибраного файлу: парсинг → прев'ю
function handleCsvFile(file) {
    if (!file) {
        Message(t("ioFileNotSelected"));
        return;
    }
    const reader = new FileReader();
    reader.onload = function(event) {
        const rows = parseCsvText(event.target.result);
        if (!rows || rows.length < 2) {
            Message(t("ioCsvNoData"));
            return;
        }
        // Зберігаємо розпарсені дані та показуємо прев'ю
        importedData = rows;
        _showImportPreviewModal(rows, "csv");
    };
    reader.readAsText(file);
}

// Показати модальне вікно прев'ю (спільне для CSV та clipboard)
// source: "csv" | "clipboard"
function _showImportPreviewModal(rows, source) {
    const modal = document.getElementById("importTableModal");

    // Приховуємо блок підказки для вставки (він потрібен лише для clipboard до вставки)
    const msg = document.getElementById("importMsg");
    if (msg) msg.style.display = source === "clipboard" ? "block" : "none";

    // Рендеримо таблицю прев'ю
    renderPreviewTable_fromRows(rows);

    // Показуємо / ховаємо кнопку «Імпорт»
    const importBtn = document.getElementById("importPreviewBtn");
    if (importBtn) importBtn.style.display = rows && rows.length >= 2 ? "inline-block" : "none";

    modal.style.display = "flex";
}

// Рендер прев'ю таблиці з масиву рядків
function renderPreviewTable_fromRows(rows) {
    if (!rows || !rows.length) return;
    const table = document.createElement("table");
    table.style.fontSize = "10px";
    table.border = "1";
    rows.slice(0, 51).forEach((row, i) => {   // показуємо перші 50 рядків
        const tr = document.createElement("tr");
        row.forEach(cell => {
            const td = document.createElement(i === 0 ? "th" : "td");
            td.textContent = cell;
            tr.appendChild(td);
        });
        table.appendChild(tr);
    });
    const preview = document.getElementById("previewArea");
    preview.innerHTML = "";
    preview.appendChild(table);
    const msg = document.getElementById("importMsg");
    if (msg) msg.style.display = "none";
}

// Адаптер для clipboard: вставлений текст → прев'ю 
// (замінює стару функцію renderPreviewTable, яка вже використовувала tab-роздільник)
function renderPreviewTableLegacy(text) {
    if (!text.trim()) return;
    // Clipboard з Excel/Calc використовує Tab як роздільник
    const rows = text.trim().split("\n").map(r => r.split("\t").map(c => c.trim()));
    importedData = rows;
    renderPreviewTable_fromRows(rows);
    const importBtn = document.getElementById("importPreviewBtn");
    if (importBtn) importBtn.style.display = "inline-block";
}

// «Імпорт» — перехід від прев'ю до вибору схеми
// (спільна для обох джерел; замінює стару confirmImportTable)
function confirmImportTableLegacy() {
    if (!importedData || importedData.length < 2) {
        Message(t("ioNoImportData"));
        return;
    }

    const headers   = importedData[0];
    const sampleRow = importedData[1];

    // Локалізовані назви типів через SCHEMA_TYPES
    const ST       = SCHEMA_TYPES;
    const typeText = ST[0];
    const typeInt  = ST[1];
    const typeReal = ST[2];
    const typeDate = ST[4];

    // Автодетект типу кожного поля за першим рядком даних
    const schema = headers.map((h, i) => {
        const val = (sampleRow[i] || "").trim();
        let type = typeText;
        if (val !== "" && !isNaN(parseInt(val)) && Number.isInteger(Number(val))) type = typeInt;
        else if (val !== "" && !isNaN(parseFloat(val.replace(",", ".")))) type = typeReal;
        else if (/^\d{4}-\d{2}-\d{2}$/.test(val)) type = typeDate;
        return { title: h.trim(), type };
    });

    window._importSchemaNoPK = schema;
    window._importTypeInt    = typeInt;

    // Закриваємо вікно прев'ю і відкриваємо вікно підтвердження схеми
    closeImportTableDialog();
    document.getElementById("confirmImportModal").style.display = "flex";
    document.getElementById("importTableName").value = t("importTableName");

    // Таблиця схеми
    const schemaDiv = document.getElementById("tableSchemaPreview");
    let html = `<table border="1" cellpadding="5" style="border-collapse:collapse;width:100%;">`;
    html += `<thead><tr><th>${t("ioSchemaFieldName")}</th><th>${t("ioSchemaDataType")}</th></tr></thead><tbody>`;
    schema.forEach(f => {
        html += `<tr><td>${f.title}</td><td>${f.type}</td></tr>`;
    });
    html += `</tbody></table>`;
    schemaDiv.innerHTML = html;

    // Блок вибору ключового поля
    const pkBlock = document.getElementById("importPkChoice");
    if (pkBlock) {
        let opts = `<option value="__add_id__">${t("ioAddAutoId")}</option>`;
        schema.forEach((f, i) => {
            const sqlT = typeToSQL(f.type);
            if (sqlT === "INTEGER" || sqlT === "TEXT") {
                opts += `<option value="${i}">${f.title} (${f.type})</option>`;
            }
        });
        pkBlock.innerHTML = `
          <label style="font-weight:bold;">${t("ioPkChoiceLabel")}</label><br>
          <select id="importPkSelect" style="margin-top:4px;width:100%;">${opts}</select>
        `;
    }
}

// Відкрити вікно прев'ю для clipboard-імпорту 
// (замінює стару showImportTableDialog з тим самим id модала)
function showImportTableDialogLegacy() {
    importedData = null;
    document.getElementById("importTableModal").style.display = "flex";
    const msg = document.getElementById("importMsg");
    if (msg) msg.style.display = "block";
    const importBtn = document.getElementById("importPreviewBtn");
    if (importBtn) importBtn.style.display = "none";
    const preview = document.getElementById("previewArea");
    if (preview) preview.innerHTML = "";
    const input = document.getElementById("clipboardInput");
    if (input) {
        input.value = "";
        input.focus();
    }

    // Оновлюємо кнопку вставки
    _updatePasteButton();

    // Активуємо фокус при кліку / натисканні
    const modal = document.getElementById("importTableModal");
    modal.addEventListener("click",  () => input && input.focus());
    modal.addEventListener("keydown",() => input && input.focus());

    if (input) {
        input.onpaste = function(e) {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData("text");
            renderPreviewTable(text);
        };
        // Мобільні: відстежуємо введення тексту вручну (після довгого тапу → Вставити)
        input.oninput = function() {
            if (input.value.trim()) {
                renderPreviewTable(input.value);
            }
        };
    }
}


/**
 * Вставка з буфера обміну — кросплатформна реалізація.
 *
 * Стратегія:
 *   1. Clipboard API (navigator.clipboard.readText) — працює на десктопі та
 *      Chrome/Edge на Android при наявності дозволу.
 *   2. Execcommand fallback — застарілий метод для старих браузерів.
 *   3. Фокус на textarea — універсальний fallback для iOS Safari та будь-яких
 *      випадків, де програмний доступ заблоковано; користувач вставляє вручну
 *      через довгий тап → «Вставити».
 */
async function _pasteFromClipboard() {
    const input = document.getElementById("clipboardInput");
    if (!input) return;

    // Стратегія 1: сучасний Clipboard API
    if (navigator.clipboard && typeof navigator.clipboard.readText === "function") {
        try {
            const text = await navigator.clipboard.readText();
            if (text && text.trim()) {
                renderPreviewTable(text);
                return;
            }
        } catch (err) {
            // Дозвіл відхилено або API недоступний — переходимо до fallback
            console.warn("Clipboard API недоступний:", err.message);
        }
    }

    // Стратегія 2: document.execCommand (застарілий, але працює в деяких браузерах)
    try {
        input.focus();
        input.select();
        const success = document.execCommand("paste");
        if (success && input.value.trim()) {
            renderPreviewTable(input.value);
            return;
        }
    } catch (err) {
        console.warn("execCommand paste недоступний:", err.message);
    }

    // Стратегія 3: фокус на textarea — підказка для мобільних (iOS Safari, тощо)
    input.focus();
    input.value = "";
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    const hintText = isMobile
        ? (typeof t === "function" ? (t("ioPasteHintMobile") || "👆 Утримуйте палець тут і оберіть «Вставити»") : "👆 Утримуйте палець тут і оберіть «Вставити»")
        : (typeof t === "function" ? (t("ioPasteHintDesktop") || "Натисніть Ctrl+V для вставки") : "Натисніть Ctrl+V для вставки");
    input.placeholder = hintText;

    // Показуємо підказку через Message
    if (typeof Message === "function") Message(hintText, false);
}

/**
 * Експортує вміст таблиці у CSV-файл із назвою "<назва таблиці>.csv".
 * 
 * Структура таблиці:
 * {
 *   name: "Teachers",            // Назва таблиці
 *   schema: [...],              // Масив полів (із назвою, типом, тощо)
 *   data: [[1, "Ім'я"], ...]    // Масив рядків даних
 * }
 *
 * CSV-файл матиме перший рядок — заголовки, далі — значення через роздільник ";"
 * Усі текстові значення будуть обгорнуті в лапки.
 */
async function exportTableToCSVLegacy() {
    const tableName = selectedTableNameForEdit;
    console.log("CSV name=",tableName);   
    const table = database.tables.find(t => t.name === tableName);
    console.log("CSV table=",table)
    if (!table || !table.name || !table.schema || !table.data) {
        console.error("Неправильна структура таблиці для експорту.");
        return;
    }

    // Отримати назви полів зі схеми
    const headers = table.schema.map(field => field.title);

    // Створити масив рядків CSV, починаючи з заголовків
    const csvRows = [];
    csvRows.push(headers.join(";")); // перший рядок — заголовки

    // Додати дані
    for (const row of table.data) {
        const csvRow = row.map(value => {
            // Якщо значення містить роздільник або лапки — обгорнути в лапки і екранувати лапки
            if (typeof value === "string") {
                const escaped = value.replace(/"/g, '""');
                return `"${escaped}"`;
            }
            return value;
        });
        csvRows.push(csvRow.join(";"));
    }

    // Об’єднати рядки в текст
    const csvContent = csvRows.join("\n");

    // Створити blob і зберегти файл
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const fileName = `${table.name}.csv`;

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function closeConfirmImportLegacy() {
  document.getElementById("confirmImportModal").style.display = "none";
}

async function saveImportedTableLegacy() {
  const name = document.getElementById("importTableName").value.trim();
  if (!checkName(name)) return;

  const exists = database.tables.some(t => t.name === name);
  if (exists) {
    Message(t("ioTableExists", name));
    return;
  }

  const typeInt = window._importTypeInt || SCHEMA_TYPES[1];
  const baseSchemaNoPK = window._importSchemaNoPK || [];
  const pkSelect = document.getElementById("importPkSelect");
  const pkChoice = pkSelect ? pkSelect.value : "__add_id__";

  let schema;
  let idWasAdded = false;

  if (pkChoice === "__add_id__") {
    schema = [{ title: "ID", type: typeInt, primaryKey: true, autoInc: true }]
      .concat(baseSchemaNoPK.map(f => ({ ...f })));
    idWasAdded = true;
  } else {
    const pkIdx = parseInt(pkChoice, 10);
    schema = baseSchemaNoPK.map((f, i) => {
      if (i === pkIdx) {
        const sqlT = typeToSQL(f.type);
        return { ...f, primaryKey: true, autoInc: sqlT === "INTEGER" };
      }
      return { ...f };
    });
  }

  // CREATE TABLE
  const fieldsDef = schema.map(f => {
    const sqlType = typeToSQL(f.type);
    let def = `"${f.title}" ${sqlType}`;
    if (f.primaryKey) def += " PRIMARY KEY";
    return def;
  }).join(", ");

  try {
    await dba.db.run(`CREATE TABLE "${name}" (${fieldsDef});`);
  } catch(e) {
    Message(t("ioTableCreateError", e.message));
    return;
  }

  // INSERT — завжди передаємо всі колонки явно, включно з ID
  const insertCols = schema.map(f => `"${f.title}"`).join(", ");
  const insertPlaceholders = schema.map(() => "?").join(", ");

  const dataRows = importedData.slice(1);

  const coerceValue = (v, schemaField) => {
		if (v === "" || v === null || v === undefined) return null;
		const sqlType = typeToSQL(schemaField.type);
		if (sqlType === "REAL") return parseFloat(v.replace(",", ".")) || null;
		if (sqlType === "INTEGER") return parseInt(v) || null;

		return v;
  };
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    let insertValues;
    if (idWasAdded) {
      // Явно передаємо ID = i+1, решта — з вихідного рядка
      insertValues = [i + 1, ...baseSchemaNoPK.map((_, colIdx) => {
        const v = (row[colIdx] ?? "").trim();
        return coerceValue(v, baseSchemaNoPK[colIdx]);
      })];
    } else {
      // PK береться з даних як є
      insertValues = schema.map((f, colIdx) => {
        const v = (row[colIdx] ?? "").trim();
        return coerceValue(v, schema[colIdx]);
      });
    }
    try {
      await dba.db.run(
        `INSERT INTO "${name}" (${insertCols}) VALUES (${insertPlaceholders});`,
        insertValues
      );
    } catch(e) {
      console.warn("INSERT error:", e.message, row);
    }
  }

  // Перечитуємо реальні дані з SQLite
  const newTable = { name, schema, data: [] };
  try {
    const res = await dba.db.exec(`SELECT * FROM "${name}"`);
    newTable.data = res.length ? res[0].values : [];
  } catch(e) {
    console.warn("Не вдалося перечитати дані після імпорту:", e);
  }

  database.tables.push(newTable);
  saveDatabase();
  addTableToMenu(name);
  Message(t("ioTableImported"));
  closeImportTableDialog();
  closeConfirmImport();
}

function showCsvImportDialog() {

    setImportMessageMode(true);
    document.getElementById("importTableModal").style.display = "flex";
    
}

// Відкрити вибір файлу
async function proceedCsvImport() {
    closeCsvImportDialog();
    const path = await dba.pickOpenFile(["csv"]);
    if (!path) return;
    const bytes = await dba.readFileBytes(path);
    const name = path.split(/[\\/]/).pop() || "import.csv";
    handleCsvFile(new File([bytes], name, { type: "text/csv" }));
}

/**
 * Змінює вміст блоку #importMessage залежно від типу імпорту
 * @param {boolean} cvs - якщо true, показує заголовок для CSV, інакше — інструкцію для Ctrl+V
 */
function setImportMessageMode(cvs = false) {
  const container = document.getElementById('importMessage');
  if (!container) return;

  if (cvs) {
    // Режим CSV
    container.innerHTML = `<h3>${t("selectFileForCSVImport")}</h3>
        <button onclick="proceedCsvImport()" class="square-btn">
        <span class="ui-icon" style="font-size: 28px;">🗂️</span>
        <span style="font-size: 12px;">${t("file")}</span>
      </button>      
    `;
    container.style.display = 'block';
    container.style.alignItems = '';
    container.style.gap = '';
    container.style.flexWrap = '';
  } else {
    // Режим звичайного імпорту (Ctrl+V)
    container.innerHTML = `
      <span id="importMsg" lang-i18n="importInstructions">
        Скопіюйте дані з табличного процесора і натисніть
      </span>
      <div style="display: flex; align-items: center; gap: 8px;">
        <img src="./img/ctrl-v.png" alt="Ctrl+V" >
      </div>
    `;
    // Відновлюємо оригінальні flex-стилі
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.gap = '12px';
    container.style.flexWrap = 'wrap';
  }

}

/**
 * Експортує вміст таблиці у CSV-файл із назвою "<назва таблиці>.csv".
 * 
 * Структура таблиці:
 * {
 *   name: "Teachers",            // Назва таблиці
 *   schema: [...],              // Масив полів (із назвою, типом, тощо)
 *   data: [[1, "Ім'я"], ...]    // Масив рядків даних
 * }
 *
 * CSV-файл матиме перший рядок — заголовки, далі — значення через роздільник ";"
 * Усі текстові значення будуть обгорнуті в лапки.
 */
function exportTableToCSV() {
    const tableName = selectedTableNameForEdit;
    console.log("CSV name=",tableName);   
    const table = database.tables.find(t => t.name === tableName);
    console.log("CSV table=",table)
    if (!table || !table.name || !table.schema || !table.data) {
        console.error("Неправильна структура таблиці для експорту.");
        return;
    }

    // Отримати назви полів зі схеми
    const headers = table.schema.map(field => field.title);

    // Створити масив рядків CSV, починаючи з заголовків
    const csvRows = [];
    csvRows.push(headers.join(";")); // перший рядок — заголовки

    // Додати дані
    for (const row of table.data) {
        const csvRow = row.map(value => {
            // Якщо значення містить роздільник або лапки — обгорнути в лапки і екранувати лапки
            if (typeof value === "string") {
                const escaped = value.replace(/"/g, '""');
                return `"${escaped}"`;
            }
            return value;
        });
        csvRows.push(csvRow.join(";"));
    }

    // Об’єднати рядки в текст
    const csvContent = csvRows.join("\n");

    // Створити blob і зберегти файл
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const fileName = `${table.name}.csv`;

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Імпорт таблиці з Excel/LO Calc/WPS Spreadsheet через Ctrl+C/Ctrl+V
 **/
function showImportTableDialog() {
  setImportMessageMode(false);	
  document.getElementById("importTableModal").style.display = "flex";
  document.getElementById("importMsg").style.display = "block";
  const input = document.getElementById("clipboardInput");
  input.value = "";
  input.focus();

  // повторно активуємо фокус при будь-якому кліку / натисканні клавіші
  document.getElementById("importTableModal").addEventListener("click", () => input.focus());
  document.getElementById("importTableModal").addEventListener("keydown", () => input.focus());

  input.onpaste = function(e) {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text");
    renderPreviewTable(text);
  };
}

let importedData = null; // глобально збережені дані після вставки

function renderPreviewTable(text) {
  if (!text.trim()) return;
  const rows = text.trim().split("\n").map(r => r.split("\t"));
  importedData = rows;

  const table = document.createElement("table");
  table.style.fontSize = "10px";
  table.border = "1";
  rows.forEach((row, i) => {
    const tr = document.createElement("tr");
    row.forEach(cell => {
      const td = document.createElement(i === 0 ? "th" : "td");
      td.textContent = cell.trim();
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
  const preview = document.getElementById("previewArea");
  preview.innerHTML = "";
  preview.appendChild(table);
  document.getElementById("importMsg").style.display = "none";
}

function confirmImportTable() {
  if (!importedData || importedData.length < 2) {
    Message(t("ioNoImportData"));
    return;
  }

  const headers = importedData[0];
  const sampleRow = importedData[1];

  // Локалізовані назви типів через SCHEMA_TYPES
  const ST = SCHEMA_TYPES;
  const typeText = ST[0];
  const typeInt  = ST[1];
  const typeReal = ST[2];
  const typeDate = ST[4];

  // Визначаємо тип кожного поля за першим рядком даних
  const schema = headers.map((h, i) => {
    const val = (sampleRow[i] || "").trim();
    let type = typeText;
    if (val !== "" && !isNaN(parseInt(val)) && Number.isInteger(Number(val))) type = typeInt;
    else if (val !== "" && !isNaN(parseFloat(val.replace(",", ".")))) type = typeReal;
    else if (/^\d{4}-\d{2}-\d{2}$/.test(val)) type = typeDate;
    return { title: h.trim(), type: type };
  });

  // Зберігаємо схему без PK — користувач обере далі
  window._importSchemaNoPK = schema;
  window._importTypeInt = typeInt; // зберігаємо для saveImportedTable

  // Показуємо вікно підтвердження
  document.getElementById("confirmImportModal").style.display = "flex";
  document.getElementById("importTableName").value = t("importTableName");
  const schemaDiv = document.getElementById("tableSchemaPreview");

  // Рядки попереднього перегляду схеми
  let html = `<table border="1" cellpadding="5" style="border-collapse:collapse;width:100%;">`;
  html += `<thead><tr><th>${t("ioSchemaFieldName")}</th><th>${t("ioSchemaDataType")}</th></tr></thead><tbody>`;
  schema.forEach(f => {
    html += `<tr><td>${f.title}</td><td>${f.type}</td></tr>`;
  });
  html += `</tbody></table>`;
  schemaDiv.innerHTML = html;

  // Будуємо блок вибору ключового поля
  const pkBlock = document.getElementById("importPkChoice");
  if (pkBlock) {
    // Варіанти: наявні поля (тільки integer або text) + опція "додати ID"
    let opts = `<option value="__add_id__">${t("ioAddAutoId")}</option>`;
    schema.forEach((f, i) => {
      const sqlT = typeToSQL(f.type);
      if (sqlT === "INTEGER" || sqlT === "TEXT") {
        opts += `<option value="${i}">${f.title} (${f.type})</option>`;
      }
    });
    pkBlock.innerHTML = `
      <label style="font-weight:bold;">${t("ioPkChoiceLabel")}</label><br>
      <select id="importPkSelect" style="margin-top:4px;width:100%;">${opts}</select>
    `;
  }
}


function closeConfirmImport() {
  document.getElementById("confirmImportModal").style.display = "none";
}

async function saveImportedTable() {
  const name = document.getElementById("importTableName").value.trim();
  if (!checkName(name)) return;

  const exists = database.tables.some(t => t.name === name);
  if (exists) {
    Message(t("ioTableExists", name));
    return;
  }

  const typeInt = window._importTypeInt || SCHEMA_TYPES[1];
  const baseSchemaNoPK = window._importSchemaNoPK || [];
  const pkSelect = document.getElementById("importPkSelect");
  const pkChoice = pkSelect ? pkSelect.value : "__add_id__";

  let schema;
  let idWasAdded = false;

  if (pkChoice === "__add_id__") {
    schema = [{ title: "ID", type: typeInt, primaryKey: true, autoInc: true }]
      .concat(baseSchemaNoPK.map(f => ({ ...f })));
    idWasAdded = true;
  } else {
    const pkIdx = parseInt(pkChoice, 10);
    schema = baseSchemaNoPK.map((f, i) => {
      if (i === pkIdx) {
        const sqlT = typeToSQL(f.type);
        return { ...f, primaryKey: true, autoInc: sqlT === "INTEGER" };
      }
      return { ...f };
    });
  }

  // CREATE TABLE
  const fieldsDef = schema.map(f => {
    const sqlType = typeToSQL(f.type);
    let def = `"${f.title}" ${sqlType}`;
    if (f.primaryKey) def += " PRIMARY KEY";
    return def;
  }).join(", ");

  try {
    await dba.db.run(`CREATE TABLE "${name}" (${fieldsDef});`);
  } catch(e) {
    Message(t("ioTableCreateError", e.message));
    return;
  }

  // INSERT — завжди передаємо всі колонки явно, включно з ID
  const insertCols = schema.map(f => `"${f.title}"`).join(", ");
  const insertPlaceholders = schema.map(() => "?").join(", ");

  const dataRows = importedData.slice(1);

  const coerceValue = (v, schemaField) => {
		if (v === "" || v === null || v === undefined) return null;
		const sqlType = typeToSQL(schemaField.type);
		if (sqlType === "REAL") return parseFloat(v.replace(",", ".")) || null;
		if (sqlType === "INTEGER") return parseInt(v) || null;

		return v;
  };
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    let insertValues;
    if (idWasAdded) {
      // Явно передаємо ID = i+1, решта — з вихідного рядка
      insertValues = [i + 1, ...baseSchemaNoPK.map((_, colIdx) => {
        const v = (row[colIdx] ?? "").trim();
        return coerceValue(v, baseSchemaNoPK[colIdx]);
      })];
    } else {
      // PK береться з даних як є
      insertValues = schema.map((f, colIdx) => {
        const v = (row[colIdx] ?? "").trim();
        return coerceValue(v, schema[colIdx]);
      });
    }
    try {
      await dba.db.run(
        `INSERT INTO "${name}" (${insertCols}) VALUES (${insertPlaceholders});`,
        insertValues
      );
    } catch(e) {
      console.warn("INSERT error:", e.message, row);
    }
  }

  // Перечитуємо реальні дані з SQLite
  const newTable = { name, schema, data: [] };
  try {
    const res = await dba.db.exec(`SELECT * FROM "${name}"`);
    newTable.data = res.length ? res[0].values : [];
  } catch(e) {
    console.warn("Не вдалося перечитати дані після імпорту:", e);
  }

  database.tables.push(newTable);
  saveDatabase();
  addTableToMenu(name);
  Message(t("ioTableImported"));
  closeImportTableDialog();
  closeConfirmImport();
}
/**
 * Завантаження файлу-архіву .dta за URL-параметром ?load=
 *
 * Використання:
 *   dat-a.pp.ua?load=ed-info.github.io/sample-db.dta
 *
 * Правила:
 *   - параметр називається "load"
 *   - значення — адреса файлу БЕЗ схеми (http/https додається автоматично)
 *     або ПОВНА адреса (https://...)
 *   - файл повинен мати розширення .dta
 *   - викликається одразу після ініціалізації SQL.js (після window.i18nReady)
 */

/**
 * Зчитує параметр ?load= з поточного URL.
 * Повертає повну URL-адресу файлу або null.
 */
function getLoadParam() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("load");
    if (!raw) return null;

    // Якщо вже є схема — повертаємо як є
    if (/^https?:\/\//i.test(raw)) return raw;

    // Інакше — додаємо https://
    return "https://" + raw;
}

/**
 * Перевіряє, чи URL веде на .dta файл.
 */
function isValidDtaUrl(url) {
    try {
        const u = new URL(url);
        return u.pathname.toLowerCase().endsWith(".dta");
    } catch {
        return false;
    }
}

/**
 * Завантажує .dta файл з вказаної URL-адреси та передає його в importDTA().
 * Показує індикатор завантаження і повідомлення про помилки через Message().
 *
 * Викликати після того, як SQL та i18n вже готові.
 */
async function loadDtaFromUrl() {
    const url = getLoadParam();
    if (!url) return; // параметр відсутній — нічого не робимо

    if (!isValidDtaUrl(url)) {
        console.warn("url-load: невалідна адреса або не .dta файл:", url);
        Message(t("urlLoadInvalidUrl") || `Невірна адреса файлу: ${url}`);
        return;
    }

    console.log("url-load: завантаження файлу з", url);

    // Показуємо повідомлення про завантаження
    Message(t("urlLoadLoading") || `Завантаження: ${url}…`);

    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();

        // Визначаємо ім'я файлу з URL
        const urlPath = new URL(url).pathname;
        const fileName = urlPath.split("/").pop() || "database.dta";

        // Створюємо File-об'єкт, сумісний з importDTA(file)
        const file = new File([arrayBuffer], fileName, { type: "application/octet-stream" });

        await importDTA(file);

        // Після успішного завантаження прибираємо ?load= з адресного рядка
        // (щоб повторне відкриття сторінки не перезавантажувало файл)
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("load");
        window.history.replaceState({}, "", cleanUrl.toString());

    } catch (err) {
        console.error("url-load: помилка завантаження:", err);
        Message(
            (t("urlLoadError") || "Помилка завантаження файлу:") + " " + err.message
        );
    }
}
// Експорт відфільтрованої/відсортованої таблиці в CSV
function dataViewToCSV() {
    // Зчитуємо поточні рядки з DOM-таблиці (вже відфільтровані та відсортовані)
    const head = document.getElementById("dataViewHead");
    const body = document.getElementById("dataViewBody");

    if (!head || !body) return;

    const columns = Array.from(head.querySelectorAll("th")).map(th => th.textContent);
    const rows    = Array.from(body.querySelectorAll("tr")).map(tr =>
        Array.from(tr.querySelectorAll("td")).map(td => td.textContent)
    );

    if (columns.length === 0) {
        Message(t("dataExportEmpty") || "Немає даних для експорту.");
        return;
    }

    // Екранування значень для CSV: якщо містить кому, лапки або перенос — обгортаємо в лапки
    const escapeCSV = val => {
        const str = String(val ?? "");
        if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    };

    const lines = [
        columns.map(escapeCSV).join(","),
        ...rows.map(row => row.map(escapeCSV).join(","))
    ];

    const csvContent = "\uFEFF" + lines.join("\r\n"); // BOM для коректного відкриття в Excel
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);

    // Визначаємо ім'я файлу з заголовку модального вікна
    const titleEl = document.getElementById("dataViewTitle");
    const rawTitle = titleEl ? titleEl.textContent : "export";
    // Прибираємо небезпечні символи з імені файлу
    const fileName = rawTitle.replace(/[\\/:*?"<>|]/g, "_").trim() || "export";

    const a = document.createElement("a");
    a.href = url;
    a.download = fileName + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
