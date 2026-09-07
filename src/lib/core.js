// Структура бази даних
let database = {
        fileName: "",
        tables: [], // Кожна таблиця — об'єкт з name та schema
        reports: [], // 🆕 Масив для збереження звітів
        relations: [], // 🆕масив для збереження зв'язків
        forms: [] // ⬅️ масив для збереження форм

};
    
// SCHEMA_TYPES тепер береться з i18n.js (залежить від поточної мови)
// Для порівняння типів у логіці використовуються внутрішні англійські ключі
const SCHEMA_TYPE_KEYS = ["text", "integer", "real", "boolean", "date", "image", "list", "file"];
Object.defineProperty(window, "SCHEMA_TYPES", {
  get: () => (typeof t === "function" ? t("schemaTypes") : TRANSLATIONS["uk"].schemaTypes),
  configurable: true
});

/**
 * Перетворює назву типу поля (будь-якою мовою) у SQL-тип.
 * Підтримує збережені схеми з українськими назвами та нові з англійськими.
 */
function typeToSQL(typeStr) {
    const t = typeStr.toUpperCase().trim();
    if (t === "ЦІЛЕ ЧИСЛО"  || t === "INTEGER")    return "INTEGER";
    if (t === "ДРОБОВЕ ЧИСЛО" || t === "REAL NUMBER" || t === "REAL") return "REAL";
    if (t === "ТЕКСТ"       || t === "TEXT")        return "TEXT";
    if (t === "ТАК/НІ"     || t === "YES/NO"  || t === "BOOLEAN") return "BOOLEAN";
    if (t === "ДАТА"        || t === "DATE")        return "TEXT";
    if (t === "СПИСОК"      || t === "LIST")        return "TEXT";
    if (t === "ФАЙЛ"        || t === "FILE")        return "BLOB";
    if (t === "ЗОБРАЖЕННЯ"  || t === "IMAGE")       return "BLOB";
    return "TEXT"; // fallback
}

const IDB_NAME = "data_a_db";
const IDB_STORE = "databases";
let SQL = null;
let db = window.dba ? window.dba.db : null;
let dbToDelete = null;
let selectedReportName = null;
let currentEditTable = null;
let selectedCell = null;
let selectedQueryName = null;
let selectedTableNameForEdit = null;
let selectedTableNameForDelete = null;
let selectedDbFile = null;
let newDbFile = false; // змінна для фіксації створення нового файлу
let editingTableName = "unnamed";
let autoIncrement = null;
let isNewTable = true;
let isNewRecord = false;    
let sqlQuery = null;
let queryName = null;
let constructorMode = null;
let screenGridVisible = false; 
let screenCanvas = null; 
let isCreatingNewRecord = false;
let currentPreviewForm = null;
let isOwnSQL = false;
let queries = {
        definitions: [], // Stores query configurations
        results: [] // Stores query result tables (virtual tables)
    };
let imageEditContext = null;
// Обʼєкт для збереження тимчасової інформації про створювану таблицю
let table = {
    name: "Неназвана_таблиця", // назва таблиці за замовчуванням
    schema: [] // структура таблиці
};
// Список усіх таблиць бази, використовується для перевірок у редакторі
let tableList = [];
   
// ★ Головна ініціалізація: чекаємо на завантаження перекладів,
//   тільки тоді запускаємо UI та SQL-рушій.
(async () => {
    await window.i18nReady;
    closeAllModals();
    if (getLoadParam()) {
        await loadDtaFromUrl();
        return;
    }
    const autoLoad = localStorage.getItem(SETTINGS_KEYS.AUTO_LOAD_LAST_DB) === "true";
    if (autoLoad) {
        const last = localStorage.getItem("lastOpenedFile");
        if (last) {
            selectedDbFile = last;
            try { await loadSelectedDb(); }
            catch (e) { console.warn("auto-load failed", e); }
        }
    }
})();
      

/**
 * очищуємо базу даних, меню даних та панель швидкого доступу
 **/
function clearDB() {
    // очистити всі змінні
    database.fileName = "";
    database.tables =  [];
    database.reports = [];
    database.relations = [];
    database.forms =  [];            
    queries.definitions = [];
    queries.results = [];
            
	const dataMenu = document.getElementById("data-menu");
	if (dataMenu) {
		dataMenu.innerHTML = "";
	}
  
    updateQuickAccessPanel([], [], [], []);   
} 
 
/**
 * Нормалізує збережений тип поля до локалізованого рядка поточної мови.
 * Підтримує: старі українські назви, англійські ключі, вже локалізовані рядки.
 */
function normalizeFieldType(rawType) {
    if (!rawType) return SCHEMA_TYPES[0];
    const upper = rawType.trim().toUpperCase();

    // Таблиця відповідності: всі відомі варіанти → індекс у SCHEMA_TYPE_KEYS
    const map = {
        // text
        "TEXT": 0, "ТЕКСТ": 0,
        // integer
        "INTEGER": 1, "ЦІЛЕ ЧИСЛО": 1, "INT": 1,
        // real
        "REAL": 2, "ДРОБОВЕ ЧИСЛО": 2, "REAL NUMBER": 2,
        // boolean
        "BOOLEAN": 3, "ТАК/НІ": 3, "YES/NO": 3,
        // date
        "DATE": 4, "ДАТА": 4,
        // image
        "IMAGE": 5, "ЗОБРАЖЕННЯ": 5,
        // list
        "LIST": 6, "СПИСОК": 6,
        // file
        "FILE": 7, "ФАЙЛ": 7,
    };

    const idx = map[upper];
    if (idx !== undefined) return SCHEMA_TYPES[idx];

    // Якщо вже збігається з поточним локалізованим рядком — повертаємо як є
    if (SCHEMA_TYPES.includes(rawType)) return rawType;

    return SCHEMA_TYPES[0]; // fallback → перший тип ("Текст")
}

/**
 * Нормалізує збережений тип поля до внутрішнього англійського ключа (SCHEMA_TYPE_KEYS).
 * Підтримує: старі українські назви, англійські ключі, вже локалізовані рядки.
 */
function normalizeFieldTypeKey(rawType) {
    if (!rawType) return SCHEMA_TYPE_KEYS[0];
    const upper = rawType.trim().toUpperCase();

    const map = {
        "TEXT": 0, "ТЕКСТ": 0,
        "INTEGER": 1, "ЦІЛЕ ЧИСЛО": 1, "INT": 1,
        "REAL": 2, "ДРОБОВЕ ЧИСЛО": 2, "REAL NUMBER": 2,
        "BOOLEAN": 3, "ТАК/НІ": 3, "YES/NO": 3,
        "DATE": 4, "ДАТА": 4,
        "IMAGE": 5, "ЗОБРАЖЕННЯ": 5,
        "LIST": 6, "СПИСОК": 6,
        "FILE": 7, "ФАЙЛ": 7,
    };

    const idx = map[upper];
    if (idx !== undefined) return SCHEMA_TYPE_KEYS[idx];

    // Якщо вже є валідний ключ — повертаємо як є
    if (SCHEMA_TYPE_KEYS.includes(rawType.toLowerCase())) return rawType.toLowerCase();

    return SCHEMA_TYPE_KEYS[0]; // fallback → "text"
}


 function checkName(name) {
    
    name = name.trim();
    // перевірка довжини
    if (name.length < 2 || name.length > 32) {
        Message(t("nameLengthError"));
        return false;
    }
    /* перевірка на наявність пропусків
    if (/\s/.test(name)) {
        Message(t("nameSpaceError"));
        return false;
    }*/
    // перевірка першого символу — літера (латиниця або кирилиця)
    const firstCharPattern = /^[A-Za-zА-Яа-яЁёІіЇїЄєҐґ]$/;
    if (!firstCharPattern.test(name[0])) {
        Message(t("nameStartError"));
        return false;
    }
    // перевірка на допустимі символи
    const allowedPattern = /^[A-Za-zА-Яа-яЁёІіЇїЄєҐґ0-9\-_\' ]+$/;
    if (!allowedPattern.test(name)) {
        Message(t("nameInvalidChars"));
        return false;
    }
    // перевірка на заборонені символи (додаткова страховка)
    const forbiddenPattern = /[?"\/\\<>*\|:"]/;
    if (forbiddenPattern.test(name)) {
        Message(t("nameForbiddenChars"));
        return false;
    }

    return true;
}

/**
 * Перевірка назв полів у структурі таблиці
 **/
function checkFieldName() {
    const rows = document.querySelectorAll("#schemaBody tr");
    let allValid = true;

    rows.forEach(row => {
        const nameCell = row.cells[1];
        const fieldName = nameCell.innerText.trim();

        // знімаємо попереднє підсвічування
        nameCell.style.backgroundColor = "";

        if (fieldName) {
            if (!checkName(fieldName)) {
                // погане ім'я → підсвітити комірку
                nameCell.style.backgroundColor = "#ffcccc"; // рожево-червоний
                allValid = false;
            }
        }
    });

    return allValid;
}

//
/**
 * Каскадне оновлення зовнішніх ключів у дочірніх таблицях
 * після зміни первинного ключа у батьківській таблиці.
 *
 * @param {string} parentTableName  — назва батьківської таблиці
 * @param {string} pkCol            — назва PK-поля, що змінилося
 * @param {*}      oldVal           — старе значення PK
 * @param {*}      newVal           — нове значення PK
 */
async function cascadeUpdateForeignKeys(parentTableName, pkCol, oldVal, newVal) {
    if (oldVal === newVal || oldVal === null || oldVal === undefined) return;
    if (String(oldVal) === String(newVal)) return;

    for (const childTable of database.tables) {
        if (childTable.name === parentTableName) return;

        for (const [fieldIdx, field] of childTable.schema.entries()) {
            if (
                field.foreignKey &&
                field.refTable === parentTableName &&
                field.refField === pkCol
            ) {
                // Оновити в SQLite
                try {
                    await dba.db.run(
                        `UPDATE "${childTable.name}" SET "${field.title}" = ? WHERE "${field.title}" = ?;`,
                        [newVal, oldVal]
                    );
                } catch (e) {
                    console.warn(`cascadeUpdateFK: помилка у ${childTable.name}.${field.title}:`, e);
                }

                // Оновити в пам'яті (database.tables[...].data)
                if (childTable.data) {
                    childTable.data.forEach(row => {
                        if (String(row[fieldIdx]) === String(oldVal)) {
                            row[fieldIdx] = newVal;
                        }
                    });
                }
            }
        }
    }
}

/**
 * Функція saveTableData()
 * ------------------------
 * Призначення: Зберігає всі дані з currentEditTable.data у базу даних,
 * включно з типами: select, input, custom-date-picker, image.
 * Данні беруться безпосередньо з rowData, а не з DOM.
 */
async function saveTableData() {
    if (!currentEditTable || !currentEditTable.name || currentEditTable.name.startsWith('*')) {
        Message(t("tableNotEditable"));
        return;
    }
    const rowsData = currentEditTable.data;
    const schema = currentEditTable.schema;
    const pkCols = schema.filter(col => col.primaryKey).map(col => col.title);

    // Перевірка унікальності PK серед редагованих рядків
    if (pkCols.length > 0) {
        const seenPKs = new Set();
        for (let rowData of rowsData) {
            const pkValueCombo = pkCols.map(pk => {
                const idx = schema.findIndex(c => c.title === pk);
                return String(rowData[idx] ?? "");
            }).join("||");
            if (pkValueCombo.trim() !== "") {
                if (seenPKs.has(pkValueCombo)) {
                    Message(t("pkDuplicateError", pkValueCombo));
                    return;
                }
                seenPKs.add(pkValueCombo);
            }
        }
    }

    for (const rowData of rowsData) {
        let allEmpty = rowData.every((val, idx) => {
            const colType = (schema[idx]?.type || "").toLowerCase();
            return val === null || val === "" || (colType === "boolean" && val === 0);
        });
        if (allEmpty) return;

        const valuesObj = {};
        schema.forEach((col, idx) => {
            let val = rowData[idx];
            const typeStr = typeToSQL(col.type || " ");
            if (typeStr === "TEXT" && (col.type || "").toUpperCase() !== "BLOB") val = String(val ?? "");
            if (typeStr === "INTEGER") val = val === null ? null : Number(val);
            if (typeStr === "REAL") val = val === null ? null : Number(val);
            if (typeStr === "BOOLEAN") val = val ? 1 : 0;
            valuesObj[col.title] = val;
        });

        const colNames = Object.keys(valuesObj);
        const colVals = Object.values(valuesObj);
        const placeholders = colNames.map(() => "?").join(", ");
        const quotedCols = colNames.map(k => `"${k}"`).join(", ");

        if (pkCols.length > 0) {
            const pkIdxs = pkCols.map(pk => colNames.indexOf(pk));
            const whereClause = pkCols.map(pk => `"${pk}" = ?`).join(" AND ");

            // 🆕 Безпечне отримання оригінальних PK
            let originalPkVals;
            if (rowData._pkSnapshot) {
                originalPkVals = pkCols.map(pk => rowData._pkSnapshot[pk]);
            } else {
                // Якщо знімок втрачено, припускаємо, що PK не змінювався
                originalPkVals = pkIdxs.map(i => colVals[i]);
            }

            let exists = false;
            try {
                const res = await dba.db.exec(
                    `SELECT COUNT(*) FROM "${currentEditTable.name}" WHERE ${whereClause};`,
                    originalPkVals
                );
                exists = res.length && res[0].values[0][0] > 0;
            } catch (e) {
                console.warn("Помилка перевірки існування PK:", e);
            }

            if (exists) {
                const setClause = colNames.map(k => `"${k}" = ?`).join(", ");
                await dba.db.run(
                    `UPDATE "${currentEditTable.name}" SET ${setClause} WHERE ${whereClause};`,
                    [...colVals, ...originalPkVals]
                );
            
                // 🆕 Каскадне оновлення FK у дочірніх таблицях при зміні PK
                for (const [i, pk] of pkCols.entries()) {
                    const oldVal = originalPkVals[i];
                    const newVal = colVals[colNames.indexOf(pk)];
                    if (String(oldVal) !== String(newVal)) {
                        cascadeUpdateForeignKeys(currentEditTable.name, pk, oldVal, newVal);
                    }
                }
            } else {
                // Додаткова перевірка: чи не існує вже запис з НОВИМ PK (захист від дублів)
                try {
                    const newPkCheck = await dba.db.exec(
                        `SELECT COUNT(*) FROM "${currentEditTable.name}" WHERE ${whereClause};`,
                        pkIdxs.map(i => colVals[i])
                    );
                    if (newPkCheck.length && newPkCheck[0].values[0][0] > 0) {
                        Message(t("pkDuplicateError", pkCols.join(", ")));
                        return;
                    }
                } catch (e) {}

                await dba.db.run(
                    `INSERT INTO "${currentEditTable.name}" (${quotedCols}) VALUES (${placeholders});`,
                    colVals
                );
                // 🆕 Оновлюємо знімок після успішного INSERT, щоб наступні збереження не дублювали
                rowData._pkSnapshot = {};
                pkCols.forEach(pk => {
                    const idx = schema.findIndex(c => c.title === pk);
                    rowData._pkSnapshot[pk] = colVals[colNames.indexOf(pk)];
                });
            }
        } else {
            await dba.db.run(`INSERT OR REPLACE INTO "${currentEditTable.name}" (${quotedCols}) VALUES (${placeholders});`, colVals);
        }
    }

    try {
        const res = await dba.db.exec(`SELECT * FROM "${currentEditTable.name}"`);
        currentEditTable.data = res.length ? res[0].values : [];
    } catch (e) {
        console.warn("Не вдалося оновити дані після збереження:", e);
        currentEditTable.data = [];
    }
    saveDatabase();
    Message(t("dataSaved"));
    closeEditModal();
}



/**
* Перевірка нa новий файл
**/
async function saveNewDb() {
    console.log("Save new file")
    newDbFile = true; 
    const name = document.getElementById("dbName").value.trim() || "my_database"; // зчитування назви БД або використання за замовчуванням
    if (!checkName(name)) return; // якщо "погане" ім'я
    console.log("Save new file=",name + ".db-data")
    console.log("newDbFile0 =",newDbFile)
    // Якщо створюємо новий файл і такий вже існує
    if (localStorage.getItem(name + ".tables-data")) {
        console.log("Overwrite!!!");
        newDbFile = false; 
        const msg = document.getElementById("overwtiteConfirmText");
        msg.innerHTML = t("fileExistsConfirm", name);
        console.log("newDbFile1 =",newDbFile)
        showOverwriteConfirm(name);
    };
    console.log("newDbFile2 =",newDbFile) 
    if (newDbFile) await saveDb();
} 
/**
 * Вікно підтвердження при перезапису файлу бази даних
 **/ 
function showOverwriteConfirm(name) {
     document.getElementById("overwriteModal").style.display = "flex"; // показати вікно вибору
}
async function doOverwriteDb() {
    document.getElementById("overwriteModal").style.display = "none"; 
    newDbFile = true;
    await saveDb();
}

function doNewNameDb() {
    document.getElementById("overwriteModal").style.display = "none"; // ховаємо вікно вибору     
    newDbFile = false; 
}

function doCloseOverwriteConfirm() {
    document.getElementById("overwriteModal").style.display = "none"; // ховаємо вікно вибору     
    newDbFile = false;
    closeDbModal()
}

/** 
* Функція createDbFile()
* Призначення: Відкриває модальне вікно для створення нового файлу бази даних.
* Параметри: відсутні.
* Результат: Показ модального вікна з полем для введення назви бази.
**/
function createDbFile() {
    newDbFile = true;
    editingTableName = null;
    // Очистити всі змінні
    clearDB();           

    document.getElementById("dbName").value = "my_database"; // встановлюємо значення за замовчуванням
    document.getElementById("dbModal").style.display = "flex"; // відкриваємо модальне вікно
}
/**
 * Генерується унікальний ідентифікатор бази
 **/
function generateDbId() {
    const now = Date.now();
    return now & 0x7FFFFFFF; // залишає лише нижчі 31 біти
}
/** 
* Функція saveDb()
* Призначення: Створює новий файл бази даних у памʼяті та зберігає його.
* Параметри: відсутні.
* Результат: Створення SQLite бази, очищення попередніх даних, збереження у localStorage.
**/
async function saveDb() {
    const name = document.getElementById("dbName").value.trim() || "my_database";
    
    if (newDbFile) { // ❗ Скидаємо структуру тільки при створенні нової БД
        clearDB();
        await dba.openDatabaseFile(name);

        // Генеруємо 32-бітовий ідентифікатор
        const dbId = generateDbId();

        // Зберігаємо в PRAGMA user_version  
        console.log("dbId=",dbId)
        console.log("dbId type of:", dbId, typeof dbId);
        // ✅ Записуємо user_version — після змін, щоб гарантовано зберіглось
    
        await dba.db.run(`PRAGMA user_version = ${dbId};`);


        // Зберігаємо ідентифікатор 
        database.id = dbId;
        console.log("Файл бази даних створено:", database);
        console.log("Ідентифікатор БД (32-bit):", dbId, `(${toHex4Part(dbId)})`);

    }
    database.fileName = name;
    localStorage.setItem('lastOpenedFile', name);
    saveDatabase();



    closeDbModal();
    updateMainTitle();
}

/** 
* Функція saveDbAndCreateTable()
* Призначення: Створює базу даних та одразу відкриває інтерфейс для створення таблиці.
* Параметри: відсутні.
* Результат: Створення бази та перехід до створення структури таблиці.
**/
async function saveDbAndCreateTable() {
    console.log("saveDbAndCreateTable")
    const name = document.getElementById("dbName").value.trim() || "my_database"; // зчитування назви БД або використання за замовчуванням
    if (!checkName(name)) return; // якщо "погане" ім'я   
    await saveNewDb(); // зберігаємо базу
    if (newDbFile) {
        closeDbModal(); // закриваємо модальне вікно
        createTable(); // відкриваємо створення таблиці
    }
}
/**
 * 
 * 
 */
function isDBExist() {
	let isDB = database.fileName !== "" && db !== null;
	if(!isDB) {
		 Message(t("dbNotExist"))		 
    }
	return isDB
	}

/** 
 * Функція createTable()
 * Призначення: Відкриває модальне вікно для створення нової таблиці та ініціалізує її структуру.
 */
function createTable() {
	if(!isDBExist()) return
    // Переконаємось, що стара таблиця не перезаписується
    if (!database.tables) database.tables = [];
    table.schema = []; // очищення схеми
    autoIncrement = null;
    isNewTable = true;
    editingTableName = null;

    // Очищуємо HTML таблиці
    const schemaBody = document.getElementById("schemaBody");
    if (!schemaBody) {
        console.error("Відсутній елемент schemaBody!");
        return;
    }
    schemaBody.innerHTML = "";

    // Переконаємось, що заголовки FK існують
    const refTableHeader = document.getElementById("refTableHeader");
    const refFieldHeader = document.getElementById("refFieldHeader");
    const refSubstHeader = document.getElementById("refSubstHeader");
    if (!refTableHeader) {
        console.warn("Відсутній refTableHeader, створюємо його динамічно");
        const th = document.createElement("th");
        th.id = "refTableHeader";
        th.innerText = t("schemaHeaderFieldName") + " 📌"; // fallback
        schemaBody.closest("table").querySelector("thead tr").appendChild(th);
    }
    if (!refFieldHeader) {
        console.warn("Відсутній refFieldHeader, створюємо його динамічно");
        const th = document.createElement("th");
        th.id = "refFieldHeader";
        th.innerText = t("schemaHeaderDesc") + " 📌"; // fallback
        schemaBody.closest("table").querySelector("thead tr").appendChild(th);
    }
        if (!refSubstHeader) {
        console.warn("Відсутній refSubstHeader, створюємо його динамічно");
        const th = document.createElement("th");
        th.id = "refSubstHeader";
        th.innerText = t("schemaHeaderDesc") + " 📌"; // fallback
        schemaBody.closest("table").querySelector("thead tr").appendChild(th);
    }

    // Встановлюємо назву таблиці за замовчуванням
    document.getElementById("tableName").value = t("defaultTableName");

    // Оновлюємо список існуючих таблиць для перевірки FK
    tableList = database.tables.map(t => t.name);

    // Додаємо перший рядок для створення полів
    addSchemaRow();

    // Встановлюємо заголовок модального вікна
    document.getElementById("makeTable").innerText = t("tableCreateTitle");

    // Показуємо модальне вікно
    document.getElementById("modal").style.display = "flex";

    // Встановлюємо видимість заголовків FK
    toggleForeignKeyHeaders();
}
 


/** 
* Функція deleteSchemaRow(button)
* Призначення: Видаляє один рядок зі структури створюваної таблиці.
* Параметри: button — кнопка "❌", натиснута користувачем.
* Результат: Видалення відповідного рядка з DOM.
*/
function deleteSchemaRow(button) {
    const row = button.closest("tr"); // знаходження батьківського рядка
    if (row) row.remove(); // видалення з DOM
    toggleForeignKeyHeaders();
}

/**
Функція toggleForeignKeyHeaders()
Призначення: Показує або приховує заголовки "Таблиця 📌" та "Поле 📌"
             залежно від того, чи є хоча б один увімкнений чекбокс зовнішнього ключа.
*/
function toggleForeignKeyHeaders() {
    const rows = document.querySelectorAll("#schemaBody tr");
    const anyChecked = Array.from(rows).some(row => {
        const checkbox = row.querySelector('[data-role="fk"] input[type="checkbox"]');
        return checkbox?.checked;
    });

    const refTableHeader = document.getElementById("refTableHeader");
    const refFieldHeader = document.getElementById("refFieldHeader");
    const refSubstHeader = document.getElementById("refSubstHeader");
    
    if (anyChecked) {
        refTableHeader.style.display = "";
        refFieldHeader.style.display = "";
        refSubstHeader.style.display = "";
    } else {
        refTableHeader.style.display = "none";
        refFieldHeader.style.display = "none";
        refSubstHeader.style.display = "none";
    }
}

/** 
* Функція addSchemaRow()
* Призначення: Додає новий рядок до структури таблиці, що створюється.
* Параметри: відсутні.
* Результат: Вставка HTML-елементів до тіла таблиці зі всіма полями для нового стовпця.
**/
function addSchemaRow() {
    const tbody = document.getElementById("schemaBody");
    const row = document.createElement("tr");

    const tableOptions = tableList.map(t => `<option value="${t}">${t}</option>`).join("");

    const anyChecked = Array.from(document.querySelectorAll('#schemaBody tr [data-role="fk"] input[type="checkbox"]'))
        .some(cb => cb.checked);

    row.innerHTML = `
        <td data-role="pk" style="text-align:center;">
            <input type="checkbox" onchange="handlePrimaryKey(this)">
        </td>
        <td data-role="title" contenteditable="true"></td>
        <td data-role="type">
			<select onchange="handleTypeChange(this)">
				${SCHEMA_TYPE_KEYS.map(key => 
        `		<option value="${key}">${t(key)}</option>`
				).join("")}
			</select>
        </td>
        <td data-role="fk" style="text-align:center;">
            <input type="checkbox" onchange="handleForeignKey(this)">
        </td>
        ${anyChecked ? `
            <td data-role="ref-table">
                <select onchange="updateFieldOptions(this)">
                    <option value="">${t("fkTablePlaceholder")}</option>
                    ${tableOptions}
                </select>
            </td>
            <td data-role="ref-field">
                <select><option value="">${t("fkFieldPlaceholder")}</option></select>
            </td>
            <td data-role="ref-subst">
                <input type="checkbox">
            </td>
        ` : ''}
        <td data-role="comment" contenteditable="true"></td>
        <td style="text-align:center;">
            <button onclick="deleteSchemaRow(this)">❌</button>
        </td>
    `;

    tbody.appendChild(row);
    toggleForeignKeyHeaders(); // гарантуємо правильний стан заголовків
}

function handleTypeChange(select) {
    const row = select.closest("tr");
    const commentCell = Array.from(row.querySelectorAll('[contenteditable]')).at(-1);
    if (!commentCell) return;
    if (select.value === "Список" || select.value === "List") {
        commentCell.dataset.hint = "true";
        if (!commentCell.innerText.trim()) commentCell.setAttribute("placeholder", "Варіант1, Варіант2, ...");
    } else {
        delete commentCell.dataset.hint;
        commentCell.removeAttribute("placeholder");
    }
}



/**
* Функція getFieldsForTable(tableName)
* Призначення: Повертає список назв полів для заданої таблиці.
* Параметри:
* - tableName (string): назва таблиці.
* Результат: Масив назв полів або порожній масив, якщо таблиця не знайдена.
*/
function getFieldsForTable(tableName) {
    const table = database.tables.find(t => t.name === tableName);
    if (!table) return [];
    return table.schema.map(field => field.title);
}

//
function getColumnName(checkbox) {
    const cell = checkbox.closest("td");       // комірка з чекбоксом
    const row = cell.closest("tr");            // рядок
    const cells = Array.from(row.cells);
    const index = cells.indexOf(cell);

    // наступна комірка після чекбокса
    if (index >= 0 && index + 1 < cells.length) {
        return cells[index + 1].innerText.trim();
    }
    return null;
}
/**
* Функція handlePrimaryKey(checkbox)
* Призначення: Обробляє встановлення або зняття первинного ключа для поля таблиці.
* Параметри:
* - checkbox (HTMLInputElement): прапорець первинного ключа.
* Результат: Оновлює тип поля та коментар до нього.
**/
function handlePrimaryKey(checkbox) {
    const row = checkbox.closest("tr");
    const commentCell = row.querySelector('[data-role="comment"]');
    const typeSelect = row.querySelector('[data-role="type"] select');

    if (checkbox.checked) {
        if (!commentCell.innerText.includes(t("primaryKeyLabel"))) {
            if(!getColumnName(checkbox)) { 
                Message(t("fieldNoName"));
                checkbox.checked = false;
                return
            }
            commentCell.innerText = t("primaryKeyLabel");
        }

        // Показуємо модальне вікно
        const modal = document.getElementById("pkModal");
        modal.style.display = "block";

        // Кнопка "Так"
        const yesBtn = document.getElementById("pkYes");
        yesBtn.onclick = () => {
            if (typeSelect) {
                // Шукаємо індекс опції, що відповідає типу "integer" (індекс 1),
                // замість встановлення .value (може не збігтись через пробіли/регістр)
                const integerLabel = t("schemaTypes")[1];
                const optionIdx = Array.from(typeSelect.options).findIndex(
                    o => o.text.trim() === integerLabel.trim()
                );
                typeSelect.selectedIndex = optionIdx >= 0 ? optionIdx : 1;
                autoIncrement = getColumnName(checkbox);
                console.log("PK field autoIncrement=", autoIncrement);
                // встановлення автоінкременту у схемі
                const rowIdx = checkbox.closest("tr").rowIndex - 1; // -1 бо є заголовок
                if (table.schema[rowIdx]) table.schema[rowIdx].autoInc = true;
                // фарбування комірки
                checkbox.closest("td").style.backgroundColor = "#0f56d9";                
            }
                modal.style.display = "none";
        };

        // Кнопка "Ні"
        const noBtn = document.getElementById("pkNo");
        noBtn.onclick = () => {
            modal.style.display = "none";
            // повертаємося у функцію
            // скидання автоінкременту
            const rowIdx = checkbox.closest("tr").rowIndex - 1;
            if (table.schema[rowIdx]) table.schema[rowIdx].autoInc = false;
            checkbox.closest("td").style.backgroundColor = "";

        };

    } else {
        if (commentCell.innerText === t("primaryKeyLabel")) {
            commentCell.innerText = "";
            const rowIdx = checkbox.closest("tr").rowIndex - 1;
            if (table.schema[rowIdx]) table.schema[rowIdx].autoInc = false;
            checkbox.closest("td").style.backgroundColor = "";
        }
    }
}

/**
* Функція handleForeignKey(checkbox)
* Призначення: Обробляє встановлення або зняття зовнішнього ключа для поля.
* Параметри:
*  - checkbox (HTMLInputElement): прапорець зовнішнього ключа.
* Результат: Увімкнення/вимкнення селекторів таблиці/поля для FK.
**/
function handleForeignKey(checkbox) {
    const tbody = document.getElementById("schemaBody");
    if (!tbody) return;

    const rows = Array.from(tbody.querySelectorAll("tr"));

    // Перевіряємо, чи заголовки FK вже видимі (до змін DOM)
    const refTableHeader = document.getElementById("refTableHeader");
    const headersVisible = !!refTableHeader && window.getComputedStyle(refTableHeader).display !== "none";

    // Чи є хоча б один увімкнений checkbox у всіх рядках
    const anyChecked = rows.some(row => {
        const cb = row.querySelector('[data-role="fk"] input[type="checkbox"]');
        return !!cb?.checked;
    });

    rows.forEach(row => {
        const hasForeignKeyColumns = !!row.querySelector('[data-role="ref-table"]');

        if (anyChecked && !hasForeignKeyColumns) {
            // Додаємо стовпчики FK перед коментарем
            const commentCell = row.querySelector('[data-role="comment"]');

            const tableTd = document.createElement("td");
            const fieldTd = document.createElement("td");
            const substTd = document.createElement("td");

            const tableOptions = tableList
                .map(t => `<option value="${t}">${t}</option>`)
                .join("");

            tableTd.dataset.role = "ref-table";
            tableTd.innerHTML = `
                <select onchange="updateFieldOptions(this)">
                    <option value="">${t("fkTablePlaceholder")}</option>
                    ${tableOptions}
                </select>`;
            fieldTd.dataset.role = "ref-field";
            fieldTd.innerHTML = `<select><option value="">${t("fkFieldPlaceholder")}</option></select>`;
            substTd.dataset.role = "ref-subst";
            substTd.innerHTML = `<input type="checkbox">`;

            row.insertBefore(tableTd, commentCell);
            row.insertBefore(fieldTd, commentCell);
            row.insertBefore(substTd, commentCell);

        } else if (!anyChecked && hasForeignKeyColumns) {
            // Видаляємо три комірки FK за роллю (без зсуву індексів)
            row.querySelector('[data-role="ref-subst"]')?.remove();
            row.querySelector('[data-role="ref-field"]')?.remove();
            row.querySelector('[data-role="ref-table"]')?.remove();
        }
    });

    // якщо заголовки вже були видимі і користувач увімкнув чекбокс у конкретному рядку,
    // то у цьому рядку знімаємо disabled з select-ів (таблиця + поле)
    const currentRow = checkbox.closest("tr");
    if (headersVisible && checkbox.checked && currentRow) {
        // шукаємо перший і другий select в цьому рядку — вони мають бути tableSelect і fieldSelect
        const selects = currentRow.querySelectorAll("select");
        if (selects.length >= 1) {
            selects.forEach(sel => {
                sel.disabled = false;
                sel.removeAttribute("disabled");
            });
        }
    }
    
    console.log("handleForeignKey: toggled row =", checkbox.closest("tr"), "headersVisible=", headersVisible, "anyChecked=", anyChecked);

    toggleForeignKeyHeaders();
}


/**
* Функція updateFieldOptions(tableSelect)
* Призначення: Оновлює список доступних полів при виборі таблиці у зовнішньому ключі.
* Параметри:
* - tableSelect (HTMLSelectElement): селектор таблиці.
* Результат: Оновлення списку полів у відповідному селекторі.
*/
function updateFieldOptions(tableSelect) {
    const row = tableSelect.closest("tr");
    const fieldSelect = row.querySelector('[data-role="ref-field"] select');
    const selectedTable = tableSelect.value;
    console.log("selectedTable=",selectedTable)
    fieldSelect.innerHTML = `<option value="">${t("loadingPlaceholder")}</option>`;

    const fields = getFieldsForTable(selectedTable);
    fieldSelect.innerHTML = fields.map(f => `<option value="${f}">${f}</option>`).join("");
}

/**
* Функція saveSchema()
* Призначення: Зберігає структуру таблиці, створює відповідну таблицю в SQLite, вставляє дані, оновлює UI та базу.
* Параметри: відсутні.
* Результат: Створена або оновлена таблиця з новою схемою в БД.
**/
async function saveSchema() {
    const newTableName = document.getElementById("tableName").value.trim() || "Неназвана_таблиця";
    if (!checkName(newTableName)) return;
    
    // Перевірка назв полів
    if (!checkFieldName()) {
        Message(t("fixFieldNames"));
        return;
    }
    
    
    const rows = document.querySelectorAll("#schemaBody tr");

    const schema = [];
    const fieldNames = new Set();
    let hasDuplicate = false;

    for (let row of rows) {
        const isPrimaryKey = row.querySelector('[data-role="pk"] input').checked;
        let title = row.querySelector('[data-role="title"]').innerText.trim();
        const type = row.querySelector('[data-role="type"] select').value;
        const commentCell = row.querySelector('[data-role="comment"]');
        const commentRaw = commentCell ? commentCell.innerText.trim() : "";
        const isListType = type === "list";
        const options = [];
        const comment = commentRaw;

        if (!title) continue;

        const lowerTitle = title.toLowerCase();
        if (fieldNames.has(lowerTitle)) {
            hasDuplicate = true;
            break;
        }

        fieldNames.add(lowerTitle);

        const fkCheckbox = row.querySelector('[data-role="fk"] input[type=checkbox]');
        const isForeignKey = fkCheckbox ? fkCheckbox.checked : false;

        const refTableSelect = row.querySelector('[data-role="ref-table"] select');
        const refFieldSelect = row.querySelector('[data-role="ref-field"] select');
        const refSubstCheck  = row.querySelector('[data-role="ref-subst"] input');
        const refTable = refTableSelect?.value || null;
        const refField = refFieldSelect?.value || null;
        const refSubst = refSubstCheck?.checked ?? false;

        schema.push({
            primaryKey: isPrimaryKey,
            autoInc: typeToSQL(type) === 'INTEGER' && isPrimaryKey,
            title: title,
            type: type,
            options: options,
            comment: comment,
            foreignKey: isForeignKey,
            refTable: isForeignKey ? refTable : null,
            refField: isForeignKey ? refField : null,
            subst: refSubst
        });
    }

    if (hasDuplicate) {
        Message(t("duplicateFieldNames"));
        return;
    }

    if (schema.length === 0) {
        Message(t("emptySchema"));
        return;
    }

    if (schema.filter(f => f.primaryKey).length === 0) {
        Message(t("noPrimaryKey"));
        return;
    }

    
    let oldTableName = null;

    if (newDbFile) editingTableName = newTableName;
    console.log("isNewTable =",isNewTable )
    if (!isNewTable && editingTableName) {
        if (typeof editingTableName === "string") {
            oldTableName = editingTableName.trim();
        } else if (typeof editingTableName.name === "string") {
            oldTableName = editingTableName.name.trim();
        }
    }

    if (!isNewTable && !oldTableName) {
        isNewTable = true;
    }

    const nameChanged = !isNewTable && oldTableName !== newTableName;

    let oldData = [];
    let oldSchema = [];
    if (!isNewTable) {
        // Зберігаємо стару схему ДО видалення таблиці — потрібна для зіставлення перейменованих полів
        const oldTableEntry = database.tables.find(tbl => tbl.name === oldTableName);
        oldSchema = oldTableEntry ? oldTableEntry.schema : [];

        try {
            const oldRes = await dba.db.exec(`SELECT * FROM "${oldTableName}"`);
            const oldRows = oldRes.length ? oldRes[0].values : [];
            oldData = oldRows.map(row => Object.fromEntries(
                oldSchema.map((field, index) => [field.title, row[index]])
            ));
        } catch (e) {
            console.warn("Не вдалося зчитати старі дані таблиці:", e);
        }

        try {
            await dba.db.run(`DROP TABLE IF EXISTS "${oldTableName}"`);
        } catch (e) {
            console.error("Не вдалося видалити стару таблицю:", e);
        }
    }

    await dba.db.run("PRAGMA foreign_keys = ON;");

    const fieldsSQL = schema.map(field => {
        const type = typeToSQL(field.type);
        return `"${field.title}" ${type}`;
    });

    // Додаємо складений або одинарний PRIMARY KEY
    const pkFields = schema.filter(f => f.primaryKey).map(f => `"${f.title}"`);
    if (pkFields.length > 0) {
        fieldsSQL.push(`PRIMARY KEY (${pkFields.join(", ")})`);
    }

	const foreignKeys = schema
		.filter(f => f.foreignKey && f.refTable && f.refField)
		.map(f => `FOREIGN KEY ("${f.title}") REFERENCES "${f.refTable}"("${f.refField}") ON UPDATE CASCADE`);

    const fullFieldsSQL = [...fieldsSQL, ...foreignKeys].join(", ");
    const createSQL = `CREATE TABLE "${newTableName}" (${fullFieldsSQL});`;

    try {
        await dba.db.run(createSQL);
    } catch (e) {
        console.warn("Не вдалося створити таблицю:", e, createSQL);
        
        Message(t("tableCreateError", e));
        return;
    }

    for (const record of oldData) {
        const insertFields = [];
        const insertValues = [];
        const placeholders = [];

        schema.forEach((newField, idx) => {
            // Якщо поле не перейменовувалось — шукаємо за новою назвою
            if (newField.title in record) {
                insertFields.push(`"${newField.title}"`);
                placeholders.push('?');
                insertValues.push(record[newField.title] ?? null);
            // Якщо перейменовано — беремо значення з тієї самої позиції старої схеми
            } else if (oldSchema[idx] && oldSchema[idx].title in record) {
                insertFields.push(`"${newField.title}"`);
                placeholders.push('?');
                insertValues.push(record[oldSchema[idx].title] ?? null);
            }
        });

        if (insertFields.length > 0) {
            const insertSQL = `INSERT INTO "${newTableName}" (${insertFields.join(", ")}) VALUES (${placeholders.join(", ")});`;
            try {
                await dba.db.run(insertSQL, insertValues);
            } catch (e) {
                console.warn("Не вдалося вставити запис:", e, insertSQL);
            }
        }
    }

    const table = {
        name: newTableName,
        schema: schema,
        data: []
    };

    try {
        const result = await dba.db.exec(`SELECT * FROM "${newTableName}"`);
        table.data = result.length ? result[0].values : [];
    } catch (e) {
        console.warn("Не вдалося зчитати дані для таблиці:", e);
    }

    if (!isNewTable) {
        const index = database.tables.findIndex(t => t.name === oldTableName);
        if (index !== -1) {
            database.tables.splice(index, 1);
        }
    }
    database.tables.push(table);

    if (!isNewTable && nameChanged) {
        updateRelationsOnRename(oldTableName, newTableName);
        updateQueriesOnTableRename(oldTableName, newTableName);
        updateReportsOnTableRename(oldTableName, newTableName);
        updateFormsOnTableRename(oldTableName, newTableName);
        removeTableFromMenu(oldTableName);
    }

    addTableToMenu(newTableName);
    saveDatabase();
    Message(t("tableSaved"));
    closeModal();
    newDbFile = false;
    isNewTable = false;
}


// Допоміжна функція: чи змінилася структура
function isStructureChanged(oldSchema, newSchema) {
    if (!oldSchema || oldSchema.length !== newSchema.length) return true;

    for (let i = 0; i < oldSchema.length; i++) {
        const oldField = oldSchema[i];
        const newField = newSchema[i];
        if (
            oldField.title !== newField.title ||
            oldField.type !== newField.type ||
            oldField.primaryKey !== newField.primaryKey ||
            oldField.foreignKey !== newField.foreignKey ||
            oldField.refTable !== newField.refTable ||
            oldField.refField !== newField.refField
        ) {
            return true;
        }
    }
    return false;    
}

/**
 * Функція updateFormsOnTableRename
 * Призначення: Оновлює форми в database.forms після перейменування таблиці.
 * Оновлює:
 *   - element.tableName: якщо дорівнює oldName
 *   - element.text: якщо містить "oldName.fieldName" (наприклад, "Contacts.phone")
 * Параметри:
 *   - oldName (string): стара назва таблиці
 *   - newName (string): нова назва таблиці
 */
function updateFormsOnTableRename(oldName, newName) {
    if (!oldName || !newName || oldName === newName) return;

    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const oldEscaped = escapeRegex(oldName);
    const fieldRefPattern = new RegExp(`"${oldEscaped}\\.([a-zA-Z0-9_]+)"`, 'g');

    database.forms.forEach(form => {
        if (Array.isArray(form.elements)) {
            form.elements.forEach(element => {
                // 1. Оновлюємо tableName
                if (element.tableName === oldName) {
                    element.tableName = newName;
                }

                // 2. Оновлюємо text, якщо це посилання на поле: "TableName.FieldName"
                if (typeof element.text === 'string') {
                    const isFieldRef = new RegExp(`^"${oldEscaped}\\.[^"]+"$`).test(element.text);
                    if (isFieldRef) {
                        element.text = element.text.replace(fieldRefPattern, `"${newName}.$1"`);
                    } else if (element.text === oldName) {
                        // Якщо просто назва таблиці
                        element.text = element.text.replace(oldName, newName);
                    }
                }
            });
        }
    });

    console.log(`Оновлено форми: "${oldName}" → "${newName}" (tableName та text)`);
}

/**
 * Функція updateReportsOnTableRename
 * Призначення: Оновлює звіти в database.reports після перейменування таблиці.
 * Оновлює:
 *   - element.tableName: якщо співпадає з oldName
 *   - element.text: якщо містить "oldName.fieldName" → замінює на "newName.fieldName"
 * Параметри:
 *   - oldName (string): стара назва таблиці
 *   - newName (string): нова назва таблиці
 */
function updateReportsOnTableRename(oldName, newName) {
    if (!oldName || !newName || oldName === newName) return;

    // Екрануємо назви для регулярних виразів
    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const oldEscaped = escapeRegex(oldName);

    // Регулярний вираз для пошуку "tableName.fieldName" у text
    const fieldRefPattern = new RegExp(`"${oldEscaped}\\.([a-zA-Z0-9_]+)"`, 'g');

    database.reports.forEach(report => {
        if (Array.isArray(report.elements)) {
            report.elements.forEach(element => {
                // 1. Оновлюємо tableName
                if (element.tableName === oldName) {
                    element.tableName = newName;
                }

                // 2. Оновлюємо text, якщо містить "OldTable.field"
                if (typeof element.text === 'string') {
                    // Спочатку перевіряємо, чи є посилання на поле: "TableName.FieldName"
                    const hasFieldRef = new RegExp(`^"${oldEscaped}\\.[^"]+"$`).test(element.text);
                    if (hasFieldRef) {
                        // Замінюємо всі входження "OldTable.field" → "NewTable.field"
                        element.text = element.text.replace(
                            fieldRefPattern,
                            `"${newName}.$1"`
                        );
                    } else if (element.text === oldName) {
                        // Якщо просто назва таблиці (наприклад, для заголовків)
                        element.text = element.text.replace(oldName, newName);
                    }
                }
            });
        }
    });

    console.log(`Оновлено звіти: "${oldName}" → "${newName}" (tableName та text)`);
}

/**
 * Функція updateQueriesOnTableRename
 * Призначення: Оновлює SQL та конфігурацію запитів після перейменування таблиці.
 * Оновлює:
 *   - sql: текст запиту (наприклад, "OldTable" → "NewTable")
 *   - config.tableName: у кожному полі
 *   - joins.fromTable, joins.toTable: якщо використовуються
 * Параметри:
 *   - oldName (string): стара назва таблиці
 *   - newName (string): нова назва таблиці
 */
function updateQueriesOnTableRename(oldName, newName) {
    if (!oldName || !newName || oldName === newName) return;

    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const oldEscaped = escapeRegex(oldName);
    const pattern = new RegExp(`"(${oldEscaped})"`, 'g');

    queries.definitions.forEach(query => {
        // 1. Оновлюємо SQL-рядок
        if (typeof query.sql === 'string') {
            query.sql = query.sql.replace(pattern, `"${newName}"`);
        }

        // 2. Оновлюємо config.tableName
        if (Array.isArray(query.config)) {
            query.config.forEach(field => {
                if (field.tableName === oldName) {
                    field.tableName = newName;
                }
            });
        }

        // 3. Оновлюємо joins (якщо є)
        if (Array.isArray(query.joins)) {
            query.joins.forEach(join => {
                if (join.fromTable === oldName) {
                    join.fromTable = newName;
                }
                if (join.toTable === oldName) {
                    join.toTable = newName;
                }
            });
        }

        // 4. (Опціонально) Оновлюємо назву запиту, якщо вона містить старе ім'я
        // if (typeof query.name === 'string' && query.name.includes(oldName)) {
        //     query.name = query.name.replace(oldName, newName);
        // }
    });

    console.log(`Оновлено запити: "${oldName}" → "${newName}" (sql, config, joins)`);
}
/**
 * Функція updateRelationsOnRename
 * Призначення: Оновлює всі посилання на таблицю в database.relations після її перейменування.
 * Параметри:
 *   - oldName (string): стара назва таблиці.
 *   - newName (string): нова назва таблиці.
 */
function updateRelationsOnRename(oldName, newName) {
    if (!oldName || !newName || oldName === newName) return;

    database.relations.forEach(relation => {
        // Оновлюємо звідки (fromTable)
        if (relation.fromTable === oldName) {
            relation.fromTable = newName;
        }
        // Оновлюємо куди (toTable)
        if (relation.toTable === oldName) {
            relation.toTable = newName;
        }
    });

    console.log(`Оновлено зв'язки: "${oldName}" → "${newName}"`);
}

/**
* Функція addTableToMenu(tableName)
* Призначення: Додає назву таблиці до списку таблиць у меню.
* Параметри:
* - tableName (string): назва таблиці.
* Результат: Елемент меню для редагування цієї таблиці додається до DOM.
**/
function addTableToMenu(tableName) {
    const dataMenu = document.getElementById("data-menu");
    if (dataMenu) { 
		// Якщо вже є — видаляємо стару версію (для оновлень)
		const existingItem = Array.from(dataMenu.children).find(item => item.textContent === tableName);
		if (existingItem) {
			existingItem.remove();
		}

		const item = document.createElement("a");
		item.href = "#";
		item.textContent = tableName;
		item.onclick = () => editData(tableName);

		dataMenu.appendChild(item);
		document.getElementById("data-work-link").style.display = "block";
    } 
}

/**
 * Функція removeTableFromMenu(oldTableName)
 * Призначення: Видаляє пункт меню для таблиці за її назвою.
 * Параметри:
 *  - oldTableName (string): назва таблиці, яку потрібно видалити з меню.
 * Результат: Відповідний елемент видаляється з DOM (якщо існує).
 */
function removeTableFromMenu(oldTableName) {
    const dataMenu = document.getElementById("data-menu");

    // Знаходимо елемент, у якого текстовий вміст співпадає з oldTableName
    const itemToRemove = Array.from(dataMenu.children).find(
        item => item.textContent.trim() === oldTableName.trim()
    );

    // Якщо знайшли — видаляємо
    if (itemToRemove) {
        dataMenu.removeChild(itemToRemove);
    }
}



// Запит на підтвердження видалення обраної бази даних
function confirmDeleteDb() {
    if (!selectedDbFile) {
        Message(t("selectFileForDelete"));
        return;
    }

    dbToDelete = selectedDbFile; // Зберегти ім’я БД для видалення
    document.getElementById("deleteConfirmText").innerHTML = t("deleteConfirmText", dbToDelete);

    document.getElementById("deleteModal").style.display = "flex"; // Показати вікно підтвердження
}

/** 
 * Видаляє базу даних із localStorage
 * Після видалення оновлює список
 **/
async function doDeleteDb() {
    if (dbToDelete) {
        // Якщо видаляється поточна база даних — спочатку її закриваємо
        if (dbToDelete === database.fileName) {
            saveDatabase();
            await dba.db.close();
            db = dba.db;
            localStorage.removeItem('lastOpenedFile');
            clearDB();
            updateMainTitle();
        }

        // Видалити з IndexedDB
        await idbDelete(dbToDelete + ".db-data");

        // Видалити всі пов'язані ключі з localStorage
        localStorage.removeItem(dbToDelete + ".db-data");        // ← ключовий рядок!
        localStorage.removeItem(dbToDelete + ".tables-data");
        localStorage.removeItem(dbToDelete + ".queries-data");
        localStorage.removeItem(dbToDelete + ".query-results");
        localStorage.removeItem(dbToDelete + ".reports-data");
        localStorage.removeItem(dbToDelete + ".forms-data");
        localStorage.removeItem(dbToDelete + ".relations-data");

        Message(t("fileDeleted", dbToDelete));
        closeDeleteModal();
        closeStorageDialog();
        showStorageDialog();    // тепер список оновиться коректно
    }
}
///////////////////////////////////////////////////////////////////////////////


/**
 * Оновлення заголовку таблиці структури 
 * якщо увімкнено хоча б один зовнішній ключ – показуємо два стовпці
 * якщо не увімкнено жодного зовнішнього ключа – приховуємо 
 */
function updateSchemaTableHeader(hasForeign) {
    const thead = document.getElementById("schemaHead");
    thead.innerHTML = ""; // очистити

    const headerRow = document.createElement("tr");
    headerRow.innerHTML = `
        <th class="icon-header" title="${t("schemaHeaderPrimaryKey")}"><span class="ui-icon">🔑</span></th>
        <th>${t("schemaHeaderFieldName")}</th>
        <th>${t("schemaHeaderType")}</th>
        <th class="icon-header" title="${t("schemaHeaderForeignKey")}"><span class="ui-icon">📌</span></th>
        <th id="refTableHeader">${t("schemaHeaderRefTable")}</th>
        <th id="refFieldHeader">${t("schemaHeaderRefField")}</th>
        <th id="refSubstHeader" class="icon-header"><span class="ui-icon">🛟</span></th>
        <th>${t("schemaHeaderDescription")}</th>
        <th>${t("schemaHeaderDelete")}</th>
    `;
    thead.appendChild(headerRow);

    // показати або приховати
    document.getElementById("refTableHeader").style.display = hasForeign ? "" : "none";
    document.getElementById("refFieldHeader").style.display = hasForeign ? "" : "none";
    document.getElementById("refSubstHeader").style.display = hasForeign ? "" : "none";
}


/**
 *  Отримання зовнішніх ключів
 **/
 function getPrimaryKeyFieldsForTable(tableName) {
    console.log("getPrimaryKeyFieldsForTable=",tableName) 
    const tbl = database.tables.find(t => t.name === tableName);
    console.log("tbl=",tbl) 
    if (!tbl || !tbl.schema) return [];
    return tbl.schema.filter(c => c.primaryKey).map(c => c.title);
}



  function editSelectedTableSchema() {
    if (!selectedTableNameForEdit) {
        Message(t("selectTableForEdit"));
        return;
    }
    
    const tableToEdit = database.tables.find(t => t.name === selectedTableNameForEdit);
    if (!tableToEdit) {
        Message(t("tableNotFound"));
        return;
    }
    newDbFile = false;
    isNewTable = false;
    editingTableName = tableToEdit.name;
    console.log("Edit schema=", selectedTableNameForEdit)
    table.schema = tableToEdit.schema || [];
    document.getElementById("savedTablesModal").style.display = "none";
    const tbody = document.getElementById("schemaBody");
    tbody.innerHTML = "";
    document.getElementById("tableName").value = tableToEdit.name;
    tableList = database.tables.map(t => t.name); // для FK
    const tableOptions = tableList.map(t => `<option value="${t}">${t}</option>`).join("");

    // Створюємо всі рядки одразу
    let rows = [];

    let hasForeign = table.schema.some(f => f.foreignKey);
    console.log("hasForeign=", hasForeign)
    updateSchemaTableHeader(hasForeign);
    table.schema.forEach(field => {
        const row = document.createElement("tr");

        const isPrimary = field.primaryKey ? 'checked' : '';
        const pkCellStyle = (field.primaryKey && field.autoInc) 
            ? 'background-color: #0f56d9; text-align:center;' 
            : 'text-align:center;';
                    
        const isForeign = field.foreignKey ? 'checked' : '';
        const selectedType = normalizeFieldTypeKey(field.type); // нормалізуємо до внутрішнього ключа для порівняння з SCHEMA_TYPE_KEYS
        const fkTable = field.refTable || "";
        const fkField = field.refField || "";
        const fkSubst = field.subst;
        
        console.log("fkSubst=",fkSubst)
        const comment = field.comment || "";

        const tableSelectHtml = `
            <select onchange="updateFieldOptions(this)" ${isForeign ? "" : "disabled"}>
                <option value="">${t("fkTablePlaceholder")}</option>
                ${tableOptions.replace(`value="${fkTable}"`, `value="${fkTable}" selected`)}
            </select>
        `;

        const fkFieldOptions = getPrimaryKeyFieldsForTable(fkTable).map(f =>
            `<option value="${f}" ${f === fkField ? "selected" : ""}>${f}</option>`).join("");

        console.log("fkFieldOptions=",getPrimaryKeyFieldsForTable(fkTable))
        const fieldSelectHtml = `
            <select ${isForeign ? "" : "disabled"}>
                <option value="">${t("fkFieldPlaceholder")}</option>
                ${fkFieldOptions}
            </select>
        `;
        let substCheck = "";
        if (fkSubst) substCheck="checked";
        const substHtm = `<input type="checkbox" ${substCheck}>`;

        // Збір усіх комірок
        const cells = [
            `<td data-role="pk" style="${pkCellStyle}">
                <input type="checkbox" onchange="handlePrimaryKey(this)" ${isPrimary}>
            </td>`,
        
            `<td data-role="title" contenteditable="true">${field.title}</td>`,
        
            `<td data-role="type">
                <select onchange="handleTypeChange(this)">
                    ${SCHEMA_TYPE_KEYS.map(key => `
                        <option value="${key}" ${key === selectedType ? "selected" : ""}>
                            ${t(key)}
                        </option>
                    `).join("")}
                </select>
            </td>`,
        
            `<td data-role="fk" style="text-align:center;">
                <input type="checkbox" onchange="handleForeignKey(this)" ${isForeign}>
            </td>`,
        ];

        // FK стовпці
        if (hasForeign) {
            cells.push(`<td data-role="ref-table">${tableSelectHtml}</td>`);
            cells.push(`<td data-role="ref-field">${fieldSelectHtml}</td>`);
            cells.push(`<td data-role="ref-subst">${substHtm}</td>`);
        }

        cells.push(`<td data-role="comment" contenteditable="true">${comment}</td>`);
        cells.push(`<td style="text-align:center;"><button onclick="deleteSchemaRow(this)"><span class="ui-icon">❌</span></button></td>`);

        row.innerHTML = cells.join("");
        rows.push(row);
    });

    // Виводимо всі зібрані рядки
    rows.forEach(r => tbody.appendChild(r));

    document.getElementById("makeTable").innerText = t("tableEditTitle");
    document.getElementById("modal").style.display = "flex";
}

/**
 * Копіювання вибраної таблиці зі створенням нового екземпляру
 */    
async function copySelectedTable() {
    if (!selectedTableNameForEdit) {
        Message(t("selectTableForCopy"));
        return;
    }

    const originalTable = database.tables.find(t => t.name === selectedTableNameForEdit);
    if (!originalTable) {
        Message(t("tableCopyNotFound"));
        return;
    }

    // Згенерувати нову унікальну назву
    let baseName = "Копія_" + selectedTableNameForEdit;
    let newName = baseName;
    let counter = 1;
    while (database.tables.some(t => t.name === newName)) {
        newName = baseName + "_" + counter++;
    }

    // Копіюємо структуру таблиці
    const newTable = {
        name: newName,
        schema: JSON.parse(JSON.stringify(originalTable.schema)),
        data: JSON.parse(JSON.stringify(originalTable.data || []))
    };

    // Створюємо таблицю в SQLite
    try {
        const fields = newTable.schema.map(field => {
            const type = typeToSQL(field.type);
            let def = `"${field.title}" ${type}`;
            if (field.primaryKey) def += " PRIMARY KEY";
            return def;
        });

		const foreignKeys = newTable.schema
			.filter(f => f.foreignKey && f.refTable && f.refField)
			.map(f => `FOREIGN KEY ("${f.title}") REFERENCES "${f.refTable}"("${f.refField}") ON UPDATE CASCADE`);


        const createSQL = `CREATE TABLE "${newTable.name}" (${[...fields, ...foreignKeys].join(", ")});`;
        await dba.db.run("PRAGMA foreign_keys = OFF;");
        await dba.db.run(createSQL);
     


        // Вставити всі записи
        for (const row of newTable.data) {
            const columns = newTable.schema.map(f => `"${f.title}"`);
            const values = row.map(v => v === null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
            const insertSQL = `INSERT INTO "${newTable.name}" (${columns.join(", ")}) VALUES (${values.join(", ")});`;
            await dba.db.run(insertSQL);
        }
        await dba.db.run("PRAGMA foreign_keys = ON;");
        // Додати таблицю в список
        database.tables.push(newTable);
        addTableToMenu(newTable.name);
        saveDatabase();

        Message(t("tableCopied", newTable.name));
        showSavedTablesDialog(); // оновити діалог

    } catch (e) {
        console.error("Помилка при копіюванні таблиці:", e);
        Message(t("tableCopyError"));
    }
}
