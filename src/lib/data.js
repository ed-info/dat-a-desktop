function showData() {
    const dropdown = document.getElementById("data-menu");
    if (!dropdown) {
        console.error(t("dataMenuNotFound") || "Елемент #data-menu не знайдено.");
        return;
    }
    // Отримати всі назви таблиць з  <a > всередині dropdown
    const tableNames = [...dropdown.querySelectorAll("a")].map(a => a.textContent.trim()).filter(name => name);
    if (tableNames.length === 0) {
        Message(t("dataTableListEmpty"));
        return;
    }
    const listEl = document.getElementById("tableListInModal");
    listEl.innerHTML = "";
    listEl.style.listStyle = "none";
    selectedTableNameForEdit = null;
    tableNames.forEach(name => {
        const li = document.createElement("li");
        li.textContent = name;
        li.style.padding = "8px";
        li.style.cursor = "pointer";
        li.dataset.tableName = name;
        li.addEventListener("click", () => {
            [...listEl.children].forEach(el => el.style.background = "");
            const isDark = document.body.classList.contains("dark-theme");
            li.style.background = isDark ? "#242d43" : "#d0e0ff";
            selectedTableNameForEdit = li.dataset.tableName;
        });
        listEl.appendChild(li);
    });
    document.getElementById("dataModal").style.display = "flex";
}

function confirmOpenSelectedTable() {
    if (!selectedTableNameForEdit) {
        Message(t("dataSelectTableFromList"));
        return;
    }
    document.getElementById("dataModal").style.display = "none";
    openSelectedTable(); // Твоя функція для відкриття
}
let selectedDataWorkName = null;

function showDataWorkDialog() {
    const listEl = document.getElementById("dataWorkList");
    listEl.innerHTML = "";
    selectedDataWorkName = null;
    // Додаємо звичайні таблиці
    (database.tables || []).forEach(t => {
        const li = document.createElement("li");
        li.textContent = t.name;
        li.style.padding = "8px";
        li.style.cursor = "pointer";
        li.addEventListener("click", () => {
            [...listEl.children].forEach(el => el.style.background = "");
            const isDark = document.body.classList.contains("dark-theme");
            li.style.background = isDark ? "#242d43" : "#d0e0ff";
            selectedDataWorkName = t.name;
        });
        listEl.appendChild(li);
    });
    // Додаємо результати запитів
    (queries.results || []).forEach(q => {
        const li = document.createElement("li");
        li.textContent = "* " + q.name; // * — щоб відрізнити
        li.style.padding = "8px";
        li.style.cursor = "pointer";
        li.addEventListener("click", () => {
            [...listEl.children].forEach(el => el.style.background = "");
            const isDark = document.body.classList.contains("dark-theme");
            li.style.background = isDark ? "#242d43" : "#d0e0ff";
            selectedDataWorkName = "*" + q.name; // без пробілу — substring(1) поверне точне ім'я
        });
        listEl.appendChild(li);
    });
    document.getElementById("dataWorkModal").style.display = "flex";
}

function closeDataWorkDialog() {
    document.getElementById("dataWorkModal").style.display = "none";
}
let currentDataView = {
    columns: [],
    rows: []
};

//  Мульти-фільтри
let _filterRowCount = 0;

function _getConditionOptions() {
    return `<option value="">${t("dataNone")}</option>
            <option value="=">=</option>
            <option value="!=">!=</option>
            <option value=">">></option>
            <option value="<">&lt;</option>
            <option value=">=">>=</option>
            <option value="<="><=</option>
            <option value="contains">${t("dataContains")}</option>
            <option value="startswith">${t("dataStartswith")}</option>`;
}

function addDataFilterRow() {
    _filterRowCount++;
    const id = "fr_" + _filterRowCount;
    const container = document.getElementById("filterRowsContainer");
    const isFirst = container.children.length === 0;
    const div = document.createElement("div");
    div.id = id;
    div.style.cssText = "display:flex; gap:6px; align-items:center; flex-wrap:wrap;";

    const logicPart = isFirst
        ? `<span style="font-size:12px; color:#666; min-width:36px;">${t("dataFilterLabel")}</span>`
        : `<button onclick="_toggleLogicBadge('badge_${id}')" id="badge_${id}"
               style="font-size:11px; font-weight:bold; padding:2px 7px; border-radius:4px;
                      background:#d0e0ff; border:1px solid #88aadd; cursor:pointer; min-width:36px;">AND</button>`;

    div.innerHTML = `
        ${logicPart}
        <select class="dvFilterCol" data-row="${id}" style="padding:3px 4px; font-size:13px;">
            ${currentDataView.columns.map(c => `<option value="${c}">${c}</option>`).join("")}
        </select>
        <select class="dvFilterCond" data-row="${id}" style="padding:3px 4px; font-size:13px;">
            ${_getConditionOptions()}
        </select>
        <input type="text" class="dvFilterVal" data-row="${id}"
               style="width:180px; padding:3px 5px; font-size:13px;" placeholder="${t("dataValue")}">
        <button onclick="_removeFilterRow('${id}')"
                style="font-size:13px; padding:0; width:22px; height:22px; border-radius:2px;
                       border:1px solid #bbb; background:#fff; cursor:pointer; color:#666; flex-shrink:0;">×</button>
    `;
    container.appendChild(div);
}

function _toggleLogicBadge(badgeId) {
    const b = document.getElementById(badgeId);
    if (!b) return;
    b.textContent = b.textContent.trim() === "AND" ? "OR" : "AND";
}

function _removeFilterRow(rowId) {
    const el = document.getElementById(rowId);
    if (el) el.remove();
    applyDataFilter();
}

function _getFilterRows() {
    const rows = document.querySelectorAll("#filterRowsContainer > div");
    return Array.from(rows).map((row, i) => {
        const col   = row.querySelector(".dvFilterCol")  ? row.querySelector(".dvFilterCol").value  : "";
        const cond  = row.querySelector(".dvFilterCond") ? row.querySelector(".dvFilterCond").value : "";
        const val   = row.querySelector(".dvFilterVal")  ? row.querySelector(".dvFilterVal").value.trim() : "";
        const badge = row.querySelector("button[id^='badge_']");
        const logic = badge ? badge.textContent.trim() : "AND";
        return { col, cond, val, logic, index: i };
    });
}

function _evalCondition(cellValue, cond, mask) {
    if (!cond || !mask) return true;
    const strVal = String(cellValue);
    if (cond === "contains") return strVal.toLowerCase().includes(mask.toLowerCase());
    if (cond === "startswith") return strVal.toLowerCase().startsWith(mask.toLowerCase());
    if (cond === "=" || cond === "!=") {
        const regex = maskToRegex(mask);
        const matches = regex.test(strVal);
        return cond === "=" ? matches : !matches;
    }
    const numVal  = parseFloat(strVal);
    const numMask = parseFloat(mask);
    if (isNaN(numVal) || isNaN(numMask)) return false;
    if (cond === ">")  return numVal > numMask;
    if (cond === "<")  return numVal < numMask;
    if (cond === ">=") return numVal >= numMask;
    if (cond === "<=") return numVal <= numMask;
    return true;
}

//Відкриття 
function openSelectedDataWork() {
    if (!selectedDataWorkName) {
        Message(t("dataSelectTableOrQuery"));
        return;
    }
    closeDataWorkDialog();
    openDataView(selectedDataWorkName);
}

function openDataView(tableName) {
    let tableData, columns, columnTypes;
    if (tableName.startsWith('*')) {
        const q = queries.results.find(item => item.name === tableName.substring(1));
        if (!q) return Message(t("dataQueryNotFound"));
        columns     = q.schema.map(c => c.title);
        columnTypes = q.schema.map(c => (c.type || "").toLowerCase());
        tableData   = q.data;
    } else {
        const tbl = database.tables.find(tbl => tbl.name === tableName);
        if (!tbl) return Message(t("dataTableNotFound"));
        columns     = tbl.schema.map(c => c.title);
        columnTypes = tbl.schema.map(c => (c.type || "").toLowerCase());
        tableData   = tbl.data;
    }
    currentDataView.columns     = columns;
    currentDataView.columnTypes = columnTypes || [];
    currentDataView.rows        = [...tableData];

    // Заповнити селект поля для сортування
    const select = document.getElementById("dataFieldSelect");
    select.innerHTML = columns.map(c => `<option value="${c}">${c}</option>`).join("");

    // Очистити фільтри
    document.getElementById("filterRowsContainer").innerHTML = "";
    document.getElementById("dataSearchInput").value = "";
    _filterRowCount = 0;

    renderDataViewTable(columns, currentDataView.rows);
    _updateCountLabel(currentDataView.rows.length, currentDataView.rows.length);
    document.getElementById("dataViewTitle").textContent = t("dataTableLabel", tableName);
    document.getElementById("dataViewModal").style.display = "flex";
}

//Рендер таблиці
// IMAGE_TYPES / FILE_TYPES — типи колонок зі схеми
const _IMAGE_TYPES = ["image", "img", "photo", "picture", "blob_image"];
const _FILE_TYPES  = ["file", "blob", "attachment", "document", "binary"];

function _getCellDisplay(cell, colType) {
    if (cell === null || cell === undefined) return { text: "", isSymbol: false };
    const str = String(cell);

    // 1. Перевірка за типом колонки зі схеми (найнадійніше)
    if (colType) {
        if (_IMAGE_TYPES.some(t => colType.includes(t))) return { text: "🖼️", isSymbol: true };
        if (_FILE_TYPES.some(t => colType.includes(t)))  return { text: "📎", isSymbol: true };
    }

    // 2. Перевірка за вмістом: data URI
    if (/^data:image\//i.test(str)) return { text: "🖼️", isSymbol: true };
    if (/^data:[^;]+;base64,/i.test(str)) return { text: "📎", isSymbol: true };

    // 3. Перевірка за розширенням у URL/шляху
    if (/\.(png|jpe?g|gif|webp|bmp|svg|ico|tiff?)(\?.*)?$/i.test(str)) return { text: "🖼️", isSymbol: true };
    if (/\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|tar|gz|mp3|mp4|avi|mov|mkv)(\?.*)?$/i.test(str)) return { text: "📎", isSymbol: true };

    // 4. Рядок схожий на масив байтів: тільки цифри та коми, достатньо довгий
    if (/^(\d{1,3},){10,}\d{1,3}$/.test(str.trim())) return { text: "🖼️", isSymbol: true };

    return { text: str, isSymbol: false };
}

function renderDataViewTable(columns, rows) {
    const head = document.getElementById("dataViewHead");
    const body = document.getElementById("dataViewBody");
    const types = currentDataView.columnTypes || [];
    head.innerHTML = "";
    const trHead = document.createElement("tr");
    columns.forEach(c => {
        const th = document.createElement("th");
        th.textContent = c;
        trHead.appendChild(th);
    });
    head.appendChild(trHead);
    body.innerHTML = "";
    rows.forEach(r => {
        const tr = document.createElement("tr");
        r.forEach((cell, colIdx) => {
            const td = document.createElement("td");
            const colType = types[colIdx] || "";
            const { text, isSymbol } = _getCellDisplay(cell, colType);
            if (isSymbol) {
                td.textContent = text;
                td.style.textAlign = "center";
                td.title = String(cell).substring(0, 120);
            } else {
                td.textContent = text;
            }
            tr.appendChild(td);
        });
        body.appendChild(tr);
    });
}

function _updateCountLabel(shown, total) {
    const el = document.getElementById("dataViewCount");
    if (el) el.textContent = t("dataViewCount",shown,total);
}

// Сортування
function sortDataTable() {
    const field = document.getElementById("dataFieldSelect").value;
    const order = document.querySelector('input[name="sortOrder"]:checked').value;
    const colIndex = currentDataView.columns.indexOf(field);
    if (colIndex === -1) return;
    currentDataView.rows.sort((a, b) => {
        if (a[colIndex] < b[colIndex]) return order === "asc" ? -1 : 1;
        if (a[colIndex] > b[colIndex]) return order === "asc" ? 1 : -1;
        return 0;
    });
    applyDataFilter();
}

// Застосувати фільтри
function applyDataFilter() {
    const filterRows = _getFilterRows().filter(f => f.cond && f.val !== "");
    const globalMask = document.getElementById("dataSearchInput").value.trim().toLowerCase();

    // Визначаємо, чи містить маска символи підстановки
    const _hasWildcard = s => /[*?#\[\]]/.test(s);
    const globalRegex = globalMask && _hasWildcard(globalMask)
        ? maskToRegex(globalMask)
        : null;

    let result = currentDataView.rows.filter(row => {
        // Глобальний пошук по всіх колонках
        if (globalMask) {
            const found = globalRegex
                ? row.some(cell => globalRegex.test(String(cell)))
                : row.some(cell => String(cell).toLowerCase().includes(globalMask));
            if (!found) return false;
        }
        // Мульти-фільтри
        if (filterRows.length === 0) return true;
        let pass = true;
        filterRows.forEach((f, i) => {
            const colIdx = currentDataView.columns.indexOf(f.col);
            if (colIdx === -1) return;
            const cellVal = row[colIdx];
            const match   = _evalCondition(cellVal, f.cond, f.val);
            if (i === 0) { pass = match; }
            else if (f.logic === "OR")  { pass = pass || match; }
            else                         { pass = pass && match; }
        });
        return pass;
    });

    renderDataViewTable(currentDataView.columns, result);
    _updateCountLabel(result.length, currentDataView.rows.length);
}

// Глобальний пошук (викликається при введенні)
function applyDataSearch() {
    applyDataFilter();
}

// Скинути фільтри
function resetDataFilters() {
    document.getElementById("filterRowsContainer").innerHTML = "";
    document.getElementById("dataSearchInput").value = "";
    _filterRowCount = 0;
    renderDataViewTable(currentDataView.columns, currentDataView.rows);
    _updateCountLabel(currentDataView.rows.length, currentDataView.rows.length);
}

function closeDataViewModal() {
    document.getElementById("dataViewModal").style.display = "none";
}



function maskToRegex(mask) {
    // Екрануємо всі спецсимволи RegExp, щоб вони не спрацьовували
    let regexStr = mask.replace(/([.+^${}()|\\])/g, "\\$1");

    // Зірочка (*) → .* (будь-яка кількість символів)
    regexStr = regexStr.replace(/\*/g, ".*");

    // Знак питання (?) → . (один будь-який символ)
    regexStr = regexStr.replace(/\?/g, ".");

    // Решітка (#) → [0-9] (одна будь-яка цифра)
    regexStr = regexStr.replace(/#/g, "[0-9]");

    // [!...] → [^...] (заперечення у регулярках)
    regexStr = regexStr.replace(/\[!([^\]]+)\]/g, "[^$1]");

    // Діапазони та звичайні [ ] залишаємо як є, бо вони вже валідні у RegExp
    // Тут просто забираємо екранування з []
    regexStr = regexStr.replace(/\\\[/g, "[");
    regexStr = regexStr.replace(/\\\]/g, "]");

    return new RegExp("^" + regexStr + "$", "i"); // ^ і $ — щоб збігався весь рядок
}
