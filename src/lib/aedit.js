/**
 * Модальний редактор списку для поля типу "list".
 * Дозволяє додавати/видаляти елементи та обирати активний (перший у масиві).
 * @param {Object}   initialState  — { items: string[], selected: string }
 * @param {Function} onSave        — колбек(newState), викликається при закритті
 */
function openListModal(initialState, onSave, triggerElement) {
    // Уникаємо дублювання модалки
    const existingOverlay = document.getElementById("listEditorOverlay");
    if (existingOverlay) existingOverlay.remove();

    // Клонуємо стан, щоб не мутувати оригінал до збереження
    let items = [...(initialState.items || [])];
    let selected = initialState.selected || (items[0] || "");

    // ---------- Розмітка ----------
    const overlay = document.createElement("div");
    overlay.id = "listEditorOverlay";

    const modal = document.createElement("div");
    modal.id = "listEditorModal";
    modal.innerHTML = `<div class="le-body" id="leBody"></div>`;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // ---------- Позиціонування модалки відносно тригера ----------
    if (triggerElement) {
        const rect = triggerElement.getBoundingClientRect();
        const modalWidth = 280;
        const modalMaxHeight = 320;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Визначаємо left: якщо не влазить праворуч — зсуваємо вліво
        let left = rect.left;
        if (left + modalWidth > viewportWidth - 8) {
            left = viewportWidth - modalWidth - 8;
        }
        left = Math.max(8, left);

        // Визначаємо top: спочатку під тригером, якщо не влазить — над ним
        let top = rect.bottom + 4;
        if (top + modalMaxHeight > viewportHeight - 8) {
            top = rect.top - modalMaxHeight - 4;
        }
        top = Math.max(8, top);

        Object.assign(modal.style, {
            position: "fixed",
            left: left + "px",
            top: top + "px",
            margin: "0",
            transform: "none"
        });

        // Overlay — прозорий, але перекриває кліки поза модалкою
        Object.assign(overlay.style, {
            background: "transparent"
        });
    }

    let showInput = false;
    const leBody = modal.querySelector("#leBody");

    // ---------- Рендер ----------
    function render() {
        leBody.innerHTML = "";

        items.forEach((txt, i) => {
            const isActive = (i === 0);
            const item = document.createElement("div");
            item.className = "le-item" + (isActive ? " le-active" : "");
            item.innerHTML = `
                ${isActive ? '<span class="le-check">✓</span>' : ''}
                <span class="le-rank">${i + 1}</span>
                <span class="le-text">${escHtml(txt)}</span>
                <button class="le-del" title="${(typeof t === "function" && t("aeditDelete")) || "Видалити"}">✕</button>
            `;
            item.addEventListener("click", () => moveToTop(i));
            item.querySelector(".le-del").addEventListener("click", (e) => {
                e.stopPropagation();
                removeItem(i);
            });
            leBody.appendChild(item);
        });

        if (showInput) {
            const row = document.createElement("div");
            row.className = "le-input-row";
            const inp = document.createElement("input");
            inp.type = "text";
            inp.placeholder = (typeof t === "function" && t("add item")) || "Введіть текст...";
            inp.autocomplete = "off";
            inp.addEventListener("keydown", (e) => {
                if (e.key === "Enter") { e.preventDefault(); commitInput(); }
                if (e.key === "Escape") { e.preventDefault(); showInput = false; render(); }
            });
            row.appendChild(inp);
            leBody.appendChild(row);
            setTimeout(() => inp.focus(), 10);
        }

        const addBtn = document.createElement("button");
        addBtn.className = "le-add-btn";
        addBtn.textContent = "+";
        //addBtn.title = (typeof t === "function" && t("aeditListAdd")) || "Додати елемент";
        addBtn.addEventListener("click", handlePlus);
        leBody.appendChild(addBtn);
    }

    function handlePlus() {
        const inp = leBody.querySelector(".le-input-row input");
        if (!inp) { showInput = true; render(); return; }
        commitInput();
    }

    function commitInput() {
        const inp = leBody.querySelector(".le-input-row input");
        if (!inp) return;
        const val = inp.value.trim();
        if (val) {
            items.push(val);
            selected = items[0];
        }
        inp.value = "";
        render();
    }

    function moveToTop(i) {
        const [item] = items.splice(i, 1);
        items.unshift(item);
        selected = item;
        render();
    }

    function removeItem(i) {
        items.splice(i, 1);
        selected = items[0] || "";
        render();
    }

    function escHtml(s) {
        const d = document.createElement("div");
        d.textContent = s;
        return d.innerHTML;
    }

    // ---------- Збереження чернетки з поля вводу ----------
    function flushInput() {
        const inp = leBody.querySelector(".le-input-row input");
        if (inp) {
            const val = inp.value.trim();
            if (val) { items.push(val); selected = items[0]; }
        }
    }

    // ---------- Закриття ----------
    function saveAndClose() {
        flushInput();
        overlay.remove();
        onSave({ items: [...items], selected: items[0] || "" });
    }

    // ---------- Обробники ----------
    overlay.addEventListener("click", (e) => { if (e.target === overlay) saveAndClose(); });
    document.addEventListener("keydown", function escHandler(e) {
        if (e.key === "Escape") { document.removeEventListener("keydown", escHandler); saveAndClose(); }
    });

    render();
}


/**
 *  Розширене введення даних з контролем типів та налаштування елементів вводу (select, input, contentEditable, обмеження по типу даних, перевірки) *  
**/
function advDataInput(container, cellData, col, rowData, index, isReadOnly) {
    container.innerHTML = "";
    let createdEl = null;

    const typeStr = String(col?.type || "").trim().toLowerCase();
    const fieldName = String(col?.title || "").trim().toLowerCase();
    const imageField = /^(image|img|photo|picture|зображ)/.test(fieldName);
    const isIntegerType = typeStr === "integer" || typeStr === "ціле число" || typeStr === "int";
    const isPK = !!col?.primaryKey;
    const isPKAuto = isPK && isIntegerType && col?.autoInc === true;
    const isForeignKey = !!(col && col.foreignKey && col.refTable && col.refField);

    // ===== хелпери для caret у contentEditable =====
    const getCaretOffset = (el) => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return 0;
        const range = sel.getRangeAt(0);
        const preRange = range.cloneRange();
        preRange.selectNodeContents(el);
        preRange.setEnd(range.endContainer, range.endOffset);
        return preRange.toString().length;
    };

    const setCaretOffset = (el, offset) => {
        offset = Math.max(0, Math.min(offset, el.innerText.length));
        const range = document.createRange();
        const sel = window.getSelection();
        let current = 0;

        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
        let node = walker.nextNode();
        while (node) {
            const len = node.nodeValue.length;
            if (current + len >= offset) {
                range.setStart(node, offset - current);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
                return;
            }
            current += len;
            node = walker.nextNode();
        }

        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
    };

    // універсальний санітайзер для типів
    const sanitizeByType = (s, t) => {
        s = (s ?? "").toString().replace(/\r?\n/g, "");
        t = String(t || "").toLowerCase();
    
        if (t === "text" || t === "текст") {
            if (s.length > 64) s = s.slice(0, 64);
            return s;
        }
        if (t === "integer" || t === "ціле число" || t === "int") {
            s = s.replace(/[^\d-]/g, "").replace(/(?!^)-/g, "");
            if (s.startsWith("--")) s = "-" + s.slice(2);
            return s;
        }
        if (t === "real" || t === "дійсне число") {
            s = s.replace(/[^\d.\-]/g, "")
                 .replace(/(?!^)-/g, "")
                 .replace(/(\..*)\./g, "$1");
            return s;
        }
        return s;
    };
    

// ===== FOREIGN KEY =====
if (isForeignKey) {
    const select = document.createElement("select");
    select.style.width = "100%";
    select.style.minWidth = "0";
    select.style.boxSizing = "border-box";

    const emptyOption = document.createElement("option");
    emptyOption.value = "empty";
    emptyOption.textContent = (typeof t === "function" && t("aeditEmpty")) || "—";
    select.appendChild(emptyOption);

    // Допоміжна функція: перебудовує опції select зі свіжих даних довідника
    const rebuildFkOptions = (selectEl, currentValue) => {
        while (selectEl.options.length > 1) selectEl.remove(1);
        
        const freshRef = database.tables.find(tb => tb.name === col.refTable);
        if (!freshRef) return;

        const refIdIndex = freshRef.schema.findIndex(f => f.title === col.refField);
        let dispIndex = refIdIndex;
        if (col.subst) {
            const idx = freshRef.schema.findIndex(f => !f.primaryKey);
            if (idx !== -1) dispIndex = idx;
        }

        if (refIdIndex !== -1) {
            freshRef.data.forEach(refRow => {
                const opt = document.createElement("option");
                opt.value = refRow[refIdIndex];
                opt.textContent = refRow[dispIndex];
                selectEl.appendChild(opt);
            });
        }

        // Додаємо "+" як останній елемент списку
        const addNewOption = document.createElement("option");
        addNewOption.value = "__add_new__";
        addNewOption.textContent = "─── ✚ ───";   //+     
       
        selectEl.appendChild(addNewOption);

        selectEl.value = (currentValue === null || currentValue === undefined || currentValue === "")
            ? "empty" : String(currentValue);
    };

    const refTableObj = database.tables.find(tb => tb.name === col.refTable);
    if (refTableObj) rebuildFkOptions(select, cellData);

    select.disabled = !!isReadOnly;
    container.appendChild(select);
    createdEl = select;

    // Зберігаємо попереднє значення для коректного відновлення вибору
    select.dataset.prevValue = select.value;

    select.addEventListener("change", () => {
        if (select.value === "__add_new__") {
            // Тимчасово повертаємо попереднє значення, щоб "+" не залишався активним
            const prev = select.dataset.prevValue || "empty";
            select.value = prev;

            if (!isReadOnly) {
                openRefTableAddModal(col.refTable, () => {
                    const freshRef = database.tables.find(tb => tb.name === col.refTable);
                    if (freshRef && freshRef.data.length > 0) {
                        const refIdIdx = freshRef.schema.findIndex(f => f.title === col.refField);
                        const lastRow = freshRef.data[freshRef.data.length - 1];
                        const newVal = refIdIdx !== -1 ? lastRow[refIdIdx] : null;

                        // Оновлюємо список і автоматично вибираємо щойно доданий запис
                        rebuildFkOptions(select, newVal);

                        // Оновлюємо дані поточного рядка
                        const colType = String(col?.type || "").toLowerCase();
                        rowData[index] = (colType === "integer" || colType === "ціле число" || colType === "int" || colType === "real" || colType === "дійсне число")
                            ? Number(newVal) : newVal;
                    }
                });
            }
            return;
        }

        select.dataset.prevValue = select.value;
        if (select.value === "empty") {
            rowData[index] = null;
        } else {
            const colType = String(col?.type || "").toLowerCase();
            rowData[index] = (colType === "integer" || colType === "ціле число" || colType === "int" || colType === "real" || colType === "дійсне число")
                ? Number(select.value) : select.value;
        }
    });
}
    
    
    // ===== BOOLEAN =====
    else if (typeStr === "boolean") {
        const select = document.createElement("select");
        select.innerHTML = `<option value="1">${t("aeditYes")}</option><option value="0">${t("aeditNo")}</option>`;
        select.value = (cellData == 1) ? "1" : "0";
        select.disabled = !!isReadOnly;
        container.appendChild(select);
        createdEl = select;

        select.addEventListener("change", () => {
            rowData[index] = Number(select.value);
        });
    }
    // ===== DATE =====
    else if (typeStr === "date") {
        const wrapper = document.createElement("span");
        wrapper.style.display = "inline-flex";
        wrapper.style.alignItems = "center";
        wrapper.style.width = "150px";
        wrapper.style.maxWidth = "100%";
        wrapper.style.flex = "0 0 150px";
        wrapper.style.position = "relative";
        const picker = document.createElement("input");
        picker.type = "text";
        picker.inputMode = "numeric";
        picker.value = /^\d{4}-\d{2}-\d{2}$/.test(String(cellData || ""))
            ? cellData
            : new Date().toISOString().split("T")[0];
        picker.readOnly = !!isReadOnly;
        picker.style.width = "100%";
        picker.style.height = "100%";
        picker.style.boxSizing = "border-box";
        picker.style.paddingRight = "24px";
        const nativePicker = document.createElement("input");
        nativePicker.type = "date";
        nativePicker.value = picker.value;
        nativePicker.tabIndex = -1;
        nativePicker.style.position = "absolute";
        nativePicker.style.opacity = "0";
        nativePicker.style.width = "1px";
        nativePicker.style.height = "1px";
        nativePicker.addEventListener("change", () => {
            picker.value = nativePicker.value;
            rowData[index] = nativePicker.value;
        });
        picker.addEventListener("input", () => {
            const value = picker.value.replace(/[^0-9-]/g, "").slice(0, 10);
            picker.value = value;
            if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                nativePicker.value = value;
                rowData[index] = value;
            }
        });
        const calendarButton = document.createElement("button");
        calendarButton.className = "date-picker-button";
        calendarButton.type = "button";
        calendarButton.textContent = "📅";
        calendarButton.title = "Вибрати дату";
        calendarButton.disabled = !!isReadOnly;
        calendarButton.addEventListener("click", () => {
            if (typeof nativePicker.showPicker === "function") nativePicker.showPicker();
            else nativePicker.click();
        });
        rowData[index] = picker.value;
        wrapper.append(picker, calendarButton, nativePicker);
        container.appendChild(wrapper);
        createdEl = picker;
    }
    // ===== СПИСОК (модальний редактор) =====
    else if (typeStr === "list") {
        // Елементи списку живуть у col.comment у вигляді "item1,item2,item3"
        // rowData[index] / cellData — лише поточне (активне) значення комірки

        const parseComment = (comment) => {
            if (!comment || typeof comment !== "string") return [];
            return comment.split(",").map(s => s.trim()).filter(Boolean);
        };
        const serializeComment = (its) => its.map(s => s.replace(/,/g, "")).join(",");

        // Елементи зі схеми; активний — з комірки
        let items = parseComment(col.comment);
        const activeVal = (cellData !== null && cellData !== undefined && cellData !== "")
            ? String(cellData) : (items[0] || "");

        // Переміщуємо активний елемент на першу позицію
        const activeIdx = items.indexOf(activeVal);
        if (activeIdx > 0) {
            items.splice(activeIdx, 1);
            items.unshift(activeVal);
        } else if (activeIdx === -1 && activeVal) {
            items.unshift(activeVal);
        }

        let listState = { items, selected: items[0] || "" };
        rowData[index] = listState.selected || null;

        // Кнопка-тригер, що відображає активний елемент
        const btn = document.createElement("button");
        btn.type = "button";
        btn.disabled = !!isReadOnly;
        btn.title = isReadOnly ? listState.selected : (t("aeditListEdit") || "Редагувати список");

        Object.assign(btn.style, {
            border: "none",
            background: "transparent",
            cursor: isReadOnly ? "default" : "pointer",
            padding: "0 4px",
            margin: "0",
            outline: "none",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "flex-start",
            width: "100%",
            height: "100%",
            font: "inherit",
            color: "inherit",
            textAlign: "left",
            overflow: "hidden",
            textOverflow: "ellipsis",
            zIndex:"999",
            whiteSpace: "nowrap"
        });

        const updateBtnLabel = () => {
            btn.textContent = listState.selected || (t("aeditEmpty") || "—");
        };
        updateBtnLabel();

        btn.onclick = () => {
            if (isReadOnly) return;
            openListModal(listState, (newState) => {
                listState = newState;
                // Зберігаємо повний список назад у схему (col.comment)
                col.comment = serializeComment(newState.items);
                // У комірку — лише активний елемент
                rowData[index] = newState.selected || null;
                updateBtnLabel();
            }, btn);
        };

        container.appendChild(btn);
        createdEl = btn;
    }
	// ===== IMAGE =====
    // STORE_FILES_IN_DB = false → зберігається лише URL (рядок)
    // STORE_FILES_IN_DB = true  → зберігається blob (Uint8Array)
    else if (/^(image|зображ|blob)/.test(typeStr) || imageField) {
        const storeInDb = localStorage.getItem("app_settings_storeFilesInDb") === "true";

        rowData[index] = cellData || null;

        const btn = document.createElement("button");

        // Визначаємо, чи є вже збережене зображення залежно від режиму
        const hasImage = storeInDb
            ? (cellData instanceof Uint8Array && cellData.length > 0)
            : !!cellData;

        btn.innerHTML = hasImage ? '<span class="ui-icon">🖼️</span>' : "+";
        btn.disabled = !!isReadOnly;
        btn.title = hasImage ? t("aeditImageView") : t("aeditImageAdd");

        Object.assign(btn.style, {
            border: "none",
            background: "transparent",
            fontSize: "24px",
            fontFamily: "'Noto Color Emoji', 'Segoe UI Emoji', sans-serif",
            cursor: isReadOnly ? "default" : "pointer",
            padding: "0",
            margin: "0",
            outline: "none",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%"
        });

        btn.onclick = () => {
            if (isReadOnly) return;

            if (storeInDb) {
                // Режим blob: відкриваємо файловий редактор (як для типу "файл")
                openFileEditor(rowData[index], (val) => {
                    rowData[index] = val;
                    const newMeta = val ? decodeFileBlob(val) : null;
                    btn.innerHTML = val ? '<span class="ui-icon">🖼️</span>' : "+";
                    btn.title = newMeta ? newMeta.name : t("aeditImageAdd");
                });
            } else {
                // Режим URL: відкриваємо редактор посилань на зображення
                openImageEditor(col.title, rowData[index], (val) => {
                    rowData[index] = val;
                    const hasNewImage = !!val;
                    btn.innerHTML = hasNewImage ? '<span class="ui-icon">🖼️</span>' : "+";
                    btn.title = hasNewImage ? t("aeditImageView") : t("aeditImageAdd");
                });
            }
        };

        container.appendChild(btn);
        createdEl = btn;
    }
    // ===== FILE =====
    // STORE_FILES_IN_DB = false → зберігається лише URL/шлях (рядок)
    // STORE_FILES_IN_DB = true  → зберігається blob (Uint8Array)
    else if (/^(file|файл)/.test(typeStr)) {
        const storeInDb = localStorage.getItem("app_settings_storeFilesInDb") === "true";

        // Визначаємо наявність файлу залежно від режиму
        const hasFile = storeInDb
            ? (cellData instanceof Uint8Array && cellData.length > 0)
            : (typeof cellData === "string" && cellData.trim() !== "");

        const meta = (storeInDb && hasFile) ? decodeFileBlob(cellData) : null;

        const btn = document.createElement("button");
        btn.innerHTML = hasFile ? '<span class="ui-icon">📎</span>' : "+";
        btn.title = hasFile
            ? (storeInDb ? meta.name : cellData)
            : t("aeditFileAdd");
        btn.disabled = !!isReadOnly;

        Object.assign(btn.style, {
            border: "none",
            background: "transparent",
            fontSize: "24px",
            fontFamily: "'Noto Color Emoji', 'Segoe UI Emoji', sans-serif",
            cursor: isReadOnly ? "default" : "pointer",
            padding: "0",
            margin: "0",
            outline: "none",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%"
        });

        btn.onclick = () => {
            if (isReadOnly) return;

            if (storeInDb) {
                // Режим blob: вибираємо файл і зберігаємо у вигляді Uint8Array
                openFileEditor(rowData[index], (val) => {
                    rowData[index] = val;
                    const newMeta = val ? decodeFileBlob(val) : null;
                    btn.innerHTML = val ? '<span class="ui-icon">📎</span>' : "+";
                    btn.title = newMeta ? newMeta.name : t("aeditFileAdd");
                });
            } else {
                // Режим URL: вводимо/редагуємо посилання на файл
                openUrlEditor(col.title, rowData[index], (val) => {
                    rowData[index] = val || null;
                    const hasNewFile = !!val;
                    btn.innerHTML = hasNewFile ? '<span class="ui-icon">📎</span>' : "+";
                    btn.title = hasNewFile ? val : t("aeditFileAdd");
                });
            }
        };

        container.appendChild(btn);
        createdEl = btn;
    }

    // ===== TEXT / NUMBER (contentEditable) =====
    else { 
        const editable = !isReadOnly && !isPKAuto;
        let displayValue = sanitizeByType(cellData ?? "", typeStr);
        container.textContent = displayValue;
        container.contentEditable = editable ? "true" : "false";
        container.spellcheck = false;
        createdEl = container;
    
        if (editable) {
            container.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    const currentRow = container.closest("tr");
                    const nextRow = currentRow?.nextElementSibling;
                    const colIdx = Array.from(currentRow.children).indexOf(container);
                    if (nextRow) {
                        if (typeof highlightRow === "function") highlightRow(nextRow);
                        const nextCell = nextRow.children[colIdx];
                        if (nextCell) nextCell.focus();
                    } else {
                        container.focus();
                    }
                }
            });
    
            container.addEventListener("paste", (e) => {
                e.preventDefault();
                const text = (e.clipboardData || window.clipboardData).getData("text") || "";
                const clean = text.replace(/\r?\n/g, "").replace(/\s+$/g, "");
                document.execCommand("insertText", false, clean);
            });

            container.addEventListener("dragover", (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "none";
            });

            container.addEventListener("drop", (e) => {
                e.preventDefault();
            });
    
            container.addEventListener("input", () => {
                const oldText = container.innerText;
                const caret = getCaretOffset(container);
                let newText = oldText;
                
                if (isIntegerType || typeStr === "real" || typeStr === "дійсне число") {
                    newText = sanitizeByType(oldText, typeStr);
                }
    
                if (newText !== oldText) {
                    container.innerText = newText;
                    setCaretOffset(container, Math.min(caret, newText.length));
                }
    
                if (isIntegerType || typeStr === "real" || typeStr === "дійсне число") {
                    const n = newText === "" ? null : Number(newText);
                    rowData[index] = (n === null || Number.isNaN(n)) ? null : n;
                } else {
                    rowData[index] = newText;
                }
            });
        }
    }
  
    if (createdEl && createdEl !== container) {
        if (container.dataset.tableName) createdEl.dataset.tableName = container.dataset.tableName;
        if (container.dataset.fieldName) createdEl.dataset.fieldName = container.dataset.fieldName;
        if (container.dataset.colIndex)  createdEl.dataset.colIndex  = container.dataset.colIndex;
    }

    return createdEl;
}


/**
 * Перевіряє, чи переповнений текстовий вміст комірки (ширший за комірку),
 * і показує / оновлює кнопку «+» у правому нижньому куті.
 */
function _updateExpandBtn(td, colSchema, rowData, index, isReadOnly) {
    _removeExpandBtn(td);

    // Кнопка потрібна лише для текстових / числових комірок (contentEditable)
    const typeStr = String(colSchema?.type || "").toLowerCase();
    const isSpecial = (
        typeStr === "boolean" || typeStr === "date" || typeStr === "list" ||
        typeStr === "image" || typeStr === "file" ||
        !!(colSchema?.foreignKey && colSchema?.refTable)
    );
    if (isSpecial) return;

    // Перевіряємо переповнення: scrollWidth > offsetWidth
    const isOverflow = td.scrollWidth > td.offsetWidth + 2;
    if (!isOverflow) return;

    const btn = document.createElement("button");
    btn.className = "cell-expand-btn";
    btn.textContent = "▼";
    btn.title = (typeof t === "function" && t("aeditExpandCell")) || "Редагувати повний вміст";
    btn.type = "button";

    Object.assign(btn.style, {
        position: "absolute",
        right: "0",
        bottom: "0",
        width: "12px",
        height: "12px",
        fontSize: "6px",
       // lineHeight: "6px",
        padding: "0",
        margin: "0",
        border: "none",
        borderTopLeftRadius: "6px",
        background: "#2255cc",
        color: "#fff",
        cursor: "pointer",
        zIndex: "10",
        textAlign: "center",
        fontWeight: "bold",
        boxShadow: "-1px -1px 3px rgba(0,0,0,0.2)"
    });

    // Гарантуємо, що td має position:relative для абсолютного позиціонування кнопки
    if (!td.style.position || td.style.position === "static") {
        td.style.position = "relative";
    }

    btn.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        e.preventDefault();
    });

    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        _openCellTextModal(td, colSchema, rowData, index, isReadOnly);
    });

    td.appendChild(btn);
}

function _removeExpandBtn(td) {
    if (!td) return;
    const existing = td.querySelector(".cell-expand-btn");
    if (existing) existing.remove();
}

/**
 * Відкриває модальне вікно для редагування повного тексту комірки.
 * Enter — зберегти та закрити, Escape / клік поза вікном — закрити без змін.
 */
function _openCellTextModal(td, colSchema, rowData, index, isReadOnly) {
    // Уникаємо дублювання
    const existing = document.getElementById("cellTextEditOverlay");
    if (existing) existing.remove();

    // Читаємо текст комірки, ігноруючи кнопку розгортання
    const expandBtn = td.querySelector(".cell-expand-btn");
    if (expandBtn) expandBtn.style.display = "none";
    const currentText = td.innerText ?? td.textContent ?? "";
    if (expandBtn) expandBtn.style.display = "";

    const overlay = document.createElement("div");
    overlay.id = "cellTextEditOverlay";
    Object.assign(overlay.style, {
        position: "fixed",
        inset: "0",
        background: "rgba(0,0,0,0.35)",
        zIndex: "10000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
    });

    const modal = document.createElement("div");
    Object.assign(modal.style, {
        background: "var(--modal-bg, #fff)",
        border: "1px solid #aaa",
        borderRadius: "6px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
        padding: "16px",
        minWidth: "320px",
        maxWidth: "560px",
        width: "40vw",
        display: "flex",
        flexDirection: "column",
        gap: "10px"
    });

    const label = document.createElement("div");
    label.style.cssText = "font-size:12px;color:#666;";
    label.textContent = (colSchema?.title || "") +
        (isReadOnly ? " (read only)" : " ");

    const textarea = document.createElement("textarea");
    textarea.value = currentText;
    textarea.readOnly = !!isReadOnly;
    textarea.rows = 6;
    Object.assign(textarea.style, {
        width: "100%",
        boxSizing: "border-box",
        resize: "vertical",
        fontFamily: "inherit",
        fontSize: "inherit",
        padding: "6px",
        border: "1px solid #ccc",
        borderRadius: "4px",
        background: isReadOnly ? "#f5f5f5" : "var(--input-bg, #fff)"
    });

    modal.appendChild(label);
    modal.appendChild(textarea);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = textarea.value.length;

    function saveAndClose() {
        const newVal = textarea.value;
        // Оновлюємо вміст комірки
        td.innerText = newVal;
        // Оновлюємо rowData
        const typeStr = String(colSchema?.type || "").toLowerCase();
        if (typeStr === "integer" || typeStr === "ціле число" || typeStr === "int" ||
            typeStr === "real" || typeStr === "дійсне число") {
            const n = newVal === "" ? null : Number(newVal);
            rowData[index] = (n === null || Number.isNaN(n)) ? null : n;
        } else {
            rowData[index] = newVal;
        }
        overlay.remove();
    }

    function cancelAndClose() {
        overlay.remove();
    }

    textarea.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!isReadOnly) saveAndClose();
            else overlay.remove();
        }
        if (e.key === "Escape") {
            e.preventDefault();
            cancelAndClose();
        }
    });

    overlay.addEventListener("mousedown", (e) => {
        if (e.target === overlay) cancelAndClose();
    });
}


/**
 * Функція editData
 * ------------------
 * Призначення: Відображає інтерфейс редагування таблиці або перегляду запиту у модальному вікні.
 * Параметри: tableName — назва таблиці або запиту (з * на початку).
 * Результат: Відкриває модальне вікно з даними для редагування або перегляду.
 * Робота:
 * - Завантажує дані таблиці або результатів запиту з SQLite або об'єкта database.
 * - Якщо таблиці не існує — створює її, базуючись на схемі.
 * - Відображає дані у вигляді таблиці з можливістю редагування.
 **/
/**
 * Відкриває таблицю або результат запиту для редагування
 * (оновлено для підтримки кастомного <custom-date-picker>)
 */
function editData(tableName) {
    let table = null;
    let isReadOnly = false;
    let columns = [];
    let rows = [];

    document.getElementById("savedTablesModal").style.display = "none";
    selectedCell = null;
    const oldSelected = document.querySelector("tr.selected-row");
    if (oldSelected) oldSelected.classList.remove("selected-row");

    const isQueryTable = tableName.startsWith('*');
    console.log("Edit=", tableName);

    if (isQueryTable) {
        const originalQueryName = tableName.substring(1);
        table = queries.results.find(t => t.name === originalQueryName);
        isReadOnly = true;

        if (table) {
            table.schema = (table.schema || []).map(f => ({
                subst: !!f.subst,
                autoInc: (f.autoInc ?? (f.primaryKey && /int/i.test(String(f.type)))),
                ...f
            }));
            columns = table.schema.map(col => col.title);
            rows = table.data;
        }
    } else {
        table = database.tables.find(t => t.name === tableName);
        // Заблокована таблиця вiдкривається у режимi read-only
        isReadOnly = (typeof isLocked === "function" && isLocked("table", tableName));

        if (table) {
            table.schema = (table.schema || []).map(f => ({
                subst: !!f.subst,
                autoInc: (f.autoInc ?? (f.primaryKey && /int/i.test(String(f.type)))),
                ...f
            }));
            columns = table.schema.map(col => col.title);
            
            // Отримуємо список полів первинного ключа
            const pkCols = table.schema.filter(col => col.primaryKey).map(col => col.title);
            const pkIndices = pkCols.map(pk => columns.indexOf(pk));
            
            // Створюємо копію даних зі знімком PK
            rows = (table.data || []).map(row => {
                // Створюємо копію рядка, щоб не мутувати оригінал
                const rowCopy = [...row];
                
                // Додаємо знімок PK значень для цього рядка
                const pkSnapshot = {};
                pkCols.forEach((pk, idx) => {
                    pkSnapshot[pk] = row[pkIndices[idx]];
                });
                rowCopy._pkSnapshot = pkSnapshot;
                
                return rowCopy;
            });
        }
    }

    if (!table) {
        Message(t("aeditTableQueryNotFound"));
        return;
    }

    // Зберігаємо дані зі знімками назад у таблицю
    if (!isReadOnly && table) {
        table.data = rows;
    }

    currentEditTable = table;
    // Для заблокованої таблиці — додаємо позначку read-only у заголовку
    const _lockSuffix = (!isQueryTable && typeof isLocked === "function" && isLocked("table", tableName))
        ? " [" + (typeof t === "function" && t("lockReadOnly") !== "lockReadOnly" ? t("lockReadOnly") : "read-only") + "]"
        : "";
    document.getElementById("editTitle").innerText = isQueryTable
        ? t("aeditQueryTitle", table.name.slice(5))
        : t("aeditTableTitle", table.name) + _lockSuffix;

    const editQueryInfo = document.getElementById("editQueryInfo");
    if (isQueryTable) {
        const queryRawName = table.name.replace(/^запит "/, '').replace(/"$/, '');
        const queryDef = queries.definitions.find(q => q.name === queryRawName);
        document.getElementById("editRowCount").innerText = t("aeditRowCount", rows.length);
        document.getElementById("editSqlText").innerText = queryDef?.sql || '';
        document.getElementById("sqlDetails").removeAttribute("open");
        editQueryInfo.style.display = "block";
    } else {
        editQueryInfo.style.display = "none";
    }

    const head = document.getElementById("editHead");
    const body = document.getElementById("editBody");
    head.innerHTML = "";
    body.innerHTML = "";

    // --- Заголовок ---
    const headerRow = document.createElement("tr");
    columns.forEach((colTitle, i) => {
        const th = document.createElement("th");
        const colSchema = table.schema[i];
        th.textContent = colSchema && colSchema.subst ? colTitle + "🛟" : colTitle;
        th.style.backgroundColor = "#eee";
        if (!isReadOnly && colSchema && colSchema.primaryKey) th.classList.add("pk");
        headerRow.appendChild(th);
    });
    head.appendChild(headerRow);

    // --- Ресайз колонок ---
    (function setupColumnResizing() {
        const tableEl = head.closest('table') || document.getElementById('editTable');
        if (!tableEl) return;

        const oldColgroup = tableEl.querySelector('colgroup');
        if (oldColgroup) oldColgroup.remove();

        const COL_DEFAULT_WIDTH = 120;

        const colgroup = document.createElement('colgroup');
        for (let i = 0; i < columns.length; i++) {
            const col = document.createElement('col');
            const w = currentEditTable?.columnWidths?.[i];
            const type = String(table.schema[i]?.type || '').trim().toLowerCase();
            const numeric = !table.schema[i]?.foreignKey && ['integer', 'int', 'ціле число', 'real', 'дійсне число', 'дробове число', 'numeric', 'float'].includes(type);
            col.style.width = (w ? w : (numeric ? 80 : COL_DEFAULT_WIDTH)) + 'px';
            colgroup.appendChild(col);
        }
        tableEl.insertBefore(colgroup, tableEl.querySelector('thead') || tableEl.firstChild);

        // table-layout:fixed потребує явної ширини таблиці —
        // задаємо суму ширин колонок, щоб ресайз і скролінг працювали коректно
        const updateTableWidth = () => {
            const cols = tableEl.querySelectorAll('col');
            let total = 0;
            cols.forEach(c => { total += parseInt(c.style.width) || COL_DEFAULT_WIDTH; });
            tableEl.style.width = total + 'px';
        };
        tableEl.style.tableLayout = 'fixed';
        updateTableWidth();

        // Горизонтальний скролінг через контейнер
        const tableWrapper = tableEl.closest('.edit-table-wrapper') || tableEl.parentElement;
        if (tableWrapper) {
            tableWrapper.style.overflowX = 'auto';
            tableWrapper.style.overflowY = 'auto';
            tableWrapper.style.maxWidth = '100%';
        }

        tableEl.querySelectorAll('th, td').forEach(el => {
            el.style.overflow = 'hidden';
            el.style.textOverflow = 'ellipsis';
            el.style.whiteSpace = 'nowrap';
        });

        headerRow.querySelectorAll("th").forEach((th, colIndex) => {
            th.style.position = "relative";
            if (th.querySelector('.col-resizer')) return;

            const resizer = document.createElement("div");
            resizer.className = 'col-resizer';
            Object.assign(resizer.style, {
                width: "8px",
                height: "100%",
                position: "absolute",
                top: "0",
                right: "0",
                cursor: "col-resize",
                userSelect: "none",
                zIndex: "20",
                transform: "translateX(50%)"
            });

            th.appendChild(resizer);

            resizer.addEventListener("mousedown", (e) => {
                e.preventDefault();
                const col = tableEl.querySelectorAll('col')[colIndex];
                if (!col) return;

                const startX = e.clientX;
                // col.getBoundingClientRect() повертає 0 — беремо ширину з th
                const startWidth = th.getBoundingClientRect().width;
                const minWidth = 40;
                const prevUserSelect = document.body.style.userSelect;
                document.body.style.userSelect = 'none';
                document.body.style.cursor = 'col-resize';

                function onMouseMove(ev) {
                    const dx = ev.clientX - startX;
                    const newWidth = Math.max(minWidth, Math.round(startWidth + dx));
                    col.style.width = newWidth + 'px';
                    currentEditTable.columnWidths = currentEditTable.columnWidths || [];
                    currentEditTable.columnWidths[colIndex] = newWidth;
                    // Оновлюємо ширину таблиці — потрібно при table-layout:fixed
                    updateTableWidth();
                }

                function onMouseUp() {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    document.body.style.userSelect = prevUserSelect || '';
                    document.body.style.cursor = '';
                }

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        });
    })();

    // --- Рядки ---
    rows.forEach(rowData => {
        const tr = document.createElement("tr");
        // Витягуємо дані без службового поля _pkSnapshot
        const actualRowData = rowData._pkSnapshot ? rowData.slice(0, columns.length) : rowData;
        
        actualRowData.forEach((cellData, index) => {
            const td = document.createElement("td");
            const colSchema = table.schema[index];

            const el = advDataInput(td, cellData, colSchema, rowData, index, isQueryTable);

            const mediaType = String(colSchema?.type || "").trim().toLowerCase();
            if (el === td && /^(image|зображ|blob|file|файл)/i.test(mediaType)) {
                const isFile = /^(file|файл)/i.test(mediaType);
                const mediaButton = document.createElement("button");
                mediaButton.type = "button";
                mediaButton.innerHTML = cellData
                    ? `<span class="ui-icon">${isFile ? "📎" : "🖼️"}</span>` : "+";
                mediaButton.title = cellData ? (isFile ? "Переглянути файл" : "Переглянути зображення") : "Додати файл";
                mediaButton.style.cssText = "border:0;background:transparent;font-size:24px;cursor:pointer;width:100%;height:100%;";
                mediaButton.onclick = () => {
                    const done = value => {
                        rowData[index] = value;
                        mediaButton.innerHTML = value
                            ? `<span class="ui-icon">${isFile ? "📎" : "🖼️"}</span>` : "+";
                    };
                    if (isFile) openFileEditor(rowData[index], done);
                    else openImageEditor(colSchema.title, rowData[index], done);
                };
                td.innerHTML = "";
                td.appendChild(mediaButton);
            }

            // 🔹 Спеціальна підтримка кастомного datepicker:
            if (el && el.tagName === 'CUSTOM-DATE-PICKER') {
                el.addEventListener("change", () => {
                    rowData[index] = el.value || "";
                });
            }

            td.addEventListener("click", () => {
                if (selectedCell?.parentElement) selectedCell.parentElement.classList.remove("selected-row");
                // Видаляємо кнопку розгортання з попередньої виділеної комірки
                if (selectedCell) _removeExpandBtn(selectedCell);
                selectedCell = td;
                selectedCell.parentElement.classList.add("selected-row");
                // Показуємо кнопку розгортання якщо вміст ширший за комірку
                _updateExpandBtn(td, colSchema, rowData, index, isQueryTable);
            });

            td.addEventListener("blur", (e) => {
                // Не прибираємо кнопку якщо клік потрапив на саму кнопку
                if (e.relatedTarget && e.relatedTarget.classList.contains("cell-expand-btn")) return;
                setTimeout(() => {
                    if (document.activeElement !== td && !td.querySelector(".cell-expand-btn:focus")) {
                        _removeExpandBtn(td);
                    }
                }, 100);
            }, true);

            tr.appendChild(td);
        });
        body.appendChild(tr);
    });

    document.getElementById("addDataRowBtn").style.display = isReadOnly ? 'none' : 'inline-block';
    document.getElementById("deleteSelectedRowBtn").style.display = isReadOnly ? 'none' : 'inline-block';
    document.getElementById("saveTableDataBtn").style.display = isReadOnly ? 'none' : 'inline-block';

    // Гарантуємо горизонтальний скролінг для широких таблиць
    const editTableEl = document.getElementById('editTable') || head.closest('table');
    if (editTableEl) {
        const parent = editTableEl.parentElement;
        if (parent) {
            parent.style.overflowX = 'auto';
            parent.style.overflowY = 'auto';
            parent.style.maxWidth = '100%';
            parent.style.display = 'block';
        }
    }

    document.getElementById("editModal").style.display = "flex";

    // Прибираємо кнопку розгортання при кліку поза комірками таблиці
    const _bodyClickCleanup = (e) => {
        if (!e.target.closest("td") && !e.target.classList.contains("cell-expand-btn")) {
            if (selectedCell) _removeExpandBtn(selectedCell);
        }
    };
    body.addEventListener("click", _bodyClickCleanup);

    // ---------- Індикатори скролінгу ----------
    _setupScrollIndicators();
}

/**
 * Перемикає режим повноекранного відображення для вікна редагування таблиці.
 *
 * #editModal — це вже position:fixed overlay на весь екран.
 * Щоб розгорнути вміст, потрібно розтягнути .modal-box всередині нього,
 * а не сам overlay. Зберігаємо/відновлюємо inline-стилі modal-box.
 */
function _toggleEditTableFullscreen() {
    const modal = document.getElementById('editModal');
    if (!modal) return;
    // .modal-box — перший дочірній div всередині editModal
    const box = modal.querySelector('.modal-box');
    if (!box) return;

    const btn = document.getElementById('editTableFullscreenBtn');
    const isFullscreen = modal.dataset.fullscreen === '1';

    if (!isFullscreen) {
        // Зберігаємо поточні inline-стилі box
        box._fsOrigStyle = box.getAttribute('style') || '';

        // Розтягуємо box на весь overlay.
        // Важливо: скидаємо position/left/top (їх міг виставити makeModalsDraggable
        // при перетягуванні), інакше box зі зсувом вийде за межі вікна програми.
        Object.assign(box.style, {
            position:     'relative',
            left:         '0',
            top:          '0',
            right:        '0',
            bottom:       '0',
            width:        '100%',
            height:       '100%',
            maxWidth:     '100%',
            maxHeight:    '100%',
            borderRadius: '0',
            margin:       '0',
            flex:         '1 1 auto',
            boxSizing:    'border-box',
            transform:    'none'
        });

        modal.dataset.fullscreen = '1';
        if (btn) {
            btn.textContent = '⤢';
            btn.title = (typeof t === 'function' && t('editTableExitFullscreen')) || 'Згорнути';
            btn.style.opacity = '1';
        }
    } else {
        // Відновлюємо оригінальні стилі box
        box.setAttribute('style', box._fsOrigStyle);

        modal.dataset.fullscreen = '0';
        if (btn) {
            btn.textContent = '⤢';
            btn.title = (typeof t === 'function' && t('editTableEnterFullscreen')) || 'На весь екран';
            btn.style.opacity = '0.65';
        }
    }
}

/**
 * Встановлює індикатори позиції скролінгу для вікна редагування таблиці:
 * - горизонтальний індикатор у рядку заголовка (editTitle)
 * - вертикальний індикатор у колонці кнопок (editModalButtons)
 */
function _setupScrollIndicators() {
    const editTableEl = document.getElementById('editTable');
    if (!editTableEl) return;
    const wrapper = editTableEl.parentElement;   // div[overflow-x:auto]
    if (!wrapper) return;

    // ---------- Кнопка розгортання на весь екран ----------
    // Розміщується у верхньому правому куті .modal-box через position:absolute.
    // .modal-box вже має position відносно якого працює absolute дочірній елемент.
    const modal = document.getElementById('editModal');
    const box   = modal ? modal.querySelector('.modal-box') : null;

    let fullscreenBtn = document.getElementById('editTableFullscreenBtn');
    if (!fullscreenBtn && box) {
        fullscreenBtn = document.createElement('button');
        fullscreenBtn.id = 'editTableFullscreenBtn';
        fullscreenBtn.textContent = '⤢';
        fullscreenBtn.title = (typeof t === 'function' && t('editTableEnterFullscreen')) || 'На весь екран';
        Object.assign(fullscreenBtn.style, {
            position:       'absolute',
            top:            '6px',
            right:          '6px',
            zIndex:         '20',
            width:          '28px',
            height:         '28px',
            padding:        '0',
            border:         'none',
            borderRadius:   '4px',
            background:     'transparent',
            color:          'inherit',
            fontSize:       '18px',
            lineHeight:     '1',
            cursor:         'pointer',
            opacity:        '0.65',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            transition:     'opacity 0.15s'
        });
        fullscreenBtn.addEventListener('mouseenter', () => { fullscreenBtn.style.opacity = '1'; });
        fullscreenBtn.addEventListener('mouseleave', () => {
            fullscreenBtn.style.opacity = modal && modal.dataset.fullscreen === '1' ? '1' : '0.65';
        });
        fullscreenBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            _toggleEditTableFullscreen();
        });
        // Переконуємось що box має position:relative, щоб absolute дочірні елементи позиціонувались відносно нього
        const boxPos = window.getComputedStyle(box).position;
        if (boxPos === 'static') box.style.position = 'relative';
        box.appendChild(fullscreenBtn);
    }

    // Скидаємо стан кнопки при кожному відкритті таблиці
    if (modal && modal.dataset.fullscreen === '1') {
        modal.dataset.fullscreen = '0';
        const box2 = modal.querySelector('.modal-box');
        if (box2 && box2._fsOrigStyle !== undefined) {
            box2.setAttribute('style', box2._fsOrigStyle);
        }
        if (fullscreenBtn) {
            fullscreenBtn.textContent = '⤢';
            fullscreenBtn.title = (typeof t === 'function' && t('editTableEnterFullscreen')) || 'На весь екран';
            fullscreenBtn.style.opacity = '0.65';
        }
    }

    const hScrollContainer = editTableEl.parentElement;
    const vScrollContainer = wrapper;  

    // --- Горизонтальний індикатор (в елементі h2#editTitle) ---
    const titleEl = document.getElementById("editTitle");
    if (titleEl && hScrollContainer) {
        // h2 має display:block — робимо flex, щоб індикатор можна було притиснути праворуч
        Object.assign(titleEl.style, {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px"
        });

        let hIndicator = document.getElementById("editScrollHIndicator");
        if (!hIndicator) {
            hIndicator = document.createElement("span");
            hIndicator.id = "editScrollHIndicator";
            Object.assign(hIndicator.style, {
                flexShrink: "0",
                fontSize: "18px",
                lineHeight: "1",
                pointerEvents: "none",
                userSelect: "none",
                opacity: "0.7",
                minWidth: "30px",
                textAlign: "right"
            });
            titleEl.appendChild(hIndicator);
        }

        const updateH = () => {
            const scrollLeft = hScrollContainer.scrollLeft;
            const maxScrollLeft = hScrollContainer.scrollWidth - hScrollContainer.clientWidth;
            const hasLeft = scrollLeft > 1;
            const hasRight = maxScrollLeft > 1 && scrollLeft < maxScrollLeft - 1;

            if (hasLeft && hasRight) {
                hIndicator.textContent = "◂ ▸";
            } else if (hasLeft) {
                hIndicator.textContent = "◂";
            } else if (hasRight) {
                hIndicator.textContent = "▸";
            } else {
                hIndicator.textContent = "";
            }
            if (typeof convertEmojiInContainer === "function") convertEmojiInContainer(hIndicator);
        };

        hScrollContainer.addEventListener("scroll", updateH);
        setTimeout(updateH, 50);
    }

    // --- Вертикальний індикатор (в колонці кнопок editModalButtons) ---
    const buttonsCol = document.getElementById("editModalButtons");
    if (buttonsCol && vScrollContainer) {
        let vIndicator = document.getElementById("editScrollVIndicator");
        if (!vIndicator) {
            vIndicator = document.createElement("div");
            vIndicator.id = "editScrollVIndicator";
            Object.assign(vIndicator.style, {
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "2px",
                fontSize: "14px",
                lineHeight: "1",
                pointerEvents: "none",
                userSelect: "none",
                color: "inherit",
                opacity: "0.7",
                marginTop: "auto"
            });
            buttonsCol.appendChild(vIndicator);
        } else {
            vIndicator.innerHTML = "";
        }

        const updateV = () => {
            const scrollTop = vScrollContainer.scrollTop;
            const maxScrollTop = vScrollContainer.scrollHeight - vScrollContainer.clientHeight;
            const hasUp = scrollTop > 1;
            const hasDown = maxScrollTop > 1 && scrollTop < maxScrollTop - 1;

            vIndicator.innerHTML = "";
            if (hasUp) {
                const up = document.createElement("span");
                up.textContent = "▲";
                vIndicator.appendChild(up);
            }
            if (hasDown) {
                const down = document.createElement("span");
                down.textContent = "▼";
                vIndicator.appendChild(down);
            }
            if (typeof convertEmojiInContainer === "function") convertEmojiInContainer(vIndicator);
        };

        vScrollContainer.addEventListener("scroll", updateV);
        setTimeout(updateV, 50);
    }
}


/**
 * Додає новий рядок до таблиці
 * (оновлено для підтримки кастомного <custom-date-picker>)
 */
function addDataRow() {
    if (!currentEditTable || currentEditTable.name.startsWith('*')) return;

    const tbody = document.getElementById("editBody");
    const tr = document.createElement("tr");

    const newRowData = currentEditTable.schema.map(() => null);
    let firstEditableCell = null;

    currentEditTable.schema.forEach((col, index) => {
        const td = document.createElement("td");
        td.dataset.tableName = currentEditTable.name;
        td.dataset.fieldName = col.title;
        td.dataset.colIndex = index;

        let defaultValue = null;

        // Автоінкремент
        const colTypeStr = String(col.type || "").toLowerCase();
        const isColInteger = colTypeStr === "integer" || colTypeStr === "ціле число" || colTypeStr === "int";
        if (col.primaryKey && isColInteger && col.autoInc === true) {
            let max = 0;
            currentEditTable.data.forEach(row => {
                const val = parseInt(row[index]);
                if (!isNaN(val)) max = Math.max(max, val);
            });
            defaultValue = max + 1;
            newRowData[index] = defaultValue;
        }

        // Створюємо елемент введення
        const el = advDataInput(td, defaultValue, col, newRowData, index, false);

        // 🔹 Підтримка кастомного datepicker
        if (el && el.tagName === 'CUSTOM-DATE-PICKER') {
            el.addEventListener("change", () => {
                newRowData[index] = el.value || "";
            });
        }

        // Вибір першої активної клітинки
        if (!firstEditableCell && el && el !== td) firstEditableCell = el;
        else if (!firstEditableCell && td.isContentEditable) firstEditableCell = td;

        td.addEventListener("click", () => {
            selectedCell = td;
            highlightRow(tr);
        });

        tr.appendChild(td);
    });

    currentEditTable.data.push(newRowData);
    tbody.appendChild(tr);

    highlightRow(tr);

    if (firstEditableCell) {
        if (firstEditableCell.focus) firstEditableCell.focus();
        if (firstEditableCell.select) firstEditableCell.select();
    }
}

// Допоміжна функція для виділення рядка
function highlightRow(tr) {
    const tbody = tr.parentElement;
    tbody.querySelectorAll("tr").forEach(row => row.classList.remove("selected-row"));
    tr.classList.add("selected-row");
}

//
let deleteRowCallback = null; // сюди збережемо функцію, яку виконаємо після підтвердження

function confirmDeleteRow(pkValue, onConfirm) {
    // Зберігаємо колбек на підтвердження
    deleteRowCallback = onConfirm;

    // Заповнюємо текст повідомлення
    document.getElementById("deleteMessage").textContent =
        t("aeditDeleteConfirm", pkValue);

    // Показуємо модалку
    document.getElementById("deleteRowModal").style.display = "block";
}

function deleteRowConfirmed() {
    document.getElementById("deleteRowModal").style.display = "none";
    if (typeof deleteRowCallback === "function") {
        deleteRowCallback(true);
    }
    deleteRowCallback = null;
}

function deleteRowCancelled() {
    document.getElementById("deleteRowModal").style.display = "none";
    if (typeof deleteRowCallback === "function") {
        deleteRowCallback(false);
    }
    deleteRowCallback = null;
}
   

/**
* Функція deleteSelectedRow()
* ---------------------------
* Призначення: Видаляє вибраний рядок із таблиці редагування, якщо вона не є запитом і має первинний ключ.
* Параметри: Відсутні (використовує глобальні selectedCell та currentEditTable).
* Результат: Видаляє рядок з DOM і з бази даних, викликає збереження.
* Спосіб роботи:
* - Перевіряє, чи клітинка вибрана та чи таблиця не є запитом;
* - Знаходить індекс стовпця з первинним ключем;
* - Формує SQL-запит DELETE і виконує його;
* - Видаляє рядок із таблиці і зберігає БД.
**/

function deleteSelectedRow(afterDeleteCallback) {
    if (!selectedCell || !currentEditTable || currentEditTable.name?.startsWith('*')) {
        Message(t("aeditDeleteSelectFirst"));
        return;
    }

    const row = selectedCell.parentElement;
    const cells = row.querySelectorAll("td");

    // Збираємо всі стовпці, які є частиною PK
    const pkCols = currentEditTable.schema
        .map((col, idx) => col.primaryKey ? { title: col.title, index: idx } : null)
        .filter(Boolean);

    if (pkCols.length === 0) {
        Message(t("aeditNoPrimaryKey"));
        return;
    }

    // Отримуємо значення PK для повідомлення.
    // Якщо PK-колонка прихована у відображенні — беремо значення з originalTable.data
    // по індексу рядка в tbody (порядок рядків DOM збігається з порядком даних).
    const _origTableForDisplay = database.tables.find(t => t.name === currentEditTable.name);
    const _activeTbodyForDisplay = currentEditTable._tbody ||
        document.getElementById("editBody") ||
        row.closest("tbody");
    const _rowDataForDisplay = _activeTbodyForDisplay
        ? Array.from(_activeTbodyForDisplay.querySelectorAll("tr")).indexOf(row)
        : -1;

    // Визначаємо які поля реально відображаються у DOM.
    // Пріоритет: явно передане _selectedFields на currentEditTable (форма з кількома таблицями),
    // потім window._currentTableSelectedFields по імені, потім порожній масив (всі колонки видимі).
    const _selectedFields = currentEditTable._selectedFields
        ?? window._currentTableSelectedFields?.[currentEditTable.name]
        ?? [];

    let pkDisplayValues = [];
    pkCols.forEach(pk => {
        // Перевіряємо чи PK відображається у DOM:
        // або selectedFields порожній (всі колонки), або PK є серед selectedFields
        const pkVisibleInDom = _selectedFields.length === 0 || _selectedFields.includes(pk.title);

        if (pkVisibleInDom) {
            // Знаходимо індекс комірки у відфільтрованому відображенні
            const visibleSchema = _selectedFields.length > 0
                ? _selectedFields
                : currentEditTable.schema.map(c => c.title);
            const displayIndex = visibleSchema.indexOf(pk.title);
            if (displayIndex !== -1 && cells[displayIndex]) {
                pkDisplayValues.push(cells[displayIndex].innerText.trim());
                return;
            }
        }

        // PK прихований або не знайдено в DOM — беремо з масиву даних
        if (_origTableForDisplay && _rowDataForDisplay !== -1) {
            const origPkIndex = _origTableForDisplay.schema.findIndex(c => c.title === pk.title);
            if (origPkIndex !== -1 && _origTableForDisplay.data[_rowDataForDisplay]) {
                const val = _origTableForDisplay.data[_rowDataForDisplay][origPkIndex];
                pkDisplayValues.push(val !== null && val !== undefined ? String(val) : "");
            }
        }
    });

    const pkDisplayValue = pkDisplayValues.join(", ");

    // Отримуємо оригінальну таблицю з database
    const originalTable = database.tables.find(t => t.name === currentEditTable.name);
    if (!originalTable) {
        Message(t("aeditTableNotFound"));
        return;
    }

    // Індекси PK у схемі оригінальної таблиці (не відфільтрованої currentEditTable)
    const pkColsOrig = pkCols.map(pk => ({
        title: pk.title,
        // Індекс у currentEditTable.schema (для читання з DOM-комірок)
        displayIndex: (() => {
            for (let j = 0; j < currentEditTable.schema.length; j++) {
                if (currentEditTable.schema[j].title === pk.title) return j;
            }
            return -1;
        })(),
        // Індекс у originalTable.schema (для читання з originalTable.data)
        origIndex: (() => {
            for (let j = 0; j < originalTable.schema.length; j++) {
                if (originalTable.schema[j].title === pk.title) return j;
            }
            return -1;
        })()
    }));

    // Знаходимо індекс рядка в оригінальних даних
    let rowIndexToDelete = -1;

    // Визначаємо tbody: спочатку з currentEditTable._tbody (таблиці форми),
    // потім fallback на стандартний editBody
    const selectedRow = selectedCell.parentElement;
    const activeTbody = currentEditTable._tbody ||
        document.getElementById("editBody") ||
        selectedRow.closest("tbody");
    const rowData = activeTbody
        ? Array.from(activeTbody.querySelectorAll("tr")).indexOf(selectedRow)
        : -1;

    // Шлях 1: _pkSnapshot
    if (rowData !== -1 && currentEditTable.data[rowData]?._pkSnapshot) {
        const snapshot = currentEditTable.data[rowData]._pkSnapshot;
        for (let i = 0; i < originalTable.data.length; i++) {
            let matches = true;
            for (let pk of pkColsOrig) {
                if (pk.origIndex === -1) { matches = false; break; }
                const origValue = String(originalTable.data[i][pk.origIndex] ?? "");
                const snapValue = String(snapshot[pk.title] ?? "");
                if (origValue !== snapValue) { matches = false; break; }
            }
            if (matches) { rowIndexToDelete = i; break; }
        }
    }

    // Шлях 2: порядок рядків у DOM збігається з порядком у originalTable.data,
    // тому rowData є прямим індексом рядка для видалення.
    // Це працює і коли PK-поле приховане у таблиці форми.
    if (rowIndexToDelete === -1 && rowData !== -1 && rowData < originalTable.data.length) {
        rowIndexToDelete = rowData;
    }

    // Шлях 3: порівнюємо лише за DOM-комірками (лише якщо PK відображається)
    if (rowIndexToDelete === -1) {
        for (let i = 0; i < originalTable.data.length; i++) {
            let matches = true;
            for (let pk of pkColsOrig) {
                if (pk.displayIndex === -1 || pk.origIndex === -1) { matches = false; break; }
                const currentValue = cells[pk.displayIndex]?.innerText?.trim() ?? "";
                const originalValue = String(originalTable.data[i][pk.origIndex] ?? "");
                if (currentValue !== originalValue) { matches = false; break; }
            }
            if (matches) { rowIndexToDelete = i; break; }
        }
    }

    if (rowIndexToDelete === -1) {
        Message(t("aeditRowNotFound"));
        return;
    }

    // Формуємо SQL WHERE умову
    const whereClauses = pkColsOrig.map(pk => {
        const value = String(originalTable.data[rowIndexToDelete][pk.origIndex] ?? "");
        return `"${pk.title}" = '${value.replace(/'/g, "''")}'`;
    });

    const sql = `DELETE FROM "${currentEditTable.name}" WHERE ${whereClauses.join(" AND ")};`;

    // Перевірка зовнішніх ключів: збираємо залежні записи у інших таблицях
    const fkPlan = buildFkCascadePlan(originalTable, rowIndexToDelete);
    const fkTotal = fkPlan.total;

    const runDeletion = async () => {
        try {
            // Каскадне видалення пов'язаних записів (спочатку глибші залежності)
            if (fkTotal > 0) {
                await dba.db.run("BEGIN");
                try {
                    for (const tName of fkPlan.order) {
                        const tb = database.tables.find(t => t.name === tName);
                        if (!tb) continue;
                        const indexes = [...fkPlan.byTable.get(tName)].sort((a, b) => b - a);
                        for (const ri of indexes) {
                            const w = _rowWhereSQL(tb, ri);
                            if (w) await dba.db.run(`DELETE FROM "${tb.name}" WHERE ${w};`);
                        }
                    }
                    await dba.db.run(sql);
                    await dba.db.run("COMMIT");
                } catch (e2) {
                    try { await dba.db.run("ROLLBACK"); } catch (_) {}
                    Message(t("aeditDeleteError", e2.message));
                    return;
                }
                // Видаляємо залежні рядки з пам'яті
                for (const tName of fkPlan.order) {
                    const tb = database.tables.find(t => t.name === tName);
                    if (!tb) continue;
                    const indexes = [...fkPlan.byTable.get(tName)].sort((a, b) => b - a);
                    indexes.forEach(i => tb.data.splice(i, 1));
                }
            } else {
                await dba.db.run(sql);
            }

            // Негайно видаляємо рядок з DOM
            const rowEl = selectedCell.parentElement;
            rowEl.remove();
            selectedCell = null;

            // Видаляємо з оригінальної таблиці
            originalTable.data.splice(rowIndexToDelete, 1);

            // Оновлюємо поточну таблицю для відображення
            const selectedFields = window._currentTableSelectedFields?.[currentEditTable.name] || [];

            if (selectedFields.length > 0) {
                const fieldIndices = selectedFields.map(field =>
                    originalTable.schema.findIndex(col => col.title === field)
                ).filter(idx => idx !== -1);

                currentEditTable.data = originalTable.data.map(row =>
                    fieldIndices.map(idx => row[idx])
                );
            } else {
                currentEditTable.data = [...originalTable.data];
            }

            // Оновлюємо схему, якщо потрібно
            if (selectedFields.length > 0) {
                currentEditTable.schema = originalTable.schema.filter(col =>
                    selectedFields.includes(col.title)
                );
            } else {
                currentEditTable.schema = [...originalTable.schema];
            }

            saveDatabase();
            if (typeof afterDeleteCallback === 'function') afterDeleteCallback();
            Message(t("aeditDeleted"));

            // Оновлюємо відображення форми, зберігаючи поточну таблицю
            if (currentPreviewForm) {
                // Зберігаємо поточну таблицю перед оновленням
                const savedTable = currentEditTable;
                previewForm(currentPreviewForm, false);
                // Відновлюємо посилання після оновлення
                setTimeout(() => {
                    currentEditTable = savedTable;
                    // Оновлюємо selectedCell, якщо потрібно
                    const newRows = document.querySelectorAll("#formPreviewCanvas .form-table table tbody tr");
                    if (newRows.length > 0 && newRows[0].cells.length > 0) {
                        selectedCell = newRows[0].cells[0];
                        if (selectedCell.parentElement) {
                            selectedCell.parentElement.classList.add("selected-row");
                        }
                    }
                }, 50);
            }
        } catch (e) {
            Message(t("aeditDeleteError", e.message));
        }
    };

    // Если є пов'язані записи — попереджаємо та питаємо про каскадне видалення
    if (fkTotal > 0) {
        _fkDeleteState = { total: fkTotal, execute: runDeletion };
        showFkWarningForDelete();
    } else {
        confirmDeleteRow(pkDisplayValue, async (confirmed) => {
            if (confirmed) await runDeletion();
        });
    }
}

// ===== Каскадне видалення із перевіркою зовнішніх ключів =====
let _fkDeleteState = null;

function _escHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function _rowWhereSQL(tableObj, rowIndex) {
    const row = tableObj.data[rowIndex];
    if (!row) return "";
    let cols = tableObj.schema.filter(c => c.primaryKey);
    if (cols.length === 0) cols = tableObj.schema;
    return cols.map(c => {
        const idx = tableObj.schema.indexOf(c);
        const v = row[idx];
        return `"${c.title}" = '${String(v ?? "").replace(/'/g, "''")}'`;
    }).join(" AND ");
}

function _rowIdentMap(tableObj, rowIndex) {
    const m = {};
    const row = tableObj.data[rowIndex];
    if (!row) return m;
    tableObj.schema.forEach((c, idx) => { m[c.title] = row[idx]; });
    return m;
}

function buildFkCascadePlan(rootTableObj, rootRowIndex) {
    const byTable = new Map();
    const depthMap = new Map();
    const seen = new Set();

    function walk(tableObj, rowIndex, depth) {
        const key = tableObj.name + "|" + rowIndex;
        if (seen.has(key)) return;
        seen.add(key);
        const identifiers = _rowIdentMap(tableObj, rowIndex);
        database.tables.forEach(child => {
            if (child.name === tableObj.name) return;
            child.schema.forEach((col, colIdx) => {
                if (!(col.foreignKey && col.refTable === tableObj.name)) return;
                const refVal = identifiers[col.refField];
                if (refVal === undefined || refVal === null) return;
                child.data.forEach((row, rowIdx) => {
                    const fv = row[colIdx];
                    if (fv === undefined || fv === null) return;
                    if (child.name === rootTableObj.name && rowIdx === rootRowIndex) return;
                    if (String(fv) === String(refVal)) {
                        if (!byTable.has(child.name)) byTable.set(child.name, new Set());
                        byTable.get(child.name).add(rowIdx);
                        depthMap.set(child.name, Math.max(depthMap.get(child.name) ?? 0, depth));
                        walk(child, rowIdx, depth + 1);
                    }
                });
            });
        });
    }

    walk(rootTableObj, rootRowIndex, 1);

    let total = 0;
    byTable.forEach(s => { total += s.size; });
    const order = [...byTable.keys()].sort((a, b) => (depthMap.get(b) ?? 0) - (depthMap.get(a) ?? 0));
    return { total, byTable, order };
}

function showFkWarningForDelete() {
    const st = _fkDeleteState;
    if (!st) return;
    const msgEl = document.getElementById("fkWarningMsg");
    if (msgEl) {
        msgEl.innerHTML =
            "<div>" + _escHtml(t("fkWarningMsg")) + "</div>" +
            "<div style='margin-top:6px;font-weight:bold;'>" + _escHtml(t("fkRelatedCount", { count: st.total })) + "</div>";
    }
    const btn = document.getElementById("fkWarningCascadeBtn");
    if (btn) btn.textContent = t("fkDeleteAll");
    const cn = document.getElementById("fkWarningCancelBtn");
    if (cn) cn.textContent = t("fkCancel");
    document.getElementById("fkWarningModal").style.display = "block";
}

function fkWarningChoice(cascade) {
    document.getElementById("fkWarningModal").style.display = "none";
    if (!cascade || !_fkDeleteState) { _fkDeleteState = null; return; }
    const st = _fkDeleteState;
    const msgEl = document.getElementById("fkConfirmMsg");
    if (msgEl) {
        msgEl.innerHTML =
            "<div>" + _escHtml(t("fkConfirmMsg1", { count: st.total })) + "</div>" +
            "<div style='margin-top:6px;'>" + _escHtml(t("fkConfirmMsg2")) + "</div>";
    }
    const db = document.getElementById("fkConfirmDeleteBtn");
    if (db) db.textContent = t("fkDelete");
    const cn = document.getElementById("fkConfirmCancelBtn");
    if (cn) cn.textContent = t("fkCancel");
    document.getElementById("fkConfirmModal").style.display = "block";
}

function fkConfirmChoice(confirmed) {
    document.getElementById("fkConfirmModal").style.display = "none";
    const st = _fkDeleteState;
    _fkDeleteState = null;
    if (confirmed && st && typeof st.execute === "function") st.execute();
}

/**
 * Відкриває вбудоване модальне вікно (oneRowEditModalOverlay) для додавання
 * нового запису в таблицю-довідник (refTableName).
 * Після збереження викликає onSaved() і оновлює таблицю у database + SQLite.
 *
 * @param {string}   refTableName — назва таблиці-довідника
 * @param {Function} onSaved      — колбек після успішного збереження
 */
// Стейт поточної відкритої модалки (замикання через глобальний об'єкт)
const _oneRowModal = {};

function openRefTableAddModal(refTableName, onSaved) {
    const refTable = database.tables.find(tb => tb.name === refTableName);
    if (!refTable) {
        Message((typeof t === "function" && t("aeditRefTableNotFound")) || `Таблицю "${refTableName}" не знайдено`);
        return;
    }

    const overlay   = document.getElementById("oneRowEditModalOverlay");
    const titleEl   = overlay.querySelector(".modal-title");
    const headerRow = document.getElementById("oneRowEditHeaderRow");
    const dataRow   = document.getElementById("oneRowEditDataRow");

    // Зберігаємо стейт для saveOneRowModal / closeOneRowModal
    _oneRowModal.refTable     = refTable;
    _oneRowModal.refTableName = refTableName;
    _oneRowModal.onSaved      = onSaved;
    _oneRowModal.newRowData   = refTable.schema.map(() => null);

    // ---------- Заголовок ----------
    titleEl.textContent =
        ((typeof t === "function" && t("aeditAddRefTitle")) || "Новий запис") + `: ${refTableName}`;

    // ---------- THEAD ----------
    headerRow.innerHTML = "";
    refTable.schema.forEach(col => {
        const th = document.createElement("th");
        th.style.cssText = "padding:6px 10px;background:#eee;text-align:center;font-weight:600;border:1px solid #777;";
        th.textContent = col.title + (col.primaryKey ? " 🔑" : "");
        headerRow.appendChild(th);
    });

    // ---------- TBODY (один рядок) ----------
    dataRow.innerHTML = "";
    refTable.schema.forEach((col, idx) => {
        const td = document.createElement("td");
        td.style.cssText = "padding:4px;border:1px solid #777;vertical-align:middle;height:1.5em;";

        const _ct = String(col.type || "").toLowerCase();
        const isPKAutoInc = col.primaryKey && col.autoInc === true
            && (_ct === "integer" || _ct === "ціле число" || _ct === "int");

        let defaultValue = null;
        if (isPKAutoInc) {
            let max = 0;
            (refTable.data || []).forEach(row => {
                const val = parseInt(row[idx]);
                if (!isNaN(val)) max = Math.max(max, val);
            });
            defaultValue = max + 1;
            _oneRowModal.newRowData[idx] = defaultValue;

            td.style.background = "var(--pk-auto-bg, #f0f0f0)";
            td.style.color = "var(--pk-auto-color, #888)";
            td.title = (typeof t === "function" && t("aeditPkAutoTitle")) || "Значення генерується автоматично";
        }

        advDataInput(td, defaultValue, col, _oneRowModal.newRowData, idx, isPKAutoInc);
        dataRow.appendChild(td);
    });

    // ---------- Показуємо модалку ----------
    overlay.style.display = "flex";
}

function closeOneRowModal() {
    document.getElementById("oneRowEditModalOverlay").style.display = "none";
    const parentModal = document.getElementById("editModal");
    if (parentModal) {
        parentModal.style.display = "flex";
        parentModal.focus();
    }
}

async function saveOneRowModal() {
    const { refTable, refTableName, onSaved, newRowData } = _oneRowModal;
    if (!refTable) return;

    const cols = [];
    const vals = [];

    refTable.schema.forEach((col, idx) => {
        const _ct = String(col.type || "").toLowerCase();
        const isPKAutoInc = col.primaryKey && col.autoInc
            && (_ct === "integer" || _ct === "ціле число" || _ct === "int");
        if (isPKAutoInc) return;

        cols.push(`"${col.title}"`);
        const v = newRowData[idx];
        if (v === null || v === undefined || v === "") {
            vals.push("NULL");
        } else if (typeof v === "number") {
            vals.push(String(v));
        } else {
            vals.push(`'${String(v).replace(/'/g, "''")}'`);
        }
    });

    if (!cols.length) {
        Message((typeof t === "function" && t("aeditRefNoFields")) || "Немає полів для збереження");
        return;
    }

    const sql = `INSERT INTO "${refTableName}" (${cols.join(", ")}) VALUES (${vals.join(", ")});`;
    try {
        await dba.db.run(sql);

        const res = await dba.db.exec(`SELECT * FROM "${refTableName}"`);
        refTable.data = res.length ? res[0].values : [];

        saveDatabase();
        closeOneRowModal();

        if (typeof onSaved === "function") onSaved();
        Message((typeof t === "function" && t("dataSaved")) || "Запис додано");
    } catch (e) {
        Message((typeof t === "function" && t("aeditRefSaveError")) || `Помилка збереження: ${e.message}`);
    }
}
