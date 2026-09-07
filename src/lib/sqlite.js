// =============================================================================
// sqlite.js — адаптер між фронтендом (раніше SQL.js) та Rust-бекендом (rusqlite).
//
// Надає async-сумісний фасад `db` з методами exec/run/prepare/export,
// плюс зберігання БД у файли через Tauri-команди (open_db/sql_exec/...).
// // та файловими діалогами.
// =============================================================================
(() => {
  const invoke = window.__TAURI__.core.invoke;

  // --- Decode/encode blob через {__b: base64} ---
  function b64ToU8(b64) {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  function u8ToB64(u8) {
    let bin = "";
    for (let i = 0; i < u8.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }

  function fromRust(v) {
    if (v !== null && typeof v === "object" && !Array.isArray(v) && Object.prototype.hasOwnProperty.call(v, "__b")) {
      return b64ToU8(v.__b);
    }
    return v;
  }
  function toRust(v) {
    if (v instanceof Uint8Array) {
      return { __b: u8ToB64(v) };
    }
    return v;
  }

  function decodeRes(res) {
    if (res == null) return null;
    return {
      columns: res.columns,
      values: res.values.map(row => row.map(fromRust)),
    };
  }

  // --- Фасад `db` (async) ---
  const db = {
    async exec(sql, params) {
      if (typeof sql !== "string" || !sql.trim()) return [];
      const res = await invoke("sql_exec", { sql, params: (params || []).map(toRust) });
      return (res || []).map(decodeRes);
    },
    async run(sql, params) {
      await invoke("sql_run", { sql, params: (params || []).map(toRust) });
      return { changes: 0, lastInsertRowid: 0 };
    },
    // prepare → об'єкт, сумісний з SQL.js (step/getAsObject/free) — НЕ використовується
    // натомість використовується exec. Підтримка мінімальна.
    prepare(sql) {
      return {
        step: () => false,
        getAsObject: () => ({}),
        free: () => {},
      };
    },
    async export() {
      const b64 = await invoke("db_export");
      return b64ToU8(b64);
    },
    async close() { await invoke("close_db"); },
  };

  // --- API зберігання БД у файлі ---
  async function openDatabaseFile(name) {
    await invoke("open_db", { name });
  }
  async function importDatabaseFile(name, fileBytes) {
    const b64 = fileBytes instanceof Uint8Array ? u8ToB64(fileBytes) : fileBytes;
    return await invoke("db_import_bytes", { name, fileBytes: b64 });
  }
  async function getCurrentDbName() {
    return await invoke("current_db");
  }
  async function closeDatabaseFile() {
    await invoke("close_db");
  }

  // --- Робота з файлами та діалоги ---
  async function pickOpenFile(exts) {
    return await invoke("pick_open_file", { ext: exts || null });
  }
  async function pickSaveFile(defaultName, exts) {
    return await invoke("pick_save_file", { defaultName: defaultName || null, ext: exts || null });
  }
  async function readFileBytes(path) {
    const b64 = await invoke("read_file_bytes", { path });
    return b64ToU8(b64);
  }
  async function writeFileBytes(path, bytes) {
    const b64 = bytes instanceof Uint8Array ? u8ToB64(bytes) : bytes;
    await invoke("write_file_bytes", { path, fileBytes: b64 });
  }
  async function writeFileText(path, text) {
    await invoke("write_file_text", { path, text });
  }
  async function readFileText(path) {
    const b64 = await invoke("read_file_bytes", { path });
    return new TextDecoder().decode(b64ToU8(b64));
  }

  // Сирий read raw bytes без base64 (для db.export вже є)
  // --- Експорт / збереження за допомогою діалогу ---
  async function saveBytesViaDialog(bytes, defaultName, exts, mime) {
    const path = await pickSaveFile(defaultName, exts);
    if (!path) return null;
    await writeFileBytes(path, bytes);
    return path;
  }

  // --- localStorage-шиме (персистентність через файл в app data) ---
  const MEM = {};
  const SYNC_KEY = "__data_a_localstorage__";

  async function persistAll() {
    try {
      const text = JSON.stringify(MEM);
      await invoke("write_file_text", { path: await localStoragePath(), text });
    } catch (e) { console.warn("persist localStorage failed", e); }
  }
  async function localStoragePath() {
    // Шлях до файлу локального сховища всередині каталогу даних застосунку.
    // Спрощуємо: беремо з поточного рядка через current_db? У Tauri v2 немає
    // команди для app_data_dir прямо, тому використаємо файл у поточному каталозі
    // через хитру команду. Замість цього зберігаємо в окремому файлі біля БД.
    return await invoke("app_storage_path"); // див. lib.rs команду
  }

  async function initLocalStorageShim() {
    try {
      const text = await readFileText(await localStoragePath());
      const data = JSON.parse(text);
      Object.assign(MEM, data);
    } catch (e) {
      // Файлу немає — порожній стан
    }
    // Патчимо window.localStorage і window.sessionSTORAGE
    const dummy = () => { throw new Error("indexedDB недоступний у десктопному застосунку"); };
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: k => (k in MEM ? MEM[k] : null),
        setItem: (k, v) => { MEM[k] = String(v); persistAll(); },
        removeItem: k => { delete MEM[k]; persistAll(); },
        clear: () => { for (const k in MEM) delete MEM[k]; persistAll(); },
        key: i => Object.keys(MEM)[i] || null,
        get length() { return Object.keys(MEM).length; },
      },
    });
    // indexedDB — відсутній; всі виклики idb* треба замінити на Rust. Просто глушимо.
    Object.defineProperty(window, "indexedDB", { configurable: true, value: undefined });

    // Утиліта для зворотної сумісності (модуль io.js оновлено окремо)
    window.__sqliteAvailable = true;
  }

  window.dba = {
    db,
    openDatabaseFile,
    importDatabaseFile,
    getCurrentDbName,
    closeDatabaseFile,
    pickOpenFile,
    pickSaveFile,
    readFileBytes,
    writeFileBytes,
    writeFileText,
    readFileText,
    saveBytesViaDialog,
    b64ToU8,
    u8ToB64,
    initLocalStorageShim,
  };
})();
