'use strict';

const BLOCKLIST_STORAGE_KEY = 'blockedSites';
const DEFAULT_BLACKLIST = ['facebook.com', 'tiktok.com'];

function normalizeHostname(hostname = '') {
    return hostname.replace(/^www\./i, '').toLowerCase();
}

function isBlockedUrl(url, blockedSites) {
    try {
        const hostname = normalizeHostname(new URL(url).hostname);
        return blockedSites.some((domain) => {
            const normalizedDomain = normalizeHostname(domain);
            return hostname === normalizedDomain || hostname.endsWith(`.${normalizedDomain}`);
        });
    } catch (error) {
        console.error('[SW:CHECK_URL]', error);
        return false;
    }
}

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get([BLOCKLIST_STORAGE_KEY], (data) => {
        if (chrome.runtime.lastError) {
            console.error('[SW:INIT_BLOCKLIST]', chrome.runtime.lastError);
            return;
        }

        if (!Array.isArray(data[BLOCKLIST_STORAGE_KEY])) {
            chrome.storage.local.set({ [BLOCKLIST_STORAGE_KEY]: DEFAULT_BLACKLIST }, () => {
                if (chrome.runtime.lastError) {
                    console.error('[SW:SAVE_BLOCKLIST]', chrome.runtime.lastError);
                }
            });
        }
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'checkURL') {
        return false;
    }

    chrome.storage.local.get([BLOCKLIST_STORAGE_KEY], (data) => {
        if (chrome.runtime.lastError) {
            console.error('[SW:LOAD_BLOCKLIST]', chrome.runtime.lastError);
            sendResponse({ isBlocked: false });
            return;
        }

        const blockedSites = Array.isArray(data[BLOCKLIST_STORAGE_KEY]) ? data[BLOCKLIST_STORAGE_KEY] : DEFAULT_BLACKLIST;
        sendResponse({
            isBlocked: isBlockedUrl(message.url, blockedSites),
        });
    });

    return true;
});
