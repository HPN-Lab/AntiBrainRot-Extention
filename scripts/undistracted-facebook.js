'use strict';
/* global chrome */

const STORAGE_KEY = 'inAppBlockingSettings';
const STYLE_ID = 'antidoom-fb-style';
const DEFAULT_FACEBOOK_SETTINGS = {
    hideStories: false,
    hideReels: true,
    hideMarketplace: false,
    blackWhiteMode: false,
};
let cachedSettings = { ...DEFAULT_FACEBOOK_SETTINGS };
let applyTimer = null;

function mergeFacebookSettings(storedSettings = {}) {
    return { ...DEFAULT_FACEBOOK_SETTINGS, ...(storedSettings.facebook || {}) };
}

function ensureStyleElement() {
    let styleEl = document.getElementById(STYLE_ID);
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = STYLE_ID;
        (document.head || document.documentElement).appendChild(styleEl);
    }
    return styleEl;
}

function applyCSS(css) {
    const styleEl = ensureStyleElement();
    if (styleEl.textContent !== css) {
        styleEl.textContent = css;
    }
}

function removeCSS() {
    const styleEl = document.getElementById(STYLE_ID);
    if (styleEl) {
        styleEl.remove();
    }
}

function getFacebookCSS(settings) {
    const css = [];

    if (settings.hideStories) {
        css.push(`
            [aria-label="Stories"],
            [aria-label="Verhalen"],
            [aria-label="Relacje"],
            div[data-pagelet="Stories"],
            a[href*="/stories/"] {
                display: none !important;
            }

            #screen-root:has([aria-label="Facebook logo"]) > div > div > :nth-child(6) {
                display: none !important;
            }
        `);
    }

    if (settings.hideReels) {
        css.push(`
            [href*="/reel/"],
            [href*="/watch/"],
            [href*="/videos/"],
            [data-type="video"],
            video,
            [role="tab"][aria-label*="reel" i],
            [data-is-reels="true"],
            div[data-pagelet*="Reels"],
            div[data-pagelet*="Video"] {
                display: none !important;
            }
        `);
    }

    if (settings.hideMarketplace) {
        css.push(`
            [href*="/marketplace/"],
            [aria-label*="marketplace" i],
            div[data-pagelet="CometMarketplaceHomeContentWithBannerContainer"] {
                display: none !important;
            }
        `);
    }

    if (settings.blackWhiteMode) {
        css.push(`
            html {
                filter: saturate(0) !important;
            }
        `);
    }

    return css.join('\n');
}

function applyFacebookSettings(settings) {
    cachedSettings = settings;
    const css = getFacebookCSS(settings);

    if (css.trim()) {
        applyCSS(css);
    } else {
        removeCSS();
    }
}

function loadAndApplySettings() {
    chrome.storage.sync.get([STORAGE_KEY], (data) => {
        const settings = mergeFacebookSettings(data[STORAGE_KEY]);
        applyFacebookSettings(settings);
    });
}

function scheduleApply() {
    if (applyTimer) {
        clearTimeout(applyTimer);
    }

    applyTimer = setTimeout(() => {
        applyFacebookSettings(cachedSettings);
    }, 120);
}

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes[STORAGE_KEY]) {
        loadAndApplySettings();
    }
});

chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'inapp-settings-updated' && message.platform === 'facebook') {
        loadAndApplySettings();
    }
});

const observer = new MutationObserver(() => {
    scheduleApply();
});

if (document.documentElement) {
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });
}

window.addEventListener('load', () => {
    loadAndApplySettings();
});

loadAndApplySettings();
