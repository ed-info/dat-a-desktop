let currentFormRecordIndex = 0; // For form viewer navigation
let selectedFormName = null; // To keep track of the selected form in the saved forms dialog 
let selectedFormField = null;
window._currentTableSelectedFields = {}; // Зберігає вибрані поля для кожної таблиці
window._formTables = {}; // Зберігає тимчасові таблиці для форм
function confirmDeleteFormRecord(callback) {
    document.getElementById("deleteMessage").innerText = t("formConfirmDeleteRecord");
    const modal = document.getElementById("deleteRowModal");
    const btnConfirm = document.getElementById("confirmDelete");
    const btnCancel = document.getElementById("cancelDelete");
    // Зберігаємо оригінальні обробники
    const origConfirm = btnConfirm.getAttribute("onclick");
    const origCancel = btnCancel.getAttribute("onclick");
    const cleanup = () => {
        btnConfirm.setAttribute("onclick", origConfirm);
        btnCancel.setAttribute("onclick", origCancel);
        modal.style.display = "none";
    };
    btnConfirm.setAttribute("onclick", "");
    btnConfirm.onclick = () => {
        cleanup();
        callback(true);
    };
    btnCancel.setAttribute("onclick", "");
    btnCancel.onclick = () => {
        cleanup();
    };
    modal.style.display = "block";
}
/**
 * Конструктор форм
 **/
function createForm() {
    createDesigner("form");
}

function saveForm() {
    const formName = document.getElementById("formNameInput").value.trim();
    if (!formName) {
        Message(t("formNoName"));
        document.getElementById("formNameInput").focus();
        return;
    }
    const formCanvas = document.getElementById("formCanvas");
    const elements = [...formCanvas.querySelectorAll('.form-element')].map(el => {
        //Обробка кнопок
        if (el.classList.contains("form-button")) {
            return {
                type: "button",
                left: parseInt(el.style.left) || 0,
                top: parseInt(el.style.top) || 0,
                width: parseInt(el.style.width) || el.offsetWidth,
                height: parseInt(el.style.height) || el.offsetHeight,
                text: el.dataset.buttonText || t("formDefaultButton"),
                textColor: el.dataset.textColor || "#ffffff",
                bgColor: el.dataset.bgColor || "#007bff",
                borderColor: el.dataset.borderColor || "#0056b3",
                buttonAction: el.dataset.buttonAction || "none",
                buttonActionTarget: el.dataset.buttonActionTarget || ""
            };
        }
        // Графічні об'єкти
        if (el.classList.contains("form-shape")) {
            return serializeShapeElement(el);
        }
        // Зображення
        if (el.classList.contains("form-image")) {
            return serializeImageElement(el);
        }
        //обробка таблиці
        if (el.classList.contains("form-table")) {
            return serializeTableElement(el);
        }
        //Текстові поля та написи
        return serializeTextElement(el, "form-label");
    });
    const formObject = {
        name: formName,
        formTable: document.getElementById("formTableSelect")?.value || "",
        elements
    };
    const index = database.forms.findIndex(f => f.name === formName);
    if (index !== -1) database.forms[index] = formObject;
    else database.forms.push(formObject);
    saveDatabase();
    if (typeof isDesignerDirty !== "undefined") isDesignerDirty = false;
    Message(t("formSaved", formName));
}
/**
 * Редагування обраної форми
 **/
function editSelectedForm() {
    if (!selectedFormName) {
        Message(t("formSelectForEdit"));
        return;
    }
    const form = database.forms.find(f => f.name === selectedFormName);
    if (!form) {
        Message(t("formNotFound"));
        return;
    }
    document.getElementById("savedFormsModal").style.display = "none";

    // Заблокована форма — рендеримо в конструктор (невидимо),
    // щоб previewForm міг вирахувати розміри canvas, і відкриваємо превю замість редактора
    if (typeof isLocked === "function" && isLocked("form", selectedFormName)) {
        constructorMode = "form";
        screenCanvas = document.getElementById(constructorMode + "Canvas");
        renderCanvas(form);
        const fts = document.getElementById("formTableSelect");
        if (fts) {
            populateTableSelect(fts, t("formSelectTable"), true);
            fts.value = form.formTable || "";
        }
        // Відкриваємо конструктор невидимо, щоб getBoundingClientRect() повернув реальні розміри
        const creatorModal = document.getElementById("formCreatorModal");
        const prevVis = creatorModal.style.visibility;
        const prevDisp = creatorModal.style.display;
        creatorModal.style.visibility = "hidden";
        creatorModal.style.display = "flex";
        // Невеликий setTimeout, щоб браузер встиг розрахувати макет
        setTimeout(() => {
            previewForm(form, true);
            creatorModal.style.visibility = prevVis || "";
            creatorModal.style.display = "none";
        }, 30);
        return;
    }

    constructorMode = "form";
    screenCanvas = document.getElementById(constructorMode + "Canvas");
    renderCanvas(form);
    // Відновити вибрану таблицю форми
    const fts = document.getElementById("formTableSelect");
    if (fts) {
        populateTableSelect(fts, t("formSelectTable"), true);
        fts.value = form.formTable || "";
    }
    document.getElementById("formCreatorModal").style.display = "flex";
    Message(t("formLoadedForEdit", form.name));
}


function showSavedFormsDialog() {
    const listEl = document.getElementById("savedFormsList");
    if (!listEl) {
        console.error("Елемент #savedFormsList не знайдено. Переконайтеся, що modal для збережених форм існує.");
        Message(t("formModalNotFound"));
        return;
    }
    listEl.innerHTML = "";
    selectedFormName = null;
    if (database && database.forms) {
        database.forms.forEach(form => {
            const li = createSelectableListItem(listEl, form.name, "formName", name => {
                selectedFormName = name;
            });
            listEl.appendChild(li);
        });
    }
    document.getElementById("savedFormsModal").style.display = "flex";
}

function deleteSelectedFormElement() {
    if (!activeElement || !activeElement.classList.contains("form-element")) {
        Message(t("formSelectElementDel"));
        return;
    }
    activeElement.remove();
    activeElement = null;
}

function closeSavedFormsDialog() {
    const savedFormsModal = document.getElementById("savedFormsModal");
    if (savedFormsModal) {
        savedFormsModal.style.display = "none";
    }
    selectedFormName = null;
}

function previewSelecteForm() {
    if (!selectedFormName) {
        Message(t("formSelectForPreview"));
        return;
    }
    const form = database.forms.find(f => f.name === selectedFormName);
    if (!form) {
        Message(t("formNotFound"));
        return;
    }
    document.getElementById("savedFormsModal").style.display = "none";
    previewForm(form, true);
}

// findTableOrQueryResult — визначена у shared.js

async function previewForm(form = null, resetIndex = false) {
    // Зберігаємо поточну форму для навігації
    if (form) {
        currentPreviewForm = form;
      
    }
    const previewModal = document.getElementById("formPreviewModal");
    const previewCanvas = document.getElementById("formPreviewCanvas");
    // Відкликаємо blob URL зображень перед очищенням canvas
    previewCanvas.querySelectorAll("img[src^='blob:']").forEach(img => {
        URL.revokeObjectURL(img.src);
    });
    previewCanvas.innerHTML = "";
    console.log("[previewForm] called, currentFormRecordIndex=", currentFormRecordIndex, "resetIndex=", resetIndex);
    let formName;
    let elements = [];
    // Формуємо elements
    if (form) {
        formName = form.name;
        elements = form.elements.map(el => {
            const base = {
                type: el.type,
                left: el.left + "px",
                top: el.top + "px",
                width: el.width + "px",
                height: el.height + "px"
            };
            // Обробка кнопок
            if (el.type === "button") {
                return {
                    ...base,
                    type: "button",
                    text: el.text || t("formDefaultButton"),
                    textColor: el.textColor || "#ffffff",
                    bgColor: el.bgColor || "#007bff",
                    borderColor: el.borderColor || "#0056b3",
                    fontFamily: el.fontFamily || 'Arial',
                    fontSize: el.fontSize || '14px',
                    fontWeight: el.fontWeight || 'normal',
                    fontStyle: el.fontStyle || 'normal',
                    buttonAction: el.buttonAction || "none",
                    buttonActionTarget: el.buttonActionTarget || ""
                };
            }
            // Обробка таблиць
            if (el.type === "table") {
                return {
                    ...base,
                    type: "table",
                    tableName: el.tableName,
                    selectedFields: el.selectedFields || []
                };
            }
            // Обробка фігур
            if (el.type === "shape") {
                return {
                    ...base,
                    shapeType: el.shapeType,
                    strokeColor: el.strokeColor,
                    fillColor: el.fillColor,
                    fillTransparent: el.fillTransparent
                };
            }
            // Обробка зображень
            if (el.type === "image") {
                return {
                    ...base,
                    imageUrl: el.imageUrl || "",
                    imageBlobB64: el.imageBlobB64 || null,
                    imageBlob: el.imageBlob || null
                };
            }
            // Властивості текстових елементів та полів
            return {
                ...base,
                fontFamily: el.fontFamily || 'Arial',
                fontSize: el.fontSize || '16px',
                fontWeight: el.fontWeight || 'normal',
                fontStyle: el.fontStyle || 'normal',
                textDecoration: el.textDecoration || '',
                color: el.color || '#000',
                textAlign: el.textAlign || 'left',
                tableName: el.tableName,
                fieldName: el.fieldName,
                text: el.text || " "
            };
        });
    } else {
        formName = document.getElementById("formNameInput").value.trim();
        // Вибираємо ВСІ елементи форми
        elements = [...document.querySelectorAll("#formCanvas .form-element")].map(el => {
            // Обробка кнопок
            if (el.classList.contains("form-button")) {
                return {
                    type: "button",
                    left: el.style.left,
                    top: el.style.top,
                    width: el.style.width,
                    height: el.style.height,
                    text: el.dataset.buttonText || t("formDefaultButton"),
                    textColor: el.dataset.textColor || "#ffffff",
                    bgColor: el.dataset.bgColor || "#007bff",
                    borderColor: el.dataset.borderColor || "#0056b3",
                    fontFamily: el.style.fontFamily || 'Arial',
                    fontSize: el.style.fontSize || '14px',
                    fontWeight: el.style.fontWeight || 'normal',
                    fontStyle: el.style.fontStyle || 'normal',
                    buttonAction: el.dataset.buttonAction || "none",
                    buttonActionTarget: el.dataset.buttonActionTarget || ""
                };
            }
            // Обробка таблиць
            if (el.classList.contains("form-table")) {
                return {
                    type: "table",
                    left: el.style.left,
                    top: el.style.top,
                    width: el.style.width,
                    height: el.style.height,
                    tableName: el.dataset.tableName || null,
                    selectedFields: JSON.parse(el.dataset.selectedFields || "[]")
                };
            }
            // Обробка фігур
            if (el.classList.contains("form-shape")) {
                return {
                    type: "shape",
                    left: el.style.left,
                    top: el.style.top,
                    width: el.style.width,
                    height: el.style.height,
                    shapeType: el.dataset.shapeType,
                    strokeColor: el.dataset.strokeColor || "#333333",
                    fillColor: el.dataset.fillColor || "#ffffff",
                    fillTransparent: el.dataset.fillTransparent === "1"
                };
            }
            // Обробка зображень
            if (el.classList.contains("form-image")) {
                return {
                    type: "image",
                    left: el.style.left,
                    top: el.style.top,
                    width: el.style.width,
                    height: el.style.height,
                    imageUrl: el.dataset.imageUrl || "",
                    imageBlob: (el._imageBlob instanceof Uint8Array && el._imageBlob.length > 0)
                        ? Array.from(el._imageBlob) : null
                };
            }
            // Поля та написи
            return {
                type: el.classList.contains("form-field") ? "field" : "label",
                left: el.style.left,
                top: el.style.top,
                width: el.style.width,
                height: el.style.height,
                fontFamily: el.style.fontFamily || 'Arial',
                fontSize: el.style.fontSize || '16px',
                fontWeight: el.style.fontWeight || 'normal',
                fontStyle: el.style.fontStyle || 'normal',
                textDecoration: el.style.textDecoration || '',
                color: el.style.color || '#000',
                textAlign: el.style.textAlign || 'left',
                tableName: el.dataset.tableName,
                fieldName: el.dataset.fieldName,
                text: el.innerText?.trim() || " "
            };
        });
    }
    // Оновлюємо результати запитів, щоб дані були актуальними перед рендерингом
    if (typeof refreshQueriesUsedInElements === "function") {
        refreshQueriesUsedInElements(elements);
    }

    // Перевіряємо на запити
    const usesQueries = elements.some(el => {
        if (el.type === "table") return false;
        if (el.type === "button") return false;
        if (!el.tableName) return false;
        const res = findTableOrQueryResult(el.tableName);
        return res?.isQuery === true;
    });
    // Приховуємо кнопки, якщо форма використовує результати запитів
    const frmNewRecord = document.getElementById("frmNewRecord");
    const frmSaveChanges = document.getElementById("frmSaveChanges");
    const frmDeleteRecord = document.getElementById("frmDeleteRecord");
    const frmTableMenuBtn = document.getElementById("frmTableMenuBtn");

    // Режим read-only: форма заблокована від змін
    const formIsReadOnly = currentPreviewForm
        && typeof isLocked === "function"
        && isLocked("form", currentPreviewForm.name);

    if (formIsReadOnly) {
        if (frmNewRecord)    frmNewRecord.style.display    = 'none';
        if (frmSaveChanges)  frmSaveChanges.style.display  = 'none';
        if (frmDeleteRecord) frmDeleteRecord.style.display = 'none';
        if (frmTableMenuBtn) frmTableMenuBtn.style.display = 'none';
    } else {
        if (frmNewRecord)    frmNewRecord.style.display    = usesQueries ? 'none' : 'flex';
        if (frmSaveChanges)  frmSaveChanges.style.display  = usesQueries ? 'none' : 'flex';
        if (frmDeleteRecord) frmDeleteRecord.style.display = usesQueries ? 'none' : 'flex';
    }
    // Логіка з currentFormRecordIndex (тільки для полів, не для таблиць та кнопок)
    const formFields = elements.filter(el => el.type === 'field' && el.tableName);
    const formTables = elements.filter(el => el.type === 'table');
    const maxRecordIndex = formFields.length > 0 ? Math.max(...formFields.map(el => {
        const res = findTableOrQueryResult(el.tableName);
        if (res?.isDefinition) return 0;
        return res?.table?.data?.length || 0;
    })) - 1 : 0;
    if (resetIndex) currentFormRecordIndex = 0;
    currentFormRecordIndex = Math.min(currentFormRecordIndex, maxRecordIndex < 0 ? 0 : maxRecordIndex);
    const isLastRecord = currentFormRecordIndex === maxRecordIndex;
    let last = "";
    if (isCreatingNewRecord) {
        last = t("formNewRecord");
    } else if (isLastRecord) {
        last = t("formLastRecord");
    }
    const titleElement = document.getElementById("formPreviewTitle");
    if (titleElement) {
        titleElement.innerText = t("formPreviewTitle", formName, currentFormRecordIndex + 1) + t(last);
    }
    // ----------------- Рендеринг елементів -----------------
    for (const el of elements) {
        // Рендеринг кнопок
        if (el.type === "button") {
            const button = document.createElement("button");
            button.className = "form-button";
            Object.assign(button.style, {
                position: "absolute",
                left: el.left,
                top: el.top,
                width: el.width,
                height: el.height,
                fontFamily: el.fontFamily || 'Arial',
                fontSize: el.fontSize || '14px',
                fontWeight: el.fontWeight || 'normal',
                fontStyle: el.fontStyle || 'normal',
                color: el.textColor || "#ffffff",
                backgroundColor: el.bgColor || "#007bff",
                border: `2px solid ${el.borderColor || "#0056b3"}`,
                borderRadius: "5px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxSizing: "border-box",
                padding: "0 10px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis"
            });
            button.textContent = el.text || t("formDefaultButton");
            button.onclick = () => {
                const action = el.buttonAction || "none";
                const target = el.buttonActionTarget || "";
                if (action === "openForm") {
                    if (!target) {
                        Message(t("formNotspecified"));
                        return;
                    }
                    const targetForm = database.forms.find(f => f.name === target);
                    if (!targetForm) {
                        Message(`Форму "${target}" не знайдено`);
                        return;
                    }
                    document.getElementById("formPreviewModal").style.display = "none";
                    previewForm(targetForm, true);
                } else if (action === "runQuery") {
                    if (!target) {
                        Message(t("formRqstNotSpecified"));
                        return;
                    }
                    const queryDef = (queries.definitions || []).find(q => q.name === target);
                    if (!queryDef) {
                        Message(`Запит "${target}" не знайдено`);
                        return;
                    }
                    if (typeof runQuery === "function") {
                        runQuery(queryDef);
                    } else if (typeof executeQuery === "function") {
                        executeQuery(queryDef.sql || queryDef.query || "");
                    } else {
                        Message(`Запит "${target}" виконано`);
                    }
                } else if (action === "closeForm") {
                    document.getElementById("formPreviewModal").style.display = "none";
                } else if (action === "closeApp") {
                    if (typeof exitApplication === "function") {
                        exitApplication();
                    } else {
                        window.close();
                    }
                }
            };
            previewCanvas.appendChild(button);
            continue;
        }
        // Рендеринг таблиці
        if (el.type === "table") {
            console.log("table render - calling editData for:", el.tableName);
            // Зберігаємо посилання на форму локально в closure — 
            // глобальна currentPreviewForm може бути null на момент mousedown
            console.log("[TABLE RENDER] form=", form?.name ?? "NULL", "currentPreviewForm=", currentPreviewForm?.name ?? "NULL");
            const _previewFormRef = form || currentPreviewForm;
            // Створюємо контейнер для таблиці
            const frame = document.createElement("div");
            frame.className = "form-table";
            Object.assign(frame.style, {
                position: "absolute",
                left: el.left,
                top: el.top,
                width: el.width,
                height: el.height,
                backgroundColor: "#fff",
                padding: "0",
                boxSizing: "border-box",
                border: "1px solid #777",
                borderRadius: "4px",
                display: "flex",
                flexDirection: "column"
            });
            // Додаємо обробник кліку на контейнер таблиці для показу кнопки
            frame.addEventListener("click", (e) => {
                // Не спрацьовує, якщо клік на клітинці (там свій обробник)
                if (e.target === frame || e.target === tableWrapper || e.target === table) {
                    // Зберігаємо контекст
                    currentFormActiveTable = tempTable;
                    currentFormTableContext = {
                        tempTable: tempTable,
                        tableObj: tableObj,
                        frame: frame,
                        tableName: el.tableName
                    };
                    showTableMenuButton();
                }
            });            
            // Контейнер для таблиці з прокруткою
            const tableWrapper = document.createElement("div");
            tableWrapper.style.overflow = "auto";
            tableWrapper.style.flex = "1";
            tableWrapper.style.minHeight = "0";
            const table = document.createElement("table");
            const tableId = `editTable_${Date.now()}_${Math.random()}`;
            table.id = tableId;
            table.border = "1";
            table.cellPadding = "5";
            table.style.width = "100%";
            table.style.borderCollapse = "collapse";
            table.style.tableLayout = "auto";
            table.style.minWidth = "100%";
            table.style.fontSize = "10px";
            const thead = document.createElement("thead");
            const theadId = `editHead_${Date.now()}`;
            thead.id = theadId;
            thead.style.backgroundColor = "#999";
            thead.style.position = "sticky";
            thead.style.top = "0";
            thead.style.zIndex = "10";
            const tbody = document.createElement("tbody");
            const tbodyId = `editBody_${Date.now()}`;
            tbody.id = tbodyId;
            table.appendChild(thead);
            table.appendChild(tbody);
            tableWrapper.appendChild(table);
            frame.appendChild(tableWrapper);
            previewCanvas.appendChild(frame);
            // Отримуємо дані для таблиці
            const result = findTableOrQueryResult(el.tableName);
            if (!result || !result.table) {
                tbody.innerHTML = `<tr><td style="padding:20px; text-align:center; color:#999;">${t("formSourceNotFound")}</td></tr>`;
            } else {
                const tableObj = result.table;
                const isReadOnly = result.isQuery === true;
                const selectedFields = el.selectedFields || [];
                // Зберігаємо вибрані поля для поточного відображення
                if (!window._currentTableSelectedFields) window._currentTableSelectedFields = {};
                window._currentTableSelectedFields[el.tableName] = selectedFields;
                let filteredSchema = tableObj.schema;
                let filteredData = tableObj.data;
                if (selectedFields.length > 0) {
                    filteredSchema = tableObj.schema.filter(col => selectedFields.includes(col.title));
                    const fieldIndices = selectedFields.map(field => tableObj.schema.findIndex(col => col.title === field)).filter(idx => idx !== -1);
                    filteredData = tableObj.data.map(row => fieldIndices.map(idx => row[idx]));
                }
                const tempTable = {
                    ...tableObj,
                    schema: filteredSchema,
                    data: filteredData,
                    name: el.tableName,
                    columnWidths: tableObj.columnWidths || {},
                    _tbody: tbody,
                    originalTable: tableObj,
                    originalSchema: tableObj.schema,
                    selectedFields: selectedFields,
                    fieldIndices: selectedFields.length > 0 ? selectedFields.map(f => tableObj.schema.findIndex(c => c.title === f)).filter(i => i !== -1) : tableObj.schema.map((_, i) => i)
                };
                // Зберігаємо посилання на цю таблицю
                if (!window._formTables) window._formTables = {};
                window._formTables[el.tableName] = tempTable;
// Рендеримо заголовок
thead.innerHTML = "";
const headerRow = document.createElement("tr");
filteredSchema.forEach((col, i) => {
    const th = document.createElement("th");
    th.textContent = col.subst ? col.title + "🛟" : col.title;
    th.style.backgroundColor = "#ссс";
    th.style.padding = "8px";
    th.style.border = "1px solid #777";
    th.style.fontSize = "10px";
    th.style.whiteSpace = "nowrap";
    if (!isReadOnly && col.primaryKey) th.classList.add("pk");
    th.style.position = "relative";
    headerRow.appendChild(th);
});
thead.appendChild(headerRow);
                // Рендеримо тіло
                tbody.innerHTML = "";
                filteredData.forEach((rowData, rowIndex) => {
                    const tr = document.createElement("tr");
                    const fullRowData = tableObj.data[rowIndex];

                    // Навігація по записах — слухаємо mousedown на tr,
                    // щоб спрацювати до того як input/select перехопить фокус
                tr.addEventListener("mousedown", (e) => {
                    // Динамічно отримуємо актуальну форму
                    const activeForm = currentPreviewForm || 
                        (typeof formName !== 'undefined' && database.forms ? database.forms.find(f => f.name === formName) : null);

                    console.log("[TR MOUSEDOWN] rowIndex=", rowIndex, "current=", currentFormRecordIndex);

                    // Встановлюємо контекст таблиці
                    if (window._formTables && window._formTables[el.tableName]) {
                        currentEditTable = window._formTables[el.tableName];
                        currentFormActiveTable = window._formTables[el.tableName];
                    } else {
                        currentEditTable = tempTable;
                        currentFormActiveTable = tempTable;
                        if (!window._formTables) window._formTables = {};
                        window._formTables[el.tableName] = tempTable;
                    }
                    currentFormTableContext = {
                        tempTable: tempTable,
                        tableObj: tableObj,
                        frame: frame,
                        tableName: el.tableName
                    };
                    showTableMenuButton();

                    // Оновлюємо виділення рядка
                    if (selectedCell?.parentElement) selectedCell.parentElement.classList.remove("selected-row");
                    selectedCell = tr.cells[0] || tr;
                    tr.classList.add("selected-row");

                    // 🔑 Синхронізуємо запис ТІЛЬКИ якщо рядок дійсно змінився
                    if (rowIndex !== currentFormRecordIndex) {
                        currentFormRecordIndex = rowIndex;
                        currentPreviewForm = activeForm;
                        
                        // Оновлюємо поля форми БЕЗ повного перерендерингу (зберігає фокус та можливість редагування)
                        syncFieldsFromCurrentRecord();
                        syncTableSelectionToRecord();
                    }
                });

                    filteredSchema.forEach((col, colIndex) => {
                        const td = document.createElement("td");
                        const originalColIndex = tableObj.schema.findIndex(c => c.title === col.title);
                        const cellData = rowData[colIndex];
                        td.style.border = "1px solid #777";
                        td.style.padding = "6px";
                        td.style.whiteSpace = "nowrap";
                        td.style.fontSize = "10px";
                        const inputEl = advDataInput(td, cellData, col, fullRowData, originalColIndex, isReadOnly);
                        if (inputEl) inputEl.style.fontSize = "10px";
                        if (inputEl && inputEl.tagName === 'CUSTOM-DATE-PICKER') {
                            inputEl.addEventListener("change", () => {
                                fullRowData[originalColIndex] = inputEl.value || "";
                                filteredData[rowIndex][colIndex] = inputEl.value || "";
                            });
                        }
                        // Контекстне меню — залишаємо на td
                        td.addEventListener("contextmenu", (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (window._formTables && window._formTables[el.tableName]) {
                                currentEditTable = window._formTables[el.tableName];
                            } else {
                                currentEditTable = tempTable;
                            }
                            if (selectedCell?.parentElement) selectedCell.parentElement.classList.remove("selected-row");
                            selectedCell = td;
                            if (selectedCell.parentElement) selectedCell.parentElement.classList.add("selected-row");
                            showFormTableContextMenu(e.clientX, e.clientY, tempTable, tableObj, frame);
                        });
                        tr.appendChild(td);
                    });
                    tbody.appendChild(tr);
                });
                // Додаємо контекстне меню для порожньої області таблиці
                tbody.addEventListener("contextmenu", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (window._formTables && window._formTables[el.tableName]) {
                        currentEditTable = window._formTables[el.tableName];
                        currentFormActiveTable = window._formTables[el.tableName];
                    } else {
                        currentEditTable = tempTable;
                        currentFormActiveTable = tempTable;
                    }
                    currentFormTableContext = {
                        tempTable: tempTable,
                        tableObj: tableObj,
                        frame: frame,
                        tableName: el.tableName
                    };
                    showFormTableContextMenu(e.clientX, e.clientY, tempTable, tableObj, frame);
                });
                // Додаємо підказку про праву кнопку миші (тільки для не read-only таблиць)
            }
            // Інжектуємо стиль для поточного рядка, якщо ще не додано
            if (!document.getElementById("formTableCurrentRowStyle")) {
                const styleEl = document.createElement("style");
                styleEl.id = "formTableCurrentRowStyle";
                styleEl.textContent = ".form-table-current-row td { background-color: #b3d4ff !important; }";
                document.head.appendChild(styleEl);
            }
            console.log("table render - completed");
            return;
        }
        // Рендеринг полів
        if (el.type === "field") {
            const result = findTableOrQueryResult(el.tableName);
            const fieldContainer = document.createElement("div");
            fieldContainer.className = "form-field";
            Object.assign(fieldContainer.style, {
                position: "absolute",
                left: el.left,
                top: el.top,
                width: el.width,
                height: el.height,
                fontFamily: el.fontFamily,
                fontSize: el.fontSize,
                fontWeight: el.fontWeight,
                fontStyle: el.fontStyle,
                textDecoration: el.textDecoration,
                //color: el.color,
                textAlign: el.textAlign || 'left',
                borderStyle: "inset",
                borderWidth: "4px",
                borderColor: "#888",
                borderRadius: "15px",
                overflow: "hidden",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                justifyContent: el.textAlign === 'center' ? 'center' : el.textAlign === 'right' ? 'flex-end' : 'flex-start',
                paddingLeft: "5px",
                boxSizing: "border-box"
            });
            fieldContainer.dataset.tableName = el.tableName || "";
            fieldContainer.dataset.fieldName = el.fieldName || "";
            let cellValue = " ";
            let colSchema = null;
            let colIndex = -1;
            let tableData = null;
            const isReadOnly = result?.isQuery === true;
            if (!result) {
                cellValue = t("formSourceNotFound");
            } else if (result.isDefinition) {
                try {
                    const res = await dba.db.exec(result.table.sql);
                    if (res.length > 0) {
                        const columns = res[0].columns;
                        const dataRows = res[0].values;
                        const schema = columns.map(col => ({
                            title: col,
                            type: t("formColumnTypeText"),
                            primaryKey: false
                        }));
                        const internalName = result.table.name.startsWith('запит "') ? result.table.name : `запит "${result.table.name}"`;
                        const queryResultTable = {
                            name: internalName,
                            schema,
                            data: dataRows
                        };
                        const existingIndex = queries.results.findIndex(t => t.name === internalName);
                        if (existingIndex !== -1) queries.results[existingIndex] = queryResultTable;
                        else queries.results.push(queryResultTable);
                        const newResult = findTableOrQueryResult(el.tableName);
                        if (newResult) {
                            tableData = newResult.table.data;
                            colIndex = newResult.table.schema.findIndex(c => c.title === el.fieldName);
                            colSchema = newResult.table.schema[colIndex];
                            if (colIndex !== -1 && tableData?.length > 0) {
                                const record = tableData[Math.min(currentFormRecordIndex, tableData.length - 1)];
                                cellValue = record?.[colIndex] ?? " ";
                            }
                        }
                    } else {
                        cellValue = t("formQueryNoResult");
                    }
                } catch (e) {
                    cellValue = t("formQueryError", e.message);
                }
            } else {
                const table = result.table;
                tableData = table.data;
                if (!tableData || tableData.length === 0) {
                    cellValue = isReadOnly ? t("formQueryEmpty") : t("formTableEmpty");
                } else {
                    colIndex = table.schema.findIndex(c => c.title === el.fieldName);
                    if (colIndex !== -1) {
                        colSchema = table.schema[colIndex];
                        const record = tableData[Math.min(currentFormRecordIndex, tableData.length - 1)];
                        cellValue = record?.[colIndex] ?? " ";
                        fieldContainer.dataset.colIndex = String(colIndex);
                    } else {
                        cellValue = t("formFieldNotFound");
                    }
                }
            }
            // Логіка рендерингу поля (зображення або текст)
            if (colSchema && colSchema.type && String(colSchema.type).toLowerCase().includes("image")) {
                if (cellValue instanceof Uint8Array) {
                    const imgData = extractImage(cellValue);
                    if (imgData) {
                        const blob = new Blob([imgData.data], {
                            type: imgData.type
                        });
                        cellValue = URL.createObjectURL(blob);
                    }
                } else if (Array.isArray(cellValue) && cellValue.length > 0) {
                    // imageBlob може бути збережений як Array чисел
                    const imgData = extractImage(new Uint8Array(cellValue));
                    if (imgData) {
                        const blob = new Blob([imgData.data], {
                            type: imgData.type
                        });
                        cellValue = URL.createObjectURL(blob);
                    }
                }
                fieldContainer.innerHTML = "";
                const img = document.createElement("img");
                img.src = cellValue || "";
                img.alt = el.fieldName || "";
                Object.assign(img.style, {
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    display: "block",
                    cursor: isReadOnly ? "default" : "pointer"
                });
                fieldContainer.appendChild(img);
            } else {
                const control = advDataInput(fieldContainer, cellValue, colSchema, tableData?.[Math.min(currentFormRecordIndex, tableData?.length - 1)], colIndex, isReadOnly);
                if (!control) {
                    fieldContainer.textContent = cellValue;
                } else {
                    control.dataset.tableName = fieldContainer.dataset.tableName;
                    control.dataset.fieldName = fieldContainer.dataset.fieldName;
                    control.dataset.colIndex = fieldContainer.dataset.colIndex;
                    if (isReadOnly && control.tagName !== 'BUTTON') {
                        control.setAttribute("readonly", "true");
                        if (control.tagName === 'SELECT' || control.tagName === 'INPUT') control.disabled = true;
                    }
                }
            }
            previewCanvas.appendChild(fieldContainer);
        } else if (el.type === "label") {
            const label = document.createElement("div");
            Object.assign(label.style, {
                position: "absolute",
                left: el.left,
                top: el.top,
                width: el.width,
                height: el.height,
                fontFamily: el.fontFamily,
                fontSize: el.fontSize,
                fontWeight: el.fontWeight,
                fontStyle: el.fontStyle,
                textDecoration: el.textDecoration,
                color: el.color,
                textAlign: el.textAlign || 'left',
                padding: "5px",
                border: "none",
                background: "transparent",
                overflow: "hidden",
                whiteSpace: "nowrap"
            });
            label.innerText = el.text || " ";
            previewCanvas.appendChild(label);
        } else if (el.type === "shape") {
            const shapeDiv = document.createElement("div");
            shapeDiv.className = `form-shape shape-${el.shapeType}`;
            Object.assign(shapeDiv.style, {
                position: "absolute",
                left: el.left,
                top: el.top,
                width: el.width,
                height: el.height,
                boxSizing: "border-box",
                zIndex: 0,
                pointerEvents: "none"
            });
            const fill = el.fillTransparent ? "transparent" : (el.fillColor || "#ffffff");
            const stroke = el.strokeColor || "#333333";
            if (el.shapeType === "hline") {
                shapeDiv.style.borderTop = `2px solid ${stroke}`;
                shapeDiv.style.backgroundColor = "transparent";
            } else if (el.shapeType === "vline") {
                shapeDiv.style.borderLeft = `2px solid ${stroke}`;
                shapeDiv.style.backgroundColor = "transparent";
            } else if (el.shapeType === "rect" || el.shapeType === "round-rect") {
                shapeDiv.style.border = `2px solid ${stroke}`;
                shapeDiv.style.backgroundColor = fill;
                if (el.shapeType === "round-rect") {
                    shapeDiv.style.borderRadius = "14px";
                }
            }
            previewCanvas.appendChild(shapeDiv);
        } else if (el.type === "image") {
            const imgDiv = document.createElement("div");
            imgDiv.className = "form-image-preview";
            Object.assign(imgDiv.style, {
                position: "absolute",
                left: el.left,
                top: el.top,
                width: el.width,
                height: el.height,
                boxSizing: "border-box",
                overflow: "hidden",
                pointerEvents: "none"
            });
            const imgEl = _buildImagePreviewElement(el);
            if (imgEl) imgDiv.appendChild(imgEl);
            previewCanvas.appendChild(imgDiv);
        }
    }
    // Синхронізуємо розміри formPreview з formCreatorModalContent
    const creatorContent = document.getElementById("formCreatorModalContent");
    const formPreview = document.getElementById("formPreview");
    const formCanvas = document.getElementById("formCanvas");
    if (creatorContent && formPreview) {
        const cr = creatorContent.getBoundingClientRect();
        formPreview.style.width  = (cr.width-50)  + "px";
        formPreview.style.height = (cr.height-50) + "px";
        formPreview.style.maxWidth  = "";
        formPreview.style.maxHeight = "";
    }
    if (formCanvas && previewCanvas) {
        const fr = formCanvas.getBoundingClientRect();
        // Застосовуємо розміри лише якщо formCanvas реально видимий (не display:none)
        if (fr.width > 0 && fr.height > 0) {
            previewCanvas.style.width  = fr.width  + "px";
            previewCanvas.style.height = fr.height + "px";
            previewCanvas.style.flex   = "none";
        }
    }
    previewModal.style.display = "flex";
    // Оверлей read-only: прозорий шар поверх канвасу блокує введення даних
    const existingOverlay = previewCanvas.querySelector(".form-readonly-overlay");
    if (existingOverlay) existingOverlay.remove();
    if (formIsReadOnly) {
        const overlay = document.createElement("div");
        overlay.className = "form-readonly-overlay";
        Object.assign(overlay.style, {
            position: "absolute",
            inset: "0",
            zIndex: "10",
            cursor: "not-allowed",
            background: "transparent"
        });
        previewCanvas.appendChild(overlay);
    }
    // Синхронізуємо виділення рядка таблиці з поточним записом
    // Таймаут потрібен, щоб DOM вже був готовий
    setTimeout(syncTableSelectionToRecord, 0);
}

async function saveFormChanges() {
    const fields = [...document.querySelectorAll("#formPreviewCanvas .form-field")];
    if (fields.length === 0) {
        Message(t("formNoFields"));
        return;
    }
    // Має бути одна таблиця
    const tableNames = [...new Set(fields.map(f => f.dataset.tableName).filter(Boolean))];
    if (tableNames.length !== 1) {
        Message(t("formMultipleTables"));
        return;
    }
    const tableName = tableNames[0];
    const table = database.tables.find(t => t.name === tableName);
    if (!table) {
        Message(t("formTableNotFound"));
        return;
    }
    // Допоміжні
    const hasValue = v => !(v === undefined || v === null || (typeof v === "string" && v.trim() === ""));
    const toNullIfEmpty = v => (hasValue(v) ? v : null);
    const normType = t => String(t || "").trim().toLowerCase();
    // Збір і нормалізація значень з форми (тільки для полів, що на формі)
    const values = {};
    let allEmpty = true;
    fields.forEach(f => {
        const colIndex = Number(f.dataset.colIndex ?? (f.querySelector("[data-col-index]")?.dataset.colIndex));
        const colSchema = table.schema[colIndex];
        if (!colSchema) return;
        const control = f.querySelector("input, select, textarea, [contenteditable='true']");
        let value;
        // --- СПЕЦІАЛЬНА ОБРОБКА: ЗОБРАЖЕННЯ ---
        const fieldType = colSchema ? String(colSchema.type || "").trim().toLowerCase() : "";
        if (fieldType === "зображення" || fieldType === "image") {
            const storeInDb = localStorage.getItem("app_settings_storeFilesInDb") === "true";
            if (storeInDb) {
                // Значення вже оновлено напряму в tableData через openFileEditor — беремо звідти
                const recordIndex = Math.min(currentFormRecordIndex, (table.data?.length ?? 1) - 1);
                value = table.data?.[recordIndex]?.[colIndex] ?? null;
            } else {
                const img = f.querySelector("img");
                value = img ? img.src : "";
                // Якщо src — це "default" або порожній — зробити null
                if (!value || value === window.location.href || value === "about:blank" || value === window.location.origin + "/") {
                    value = null;
                }
            }
        }
        // --- ЗВИЧАЙНА ОБРОБКА для інших типів ---
        else if (!control) {
            value = f.textContent ?? "";
        } else if (control.tagName === "SELECT") {
            value = control.value === "empty" ? null : control.value;
        } else if (control.hasAttribute("contenteditable")) {
            value = control.innerText;
        } else {
            value = control.value;
        }
        console.log("value 0=", value)
        const t = normType(colSchema.type);
        console.log("normType=", t)
        if (t === "ціле число" || t === "integer") {
            value = hasValue(value) ? parseInt(value, 10) : null;
            if (Number.isNaN(value)) value = null;
        } else if (t === "дробове число" || t === "real" || t === "float" || t === "numeric") {
            value = hasValue(value) ? Number(value) : null;
            if (Number.isNaN(value)) value = null;
        } else if (t === "так/ні" || t === "boolean") {
            const s = String(value).toLowerCase();
            value = (s === "1" || s === "true" || s === "yes" || s === "on") ? 1 : 0;
        } else if (t === "дата" || t === "date") {
            value = (hasValue(value) && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) ? String(value) : null;
        } else {
            // рядки не повинні перетворюватися на null, якщо це не порожні рядки
            if (typeof value === "string") value = value.trim();
            value = toNullIfEmpty(value);
        }
        console.log("value 1=", value)
        const fieldName = f.dataset.fieldName;
        console.log("fieldName =", fieldName)
        if (!fieldName) return;
        values[fieldName] = value;
        if (value !== null && value !== "") allEmpty = false;
    });
    console.log("values=", values)
    if (allEmpty) {
        Message(t("formEmptyRecord"));
        return;
    }
    // Первинний ключ (припускаємо один PK-стовпець)
    const pkIndex = table.schema.findIndex(col => col.primaryKey);
    if (pkIndex === -1) {
        Message(t("formNoPrimaryKey"));
        return;
    }
    const pkCol = table.schema[pkIndex];
    const pkField = pkCol.title;
    // Визначаємо чи PK авто-генерується:
    // 1) явний прапорець autoInc, або
    // 2) тип INTEGER/«ціле число» з PRIMARY KEY у SQLite (SQLite генерує rowid).
    const isIntegerPk = ["integer", "ціле число"].includes(normType(pkCol.type));
    const isAutoPk = !!pkCol.autoInc || isIntegerPk;
    const idx = currentFormRecordIndex ?? 0;
    const pkFromRow = (idx < (table.data?.length ?? 0)) ? table.data[idx]?.[pkIndex] : undefined;
    // Форсований режим: вважаємо новим записом, якщо індекс виходить за межі ТАБ0 є спеціальний прапорець
    const isNewRecordMode = !!isCreatingNewRecord || idx >= (table.data?.length ?? 0);
    console.log("isNewRecordMode=", isNewRecordMode, isCreatingNewRecord)
    // Рядок існує, якщо ми не у режимі нового запису і PK є
    const rowExists = !isNewRecordMode && hasValue(pkFromRow);
    let pkValueFromForm = values[pkField];
    console.log("Debug info:", {
        isNewRecordMode,
        currentFormRecordIndex,
        tableDataLength: table.data?.length ?? 0,
        pkFromRow,
        rowExists
    });
    // --- Гілка ДОДАВАННЯ ---
    if (!rowExists) {
        console.log("add row from Form")
        if (isAutoPk) {
            // Нехай SQLite згенерує PK — не передаємо його у INSERT
            delete values[pkField];
            pkValueFromForm = undefined;
        } else {
            // Не авто-PK: значення обов'язкове
            if (!hasValue(pkValueFromForm)) {
                Message(t("formPkRequired", pkField));
                return;
            }
            // Перевірка дублювання PK у пам'яті
            const dup = (table.data || []).some(r => String(r?.[pkIndex]) === String(pkValueFromForm));
            if (dup) {
                Message(t("formPkDuplicate", pkField, pkValueFromForm));
                return;
            }
        }
        // Формуємо INSERT
        const fieldKeys = Object.keys(values);
        if (fieldKeys.length === 0) {
            await dba.db.run(`INSERT INTO "${tableName}" DEFAULT VALUES;`);
        } else {
            const placeholders = fieldKeys.map(() => "?").join(", ");
            const sql = `INSERT INTO "${tableName}" (${fieldKeys.map(f => `"${f}"`).join(", ")}) VALUES (${placeholders});`;
            const params = fieldKeys.map(f => values[f]);
            await dba.db.run(sql, params);
        }
        // Підтягнути згенерований PK (для авто-PK)
        if (isAutoPk) {
            const r = await dba.db.exec(`SELECT last_insert_rowid() AS id;`);
            const newId = r?.[0]?.values?.[0]?.[0] ?? null;
            values[pkField] = newId;
        }
        // --- Виправлене формування нового рядка для in-memory ---
        // Перезавантажити таблицю з бази
        const refreshResult = await dba.db.exec(`SELECT * FROM "${tableName}";`);
        if (refreshResult.length > 0) {
            table.data = refreshResult[0].values;
            currentFormRecordIndex = table.data.length - 1;
            console.log("Table refreshed from database, new length:", table.data.length);
        } else {
            // Якщо таблиця порожня
            table.data = [];
            currentFormRecordIndex = -1;
        }
        isCreatingNewRecord = false;
        Message(t("formRecordAdded"));
        saveDatabase();
        return;
    }
    // --- Гілка РЕДАГУВАННЯ ---
    // Для авто-PK не дозволяємо змінювати PK вручну
    if (isAutoPk) {
        values[pkField] = pkFromRow;
    } else {
        // Якщо користувач змінив PK — перевірка дублювання
        if (hasValue(pkValueFromForm) && String(pkValueFromForm) !== String(pkFromRow)) {
            const dup = (table.data || []).some((r, i) => i !== idx && String(r?.[pkIndex]) === String(pkValueFromForm));
            if (dup) {
                Message(t("formPkDuplicate", pkField, pkValueFromForm));
                return;
            }
        } else {
            // Якщо у формі PK не заданий — лишаємо старий
            values[pkField] = pkFromRow;
        }
    }
    // Оновлюємо лише колонки, що прийшли з форми (без PK, якщо авто-PK)
    const updateKeys = Object.keys(values).filter(k => !(isAutoPk && k === pkField));
    console.log("updateKeys=", updateKeys, values)
    if (updateKeys.length > 0) {
        const setClause = updateKeys.map(k => `"${k}" = ?`).join(", ");
        const params = updateKeys.map(k => values[k]);
        const sql = `UPDATE "${tableName}" SET ${setClause} WHERE "${pkField}" = ?;`;
        await dba.db.run(sql, [...params, pkFromRow]);
    }
    // Оновити in-memory
    const row = table.data[idx];
    const colIndexByTitle = Object.fromEntries(table.schema.map((c, i) => [c.title, i]));
    updateKeys.forEach(k => {
        const ci = colIndexByTitle[k];
        if (ci !== undefined) row[ci] = values[k];
    });
    if (!isAutoPk && hasValue(values[pkField])) {
        row[pkIndex] = values[pkField];
    }
    isCreatingNewRecord = false;
    Message(t("formRecordUpdated"));
    saveDatabase();
    // Оновлюємо таблицю на формі та виділяємо поточний рядок
    _refreshFormTablesAfterFieldSave();
}

function goToFirstRecord() {
    isCreatingNewRecord = false;
    currentFormRecordIndex = 0;
    previewForm(currentPreviewForm, false);
}

function goToPreviousRecord() {
    isCreatingNewRecord = false;
    currentFormRecordIndex = Math.max(0, currentFormRecordIndex - 1);
    previewForm(currentPreviewForm, false);
}

function goToNextRecord() {
    isCreatingNewRecord = false;
    // визначити макс. довжину таблиць
    const tables = database.tables;
    const maxLength = Math.max(...tables.map(t => t.data.length));
    currentFormRecordIndex = Math.min(maxLength - 1, currentFormRecordIndex + 1);
    previewForm(currentPreviewForm, false);
}

function goToLastRecord(skipReset = false) {
    if (!skipReset) isCreatingNewRecord = false;
    const tables = database.tables;
    const maxLength = Math.max(...tables.map(t => t.data.length));
    currentFormRecordIndex = maxLength - 1;
    previewForm(currentPreviewForm, false);
}

function createNewRecord() {
    // зібрати всі таблиці, що використовуються у формі
    const elements = [...document.querySelectorAll("#formCanvas .form-field")];
    const usedTables = [...new Set(elements.map(el => el.dataset.tableName).filter(Boolean))];
    // входимо у режим створення нового запису:
    isCreatingNewRecord = true;
    usedTables.forEach(tableName => {
        const table = database.tables.find(t => t.name === tableName);
        if (!table) return;
        // створюємо порожній рядок
        const newRow = table.schema.map(() => "");
        // автопідстановка для PK з autoInc
        table.schema.forEach((col, idx) => {
            if (col && col.primaryKey && col.autoInc) {
                // зібрати всі валідні числові значення по цій колонці
                const nums = (table.data || []).map(r => r?.[idx]).filter(v => v !== "" && v !== null && v !== undefined).map(v => Number(v)).filter(n => Number.isFinite(n));
                const maxVal = nums.length ? Math.max(...nums) : 0;
                newRow[idx] = maxVal + 1; // наступне значення
            }
        });
        // додати рядок у дані таблиці
        table.data = table.data || [];
        table.data.push(newRow);
    });
    saveDatabase();
    // перейти до останнього запису (щоб одразу побачити доданий)
    goToLastRecord(true);
}

async function deleteFormRecord() {
    // Визначаємо таблицю з першого поля форми
    const fields = [...document.querySelectorAll("#formPreviewCanvas .form-field")];
    const tableNames = [...new Set(fields.map(f => f.dataset.tableName).filter(Boolean))];
    if (tableNames.length !== 1) {
        Message(t("formMultipleTables"));
        return;
    }
    const tableName = tableNames[0];
    const table = database.tables.find(tb => tb.name === tableName);
    if (!table) {
        Message(t("formTableNotFound"));
        return;
    }
    const pkIndex = table.schema.findIndex(col => col.primaryKey);
    if (pkIndex === -1) {
        Message(t("formNoPrimaryKey"));
        return;
    }
    const idx = currentFormRecordIndex ?? 0;
    if (!table.data || table.data.length === 0 || idx >= table.data.length) {
        Message(t("formNoRecordToDelete"));
        return;
    }
    const pkValue = table.data[idx]?.[pkIndex];
    const pkField = table.schema[pkIndex].title;
    confirmDeleteFormRecord(async (confirmed) => {
        if (!confirmed) return;
        try {
            await dba.db.run(`DELETE FROM "${tableName}" WHERE "${pkField}" = ?;`, [pkValue]);
            table.data.splice(idx, 1);
            // Коригуємо індекс, щоб не вийти за межі
            if (table.data.length === 0) {
                currentFormRecordIndex = 0;
            } else {
                currentFormRecordIndex = Math.min(idx, table.data.length - 1);
            }
            saveDatabase();
            Message(t("formRecordDeleted"));
            previewForm(currentPreviewForm, false);
        } catch (e) {
            Message(t("aeditDeleteError", e.message));
        }
    });
}

function deleteSelectedForm() {
    if (!selectedFormName) {
        Message(t("formSelectForDelete"));
        return;
    }
    const formIndex = database.forms.findIndex(q => q.name === selectedFormName);
    if (formIndex !== -1) {
        const deletedFormName = database.forms[formIndex].name;
        database.forms.splice(formIndex, 1); // Remove 
        saveDatabase(); // Save updated
        const dataMenu = document.getElementById("data-menu");
        Message(t("formDeleted", deletedFormName));
        showSavedFormsDialog(); // Refresh the list
    } else {
        Message(t("formNotFoundForDelete"));
    }
}
/**
 * Універсальне модальне вікно підтвердження збереження.
 * onSave   — викликається при натисканні "Зберегти"
 * onClose  — викликається при натисканні "Закрити" (без збереження)
 **/
function showConfirmSave(onSave, onClose) {
    const modal = document.getElementById("confirmSaveModal");
    const saveBtn = document.getElementById("confirmSaveSaveBtn");
    const closeBtn = document.getElementById("confirmSaveCloseBtn");
    const cleanup = () => {
        modal.style.display = "none";
    };
    saveBtn.onclick = () => {
        cleanup();
        onSave();
    };
    closeBtn.onclick = () => {
        cleanup();
        if (onClose) onClose();
    };
    modal.style.display = "flex";
}
/**
 * Закриття Конструктора форм.
 * Якщо є незбережені зміни (прапор isDesignerDirty) — питає про збереження.
 **/
function closeFormModal() {
    if (typeof isDesignerDirty !== "undefined" && isDesignerDirty) {
        showConfirmSave(
            () => {
                saveForm();
                _doCloseFormModal();
            },
            () => {
                _doCloseFormModal();
            });
    } else {
        _doCloseFormModal();
    }
}

function _doCloseFormModal() {
    document.getElementById("formCreatorModal").style.display = "none";
    if (typeof isDesignerDirty !== "undefined") isDesignerDirty = false;
}
/**
 * Закриття вікна перегляду форми.
 **/
function closeFormPreview() {
    document.getElementById("formPreviewModal").style.display = "none";
}
/**
 * Оновлює відображення всіх таблиць на формі після збереження змін у полях,
 * потім виділяє рядок поточного запису.
 */
function _refreshFormTablesAfterFieldSave() {
    if (!window._formTables) {
        syncTableSelectionToRecord();
        return;
    }
    Object.entries(window._formTables).forEach(([tName, tempTable]) => {
        const tableObj = tempTable.originalTable || database.tables.find(t => t.name === tName);
        if (!tableObj || !tempTable._tbody) return;
        refreshFormTableDisplay(tempTable, tableObj, null);
    });
    syncTableSelectionToRecord();
}

/**
 * Синхронізує виділений рядок таблиці(ць) на формі з поточним записом (currentFormRecordIndex).
 * Викликається після навігації або збереження.
 */
function syncTableSelectionToRecord() {
    const tableContainers = document.querySelectorAll("#formPreviewCanvas .form-table");
    tableContainers.forEach(container => {
        const tbody = container.querySelector("tbody");
        if (!tbody) return;
        // Знімаємо попереднє виділення
        tbody.querySelectorAll("tr.form-table-current-row").forEach(r => r.classList.remove("form-table-current-row"));
        const rows = tbody.querySelectorAll("tr");
        const targetRow = rows[currentFormRecordIndex];
        if (!targetRow) return;
        targetRow.classList.add("form-table-current-row");
        // Прокручуємо рядок у видиму область
        targetRow.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
}

/**
 * Оновлює поля форми значеннями з поточного запису таблиці після збереження в таблиці.
 * Викликається після saveFormTableData.
 */
function syncFieldsFromCurrentRecord() {
    const fields = [...document.querySelectorAll("#formPreviewCanvas .form-field")];
    if (fields.length === 0) return;
    // Збираємо унікальні таблиці, що використовуються у полях форми
    const tableNames = [...new Set(fields.map(f => f.dataset.tableName).filter(Boolean))];
    if (tableNames.length === 0) return;
    // Будуємо map: tableName -> { table, rowData }
    const tableDataMap = {};
    tableNames.forEach(tableName => {
        const table = database.tables.find(t => t.name === tableName);
        if (!table) return;
        const idx = Math.min(currentFormRecordIndex, (table.data?.length ?? 1) - 1);
        const rowData = table.data?.[idx];
        if (rowData) tableDataMap[tableName] = { table, rowData };
    });
    fields.forEach(f => {
        const tableName = f.dataset.tableName;
        if (!tableName || !tableDataMap[tableName]) return;
        const colIndex = Number(f.dataset.colIndex);
        if (isNaN(colIndex) || colIndex < 0) return;
        const newValue = tableDataMap[tableName].rowData[colIndex] ?? "";
        const control = f.querySelector("input, select, textarea");
        const img = f.querySelector("img");
        if (img) {
            img.src = newValue || "";
        } else if (control) {
            if (control.tagName === "SELECT") {
                control.value = newValue == null ? "empty" : String(newValue);
            } else {
                control.value = newValue ?? "";
            }
        } else {
            f.textContent = newValue ?? "";
        }
    });
}

/**
 * Оновлює тільки тіло таблиці на формі без повного перерендерингу
 */
function updateFormTableData(tableName, tableData) {
    const tableContainers = document.querySelectorAll("#formPreviewCanvas .form-table");
    for (const container of tableContainers) {
        const tbody = container.querySelector("tbody");
        if (!tbody) continue;
        // Перевіряємо, чи це наша таблиця
        const tableId = tbody.id;
        if (!tableId) continue;
        // Оновлюємо дані в tbody
        const rows = tableData.data || [];
        const schema = tableData.schema || [];
        tbody.innerHTML = "";
        rows.forEach((rowData, rowIndex) => {
            const tr = document.createElement("tr");
            schema.forEach((col, colIndex) => {
                const td = document.createElement("td");
                td.style.border = "1px solid #ddd";
                td.style.padding = "6px";
                td.style.whiteSpace = "nowrap";
                td.style.fontSize = "10px";
                td.textContent = rowData[colIndex] ?? " ";
                td.addEventListener("click", () => {
                    if (selectedCell?.parentElement) selectedCell.parentElement.classList.remove("selected-row");
                    selectedCell = td;
                    if (selectedCell.parentElement) selectedCell.parentElement.classList.add("selected-row");
                    if (window._formTables && window._formTables[tableName]) {
                        currentEditTable = window._formTables[tableName];
                    }
                });
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    }
}
// Глобальні змінні для контекстного меню таблиці у формі
let currentFormTableContext = {
    tempTable: null,
    tableObj: null,
    frame: null,
    tableName: null
};

/**
 * Показує модальне вікно з кнопками для роботи з таблицею у формі
 */
function showFormTableContextMenuLegacy(x, y, tempTable, tableObj, frame) {
    // Зберігаємо контекст
    currentFormTableContext = {
        tempTable: tempTable,
        tableObj: tableObj,
        frame: frame,
        tableName: tempTable.name || "formDefaultTableName"
    };
    
    // Оновлюємо заголовок модального вікна
    const titleEl = document.getElementById("formTableContextTitle");
    if (titleEl) {
        titleEl.textContent = `📊 Робота з таблицею "${currentFormTableContext.tableName}"`;
    }
    
    // Показуємо модальне вікно
    const modal = document.getElementById("formTableContextMenuModal");
    if (modal) {
        modal.style.display = "flex";
    }
}

/**
 * Закриває модальне вікно контекстного меню таблиці
 */
function closeFormTableContextMenuLegacy() {
    const modal = document.getElementById("formTableContextMenuModal");
    if (modal) {
        modal.style.display = "none";
    }
    currentFormTableContext = {
        tempTable: null,
        tableObj: null,
        frame: null,
        tableName: null
    };
}

/**
 * Додає новий рядок до таблиці у формі
 */
async function addFormTableRow() {
    const { tempTable, tableObj, frame } = currentFormTableContext;
    if (!tempTable || !tableObj) {
        Message(t("formAddRowError"));
        closeFormTableContextMenu();
        return;
    }
    currentEditTable = tempTable;
    
    // Визначаємо PK-колонку та чи вона авто-інкрементна
    const pkIndex = tableObj.schema.findIndex(col => col.primaryKey);
    const pkCol = pkIndex !== -1 ? tableObj.schema[pkIndex] : null;
    const normType = s => String(s || "").trim().toLowerCase();
    const isIntegerPk = pkCol && ["integer", "ціле число"].includes(normType(pkCol.type));
    const isAutoPk = pkCol && (!!pkCol.autoInc || isIntegerPk);

    // Будуємо новий рядок за оригінальною схемою.
    // Для авто-PK залишаємо null — SQLite згенерує значення сам.
    const newFullRow = tableObj.schema.map(() => null);

    // INSERT у БД
    try {
        if (isAutoPk) {
            // Не передаємо PK-колонку — SQLite генерує rowid/autoincrement
            const nonPkCols = tableObj.schema.filter((_, i) => i !== pkIndex);
            if (nonPkCols.length === 0) {
                await dba.db.run(`INSERT INTO "${tableObj.name}" DEFAULT VALUES;`);
            } else {
                const cols = nonPkCols.map(c => `"${c.title}"`).join(", ");
                const placeholders = nonPkCols.map(() => "?").join(", ");
                const values = nonPkCols.map(() => null);
                await dba.db.run(`INSERT INTO "${tableObj.name}" (${cols}) VALUES (${placeholders});`, values);
            }
        } else {
            // Не авто-PK: передаємо всі колонки з null-значеннями
            const cols = tableObj.schema.map(c => `"${c.title}"`).join(", ");
            const placeholders = tableObj.schema.map(() => "?").join(", ");
            const values = newFullRow.map(v => v ?? null);
            await dba.db.run(`INSERT INTO "${tableObj.name}" (${cols}) VALUES (${placeholders});`, values);
        }
    } catch (e) {
        Message(t("aeditDeleteError", e.message));
        closeFormTableContextMenu();
        return;
    }

    // Перезавантажуємо весь вміст таблиці з БД, щоб отримати реальний PK
    // (особливо важливо коли PK-поле не відображається у формі)
    try {
        const refreshResult = await dba.db.exec(`SELECT * FROM "${tableObj.name}";`);
        if (refreshResult.length > 0) {
            tableObj.data = refreshResult[0].values;
        }
    } catch (e) {
        console.warn("[addFormTableRow] Не вдалось перезавантажити таблицю:", e.message);
        // Fallback: додаємо рядок вручну
        if (isAutoPk && pkIndex !== -1) {
            let max = 0;
            tableObj.data.forEach(row => {
                const val = parseInt(row[pkIndex]);
                if (!isNaN(val)) max = Math.max(max, val);
            });
            newFullRow[pkIndex] = max + 1;
        }
        tableObj.data.push(newFullRow);
    }
    
    // 🔄 Оновлюємо відображення таблиці
    refreshFormTableDisplay(tempTable, tableObj, frame);
    
    // 🔑 АВТОМАТИЧНЕ ВИДІЛЕННЯ НОВОГО РЯДКА ТА СИНХРОНІЗАЦІЯ
    const newRowIdx = tempTable.data.length - 1;
    currentFormRecordIndex = newRowIdx;
    
    const tbody = tempTable._tbody;
    if (tbody) {
        const rows = tbody.querySelectorAll('tr');
        const newRow = rows[newRowIdx];
        if (newRow) {
            // Знімаємо виділення з попереднього рядка
            if (selectedCell?.parentElement) selectedCell.parentElement.classList.remove('selected-row');
            // Встановлюємо новий активний рядок (аналогічно mousedown)
            selectedCell = newRow.cells[0] || newRow;
            newRow.classList.add('selected-row');
            
            // Синхронізуємо поля форми з даними нового запису
            syncFieldsFromCurrentRecord();
            syncTableSelectionToRecord();
        }
    }
    
    saveDatabase();
    Message(t("formRowAdded"));
    closeFormTableContextMenu();
}

/**
 * Видаляє виділений рядок з таблиці у формі
 */
function deleteFormTableRow() {
    const { tempTable, tableObj, frame } = currentFormTableContext;
    
    if (!tempTable || !tableObj) {
        Message(t("formAddRowError"));
        closeFormTableContextMenu();
        return;
    }
    
    if (!selectedCell) {
        Message(t("aeditDeleteSelectFirst"));
        closeFormTableContextMenu();
        return;
    }
    
    // Підмінюємо currentEditTable на версію з ПОВНОЮ схемою (tableObj),
    // але зберігаємо _tbody від tempTable, щоб deleteSelectedRow
    // знайшов PK навіть якщо PK-поле приховане у таблиці форми.
    const editTableForDelete = {
        ...tableObj,
        _tbody: tempTable._tbody,
        originalTable: tableObj,
        // Явно передаємо selectedFields цієї конкретної таблиці, щоб aedit.js
        // не шукав їх по імені і не переплутав з іншою таблицею на формі
        _selectedFields: tempTable.selectedFields || []
    };
    currentEditTable = editTableForDelete;
    deleteSelectedRow(() => {
        // Після видалення синхронізуємо tempTable з оновленим tableObj
        tempTable.data = tableObj.data;
        refreshFormTableDisplay(tempTable, tableObj, frame);
        currentEditTable = null;
    });
    closeFormTableContextMenu();
}

/**
 * Зберігає зміни даних таблиці у формі
 */
function saveFormTableData() {
    const { tempTable, tableObj } = currentFormTableContext;
    
    if (!tempTable || !tableObj) {
        Message(t("formAddRowError"));
        closeFormTableContextMenu();
        return;
    }
    
    // Зчитуємо дані з DOM назад у tempTable.data і tableObj.data
    const tbody = tempTable._tbody;
    if (!tbody) {
        Message(t("formSaveBodyError"));
        closeFormTableContextMenu();
        return;
    }
    
    const rows = tbody.querySelectorAll("tr");
    rows.forEach((tr, rowIndex) => {
        const tds = tr.querySelectorAll("td");
        tempTable.schema.forEach((col, colIndex) => {
            const td = tds[colIndex];
            if (!td) return;
            
            const originalColIndex = tableObj.schema.findIndex(c => c.title === col.title);
            if (originalColIndex === -1) return;
            
            let value;
            const select = td.querySelector("select");
            const picker = td.querySelector("custom-date-picker");
            const input = td.querySelector("input");
            
            if (select) {
                value = select.value === "empty" ? null : select.value;
            } else if (picker) {
                value = picker.value || null;
            } else if (input) {
                value = input.value;
            } else {
                value = td.innerText.trim();
            }
            
            if (tempTable.data[rowIndex]) tempTable.data[rowIndex][colIndex] = value;
            if (tableObj.data[rowIndex]) tableObj.data[rowIndex][originalColIndex] = value;
        });
    });
    
    // Викликаємо saveTableData
    const savedTable = currentEditTable;
    currentEditTable = tempTable;
    saveTableData();
    currentEditTable = savedTable;
    
    Message(t("formTableSaved"));
    closeFormTableContextMenu();
    // Оновлюємо поля форми значеннями з поточного запису таблиці
    syncFieldsFromCurrentRecord();
    // Оновлюємо вміст ВСІХ інших таблиць на формі
    _refreshFormTablesAfterFieldSave();
    syncTableSelectionToRecord();
}

/**
 * Оновлює відображення таблиці у формі після змін
 */
function refreshFormTableDisplay(tempTable, tableObj, frame) {
    const tbody = tempTable._tbody;
    if (!tbody) return;
    
    const selectedFields = tempTable.selectedFields || [];
    let filteredSchema = tempTable.schema;
    let filteredData = tempTable.data;
    
    if (selectedFields.length > 0) {
        filteredSchema = tableObj.schema.filter(col => selectedFields.includes(col.title));
        const fieldIndices = selectedFields.map(field => tableObj.schema.findIndex(col => col.title === field)).filter(idx => idx !== -1);
        filteredData = tableObj.data.map(row => fieldIndices.map(idx => row[idx]));
        
        // Оновлюємо tempTable
        tempTable.schema = filteredSchema;
        tempTable.data = filteredData;
    }
    
    // Оновлюємо заголовок
    const thead = tbody.parentElement?.previousElementSibling;
    if (thead && thead.tagName === 'THEAD') {
        thead.innerHTML = "";
        const headerRow = document.createElement("tr");
        filteredSchema.forEach((col) => {
            const th = document.createElement("th");
            th.textContent = col.subst ? col.title + "🛟" : col.title;
            th.style.backgroundColor = "#eee";
            th.style.padding = "8px";
            th.style.border = "1px solid #777";
            th.style.fontSize = "10px";
            th.style.whiteSpace = "nowrap";
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
    }
    
    // Оновлюємо тіло
    tbody.innerHTML = "";
    filteredData.forEach((rowData, rowIndex) => {
        const tr = document.createElement("tr");
        const fullRowData = tableObj.data[rowIndex];
        filteredSchema.forEach((col, colIndex) => {
            const td = document.createElement("td");
            const originalColIndex = tableObj.schema.findIndex(c => c.title === col.title);
            const cellData = rowData[colIndex];
            td.style.border = "1px solid #777";
            td.style.padding = "6px";
            td.style.whiteSpace = "nowrap";
            td.style.fontSize = "10px";
            
            const inputEl = advDataInput(td, cellData, col, fullRowData, originalColIndex, false);
            if (inputEl) inputEl.style.fontSize = "10px";
            if (inputEl && inputEl.tagName === 'CUSTOM-DATE-PICKER') {
                inputEl.addEventListener("change", () => {
                    fullRowData[originalColIndex] = inputEl.value || "";
                    filteredData[rowIndex][colIndex] = inputEl.value || "";
                });
            }
            
            td.addEventListener("click", () => {
                if (selectedCell?.parentElement) selectedCell.parentElement.classList.remove("selected-row");
                selectedCell = td;
                if (selectedCell.parentElement) selectedCell.parentElement.classList.add("selected-row");
                currentEditTable = tempTable;
            });
            
            td.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                e.stopPropagation();
                currentEditTable = tempTable;
                if (selectedCell?.parentElement) selectedCell.parentElement.classList.remove("selected-row");
                selectedCell = td;
                if (selectedCell.parentElement) selectedCell.parentElement.classList.add("selected-row");
                showFormTableContextMenu(e.clientX, e.clientY, tempTable, tableObj, frame);
            });
            
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    
    // Додаємо контекстне меню для tbody
    tbody.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        showFormTableContextMenu(e.clientX, e.clientY, tempTable, tableObj, frame);
    });
}
// Глобальна змінна для відстеження, чи активне меню таблиці
let isTableMenuActive = false;

/**
 * Показує кнопку меню таблиці на правій панелі
 */
function showTableMenuButton() {
    const btn = document.getElementById("frmTableMenuBtn");
    if (btn) {
        btn.style.display = "flex";
        isTableMenuActive = true;
    }
}

/**
 * Приховує кнопку меню таблиці на правій панелі
 */
function hideTableMenuButton() {
    const btn = document.getElementById("frmTableMenuBtn");
    if (btn) {
        btn.style.display = "none";
        isTableMenuActive = false;
    }
}

/**
 * Показує модальне вікно з кнопками для роботи з таблицею у формі
 * (оновлена версія - також приховує кнопку при закритті)
 */
function showFormTableContextMenu(x, y, tempTable, tableObj, frame) {
    // Зберігаємо контекст
    currentFormTableContext = {
        tempTable: tempTable,
        tableObj: tableObj,
        frame: frame,
        tableName: tempTable.name || "formDefaultTableName"
    };
    
    // Оновлюємо заголовок модального вікна
    const titleEl = document.getElementById("formTableContextTitle");
    if (titleEl) {
        titleEl.textContent =t("formTableMenuTitle",currentFormTableContext.tableName)// `📊 Робота з таблицею "${currentFormTableContext.tableName}"`;
    }
    
    // Показуємо модальне вікно
    const modal = document.getElementById("formTableContextMenuModal");
    if (modal) {
        modal.style.display = "flex";
    }
    
    // Ховаємо кнопку на правій панелі, оскільки меню вже відкрите
    hideTableMenuButton();
}

/**
 * Закриває модальне вікно контекстного меню таблиці
 * (оновлена версія - не ховає кнопку, вона ховається окремо)
 */
function closeFormTableContextMenu() {
    const modal = document.getElementById("formTableContextMenuModal");
    if (modal) {
        modal.style.display = "none";
    }
    currentFormTableContext = {
        tempTable: null,
        tableObj: null,
        frame: null,
        tableName: null
    };
}

/**
 * Обробник кліку по кнопці "formDefaultTableName" на правій панелі
 */
function onTableMenuButtonClick() {
    if (!currentFormActiveTable) {
        Message(t("formNoTableSelected"));
        hideTableMenuButton();
        return;
    }
    
    // Отримуємо контекст таблиці
    const { tempTable, tableObj, frame } = currentFormTableContext;
    if (!tempTable || !tableObj) {
        // Спроба відновити контекст з поточної активної таблиці
        if (currentFormActiveTable && currentFormActiveTable.originalTable) {
            const frame = document.querySelector("#formPreviewCanvas .form-table");
            showFormTableContextMenu(0, 0, currentFormActiveTable, currentFormActiveTable.originalTable, frame);
        } else {
            Message(t("formTableContextLost"));
            hideTableMenuButton();
        }
    } else {
        showFormTableContextMenu(0, 0, tempTable, tableObj, frame);
    }
}
