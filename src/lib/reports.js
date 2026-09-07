// Конструктор звітів
function createReport() {
    createDesigner("report");
}
    
// Редагування обраного звіту
function editSelectedReport() {
        if (!selectedReportName) {
            Message(t("reportSelectForEdit"));
            return;
        }
        // Заблокований звіт — відкрити у режимі перегляду
        if (typeof isLocked === "function" && isLocked("report", selectedReportName)) {
            const report = database.reports.find(r => r.name === selectedReportName);
            if (!report) { Message(t("reportNotFound")); return; }
            document.getElementById("reportListModal").style.display = "none";
            previewReport(report);
            return;
        }
        document.getElementById("reportListModal").style.display = "none";
        const report = database.reports.find(r => r.name === selectedReportName);
        if (!report) {
            Message(t("reportNotFound"));
            return;
        }
        constructorMode = "report";
        screenCanvas = document.getElementById(constructorMode+"Canvas");

        // Оновлюємо результати запитів, що використовуються у звіті,
        // щоб дані були актуальними перед відкриттям конструктора
        if (typeof refreshQueriesUsedInElements === "function") {
            refreshQueriesUsedInElements(report.elements || []);
        }

        renderCanvas(report);

        document.getElementById("reportCreatorModal").style.display = "flex";

        Message(t("reportLoadedForEdit", report.name));
}    

// Вікно перегляду створених звітів
function showReportsList() {
        const listEl = document.getElementById("reportList");
        listEl.innerHTML = "";
        selectedReportName = null;

        database.reports.forEach((report) => {
            console.log("report=", report)
            const li = createSelectableListItem(listEl, report.name, "reportName", name => {
                selectedReportName = name;
            });
            listEl.appendChild(li);
        });
        document.getElementById("reportListModal").style.display = "flex";
}

function closeReportList() {
        document.getElementById("reportListModal").style.display = "none";
}

function deleteSelectedReport() {
        if (!selectedReportName) {
            Message(t("reportSelectForDelete"));
            return;
        }

        const reportIndex = database.reports.findIndex(r => r.name === selectedReportName);
        if (reportIndex === -1) {
            Message(t("reportNotFoundForDelete"));
            return;
        }

        const deletedName = database.reports[reportIndex].name;
        database.reports.splice(reportIndex, 1); // видаляємо зі списку

        saveDatabase(); // зберігаємо зміни

        // Видаляємо зі списку "Дані", якщо він там був
        const dataMenu = document.getElementById("data-menu");
        const menuItem = Array.from(dataMenu.children).find(item => item.textContent === deletedName);
        if (menuItem) menuItem.remove();

        Message(t("reportDeleted", deletedName));
        showReportsList(); // оновлюємо список звітів
}

function previewSelectedReport() {
        if (!selectedReportName) {
            Message(t("reportSelectForPreview"));
            return;
        }

        const report = database.reports.find(r => r.name === selectedReportName);
        if (!report) {
            Message(t("reportNotFound"));
            return;
        }

        previewReport(report); // функція вже реалізована для перегляду
}


function previewReport(report = null) {
    const previewModal = document.getElementById("reportPreviewModal");
    const previewCanvas = document.getElementById("reportPreviewCanvas");
    const titleEl = document.getElementById("reportPreviewTitle");
    previewCanvas.innerHTML = "";

    let elements = [];
    let reportName = " ";

    if (report) {
        reportName = report.name || t("reportNoName");
        elements = report.elements || [];
    } else {
        reportName = document.getElementById("reportNameInput").value.trim();
        const canvasElements = document.querySelectorAll("#reportCanvas .report-element");
        elements = Array.from(canvasElements).map(el => {
            if (el.classList.contains("report-shape")) {
                return {
                    type: "shape",
                    shapeType: el.dataset.shapeType,
                    strokeColor: el.dataset.strokeColor || "#333333",
                    fillColor: el.dataset.fillColor || "#ffffff",
                    fillTransparent: el.dataset.fillTransparent === "1",
                    left: el.style.left,
                    top: el.style.top,
                    width: el.style.width,
                    height: el.style.height
                };
            }
            if (el.classList.contains("report-image")) {
                return {
                    type: "image",
                    imageUrl: el.dataset.imageUrl || "",
                    imageBlob: (el._imageBlob instanceof Uint8Array && el._imageBlob.length > 0)
                        ? Array.from(el._imageBlob) : null,
                    left: el.style.left,
                    top: el.style.top,
                    width: el.style.width,
                    height: el.style.height
                };
            }
            if (el.classList.contains("report-table")) {
                const filterActive = el.dataset.filterActive === "1";
                let filteredRows = null;
                if (filterActive && el.dataset.filteredRows) {
                    try { filteredRows = JSON.parse(el.dataset.filteredRows); } catch (_) {}
                }
                return {
                    type: "table",
                    left: el.style.left,
                    top: el.style.top,
                    width: el.style.width,
                    height: el.style.height,
                    tableName: el.dataset.tableName || '',
                    selectedFields: JSON.parse(el.dataset.selectedFields || "[]"),
                    filterActive,
                    filteredRows
                };
            }
            const type = el.classList.contains("report-label") ? "label" : "field";
            return {
                type: type,
                text: el.innerText.trim(),
                left: el.style.left,
                top: el.style.top,
                width: el.style.width,
                height: el.style.height,
                fontFamily: el.style.fontFamily || 'Arial',
                fontSize: el.style.fontSize || '16px',
                fontWeight: el.style.fontWeight || 'normal',
                fontStyle: el.style.fontStyle || 'normal',
                textDecoration: el.style.textDecoration || '',
                color: el.style.color || '#000000',
                textAlign: el.style.textAlign || 'left', 
                tableName: el.dataset.tableName || '',
                fieldName: el.dataset.fieldName || ''
            };
        });
    }

    titleEl.innerText = reportName;

    // Синхронізуємо розміри reportPreview з reportCreatorModalContent
    const creatorContent = document.getElementById("reportCreatorModalContent");
    const reportPreview = document.getElementById("reportPreview");
    const designCanvas = document.getElementById("reportCanvas");
    if (creatorContent && reportPreview) {
        const cr = creatorContent.getBoundingClientRect();
        reportPreview.style.width  = (cr.width  - 50) + "px";
        reportPreview.style.height = (cr.height - 50) + "px";
        reportPreview.style.maxWidth  = "";
        reportPreview.style.maxHeight = "";
    }
    // Встановлюємо розміри канваса
    let canvasW = 0, canvasH = 0;
    if (designCanvas) {
        const fr = designCanvas.getBoundingClientRect();
        canvasW = fr.width;
        canvasH = fr.height;
    } else if (report && report.canvasWidth && report.canvasHeight) {
        canvasW = report.canvasWidth;
        canvasH = report.canvasHeight;
    }
    if (canvasW > 0 && canvasH > 0) {
        previewCanvas.style.width    = canvasW + "px";
        previewCanvas.style.height   = canvasH + "px";
        previewCanvas.style.minWidth = canvasW + "px";
        previewCanvas.style.flex     = "none";
        previewCanvas.style.position = "relative";
        previewCanvas.style.overflow = "visible";
    }

    // Скролінг лише у безпосередньому батьку previewCanvas, а не у всьому reportPreview
    const previewCanvasParent = previewCanvas.parentElement;
    if (previewCanvasParent && previewCanvasParent !== reportPreview) {
        previewCanvasParent.style.flex     = "1 1 0";
        previewCanvasParent.style.minWidth = "0";
    } else if (reportPreview) {
        // Fallback: якщо батько і є reportPreview
        //reportPreview.style.overflow = "auto";
    }

    // Оновлюємо результати запитів, щоб дані були актуальними перед рендерингом
    if (typeof refreshQueriesUsedInElements === "function") {
        refreshQueriesUsedInElements(elements);
    }

    elements.forEach(el => {
        // Рендеринг фігур
        if (el.type === "shape") {
            const shapeDiv = document.createElement("div");
            shapeDiv.className = `report-shape shape-${el.shapeType}`;
            Object.assign(shapeDiv.style, {
                position: "absolute",
                left: addPx(el.left),
                top: addPx(el.top),
                width: addPx(el.width),
                height: addPx(el.height),
                boxSizing: "border-box",
                zIndex: 0,
                pointerEvents: "none"
            });

            const fill = el.fillTransparent ? "transparent" : (el.fillColor || "#ffffff");
            const stroke = el.strokeColor || "#333333";

            if (el.shapeType === "hline") {
                shapeDiv.style.borderTop = `2px solid ${stroke}`;
            } else if (el.shapeType === "vline") {
                shapeDiv.style.borderLeft = `2px solid ${stroke}`;
            } else if (el.shapeType === "rect" || el.shapeType === "round-rect") {
                shapeDiv.style.border = `2px solid ${stroke}`;
                shapeDiv.style.backgroundColor = fill;
                if (el.shapeType === "round-rect") shapeDiv.style.borderRadius = "14px";
            }
            previewCanvas.appendChild(shapeDiv);
            return;
        }

        // Рендеринг зображень
        if (el.type === "image") {
            const imgDiv = document.createElement("div");
            imgDiv.className = "report-image-preview";
            Object.assign(imgDiv.style, {
                position: "absolute",
                left: addPx(el.left),
                top: addPx(el.top),
                width: addPx(el.width),
                height: addPx(el.height),
                boxSizing: "border-box",
                overflow: "hidden",
                pointerEvents: "none"
            });
            const imgEl = _buildImagePreviewElement(el);
            if (imgEl) imgDiv.appendChild(imgEl);
            previewCanvas.appendChild(imgDiv);
            return;
        }

        // Рендеринг таблиць з підтримкою зовнішніх ключів
        if (el.type === "table") {
            const frame = document.createElement("div");
            frame.className = "report-table";
            Object.assign(frame.style, {
                position: "absolute",
                left: addPx(el.left),
                top: addPx(el.top),
                width: addPx(el.width),
                height: addPx(el.height),               
                padding: "0",
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden"
            });
            
            const tableWrapper = document.createElement("div");
            tableWrapper.style.overflow = "auto";
            tableWrapper.style.flex = "1";
            tableWrapper.style.minHeight = "0";
            
            const tableEl = document.createElement("table");
            tableEl.style.width = "100%";
            tableEl.style.borderCollapse = "separate";
            tableEl.style.borderSpacing = "0";
            tableEl.style.tableLayout = "auto";
            tableEl.style.minWidth = "100%";
            tableEl.style.fontSize = "11px";
            
            const thead = document.createElement("thead");
            thead.style.backgroundColor = "#d0d0d0";
            thead.style.position = "sticky";
            thead.style.top = "0";
            thead.style.zIndex = "10";
            
            const tbody = document.createElement("tbody");
            
            tableEl.appendChild(thead);
            tableEl.appendChild(tbody);
            tableWrapper.appendChild(tableEl);
            frame.appendChild(tableWrapper);
            previewCanvas.appendChild(frame);
            
            // Отримуємо дані для таблиці
            const result = findTableOrQueryResult(el.tableName);
            
            if (!result || !result.table) {
                tbody.innerHTML = `<tr><td style="padding:20px; text-align:center; color:#999;">${t("reportSourceNotFound")}</td></tr>`;
                return;
            }
            
            const tableObj = result.table;
            const selectedFields = el.selectedFields || [];
            
            // Фільтруємо схему та дані
            let filteredSchema = tableObj.schema;
            let filteredData = tableObj.data;
            
            if (selectedFields.length > 0) {
                filteredSchema = tableObj.schema.filter(col => 
                    selectedFields.includes(col.title)
                );
                
                const fieldIndices = selectedFields.map(field => 
                    tableObj.schema.findIndex(col => col.title === field)
                ).filter(idx => idx !== -1);
                
                filteredData = tableObj.data.map(row => 
                    fieldIndices.map(idx => row[idx])
                );
            }

            // Якщо є збережений фільтр — використовуємо відфільтровані рядки
            if (el.filterActive && Array.isArray(el.filteredRows) && el.filteredRows.length > 0) {
                // el.filteredRows містить рядки у порядку ВСІХ колонок таблиці
                // (як у currentDataView.rows з data.js)
                const allColumns = tableObj.schema.map(c => c.title);
                filteredData = el.filteredRows.map(row => {
                    if (selectedFields.length > 0) {
                        // Витягуємо лише вибрані поля у правильному порядку
                        return selectedFields.map(f => {
                            const srcIdx = allColumns.indexOf(f);
                            return srcIdx !== -1 ? row[srcIdx] : "";
                        });
                    }
                    return row;
                });
            }
            
            // Рендеримо заголовок
            const headerRow = document.createElement("tr");
            filteredSchema.forEach((col) => {
                const th = document.createElement("th");
                const isFk = col.foreignKey && col.refTable && col.refField;
                th.textContent = isFk ? col.title : col.title;
                th.style.backgroundColor = "#d0d0d0";
                th.style.padding = "6px";
                th.style.borderTop    = "1px solid #999";
                th.style.borderLeft   = "1px solid #999";
                th.style.borderBottom = "1px solid #999";
                th.style.borderRight  = "1px solid #999";
                th.style.fontSize = "11px";
                th.style.whiteSpace = "nowrap";
                th.style.position = "relative";
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            
            // Рендеримо тіло з підстановкою значень для зовнішніх ключів
            filteredData.forEach((rowData, rowIndex) => {
                const tr = document.createElement("tr");
                tr.style.backgroundColor = rowIndex % 2 === 0 ? "#ffffff" : "#a1c6e5";
                // Для FK-підстановки шукаємо оригінальний рядок за значенням ключа,
                // а не за індексом — це коректно працює і при фільтрі
                const originalRow = el.filterActive && Array.isArray(el.filteredRows)
                    ? rowData  // filteredRows вже містять повні дані у порядку allColumns
                    : tableObj.data[rowIndex];
                
                filteredSchema.forEach((col, colIndex) => {
                    const td = document.createElement("td");
                    td.style.borderRight  = "1px solid #999";
                    td.style.borderBottom = "1px solid #999";
                    td.style.borderTop    = "none";
                    td.style.borderLeft   = "1px solid #999";
                    td.style.padding = "4px 6px";
                    td.style.fontSize = "11px";
                    td.style.whiteSpace = "nowrap";
                    
                    // Отримуємо оригінальний індекс колонки в таблиці
                    const originalColIndex = tableObj.schema.findIndex(c => c.title === col.title);
                    let cellValue = rowData[colIndex];
                    
                    // Перевіряємо, чи це зовнішній ключ
                    const isForeignKey = col.foreignKey && col.refTable && col.refField;
                    
                    if (isForeignKey) {
                        // Шукаємо пов'язану таблицю
                        const refTable = database.tables.find(t => t.name === col.refTable);
                        if (refTable && refTable.data) {
                            // Знаходимо індекс поля, за яким зв'язуємо (зазвичай PK)
                            const refKeyIndex = refTable.schema.findIndex(f => f.title === col.refField);
                            // Знаходимо індекс поля для відображення (якщо є підстановка)
                            let displayIndex = refKeyIndex;
                            if (col.subst) {
                                const substIdx = refTable.schema.findIndex(f => f.title === col.title);
                                if (substIdx !== -1) displayIndex = substIdx;
                            }
                            
                            // Шукаємо рядок у пов'язаній таблиці
                            const refRow = refTable.data.find(r => String(r[refKeyIndex]) === String(cellValue));
                            if (refRow && displayIndex !== -1) {
                                cellValue = refRow[displayIndex];
                            } else if (cellValue === null || cellValue === undefined || cellValue === "") {
                                cellValue = "";
                            }
                        }
                    }
                    
                    // Обробка типів даних
                    const typeStr = String(col?.type || "").toLowerCase();
                    
                    // Зображення
                    if (typeStr === "image" || typeStr === "зображення") {
                        td.innerHTML = "";
                        td.style.textAlign = "center";
                        if (cellValue && typeof cellValue === "string" && looksLikeImageUrl(cellValue)) {
                            const img = document.createElement("img");
                            img.src = cellValue;
                            img.style.maxWidth = "60px";
                            img.style.maxHeight = "40px";
                            img.style.objectFit = "contain";
                            td.appendChild(img);
                        } else if (cellValue instanceof Uint8Array) {
                            const imgData = extractImage(cellValue);
                            if (imgData) {
                                const blob = new Blob([imgData.data], { type: imgData.type });
                                const url = URL.createObjectURL(blob);
                                const img = document.createElement("img");
                                img.src = url;
                                img.style.maxWidth = "60px";
                                img.style.maxHeight = "40px";
                                img.style.objectFit = "contain";
                                td.appendChild(img);
                            } else {
                                td.textContent = "📷";
                            }
                        } else if (cellValue) {
                            td.textContent = "📷";
                        } else {
                            td.textContent = "";
                        }
                    }
                    // Файли
                    else if (typeStr === "file" || typeStr === "файл") {
                        td.innerHTML = "";
                        td.style.textAlign = "center";
                        if (cellValue) {
                            const link = document.createElement("a");
                            link.textContent = "📎";
                            link.href = "#";
                            link.style.cursor = "pointer";
                            link.style.textDecoration = "none";
                            link.style.fontSize = "16px";
                            link.title = t("reportClickToOpen");
                            link.onclick = (e) => {
                                e.preventDefault();
                                if (typeof openFileFromData === "function") {
                                    openFileFromData(cellValue);
                                }
                            };
                            td.appendChild(link);
                        } else {
                            td.textContent = "";
                        }
                    }
                    // Логічний тип
                    else if (typeStr === "boolean" || typeStr === "так/ні") {
                        td.textContent = (cellValue == 1 || cellValue === true) ? "✓" : "✗";
                        td.style.textAlign = "center";
                    }
                    // Звичайний текст
                    else {
                        td.textContent = (cellValue !== null && cellValue !== undefined) ? String(cellValue) : "";
                    }
                    
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            });
            
            // Якщо даних немає
            if (filteredData.length === 0) {
                const tr = document.createElement("tr");
                const td = document.createElement("td");
                td.colSpan = filteredSchema.length;
                td.textContent = t("reportNoData");
                td.style.textAlign = "center";
                td.style.padding = "20px";
                td.style.color = "#999";
                tr.appendChild(td);
                tbody.appendChild(tr);
            }
            
            return;
        }

        // Рендеринг текстових полів та написів (існуючий код)
        const clone = document.createElement("div");
        Object.assign(clone.style, {
            position: "absolute",
            left: addPx(el.left),
            top: addPx(el.top),
            width: addPx(el.width),
            height: addPx(el.height),
            fontFamily: el.fontFamily,
            fontSize: el.fontSize,
            fontWeight: el.fontWeight,
            fontStyle: el.fontStyle,
            textDecoration: el.textDecoration,
            color: el.color,
            textAlign: el.textAlign || 'left',
            padding: "5px",
            boxSizing: "border-box",
            overflow: "auto",
            whiteSpace: "pre-line",
            border: "none",
            backgroundColor: "transparent"
        });

        if (el.type === "label") {
            clone.innerText = el.text;
        } else if (el.type === "field") {
            const tableName = el.tableName;
            const fieldName = el.fieldName;
            const table = findTableOrQuery(tableName);

            if (!table || table.data.length === 0) {
                clone.innerText = t("reportTableEmpty");
            } else {
                const colIndex = table.schema.findIndex(col => col.title === fieldName);
                if (colIndex === -1) {
                    clone.innerText = t("reportFieldNotFound");
                } else {
                    const colSchema = table.schema[colIndex];
                    // Обробка зовнішнього ключа для окремого поля
                    if (colSchema.foreignKey && colSchema.refTable && colSchema.refField) {
                        const refTable = findTableOrQuery(colSchema.refTable);
                        if (refTable && refTable.data.length > 0) {
                            const refKeyIndex = refTable.schema.findIndex(c => c.title === colSchema.refField);
                            let displayIndex = refKeyIndex;
                            if (colSchema.subst) {
                                const substIdx = refTable.schema.findIndex(c => c.title === fieldName);
                                if (substIdx !== -1) displayIndex = substIdx;
                            }
                            
                            const lines = table.data.map(row => {
                                const fkValue = row[colIndex];
                                const refRow = refTable.data.find(r => String(r[refKeyIndex]) === String(fkValue));
                                if (refRow && displayIndex !== -1) {
                                    return refRow[displayIndex];
                                }
                                return fkValue !== null && fkValue !== undefined ? String(fkValue) : " ";
                            });
                            clone.innerText = lines.join("\n");
                        } else {
                            clone.innerText = t("reportRefTableEmpty");
                        }
                    } 
                    else if (colSchema.type && String(colSchema.type).toLowerCase().includes("зображен")) {
                        if (table.data.length === 1) {
                            const url = table.data[0][colIndex];
                            clone.innerHTML = "";
                            if (url) {
                                const img = document.createElement("img");
                                img.src = url;
                                Object.assign(img.style, { width: "100%", height: "100%", objectFit: "contain", display: "block" });
                                clone.appendChild(img);
                            }
                        } else {
                            clone.innerText = table.data.map(row => row[colIndex] ?? " ").join("\n");
                        }
                    } 
                    else {
                        const values = table.data.map(row => row[colIndex] ?? " ");
                        if (table.data.length === 1 && looksLikeImageUrl(values[0])) {
                            clone.innerHTML = "";
                            const img = document.createElement("img");
                            img.src = values[0];
                            Object.assign(img.style, { width: "100%", height: "100%", objectFit: "contain", display: "block" });
                            clone.appendChild(img);
                        } else {
                            clone.innerText = values.join("\n");
                        }
                    }
                }
            }
        }
        previewCanvas.appendChild(clone);
    });

    previewModal.style.display = "flex";
}

function saveReport() {
    const reportName = document.getElementById("reportNameInput").value.trim();
    if (!reportName) {
        Message(t("reportNoName"));
        document.getElementById("reportNameInput").focus();
        return;
    }
    const reportCanvas = document.getElementById("reportCanvas");
    
    const elements = [...reportCanvas.querySelectorAll('.report-element')].map(el => {
        // 🆕 Збереження графічних фігур
        if (el.classList.contains("report-shape")) {
            return serializeShapeElement(el);
        }
        // 🆕 Збереження зображень
        if (el.classList.contains("report-image")) {
            return serializeImageElement(el);
        }
        // 🆕 Збереження таблиць
        if (el.classList.contains("report-table")) {
            return serializeTableElement(el);
        }
        // Текстові поля та написи
        return serializeTextElement(el, "report-label");
    });

    const reportObject = {
        name: reportName,
        canvasWidth: reportCanvas.offsetWidth,
        canvasHeight: reportCanvas.offsetHeight,
        elements
    };

    const index = database.reports.findIndex(r => r.name === reportName);
    if (index !== -1) database.reports[index] = reportObject;
    else database.reports.push(reportObject);

    saveDatabase();
    if (typeof isDesignerDirty !== "undefined") isDesignerDirty = false;
    Message(t("reportSaved", reportName));
}

/**
 * Закриття Конструктора звітів.
 * Якщо є незбережені зміни (прапор isDesignerDirty) — питає про збереження.
 **/
function closeReportModal() {
    if (typeof isDesignerDirty !== "undefined" && isDesignerDirty) {
        showConfirmSave(
            () => {
                saveReport();
                _doCloseReportModal();
            },
            () => {
                _doCloseReportModal();
            }
        );
    } else {
        _doCloseReportModal();
    }
}

function _doCloseReportModal() {
    document.getElementById("reportCreatorModal").style.display = "none";
    if (typeof isDesignerDirty !== "undefined") isDesignerDirty = false;
}

// Викликається кнопкою закриття Конструктора звітів у HTML
function closeReportCreatorModal() {
    closeReportModal();
}

function deleteActiveElement() {
        if (!activeElement) {
            Message(t("reportDeleteElement"));
            return;
        }
        document.getElementById("deleteElConfirmText").innerHTML = t("reportDeleteConfirm")
		document.getElementById("deleteElementModal").style.display = "flex";
}

function doDeleteEl() {
        activeElement.remove();
        activeElement = null;

        // Закрити додаткові панелі
        document.getElementById("fieldSelectionModal").style.display = "none";
        document.getElementById("deleteElementModal").style.display = "none";
        closeTextOptionsModal();
}		

function closeElDeleteModal() {
	document.getElementById("deleteElementModal").style.display = "none";
} 

// Перегляд створеного звіту
function printReportPreview() {
        const previewContent = document.getElementById("reportPreviewCanvas");
    
        if (!previewContent) {
            alert(t("reportNoPrint"));
            return;
        }
    
        // Створюємо нове вікно для друку
        const printWindow = window.open('', '_blank');
    
        // Формуємо вміст
        printWindow.document.write(`
            <html>
            <head>
                <title>${t("reportPrintTitle")}</title>
                <style>
                    body { margin: 0; font-family: Arial, sans-serif; }
                    #reportPreviewCanvas {
                        position: relative;
                        width: 100%;
                        height: auto;
                        border: none;
                    }
                    .report-label, .report-field {
                        position: absolute;
                        box-sizing: border-box;
                        border: 1px solid #ccc;
                        padding: 2px;
                    }
                    .field-text {
                        font-style: italic;
                    }
                    .report-table {
                        position: absolute;
                        box-sizing: border-box;
                        overflow: auto;
                    }
                    .report-table table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 11px;
                    }
                    .report-table th, .report-table td {
                        border: 1px solid #999;
                        padding: 4px 6px;
                        white-space: nowrap;
                    }
                    .report-table th {
                        background-color: #d0d0d0;
                    }
                </style>
            </head>
            <body>
                <div id="reportPreviewCanvas">
                    ${previewContent.innerHTML}
                </div>
                <script>
                    window.onload = function() {
                        window.print();
                        window.onafterprint = () => window.close();
                    };
                <\/script>
            </body>
            </html>
        `);
    
        printWindow.document.close();
    }
