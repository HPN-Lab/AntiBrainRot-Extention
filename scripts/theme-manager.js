'use strict';

(function initExtensionThemeManager() {
    const SETTINGS_STORAGE_KEY = 'dashboardSettings';
    const DEFAULT_THEME = 'auto';
    const colorSchemeMedia = typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;

    let currentThemePreference = DEFAULT_THEME;

    function resolveThemePreference(storedSettings = {}) {
        const nextTheme = storedSettings?.theme;
        if (nextTheme === 'light' || nextTheme === 'dark' || nextTheme === 'auto') {
            return nextTheme;
        }

        return DEFAULT_THEME;
    }

    function resolveStoredSettings(syncData = {}, localData = {}) {
        const localSettings = localData?.[SETTINGS_STORAGE_KEY];
        const syncSettings = syncData?.[SETTINGS_STORAGE_KEY];
        return localSettings?.disableSync ? (localSettings || {}) : (syncSettings || localSettings || {});
    }

    function resolveRenderedTheme(preference = DEFAULT_THEME) {
        if (preference === 'light' || preference === 'dark') {
            return preference;
        }

        return colorSchemeMedia?.matches ? 'dark' : 'light';
    }

    function updateThemedAssets(resolvedTheme) {
        document.querySelectorAll('[data-theme-logo-light]').forEach((element) => {
            const lightSrc = element.getAttribute('data-theme-logo-light');
            const darkSrc = element.getAttribute('data-theme-logo-dark') || lightSrc;
            const nextSrc = resolvedTheme === 'dark' ? darkSrc : lightSrc;

            if (nextSrc && element.getAttribute('src') !== nextSrc) {
                element.setAttribute('src', nextSrc);
            }
        });
    }

    function applyTheme(preference = DEFAULT_THEME) {
        currentThemePreference = resolveThemePreference({ theme: preference });
        const resolvedTheme = resolveRenderedTheme(currentThemePreference);
        const root = document.documentElement;

        root.dataset.themePreference = currentThemePreference;
        root.dataset.theme = resolvedTheme;
        root.style.colorScheme = resolvedTheme;

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => updateThemedAssets(resolvedTheme), { once: true });
        } else {
            updateThemedAssets(resolvedTheme);
        }
    }

    function loadStoredTheme() {
        applyTheme(DEFAULT_THEME);

        if (!globalThis.chrome?.storage) {
            return;
        }

        try {
            chrome.storage.local.get([SETTINGS_STORAGE_KEY], (localData) => {
                chrome.storage.sync.get([SETTINGS_STORAGE_KEY], (syncData) => {
                    const settings = resolveStoredSettings(syncData, localData);
                    applyTheme(resolveThemePreference(settings));
                });
            });
        } catch (error) {
            console.error('[THEME:LOAD]', error);
        }
    }

    if (colorSchemeMedia) {
        const handleSystemThemeChange = () => {
            if (currentThemePreference === 'auto') {
                applyTheme('auto');
            }
        };

        if (typeof colorSchemeMedia.addEventListener === 'function') {
            colorSchemeMedia.addEventListener('change', handleSystemThemeChange);
        } else if (typeof colorSchemeMedia.addListener === 'function') {
            colorSchemeMedia.addListener(handleSystemThemeChange);
        }
    }

    if (globalThis.chrome?.storage?.onChanged) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'sync' && areaName !== 'local') {
                return;
            }

            if (changes[SETTINGS_STORAGE_KEY]) {
                loadStoredTheme();
            }
        });
    }

    loadStoredTheme();
})();
