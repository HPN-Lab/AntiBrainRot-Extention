'use strict';

const tabs = Array.from(document.querySelectorAll('.dashboard-tab'));
const panels = Array.from(document.querySelectorAll('.dashboard-panel'));
const inAppViews = Array.from(document.querySelectorAll('[data-inapp-view]'));
const inAppTargets = Array.from(document.querySelectorAll('[data-inapp-target]'));
const inAppBackButtons = Array.from(document.querySelectorAll('[data-inapp-back]'));
const switches = Array.from(document.querySelectorAll('[data-switch]'));
const openingTimerToggle = document.querySelector('input[name="openingTimerEnabled"][data-app="youtube"]');
const openingTimerToggleShell = openingTimerToggle?.closest('.theme-switch') || null;
const openingTimerInput = document.getElementById('yt-opening-timer-input');
const openingTimerUnit = document.getElementById('yt-opening-timer-unit');
const STORAGE_KEY = 'inAppBlockingSettings';
const PANEL_NAMES = new Set(['block', 'custom', 'inapp', 'settings', 'help']);
const INAPP_VIEW_NAMES = new Set(['list', 'youtube', 'facebook']);
const DEFAULT_ROUTE = {
    panel: 'block',
    view: 'list',
};
const DEFAULT_SETTINGS = {
    youtube: {
        hideHomePage: false,
        hideShorts: false,
        hideComments: false,
        hideRecommendedVideos: false,
        hideThumbnails: false,
        blurThumbnails: false,
        hideSubscriptions: false,
        hideExplore: false,
        hideTopBar: false,
        disableEndCards: false,
        blackWhiteMode: false,
        disableAutoplay: false,
        enableTheaterMode: false,
        autoSkipVideoAds: false,
        openingTimerEnabled: false,
        openingTimerValue: 0,
        openingTimerUnit: 'seconds',
    },
    facebook: {
        hideStories: false,
        hideReels: true,
        hideMarketplace: false,
        blackWhiteMode: false,
    },
};
let currentSettings = mergeSettings();

function mergeSettings(storedSettings = {}) {
    return {
        youtube: { ...DEFAULT_SETTINGS.youtube, ...(storedSettings.youtube || {}) },
        facebook: { ...DEFAULT_SETTINGS.facebook, ...(storedSettings.facebook || {}) },
    };
}

function setSwitchVisualState(switchButton, isOn) {
    switchButton.classList.toggle('is-on', isOn);
    switchButton.setAttribute('aria-pressed', String(isOn));
}

function applyStoredSettings(settings) {
    currentSettings = mergeSettings(settings);

    switches.forEach((switchButton) => {
        const { platform, setting } = switchButton.dataset;
        const isOn = Boolean(currentSettings?.[platform]?.[setting]);
        setSwitchVisualState(switchButton, isOn);
    });

    syncOpeningTimerUI(currentSettings);
}

function saveSettings(settings = currentSettings) {
    try {
        chrome.storage.sync.set({ [STORAGE_KEY]: settings });
    } catch (error) {
        console.error('[DASHBOARD:SAVE_SETTINGS]', error);
    }
}

function notifyTabs(platform) {
    try {
        const urlPatterns = platform === 'youtube'
            ? ['*://youtube.com/*', '*://*.youtube.com/*']
            : ['*://facebook.com/*', '*://*.facebook.com/*'];

        chrome.tabs.query({ url: urlPatterns }, (tabsInBrowser) => {
            if (chrome.runtime.lastError) {
                console.error('[DASHBOARD:QUERY_TABS]', chrome.runtime.lastError);
                return;
            }

            tabsInBrowser.forEach((tab) => {
                if (!tab.id) {
                    return;
                }

                chrome.tabs.sendMessage(tab.id, { type: 'inapp-settings-updated', platform }, () => {
                    void chrome.runtime.lastError;
                });
            });
        });
    } catch (error) {
        console.error('[DASHBOARD:NOTIFY_TABS]', error);
    }
}

function loadSettings() {
    try {
        chrome.storage.sync.get([STORAGE_KEY], (data) => {
            if (chrome.runtime.lastError) {
                console.error('[DASHBOARD:LOAD_SETTINGS]', chrome.runtime.lastError);
                return;
            }

            applyStoredSettings(data[STORAGE_KEY]);
        });
    } catch (error) {
        console.error('[DASHBOARD:LOAD_SETTINGS]', error);
    }
}

function syncOpeningTimerUI(settings = currentSettings) {
    if (!openingTimerToggle || !openingTimerInput || !openingTimerUnit || !openingTimerToggleShell) {
        return;
    }

    const youtubeSettings = settings.youtube || DEFAULT_SETTINGS.youtube;
    const isEnabled = Boolean(youtubeSettings.openingTimerEnabled);

    openingTimerToggle.checked = isEnabled;
    openingTimerInput.disabled = !isEnabled;
    openingTimerUnit.disabled = !isEnabled;
    openingTimerInput.value = String(Math.max(0, Number(youtubeSettings.openingTimerValue) || 0));
    openingTimerUnit.value = youtubeSettings.openingTimerUnit === 'minutes' ? 'minutes' : 'seconds';
    openingTimerToggleShell.classList.toggle('is-on', isEnabled);
}

function initOpeningTimerUI() {
    if (!openingTimerToggle || !openingTimerInput || !openingTimerUnit || !openingTimerToggleShell) {
        return;
    }

    const applyToggleState = (isActive) => {
        openingTimerToggle.checked = isActive;
        openingTimerInput.disabled = !isActive;
        openingTimerUnit.disabled = !isActive;
        openingTimerToggleShell.classList.toggle('is-on', isActive);
    };

    openingTimerToggle.addEventListener('change', () => {
        const isActive = openingTimerToggle.checked;
        applyToggleState(isActive);
        currentSettings.youtube.openingTimerEnabled = isActive;
        saveSettings(currentSettings);
        notifyTabs('youtube');
    });

    openingTimerInput.addEventListener('input', (e) => {
        if (Number(e.target.value) < 0) {
            e.target.value = '0';
        }

        currentSettings.youtube.openingTimerValue = Math.max(0, Number(e.target.value) || 0);
        saveSettings(currentSettings);
    });

    openingTimerUnit.addEventListener('change', () => {
        currentSettings.youtube.openingTimerUnit = openingTimerUnit.value === 'minutes' ? 'minutes' : 'seconds';
        saveSettings(currentSettings);
    });

    applyToggleState(openingTimerToggle.checked);
}

function activateTabUI(tabName) {
    tabs.forEach((tab) => {
        const isActive = tab.dataset.tab === tabName;
        tab.classList.toggle('theme-tab-active', isActive);
        tab.classList.toggle('theme-tab-inactive', !isActive);
        tab.setAttribute('aria-selected', String(isActive));
    });

    panels.forEach((panel) => {
        const isActive = panel.dataset.panel === tabName;
        panel.classList.toggle('hidden', !isActive);
        panel.classList.toggle('block', isActive);
    });
}

function activateInAppView(viewName) {
    inAppViews.forEach((view) => {
        const isActive = view.dataset.inappView === viewName;
        view.classList.toggle('hidden', !isActive);
        view.classList.toggle('block', isActive);
    });
}

function parseHashRoute(hashValue = location.hash) {
    const cleanedHash = hashValue.replace(/^#\/?/, '');
    const segments = cleanedHash.split('/').filter(Boolean);
    const panel = segments[0] || DEFAULT_ROUTE.panel;

    if (!PANEL_NAMES.has(panel)) {
        return { ...DEFAULT_ROUTE };
    }

    if (panel !== 'inapp') {
        return {
            panel,
            view: 'list',
        };
    }

    const view = segments[1] || 'list';
    return {
        panel: 'inapp',
        view: INAPP_VIEW_NAMES.has(view) ? view : 'list',
    };
}

function buildHashRoute(panel, view = 'list') {
    if (panel === 'inapp' && view !== 'list') {
        return `#/inapp/${view}`;
    }

    return `#/${panel}`;
}

function renderRoute(route) {
    activateTabUI(route.panel);
    activateInAppView(route.panel === 'inapp' ? route.view : 'list');
}

function navigateToRoute(panel, view = 'list') {
    const nextHash = buildHashRoute(panel, view);

    if (location.hash === nextHash) {
        renderRoute(parseHashRoute(nextHash));
        return;
    }

    location.hash = nextHash;
}

tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
        navigateToRoute(tab.dataset.tab || DEFAULT_ROUTE.panel);
    });
});

inAppTargets.forEach((target) => {
    target.addEventListener('click', () => {
        navigateToRoute('inapp', target.dataset.inappTarget || 'list');
    });
});

inAppBackButtons.forEach((button) => {
    button.addEventListener('click', () => {
        navigateToRoute('inapp', 'list');
    });
});

switches.forEach((switchButton) => {
    switchButton.addEventListener('click', () => {
        const { platform, setting } = switchButton.dataset;

        try {
            chrome.storage.sync.get([STORAGE_KEY], (data) => {
                if (chrome.runtime.lastError) {
                    console.error('[DASHBOARD:GET_TOGGLE_STATE]', chrome.runtime.lastError);
                    return;
                }

                const settings = mergeSettings(data[STORAGE_KEY]);
                const nextValue = !settings?.[platform]?.[setting];
                settings[platform][setting] = nextValue;
                setSwitchVisualState(switchButton, nextValue);
                saveSettings(settings);
                notifyTabs(platform);
            });
        } catch (error) {
            console.error('[DASHBOARD:TOGGLE_SWITCH]', error);
        }
    });
});

window.addEventListener('hashchange', () => {
    renderRoute(parseHashRoute());
});

if (!location.hash) {
    history.replaceState(null, '', buildHashRoute(DEFAULT_ROUTE.panel));
}

renderRoute(parseHashRoute());
initOpeningTimerUI();
loadSettings();
