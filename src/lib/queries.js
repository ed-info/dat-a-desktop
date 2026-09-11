/**
 * Залишаємо тільки зв'язки через FOREIGN KEY
 **/ 
function resetNonReadonlyRelations() {
    if (!Array.isArray(database.relations)) return;
    database.relations = database.relations.filter(r => r.readonly === true);
   
}
 
/** 
 * Ініціалізує створення нового SQL-запиту 
 * Показує модальне вікно конструктора запиту
 **/
function createQuery() {
	if(!isDBExist()) return
    resetNonReadonlyRelations();
    document.getElementById("queryName").value = t("queryDefaultName"); // Назва за замовчуванням
    document.getElementById("queryBody").innerHTML = ""; // Очистити старі рядки
    // Очистити таблицю JOIN-зв'язків
    const joinTable = document.getElementById("joinBody");
    if (joinTable) {
        const tbody = joinTable.querySelector("tbody");
        if (tbody) {
            tbody.innerHTML = ""; // Очистити всі рядки JOIN
        }
        joinTable.style.display = "none"; // Приховати таблицю JOIN
    }
    
    // Очистити базову таблицю (FROM)
    const fromTableSelect = document.getElementById("fromTable");
    if (fromTableSelect) {
        fromTableSelect.value = ""; // Скинути вибір
    }
    addQueryRow(); // Додати перший рядок
    document.getElementById("queryModal").style.display = "flex"; // Показати вікно
    populateTableDropdowns(); // Заповнити випадаючі списки таблиць
    toggleStructureButtonVisibility(true);
}
/** 
 * Додає новий рядок до конструктора запиту
 * Рядок містить вибір таблиці, поля, видимість, сортування, фільтр
 **/
function fillSortSelect(select) {
    [
        { value: "",     key: "sortNone" },
        { value: "ASC",  key: "sortAsc"  },
        { value: "DESC", key: "sortDesc" },
    ].forEach(({ value, key }) => {
        const opt = document.createElement("option");
        opt.value = value;        
        opt.textContent = t(key);
        select.appendChild(opt);
    });
}

function fillOperatorSelect(select) {
    [
        { value: "==",          key: "opEqual"      },
        { value: "<",           key: "opLess"        },
        { value: "<=",          key: "opLessEq"      },
        { value: ">",           key: "opGreater"     },
        { value: ">=",          key: "opGreaterEq"   },
        { value: "!=",          key: "opNotEq"       },
        { value: "LIKE",        key: "opLike"        },
        { value: "IN",          key: "opIn"          },
        { value: "NOT IN",      key: "opNotIn"       },
        { value: "BETWEEN",     key: "opBetween"     },
        { value: "NOT BETWEEN", key: "opNotBetween"  },
    ].forEach(({ value, key }) => {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = value;
        opt.title = t(key);
        select.appendChild(opt);
    });
}

function fillRoleSelect(select) {
    select.title = t("roleParticipation");
    [
        { value: "select", label: "----",  key: null          },
        { value: "count",  label: "COUNT", key: "roleCount"   },
        { value: "sum",    label: "SUM",   key: "roleSum"     },
        { value: "avg",    label: "AVG",   key: "roleAvg"     },
        { value: "min",    label: "MIN",   key: "roleMin"     },
        { value: "max",    label: "MAX",   key: "roleMax"     },
    ].forEach(({ value, label, key }) => {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = label;
        if (key) opt.title = t(key);
        select.appendChild(opt);
    });
}

function addQueryRow() {
    const tbody = document.getElementById("queryBody");
    const row = document.createElement("tr");
    
    row.innerHTML = `
        <td><select class="query-table-select" onchange="populateFieldDropdown(this)"></select></td>
        <td><select class="query-field-select" onchange="onFieldSelectChange(this)"></select><div class="computed-expr-display" style="display:none; margin-top:4px; font-size:12px; color:#555; cursor:pointer;" onclick="editComputedField(this)"></div></td>
        <td><input type="checkbox" checked class="query-visible-checkbox"></td>
        <td><select class="query-sort-select"></select></td>
        <td>
            <div style="display: flex; gap: 4px; align-items: center;">
                <select class="query-operator-select" style="width: 60px;"></select>
                <input type="text" class="query-criteria-input" style="flex: 1;">
            </div>
        </td>
        <td>
            <select class="query-field-role" onchange="toggleAliasInput(this)"></select>
            <input type="text" class="query-alias-input" style="margin-top:4px; display:none; width:100%;height:1.5em;">
        </td>
        <td><select class="group-field-select"></select></td>
        <td><button onclick="deleteQueryRow(this)"><span class="ui-icon">❌</span></button></td>
    `;

    tbody.appendChild(row);

    fillSortSelect(row.querySelector(".query-sort-select"));
    fillOperatorSelect(row.querySelector(".query-operator-select"));
    fillRoleSelect(row.querySelector(".query-field-role"));

    row.querySelector(".query-alias-input").placeholder = t("queryAlias");

    populateTableDropdownsForRow(row);
}

/**
 * функція для показу/приховування input псевдоніма
 **/
function toggleAliasInput(selectEl) {
    const row = selectEl.closest("tr");
    const aliasInput = row.querySelector(".query-alias-input");
    console.log("toggleAliasInput=",selectEl.value)
    if (selectEl.value !== "select") {
        aliasInput.style.display = "block";
    } else {
        aliasInput.style.display = "none";
        aliasInput.value = "";
    }
}


// ===================== Computed Fields =====================

let computedFieldTargetRow = null; // row that triggered the modal

/**
 * Called when field select changes — opens computed modal if __expr__ selected
 */
function onFieldSelectChange(selectEl) {
    if (selectEl.value === "__expr__") {
        computedFieldTargetRow = selectEl.closest("tr");
        openComputedFieldModal();
    } else {
        // Hide expression display if switching back to normal field
        const row = selectEl.closest("tr");
        const display = row.querySelector(".computed-expr-display");
        if (display) {
            display.style.display = "none";
            display.innerHTML = "";
        }
        // Clear stored computed data
        delete row.dataset.computed;
    }
}

/**
 * Collects tables available in query context (FROM + JOINs)
 */
function getQueryTables() {
    const tables = [];
    const fromTable = document.getElementById("fromTable")?.value;
    if (fromTable) tables.push(fromTable);

    // All tables selected in query rows
    document.querySelectorAll("#queryBody .query-table-select").forEach(sel => {
        if (sel.value && !tables.includes(sel.value)) tables.push(sel.value);
    });

    // JOIN tables
    document.querySelectorAll("#joinBody .join-table-a, #joinBody .join-table-b").forEach(sel => {
        if (sel.value && !tables.includes(sel.value)) tables.push(sel.value);
    });

    // Fallback: all database tables
    if (tables.length === 0) {
        database.tables.forEach(t => tables.push(t.name));
    }

    return tables;
}

// ===================== Expression Builder (computed fields) =====================

/**
 * Builds and injects the Expression Builder modal into the DOM (once).
 */
function ensureExprBuilderModal() {
    console.log("t test:", t("exprSelectTable"));
    if (document.getElementById("exprBuilderModal")) return;

    const modal = document.createElement("div");
    modal.id = "exprBuilderModal";
    modal.style.cssText = `
        display:none; position:fixed; inset:0; z-index:9999;
        align-items:center; justify-content:center;
        background:rgba(0,0,0,0.45);
    `;
    modal.innerHTML = `
        <div class="eb-card">
            <!-- Header: label + alias input + close -->
            <div class="eb-header">
                <span class="eb-header-label">${t("exprBuilderTitle")}</span> 
                <input id="exprBuilderAlias" type="text" class="eb-alias-input"
                    placeholder="${t("queryAlias")}">
                <button class="eb-close-btn" onclick="cancelComputedField()"
                    title="${t("cancel")}">✕</button>
            </div>

            <!-- Expression display -->
            <div id="exprBuilderDisplay" class="eb-display">
                <span class="eb-empty">—</span>
            </div>

            <!-- Toolbar: Add Field | Functions | , | DEL -->
            <div class="eb-toolbar">
                <div class="eb-field-wrap" id="exprFieldDropdownWrap">
                    <button id="exprFieldBtn" class="eb-btn eb-btn-field" onclick="exprShowFieldSelects()">
                        ${t("exprAddFieldBtn")}
                    </button>
                    <div class="eb-field-dropdowns">
                        <select id="exprTableSelect" class="eb-table-select" onchange="exprOnTableChange()"
                            style="display:none;">
                            <option value="">${t("exprSelectTable")}</option>
                        </select>
                        <select id="exprFieldSelect" class="eb-field-select" onchange="exprOnFieldChange()"
                            style="display:none;" disabled>
                            <option value="">${t("exprSelectField")}</option>
                        </select>
                    </div>
                </div>
                <div class="eb-func-wrap" id="exprFuncDropdownWrap">
                    <button class="eb-btn eb-btn-field" onclick="exprToggleFuncMenu()">${t("exprFuncBtn")}</button>
                    <div id="exprFuncMenu" class="eb-func-menu">
                        ${["ABS(","INSTR(","CONCAT(","LENGTH(","SIGN(","SUBSTR(","ROUND(","TRIM(","REPLACE("].map(f=>
                            `<button class="eb-func-item" onclick="exprAddFunc('${f}')">${f}</button>`
                        ).join("")}
                    </div>
                </div>
                <button class="eb-btn eb-btn-op eb-btn-comma" onclick="exprAdd(',')">,</button>
                <button class="eb-btn eb-btn-del" onclick="exprDel()">⌫</button>
            </div>

            <!-- 🔹 Цифрова сітка -->
            <div class="eb-grid">
                ${["7","8","9"].map(v=>`<button class="eb-btn eb-btn-digit" onclick="exprAdd('${v}')">${v}</button>`).join("")}
                <button class="eb-btn eb-btn-op" onclick="exprAdd('*')">*</button>
                <button class="eb-btn eb-btn-op" onclick="exprAdd('%')">%</button>

                ${["4","5","6"].map(v=>`<button class="eb-btn eb-btn-digit" onclick="exprAdd('${v}')">${v}</button>`).join("")}
                <button class="eb-btn eb-btn-op" onclick="exprAdd('/')">/</button>
                <button class="eb-btn eb-btn-op" onclick="exprAdd('(')">(</button>

                ${["1","2","3"].map(v=>`<button class="eb-btn eb-btn-digit" onclick="exprAdd('${v}')">${v}</button>`).join("")}
                <button class="eb-btn eb-btn-op" onclick="exprAdd('+')">+</button>
                <button class="eb-btn eb-btn-op" onclick="exprAdd(')')">)</button>

                <button class="eb-btn eb-btn-digit" onclick="exprAdd('0')">0</button>
                <button class="eb-btn eb-btn-digit" onclick="exprAdd('.')">.</button>
                <button class="eb-btn eb-btn-op"    onclick="exprToggleSign()">+/-</button>
                <button class="eb-btn eb-btn-op"    onclick="exprAdd('-')">-</button>
                <button class="eb-btn eb-btn-ok"    onclick="confirmComputedField()">${t("exprOK")}</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Close FUNC dropdown on outside click
    document.addEventListener("click", function(ev) {
        if (!ev.target.closest("#exprFuncDropdownWrap")) {
            document.getElementById("exprFuncMenu")?.classList.remove("show");
        }
    });
}
// ---- Expression Builder state ----
let _exprValue = "";

function exprToggleFuncMenu() {
    document.getElementById("exprFuncMenu").classList.toggle("show");
}

function _exprTokenize(s) {
    const t = []; let i = 0;
    while (i < s.length) {
        if (/\s/.test(s[i])) { i++; continue; }
        const fieldMatch = s.slice(i).match(/^\[([^\]]+)\]/);
        if (fieldMatch) {
            t.push({ v: fieldMatch[0], t: "field" }); i += fieldMatch[0].length; continue;
        }
        if (/[A-Z_]/i.test(s[i])) {
            const m = s.slice(i).match(/^[A-Z_]+/i);
            if (m && s[i + m[0].length] === "(") { t.push({ v: m[0], t: "func" }); i += m[0].length; }
            else { t.push({ v: s[i], t: "text" }); i++; }
            continue;
        }
        if (/[0-9.]/.test(s[i])) {
            let n = ""; while (i < s.length && /[0-9.]/.test(s[i])) { n += s[i]; i++; }
            t.push({ v: n, t: "num" }); continue;
        }
        if ("()+-*/%".includes(s[i])) { t.push({ v: s[i], t: s[i] === "(" || s[i] === ")" ? "paren" : "op" }); i++; continue; }
        if (s.slice(i, i+2) === "&&") { t.push({ v: "&&", t: "op" }); i += 2; continue; }
        t.push({ v: s[i], t: "text" }); i++;
    }
    return t;
}

function _exprHighlight(s) {
    if (!s) return `<span class="eb-empty">—</span>`;
    return _exprTokenize(s).map(tk => {
        const sp = document.createElement("span");
        sp.textContent = tk.v;
        sp.className = "hl-" + tk.t;
        return sp.outerHTML;
    }).join("");
}

function _exprValidate(s) {
    const errs = []; let bal = 0; const ops = "+-*/%";
    const fns = ["SUM","AVG","COUNT","MIN","MAX","IF","ROUND","LEN","CONCAT"];
    let prev = null;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === "(") bal++;
        else if (c === ")") { bal--; if (bal < 0) errs.push(t("exprErrExtraParen")); }
        if (ops.includes(c) && ops.includes(prev)) errs.push(t("exprErrDoubleOperator"));
        prev = c;
    }
    if (bal > 0) errs.push(t("exprErrUnclosedParen"));
    if (s && ops.includes(s.slice(-1))) errs.push(t("exprErrEndsWithOperator"));
    return errs;
}

function _exprUpdate() {
    const disp = document.getElementById("exprBuilderDisplay");
    if (!disp) return;
    disp.innerHTML = _exprValue
        ? _exprHighlight(_exprValue)
        : `<span class="eb-empty">—</span>`;
    const errs = _exprValidate(_exprValue);
    disp.classList.toggle("eb-err", errs.length > 0);
    disp.classList.toggle("eb-ok",  !errs.length && !!_exprValue);
}

function exprAdd(s) {
    _exprValue += s;
    _exprUpdate();
    //document.getElementById("exprFieldMenu").style.display = "none";
    //document.getElementById("exprFuncMenu").style.display = "none";
}

function exprAddField(tableField) {
    _exprValue += `[${tableField}]`;
    _exprUpdate();
}

function exprAddFunc(f) {
    _exprValue += f;
    _exprUpdate();
    document.getElementById("exprFuncMenu")?.classList.remove("show");
}

function exprDel() {
	console.log("DEL-",document.getElementById("exprFieldBtn").style.display)
	if (document.getElementById("exprFieldBtn").style.display == "none") {
		_exprHideFieldSelects()
	}
    if (!_exprValue) return;
    // Delete bracketed field token as unit
    const fieldMatch = _exprValue.match(/\[[^\]]+\]$/);
    if (fieldMatch) { _exprValue = _exprValue.slice(0, -fieldMatch[0].length); _exprUpdate(); return; }
    // Delete function name before (
    if (/[A-Z_]+\($/i.test(_exprValue)) { _exprValue = _exprValue.replace(/[A-Z_]+\($/i, ""); _exprUpdate(); return; }
    // Delete operator / paren
    if ("()+-*/%".includes(_exprValue.slice(-1))) { _exprValue = _exprValue.slice(0,-1); _exprUpdate(); return; }
    // Delete number digit by digit
    _exprValue = _exprValue.slice(0, -1);
    _exprUpdate();
}

function exprToggleSign() {
    const m = [..._exprValue.matchAll(/(?:^|(?<=[+\-*\/%(]))(-?)(\d+(?:\.\d+)?)/g)];
    if (!m.length) return;
    const last = m[m.length - 1];
    const st = last.index;
    const neg = _exprValue[st] === "-";
    _exprValue = neg ? _exprValue.slice(0, st) + _exprValue.slice(st + 1) : _exprValue.slice(0, st) + "-" + _exprValue.slice(st);
    _exprUpdate();
}

/**
 * Show table+field selects in place of the "Додати поле" button
 */
function exprShowFieldSelects() {
    document.getElementById("exprFieldBtn").style.display = "none";
    const tableSelect = document.getElementById("exprTableSelect");
    tableSelect.style.display = "";
    tableSelect.value = "";
    const fieldSelect = document.getElementById("exprFieldSelect");
    fieldSelect.style.display = "";
    fieldSelect.innerHTML = `<option value="">${t("exprSelectField")}</option>`;
    fieldSelect.disabled = true;
    //fieldSelect.style.opacity = "0.5";
}

/**
 * Restore "Додати поле" button, hide selects
 */
function _exprHideFieldSelects() {
    document.getElementById("exprFieldBtn").style.display = "";
    document.getElementById("exprTableSelect").style.display = "none";
    document.getElementById("exprFieldSelect").style.display = "none";
}

/**
 * Populate the table <select> with all query tables
 */
function _exprPopulateFieldMenu() {
    const tableSelect = document.getElementById("exprTableSelect");
    const fieldSelect = document.getElementById("exprFieldSelect");
    if (!tableSelect || !fieldSelect) return;

    // Reset table select options (keep hidden)
    tableSelect.innerHTML = `<option value="">${t("exprSelectTable")}</option>`;
    getQueryTables().forEach(name => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        tableSelect.appendChild(opt);
    });

    // Reset field select
    fieldSelect.innerHTML = `<option value="">${t("exprSelectField")}</option>`;
    fieldSelect.disabled = true;
    // /fieldSelect.style.opacity = "0.5";

    // Ensure button is visible, selects hidden
    _exprHideFieldSelects();
}

/**
 * Called when table select changes — populate field select
 */
function exprOnTableChange() {
    const tableSelect = document.getElementById("exprTableSelect");
    const fieldSelect = document.getElementById("exprFieldSelect");
    const tableName = tableSelect.value;

    fieldSelect.innerHTML = `<option value="">${t("exprSelectField")}</option>`;

    if (!tableName) {
        fieldSelect.disabled = true;
        //fieldSelect.style.opacity = "0.5";
        return;
    }

    const table = database.tables.find(tb => tb.name === tableName);
    if (!table) return;

    table.schema.forEach(field => {
        const opt = document.createElement("option");
        opt.value = field.title;
        opt.textContent = field.title;
        fieldSelect.appendChild(opt);
    });

    fieldSelect.disabled = false;
    //fieldSelect.style.opacity = "1";
}

/**
 * Called when field select changes — insert [TABLE.FIELD] token, restore button
 */
function exprOnFieldChange() {
    const tableSelect = document.getElementById("exprTableSelect");
    const fieldSelect = document.getElementById("exprFieldSelect");
    const tableName = tableSelect.value;
    const fieldName = fieldSelect.value;
    if (!tableName || !fieldName) return;

    exprAddField(`${tableName}.${fieldName}`);
    _exprHideFieldSelects();
}

/**
 * Opens the Expression Builder modal
 */
function openComputedFieldModal() {
    ensureExprBuilderModal();
    _exprPopulateFieldMenu();

    // Restore from existing computed data or reset
    if (computedFieldTargetRow && computedFieldTargetRow.dataset.computed) {
        const c = JSON.parse(computedFieldTargetRow.dataset.computed);
        _exprValue = c.expr || "";
        document.getElementById("exprBuilderAlias").value = c.alias || "";
    } else {
        _exprValue = "";
        document.getElementById("exprBuilderAlias").value = "";
    }
    _exprUpdate();

    document.getElementById("exprBuilderModal").style.display = "flex";
}

/**
 * Confirms the expression, stores on row as { expr, alias }
 */
function confirmComputedField() {
    const alias = document.getElementById("exprBuilderAlias").value.trim();
    if (!alias) {
        Message(t("computedAliasRequired"));
        return;
    }
    if (!_exprValue) {
        Message(t("exprErrEmpty"));
        return;
    }
    const errs = _exprValidate(_exprValue);
    if (errs.length) {
        Message(t("exprErrPrefix") + errs[0]);
        return;
    }
    if (!computedFieldTargetRow) return;

    const computed = { expr: _exprValue, alias };
    computedFieldTargetRow.dataset.computed = JSON.stringify(computed);

    // Show alias as label, full expression as tooltip
    const display = computedFieldTargetRow.querySelector(".computed-expr-display");
    display.innerHTML = `<span title="${_exprValue}" style="cursor:pointer;">⚡ ${alias}</span>`;
    display.style.display = "flex";

    document.getElementById("exprBuilderModal").style.display = "none";
    computedFieldTargetRow = null;
}

/**
 * Cancels the Expression Builder — revert select if no prior data
 */
function cancelComputedField() {
    if (computedFieldTargetRow && !computedFieldTargetRow.dataset.computed) {
        const fieldSelect = computedFieldTargetRow.querySelector(".query-field-select");
        fieldSelect.value = fieldSelect.options[0]?.value || "";
    }
    document.getElementById("exprBuilderModal").style.display = "none";
    computedFieldTargetRow = null;
}

/**
 * Edit an existing computed field (click on the display label)
 */
function editComputedField(displayEl) {
    computedFieldTargetRow = displayEl.closest("tr");
    openComputedFieldModal();
}
// ===================== End Expression Builder =====================

/**
 * Видаляє рядок з конструктора запиту
 * Параметр:
 *   button — кнопка ❌, яка викликала подію
 **/
function deleteQueryRow(button) {
    const row = button.closest("tr"); // Знайти відповідний рядок
    row.remove(); // Видалити рядок
}

/** 
 * Заповнює всі випадаючі списки таблиць у конструкторі запиту
 **/
function populateTableDropdowns() {
    const tableSelects = document.querySelectorAll(".query-table-select"); // Всі селекти таблиць
    
    tableSelects.forEach(select => {
        console.log("Заповнюється:", select.id);
        select.innerHTML = "<option value=''>" + t("querySelectTable") + "</option>"; // Початковий варіант
        database.tables.forEach(table => {
            const option = document.createElement("option");
            option.value = table.name;
            option.textContent = table.name;
            select.appendChild(option); // Додати назву таблиці
        });
    });
}

/**
 * Заповнює список таблиць у конкретному рядку конструктора запиту
 * Параметр:
 *   row — рядок, у якому потрібно заповнити список
 **/
function populateTableDropdownsForRow(row) {
    const select = row.querySelector(".query-table-select");
    select.innerHTML = "<option value=''>" + t("querySelectTable") + "</option>";
    database.tables.forEach(table => {
        const option = document.createElement("option");
        option.value = table.name;
        option.textContent = table.name;
        select.appendChild(option);
    });
}


/** 
 * Заповнює список полів таблиці на основі вибраної таблиці
 * Параметр:
 *   tableSelect — select-елемент з вибраною таблицею
 **/
function populateFieldDropdown(tableSelect) {
    const row = tableSelect.closest("tr");
    if (!row) {
        console.error("populateFieldDropdown: викликано з елемента поза <tr>", tableSelect);
        return;
    }

    const fieldSelect = row.querySelector(".query-field-select");
    const groupSelect = row.querySelector(".group-field-select");

    if (!fieldSelect || !groupSelect) {
        console.error("populateFieldDropdown: не знайдено fieldSelect або groupSelect у рядку", row);
        return;
    }

    // Далі код без змін...
    fieldSelect.innerHTML = "";
    groupSelect.innerHTML = "";
    const selectedTableName = tableSelect.value;
    if (!selectedTableName) {
        fieldSelect.disabled = true;
        return;
    }

    const selectedTable = database.tables.find(t => t.name === selectedTableName);
    if (!selectedTable) return;

    fieldSelect.disabled = false;
    groupSelect.disabled = false;

    // Додати опцію "* (всі поля)" на початок
    const starOption = document.createElement("option");
    starOption.value = "*";
    starOption.textContent = t("queryAllField");
    fieldSelect.appendChild(starOption);

    // Додати реальні поля таблиці
    selectedTable.schema.forEach(field => {
        const option = document.createElement("option");
        option.value = field.title;
        option.textContent = field.title;
        fieldSelect.appendChild(option);
    });

    // Додати опцію "Обчислення"
    const exprSep = document.createElement("option");
    exprSep.disabled = true;
    exprSep.textContent = "──────────";
    fieldSelect.appendChild(exprSep);
    const exprOption = document.createElement("option");
    exprOption.value = "__expr__";
    exprOption.textContent = "⭟" + t("computedFieldOption");
    fieldSelect.appendChild(exprOption);

    const startOption = document.createElement("option");
    startOption.value = "";
    startOption.textContent = "----";
    groupSelect.appendChild(startOption);

    selectedTable.schema.forEach(field => {
        const option = document.createElement("option");
        option.value = field.title;
        option.textContent = field.title;        
        groupSelect.appendChild(option);
    });
}



/** 
 * Повертає тип поля у вказаній таблиці
 * Параметри:
 *   tableName — назва таблиці
 *   fieldName — назва поля
 * Повертає: тип поля або порожній рядок
 */
function getFieldType(tableName, fieldName) {
    console.log("getFieldType=", database); // Діагностика
    const table = database.tables.find(t => t.name === tableName); // Знайти таблицю
    if (!table) return ""; // Якщо не знайдено — повернути ""
    const field = table.schema.find(f => f.title === fieldName); // Знайти поле
    console.log("getFieldType Field=", field); // Діагностика
    return field?.type || ""; // Повернути тип або "" якщо нема
}

//**************************************************************************
function isParameterPlaceholder(v) {
    return /^\[.*\]$/.test(v.trim());
}
    
function generateSqlQuery() {
    const queryName = document.getElementById("queryName").value.trim();
    if (queryName==="") {
		Message(t("queryNoName"));
		return
	}
    const rows = document.querySelectorAll("#queryBody tr");

    let selectFields = [];
    let groupByFields = [];
    let baseTable = null;
    const fromTableEl = document.getElementById("fromTable");
    
    if (fromTableEl && fromTableEl.value.trim() !== "") {
        baseTable = fromTableEl.value.trim();
    } else {
        baseTable = null;
    }
    let joins = [];
    let whereClauses = [];
    let orderByClauses = [];
    const queryConfig = [];

    let hasSelect = false;
    let hasAggregate = false;
    let aggregateAliasCounter = 0;

    // --- helpers ---
    const sqlQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;
    const parseList = (raw) => {
        if (!raw) return [];
        let s = raw.trim();
        if (s.startsWith("(") && s.endsWith(")")) s = s.slice(1, -1);
        return s.split(",").map(v => v.trim()).filter(v => v.length);
    };
    const isNumericLiteral = (v) => /^-?\d+(?:\.\d+)?$/.test(String(v).trim());
    const toIsoDate = (v) => {
        const s = String(v).trim();
        let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) return `${m[1]}-${m[2]}-${m[3]}`;
        m = s.match(/^(\d{2})[.\-\/](\d{2})[.\-\/](\d{4})$/);
        if (m) return `${m[3]}-${m[2]}-${m[1]}`;
        return s;
    };
    const formatLiteral = (v, fieldType) => {
        const raw = String(v).trim().replace(/^'(.*)'$/, "$1");
        if (fieldType === "Дата") return sqlQuote(toIsoDate(raw));
        if (fieldType === "Так/Ні") {
            const L = raw.toLowerCase();
            if (["так","true","1"].includes(L)) return "1";
            if (["ні","false","0"].includes(L)) return "0";
            return isNumericLiteral(raw) ? raw : sqlQuote(raw);
        }
        return isNumericLiteral(raw) ? raw : sqlQuote(raw);
    };

    rows.forEach(row => {
        const tableName = row.querySelector(".query-table-select").value;
        const fieldName = row.querySelector(".query-field-select")?.value || "";
        const groupName = row.querySelector(".group-field-select")?.value || "";
        const isVisible = row.querySelector(".query-visible-checkbox").checked;
        const sortBy = row.querySelector(".query-sort-select").value;
        const operator = row.querySelector(".query-operator-select").value.trim();
        const criteria = row.querySelector(".query-criteria-input").value.trim();
        const fieldRole = row.querySelector(".query-field-role").value;
        let alias = row.querySelector(".query-alias-input").value.trim();

        if (!tableName || (!fieldName && fieldName !== "*")) return;
        if (!baseTable && tableName !== "*") baseTable = tableName;

        // --- Computed expression ---
        let computedData = null;
        if (fieldName === "__expr__" && row.dataset.computed) {
            computedData = JSON.parse(row.dataset.computed);
        }

        let fieldExpr = fieldName === "*"
            ? `"${tableName}".*`
            : fieldName === "__expr__" ? null
            : `"${tableName}"."${fieldName}"`;

        // --- SELECT ---
        let selectExpr = "";
        if (fieldName === "__expr__" && computedData) {
            // New Expression Builder format: { expr, alias }
            // Replace [TABLE.FIELD] tokens with "TABLE"."FIELD"
            let sqlExpr = computedData.expr.replace(/\[([^\]]+)\]/g, (_, tf) => {
                const dot = tf.indexOf(".");
                if (dot === -1) return `"${tf}"`;
                const tbl = tf.slice(0, dot);
                const fld = tf.slice(dot + 1);
                return `"${tbl}"."${fld}"`;
            });
            selectExpr = `(${sqlExpr}) AS "${computedData.alias}"`;
            alias = computedData.alias;
            hasSelect = true;
        } else if (fieldName === "*") {
            selectExpr = fieldExpr;
            hasSelect = true;
        } else {
            switch (fieldRole) {
                case "count":
                case "sum":
                case "avg":
                case "min":
                case "max":
                    if (!alias) alias = `${fieldRole}_${aggregateAliasCounter++}`;
                    selectExpr = `${fieldRole.toUpperCase()}(${fieldExpr}) AS ${alias}`;
                    hasAggregate = true;
                    break;
                case "select":
                default:
                    selectExpr = alias ? `${fieldExpr} AS ${alias}` : fieldExpr;
                    hasSelect = true;
                    break;
            }
        }
        if (isVisible && selectExpr) selectFields.push(selectExpr);

        // --- GROUP BY ---
        if (groupName) {
            const expr = `"${tableName}"."${groupName}"`;
            if (!groupByFields.includes(expr)) {
                groupByFields.push(expr);
            }
        }

        // --- WHERE ---
        if (fieldName !== "*" && fieldName !== "__expr__" && operator) {
            const fieldType = getFieldType(tableName, fieldName);
            const op = operator.toUpperCase();
            if (op === "IS NULL" || op === "IS NOT NULL") {
                whereClauses.push(`${fieldExpr} ${op}`);
            } else if (op === "IN" || op === "NOT IN") {
                const items = parseList(criteria);
                const values = items.map(v => formatLiteral(v, fieldType));
                if (values.length) whereClauses.push(`${fieldExpr} ${op} (${values.join(", ")})`);
            } else if (op.includes("BETWEEN")) {
                const parts = criteria.split(/\s+AND\s+/i);
                if (parts.length === 2) {
                    const left = formatLiteral(parts[0], fieldType);
                    const right = formatLiteral(parts[1], fieldType);
                    whereClauses.push(`${fieldExpr} ${op} ${left} AND ${right}`);
                }
            } else if (criteria) {
                let right = isParameterPlaceholder(criteria)
                    ? criteria
                    : formatLiteral(criteria, fieldType);
                whereClauses.push(`${fieldExpr} ${op} ${right}`);
            }
        }

        // --- ORDER BY ---
        if (sortBy) {
            if (alias) orderByClauses.push(`${alias} ${sortBy}`);
            else if (fieldName !== "*") orderByClauses.push(`${fieldExpr} ${sortBy}`);
        }

        // --- save config row ---
        const configRow = {
            tableName, fieldName, isVisible,
            sortBy, operator, criteria,
            fieldRole, alias, groupName
        };
        if (computedData) configRow.computed = computedData;
        queryConfig.push(configRow);
    });

    // --- JOIN ---
    const joinRows = document.querySelectorAll("#joinBody tbody tr");
    joinRows.forEach(row => {
        const tableA = row.querySelector(".join-table-a").value;
        const fieldA = row.querySelector(".join-field-a").value;
        const tableB = row.querySelector(".join-table-b").value;
        const fieldB = row.querySelector(".join-field-b").value;
        if (tableA && fieldA && tableB && fieldB) {
            joins.push({
                table: tableA,
                condition: `"${tableA}"."${fieldA}" = "${tableB}"."${fieldB}"`
            });
            if (!baseTable) baseTable = tableA;
        }
    });

    if (selectFields.length === 0) {
        Message(t("queryNoVisibleFields"));
        return;
    }
    if (!baseTable) {
        if (joins.length > 0) baseTable = joins[0].table;
        else {
            Message(t("queryNoBaseTable"));
            return;
        }
    }

    // --- SQL ---
    let sql = `SELECT ${selectFields.join(", ")}\nFROM "${baseTable}"`;
    joins.forEach(join => sql += `\nJOIN "${join.table}" ON ${join.condition}`);
    if (whereClauses.length) sql += `\nWHERE ${whereClauses.join(" AND ")}`;
    if (groupByFields.length) sql += `\nGROUP BY ${groupByFields.join(", ")}`;
    if (orderByClauses.length) sql += `\nORDER BY ${orderByClauses.join(", ")}`;

    // --- save query ---
    const queryDefinition = { name: queryName, baseTable: baseTable, config: queryConfig, joins, sql };
    const existingQueryIndex = queries.definitions.findIndex(q => q.name === queryName);
    if (existingQueryIndex !== -1) queries.definitions[existingQueryIndex] = queryDefinition;
    else queries.definitions.push(queryDefinition);
    saveDatabase();
    console.log("queryConfig=",queryDefinition)
    return { sql, queryName };
}

/**
 * Зберігає сконструйований запит БЕЗ виконання
 */
function saveQueryOnly() {
    const result = generateSqlQuery();
    if (result) {
        Message(t("querySaved"));
    }
}
function viewSQL() {
    const result = generateSqlQuery();
    if (result) {
        Message(result.sql, true);
    }
}
/**
 * Зберігає сконструйований запит і одразу виконує його
 */
function saveAndRunQuery() {
    const result = generateSqlQuery();
    if (result) {
        runSqlQuery(result.sql, result.queryName);
    }
}

    let pendingQueryText = "";
    let pendingPlaceholders = [];
    let pendingQueryName = "";
    let currentPlaceholderIndex = 0;
    
    async function showNextParameterPrompt() {
        if (currentPlaceholderIndex >= pendingPlaceholders.length) {
            await runFinalSqlQuery();
            return;
        }
    
        const placeholder = pendingPlaceholders[currentPlaceholderIndex];
        document.getElementById("parameterPrompt").innerText = placeholder;
        document.getElementById("parameterInput").value = "";
        document.getElementById("parameterModal").style.display = "flex";
    }
    
    function confirmParameter() {
        const value = document.getElementById("parameterInput").value;
        const placeholder = pendingPlaceholders[currentPlaceholderIndex];
        const safeValue = `'${value.replace(/'/g, "''")}'`;
    
        pendingQueryText = pendingQueryText.replace(`[${placeholder}]`, safeValue);
        currentPlaceholderIndex++;
        document.getElementById("parameterModal").style.display = "none";
        showNextParameterPrompt();
    }
    
    function cancelParameter() {
        document.getElementById("parameterModal").style.display = "none";
        Message(t("queryCancelled"));
    }
    


/**
 * Виконати користувацький SQL-запит.
 * Якщо текст запиту змінився відносно збереженого — показує вікно підтвердження збереження.
 * Якщо збереження підтверджено — зберігає та виконує. Якщо відхилено — виконує без збереження.
 **/
async function executeOwnSQL() {
    sqlQuery = document.getElementById("ownSqlInput").value.trim();
    queryName = document.getElementById("ownSQLName").value.trim();

    if (!sqlQuery) {
        Message(t("queryEmptySQL"));
        return;
    }
    if (!queryName) {
        Message(t("queryNoName2"));
        return;
    }

    const queryChanged = sqlQuery !== (_ownSqlOriginal ?? "").trim();

    if (queryChanged) {
        const confirmed = await confirmSaveSQL();
        if (confirmed) {
            const saved = await saveOwnSQLquery();
            if (!saved) return;
            _ownSqlOriginal = sqlQuery;
        }
    }

    isOwnSQL = true;
    runSqlQuery(sqlQuery, queryName);
}

async function runSqlQuery(sqlQuery, queryName) {
    pendingQueryName = queryName;
    console.log("runSqlQuery")
    const matches = [...sqlQuery.matchAll(/\[([^\]]+)\]/g)];
    const uniquePlaceholders = [...new Set(matches.map(m => m[1]))];
    
    if (uniquePlaceholders.length > 0) {
            pendingQueryText = sqlQuery;
            pendingPlaceholders = uniquePlaceholders;
            currentPlaceholderIndex = 0;
            showNextParameterPrompt();
        } else {
            pendingQueryText = sqlQuery;
            await runFinalSqlQuery();
        }
    }

async function updateDatabaseTables() {
    // Очистимо список, щоб не дублювати
    database.tables = [];

    const res = await dba.db.exec("SELECT name, sql FROM sqlite_master WHERE type='table';");
    if (res.length > 0) {
        const tableRows = res[0].values;
        for (const [name] of tableRows) {
            if (name.startsWith("sqlite_")) continue;

            const pragmaRes = await dba.db.exec(`PRAGMA table_info("${name}")`);
            if (!pragmaRes.length) continue;

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
                        : type,
                    primaryKey: pk > 0,
                    comment: pk > 0 ? "Первинний ключ" : "",
                    foreignKey: !!fk,
                    refTable: fk ? fk.refTable : null,
                    refField: fk ? fk.toCol : null
                };
            });

            // Зчитуємо дані
            const selectRes = await dba.db.exec(`SELECT * FROM "${name}"`);
            const dataRows = selectRes.length ? selectRes[0].values : [];

            database.tables.push({
                name: name,
                schema: schema,
                data: dataRows
            });
        }
    }
}

async function runFinalSqlQuery() {
    const internalQueryName = `запит "${pendingQueryName}"`;
    const menuDisplayName = `*${internalQueryName}`;

    try {
        const isAggregateQuery = /\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(pendingQueryText);
        const res = await dba.db.exec(pendingQueryText); 
        
        if (isOwnSQL) { // оновимо про всяк випадок таблиці та їх структури якщо запит "вручну"
                    await updateDatabaseTables();                    
        }
        
        if (res.length > 0) {
            const columns = res[0].columns;
            const dataRows = res[0].values;

            const schema = columns.map(col => ({
                title: col,
                type: "Текст",
                primaryKey: false,
                comment: ""
            }));

            const queryResultTable = {
                name: internalQueryName,
                schema: schema,
                data: dataRows
            };

            const existingIndex = queries.results.findIndex(t => t.name === internalQueryName);
            if (existingIndex !== -1) {
                queries.results[existingIndex] = queryResultTable;
                const dataMenu = document.getElementById("data-menu");
                const existingItem = Array.from(dataMenu.children).find(item => item.textContent === menuDisplayName);
                if (existingItem) existingItem.remove();
            } else {
                queries.results.push(queryResultTable);
            }
            
            addTableToMenu(menuDisplayName);

            closeOwnSqlModal();
            editData(menuDisplayName);
        } else {
			if (isOwnSQL) {
				Message(t("queryDone"));
			} else {	
				Message(t("queryEmptyResult"));
			}
        }
        isOwnSQL = false;
        updateQuickAccessPanel(
                  getCurrentTableNames(),
                  getCurrentQueryNames(),
                  getCurrentReportNames(),
                  getCurrentFormNames()
                );  
    } catch (e) {
        Message(t("queryRunError", e.message));
    }
    

}

/**
 * Перевиконує всі запити, результати яких використовуються в переданих елементах
 * форми або звіту (поля типу "field" та "table" з посиланням на результат запиту).
 * Викликається перед рендерингом форм/звітів, щоб дані були актуальними.
 *
 * @param {Array} elements — масив елементів форми/звіту (як у previewForm / previewReport)
 */
async function refreshQueriesUsedInElements(elements) {
    if (!Array.isArray(elements)) return;

    // Збираємо унікальні внутрішні імена запитів вигляду `запит "queryName"`
    const querySourceNames = new Set();

    elements.forEach(el => {
        if (!el) return;
        if (el.type !== "field" && el.type !== "table") return;
        const sourceName = el.tableName || null;
        if (!sourceName) return;

        // Варіант 1: ім'я вже у форматі `запит "..."` (збережене в елементі)
        if (/^запит ".+"$/.test(sourceName)) {
            querySourceNames.add(sourceName);
            return;
        }

        // Варіант 2: ім'я з префіксом `*запит "..."` (з меню даних)
        if (/^\*запит ".+"$/.test(sourceName)) {
            querySourceNames.add(sourceName.substring(1));
            return;
        }

        // Варіант 3: перевіряємо через findTableOrQueryResult (результат вже є)
        if (typeof findTableOrQueryResult === "function") {
            const res = findTableOrQueryResult(sourceName);
            if (res && res.isQuery === true && res.table?.name) {
                querySourceNames.add(res.table.name);
                return;
            }
        }

        // Варіант 4: ім'я збігається з назвою визначення запиту напряму
        const directDef = (queries.definitions || []).find(q => q.name === sourceName);
        if (directDef) {
            querySourceNames.add(`запит "${sourceName}"`);
        }
    });

    if (querySourceNames.size === 0) return;

    for (const internalName of querySourceNames) {
        // internalName має вигляд: `запит "queryName"`
        const match = internalName.match(/^запит "(.+)"$/);
        if (!match) continue;
        const queryName = match[1];

        const queryDef = (queries.definitions || []).find(q => q.name === queryName);
        if (!queryDef || !queryDef.sql) continue;

        // Пропускаємо запити з незаповненими параметрами
        const hasPlaceholders = /\[[^\]]+\]/.test(queryDef.sql);
        if (hasPlaceholders) continue;

        // Виконуємо запит і зберігаємо/оновлюємо результат
        try {
            const res = await dba.db.exec(queryDef.sql);
            if (res.length > 0) {
                const schema = res[0].columns.map(col => ({
                    title: col,
                    type: "Текст",
                    primaryKey: false,
                    comment: ""
                }));
                const queryResultTable = {
                    name: internalName,
                    schema: schema,
                    data: res[0].values
                };
                const existingIndex = queries.results.findIndex(r => r.name === internalName);
                if (existingIndex !== -1) {
                    queries.results[existingIndex] = queryResultTable;
                } else {
                    queries.results.push(queryResultTable);
                }
            }
        } catch (e) {
            console.warn(`[refreshQueriesUsedInElements] Помилка виконання запиту "${queryName}":`, e.message);
        }
    }
}

// Functions for managing saved queries
function showSavedQueriesDialog() {
        const listEl = document.getElementById("savedQueriesList");
        listEl.innerHTML = "";
        selectedQueryName = null;

        queries.definitions.forEach(query => {
            const li = document.createElement("li");
            li.style.padding = "8px";
            li.style.cursor = "pointer";
            li.dataset.queryName = query.name;
            if (typeof isLocked === "function" && isLocked("query", query.name)) {
                li.title = typeof t === "function" ? t("lockLockedHint") : "Заблоковано";
                li.innerHTML = "<span style='margin-right:4px'>&#128274;</span>" + query.name;
            } else {
                li.textContent = query.name;
            }
            li.addEventListener("click", () => {
                [...listEl.children].forEach(el => el.style.background = "");
                const isDark = document.body.classList.contains("dark-theme");
                li.style.background = isDark ? "#242d43" : "#d0e0ff";
                selectedQueryName = li.dataset.queryName;
            });
            listEl.appendChild(li);
        });
        document.getElementById("savedQueriesModal").style.display = "flex";
}

function closeSavedQueriesDialog() {
        document.getElementById("savedQueriesModal").style.display = "none";
        selectedQueryName = null;
}
    
function editSelectedQuery() {
	   
        if (!selectedQueryName) {
            Message(t("querySelectForEdit"));
            return;
        }

        // Заблокований запит — виконати (конструктор) або read-only (власний SQL)
        if (typeof isLocked === "function" && isLocked("query", selectedQueryName)) {

            const queryDef = queries.definitions.find(q => q.name === selectedQueryName);
            if (!queryDef) { Message(t("queryNotFound")); return; }
            closeSavedQueriesDialog(); // executeSelectedQuery()
            if (queryDef.config === null && queryDef.joins === null) {
                openOwnQueryReadOnly(queryDef);
            } else {
                runSqlQuery(queryDef.sql, queryDef.name);
            }
            return;
        }

        const queryToEdit = queries.definitions.find(q => q.name === selectedQueryName);
       
        if (queryToEdit) {
            if (queryToEdit.config === null && queryToEdit.joins === null) {
                // Власний SQL-запит
                editOwnQuery(queryToEdit);
            } else {
                populateQueryModal(queryToEdit);
                // Згенерований консруктором запит
            }
            closeSavedQueriesDialog();
        } else {
            Message(t("queryNotFound"));
        }
}
    
function executeSelectedQuery() {
        if (!selectedQueryName) {
            Message(t("querySelectForRun"));
            return;
        }
    
        const queryDef = queries.definitions.find(q => q.name === selectedQueryName);
        if (!queryDef) {
            Message(t("queryNotFound"));
            return;
        }
    
        closeSavedQueriesDialog();
        runSqlQuery(queryDef.sql, queryDef.name);
}
function onFromTableChange() {
    const tableName = document.getElementById("fromTable").value;
    if (tableName) {
        // Очистити поточні рядки
        document.getElementById("queryBody").innerHTML = "";
        // Додати новий рядок
        addQueryRow();
        // Встановити таблицю в цьому рядку
        const newRow = document.querySelector("#queryBody tr");
        if (newRow) {
            const tableSelect = newRow.querySelector(".query-table-select");
            tableSelect.value = tableName;
            populateFieldDropdown(tableSelect); // тепер це безпечно!
        }
    }
}
function populateQueryModal(queryDefinition) {
    document.getElementById("queryName").value = queryDefinition.name;
    const queryBody = document.getElementById("queryBody");
    queryBody.innerHTML = ""; // Очистити рядки полів
    document.getElementById("joinBody").querySelector("tbody").innerHTML = ""; // Очистити зв’язки
    toggleStructureButtonVisibility(true);
    resetNonReadonlyRelations(); 
    // Відновлення рядків полів
    queryDefinition.config.forEach(item => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td><select class="query-table-select" onchange="populateFieldDropdown(this)"></select></td>
            <td><select class="query-field-select" onchange="onFieldSelectChange(this)"></select><div class="computed-expr-display" style="display:none; margin-top:4px; font-size:12px; color:#555; cursor:pointer;" onclick="editComputedField(this)"></div></td>
            <td><input type="checkbox" checked class="query-visible-checkbox"></td>
            <td>
                <select class="query-sort-select">
                    <option value="">${t("sortNone")}</option>
                    <option value="ASC">${t("sortAsc")}</option>
                    <option value="DESC">${t("sortDesc")}</option>
                </select>
            </td>
            <td>
                <div style="display: flex; gap: 4px; align-items: center;">
                <select class="query-operator-select" style="width: 60px;">
                    <option ${t("opEqual") ? `title="${t("opEqual")}"` : ""} value="==">==</option>
                    <option ${t("opLess") ? `title="${t("opLess")}"` : ""} value="<">&lt;</option>
                    <option ${t("opLessEq") ? `title="${t("opLessEq")}"` : ""} value="<=">&lt;=</option>
                    <option ${t("opGreater") ? `title="${t("opGreater")}"` : ""} value=">">&gt;</option>
                    <option ${t("opGreaterEq") ? `title="${t("opGreaterEq")}"` : ""} value=">=">&gt;=</option>
                    <option ${t("opNotEq") ? `title="${t("opNotEq")}"` : ""} value="!=">!=</option>
                    <option ${t("opLike") ? `title="${t("opLike")}"` : ""} value="LIKE">LIKE</option>
                    <option ${t("opIn") ? `title="${t("opIn")}"` : ""} value="IN">IN</option>
                    <option ${t("opNotIn") ? `title="${t("opNotIn")}"` : ""} value="NOT IN">NOT IN</option>
                    <option ${t("opBetween") ? `title="${t("opBetween")}"` : ""} value="BETWEEN">BETWEEN</option>
                    <option ${t("opNotBetween") ? `title="${t("opNotBetween")}"` : ""} value="NOT BETWEEN">NOT BETWEEN</option>
                </select>
                    <input type="text" class="query-criteria-input" style="flex: 1;">
                </div>
            </td>
            <td>
                <select class="query-field-role" ${`title="${t("roleParticipation")}"`} onchange="toggleAliasInput(this)">
                    <option value="select">----</option>                    
                    <option ${`title="${t("roleCount")}"`} value="count">COUNT</option>
                    <option ${`title="${t("roleSum")}"`} value="sum">SUM</option>
                    <option ${`title="${t("roleAvg")}"`} value="avg">AVG</option>
                    <option ${`title="${t("roleMin")}"`} value="min">MIN</option>
                    <option ${`title="${t("roleMax")}"`} value="max">MAX</option>
                </select>
                <input type="text" class="query-alias-input" ${`placeholder="${t("queryAliasFull")}"`} style="margin-top:4px; display:none; width:100%;">
            </td>
            <td><select class="group-field-select"></select></td>
            <td><button onclick="deleteQueryRow(this)"><span class="ui-icon">❌</span></button></td>
        `;
        queryBody.appendChild(row);

        // Заповнити випадаючі списки
        populateTableDropdownsForRow(row);
        row.querySelector(".query-table-select").value = item.tableName;
        populateFieldDropdown(row.querySelector(".query-table-select"));
        row.querySelector(".query-field-select").value = item.fieldName;
        row.querySelector(".group-field-select").value = item.groupName;
        row.querySelector(".query-visible-checkbox").checked = item.isVisible;
        row.querySelector(".query-sort-select").value = item.sortBy;

        // Restore computed field if present
        if (item.fieldName === "__expr__" && item.computed) {
            const c = item.computed;
            let exprStr, aliasStr;
            if (c.expr !== undefined) {
                // New format
                exprStr = c.expr;
                aliasStr = c.alias;
            } else {
                // Legacy format — migrate to new
                const leftLabel = `${c.leftTable}.${c.leftField}`;
                const rightLabel = c.rightType === "field" ? `${c.rightTable}.${c.rightField}` : c.rightField;
                exprStr = `[${leftLabel}]${c.operator}${c.rightType === "field" ? `[${rightLabel}]` : c.rightField}`;
                aliasStr = c.alias;
            }
            row.dataset.computed = JSON.stringify({ expr: exprStr, alias: aliasStr });
            const display = row.querySelector(".computed-expr-display");
            display.innerHTML = `<span title="${exprStr}" style="text-decoration:underline dotted;cursor:pointer;">⚡ ${aliasStr}</span>`;
            display.style.display = "block";
        }

        const operatorSelect = row.querySelector(".query-operator-select");
        const criteriaInput = row.querySelector(".query-criteria-input");

        // Встановлюємо оператор і критерій

        operatorSelect.value = item.operator;
        criteriaInput.value = item.criteria;

        // Встановлюємо роль поля (важливо!)
        const roleSelect = row.querySelector(".query-field-role");
        roleSelect.value = item.fieldRole || "select";

        // Встановлюємо псевдонім, якщо він був
        const aliasInput = row.querySelector(".query-alias-input");
        if (item.alias) {
            aliasInput.value = item.alias;
        }

        // Оновлюємо видимість інпуту псевдоніма
        toggleAliasInput(roleSelect);
        
        
    });

    // Відновлення JOIN-зв’язків
    if (queryDefinition.joins && queryDefinition.joins.length > 0) {
        const joinTable = document.getElementById("joinBody");
        const tbody = joinTable.querySelector("tbody");
        joinTable.style.display = "table";

        queryDefinition.joins.forEach(join => {
            const match = join.condition.match(/"([^"]+)"\."([^"]+)" = "([^"]+)"\."([^"]+)"/);
            if (!match) return;

            const [, tableA, fieldA, tableB, fieldB] = match;

            const row = document.createElement("tr");
            row.innerHTML = `
                <td><select class="join-table-a" onchange="populateJoinFields(this, true)"></select></td>
                <td><select class="join-field-a"></select></td>
                <td><select class="join-table-b" onchange="populateJoinFields(this, false)"></select></td>
                <td><select class="join-field-b"></select></td>
                <td><button onclick="this.closest('tr').remove()"><span class="ui-icon">❌</span></button></td>
            `;
            tbody.appendChild(row);

            const tableSelectA = row.querySelector(".join-table-a");
            const tableSelectB = row.querySelector(".join-table-b");
            const fieldSelectA = row.querySelector(".join-field-a");
            const fieldSelectB = row.querySelector(".join-field-b");

            [tableSelectA, tableSelectB].forEach(select => {
                select.innerHTML = "<option value=''>" + t("querySelectTable") + "</option>";
                database.tables.forEach(t => {
                    const opt = document.createElement("option");
                    opt.value = t.name;
                    opt.textContent = t.name;
                    select.appendChild(opt);
                });
            });

            tableSelectA.value = tableA;
            tableSelectB.value = tableB;

            populateJoinFields(tableSelectA, true);
            populateJoinFields(tableSelectB, false);

            fieldSelectA.value = fieldA;
            fieldSelectB.value = fieldB;
        });
    }

    // Відновлення базової таблиці (FROM)
    const fromTableSelect = document.getElementById("fromTable");
    if (fromTableSelect) {
        // Спочатку очистити і заповнити варіанти
        fromTableSelect.innerHTML = "<option value=''>" + t("querySelectTable") + "</option>";
        database.tables.forEach(t => {
            const opt = document.createElement("option");
            opt.value = t.name;
            opt.textContent = t.name;
            fromTableSelect.appendChild(opt);
        });
    
        // Встановити значення, якщо воно є
        fromTableSelect.value = queryDefinition.baseTable || "";
    }
    document.getElementById("queryModal").style.display = "flex";
}

function deleteSelectedQuery() {
        if (!selectedQueryName) {
            Message(t("querySelectForDelete"));
            return;
        }
        if (typeof isLocked === "function" && isLocked("query", selectedQueryName)) {
            Message(typeof t === "function" ? t("lockObjectLocked", selectedQueryName) : `"${selectedQueryName}" заблоковано.`);
            return;
        }
        const queryIndex = queries.definitions.findIndex(q => q.name === selectedQueryName);
        if (queryIndex !== -1) {
            const deletedQueryName = queries.definitions[queryIndex].name;
            queries.definitions.splice(queryIndex, 1); // Remove from definitions
            saveDatabase(); // Save updated definitions

            // Also remove any corresponding query results from `queries.results` and from the `data-menu`
            const menuDisplayName = `*запит "${deletedQueryName}"`; // Construct the display name for the result
            const resultIndex = queries.results.findIndex(r => r.name === `запит "${deletedQueryName}"`); // Find the result by its internal name
            if (resultIndex !== -1) {
                queries.results.splice(resultIndex, 1); // Remove from results
            }

            const dataMenu = document.getElementById("data-menu");
            const existingMenuItem = Array.from(dataMenu.children).find(item => item.textContent === menuDisplayName);
            if (existingMenuItem) {
                existingMenuItem.remove(); // Remove from menu
            }

            Message(t("queryDeleted", deletedQueryName));
            showSavedQueriesDialog(); // Refresh the list
        } else {
            Message(t("queryNotFound"));
        }
    }

function addJoinRow() {
        const joinTable = document.getElementById("joinBody");
        const tbody = joinTable.querySelector("tbody");

        joinTable.style.display = "table"; // Показує таблицю, якщо прихована

        const row = document.createElement("tr");
        row.innerHTML = `
            <td><select class="join-table-a" onchange="populateJoinFields(this, true)"></select></td>
            <td><select class="join-field-a"></select></td>
            <td><select class="join-table-b" onchange="populateJoinFields(this, false)"></select></td>
            <td><select class="join-field-b"></select></td>
                <td><button onclick="this.closest('tr').remove()"><span class="ui-icon">❌</span></button></td>
        `;
        tbody.appendChild(row);

        const selects = row.querySelectorAll("select");
        selects.forEach(select => {
            if (select.classList.contains("join-table-a") || select.classList.contains("join-table-b")) {
                select.innerHTML = "<option value=''>" + t("querySelectTable") + "</option>";
                database.tables.forEach(t => {
                    const opt = document.createElement("option");
                    opt.value = t.name;
                    opt.textContent = t.name;
                    select.appendChild(opt);
                });
            }
        });
    }

function populateJoinFields(tableSelect, isLeft) {
        const row = tableSelect.closest("tr");
        const fieldSelect = isLeft ? row.querySelector(".join-field-a") : row.querySelector(".join-field-b");
        fieldSelect.innerHTML = "";

        const table = database.tables.find(t => t.name === tableSelect.value);
        if (table) {
            table.schema.forEach(field => {
                const opt = document.createElement("option");
                opt.value = field.title;
                opt.textContent = field.title;
                fieldSelect.appendChild(opt);
            });
        }
    }

function openRelationFromQuery() {
        const joinRows = document.querySelectorAll("#joinBody tbody tr");
        database.relations = [];

        joinRows.forEach(row => {
            const tableA = row.querySelector(".join-table-a")?.value;
            const fieldA = row.querySelector(".join-field-a")?.value;
            const tableB = row.querySelector(".join-table-b")?.value;
            const fieldB = row.querySelector(".join-field-b")?.value;

            if (tableA && fieldA && tableB && fieldB) {
                database.relations.push({
                    fromTable: tableA,
                    fromField: fieldA,
                    toTable: tableB,
                    toField: fieldB
                });
            }
        });

        //saveDatabase();
        openRelationDesigner(() => {
            // callback після закриття конструктора — синхронізуємо з JOIN
            loadRelationsToJoinTable();
        });
}

// Ручне створення SQL-запиту
// Відкриває модальне вікно для ручного введення та виконання SQL-запитів.

/** Зберігає оригінальний SQL на момент відкриття модалки (для порівняння перед виконанням) **/
let _ownSqlOriginal = null;

function createOwnSQL() {
		if(!isDBExist()) return
        document.getElementById("ownSqlInput").value = "";
        document.getElementById("ownSqlResults").innerHTML = "";
        document.getElementById("ownSqlModal").style.display = "flex";
        document.getElementById('ownSQLName').value = t("queryNewQuery");
        _ownSqlOriginal = "";
        toggleStructureButtonVisibility(true);
        // Ініціалізація редактора: підсвічування, автодоповнення, фокус
        setTimeout(function () {
            window._sqlInitHighlighter  && window._sqlInitHighlighter();
            window.refreshSQLHighlight  && window.refreshSQLHighlight();
            window._sqlInitAutocomplete && window._sqlInitAutocomplete();
            window._sqlFocusEditor      && window._sqlFocusEditor();
        }, 0);
    }
    
function editOwnQuery(query) {
        const modal = document.getElementById("ownSqlModal");
        if (modal) { modal.style.display = "flex"; delete modal.dataset.lockReadOnly; }
        toggleStructureButtonVisibility(true)

        const nameInput = document.getElementById("ownSQLName");
        if (nameInput) { nameInput.value = query.name || ""; nameInput.readOnly = false; nameInput.style.opacity = ""; }

        const sqlTextarea = document.getElementById("ownSqlInput");
        if (sqlTextarea) { sqlTextarea.value = query.sql || ""; sqlTextarea.readOnly = false; sqlTextarea.style.opacity = ""; }
        _ownSqlOriginal = query.sql || "";

        const saveBtn = document.getElementById("saveOwnSQLBtn");
        if (saveBtn) saveBtn.style.display = "";
        const banner = document.getElementById("ownSqlReadOnlyBanner");
        if (banner) banner.style.display = "none";

        document.getElementById("ownSqlResults").innerHTML = "";
        // Ініціалізація редактора: підсвічування, автодоповнення, фокус
        setTimeout(function () {
            window._sqlInitHighlighter  && window._sqlInitHighlighter();
            window.refreshSQLHighlight  && window.refreshSQLHighlight();
            window._sqlInitAutocomplete && window._sqlInitAutocomplete();
            window._sqlFocusEditor      && window._sqlFocusEditor();
        }, 0);
}

function openOwnQueryReadOnly(query) {
    const modal = document.getElementById("ownSqlModal");
    if (modal) { modal.style.display = "flex"; modal.dataset.lockReadOnly = "1"; }
    toggleStructureButtonVisibility(true);

    const nameInput = document.getElementById("ownSQLName");
    if (nameInput) { nameInput.value = query.name || ""; nameInput.readOnly = true; nameInput.style.opacity = "0.7"; }

    const sqlTextarea = document.getElementById("ownSqlInput");
    if (sqlTextarea) { sqlTextarea.value = query.sql || ""; sqlTextarea.readOnly = true; sqlTextarea.style.opacity = "0.7"; }
    _ownSqlOriginal = query.sql || "";

    const saveBtn = document.getElementById("saveOwnSQLBtn");
    if (saveBtn) saveBtn.style.display = "none";

    let banner = document.getElementById("ownSqlReadOnlyBanner");
    if (!banner) {
        banner = document.createElement("div");
        banner.id = "ownSqlReadOnlyBanner";
        banner.style.cssText = "background:var(--warning-bg,#fff8e1);border:1px solid var(--warning-border,#ffe082);color:var(--warning-text,#7a5800);padding:6px 12px;border-radius:5px;font-size:13px;margin-bottom:8px;display:flex;align-items:center;gap:6px";
        const resultsEl = document.getElementById("ownSqlResults");
        if (resultsEl) resultsEl.parentNode.insertBefore(banner, resultsEl);
    }
    banner.innerHTML = "&#128274; " + (
        (typeof t === "function" && t("lockReadOnlyQuery") !== "lockReadOnlyQuery")
            ? t("lockReadOnlyQuery")
            : "Запит заблоковано — редагування недоступне."
    );
    banner.style.display = "flex";

    document.getElementById("ownSqlResults").innerHTML = "";
    setTimeout(function () {
        window._sqlInitHighlighter  && window._sqlInitHighlighter();
        window.refreshSQLHighlight  && window.refreshSQLHighlight();
    }, 0);
}
async function confirmSaveSQL() {
    // Отримуємо модальне вікно
    const modal = document.getElementById('confirmQuerySaveModal');
    if (!modal) {
        console.error('Модальне вікно confirmQuerySaveModal не знайдено');
        return false;
    }
    
    // Отримуємо кнопки
    const confirmBtn = document.getElementById('confirmSaveSQLBtn');
    const closeBtn = document.getElementById('confirmSaveSQLCloseBtn');
    
    if (!confirmBtn || !closeBtn) {
        console.error('Кнопки не знайдені');
        return false;
    }
    
    // Показуємо модальне вікно
    modal.style.display = 'flex';
    
    // Створюємо Promise, щоб чекати натискання кнопки
    return new Promise((resolve) => {
        // Функція для закриття модального вікна
        const closeModal = () => {
            modal.style.display = 'none';
            // Видаляємо обробники подій після закриття
            confirmBtn.removeEventListener('click', onConfirm);
            closeBtn.removeEventListener('click', onClose);
        };
        
        // Обробник для кнопки підтвердження
        const onConfirm = () => {
            closeModal();
            resolve(true);
        };
        
        // Обробник для кнопки закриття
        const onClose = () => {
            closeModal();
            resolve(false);
        };
        
        // Додаємо обробники подій
        confirmBtn.addEventListener('click', onConfirm);
        closeBtn.addEventListener('click', onClose);
        
        // Опціонально: закриття при кліку на оверлей
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                onClose();
            }
        });
    });
}       
    
function saveOwnSQLquery() {
        const sql = document.getElementById("ownSqlInput").value.trim();
        const name = document.getElementById("ownSQLName")?.value.trim();
    
        if (!sql) {
            Message(t("queryEmptySQL"));
            return false;
        }
    
        if (!name) {
            Message(t("queryNoName2"));
            return false;
        }
    
        // Формуємо об'єкт запиту
        const query = {
            name: name,
            sql: sql,
            config: null,
            joins: null
        };
    
        // Шукаємо, чи існує вже такий запит
        const existingIndex = queries.definitions.findIndex(q => q.name === name);
    
        if (existingIndex !== -1) {
            queries.definitions[existingIndex] = query;
        } else {
            queries.definitions.push(query);
        }
    
        saveDatabase();
        return true;
}


function saveOwnSQL() {
        if (saveOwnSQLquery()) {
            Message(t("querySaved"));
        }    
}


// ===================== SQL Syntax Highlighter =====================
// Підсвічування синтаксису для власноруч написаного SQL-запиту.
// Підтримує світлу і темну теми автоматично через CSS prefers-color-scheme
// та через клас .dark-theme на <body> або <html>.

(function () {

    // --- CSS стилі для підсвічування ---
    const SQL_HL_STYLES = `
    #ownSqlEditorWrap {
        position: relative;
        width: 100%;
        box-sizing: border-box;
        border-radius: 4px;
        overflow: hidden;
    }
    #ownSqlHighlight {
        position: absolute;
        top: 0; left: 0;
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 8px;
        box-sizing: border-box;
        font-family: 'Consolas', 'Courier New', monospace;
        font-size: 14px;
        line-height: 1.5;
        white-space: pre-wrap;
        word-wrap: break-word;
        overflow: hidden;
        pointer-events: none;
        border: 1px solid transparent;
        border-radius: 4px;
        background: transparent;
        z-index: 1;
    }
    #ownSqlInput {
        position: relative !important;
        z-index: 2;
        caret-color: var(--sql-caret, #333);
        font-family: 'Consolas', 'Courier New', monospace !important;
        font-size: 14px !important;
        line-height: 1.5 !important;
        padding: 8px !important;
        box-sizing: border-box;
        resize: vertical;
        width: 100%;
        min-height: 120px;
        background: transparent !important;
        color: transparent !important;
        white-space: pre-wrap;
        word-wrap: break-word;
    }

    /* ---- LIGHT THEME ---- */
    #ownSqlEditorWrap {
        background: #f8f9fa;
        border: 1px solid #ccc;
    }
    body:not(.dark-theme) #ownSqlInput,
    html:not([data-theme="dark"]) #ownSqlInput {
        --sql-caret: #1a1a2e;
    }
    body:not(.dark-theme) .sql-hl-keyword,
    html:not([data-theme="dark"]) .sql-hl-keyword   { color: #0000cd; font-weight: bold; }
    body:not(.dark-theme) .sql-hl-function,
    html:not([data-theme="dark"]) .sql-hl-function  { color: #7b00b4; font-weight: bold; }
    body:not(.dark-theme) .sql-hl-string,
    html:not([data-theme="dark"]) .sql-hl-string    { color: #008000; }
    body:not(.dark-theme) .sql-hl-number,
    html:not([data-theme="dark"]) .sql-hl-number    { color: #c75000; }
    body:not(.dark-theme) .sql-hl-operator,
    html:not([data-theme="dark"]) .sql-hl-operator  { color: #555; }
    body:not(.dark-theme) .sql-hl-comment,
    html:not([data-theme="dark"]) .sql-hl-comment   { color: #6a737d; font-style: italic; }
    body:not(.dark-theme) .sql-hl-paren,
    html:not([data-theme="dark"]) .sql-hl-paren     { color: #333; font-weight: bold; }
    body:not(.dark-theme) .sql-hl-plain,
    html:not([data-theme="dark"]) .sql-hl-plain     { color: #1a1a2e; }

    /* ---- DARK THEME (клас .dark-theme на body або data-theme="dark" на html) ---- */
    body.dark-theme #ownSqlEditorWrap,
    html[data-theme="dark"] #ownSqlEditorWrap {
        background: #1e1e2e;
        border: 1px solid #444;
    }
    body.dark-theme #ownSqlInput,
    html[data-theme="dark"] #ownSqlInput       { --sql-caret: #cdd6f4; }
    body.dark-theme .sql-hl-keyword,
    html[data-theme="dark"] .sql-hl-keyword    { color: #89b4fa; font-weight: bold; }
    body.dark-theme .sql-hl-function,
    html[data-theme="dark"] .sql-hl-function   { color: #cba6f7; font-weight: bold; }
    body.dark-theme .sql-hl-string,
    html[data-theme="dark"] .sql-hl-string     { color: #a6e3a1; }
    body.dark-theme .sql-hl-number,
    html[data-theme="dark"] .sql-hl-number     { color: #fab387; }
    body.dark-theme .sql-hl-operator,
    html[data-theme="dark"] .sql-hl-operator   { color: #89dceb; }
    body.dark-theme .sql-hl-comment,
    html[data-theme="dark"] .sql-hl-comment    { color: #6c7086; font-style: italic; }
    body.dark-theme .sql-hl-paren,
    html[data-theme="dark"] .sql-hl-paren      { color: #f5c2e7; font-weight: bold; }
    body.dark-theme .sql-hl-plain,
    html[data-theme="dark"] .sql-hl-plain      { color: #cdd6f4; }

    /* ---- FALLBACK: system prefers-color-scheme (якщо класи не використовуються) ---- */
    @media (prefers-color-scheme: dark) {
        body:not(.dark-theme):not(.light-theme) #ownSqlEditorWrap,
        html:not([data-theme]) #ownSqlEditorWrap {
            background: #1e1e2e;
            border-color: #444;
        }
        body:not(.dark-theme):not(.light-theme) #ownSqlInput,
        html:not([data-theme]) #ownSqlInput        { --sql-caret: #cdd6f4; }
        body:not(.dark-theme):not(.light-theme) .sql-hl-keyword,
        html:not([data-theme]) .sql-hl-keyword    { color: #89b4fa; font-weight: bold; }
        body:not(.dark-theme):not(.light-theme) .sql-hl-function,
        html:not([data-theme]) .sql-hl-function   { color: #cba6f7; font-weight: bold; }
        body:not(.dark-theme):not(.light-theme) .sql-hl-string,
        html:not([data-theme]) .sql-hl-string     { color: #a6e3a1; }
        body:not(.dark-theme):not(.light-theme) .sql-hl-number,
        html:not([data-theme]) .sql-hl-number     { color: #fab387; }
        body:not(.dark-theme):not(.light-theme) .sql-hl-operator,
        html:not([data-theme]) .sql-hl-operator   { color: #89dceb; }
        body:not(.dark-theme):not(.light-theme) .sql-hl-comment,
        html:not([data-theme]) .sql-hl-comment    { color: #6c7086; font-style: italic; }
        body:not(.dark-theme):not(.light-theme) .sql-hl-paren,
        html:not([data-theme]) .sql-hl-paren      { color: #f5c2e7; font-weight: bold; }
        body:not(.dark-theme):not(.light-theme) .sql-hl-plain,
        html:not([data-theme]) .sql-hl-plain      { color: #cdd6f4; }
    }
    `;

    // SQL-ключові слова
    const SQL_KEYWORDS = new Set([
        "SELECT","FROM","WHERE","AND","OR","NOT","IN","BETWEEN","LIKE","IS","NULL",
        "INSERT","INTO","VALUES","UPDATE","SET","DELETE","CREATE","TABLE","DROP",
        "ALTER","ADD","COLUMN","INDEX","JOIN","LEFT","RIGHT","INNER","OUTER","FULL",
        "CROSS","ON","AS","GROUP","BY","ORDER","HAVING","LIMIT","OFFSET","UNION",
        "ALL","DISTINCT","EXISTS","CASE","WHEN","THEN","ELSE","END","WITH","RECURSIVE",
        "PRIMARY","KEY","FOREIGN","REFERENCES","UNIQUE","DEFAULT","CHECK",
        "CONSTRAINT","BEGIN","COMMIT","ROLLBACK","TRANSACTION","VIEW","TRIGGER",
        "PROCEDURE","FUNCTION","RETURNS","RETURN","DECLARE","IF","ASC","DESC",
        "TOP","ROWNUM","FETCH","NEXT","ROWS","ONLY","OVER","PARTITION","WINDOW"
    ]);

    // SQL-функції
    const SQL_FUNCTIONS = new Set([
        "COUNT","SUM","AVG","MIN","MAX","COALESCE","NULLIF","IFNULL","IIF","NVL",
        "UPPER","LOWER","TRIM","LTRIM","RTRIM","LENGTH","LEN","SUBSTR","SUBSTRING",
        "REPLACE","INSTR","CONCAT","CAST","CONVERT","TYPEOF","ROUND","ABS","CEIL",
        "CEILING","FLOOR","MOD","RANDOM","RAND","DATE","TIME","DATETIME","STRFTIME",
        "JULIANDAY","NOW","CURRENT_DATE","CURRENT_TIME","CURRENT_TIMESTAMP",
        "PRINTF","FORMAT","CHAR","HEX","QUOTE","UNICODE","GLOB","MATCH",
        "ROW_NUMBER","RANK","DENSE_RANK","NTILE","LAG","LEAD","FIRST_VALUE","LAST_VALUE",
        "STRING_AGG","GROUP_CONCAT","LISTAGG","YEAR","MONTH","DAY","HOUR","MINUTE","SECOND",
        "DATEADD","DATEDIFF","GETDATE","SYSDATE","TO_DATE","TO_CHAR","ISNULL","SIGN"
    ]);

    /**
     * Розбиває SQL на токени та повертає HTML зі span-класами підсвічування.
     */
    function tokenizeSQL(sql) {
        let result = "";
        let i = 0;
        const len = sql.length;

        // Екранування HTML-символів
        const esc = (s) => s
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        while (i < len) {
            // Однорядковий коментар --
            if (sql[i] === "-" && sql[i + 1] === "-") {
                let j = i + 2;
                while (j < len && sql[j] !== "\n") j++;
                result += `<span class="sql-hl-comment">${esc(sql.slice(i, j))}</span>`;
                i = j;
                continue;
            }
            // Блоковий коментар /* */
            if (sql[i] === "/" && sql[i + 1] === "*") {
                let j = i + 2;
                while (j < len && !(sql[j] === "*" && sql[j + 1] === "/")) j++;
                j = Math.min(j + 2, len);
                result += `<span class="sql-hl-comment">${esc(sql.slice(i, j))}</span>`;
                i = j;
                continue;
            }
            // Рядковий літерал в одинарних лапках
            if (sql[i] === "'") {
                let j = i + 1;
                while (j < len) {
                    if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
                    if (sql[j] === "'") { j++; break; }
                    j++;
                }
                result += `<span class="sql-hl-string">${esc(sql.slice(i, j))}</span>`;
                i = j;
                continue;
            }
            // Ідентифікатор у подвійних лапках
            if (sql[i] === '"') {
                let j = i + 1;
                while (j < len && sql[j] !== '"') j++;
                j = Math.min(j + 1, len);
                result += `<span class="sql-hl-plain">${esc(sql.slice(i, j))}</span>`;
                i = j;
                continue;
            }
            // Ідентифікатор у квадратних дужках [name]
            if (sql[i] === "[") {
                let j = i + 1;
                while (j < len && sql[j] !== "]") j++;
                j = Math.min(j + 1, len);
                result += `<span class="sql-hl-plain">${esc(sql.slice(i, j))}</span>`;
                i = j;
                continue;
            }
            // Числовий літерал
            if (/[0-9]/.test(sql[i]) || (sql[i] === "." && /[0-9]/.test(sql[i + 1] || ""))) {
                let j = i;
                while (j < len && /[0-9._eExX]/.test(sql[j])) j++;
                result += `<span class="sql-hl-number">${esc(sql.slice(i, j))}</span>`;
                i = j;
                continue;
            }
            // Ідентифікатор або ключове слово
            if (/[A-Za-z_]/.test(sql[i])) {
                let j = i;
                while (j < len && /[A-Za-z0-9_]/.test(sql[j])) j++;
                const word = sql.slice(i, j);
                const upper = word.toUpperCase();
                // Перевіряємо, чи є дужка після слова (функція)
                let k = j;
                while (k < len && (sql[k] === " " || sql[k] === "\t")) k++;
                const isFuncCall = sql[k] === "(";
                if (isFuncCall || SQL_FUNCTIONS.has(upper)) {
                    result += `<span class="sql-hl-function">${esc(word)}</span>`;
                } else if (SQL_KEYWORDS.has(upper)) {
                    result += `<span class="sql-hl-keyword">${esc(word)}</span>`;
                } else {
                    result += `<span class="sql-hl-plain">${esc(word)}</span>`;
                }
                i = j;
                continue;
            }
            // Оператори порівняння
            if ("=<>!".includes(sql[i])) {
                let j = i + 1;
                if (j < len && "=<>".includes(sql[j])) j++;
                result += `<span class="sql-hl-operator">${esc(sql.slice(i, j))}</span>`;
                i = j;
                continue;
            }
            // Арифметичні оператори
            if ("+-*/%|&~^".includes(sql[i])) {
                result += `<span class="sql-hl-operator">${esc(sql[i])}</span>`;
                i++;
                continue;
            }
            // Дужки
            if ("()".includes(sql[i])) {
                result += `<span class="sql-hl-paren">${esc(sql[i])}</span>`;
                i++;
                continue;
            }
            // Решта символів (пробіли, коми, крапки, крапка з комою тощо)
            result += esc(sql[i]);
            i++;
        }
        return result;
    }

    /**
     * Ініціалізує редактор: обгортає textarea і додає шар підсвічування.
     */
    function initSQLHighlighter() {
        const textarea = document.getElementById("ownSqlInput");
        if (!textarea || textarea.dataset.hlInit) return;
        textarea.dataset.hlInit = "1";

        // Вставляємо CSS один раз
        if (!document.getElementById("sqlHlStyle")) {
            const style = document.createElement("style");
            style.id = "sqlHlStyle";
            style.textContent = SQL_HL_STYLES;
            document.head.appendChild(style);
        }

        // Обгортаємо textarea у #ownSqlEditorWrap (якщо ще не обгорнуто)
        let wrap = textarea.parentElement;
        if (!wrap || wrap.id !== "ownSqlEditorWrap") {
            wrap = document.createElement("div");
            wrap.id = "ownSqlEditorWrap";
            textarea.parentNode.insertBefore(wrap, textarea);
            wrap.appendChild(textarea);
        }

        // Шар підсвічування (розміщується під textarea)
        const hlDiv = document.createElement("div");
        hlDiv.id = "ownSqlHighlight";
        hlDiv.setAttribute("aria-hidden", "true");
        wrap.insertBefore(hlDiv, textarea);

        // Синхронізація висоти і прокрутки
        function syncSize() {
            hlDiv.style.height  = textarea.offsetHeight + "px";
            hlDiv.style.width   = textarea.offsetWidth  + "px";
        }
        function syncScroll() {
            hlDiv.scrollTop  = textarea.scrollTop;
            hlDiv.scrollLeft = textarea.scrollLeft;
        }
        function updateHighlight() {
            // Додаємо \n в кінці, щоб уникнути стрибка останнього рядка
            hlDiv.innerHTML = tokenizeSQL(textarea.value) + "\n";
            syncScroll();
            syncSize();
        }

        textarea.addEventListener("input",   updateHighlight);
        textarea.addEventListener("keyup",   updateHighlight);
        textarea.addEventListener("scroll",  syncScroll);

        // Слідкуємо за зміною розміру (textarea можна тягнути)
        if (window.ResizeObserver) {
            new ResizeObserver(syncSize).observe(textarea);
        }

        updateHighlight();
    }

    /**
     * Оновлює підсвічування після програмного зміни значення textarea.
     */
    function refreshSQLHighlight() {
        const textarea = document.getElementById("ownSqlInput");
        const hlDiv    = document.getElementById("ownSqlHighlight");
        if (!textarea || !hlDiv) return;
        hlDiv.innerHTML = tokenizeSQL(textarea.value) + "\n";
    }

    // Публічний API
    window.refreshSQLHighlight  = refreshSQLHighlight;
    window._sqlInitHighlighter  = initSQLHighlighter;

})();
// ===================== End SQL Syntax Highlighter =====================


// ===================== SQL Context-Aware Autocomplete =====================
// Автодоповнення для редактора власного SQL:
//   • назви таблиць — після FROM / JOIN / UPDATE / INTO
//   • назви полів   — після "таблиця." або у контексті SELECT/WHERE/ON
//   • SQL-функції   — на початку слова або після ( , SELECT
//   • SQL-ключові слова — загальний fallback
//
// Керування: Tab / Enter — прийняти, Esc / клік зовні — закрити,
//            ↑ / ↓ — навігація по списку.

(function () {

    // CSS 
    const AC_STYLES = `
    #sqlAcDropdown {
        position: fixed;
        z-index: 99999;
        min-width: 200px;
        max-width: 360px;
        max-height: 260px;
        overflow-y: auto;
        border-radius: 6px;
        box-shadow: 0 4px 20px rgba(0,0,0,.25);
        font-family: 'Consolas', 'Courier New', monospace;
        font-size: 13px;
        line-height: 1;
        display: none;
        padding: 4px 0;
    }
    /* Light */
    body:not(.dark-theme) #sqlAcDropdown,
    html:not([data-theme="dark"]) #sqlAcDropdown {
        background: #fff;
        border: 1px solid #ccc;
        color: #1a1a2e;
    }
    body:not(.dark-theme) .sql-ac-item:hover,
    body:not(.dark-theme) .sql-ac-item.sql-ac-active,
    html:not([data-theme="dark"]) .sql-ac-item:hover,
    html:not([data-theme="dark"]) .sql-ac-item.sql-ac-active {
        background: #e8f0fe;
    }
    body:not(.dark-theme) .sql-ac-badge-kw   { background:#dbeafe; color:#1d4ed8; }
    body:not(.dark-theme) .sql-ac-badge-fn   { background:#ede9fe; color:#6d28d9; }
    body:not(.dark-theme) .sql-ac-badge-tbl  { background:#dcfce7; color:#166534; }
    body:not(.dark-theme) .sql-ac-badge-col  { background:#fef9c3; color:#854d0e; }
    body:not(.dark-theme) .sql-ac-match      { color:#0000cd; font-weight:bold; }

    /* Dark */
    body.dark-theme #sqlAcDropdown,
    html[data-theme="dark"] #sqlAcDropdown {
        background: #1e1e2e;
        border: 1px solid #444;
        color: #cdd6f4;
    }
    body.dark-theme .sql-ac-item:hover,
    body.dark-theme .sql-ac-item.sql-ac-active,
    html[data-theme="dark"] .sql-ac-item:hover,
    html[data-theme="dark"] .sql-ac-item.sql-ac-active {
        background: #313244;
    }
    body.dark-theme .sql-ac-badge-kw   { background:#1e3a5f; color:#89b4fa; }
    body.dark-theme .sql-ac-badge-fn   { background:#2d1f4a; color:#cba6f7; }
    body.dark-theme .sql-ac-badge-tbl  { background:#1a3a2a; color:#a6e3a1; }
    body.dark-theme .sql-ac-badge-col  { background:#3a2e1a; color:#fab387; }
    body.dark-theme .sql-ac-match      { color:#89b4fa; font-weight:bold; }

    /* Dark system fallback */
    @media (prefers-color-scheme: dark) {
        body:not(.dark-theme):not(.light-theme) #sqlAcDropdown,
        html:not([data-theme]) #sqlAcDropdown {
            background: #1e1e2e; border: 1px solid #444; color: #cdd6f4;
        }
        body:not(.dark-theme):not(.light-theme) .sql-ac-item:hover,
        body:not(.dark-theme):not(.light-theme) .sql-ac-item.sql-ac-active,
        html:not([data-theme]) .sql-ac-item:hover,
        html:not([data-theme]) .sql-ac-item.sql-ac-active { background: #313244; }
        body:not(.dark-theme):not(.light-theme) .sql-ac-badge-kw,
        html:not([data-theme]) .sql-ac-badge-kw  { background:#1e3a5f; color:#89b4fa; }
        body:not(.dark-theme):not(.light-theme) .sql-ac-badge-fn,
        html:not([data-theme]) .sql-ac-badge-fn  { background:#2d1f4a; color:#cba6f7; }
        body:not(.dark-theme):not(.light-theme) .sql-ac-badge-tbl,
        html:not([data-theme]) .sql-ac-badge-tbl { background:#1a3a2a; color:#a6e3a1; }
        body:not(.dark-theme):not(.light-theme) .sql-ac-badge-col,
        html:not([data-theme]) .sql-ac-badge-col { background:#3a2e1a; color:#fab387; }
        body:not(.dark-theme):not(.light-theme) .sql-ac-match,
        html:not([data-theme]) .sql-ac-match     { color:#89b4fa; font-weight:bold; }
    }

    .sql-ac-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 10px;
        cursor: pointer;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        user-select: none;
    }
    .sql-ac-badge {
        display: inline-block;
        font-size: 9px;
        font-weight: 700;
        padding: 1px 4px;
        border-radius: 3px;
        min-width: 26px;
        text-align: center;
        flex-shrink: 0;
        letter-spacing: .3px;
        text-transform: uppercase;
    }
    .sql-ac-label { flex: 1; overflow: hidden; text-overflow: ellipsis; }
    .sql-ac-hint  { font-size: 11px; opacity: .55; flex-shrink: 0; }
    `;

    // Константи
    const KW_LIST = [
        "SELECT","FROM","WHERE","AND","OR","NOT","IN","BETWEEN","LIKE","IS","NULL",
        "AS","ON","JOIN","LEFT JOIN","RIGHT JOIN","INNER JOIN","OUTER JOIN",
        "FULL OUTER JOIN","CROSS JOIN","GROUP BY","ORDER BY","HAVING","LIMIT",
        "OFFSET","UNION","UNION ALL","DISTINCT","EXISTS","CASE","WHEN","THEN",
        "ELSE","END","WITH","INSERT INTO","UPDATE","SET","DELETE FROM","CREATE TABLE",
        "DROP TABLE","ALTER TABLE","ADD COLUMN","PRIMARY KEY","FOREIGN KEY",
        "REFERENCES","UNIQUE","DEFAULT","NOT NULL","ASC","DESC","OVER","PARTITION BY",
        "ROWS BETWEEN","UNBOUNDED PRECEDING","CURRENT ROW"
    ];

    const FN_LIST = [
        "COUNT(","SUM(","AVG(","MIN(","MAX(","COALESCE(","NULLIF(","IFNULL(","IIF(",
        "UPPER(","LOWER(","TRIM(","LTRIM(","RTRIM(","LENGTH(","SUBSTR(","REPLACE(",
        "INSTR(","CONCAT(","CAST(","ROUND(","ABS(","CEIL(","FLOOR(","MOD(",
        "STRFTIME(","DATE(","TIME(","DATETIME(","JULIANDAY(","NOW()",
        "CURRENT_DATE","CURRENT_TIME","CURRENT_TIMESTAMP",
        "ROW_NUMBER()","RANK()","DENSE_RANK()","NTILE(","LAG(","LEAD(",
        "FIRST_VALUE(","LAST_VALUE(","GROUP_CONCAT(","PRINTF(","SIGN(","TYPEOF("
    ];

    // Стан дропдауна
    let _dropdown  = null;
    let _activeIdx = -1;
    let _items     = [];   // [{label, insert, badge, hint}]
    let _replaceLen = 0;   // скільки символів замінюємо (не включаючи тригерний символ ")

    // Утиліти

    /** Повертає масив усіх таблиць з глобального об'єкта бази даних.
     *  Підтримує: fullDatabase (масив), database.tables (масив у об'єкті) */
    function getTables() {
        try {
            if (typeof fullDatabase !== "undefined" && Array.isArray(fullDatabase) && fullDatabase.length)
                return fullDatabase;
            if (typeof database !== "undefined" && database && Array.isArray(database.tables))
                return database.tables;
            return [];
        } catch(e) { return []; }
    }

    /** Повертає поля таблиці за іменем */
    function getFields(tableName) {
        const tbl = getTables().find(t => t.name === tableName);
        return tbl ? tbl.schema.map(f => f) : [];
    }

    /** Позиція курсора в textarea */
    function getCursorPos(ta) { return ta.selectionStart; }

    /** Текст від початку до курсора */
    function getTextBefore(ta) { return ta.value.slice(0, getCursorPos(ta)); }

    /** Виділяє символи збігу жирним */
    function highlightMatch(label, query) {
        if (!query) return escHtml(label);
        const idx = label.toUpperCase().indexOf(query.toUpperCase());
        if (idx === -1) return escHtml(label);
        return escHtml(label.slice(0, idx))
             + `<span class="sql-ac-match">${escHtml(label.slice(idx, idx + query.length))}</span>`
             + escHtml(label.slice(idx + query.length));
    }

    function escHtml(s) {
        return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    }

    // Аналіз контексту 

    /**
     * Аналізує текст перед курсором з урахуванням екранування імен у лапках:
     *   "TableName"."FieldPrefix  →  поля TableName
     *   FROM "TablePrefix         →  таблиці
     *   звичайне слово            →  функції / ключові слова
     *
     * Повертає { items, replaceLen, hlPrefix, mode }
     * replaceLen — кількість символів до курсора, які замінюємо (без лапок-тригерів).
     */
    function getSuggestions(textBefore) {
        const results = [];

        // 1. Поля після  "TableName"."  або  "TableName".
        // Шукаємо: закрита лапка + крапка + відкрита лапка + (можливий prefix)
        // Паттерн:  "SomeName"."prefix   або  "SomeName".prefix  або "SomeName"."
        const dotQuoteMatch = textBefore.match(/"([^"]+)"\."([^"]*)$/);
        if (dotQuoteMatch) {
            const tableName = dotQuoteMatch[1];
            const prefix    = dotQuoteMatch[2].toUpperCase();
            const fields    = getFields(tableName);
            fields
                .filter(f => f.title.toUpperCase().startsWith(prefix))
                .forEach(f => results.push({
                    label  : f.title,
                    // Вставляємо тільки ім'я поля — відкрита лапка вже є в тексті
                    insert : f.title + '"',
                    badge  : "col",
                    hint   : f.type || ""
                }));
            if (results.length || fields.length)
                return { items: results, replaceLen: dotQuoteMatch[2].length, hlPrefix: dotQuoteMatch[2], mode: "col" };
        }

        // 2. Таблиця після  FROM "  /  JOIN "  тощо 
        // Шукаємо: ключове слово + пробіл(и) + відкрита лапка + (можливий prefix)
        const tblQuoteMatch = textBefore.match(
            /\b(?:FROM|JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|OUTER\s+JOIN|FULL\s+(?:OUTER\s+)?JOIN|CROSS\s+JOIN|UPDATE|INTO)\s+"([^"]*)$/i
        );
        if (tblQuoteMatch) {
            const prefix = tblQuoteMatch[1].toUpperCase();
            getTables()
                .filter(t => t.name.toUpperCase().startsWith(prefix))
                .forEach(t => results.push({
                    label  : t.name,
                    // Вставляємо ім'я + закриваємо лапку
                    insert : t.name + '"',
                    badge  : "tbl",
                    hint   : `${t.schema.length} col`
                }));
            return { items: results, replaceLen: tblQuoteMatch[1].length, hlPrefix: tblQuoteMatch[1], mode: "tbl" };
        }

        // 3. Fallback: звичайне слово → функції + ключові слова ──────────
        const wordMatch = textBefore.match(/(\w+)$/);
        const prefix    = wordMatch ? wordMatch[1].toUpperCase() : "";
        if (prefix.length < 1) return { items: [], replaceLen: 0, hlPrefix: "", mode: "word" };

        FN_LIST
            .filter(fn => fn.toUpperCase().startsWith(prefix))
            .forEach(fn => results.push({ label: fn, insert: fn, badge: "fn", hint: "" }));

        KW_LIST
            .filter(kw => kw.toUpperCase().startsWith(prefix) && kw.toUpperCase() !== prefix)
            .forEach(kw => results.push({ label: kw, insert: kw + " ", badge: "kw", hint: "" }));

        const seen = new Set();
        const deduped = results.filter(r => {
            if (seen.has(r.label)) return false;
            seen.add(r.label); return true;
        });

        return { items: deduped.slice(0, 30), replaceLen: prefix.length, hlPrefix: prefix, mode: "word" };
    }

    // Dropdown UI

    function ensureDropdown() {
        if (_dropdown) return _dropdown;
        _dropdown = document.createElement("div");
        _dropdown.id = "sqlAcDropdown";
        _dropdown.setAttribute("role","listbox");

        // Вставляємо CSS
        if (!document.getElementById("sqlAcStyle")) {
            const s = document.createElement("style");
            s.id = "sqlAcStyle";
            s.textContent = AC_STYLES;
            document.head.appendChild(s);
        }
        document.body.appendChild(_dropdown);
        return _dropdown;
    }

    function showDropdown(textarea, suggestions, replaceLen, hlPrefix) {
        _items      = suggestions;
        _replaceLen = replaceLen;
        _activeIdx  = suggestions.length ? 0 : -1;

        const drop = ensureDropdown();
        drop.innerHTML = "";

        if (!suggestions.length) { hideDropdown(); return; }

        const BADGE_LABEL = { kw:"KW", fn:"FN", tbl:"TBL", col:"COL" };

        suggestions.forEach((item, idx) => {
            const el = document.createElement("div");
            el.className = "sql-ac-item" + (idx === 0 ? " sql-ac-active" : "");
            el.setAttribute("role","option");
            el.innerHTML = `
                <span class="sql-ac-badge sql-ac-badge-${item.badge}">${BADGE_LABEL[item.badge]||item.badge}</span>
                <span class="sql-ac-label">${highlightMatch(item.label, hlPrefix)}</span>
                ${item.hint ? `<span class="sql-ac-hint">${escHtml(item.hint)}</span>` : ""}
            `;
            el.addEventListener("mousedown", function(e) {
                e.preventDefault();
                applyCompletion(textarea, idx);
            });
            drop.appendChild(el);
        });

        // Позиціонування під курсором
        const coords = getCaretCoords(textarea);
        const rect   = textarea.getBoundingClientRect();
        let left = rect.left + coords.left;
        let top  = rect.top  + coords.top  - textarea.scrollTop + parseInt(getComputedStyle(textarea).lineHeight || 20);

        drop.style.display = "block";
        drop.style.left = left + "px";
        drop.style.top  = top  + "px";

        // Не виходимо за межі вікна
        const dropRect = drop.getBoundingClientRect();
        if (dropRect.right > window.innerWidth - 8) {
            drop.style.left = (window.innerWidth - dropRect.width - 8) + "px";
        }
        if (dropRect.bottom > window.innerHeight - 8) {
            drop.style.top = (rect.top + coords.top - textarea.scrollTop - dropRect.height - 4) + "px";
        }
    }

    function hideDropdown() {
        if (_dropdown) _dropdown.style.display = "none";
        _activeIdx = -1;
        _items = [];
    }

    function setActive(idx) {
        if (!_dropdown) return;
        const els = _dropdown.querySelectorAll(".sql-ac-item");
        els.forEach((el, i) => el.classList.toggle("sql-ac-active", i === idx));
        _activeIdx = idx;
        // Прокрутка активного елемента у видиму область
        if (els[idx]) els[idx].scrollIntoView({ block: "nearest" });
    }

    // Застосування пропозиції 

    function applyCompletion(textarea, idx) {
        if (idx < 0 || idx >= _items.length) return;
        const item   = _items[idx];
        const pos    = getCursorPos(textarea);
        const before = textarea.value.slice(0, pos - _replaceLen);
        const after  = textarea.value.slice(pos);
        textarea.value = before + item.insert + after;
        // Переміщуємо курсор після вставленого тексту
        const newPos = before.length + item.insert.length;
        textarea.setSelectionRange(newPos, newPos);
        textarea.dispatchEvent(new Event("input"));
        hideDropdown();
        textarea.focus();
    }

    // Координати каретки в textarea 
    // Техніка «mirror div» для точного визначення позиції.

    function getCaretCoords(textarea) {
        const mirror = document.createElement("div");
        const style  = getComputedStyle(textarea);
        [
            "boxSizing","width","height","overflowX","overflowY",
            "borderTopWidth","borderRightWidth","borderBottomWidth","borderLeftWidth",
            "paddingTop","paddingRight","paddingBottom","paddingLeft",
            "fontStyle","fontVariant","fontWeight","fontStretch",
            "fontSize","fontSizeAdjust","lineHeight","fontFamily",
            "letterSpacing","wordSpacing","tabSize","MozTabSize",
            "whiteSpace","wordWrap","wordBreak"
        ].forEach(p => { mirror.style[p] = style[p]; });

        mirror.style.position   = "absolute";
        mirror.style.visibility = "hidden";
        mirror.style.top        = "0";
        mirror.style.left       = "0";
        mirror.style.whiteSpace = "pre-wrap";
        mirror.style.overflow   = "hidden";

        document.body.appendChild(mirror);

        const textBeforeCaret = textarea.value.slice(0, getCursorPos(textarea));
        mirror.textContent = textBeforeCaret;

        const span = document.createElement("span");
        span.textContent = "|";
        mirror.appendChild(span);

        const coords = { left: span.offsetLeft, top: span.offsetTop };
        document.body.removeChild(mirror);
        return coords;
    }

    // Прив'язка подій 
    function initAutocomplete() {
        const textarea = document.getElementById("ownSqlInput");
        if (!textarea || textarea.dataset.acInit) return;
        textarea.dataset.acInit = "1";

        textarea.setAttribute("autocomplete", "off");
        textarea.setAttribute("autocorrect",  "off");
        textarea.setAttribute("spellcheck",   "false");

        // Виклик підказок при введенні
        textarea.addEventListener("input", function () {
            const textBefore = getTextBefore(this);
            const { items, replaceLen, hlPrefix } = getSuggestions(textBefore);
            if (items.length) {
                showDropdown(this, items, replaceLen, hlPrefix);
            } else {
                hideDropdown();
            }
        });

        // Клавіатурна навігація
        textarea.addEventListener("keydown", function (e) {
            const isOpen = _dropdown && _dropdown.style.display !== "none";

            if (e.key === "Escape") {
                if (isOpen) { e.preventDefault(); hideDropdown(); }
                return;
            }
            if (!isOpen) return;

            if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive(Math.min(_activeIdx + 1, _items.length - 1));
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive(Math.max(_activeIdx - 1, 0));
            } else if (e.key === "Tab" || e.key === "Enter") {
                if (_activeIdx >= 0) {
                    e.preventDefault();
                    applyCompletion(this, _activeIdx);
                }
            }
        });

        // Закриваємо при втраті фокуса
        textarea.addEventListener("blur", function () {
            setTimeout(hideDropdown, 150);
        });

        // Закриваємо при кліку поза dropdown
        document.addEventListener("mousedown", function (e) {
            if (_dropdown && !_dropdown.contains(e.target) && e.target !== textarea) {
                hideDropdown();
            }
        });
    }

    // Публічний API
    window._sqlInitAutocomplete = initAutocomplete;

})();
// ===================== End SQL Autocomplete =====================


// ===================== SQL Editor — Focus & Active Border =====================
// При відкритті модального вікна:
//   • textarea отримує фокус і курсор ставиться в кінець тексту
//   • обгортка редактора (#ownSqlEditorWrap) підсвічується кольоровою рамкою
//     у стані фокуса; рамка зникає при втраті фокуса

(function () {

    const FOCUS_STYLES = `
    /* Рамка у стані фокуса — light */
    body:not(.dark-theme) #ownSqlEditorWrap:focus-within,
    html:not([data-theme="dark"]) #ownSqlEditorWrap:focus-within {
        border-color: #2563eb;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.18);
        outline: none;
    }
    /* Рамка у стані фокуса — dark */
    body.dark-theme #ownSqlEditorWrap:focus-within,
    html[data-theme="dark"] #ownSqlEditorWrap:focus-within {
        border-color: #89b4fa;
        box-shadow: 0 0 0 3px rgba(137, 180, 250, 0.18);
        outline: none;
    }
    /* Системний dark fallback */
    @media (prefers-color-scheme: dark) {
        body:not(.dark-theme):not(.light-theme) #ownSqlEditorWrap:focus-within,
        html:not([data-theme]) #ownSqlEditorWrap:focus-within {
            border-color: #89b4fa;
            box-shadow: 0 0 0 3px rgba(137, 180, 250, 0.18);
        }
    }
    /* Плавний перехід рамки */
    #ownSqlEditorWrap {
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    `;

    function injectFocusStyles() {
        if (document.getElementById("sqlFocusStyle")) return;
        const s = document.createElement("style");
        s.id = "sqlFocusStyle";
        s.textContent = FOCUS_STYLES;
        document.head.appendChild(s);
    }

    /** Фокусує textarea і переміщує курсор у кінець */
    function focusSQLEditor() {
        injectFocusStyles();
        const ta = document.getElementById("ownSqlInput");
        if (!ta) return;
        // Невелика затримка — модалка може ще анімуватися / display:flex щойно встановлено
        setTimeout(function () {
            ta.focus();
            const len = ta.value.length;
            ta.setSelectionRange(len, len);
        }, 50);
    }

    // Публічний API
    window._sqlFocusEditor = focusSQLEditor;

    // Стилі інжектуємо одразу при завантаженні скрипта
    injectFocusStyles();

})();
// ===================== End SQL Editor — Focus & Active Border =====================
