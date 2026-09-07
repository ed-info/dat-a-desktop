let isGridVisible = false; // grid visibility
let startX, startY, startWidth, startHeight;
let activeElement = null;
let isDragging = false;
let isResizing = false;
let isDesignerDirty = false; // прапор незбережених змін у конструкторі
let resizeHandle = null;
let initialX, initialY;
let initialLeft, initialTop, initialWidth, initialHeight;
let currentEditElement = null;
// Конструктор звітів та форм
function createConstructor() {
    document.getElementById(constructorMode + "CreatorModal").style.display = "flex";

    let newMode = t("designerNewForm");
    if (constructorMode === "report") newMode = t("designerNewReport");
    document.getElementById(constructorMode + "NameInput").value = newMode;
    screenCanvas = document.getElementById(constructorMode + "Canvas");
    screenCanvas.innerHTML = "";

    document.getElementById("fieldSelectionModal").style.display = "none";
    document.getElementById(constructorMode + "Canvas").classList.remove('grid-visible');
    isGridVisible = false;
    isDesignerDirty = false;
    // Для форм: наповнити спадний список таблиць і скинути вибір
    if (constructorMode === "form") {
        const fts = document.getElementById("formTableSelect");
        if (fts) {
            populateTableSelect(fts, t("designerSelectFormTable"), true);
            fts.value = "";
        }
    }
}
// --- спільна функція наповнення select таблицями/запитами ---
function populateTableSelect(selectEl, placeholder, includeQueries) {
    selectEl.innerHTML = `<option value=''>${placeholder}</option>`;
    database.tables.forEach(table => {
        const option = document.createElement("option");
        option.value = table.name;
        option.textContent = table.name;
        selectEl.appendChild(option);
    });
    if (includeQueries) {
        queries.results.forEach(query => {
            const option = document.createElement("option");
            option.value = `*${query.name}`;
            option.textContent = `*${query.name}`;
            selectEl.appendChild(option);
        });
    }
}
// Застаріла обгортка — лишена для сумісності, якщо викликається ззовні
function populateFieldPanelTableSelect() {
    const el = document.getElementById("fieldPanelTableSelect") || fieldPanelTableSelect;
    populateTableSelect(el, t("designerSelectTableQuery"), true);
}

function cancelFieldSelection() {
    document.getElementById("fieldSelectionModal").style.display = "none";
}
// --- спільна функція для форм і звітів ---
function initFieldPanelListeners(tableSelect, fieldSelect, fieldClass) {
    tableSelect.addEventListener("change", () => {
        const selectedTableName = tableSelect.value;
        const selectedTable = database.tables.find(t => t.name === selectedTableName) || queries.results.find(q => `*${q.name}` === selectedTableName);
        fieldSelect.innerHTML = "<option value=''>" + t("designerSelectField") + "</option>";
        if (selectedTable) {
            selectedTable.schema.forEach(field => {
                const option = document.createElement("option");
                option.value = field.title;
                option.textContent = field.title;
                fieldSelect.appendChild(option);
            });
        }
        if (activeElement && activeElement.classList.contains(fieldClass)) {
            const fieldTextDiv = activeElement.querySelector('.field-text');
            const currentField = activeElement.dataset.fieldName || "";
            if (fieldTextDiv) {
                fieldTextDiv.innerText = selectedTableName ? `${selectedTableName}.${currentField}` : t("designerFieldData");
            }
            activeElement.dataset.tableName = selectedTableName;
        }
    });
    fieldSelect.addEventListener("change", () => {
        // Для форми таблиця визначається через formTableSelect (заблокований)
        const formTableSel = (constructorMode === "form") ? document.getElementById("formTableSelect") : null;
        const selectedTableName = formTableSel ? formTableSel.value : tableSelect.value;
        const selectedFieldName = fieldSelect.value;
        if (activeElement && activeElement.classList.contains(fieldClass) && selectedTableName && selectedFieldName) {
            const fieldTextDiv = activeElement.querySelector('.field-text');
            if (fieldTextDiv) {
                fieldTextDiv.innerText = `${selectedTableName}.${selectedFieldName}`;
            }
            activeElement.dataset.tableName = selectedTableName;
            activeElement.dataset.fieldName = selectedFieldName;
        } else if (activeElement && activeElement.classList.contains(fieldClass)) {
            const fieldTextDiv = activeElement.querySelector('.field-text');
            if (fieldTextDiv) {
                fieldTextDiv.innerText = selectedTableName ? `${selectedTableName}.` : t("designerFieldData");
            }
            delete activeElement.dataset.fieldName;
        }
    });
}
// ЄДИНИЙ DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    const reportCanvas = document.getElementById("reportCanvas");
    const formCanvas = document.getElementById("formCanvas");
    const fieldSelectionModal = document.getElementById("fieldSelectionModal");
    const fieldPanelTableSelect1 = document.getElementById("fieldPanelTableSelect");
    const fieldPanelFieldSelect1 = document.getElementById("fieldPanelFieldSelect");
    // Слухачі для форм і звітів
    initFieldPanelListeners(fieldPanelTableSelect1, fieldPanelFieldSelect1, "form-field");
    initFieldPanelListeners(fieldPanelTableSelect1, fieldPanelFieldSelect1, "report-field");
    // --- Налаштування тексту ---
    document.getElementById("fontFamilySelect").addEventListener("change", (e) => {
        if (activeElement && isTextElement(activeElement)) activeElement.style.fontFamily = e.target.value;
    });
    document.getElementById("fontSizeInput").addEventListener("input", (e) => {
        if (activeElement && isTextElement(activeElement)) activeElement.style.fontSize = `${e.target.value}px`;
    });
    document.getElementById("fontColorInput").addEventListener("input", (e) => {
        if (activeElement && isTextElement(activeElement)) activeElement.style.color = e.target.value;
    });
    document.getElementById("fontWeightToggle").addEventListener("change", (e) => {
        if (activeElement && isTextElement(activeElement)) activeElement.style.fontWeight = e.target.checked ? 'bold' : 'normal';
    });
    document.getElementById("fontStyleToggle").addEventListener("change", (e) => {
        if (activeElement && isTextElement(activeElement)) activeElement.style.fontStyle = e.target.checked ? 'italic' : 'normal';
    });
    document.getElementById("textDecorationUnderline").addEventListener("change", () => {
        if (activeElement && isTextElement(activeElement)) updateTextDecoration();
    });
    document.getElementById("textDecorationStrikethrough").addEventListener("change", () => {
        if (activeElement && isTextElement(activeElement)) updateTextDecoration();
    });
    document.querySelectorAll('input[name="textAlign"]').forEach(radio => {
        radio.addEventListener('change', updateTextAlign);
    });
    // --- Спільні обробники canvas (mousedown / mousemove / mouseup) ---
    function handleCanvasMouseDown(e, elementClass, labelClass, fieldClass, buttonClass) {
        const element = e.target.closest(`.${elementClass}`);
        const handle = e.target.closest(".resize-handle");
        document.querySelectorAll(`.${elementClass}.selected`).forEach(el => el.classList.remove("selected"));
        fieldSelectionModal.style.display = "none";
        closeTextOptionsModal();
        if (element) {
            activeElement = element;
            activeElement.classList.add("selected");
            _updateFilterBtnVisibility();
            const rect = activeElement.getBoundingClientRect();
            initialLeft = activeElement.offsetLeft;
            initialTop = activeElement.offsetTop;
            initialWidth = rect.width;
            initialHeight = rect.height;
            initialX = e.clientX;
            initialY = e.clientY;
            if (handle) {
                isResizing = true;
                resizeHandle = handle;
                element.style.cursor = handle.style.cursor;
            } else {
                isDragging = true;
                element.style.cursor = "grabbing";
                const BORDER_TOLERANCE = 10;
                const elementRect = activeElement.getBoundingClientRect();
                const relativeClickX = e.clientX - elementRect.left;
                const relativeClickY = e.clientY - elementRect.top;
                const nearLeft = relativeClickX < BORDER_TOLERANCE;
                const nearRight = elementRect.width - relativeClickX < BORDER_TOLERANCE;
                const nearTop = relativeClickY < BORDER_TOLERANCE;
                const nearBottom = elementRect.height - relativeClickY < BORDER_TOLERANCE;
                if (activeElement.classList.contains(labelClass)) {
                    if (!nearLeft && !nearRight && !nearTop && !nearBottom) {
                        isDragging = false;
                        element.focus();
                    }
                } else if (activeElement.classList.contains(fieldClass)) {
                    if (!nearLeft && !nearRight && !nearTop && !nearBottom) {
                        fieldSelectionModal.style.display = "flex";
                        populateFieldSelectionPanel();
                        isDragging = false;
                    } else {
                        fieldSelectionModal.style.display = "none";
                    }
                } else if (activeElement.classList.contains(buttonClass)) {
                    if (!nearLeft && !nearRight && !nearTop && !nearBottom) {
                        // Клік в центрі кнопки - не перетягуємо
                        isDragging = false;
                        // Відкриття налаштувань через окремий слухач
                    } else {
                        isDragging = true;
                        element.style.cursor = "grabbing";
                    }
                }
            }
            if (isDragging || isResizing || (activeElement.classList.contains(labelClass) && !isDragging)) {
                e.preventDefault();
            }
        } else {
            activeElement = null;
            _updateFilterBtnVisibility();
        }
    }
    // спільна функція замість дублювання mousemove
    function handleCanvasMouseMove(e) {
        if (!activeElement) return;
        const dx = e.clientX - initialX;
        const dy = e.clientY - initialY;
        if (isDragging) {
            activeElement.style.left = `${initialLeft + dx}px`;
            activeElement.style.top = `${initialTop  + dy}px`;
            // 🆕 Оновлення направляючих при перетягуванні через canvas
            updateSnapGuides(activeElement.parentElement, activeElement);
        } else if (isResizing) {
            let newWidth = initialWidth;
            let newHeight = initialHeight;
            let newLeft = initialLeft;
            let newTop = initialTop;
            if (resizeHandle.classList.contains("bottom-right")) {
                newWidth = Math.max(50, initialWidth + dx);
                newHeight = Math.max(30, initialHeight + dy);
            } else if (resizeHandle.classList.contains("bottom-left")) {
                newWidth = Math.max(50, initialWidth - dx);
                newHeight = Math.max(30, initialHeight + dy);
                newLeft = initialLeft + dx;
            } else if (resizeHandle.classList.contains("top-right")) {
                newWidth = Math.max(50, initialWidth + dx);
                newHeight = Math.max(30, initialHeight - dy);
                newTop = initialTop + dy;
            } else if (resizeHandle.classList.contains("top-left")) {
                newWidth = Math.max(50, initialWidth - dx);
                newHeight = Math.max(30, initialHeight - dy);
                newLeft = initialLeft + dx;
                newTop = initialTop + dy;
            }
            activeElement.style.width = `${newWidth}px`;
            activeElement.style.height = `${newHeight}px`;
            activeElement.style.left = `${newLeft}px`;
            activeElement.style.top = `${newTop}px`;
        }
    }
    // спільна функція замість дублювання mouseup
    function handleCanvasMouseUp() {
        if (activeElement) activeElement.style.cursor = "grab";
        // 🆕 Очищення направляючих при відпусканні мишки на canvas
        clearGuides(screenCanvas);
        isDragging = false;
        isResizing = false;
        resizeHandle = null;
    }
    formCanvas.addEventListener("mousedown", (e) => handleCanvasMouseDown(e, "form-element", "form-label", "form-field", "form-button"));
    formCanvas.addEventListener("mousemove", handleCanvasMouseMove);
    formCanvas.addEventListener("mouseup", handleCanvasMouseUp);
    reportCanvas.addEventListener("mousedown", (e) => handleCanvasMouseDown(e, "report-element", "report-label", "report-field"));
    reportCanvas.addEventListener("mousemove", handleCanvasMouseMove);
    reportCanvas.addEventListener("mouseup", handleCanvasMouseUp);
});
// =============================================
function updateTextAlign() {
    const selected = document.querySelector('input[name="textAlign"]:checked');
    if (activeElement && selected) {
        activeElement.style.textAlign = selected.value;
    }
}

function populateFieldSelectionPanel() {
    console.log("constructorMode=", constructorMode);
    const fieldPanelTableSelect = document.getElementById("fieldPanelTableSelect");
    const fieldPanelFieldSelect = document.getElementById("fieldPanelFieldSelect");
    if (constructorMode === "form") {
        // У режимі форми: таблиця фіксована — беремо з formTableSelect
        const formTableSelect = document.getElementById("formTableSelect");
        const lockedTable = formTableSelect ? formTableSelect.value : "";
        // Наповнюємо список таблиць, але блокуємо вибір
        populateTableSelect(fieldPanelTableSelect, t("designerSelectTable"), true);
        fieldPanelTableSelect.value = lockedTable;
        fieldPanelTableSelect.disabled = true;
        // Наповнюємо список полів для обраної таблиці
        fieldPanelTableSelect.dispatchEvent(new Event('change'));
        // Відновлюємо вибране поле активного елемента
        if (activeElement && activeElement.dataset.fieldName) {
            fieldPanelFieldSelect.value = activeElement.dataset.fieldName;
        } else {
            fieldPanelFieldSelect.value = "";
        }
    } else {
        // Для звітів: звичайна поведінка
        fieldPanelTableSelect.disabled = false;
        populateTableSelect(fieldPanelTableSelect, t("designerSelectTable"), true);
        if (activeElement && activeElement.dataset.tableName) {
            fieldPanelTableSelect.value = activeElement.dataset.tableName;
            fieldPanelTableSelect.dispatchEvent(new Event('change'));
        } else {
            fieldPanelTableSelect.value = "";
        }
        if (activeElement && activeElement.dataset.fieldName) {
            fieldPanelFieldSelect.value = activeElement.dataset.fieldName;
        } else {
            fieldPanelFieldSelect.value = "";
        }
    }
}

function openTextOptions() {
    if (!activeElement || !isTextElement(activeElement)) {
        Message(t("designerSelectTextEl"));
        return;
    }
    const fontFamilySelect = document.getElementById("fontFamilySelect");
    const fontSizeInput = document.getElementById("fontSizeInput");
    const fontColorInput = document.getElementById("fontColorInput");
    const fontWeightToggle = document.getElementById("fontWeightToggle");
    const fontStyleToggle = document.getElementById("fontStyleToggle");
    const textDecorationUnderline = document.getElementById("textDecorationUnderline");
    const textDecorationStrikethrough = document.getElementById("textDecorationStrikethrough");
    const textAlignRadios = document.querySelectorAll('input[name="textAlign"]');
    fontFamilySelect.value = activeElement.style.fontFamily.replace(/['"]/g, '') || 'Arial';
    fontSizeInput.value = parseInt(activeElement.style.fontSize) || 16;
    fontColorInput.value = activeElement.style.color || '#000000';
    fontWeightToggle.checked = activeElement.style.fontWeight === 'bold';
    fontStyleToggle.checked = activeElement.style.fontStyle === 'italic';
    const textDecoration = activeElement.style.textDecoration;
    textDecorationUnderline.checked = textDecoration.includes('underline');
    textDecorationStrikethrough.checked = textDecoration.includes('line-through');
    const currentAlign = activeElement.style.textAlign || 'left';
    textAlignRadios.forEach(radio => {
        radio.checked = radio.value === currentAlign;
    });
    document.getElementById("textOptionsModal").style.display = "flex";
}

function updateTextDecoration() {
    const textDecorationUnderline = document.getElementById("textDecorationUnderline");
    const textDecorationStrikethrough = document.getElementById("textDecorationStrikethrough");
    const decorations = [];
    if (textDecorationUnderline.checked) decorations.push('underline');
    if (textDecorationStrikethrough.checked) decorations.push('line-through');
    if (activeElement) {
        activeElement.style.textDecoration = decorations.join(' ');
    }
}

function isTextElement(el) {
    return el.classList.contains("report-label") || el.classList.contains("report-field") || el.classList.contains("form-label") || el.classList.contains("form-field");
}

function addPx(value) {
    if (typeof value === "number") return value + "px";
    if (typeof value === "string" && !value.endsWith("px") && /^\d+$/.test(value)) {
        return value + "px";
    }
    return value;
}

function looksLikeImageUrl(url) {
    if (typeof url !== "string" || !url.trim()) return false;
    const trimmed = url.trim();
    const imgExts = /\.(jpeg|jpg|gif|png|webp|svg|bmp|ico|tiff?)$/i;
    const isUrl = trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:image/");
    return isUrl && imgExts.test(trimmed);
}

function findTableOrQuery(tableName) {
    return (database.tables.find(t => t.name === tableName) || queries.results.find(q => `*${q.name}` === tableName));
}
/**
 * Додає виділення при кліку і показує маркери
 **/
function initializeCanvasElement(element) {
    element.addEventListener("click", (e) => {
        e.stopPropagation();
        document.querySelectorAll("." + constructorMode + "-element.selected").forEach(el => {
            el.classList.remove("selected");
            el.querySelectorAll(".resize-handle").forEach(h => h.remove());
        });
        element.classList.add("selected");
        addResizeHandles(element);
    });
}

// === ЛОГІКА ТАБЛИЦІ В КОНСТРУКТОРІ ===
let activeTableElement = null;

function addScreenTable() {
    const canvas = screenCanvas;
    const cm = constructorMode;
    const el = document.createElement("div");
    el.className = `${cm}-element ${cm}-table`;
    el.dataset.type = "table";
    el.dataset.tableName = "";
    el.dataset.selectedFields = "[]";
    Object.assign(el.style, {
        position: "absolute",
        left: "80px",
        top: "100px",
        width: "340px",
        height: "200px",
        border: "1px dashed  #0000ff",
        backgroundColor: "#fffaf0",
        cursor: "grab",
        boxSizing: "border-box",
        padding: "4px"
    });
    el.innerHTML = `<div style="color:#888; text-align:center; margin-top:35%; font-size:13px; pointer-events:none;">📊 ${t("designerClickToConfigure")}</div>`;
    canvas.appendChild(el);
    addResizeHandles(el);
    makeDraggableAndResizable(el);
    isDesignerDirty = true;
    // Оновлений обробник кліку з перевіркою відстані від меж
    el.addEventListener("click", (e) => {
        if (e.target.classList.contains("resize-handle")) return;
        e.stopPropagation();
        // Перевірка: чи клік на відстані не менше 10px від меж
        const rect = el.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        const BORDER_TOLERANCE = 10;
        const nearBorder = clickX < BORDER_TOLERANCE || clickX > rect.width - BORDER_TOLERANCE || clickY < BORDER_TOLERANCE || clickY > rect.height - BORDER_TOLERANCE;
        // Якщо клік не біля межі - відкриваємо налаштування
        if (!nearBorder) {
            activeElement = el;
            activeTableElement = el;
            _updateFilterBtnVisibility();
            openTableFieldModal();
        }
    });
}

// Створення кнопки
function addScreenButton() {
    const canvas = screenCanvas;
    const cm = constructorMode;
    const button = document.createElement("div");
    button.className = `${cm}-element ${cm}-button form-button`;
    button.dataset.type = "button";
    button.dataset.buttonText = t("designerDefaultButton");
    button.dataset.textColor = "#ffffff";
    button.dataset.bgColor = "#007bff";
    button.dataset.borderColor = "#0056b3";
    Object.assign(button.style, {
        position: "absolute",
        left: "80px",
        top: "140px",
        width: "120px",
        height: "40px",
        backgroundColor: "#007bff",
        color: "#ffffff",
        border: "2px solid #0056b3",
        borderRadius: "5px",
        cursor: "grab",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Arial",
        fontSize: "14px",
        fontWeight: "normal",
        boxSizing: "border-box",
        padding: "0 10px",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis"
    });
    button.textContent = t("designerDefaultButton");
    // Додаємо обробник кліку для відкриття налаштувань
    button.addEventListener("click", (e) => {
        // Перевіряємо, чи клік не на маркері зміни розміру
        if (e.target.classList.contains("resize-handle")) return;
        const rect = button.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        const BORDER_TOLERANCE = 10;
        const nearBorder = clickX < BORDER_TOLERANCE || clickX > rect.width - BORDER_TOLERANCE || clickY < BORDER_TOLERANCE || clickY > rect.height - BORDER_TOLERANCE;
        if (!nearBorder) {
            activeElement = button;
            openButtonSettingsModal();
        }
    });
    canvas.appendChild(button);
    addResizeHandles(button);
    makeDraggableAndResizable(button);
    isDesignerDirty = true;
}
// Функція відкриття модального вікна налаштувань кнопки
function openButtonSettingsModal() {
    if (!activeElement || !activeElement.classList.contains("form-button")) {
        Message(t("designerSelectButton"));
        return;
    }
    console.log("activeElement.dataset.buttonText=",activeElement.dataset.buttonText)
    document.getElementById("buttonTextInput").value = activeElement.dataset.buttonText || t("designerDefaultButton");
    document.getElementById("buttonTextColorInput").value = activeElement.dataset.textColor || "#ffffff";
    document.getElementById("buttonBgColorInput").value = activeElement.dataset.bgColor || "#007bff";
    document.getElementById("buttonBorderColorInput").value = activeElement.dataset.borderColor || "#0056b3";
    // --- Наповнення списків форм і запитів ---
    const formSel = document.getElementById("btnActionFormSelect");
    formSel.innerHTML = `<option value="">${t("designerSelectForm")}</option>`;
    (database.forms || []).forEach(f => {
        const opt = document.createElement("option");
        opt.value = f.name;
        opt.textContent = f.name;
        formSel.appendChild(opt);
    });
    const querySel = document.getElementById("btnActionQuerySelect");
    querySel.innerHTML = `<option value="">${t("designerSelectQuery")}</option>`;
    (queries.definitions || []).forEach(q => {
        const opt = document.createElement("option");
        opt.value = q.name;
        opt.textContent = q.name;
        querySel.appendChild(opt);
    });
    // --- Відновлення збереженої дії ---
    const savedAction = activeElement.dataset.buttonAction || "none";
    const savedTarget = activeElement.dataset.buttonActionTarget || "";
    document.querySelectorAll('input[name="btnAction"]').forEach(r => {
        r.checked = (r.value === savedAction);
    });
    formSel.value = (savedAction === "openForm") ? savedTarget : "";
    querySel.value = (savedAction === "runQuery") ? savedTarget : "";
    // --- Показ/сховок спадних списків ---
    _updateBtnActionSelects(savedAction);
    // --- Обробники радіокнопок ---
    document.querySelectorAll('input[name="btnAction"]').forEach(r => {
        r.onchange = () => _updateBtnActionSelects(r.value);
    });
    document.getElementById("buttonSettingsModal").style.display = "flex";
}

function _updateBtnActionSelects(action) {
    document.getElementById("btnActionFormSelect").style.display = (action === "openForm") ? "block" : "none";
    document.getElementById("btnActionQuerySelect").style.display = (action === "runQuery") ? "block" : "none";
}
// Функція збереження налаштувань кнопки
function saveButtonSettings() {
    if (!activeElement || !activeElement.classList.contains("form-button")) return;
    const text = document.getElementById("buttonTextInput").value;
    const textColor = document.getElementById("buttonTextColorInput").value;
    const bgColor = document.getElementById("buttonBgColorInput").value;
    const borderColor = document.getElementById("buttonBorderColorInput").value;
    // Зчитуємо дію
    const actionRadio = document.querySelector('input[name="btnAction"]:checked');
    const action = actionRadio ? actionRadio.value : "none";
    let actionTarget = "";
    if (action === "openForm") actionTarget = document.getElementById("btnActionFormSelect").value;
    if (action === "runQuery") actionTarget = document.getElementById("btnActionQuerySelect").value;
    activeElement.dataset.buttonText = text;
    activeElement.dataset.textColor = textColor;
    activeElement.dataset.bgColor = bgColor;
    activeElement.dataset.borderColor = borderColor;
    activeElement.dataset.buttonAction = action;
    activeElement.dataset.buttonActionTarget = actionTarget;
    // ⚠️ Цей рядок видаляє ВСІ дочірні вузли, включаючи маркери (.resize-handle)
    activeElement.textContent = text;
    activeElement.style.color = textColor;
    activeElement.style.backgroundColor = bgColor;
    activeElement.style.border = `2px solid ${borderColor}`;
    // ✅ Відновлюємо маркери та переналаштовуємо обробники drag/resize
    addResizeHandles(activeElement);
    makeDraggableAndResizable(activeElement);
    isDesignerDirty = true;
    closeButtonSettingsModal();
}

function closeButtonSettingsModal() {
    document.getElementById("buttonSettingsModal").style.display = "none";
}

function openTableFieldModal() {
    if (!activeTableElement) return;
    populateTableFieldModal();
    document.getElementById("tableFieldModal").style.display = "flex";
}

function closeTableFieldModal() {
    document.getElementById("tableFieldModal").style.display = "none";
    activeTableElement = null;
}

function populateTableFieldModal() {
    const sel = document.getElementById("tableFieldTableSelect");
    sel.innerHTML = `<option value="">${t("designerSelectTable")}</option>`;

    // Заповнюємо список таблиць
    database.tables.forEach(tbl => {
        const opt = document.createElement("option");
        opt.value = tbl.name;
        opt.textContent = tbl.name;
        sel.appendChild(opt);
    });
    if (constructorMode === "report") {
        queries.results.forEach(q => {
            const opt = document.createElement("option");
            opt.value = `*${q.name}`;
            opt.textContent = `*${q.name}`;
            sel.appendChild(opt);
        });
    }

    // 🔒 ЛОГІКА ДЛЯ ФОРМ: жорстко фіксуємо таблицю з formTableSelect
    if (constructorMode === "form") {
        const formTableSel = document.getElementById("formTableSelect");
        const lockedTable = formTableSel ? formTableSel.value : "";
        
        sel.value = lockedTable;
        sel.disabled = true;          // Блокуємо візуально
        sel.onchange = null;          // Вимикаємо обробник зміни
        
        // Синхронізуємо dataset елемента, щоб уникнути розбіжностей
        if (activeTableElement) activeTableElement.dataset.tableName = lockedTable;
    } else {
        // Для звітів: звичайна поведінка
        const currentTable = activeTableElement.dataset.tableName || "";
        if (currentTable) sel.value = currentTable;
        sel.disabled = false;
        sel.onchange = () => renderTableFieldCheckboxes(sel.value);
    }

    renderTableFieldCheckboxes(sel.value);
}

function renderTableFieldCheckboxes(tableName) {
    const container = document.getElementById("tableFieldCheckboxes");
    container.innerHTML = "";
    if (!tableName) return;
    const cleanName = tableName.startsWith('*') ? tableName.substring(1) : tableName;
    const table = database.tables.find(t => t.name === cleanName) || queries.results.find(q => q.name === cleanName);
    if (!table) return;
    const savedFields = JSON.parse(activeTableElement.dataset.selectedFields || "[]");
    table.schema.forEach(col => {
        const label = document.createElement("label");
        label.style.display = "flex";
        label.style.alignItems = "center";
        label.style.gap = "6px";
        label.style.cursor = "pointer";
        label.style.padding = "4px 0";
        label.style.fontSize = "13px";
        label.style.whiteSpace = "nowrap";
        const chk = document.createElement("input");
        chk.type = "checkbox";
        chk.value = col.title;
        chk.id = `chk_${col.title.replace(/\s/g, '_')}`;
        chk.checked = savedFields.length === 0 || savedFields.includes(col.title);
        chk.style.cursor = "pointer";
        chk.style.width = "16px";
        chk.style.height = "16px";
        const span = document.createElement("span");
        span.textContent = col.title;
        span.style.cursor = "pointer";
        span.style.overflow = "hidden";
        span.style.textOverflow = "ellipsis";
        label.appendChild(chk);
        label.appendChild(span);
        container.appendChild(label);
    });
}

function saveTableSelection() {
    const tableName = document.getElementById("tableFieldTableSelect").value;
    if (!tableName) {
        Message(t("designerSelectTableOrQuery"));
        return;
    }
    const checked = [...document.getElementById("tableFieldCheckboxes").querySelectorAll("input[type=checkbox]:checked")].map(c => c.value);
    if (checked.length === 0) {
        Message(t("designerSelectAtLeastOne"));
        return;
    }
    activeTableElement.dataset.tableName = tableName;
    activeTableElement.dataset.selectedFields = JSON.stringify(checked);
    isDesignerDirty = true;
    renderTablePreviewInDesigner(activeTableElement, tableName, checked);
    closeTableFieldModal();
}
// Легкий прев'ю на canvas (не викликає editData, щоб не гальмувати UI)
function renderTablePreviewInDesigner(container, tableName, fields) {
    // Зберігаємо позицію/розміри та наявність маркерів
    const hadHandles = container.querySelectorAll(".resize-handle").length > 0;
    const savedLeft   = container.style.left;
    const savedTop    = container.style.top;
    const savedWidth  = container.style.width;
    const savedHeight = container.style.height;

    container.innerHTML = "";

    // Відновлюємо позицію та розміри
    container.style.left   = savedLeft;
    container.style.top    = savedTop;
    container.style.width  = savedWidth;
    container.style.height = savedHeight;
    container.style.border = "1px dashed  #0000ff";
    //container.style.display        = "flex";
    //container.style.flexDirection  = "column";
    //container.style.overflow       = "hidden";
    container.style.boxSizing      = "border-box";

    const result = findTableOrQueryResult(tableName);
    if (!result || !result.table) {
        container.innerHTML = `<div style="color:#888;text-align:center;margin-top:35%;font-size:13px;pointer-events:none;">${t("designerTableNotFound")}</div>`;
        if (hadHandles) addResizeHandles(container);
        return;
    }

    const table  = result.table;
    // Відображаємо обрані поля; якщо поля не обрані — всі колонки
    const cols   = (fields && fields.length > 0) ? fields : table.schema.map(c => c.title);
    // Кількість рядків-заглушок (3 або менше якщо даних немає)
    const rowCount = Math.min(Math.max(table.data?.length || 0, 3), 5);

    // ── Таблиця ─────────────────────────────────────────────────────────────
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "flex:1;overflow:hidden;pointer-events:none;";

    const tbl = document.createElement("table");
    tbl.style.cssText = "width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed;";

    // Заголовок — реальні назви полів
    const thead = document.createElement("thead");
    const trHead = document.createElement("tr");
    cols.forEach(f => {
        const th = document.createElement("th");
        th.textContent = f;
        th.style.cssText = `
            border: 1px solid #bbb;
            padding: 3px 4px;
            background: #dde4ee;
            font-size: 11px;
            text-align: center;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        `;
        trHead.appendChild(th);
    });
    thead.appendChild(trHead);
    tbl.appendChild(thead);

    // Тіло — сірі прямокутники-заглушки, кожен ряд світліший за попередній
    const tbody = document.createElement("tbody");
    const BASE_L = 176; // #b0b8c8 ≈ rgb(176,184,200)
    const STEP   = 14;
    for (let rowIdx = 0; rowIdx < rowCount; rowIdx++) {
        const lv  = Math.min(BASE_L + rowIdx * STEP, 238); // не світліше #eeeeee
        const barL = Math.max(lv - 28, 120);
        const barColor = `rgb(${barL},${barL+2},${barL+10})`;

        const tr = document.createElement("tr");
        cols.forEach(() => {
            const td = document.createElement("td");
            td.style.cssText = `
                border: 1px solid #ccc;
                padding: 4px 5px;
                overflow: hidden;
            `;
            // Сірий прямокутник-заглушка всередині комірки
            const bar = document.createElement("div");
            bar.style.cssText = `
                height: 9px;                
                background: ${barColor};
                width: ${70 + ((rowIdx * 13 + cols.indexOf ? 0 : 0)) % 25}%;
                min-width: 20px;
            `;
            td.appendChild(bar);
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    }
    tbl.appendChild(tbody);
    wrapper.appendChild(tbl);
    container.appendChild(wrapper);

    // Підпис "Таблиця. <назва>" над нижнім краєм 
    const label = document.createElement("div");
    label.textContent = (t("designerTableLabel") || "Таблиця.") + " " + tableName;
    label.style.cssText = `
        font-size: 12px;
        color: #111;
        padding: 2px 5px;
        margin-top: 10px;
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex-shrink: 0;
        pointer-events: none;
        border-top: 1px dashed #ccc;
    `;
    container.appendChild(label);

    // Відновлюємо маркери зміни розміру
    if (hadHandles) addResizeHandles(container);
}
/**
 * Відтворення об'єктів збереженого звіту/форми
 **/
function renderCanvas(stored) {
    const cm = constructorMode;
    const cNameInput = document.getElementById(cm + "NameInput");
    const cCanvas = document.getElementById(cm + "Canvas");
    cNameInput.value = stored.name;
    cCanvas.innerHTML = "";
    isDesignerDirty = false;
    stored.elements.forEach(el => {
        // --- Графічні фігури ---
        if (el.type === "shape") {
            const div = document.createElement("div");
            div.classList.add(cm + "-element", cm + "-shape", "shape-" + el.shapeType);
            div.dataset.shapeType = el.shapeType;
            div.dataset.strokeColor = el.strokeColor || "#333333";
            div.dataset.fillColor = el.fillColor || "#ffffff";
            div.dataset.fillTransparent = el.fillTransparent ? "1" : "0";
            div.style.position = "absolute";
            div.style.cursor = "grab";
            div.style.boxSizing = "border-box";
            _applyShapeStyles(div, el.shapeType, el.strokeColor || "#333333", el.fillColor || "#ffffff", el.fillTransparent);
            div.style.left = el.left + "px";
            div.style.top = el.top + "px";
            div.style.width = el.width + "px";
            div.style.height = el.height + "px";
            // Фігури вставляємо на початок canvas (під текст)
            const firstNonShape = [...cCanvas.children].find(c => !c.classList.contains(cm + "-shape") && !c.classList.contains("guide-container"));
            if (firstNonShape) cCanvas.insertBefore(div, firstNonShape);
            else cCanvas.appendChild(div);
            addResizeHandles(div);
            makeDraggableAndResizable(div);
            return;
        }
        // обробка кнопок у renderCanvas
        if (el.type === "button") {
            const div = document.createElement("div");
            div.classList.add(cm + "-element", cm + "-button", "form-button");
            div.dataset.type = "button";
            div.dataset.buttonText = el.text || t("designerDefaultButton");
            div.dataset.textColor = el.textColor || "#ffffff";
            div.dataset.bgColor = el.bgColor || "#007bff";
            div.dataset.borderColor = el.borderColor || "#0056b3";
            div.dataset.buttonAction = el.buttonAction || "none";
            div.dataset.buttonActionTarget = el.buttonActionTarget || "";
            Object.assign(div.style, {
                position: "absolute",
                left: el.left + "px",
                top: el.top + "px",
                width: el.width + "px",
                height: el.height + "px",
                backgroundColor: el.bgColor || "#007bff",
                color: el.textColor || "#ffffff",
                border: `2px solid ${el.borderColor || "#0056b3"}`,
                borderRadius: "5px",
                cursor: "grab",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: el.fontFamily || "Arial",
                fontSize: el.fontSize || "14px",
                fontWeight: el.fontWeight || "normal",
                boxSizing: "border-box",
                padding: "0 10px",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis"
            });
            div.textContent = el.text || t("designerDefaultButton");
            div.addEventListener("click", (e) => {
                if (e.target.classList.contains("resize-handle")) return;
                const rect = div.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const clickY = e.clientY - rect.top;
                const BORDER_TOLERANCE = 10;
                const nearBorder = clickX < BORDER_TOLERANCE || clickX > rect.width - BORDER_TOLERANCE || clickY < BORDER_TOLERANCE || clickY > rect.height - BORDER_TOLERANCE;
                if (!nearBorder) {
                    activeElement = div;
                    openButtonSettingsModal();
                }
            });
            cCanvas.appendChild(div);
            addResizeHandles(div);
            makeDraggableAndResizable(div);
            return;
        }
        if (el.type === "table") {
            const div = document.createElement("div");
            div.className = `${cm}-element ${cm}-table`;
            Object.assign(div.style, {
                position: "absolute",
                left: el.left + "px",
                top: el.top + "px",
                width: el.width + "px",
                height: el.height + "px",
                border: "1px solid #0000ff",
                backgroundColor: "#fffaf0",
                cursor: "grab",
                boxSizing: "border-box",
                padding: "4px"
            });
            div.dataset.type = "table";
            div.dataset.tableName = el.tableName || "";
            div.dataset.selectedFields = JSON.stringify(el.selectedFields || []);
            div.dataset.filterConfig = el.filterConfig ? JSON.stringify(el.filterConfig) : ""; // Відновлення конфігу
            // Відновлюємо збережений фільтр
            div.dataset.filterActive = el.filterActive ? "1" : "0";
            if (el.filterActive && Array.isArray(el.filteredRows) && el.filteredRows.length > 0) {
                div.dataset.filteredRows = JSON.stringify(el.filteredRows);
                const _fRes = findTableOrQueryResult(el.tableName);
                const _fTotal = _fRes ? _fRes.table.data.length : 0;
                // Значок буде доданий після рендерингу прев'ю нижче
            }
            // Оновлений обробник кліку з перевіркою відстані від меж
            div.addEventListener("click", (e) => {
                if (e.target.classList.contains("resize-handle")) return;
                e.stopPropagation();
                // Перевірка: чи клік на відстані не менше 10px від меж
                const rect = div.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const clickY = e.clientY - rect.top;
                const BORDER_TOLERANCE = 10;
                const nearBorder = clickX < BORDER_TOLERANCE || clickX > rect.width - BORDER_TOLERANCE || clickY < BORDER_TOLERANCE || clickY > rect.height - BORDER_TOLERANCE;
                // Якщо клік не біля межі - відкриваємо налаштування
                if (!nearBorder) {
                    activeElement = div;
                    activeTableElement = div;
                    _updateFilterBtnVisibility();
                    openTableFieldModal();
                }
            });
            if (el.tableName && el.selectedFields) {
                renderTablePreviewInDesigner(div, el.tableName, el.selectedFields);
                // Відновлюємо значок фільтра якщо він був активний
                if (el.filterActive && Array.isArray(el.filteredRows) && el.filteredRows.length > 0) {
                    const _fRes2 = findTableOrQueryResult(el.tableName);
                    const _fTotal2 = _fRes2 ? _fRes2.table.data.length : 0;
                    _markTableFilteredInDesigner(div, el.filteredRows.length, _fTotal2);
                }
            }
            else div.innerHTML = `<div style="color:#888; text-align:center; margin-top:35%; font-size:13px; pointer-events:none;">📊 ${t("designerClickToConfigure")}</div>`;
            cCanvas.appendChild(div);
            addResizeHandles(div);
            makeDraggableAndResizable(div);
            return;
        }
        // --- Елементи зображень ---
        if (el.type === "image") {
            const div = document.createElement("div");
            div.classList.add(cm + "-element", cm + "-image");
            div.dataset.imageUrl = el.imageUrl || "";
            // Відновлюємо blob-дані якщо є
            // Відновлюємо _imageBlob: новий формат (Base64) → застарілий (масив) → null
            div._imageBlob = el.imageBlobB64
                ? base64ToUint8Array(el.imageBlobB64)
                : (el.imageBlob instanceof Uint8Array && el.imageBlob.length > 0)
                    ? el.imageBlob
                    : (Array.isArray(el.imageBlob) && el.imageBlob.length > 0)
                        ? new Uint8Array(el.imageBlob)
                        : null;
            Object.assign(div.style, {
                position: "absolute",
                left: el.left + "px",
                top: el.top + "px",
                width: el.width + "px",
                height: el.height + "px",
                border: "2px dashed #888",
                cursor: "grab",
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
            });
            // Відображаємо вміст через загальну функцію
            _updateImageElement(div, div.dataset.imageUrl || null, div._imageBlob);
            _attachImageClickHandler(div);
            cCanvas.appendChild(div);
            addResizeHandles(div);
            makeDraggableAndResizable(div);
            return;
        }
        // --- Текстові елементи ---
        const div = document.createElement("div");
        div.classList.add(cm + "-element");
        div.style.position = "absolute";
        div.style.left = el.left + "px";
        div.style.top = el.top + "px";
        div.style.width = el.width + "px";
        div.style.height = el.height + "px";
        div.style.cursor = "grab";
        div.style.boxSizing = "border-box";
        div.style.fontFamily = el.fontFamily;
        div.style.fontSize = el.fontSize;
        div.style.fontWeight = el.fontWeight;
        div.style.fontStyle = el.fontStyle;
        div.style.textDecoration = el.textDecoration;
        div.style.color = el.color;
        div.style.border = "1px dashed rgb(0, 0, 255)";
        if (el.type === "field") {
            div.classList.add(cm + "-field");
            div.dataset.fieldName = el.fieldName;
            div.dataset.tableName = el.tableName;            
            div.style.backgroundColor = "rgba(144, 238, 144, 0.3)";
            const fieldText = document.createElement("div");
            fieldText.classList.add("field-text");
            fieldText.innerText = `${el.tableName}.${el.fieldName}`;
            div.appendChild(fieldText);
        } else if (el.type === "label") {
            div.classList.add(cm + "-label");
            div.contentEditable = "false";
            div.innerText = el.text;
            div.style.backgroundColor = "rgba(240,240,240,0.8)";
        }
        cCanvas.appendChild(div);
        initializeCanvasElement(div);
        makeDraggableAndResizable(div);
    });
}
// Додаємо напис
function addScreenLabel() {
    const labelElement = document.createElement("div");
    labelElement.className = constructorMode + "-element " + constructorMode + "-label";
    Object.assign(labelElement.style, {
        position: "absolute",
        right: "10px",
        top: "10px",
        width: "150px",
        height: "40px",
        border: "1px dashed rgb(0, 0, 255)",
        backgroundColor: "rgba(173, 216, 230, 0.3)",
        padding: "5px",
        cursor: "grab",
        boxSizing: "border-box"
    });
    labelElement.contentEditable = "false";
    labelElement.innerText = t("designerNewLabel");
    screenCanvas.appendChild(labelElement);
    addResizeHandles(labelElement);
    makeDraggableAndResizable(labelElement);
    isDesignerDirty = true;
}
// Додаємо поле
function addScreenField() {
    const fieldElement = document.createElement("div");
    fieldElement.className = constructorMode + "-element " + constructorMode + "-field";
    Object.assign(fieldElement.style, {
        position: "absolute",
        right: "10px",
        top: "60px",
        width: "200px",
        height: "40px",
        border: "1px dashed rgb(0, 0, 255)",
        backgroundColor: "rgba(144,238,144,0.3)",
        padding: "5px",
        cursor: "grab",
        boxSizing: "border-box"
    });
    const fieldText = document.createElement("div");
    fieldText.className = "field-text";
    fieldText.innerText = t("designerFieldDefault");
    fieldElement.appendChild(fieldText);
    addResizeHandles(fieldElement);
    fieldElement.addEventListener("click", () => {
        selectedFormField = fieldElement;
    });
    screenCanvas.appendChild(fieldElement);
    makeDraggableAndResizable(fieldElement);
    isDesignerDirty = true;
}

function editLabel(el) {
    currentEditElement = el;
    const modal = document.getElementById("editLabelModal");
    const input = document.getElementById("editInput");
    input.value = el.innerText;
    modal.style.display = "flex";
    input.focus();
}
// Кнопка Ok
function textOk() {
    if (currentEditElement) {
        currentEditElement.innerText = document.getElementById("editInput").value;
        currentEditElement.querySelectorAll(".resize-handle").forEach(h => h.remove());
        addResizeHandles(currentEditElement);
        isDesignerDirty = true;
    }
    document.getElementById("editLabelModal").style.display = "none";
    currentEditElement = null;
}
// Кнопка Скасувати
function textCancel() {
    document.getElementById("editLabelModal").style.display = "none";
    currentEditElement = null;
}

//SNAP GUIDES (НАПРАВЛЯЮЧІ ЛІНІЇ) 
function getGuideContainer(canvas) {
    let container = canvas.querySelector('.guide-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'guide-container';
        Object.assign(container.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: '9999',
            boxSizing: 'border-box',
            overflow: 'hidden'
        });
        canvas.appendChild(container);
    }
    return container;
}

function clearGuides(canvas) {
    const container = canvas?.querySelector('.guide-container');
    if (container) container.innerHTML = '';
}

function drawGuide(canvas, x1, y1, x2, y2) {
    const container = getGuideContainer(canvas);
    const line = document.createElement('div');
    const isHorizontal = Math.abs(y1 - y2) < 1;
    Object.assign(line.style, {
        position: 'absolute',
        backgroundColor: '#e040fb',
        zIndex: '10000',
        pointerEvents: 'none'
    });
    if (isHorizontal) {
        line.style.left = Math.min(x1, x2) + 'px';
        line.style.top = Math.round(y1) + 'px';
        line.style.width = Math.abs(x2 - x1) + 'px';
        line.style.height = '1px';
    } else {
        line.style.left = Math.round(x1) + 'px';
        line.style.top = Math.min(y1, y2) + 'px';
        line.style.width = '1px';
        line.style.height = Math.abs(y2 - y1) + 'px';
    }
    container.appendChild(line);
}

function updateSnapGuides(canvas, movingEl) {
    clearGuides(canvas);
    const threshold = 10;
    const siblings = [...canvas.children].filter(el => el !== movingEl && (el.classList.contains('form-element') || el.classList.contains('report-element')));
    const m = {
        l: movingEl.offsetLeft,
        t: movingEl.offsetTop,
        r: movingEl.offsetLeft + movingEl.offsetWidth,
        b: movingEl.offsetTop + movingEl.offsetHeight
    };
    siblings.forEach(sib => {
        const s = {
            l: sib.offsetLeft,
            t: sib.offsetTop,
            r: sib.offsetLeft + sib.offsetWidth,
            b: sib.offsetTop + sib.offsetHeight
        };
        const checkAndDraw = (v1, v2, isHoriz) => {
            if (Math.abs(v1 - v2) < threshold) {
                let x1, y1, x2, y2;
                if (isHoriz) {
                    y1 = y2 = v1;
                    x1 = Math.min(m.l, s.l);
                    x2 = Math.max(m.r, s.r);
                } else {
                    x1 = x2 = v1;
                    y1 = Math.min(m.t, s.t);
                    y2 = Math.max(m.b, s.b);
                }
                drawGuide(canvas, x1, y1, x2, y2);
            }
        };
        // 8 комбінацій вирівнювання
        checkAndDraw(m.t, s.t, true);
        checkAndDraw(m.b, s.b, true);
        checkAndDraw(m.t, s.b, true);
        checkAndDraw(m.b, s.t, true);
        checkAndDraw(m.l, s.l, false);
        checkAndDraw(m.r, s.r, false);
        checkAndDraw(m.l, s.r, false);
        checkAndDraw(m.r, s.l, false);
    });
}
/**
 * Зробити об'єкт перетягуваним, зі зміною розмірів та можливістю редагування вмісту
 **/
function makeDraggableAndResizable(el) {
    const parent = el.parentElement;
    // === DRAG ===
    let offsetX, offsetY, dragging = false;
    el.addEventListener("mousedown", startDrag);
    el.addEventListener("touchstart", startDrag);

    function startDrag(e) {
        if (e.target.classList.contains("resize-handle")) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const rect = el.getBoundingClientRect();
        if (el.classList.contains("report-label") || el.classList.contains("form-label")) {
            const dXY = 10;
            const inRect = (clientX > rect.left + dXY && clientX < rect.right - dXY && clientY > rect.top + dXY && clientY < rect.bottom - dXY);
            if (inRect) {
                editLabel(el);
                stopDrag();
                dragging = false;
                return;
            }
        }
        dragging = true;
        offsetX = clientX - rect.left;
        offsetY = clientY - rect.top;
        document.addEventListener("mousemove", onDrag);
        document.addEventListener("mouseup", stopDrag);
        document.addEventListener("touchmove", onDrag, {
            passive: false
        });
        document.addEventListener("touchend", stopDrag);
    }

    function onDrag(e) {
        if (!dragging) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const parentRect = parent.getBoundingClientRect();
        const left = clientX - parentRect.left - offsetX;
        const top = clientY - parentRect.top - offsetY;
        el.style.left = Math.max(0, left) + "px";
        el.style.top = Math.max(0, top) + "px";
        isDesignerDirty = true;
        // 🆕 Оновлення направляючих під час переміщення
        updateSnapGuides(parent, el);
    }

    function stopDrag() {
        dragging = false;
        // 🆕 Миттєве прибирання направляючих після відпускання
        clearGuides(parent);
        document.removeEventListener("mousemove", onDrag);
        document.removeEventListener("mouseup", stopDrag);
        document.removeEventListener("touchmove", onDrag);
        document.removeEventListener("touchend", stopDrag);
    }
    // === RESIZE ===
    const handles = el.querySelectorAll(".resize-handle");
    handles.forEach(handle => {
        handle.addEventListener("mousedown", startResize);
        handle.addEventListener("touchstart", startResize);

        function startResize(e) {
            e.stopPropagation();
            const rect = el.getBoundingClientRect();
            const parentRect = parent.getBoundingClientRect();
            const startX = e.touches ? e.touches[0].clientX : e.clientX;
            const startY = e.touches ? e.touches[0].clientY : e.clientY;
            const startW = rect.width;
            const startH = rect.height;
            const startL = rect.left - parentRect.left;
            const startT = rect.top - parentRect.top;
            const pos = handle.classList[1];

            function onResize(ev) {
                const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
                const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;
                const dx = clientX - startX;
                const dy = clientY - startY;
                if (pos.includes("right")) el.style.width = Math.max(40, startW + dx) + "px";
                if (pos.includes("bottom")) el.style.height = Math.max(20, startH + dy) + "px";
                if (pos.includes("left")) {
                    el.style.width = Math.max(40, startW - dx) + "px";
                    el.style.left = Math.max(0, startL + dx) + "px";
                }
                if (pos.includes("top")) {
                    el.style.height = Math.max(20, startH - dy) + "px";
                    el.style.top = Math.max(0, startT + dy) + "px";
                }
                isDesignerDirty = true;
            }

            function stopResize() {
                document.removeEventListener("mousemove", onResize);
                document.removeEventListener("mouseup", stopResize);
                document.removeEventListener("touchmove", onResize);
                document.removeEventListener("touchend", stopResize);
            }
            document.addEventListener("mousemove", onResize);
            document.addEventListener("mouseup", stopResize);
            document.addEventListener("touchmove", onResize);
            document.addEventListener("touchend", stopResize);
        }
    });
}
//
function findTableOrQueryResult(tableName) {
    if (!tableName) return null;
    let table = database.tables.find(t => t.name === tableName);
    if (table) return {
        table,
        isQuery: false
    };
    const cleanName = tableName.startsWith('*') ? tableName.substring(1) : tableName;
    let queryResult = queries.results.find(q => q.name === cleanName);
    if (queryResult) return {
        table: queryResult,
        isQuery: true
    };
    return null;
}

// === ГРАФІЧНІ ОБ'ЄКТИ (ФІГУРИ) ===
let _shapeStrokeColor = "#333333";
let _shapeFillColor = "#ffffff";
let _shapeFillTransparent = false;
/**
 * Створює графічний об'єкт на canvas.
 * shapeType: "rect" | "round-rect" | "hline" | "vline"
 */
function _createShape(shapeType) {
    const canvas = screenCanvas;
    const cm = constructorMode;
    const el = document.createElement("div");
    el.classList.add(cm + "-element", cm + "-shape", "shape-" + shapeType);
    el.dataset.shapeType = shapeType;
    el.dataset.strokeColor = _shapeStrokeColor;
    el.dataset.fillColor = _shapeFillColor;
    el.dataset.fillTransparent = _shapeFillTransparent ? "1" : "0";
    el.style.position = "absolute";
    el.style.cursor = "grab";
    el.style.boxSizing = "border-box";
    // Графічні об'єкти завжди під текстом — через порядок DOM:
    // вставляємо перед першим не-shape елементом
    const firstNonShape = [...canvas.children].find(c => !c.classList.contains(cm + "-shape") && !c.classList.contains("guide-container"));
    _applyShapeStyles(el, shapeType, _shapeStrokeColor, _shapeFillColor, _shapeFillTransparent);
    if (firstNonShape) {
        canvas.insertBefore(el, firstNonShape);
    } else {
        canvas.appendChild(el);
    }
    addResizeHandles(el);
    makeDraggableAndResizable(el);
    isDesignerDirty = true;
    return el;
}

function _applyShapeStyles(el, shapeType, strokeColor, fillColor, fillTransparent) {
    const fill = fillTransparent ? "transparent" : fillColor;
    if (shapeType === "hline") {
        el.style.width = "200px";
        el.style.height = "8px";
        el.style.borderTop = `2px solid ${strokeColor}`;
        el.style.borderLeft = "none";
        el.style.borderRight = "none";
        el.style.borderBottom = "none";
        el.style.backgroundColor = "transparent";
        el.style.borderRadius = "0";
        el.style.left = "20px";
        el.style.top = "20px";
    } else if (shapeType === "vline") {
        el.style.width = "8px";
        el.style.height = "150px";
        el.style.borderLeft = `2px solid ${strokeColor}`;
        el.style.borderTop = "none";
        el.style.borderRight = "none";
        el.style.borderBottom = "none";
        el.style.backgroundColor = "transparent";
        el.style.borderRadius = "0";
        el.style.left = "20px";
        el.style.top = "20px";
    } else if (shapeType === "rect") {
        el.style.width = "160px";
        el.style.height = "80px";
        el.style.border = `2px solid ${strokeColor}`;
        el.style.backgroundColor = fill;
        el.style.borderRadius = "0";
        el.style.left = "20px";
        el.style.top = "20px";
    } else if (shapeType === "round-rect") {
        el.style.width = "160px";
        el.style.height = "80px";
        el.style.border = `2px solid ${strokeColor}`;
        el.style.backgroundColor = fill;
        el.style.borderRadius = "14px";
        el.style.left = "20px";
        el.style.top = "20px";
    }
}

function addShapeRect() {
    _createShape("rect");
}

function addShapeRoundRect() {
    _createShape("round-rect");
}

function addShapeHLine() {
    _createShape("hline");
}

function addShapeVLine() {
    _createShape("vline");
}

// === ЗОБРАЖЕННЯ ===
/**
 * Створює елемент-зображення на canvas.
 * В конструкторі показує прямокутник з написом IMAGE.
 * При кліку в центр відкриває вікно вибору зображення.
 */
/**
 * Повертає true якщо зображення зберігаються як blob (Uint8Array) у БД.
 */
function _imageStoreInDb() {
    return localStorage.getItem("app_settings_storeFilesInDb") === "true";
}

/**
 * Відкриває потрібний редактор зображення залежно від режиму збереження.
 * @param {HTMLElement} el  — DOM-елемент image-блоку
 */
function _openImagePicker(el) {
    if (_imageStoreInDb()) {
        // Режим blob: поточні дані беремо з _imageBlob (Uint8Array або null)
        const currentBlob = el._imageBlob instanceof Uint8Array ? el._imageBlob : null;
        openFileEditor(currentBlob, (encoded) => {
            // encoded — Uint8Array від encodeFileBlob, або null при очищенні
            el._imageBlob = encoded || null;
            el.dataset.imageUrl = ""; // URL не використовується в цьому режимі
            _updateImageElement(el, null, encoded);
            isDesignerDirty = true;
        });
    } else {
        // Режим URL
        openImageEditor("IMAGE", el.dataset.imageUrl || "", (url) => {
            el.dataset.imageUrl = url || "";
            el._imageBlob = null;
            _updateImageElement(el, url, null);
            isDesignerDirty = true;
        });
    }
}

function addImage() {
    const canvas = screenCanvas;
    const cm = constructorMode;
    const el = document.createElement("div");
    el.classList.add(cm + "-element", cm + "-image");
    el.dataset.imageUrl = "";
    el._imageBlob = null;
    Object.assign(el.style, {
        position: "absolute",
        left: "20px",
        top: "20px",
        width: "160px",
        height: "120px",
        border: "2px dashed #888",
        backgroundColor: "rgba(220,220,220,0.4)",
        cursor: "grab",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
    });
    // Напис IMAGE всередині
    const label = document.createElement("div");
    label.className = "image-placeholder-label";
    label.innerText = "IMAGE";
    Object.assign(label.style, {
        pointerEvents: "none",
        fontSize: "14px",
        fontFamily: "Arial",
        color: "#666",
        fontWeight: "bold",
        userSelect: "none"
    });
    el.appendChild(label);
    _attachImageClickHandler(el);
    canvas.appendChild(el);
    addResizeHandles(el);
    makeDraggableAndResizable(el);
    isDesignerDirty = true;
    return el;
}

/**
 * Вішає обробник кліку на image-елемент конструктора.
 * Виноситься окремо, щоб використовувати і в addImage(), і в renderCanvas().
 */
function _attachImageClickHandler(el) {
    el.addEventListener("click", (e) => {
        if (e.target.classList.contains("resize-handle")) return;
        const rect = el.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        const BORDER_TOLERANCE = 10;
        const nearBorder = clickX < BORDER_TOLERANCE || clickX > rect.width - BORDER_TOLERANCE ||
                           clickY < BORDER_TOLERANCE || clickY > rect.height - BORDER_TOLERANCE;
        if (!nearBorder) {
            activeElement = el;
            _updateFilterBtnVisibility();
            _openImagePicker(el);
        }
    });
}

/**
 * Оновлює вигляд image-елемента конструктора.
 * @param {HTMLElement} el
 * @param {string|null}    url      — для режиму URL
 * @param {Uint8Array|null} encoded — для режиму blob
 */
function _updateImageElement(el, url, encoded) {
    // Видаляємо старий вміст (крім маркерів resize)
    [...el.childNodes].forEach(c => {
        if (!c.classList || !c.classList.contains("resize-handle")) c.remove();
    });

    let displaySrc = null;

    if (encoded instanceof Uint8Array && encoded.length > 0) {
        try {
            const { type, data } = decodeFileBlob(encoded);
            if (type && type.startsWith("image/")) {
                const blob = new Blob([data], { type });
                displaySrc = URL.createObjectURL(blob);
                // Зберігаємо blob-url щоб пізніше можна було revoke
                if (el._blobUrl) URL.revokeObjectURL(el._blobUrl);
                el._blobUrl = displaySrc;
            }
        } catch (e) {
            console.warn("_updateImageElement: decodeFileBlob failed", e);
        }
    } else if (url) {
        displaySrc = url;
    }

    if (displaySrc) {
        const img = document.createElement("img");
        img.src = displaySrc;
        Object.assign(img.style, {
            width: "100%",
            height: "100%",
            objectFit: "contain",
            display: "block",
            pointerEvents: "none"
        });
        el.style.border = "2px dashed #888";
        el.style.backgroundColor = "transparent";
        el.insertBefore(img, el.firstChild);
    } else {
        const lbl = document.createElement("div");
        lbl.className = "image-placeholder-label";
        lbl.innerText = "IMAGE";
        Object.assign(lbl.style, {
            pointerEvents: "none",
            fontSize: "14px",
            fontFamily: "Arial",
            color: "#666",
            fontWeight: "bold",
            userSelect: "none"
        });
        el.style.border = "2px dashed #888";
        el.style.backgroundColor = "rgba(220,220,220,0.4)";
        el.insertBefore(lbl, el.firstChild);
    }
}

/**
 * Будує <img> для превью форми з el.imageBlobB64 / el.imageBlob / el.imageUrl.
 * el.imageBlob може бути Uint8Array, Array чисел або null.
 */
function _buildImagePreviewElement(el) {
    let displaySrc = null;

    // Нормалізуємо blob-дані до Uint8Array
    let blobData = null;
    if (el.imageBlobB64 && typeof base64ToUint8Array === "function") {
        blobData = base64ToUint8Array(el.imageBlobB64);
    } else if (el.imageBlob instanceof Uint8Array && el.imageBlob.length > 0) {
        blobData = el.imageBlob;
    } else if (Array.isArray(el.imageBlob) && el.imageBlob.length > 0) {
        blobData = new Uint8Array(el.imageBlob);
    }

    if (blobData && blobData.length > 0) {
        try {
            const decoded = decodeFileBlob(blobData);
            if (decoded && decoded.type && decoded.type.startsWith("image/")) {
                const blob = new Blob([decoded.data], { type: decoded.type });
                displaySrc = URL.createObjectURL(blob);
            }
        } catch (e) {
            console.warn("_buildImagePreviewElement: decodeFileBlob failed", e);
        }
    }

    // Fallback на URL
    if (!displaySrc && el.imageUrl) {
        displaySrc = el.imageUrl;
    }

    if (!displaySrc) return null;

    const img = document.createElement("img");
    img.src = displaySrc;
    Object.assign(img.style, {
        width: "100%",
        height: "100%",
        objectFit: "contain",
        display: "block",
        pointerEvents: "none"
    });
    return img;
}

function openShapeColorPicker() {
    // Якщо активна фігура — показуємо її поточні кольори
    if (activeElement && activeElement.dataset.shapeType) {
        document.getElementById("shapeStrokeColorInput").value = activeElement.dataset.strokeColor || _shapeStrokeColor;
        document.getElementById("shapeFillColorInput").value = activeElement.dataset.fillColor || _shapeFillColor;
        document.getElementById("shapeFillTransparentChk").checked = activeElement.dataset.fillTransparent === "1";
    } else {
        document.getElementById("shapeStrokeColorInput").value = _shapeStrokeColor;
        document.getElementById("shapeFillColorInput").value = _shapeFillColor;
        document.getElementById("shapeFillTransparentChk").checked = _shapeFillTransparent;
    }
    document.getElementById("shapeColorModal").style.display = "flex";
}

function applyShapeColor() {
    const stroke = document.getElementById("shapeStrokeColorInput").value;
    const fill = document.getElementById("shapeFillColorInput").value;
    const transparent = document.getElementById("shapeFillTransparentChk").checked;
    // Зберігаємо як поточні дефолтні
    _shapeStrokeColor = stroke;
    _shapeFillColor = fill;
    _shapeFillTransparent = transparent;
    // Якщо виділена фігура — оновлюємо її одразу
    if (activeElement && activeElement.dataset.shapeType) {
        const st = activeElement.dataset.shapeType;
        activeElement.dataset.strokeColor = stroke;
        activeElement.dataset.fillColor = fill;
        activeElement.dataset.fillTransparent = transparent ? "1" : "0";
        // Зберігаємо поточні розміри/позицію перед переприсвоєнням стилів
        const savedLeft = activeElement.style.left;
        const savedTop = activeElement.style.top;
        const savedWidth = activeElement.style.width;
        const savedHeight = activeElement.style.height;
        _applyShapeStyles(activeElement, st, stroke, fill, transparent);
        activeElement.style.left = savedLeft;
        activeElement.style.top = savedTop;
        activeElement.style.width = savedWidth;
        activeElement.style.height = savedHeight;
        isDesignerDirty = true;
    }
    document.getElementById("shapeColorModal").style.display = "none";
}

function addScreenGrid() {
    if (screenGridVisible) {
        screenCanvas.style.backgroundImage = "none";
    } else {
        screenCanvas.style.backgroundImage = "repeating-linear-gradient(0deg, #ccc 0, #ccc 1px, transparent 1px, transparent 19px), " + "repeating-linear-gradient(90deg, #ccc 0, #ccc 1px, transparent 1px, transparent 19px)";
        screenCanvas.style.backgroundSize = "20px 20px";
    }
    screenGridVisible = !screenGridVisible;
}

function addResizeHandles(element) {
    const cursors = {
        "top-left": "nwse-resize",
        "top-right": "nesw-resize",
        "bottom-left": "nesw-resize",
        "bottom-right": "nwse-resize"
    };
    ["top-left", "top-right", "bottom-left", "bottom-right"].forEach(pos => {
        const handle = document.createElement("div");
        handle.classList.add("resize-handle", pos);
        handle.style.cursor = cursors[pos];
        element.appendChild(handle);
    });
}
document.addEventListener("click", (e) => {
    let el = e.target.closest(".report-element");
    if (el) {
        activeElement = el;
        _updateFilterBtnVisibility();
        return;
    }
    el = e.target.closest(".form-element");
    if (el) {
        activeElement = el;
        _updateFilterBtnVisibility();
        return;
    }
});


// =============================================================================
// ФІЛЬТРУВАННЯ ТАБЛИЦЬ У КОНСТРУКТОРІ ЗВІТІВ
// =============================================================================

/**
 * Показує кнопку "Фільтр" тільки коли у Конструкторі звітів виділено report-table.
 * Викликається при кожній зміні activeElement.
 */
function _updateFilterBtnVisibility() {
    const btn = document.getElementById("filterTableBtn");
    if (!btn) return;
    const isReportTable = constructorMode === "report"
        && activeElement
        && activeElement.classList.contains("report-table");
    btn.style.display = isReportTable ? "" : "none";
}

// Посилання на елемент таблиці, для якого відкрито вікно фільтрування
let _reportTableFilterTarget = null;
// Snapshot оригінальних рядків (до сортування/фільтрування) — для порівняння при закритті
let _reportTableOriginalRows = null;

/**
 * Викликається кнопкою "Фільтр" у тулбарі конструктора звітів.
 * Відкриває вікно фільтрування з data.js для виділеного елемента-таблиці.
 */
function filterReportTable() {
    const tableEl = (activeElement && activeElement.classList.contains("report-table"))
        ? activeElement
        : activeTableElement;
    if (!tableEl) { Message(t("reportSelectTableToFilter") || "Оберіть об'єкт «таблиця» у звіті."); return; }
    const tableName = tableEl.dataset.tableName;
    if (!tableName) { Message(t("reportTableHasNoSource") || "Таблиця не має джерела даних."); return; }
    const result = findTableOrQueryResult(tableName);
    if (!result || !result.table) { Message(t("dataTableNotFound") || "Таблицю не знайдено."); return; }
    const sourceTable = result.table;

    currentDataView.columns = sourceTable.schema.map(c => c.title);
    currentDataView.rows    = [...sourceTable.data];
    _reportTableOriginalRows = [...sourceTable.data];
    _reportTableFilterTarget = tableEl;

    delete tableEl.dataset.filteredRows;
    tableEl.dataset.filterActive = "0";
    _unmarkTableFilteredInDesigner(tableEl);

    let savedConfig = null;
    if (tableEl.dataset.filterConfig) {
        try { savedConfig = JSON.parse(tableEl.dataset.filterConfig); } catch(e) { savedConfig = null; }
    }

    // --- ВІДНОВЛЕННЯ СТАНУ ---
    // 🛠️ ФІКС: Спочатку наповнюємо select полями, інакше він порожній
    const fieldSelect = document.getElementById("dataFieldSelect");
    if (fieldSelect) {
        fieldSelect.innerHTML = currentDataView.columns.map(c => `<option value="${c}">${c}</option>`).join("");
    }

    // 1. Відновлення сортування
    if (savedConfig?.sortField && currentDataView.columns.includes(savedConfig.sortField)) {
        if (fieldSelect) fieldSelect.value = savedConfig.sortField;
    }
    const sortOrder = savedConfig?.sortOrder || "asc";
    const orderRadio = document.querySelector(`input[name="sortOrder"][value="${sortOrder}"]`);
    if (orderRadio) orderRadio.checked = true;

    // Застосовуємо сортування
    if (typeof sortDataTable === "function") sortDataTable();

    // 2. Відновлення фільтрів та пошуку
    const filterContainer = document.getElementById("filterRowsContainer");
    const searchInput = document.getElementById("dataSearchInput");
    if (searchInput) searchInput.value = savedConfig?.search || "";
    window._filterRowCount = 0;
    filterContainer.innerHTML = "";

    if (savedConfig?.filters && Array.isArray(savedConfig.filters) && savedConfig.filters.length > 0) {
        savedConfig.filters.forEach(() => {
            if (typeof addDataFilterRow === "function") addDataFilterRow();
        });
        const rows = filterContainer.querySelectorAll("#filterRowsContainer > div");
        rows.forEach((row, i) => {
            const cfg = savedConfig.filters[i];
            if (!cfg) return;
            row.querySelector(".dvFilterCol").value = cfg.col || "";
            row.querySelector(".dvFilterCond").value = cfg.cond || "";
            row.querySelector(".dvFilterVal").value = cfg.val || "";
            if (cfg.logic === "OR") {
                const badge = row.querySelector("button[id^='badge_']");
                if (badge) badge.textContent = "OR";
            }
        });
    }

    if (typeof applyDataFilter === "function") applyDataFilter();
    if (typeof renderDataViewTable === "function") {
        renderDataViewTable(currentDataView.columns, currentDataView.rows);
    }
    if (typeof _updateCountLabel === "function") {
        _updateCountLabel(currentDataView.rows.length, currentDataView.rows.length);
    }

    const titleEl = document.getElementById("dataViewTitle");
    if (titleEl) {
        titleEl.textContent = (typeof t === "function"
            ? (t("dataTableLabel", tableName) || ("Таблиця: " + tableName))
            : ("Таблиця: " + tableName));
    }

    document.getElementById("dataViewModal").style.display = "flex";
}

/**
 * Розширення closeDataViewModal з data.js:
 * при закритті вікна зберігаємо відфільтровані рядки у dataset таблиці звіту.
 *
 * Викликається замість оригінальної closeDataViewModal.
 * Оригінальна функція оголошена у data.js — тут ми її перевизначаємо.
 */
(function _patchCloseDataViewModal() {
    const _patch = function () {
        const _orig = (typeof closeDataViewModal === "function")
            ? closeDataViewModal
            : function () { document.getElementById("dataViewModal").style.display = "none"; };

        window.closeDataViewModal = function () {
            if (_reportTableFilterTarget) {
                const bodyRows = document.querySelectorAll("#dataViewBody tr");
                const filteredRows = [];
                const colCount = currentDataView.columns.length;
                bodyRows.forEach(tr => {
                    const row = [];
                    tr.querySelectorAll("td").forEach(td => row.push(td.textContent));
                    while (row.length < colCount) row.push("");
                    filteredRows.push(row);
                });

                const totalRows = _reportTableOriginalRows.length;
                const isFiltered = filteredRows.length !== totalRows ||
                    filteredRows.some((row, i) =>
                        row.some((cell, j) =>
                            String(cell) !== String(_reportTableOriginalRows[i]?.[j] ?? "")
                        )
                    );

                // --- ЗБЕРЕЖЕННЯ КОНФІГУ ФІЛЬТРІВ/СОРТУВАННЯ ---
                const currentSortField = document.getElementById("dataFieldSelect")?.value || "";
                const currentSortOrder = document.querySelector('input[name="sortOrder"]:checked')?.value || "asc";
                const currentSearch = document.getElementById("dataSearchInput")?.value.trim() || "";
                const currentFilters = (typeof _getFilterRows === "function") ? _getFilterRows().map(f => ({
                    col: f.col, cond: f.cond, val: f.val, logic: f.logic
                })) : [];

                _reportTableFilterTarget.dataset.filterConfig = JSON.stringify({
                    sortField: currentSortField,
                    sortOrder: currentSortOrder,
                    search: currentSearch,
                    filters: currentFilters
                });

                if (isFiltered) {
                    _reportTableFilterTarget.dataset.filteredRows = JSON.stringify(filteredRows);
                    _reportTableFilterTarget.dataset.filterActive = "1";
                    _markTableFilteredInDesigner(_reportTableFilterTarget, filteredRows.length, totalRows);
                    if (typeof isDesignerDirty !== "undefined") isDesignerDirty = true;
                } else {
                    delete _reportTableFilterTarget.dataset.filteredRows;
                    _reportTableFilterTarget.dataset.filterActive = "0";
                    _unmarkTableFilteredInDesigner(_reportTableFilterTarget);
                }

                _reportTableFilterTarget = null;
                _reportTableOriginalRows = null;
            }
            _orig();
        };
    };
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", _patch);
    } else {
        _patch();
    }
})();

/**
 * Додає жовтий бейдж "🔽 N / M" на елемент таблиці у конструкторі.
 */
function _markTableFilteredInDesigner(tableEl, shown, total) {
    _unmarkTableFilteredInDesigner(tableEl); // видаляємо старий
    const badge = document.createElement("div");
    badge.className = "report-table-filter-badge";
    badge.textContent = `🔽 ${shown} / ${total}`;
    Object.assign(badge.style, {
        position:      "absolute",
        top:           "2px",
        right:         "2px",
        background:    "#fff3cd",
        border:        "1px solid #ffc107",
        borderRadius:  "4px",
        padding:       "1px 6px",
        fontSize:      "10px",
        color:         "#856404",
        pointerEvents: "none",
        zIndex:        "10",
        whiteSpace:    "nowrap"
    });
    tableEl.appendChild(badge);
}

/**
 * Видаляє бейдж фільтра з елемента таблиці у конструкторі.
 */
function _unmarkTableFilteredInDesigner(tableEl) {
    tableEl.querySelectorAll(".report-table-filter-badge").forEach(b => b.remove());
}

/**
 * Серіалізація елемента-таблиці у конструкторі.
 * Замінює serializeTableElement, яка визначена в іншому файлі.
 * Якщо serializeTableElement вже оголошена — вона буде перевизначена нижче.
 */
function serializeTableElement(el) {
    const obj = {
        type:           "table",
        left:           parseInt(el.style.left)  || 0,
        top:            parseInt(el.style.top)   || 0,
        width:          parseInt(el.style.width) || 100,
        height:         parseInt(el.style.height)|| 50,
        tableName:      el.dataset.tableName  || "",
        selectedFields: JSON.parse(el.dataset.selectedFields || "[]"),
        filterActive:   el.dataset.filterActive === "1",
        filteredRows:   null,
        filterConfig:   null 
    };
    if (obj.filterActive && el.dataset.filteredRows) {
        try { obj.filteredRows = JSON.parse(el.dataset.filteredRows); } catch (_) { obj.filteredRows = null; }
    }
    // Збереження конфігу
    if (el.dataset.filterConfig) {
        try { obj.filterConfig = JSON.parse(el.dataset.filterConfig); } catch (_) { obj.filterConfig = null; }
    }
    return obj;
}
