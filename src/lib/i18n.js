// ========== I18N ==========

const DEFAULT_LANG = 'uk';
let currentLang = DEFAULT_LANG;
let translations = {};
const _placeholderCache = {};

// Поточний HTML-словник (зберігаємо для MutationObserver)
let _htmlDict = {};

const LEADING_ICON_RE = /^\s*((?:\p{Extended_Pictographic}|[\u2600-\u27BF])(?:\uFE0F|\uFE0E)?(?:\u200D(?:\p{Extended_Pictographic}|[\u2600-\u27BF])(?:\uFE0F|\uFE0E)?)*)(?:\s+|$)/u;

function translatedText(el, text) {
    const sourceText = [...el.childNodes]
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.nodeValue)
        .join("");
    const sourceIcon = sourceText.match(LEADING_ICON_RE)?.[1];
    const translatedIcon = text.match(LEADING_ICON_RE);
    const icon = sourceIcon || translatedIcon?.[1];
    const label = translatedIcon ? text.slice(translatedIcon[0].length) : text;
    return icon ? `${icon} ${label.trimStart()}` : text;
}

function applyTextTranslation(el, text) {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = text;
        return;
    }
    if (/<[a-z][^>]*>/i.test(text) && !text.match(LEADING_ICON_RE)) {
        el.innerHTML = text;
        if (typeof setIconContent === 'function') {
            el.querySelectorAll('.ui-icon').forEach(uc => setIconContent(uc, uc.textContent.trim()));
        }
        return;
    }
    const existingIcon = (typeof getExistingIcon === 'function')
        ? getExistingIcon(el) : (el.querySelector(":scope > .ui-icon")?.textContent || "");
    const textNodes = [...el.childNodes].filter(node => node.nodeType === Node.TEXT_NODE);
    if (!textNodes.length) return;
    let value = translatedText(el, text);
    if (existingIcon && !value.match(LEADING_ICON_RE)) value = `${existingIcon} ${value}`;
    el.querySelectorAll(":scope > .ui-icon").forEach(node => node.remove());
    const icon = value.match(LEADING_ICON_RE);
    if (icon) {
        const iconEl = document.createElement("span");
        iconEl.className = "ui-icon";
        if (typeof setIconContent === 'function') setIconContent(iconEl, icon[1]);
        else iconEl.textContent = icon[1];
        textNodes[0].replaceWith(iconEl, document.createTextNode(` ${value.slice(icon[0].length)}`));
    } else {
        textNodes[0].nodeValue = value;
    }
    textNodes.slice(1).forEach(node => { node.nodeValue = ""; });
}

function wrapButtonIcon(button) {
    if (button.tagName !== "BUTTON") return;
    const firstChild = button.firstElementChild;
    if (firstChild?.tagName === "DIV" && !firstChild.querySelector(":scope > .ui-icon")) {
        const nestedText = [...firstChild.childNodes].find(node =>
            node.nodeType === Node.TEXT_NODE && node.nodeValue.match(LEADING_ICON_RE)
        );
        if (nestedText) {
            const match = nestedText.nodeValue.match(LEADING_ICON_RE);
            const icon = document.createElement("span");
            icon.className = "ui-icon";
            if (typeof setIconContent === 'function') setIconContent(icon, match[1]);
            else icon.textContent = match[1];
            nestedText.replaceWith(icon, document.createTextNode(nestedText.nodeValue.slice(match[0].length)));
        }
    }
    if (button.querySelector(":scope > .ui-icon")) return;
    const textNode = [...button.childNodes].find(node =>
        node.nodeType === Node.TEXT_NODE && node.nodeValue.match(LEADING_ICON_RE)
    );
    if (!textNode) return;
    const match = textNode.nodeValue.match(LEADING_ICON_RE);
    const icon = document.createElement("span");
    icon.className = "ui-icon";
    if (typeof setIconContent === 'function') setIconContent(icon, match[1]);
    else icon.textContent = match[1];
    textNode.replaceWith(icon, document.createTextNode(textNode.nodeValue.slice(match[0].length)));
}

// ★ Promise, який резолвиться після ПЕРШОГО успішного завантаження мови.
//   Використовуйте `await window.i18nReady` у core.js перед стартом застосунку.
let _i18nReadyResolve;
window.i18nReady = new Promise(resolve => { _i18nReadyResolve = resolve; });

function applyTranslationsToDOM(dict) {
    document.querySelectorAll('[lang-i18n]').forEach(el => {
        const key = el.getAttribute('lang-i18n');
        if (!dict[key]) return;

        const nonTextChildren = [...el.childNodes].filter(
            node => node.nodeType !== Node.TEXT_NODE
        );

        if (nonTextChildren.length > 0) {
            applyTextTranslation(el, dict[key]);
        } else {
            applyTextTranslation(el, dict[key]);
        }
    });

    document.querySelectorAll('[lang-i18n-title]').forEach(el => {
        const key = el.getAttribute('lang-i18n-title');
        if (dict[key]) el.title = dict[key];
    });

    document.querySelectorAll("button").forEach(wrapButtonIcon);
}

// ★ Перекладає один елемент (і його нащадків) за поточним _htmlDict
function _translateElement(el) {
    if (el.nodeType !== Node.ELEMENT_NODE) return;
    wrapButtonIcon(el);

    const key = el.getAttribute('lang-i18n');
    if (key && _htmlDict[key]) {
        const nonText = [...el.childNodes].filter(n => n.nodeType !== Node.TEXT_NODE);
        if (nonText.length > 0) {
            applyTextTranslation(el, _htmlDict[key]);
        } else {
            applyTextTranslation(el, _htmlDict[key]);
        }
    }

    const titleKey = el.getAttribute('lang-i18n-title');
    if (titleKey && _htmlDict[titleKey]) el.title = _htmlDict[titleKey];

    // Перекладаємо нащадків теж
    el.querySelectorAll('[lang-i18n]').forEach(child => {
        const k = child.getAttribute('lang-i18n');
        if (k && _htmlDict[k]) applyTextTranslation(child, _htmlDict[k]);
    });
    el.querySelectorAll('[lang-i18n-title]').forEach(child => {
        const k = child.getAttribute('lang-i18n-title');
        if (k && _htmlDict[k]) child.title = _htmlDict[k];
    });
}

// ★ Спостерігач: перекладає нові елементи щойно вони потрапляють у DOM
let _observer = null;

function _startObserver() {
    if (_observer) return; // вже запущений
    _observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                _translateElement(node);
            }
        }
    });
    _observer.observe(document.body, { childList: true, subtree: true });
}

async function loadLanguage(lang = DEFAULT_LANG) {
    try {
        const jsRes = await fetch(`locales/${lang}.json`);
        if (!jsRes.ok) throw new Error(`Cannot load locale: ${lang}.json`);
        translations = await jsRes.json();

        const htmlRes = await fetch(`locales/${lang}-html.json`);
        if (!htmlRes.ok) throw new Error(`Cannot load locale: ${lang}-html.json`);
        _htmlDict = await htmlRes.json();

        console.log(`applyTranslationsToDOM called for "${lang}", keys:`, Object.keys(_htmlDict).length);
        applyTranslationsToDOM(_htmlDict);

        document.documentElement.lang = lang;
        currentLang = lang;

        // Запускаємо спостерігач після першого завантаження мови
        _startObserver();

        // ★ Сигналізуємо, що i18n готовий (резолвимо лише один раз)
        if (_i18nReadyResolve) {
            _i18nReadyResolve();
            _i18nReadyResolve = null;
        }

        console.log(`i18n: мову встановлено — "${lang}"`);
    } catch (err) {
        console.error('i18n load error:', err);
        translations = {};
        // ★ Навіть при помилці резолвимо Promise, щоб застосунок не завис
        if (_i18nReadyResolve) {
            _i18nReadyResolve();
            _i18nReadyResolve = null;
        }
    }
}

function _extractPlaceholders(str) {
    if (_placeholderCache[str]) return _placeholderCache[str];
    const matches = str.match(/\$\{(\w+)\}/g) || [];
    return (_placeholderCache[str] = matches.map(m => m.slice(2, -1)));
}

function t(key, ...args) {
    const str = translations[key];
    if (!str) return key;
    if (Array.isArray(str)) return str;
    if (args.length === 0) return str;

    let params = {};
    if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
        params = args[0];
    } else {
        const names = _extractPlaceholders(str);
        names.forEach((name, i) => { params[name] = args[i]; });
    }

    return str.replace(/\$\{(\w+)\}/g, (_, name) =>
        params[name] !== undefined ? params[name] : ''
    );
}

async function setLang(lang) {
    // Зупиняємо старий спостерігач при зміні мови
    if (_observer) {
        _observer.disconnect();
        _observer = null;
    }
    await loadLanguage(lang);
    const storageKey = (typeof SETTINGS_KEYS !== 'undefined')
        ? SETTINGS_KEYS.LANGUAGE
        : 'app_settings_language';
    localStorage.setItem(storageKey, lang);
    updateMainTitle();
}
