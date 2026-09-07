// Functions for managing saved tables
    function showSavedTablesDialog() {
        const listEl = document.getElementById("savedTablesList");
        listEl.innerHTML = "";
        selectedTableNameForEdit = null; // Reset selection

        database.tables.forEach(table => {
            const li = document.createElement("li");
            li.style.padding = "8px";
            li.style.cursor = "pointer";
            li.dataset.tableName = table.name; // Store the table name in a data attribute

            // 🔒 Іконка блокування
            if (typeof isLocked === "function" && isLocked("table", table.name)) {
                li.title = typeof t === "function" ? t("lockLockedHint") : "Заблоковано";
                li.innerHTML = `<span style='margin-right:4px'>🔒</span>${table.name}`;
            } else {
                li.textContent = table.name;
            }

            li.addEventListener("click", () => {
                [...listEl.children].forEach(el => el.style.background = "");
                const isDark = document.body.classList.contains("dark-theme");
                li.style.background = isDark ? "#242d43" : "#d0e0ff";
                selectedTableNameForEdit = li.dataset.tableName;
            });
            listEl.appendChild(li);
        });
        document.getElementById("savedTablesModal").style.display = "flex";
    }

    function openSelectedTable() {
        if (!selectedTableNameForEdit) {
            Message(t("tableSelectForOpen"));
            return;
        }
        editData(selectedTableNameForEdit); // Use existing editData function
        closeSavedTablesDialog();
    }

    function confirmDeleteTable() {
        console.log("confirmDeleteTable");
        if (!selectedTableNameForEdit) {
            Message(t("tableSelectForDelete"));
            return;
        }
        // 🔒 Перевірка блокування
        if (typeof isLocked === "function" && isLocked("table", selectedTableNameForEdit)) {
            Message(typeof t === "function" ? t("lockObjectLocked", selectedTableNameForEdit) : `"${selectedTableNameForEdit}" заблоковано від видалення.`);
            return;
        }
        selectedTableNameForDelete = selectedTableNameForEdit; // Store for confirmation
        document.getElementById("deleteTableConfirmText").innerHTML =
            t("confirmDeleteTable", selectedTableNameForDelete);
        console.log("CF:", document.getElementById("deleteTableConfirmText").innerHTML);
        document.getElementById("deleteTableConfirmModal").style.display = "flex";
    }

    async function doDeleteTable() {
        if (selectedTableNameForDelete) {
            try {
                await dba.db.run(`DROP TABLE IF EXISTS "${selectedTableNameForDelete}"`);
                database.tables = database.tables.filter(t => t.name !== selectedTableNameForDelete);
                saveDatabase();

                const dataMenu = document.getElementById("data-menu");
                const menuItemToRemove = Array.from(dataMenu.children).find(item => item.textContent === selectedTableNameForDelete);
                if (menuItemToRemove) {
                    menuItemToRemove.remove();
                }

                Message(t("tableDeleted", selectedTableNameForDelete));
                closeDeleteTableConfirmModal();
                showSavedTablesDialog();
            } catch (e) {
                Message(t("tableDeleteError", e.message));
            }
        }
    }

    function closeDeleteTableConfirmModal() {
        document.getElementById("deleteTableConfirmModal").style.display = "none";
        selectedTableNameForDelete = null;
    }
