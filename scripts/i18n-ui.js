'use strict';

/**
 * Chuỗi UI: ưu tiên theo Cài đặt → dashboardSettings.language (đồng bộ với ô "Ngôn ngữ"),
 * bằng cách tải _locales/<en_US|vi>/messages.json. Nếu chưa tải xong thì fallback chrome.i18n.
 *
 * DOM: data-i18n, data-i18n-placeholder, data-i18n-aria-label, data-i18n-title, option[data-i18n]
 * Tiêu đề: <meta name="extension-i18n-title" content="page_title_dashboard">
 */
(function initExtensionI18nUi() {
    const SETTINGS_STORAGE_KEY = 'dashboardSettings';

    /** @type {Record<string, string>|null} */
    let messagesFlat = null;

    function getLocalStorage(keys) {
        return new Promise((resolve, reject) => {
            try {
                chrome.storage.local.get(keys, (data) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                        return;
                    }

                    resolve(data);
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    function getSyncStorage(keys) {
        return new Promise((resolve, reject) => {
            try {
                chrome.storage.sync.get(keys, (data) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                        return;
                    }

                    resolve(data);
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    async function readDashboardLanguageRaw() {
        try {
            const [localData, syncData] = await Promise.all([
                getLocalStorage([SETTINGS_STORAGE_KEY]),
                getSyncStorage([SETTINGS_STORAGE_KEY]),
            ]);
            const localSettings = localData?.[SETTINGS_STORAGE_KEY];
            const syncSettings = syncData?.[SETTINGS_STORAGE_KEY];
            const merged = localSettings?.disableSync ? localSettings : (syncSettings || localSettings || {});
            return merged?.language || 'en-US';
        } catch {
            return 'en-US';
        }
    }

    function localeFolderFromLanguageSetting(lang) {
        const s = String(lang || '').toLowerCase();
        if (s === 'vi' || s.startsWith('vi-')) {
            return 'vi';
        }

        return 'en_US';
    }

    async function fetchAndFlatten(folder) {
        const url = chrome.runtime.getURL(`_locales/${folder}/messages.json`);
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`[i18n] ${url} ${res.status}`);
        }

        const json = await res.json();
        const flat = {};
        Object.keys(json).forEach((k) => {
            const entry = json[k];
            if (entry && typeof entry.message === 'string') {
                flat[k] = entry.message;
            }
        });
        return flat;
    }

    async function reload() {
        const raw = await readDashboardLanguageRaw();
        const folder = localeFolderFromLanguageSetting(raw);
        messagesFlat = await fetchAndFlatten(folder);
        return messagesFlat;
    }

    function getMessage(key) {
        if (!key) {
            return '';
        }

        if (messagesFlat && messagesFlat[key]) {
            return messagesFlat[key];
        }

        if (typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getMessage === 'function') {
            try {
                const s = chrome.i18n.getMessage(key);
                if (s) {
                    return s;
                }
            } catch {
                /* ignore */
            }
        }

        return '';
    }

    function applyToRoot(root) {
        if (!root || typeof root.querySelectorAll !== 'function') {
            return;
        }

        root.querySelectorAll('[data-i18n]').forEach((el) => {
            const k = el.getAttribute('data-i18n');
            const text = getMessage(k);
            if (text) {
                el.textContent = text;
            }
        });

        root.querySelectorAll('[data-i18n-html]').forEach((el) => {
            const k = el.getAttribute('data-i18n-html');
            const html = getMessage(k);
            if (html) {
                el.innerHTML = html;
            }
        });

        root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
            const k = el.getAttribute('data-i18n-placeholder');
            const text = getMessage(k);
            if (text && 'placeholder' in el) {
                el.placeholder = text;
            }
        });

        root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
            const k = el.getAttribute('data-i18n-aria-label');
            const text = getMessage(k);
            if (text) {
                el.setAttribute('aria-label', text);
            }
        });

        root.querySelectorAll('[data-i18n-title]').forEach((el) => {
            const k = el.getAttribute('data-i18n-title');
            const text = getMessage(k);
            if (text) {
                el.setAttribute('title', text);
            }
        });

        root.querySelectorAll('option[data-i18n]').forEach((opt) => {
            const k = opt.getAttribute('data-i18n');
            const text = getMessage(k);
            if (text) {
                opt.textContent = text;
            }
        });
    }

    function applyDocumentTitle() {
        const meta = document.querySelector('meta[name="extension-i18n-title"]');
        if (!meta) {
            return;
        }

        const key = meta.getAttribute('content');
        if (!key) {
            return;
        }

        const text = getMessage(key);
        if (text) {
            document.title = text;
        }
    }

    function applyTemplates() {
        document.querySelectorAll('template').forEach((tpl) => {
            if (tpl.content) {
                applyToRoot(tpl.content);
            }
        });
    }

    function apply(root) {
        applyToRoot(root || document);
        applyTemplates();
        applyDocumentTitle();
    }

    const ready = reload().catch((err) => {
        console.error('[ExtensionI18n:reload]', err);
        messagesFlat = {};
        return messagesFlat;
    });

    globalThis.ExtensionI18n = {
        getMessage,
        apply,
        reload,
        ready,
    };
})();
