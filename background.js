'use strict';

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.get(['inAppBlockingSettings'], (data) => {
        if (!data.inAppBlockingSettings) {
            chrome.storage.sync.set({
                inAppBlockingSettings: {
                    /** Dashboard + content script merge defaults for missing keys. */
                    youtube: {},
                    facebook: {},
                },
            });
        }
    });
});
