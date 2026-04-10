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
    if (message?.type === 'sf-debug-ingest') {
        const url = message.endpoint;
        const body = message.body;
        if (typeof url === 'string' && body && typeof body === 'object') {
            const headers = { 'Content-Type': 'application/json' };
            const sid = body.sessionId;
            if (sid !== undefined && sid !== null && sid !== '') {
                headers['X-Debug-Session-Id'] = String(sid);
            }
            fetch(url, { method: 'POST', headers, body: JSON.stringify(body) }).catch(() => {});
        }
        return false;
    }

    if (message?.type !== 'checkURL') {
        return false;
    }

    // Keep the block UI assets in place, but disable runtime website blocking for now.
    sendResponse({ isBlocked: false });

    return false;
});
