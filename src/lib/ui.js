// оновлення інформації
function updateMainTitle() {
        const titleBar = document.getElementById("mainTitle");
        if (database.fileName) {
            titleBar.textContent = t("uiDataBase") + database.fileName;
        } else {
            titleBar.textContent = t("uiSelectOrCreate");
        }
}

async function openHelpWindow() {
    await window.__TAURI__.core.invoke("open_help_window");
}

function showLoading(text) {
    const overlay = document.getElementById("loadingOverlay");
    const label = document.getElementById("loadingText");
    if (label && text) label.textContent = text;
    if (overlay) overlay.hidden = false;
}

function hideLoading() {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) overlay.hidden = true;
}

function setLoadingTitle(name) {
    const title = document.getElementById("mainTitle");
    if (title) title.textContent = `Завантаження "${name}"...`;
}

function yieldToUi() {
    return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
}
/**
* Функція closeEditModal()
* Призначення: Закриває вікно редагування таблиці, скидаючи вибрані значення.
**/
function closeEditModal() {
    const modal = document.getElementById("editModal");
    // Якщо активний повноекранний режим — спочатку скидаємо його стилі
    if (modal && modal.dataset.fullscreen === '1') {
        if (typeof _toggleEditTableFullscreen === 'function') {
            _toggleEditTableFullscreen(); // виходимо з fullscreen перед закриттям
        }
    }
    modal.style.display = "none"; // Ховаємо вікно
    currentEditTable = null; // Скидаємо редаговану таблицю
    selectedCell = null; // Скидаємо вибрану клітинку
}

/** 
* Функція closeDbModal()
* Призначення: Закриває модальне вікно створення бази даних.
**/
function closeDbModal() {
    document.getElementById("dbModal").style.display = "none";
}
/** 
* Функція closeModal()
* Призначення: Закриває модальне вікно створення таблиці.
**/
function closeModal() {
    document.getElementById("modal").style.display = "none";
}
let messageTimer = null;

function Message(msg, forever = false) {
    const modal = document.getElementById("messageModal");
    const content = document.getElementById("messageContent");

    content.innerText = msg;

    // очистити попередній таймер
    if (messageTimer) clearTimeout(messageTimer);

    // показати
    modal.classList.add("show");

    // сховати через 3 секунди, тільки якщо forever !== true
    if (!forever) {
        messageTimer = setTimeout(() => {
            modal.classList.remove("show");
        }, 3000);
    }
}

function closeMessage() {
    const modal = document.getElementById("messageModal");
    modal.classList.remove("show");
}

/** 
 * Приховує модальне вікно підтвердження видалення 
 **/
function closeDeleteModal() {
    document.getElementById("deleteModal").style.display = "none"; // Сховати
    dbToDelete = null; // Очистити значення
}
/** 
 * Приховує модальне вікно конструктора запиту
 **/
function closeQueryModal() {
    document.getElementById("queryModal").style.display = "none";
    toggleStructureButtonVisibility(false);
}

function closeSavedTablesDialog() {
        document.getElementById("savedTablesModal").style.display = "none";
        selectedTableNameForEdit = null;
}

function closeReportPreview() {
        document.getElementById("reportPreviewModal").style.display = "none";
}

function closeRelationModal() {
        document.getElementById("relationModal").style.display = "none";
        if (typeof onRelationModalClose === "function") {
            onRelationModalClose();
            onRelationModalClose = null; // очистити
        }
}

function closeFormModal() {
        document.getElementById("formCreatorModal").style.display = "none";
        // Ensure the field selection panel is hidden when closing the modal
        document.getElementById("fieldSelectionModal").style.display = "none";        
        // Ensure grid is off when closing report creator
        document.getElementById("formCanvas").classList.remove('grid-visible');
        isGridVisible = false;

}

// Закрити модальне вікно
function closeCsvImportDialog() {
    document.getElementById("csvImportModal").style.display = "none";
}

function closeDbInfoModal() {
        document.getElementById("dbInfoModal").style.display = "none";
}

function closeTextOptionsModal() {
        document.getElementById("textOptionsModal").style.display = "none";
}

function closeReportCreatorModal() {
    document.getElementById("reportCreatorModal").style.display = "none";
    document.getElementById("reportCanvas").classList.remove('grid-visible');
    isGridVisible = false;
}

function showAboutModal() {
        const modal = document.getElementById("aboutModal");
        modal.style.display = "flex";
}

function closeAboutModal() {
        const modal = document.getElementById("aboutModal");
        modal.style.display = "none";
}

function closeStorageDialog() {
        document.getElementById("storageModal").style.display = "none";
}

function closeFormPreview() {
    document.getElementById("formPreviewModal").style.display = "none";
    currentPreviewForm = null; 
}

// Закриває модальне вікно ручного введення SQL-запитів.
function closeOwnSqlModal() {
        document.getElementById("ownSqlModal").style.display = "none";
        toggleStructureButtonVisibility(false);
}

function openTableByName(name) {
     console.log("edit=",database.tables[name])
     selectedTableNameForEdit = name
     openSelectedTable()
     }
 //
 function editQueryByName(name) { 
    console.log("edit=",name);
    selectedQueryName = name;
    editSelectedQuery()
 }
 function editReportByName(name) { 
    console.log("edit=",name);
    selectedReportName = name;
    editSelectedReport()
 }
 function editFormByName(name) { 
    console.log("edit=",name);
    selectedFormName = name;
    editSelectedForm()
 }

// Панель швидкого доступу
function getCurrentTableNames() {
    return (database.tables || []).map(t => t.name);
}

function getCurrentQueryNames() {
    return (queries.definitions || []).map(q => q.name);
}

function getCurrentReportNames() {
    return (database.reports || []).map(r => r.name);
}

function getCurrentFormNames() {
    return (database.forms || []).map(f => f.name);
}


/**
 * Повторно відмальовує панель швидкого доступу з актуальним станом блокувань.
 * Викликається після збереження змін у lockSettings.
 */
function refreshQuickAccessPanel() {
    if (typeof database === "undefined" || !database.fileName) return;
    updateQuickAccessPanel(
        getCurrentTableNames(),
        getCurrentQueryNames(),
        getCurrentReportNames(),
        getCurrentFormNames()
    );
}

function updateQuickAccessPanel(tables, qqueries, reports, forms) {
    const panel = document.getElementById("quickAccessPanel");
    const sections = [
        {
            id: "quickTables",
            iconsId: "quickTablesIcons",
            items: tables,
            icon: "📄",
            image: "img/table-icon.png",
            openFunc: openTableByName
        },
        {
            id: "quickQueries",
            iconsId: "quickQueriesIcons",
            items: qqueries,
            icon: "🔍",
            image: "img/query-icon.png",
            openFunc: editQueryByName
        },
        {
            id: "quickReports",
            iconsId: "quickReportsIcons",
            items: reports,
            icon: "📝",
            image: "img/report-icon.png",
            openFunc: editReportByName
        },
        {
            id: "quickForms",
            iconsId: "quickFormsIcons",
            items: forms,
            icon: "📑",
            image: "img/form-icon.png",
            openFunc: editFormByName
        }
    ];

    let hasAny = false;

    sections.forEach(section => {
        const container = document.getElementById(section.id);
        const iconsContainer = document.getElementById(section.iconsId);
        iconsContainer.innerHTML = "";

        if (section.items && section.items.length) {
            container.style.display = "block";
            hasAny = true;
            section.items.forEach(name => {
                const el = document.createElement("div");
                el.className = "quick-icon";

                // Визначаємо тип для isLocked: прибираємо кінцеву 's' де потрібно
                const lockType = section.id === "quickQueries" ? "query"
                               : section.id === "quickTables"  ? "table"
                               : section.id === "quickReports" ? "report"
                               : "form";
                const locked = (typeof isLocked === "function") && isLocked(lockType, name);

                // Визначаємо функції для основного кліку та кліку по шестерні
                const getOpenFunc = () => {
                    if (section.id === "quickTables")  return () => { selectedTableNameForEdit = name; openSelectedTable(); };
                    if (section.id === "quickQueries") return () => { selectedQueryName = name; executeSelectedQuery(); };
                    if (section.id === "quickReports") return () => { selectedReportName = name; previewSelectedReport(); };
                    if (section.id === "quickForms")   return () => { selectedFormName = name; previewSelecteForm(); };
                    return null;
                };

                const getDesignerFunc = () => {
                    if (section.id === "quickTables")  return () => { selectedTableNameForEdit = name; editSelectedTableSchema(); };
                    if (section.id === "quickQueries") return () => { selectedQueryName = name; editSelectedQuery(); };
                    if (section.id === "quickReports") return () => { selectedReportName = name; editSelectedReport(); };
                    if (section.id === "quickForms")   return () => { selectedFormName = name; editSelectedForm(); };
                    return null;
                };

                const openFunc = getOpenFunc();

                const designerFunc = getDesignerFunc();
                const lockBadgeTitle = typeof t === 'function' ? (t('lockBadgeTitle') || 'Заблоковано') : 'Заблоковано';
                const gearTitle = typeof t === 'function' ? (t('gearBadgeTitle') || 'Редагувати структуру / конструктор') : 'Редагувати структуру / конструктор';

                el.innerHTML = `
                    <div class='icon' style="position:relative;display:inline-block;">
                        <img src="${section.image}" alt="icon" />
                        ${locked
                             ? `<span class="ui-icon lock-badge" title="${lockBadgeTitle}" style="position:absolute;top:-4px;right:-10px;font-size:13px;line-height:1;pointer-events:none;">🔒</span>`
                            : designerFunc
                                 ? `<span class="ui-icon gear-badge" title="${gearTitle}" style="position:absolute;top:-6px;right:-12px;font-size:14px;line-height:1;cursor:pointer;opacity:0.75;transition:opacity 0.15s,transform 0.2s;" data-gear="1">⚙️</span>`
                                : ''
                        }
                    </div>
                    <div>${name}</div>`;

                // Клік по основному значку — відкриває в режимі даних/перегляду/виконання
                el.onclick = (e) => {
                    // Якщо клік по шестерні — не виконуємо основну дію
                    if (e.target.dataset && e.target.dataset.gear) return;
                    if (openFunc) openFunc();
                };

                // Клік по шестерні — відкриває в режимі конструктора/структури
                if (!locked && designerFunc) {
                    const gearEl = el.querySelector('[data-gear]');
                    if (gearEl) {
                        gearEl.addEventListener("mouseenter", () => {
                            gearEl.style.opacity = "1";
                            gearEl.style.transform = "rotate(30deg) scale(1.2)";
                        });
                        gearEl.addEventListener("mouseleave", () => {
                            gearEl.style.opacity = "0.75";
                            gearEl.style.transform = "rotate(0deg) scale(1)";
                        });
                        gearEl.addEventListener("click", (e) => {
                            e.stopPropagation();
                            designerFunc();
                        });
                    }
                }

                iconsContainer.appendChild(el);
            });
        } else {
            container.style.display = "none";
        }
    });

    panel.style.display = hasAny ? "flex" : "none";
    document.getElementById("startPrompt").style.display = "none";
    document.getElementById("logo-image").style.display = "none";
    document.getElementById("title-image").style.display = "block";
}
    

function openMainMenu() {
      document.getElementById("mainMenuModal").style.display = "flex";
}

function closeMainMenu() {
      document.getElementById("mainMenuModal").style.display = "none";
}
    
function closeAllModals() {
      document.querySelectorAll(".modal").forEach(modal => {
        modal.style.display = "none";
      });
}
    
function filesMenu() {
      closeAllModals();
      document.getElementById("files_Modal").style.display = "flex";
}
    
function createMenu() {
      closeAllModals();
      document.getElementById("create_Modal").style.display = "flex";
}
    
 function dataMenu() {
      closeAllModals();
      document.getElementById("data_Modal").style.display = "flex";
      document.getElementById("data_Modal").style.display = "flex";
}
    
function tablesMenu() {
      closeAllModals();
      document.getElementById("tables_Modal").style.display = "flex";
}
    
function queriesMenu() {
      closeAllModals();
      document.getElementById("queries_Modal").style.display = "flex";
}
    
function reportsMenu() {
      closeAllModals();
      document.getElementById("reports_Modal").style.display = "flex";
 }
    
 function formsMenu() {
      closeAllModals();
      document.getElementById("forms_Modal").style.display = "flex";
}
    
function helpMenu() {
      closeAllModals();
      document.getElementById("help_Modal").style.display = "flex";
}
    
window.addEventListener("click", function(event) {
  // Перевіряємо, чи елемент має клас "modal"
  if (event.target.classList.contains("modal")) {

    // Якщо це ownSqlModal — не закриваємо
    if (event.target.id === "ownSqlModal") return; ""
    // Для editModal — використовуємо closeEditModal, щоб скинути fullscreen
    if (event.target.id === "editModal") { closeEditModal(); return; }
    // Для всіх інших модалей — закриваємо
    event.target.style.display = "none";
  }
});

function closeImportTableDialog() {
  document.getElementById("importTableModal").style.display = "none";
  document.getElementById("previewArea").innerHTML = "";
}

function closeImageModal() {
  document.getElementById("imageModal").style.display = "none";
  imageEditContext = null;
}
