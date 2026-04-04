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
const SETTINGS_STORAGE_KEY = 'dashboardSettings';
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
const DEFAULT_DASHBOARD_SETTINGS = {
    hideSwitch: false,
    theme: 'auto',
    language: 'en-US',
    floatingTimerEnable: false,
    disableSync: false,
    trackTabsPlayingAudio: false,
    neverShowUpdateNotices: false,
    hideAllowLinks: false,
    redirectMessage: '',
    notifications: [],
    optOutDataCollection: false,
    isChallengeActive: false,
};
const tracker = window.tracker || {
    track(eventName) {
        console.log('[TRACK]', eventName);
    },
};

const settingsContainer = document.getElementById('settings-container');
const settingsLockBadge = document.getElementById('settings-lock-badge');
const settingsActivateSwitch = document.getElementById('settings-activate-switch');
const settingsActivateSwitchShell = document.getElementById('settings-activate-switch-shell');
const settingsTheme = document.getElementById('settings-theme');
const settingsLanguage = document.getElementById('settings-language');
const settingsFloatingTimer = document.getElementById('settings-floating-timer');
const settingsDisableSync = document.getElementById('settings-disable-sync');
const settingsTrackAudio = document.getElementById('settings-track-audio');
const settingsNeverShowUpdates = document.getElementById('settings-never-show-updates');
const settingsHideAllowLinks = document.getElementById('settings-hide-allow-links');
const settingsRedirectMessage = document.getElementById('settings-redirect-message');
const settingsNotificationsList = document.getElementById('settings-notifications-list');
const settingsNotificationValue = document.getElementById('settings-notification-value');
const settingsNotificationUnit = document.getElementById('settings-notification-unit');
const settingsAddNotification = document.getElementById('settings-add-notification');
const settingsOptOutData = document.getElementById('settings-opt-out-data');
let dashboardGlobalActiveToggleShell = document.getElementById('dashboard-active-toggle-shell');
let dashboardGlobalActiveToggle = document.getElementById('dashboard-global-active-toggle');
let dashboardGlobalActiveToggleLabel = document.getElementById('dashboard-global-active-toggle-label');
const dashboardActiveToggleHost = dashboardGlobalActiveToggleShell?.parentElement || null;
const dashboardActiveToggleMarkup = dashboardGlobalActiveToggleShell?.outerHTML || '';
let dashboardActiveTogglePlaceholder = document.createComment('dashboard-active-toggle-shell');

let currentSettings = mergeSettings();
let currentDashboardSettings = mergeDashboardSettings();
let isExtensionGloballyActive = true;
let isHideSwitchLocked = false;

function mergeDashboardSettings(storedSettings = {}) {
    return {
        ...DEFAULT_DASHBOARD_SETTINGS,
        ...(storedSettings || {}),
        notifications: Array.isArray(storedSettings?.notifications)
            ? storedSettings.notifications
                .map((value) => Math.max(0, Number(value) || 0))
                .filter((value) => value > 0)
            : [...DEFAULT_DASHBOARD_SETTINGS.notifications],
    };
}

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

function updateGlobalActiveToggleVisual(isActive) {
    if (dashboardGlobalActiveToggle) {
        dashboardGlobalActiveToggle.classList.toggle('is-on', isActive);
        dashboardGlobalActiveToggle.setAttribute('aria-pressed', String(isActive));
    }

    if (dashboardGlobalActiveToggleLabel) {
        dashboardGlobalActiveToggleLabel.textContent = isActive ? 'Active' : 'Off';
    }
}

function hydrateDashboardToggleRefs() {
    dashboardGlobalActiveToggleShell = document.getElementById('dashboard-active-toggle-shell');
    dashboardGlobalActiveToggle = document.getElementById('dashboard-global-active-toggle');
    dashboardGlobalActiveToggleLabel = document.getElementById('dashboard-global-active-toggle-label');
}

function bindDashboardGlobalActiveToggle() {
    if (!dashboardGlobalActiveToggle || dashboardGlobalActiveToggle.dataset.bound === 'true') {
        return;
    }

    dashboardGlobalActiveToggle.dataset.bound = 'true';
    dashboardGlobalActiveToggle.addEventListener('click', async () => {
        const nextValue = dashboardGlobalActiveToggle.getAttribute('aria-pressed') !== 'true';
        await setExtensionActiveState(nextValue);
    });
}

function renderDashboardGlobalActiveToggleVisibility(shouldHide) {
    if (shouldHide) {
        if (dashboardGlobalActiveToggleShell?.parentNode) {
            dashboardGlobalActiveToggleShell.replaceWith(dashboardActiveTogglePlaceholder);
        }
        hydrateDashboardToggleRefs();
        return;
    }

    if (!dashboardGlobalActiveToggleShell && dashboardActiveToggleHost && dashboardActiveToggleMarkup) {
        const template = document.createElement('template');
        template.innerHTML = dashboardActiveToggleMarkup.trim();
        const nextShell = template.content.firstElementChild;
        if (nextShell) {
            if (dashboardActiveTogglePlaceholder.parentNode) {
                dashboardActiveTogglePlaceholder.replaceWith(nextShell);
            } else {
                dashboardActiveToggleHost.appendChild(nextShell);
            }
        }
    }

    hydrateDashboardToggleRefs();
    bindDashboardGlobalActiveToggle();
    updateGlobalActiveToggleVisual(isExtensionGloballyActive);
}

function hasAnyExhaustedSiteTimer(storageData = {}) {
    const siteTimers = storageData?.siteTimers && typeof storageData.siteTimers === 'object'
        ? storageData.siteTimers
        : {};

    return Object.values(siteTimers).some((timer) => {
        const remainingSeconds = Math.max(0, Number(timer?.remainingSeconds) || 0);
        return Boolean(timer?.isBlocked) || remainingSeconds < 1;
    });
}

async function refreshHideSwitchLockState() {
    try {
        const syncData = await getSyncStorageData(['siteTimers']);
        isHideSwitchLocked = Boolean(currentDashboardSettings.hideSwitch) && hasAnyExhaustedSiteTimer(syncData);
    } catch (error) {
        console.error('[DASHBOARD:HIDE_SWITCH_LOCK]', error);
        isHideSwitchLocked = false;
    }

    renderHideSwitchLockState();
}

function renderHideSwitchLockState() {
    if (!settingsActivateSwitch) {
        return;
    }

    const shouldLock = isHideSwitchLocked;
    settingsActivateSwitch.disabled = shouldLock;

    if (settingsActivateSwitchShell) {
        settingsActivateSwitchShell.classList.toggle('opacity-50', shouldLock);
        settingsActivateSwitchShell.classList.toggle('pointer-events-none', shouldLock);
        settingsActivateSwitchShell.title = shouldLock
            ? 'Bạn không thể bật lại công tắc khi đã có website hết thời gian.'
            : '';
    }

    settingsActivateSwitch.title = shouldLock
        ? 'Bạn không thể bật lại công tắc khi đã có website hết thời gian.'
        : '';
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

function getLocalStorageData(keys) {
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

function getSyncStorageData(keys) {
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

function setLocalStorageData(payload) {
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.local.set(payload, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                    return;
                }

                resolve();
            });
        } catch (error) {
            reject(error);
        }
    });
}

function setSyncStorageData(payload) {
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.sync.set(payload, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                    return;
                }

                resolve();
            });
        } catch (error) {
            reject(error);
        }
    });
}

function removeLocalStorageData(keys) {
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.local.remove(keys, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                    return;
                }

                resolve();
            });
        } catch (error) {
            reject(error);
        }
    });
}

function removeSyncStorageData(keys) {
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.sync.remove(keys, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                    return;
                }

                resolve();
            });
        } catch (error) {
            reject(error);
        }
    });
}

async function saveDashboardSettings(settings = currentDashboardSettings) {
    currentDashboardSettings = mergeDashboardSettings(settings);

    const payload = { [SETTINGS_STORAGE_KEY]: currentDashboardSettings };

    if (currentDashboardSettings.disableSync) {
        await setLocalStorageData(payload);
        await removeSyncStorageData([SETTINGS_STORAGE_KEY]);
        return;
    }

    await setSyncStorageData(payload);
    await removeLocalStorageData([SETTINGS_STORAGE_KEY]);
}

async function loadDashboardSettings() {
    try {
        const [localData, syncData] = await Promise.all([
            getLocalStorageData([SETTINGS_STORAGE_KEY]),
            getSyncStorageData([SETTINGS_STORAGE_KEY]),
        ]);

        const localSettings = localData?.[SETTINGS_STORAGE_KEY];
        const syncSettings = syncData?.[SETTINGS_STORAGE_KEY];
        const nextSettings = localSettings?.disableSync ? localSettings : (syncSettings || localSettings || {});

        currentDashboardSettings = mergeDashboardSettings(nextSettings);
        renderDashboardSettings(currentDashboardSettings);
        await refreshHideSwitchLockState();
    } catch (error) {
        console.error('[DASHBOARD:LOAD_GENERAL_SETTINGS]', error);
    }
}

function setSettingsLockedState(isLocked) {
    if (!settingsContainer) {
        return;
    }

    settingsContainer.classList.toggle('opacity-50', isLocked);
    settingsContainer.classList.toggle('pointer-events-none', isLocked);

    if (settingsLockBadge) {
        settingsLockBadge.classList.toggle('hidden', !isLocked);
    }
}

function formatNotificationSeconds(totalSeconds) {
    const safeValue = Math.max(0, Number(totalSeconds) || 0);
    const minutes = Math.floor(safeValue / 60);
    const seconds = safeValue % 60;

    if (minutes > 0 && seconds > 0) {
        return `${minutes}m ${seconds}s`;
    }

    if (minutes > 0) {
        return `${minutes}m`;
    }

    return `${seconds}s`;
}

function convertSecondsToNotificationRow(seconds) {
    const safeValue = Math.max(0, Number(seconds) || 0);
    if (safeValue >= 60 && safeValue % 60 === 0) {
        return {
            value: String(safeValue / 60),
            unit: 'minutes',
        };
    }

    return {
        value: safeValue > 0 ? String(safeValue) : '',
        unit: 'seconds',
    };
}

function renderNotificationList(notifications) {
    if (!settingsNotificationsList) {
        return;
    }

    settingsNotificationsList.innerHTML = '';
    const rows = Array.isArray(notifications)
        ? notifications.slice().sort((a, b) => a - b).map(convertSecondsToNotificationRow)
        : [];

    while (rows.length < 5) {
        rows.push({ value: '', unit: 'seconds' });
    }

    rows.slice(0, 5).forEach((row, index) => {
        const item = document.createElement('li');
        item.className = 'theme-notification-row';

        const valueInput = document.createElement('input');
        valueInput.type = 'number';
        valueInput.min = '1';
        valueInput.step = '1';
        valueInput.placeholder = '';
        valueInput.value = row.value;
        valueInput.dataset.notificationRow = String(index);
        valueInput.dataset.role = 'value';
        valueInput.className = 'theme-notification-number';

        const unitSelect = document.createElement('select');
        unitSelect.dataset.notificationRow = String(index);
        unitSelect.dataset.role = 'unit';
        unitSelect.className = 'theme-notification-select';
        unitSelect.innerHTML = `
            <option value="seconds">second(s)</option>
            <option value="minutes">minute(s)</option>
        `;
        unitSelect.value = row.unit;

        const suffix = document.createElement('span');
        suffix.className = 'theme-notification-suffix';
        suffix.textContent = 'remaining';

        item.appendChild(valueInput);
        item.appendChild(unitSelect);
        item.appendChild(suffix);
        settingsNotificationsList.appendChild(item);
    });
}

function renderDashboardSettings(settings) {
    if (!settingsContainer) {
        return;
    }

    setSettingsLockedState(Boolean(settings.isChallengeActive));
    renderDashboardGlobalActiveToggleVisibility(Boolean(settings.hideSwitch));

    if (settingsActivateSwitch) {
        settingsActivateSwitch.checked = !settings.hideSwitch;
    }

    renderHideSwitchLockState();

    if (settingsTheme) {
        settingsTheme.value = settings.theme;
    }

    if (settingsLanguage) {
        settingsLanguage.value = settings.language;
    }

    if (settingsFloatingTimer) {
        settingsFloatingTimer.checked = settings.floatingTimerEnable;
    }

    if (settingsDisableSync) {
        settingsDisableSync.checked = settings.disableSync;
    }

    if (settingsTrackAudio) {
        settingsTrackAudio.checked = settings.trackTabsPlayingAudio;
    }

    if (settingsNeverShowUpdates) {
        settingsNeverShowUpdates.checked = settings.neverShowUpdateNotices;
    }

    if (settingsHideAllowLinks) {
        settingsHideAllowLinks.checked = settings.hideAllowLinks;
    }

    if (settingsRedirectMessage) {
        settingsRedirectMessage.value = settings.redirectMessage;
    }

    if (settingsOptOutData) {
        settingsOptOutData.checked = settings.optOutDataCollection;
    }

    renderNotificationList(settings.notifications);
}

async function updateDashboardSetting(key, value) {
    const previousSettings = currentDashboardSettings;
    const nextSettings = mergeDashboardSettings({
        ...currentDashboardSettings,
        [key]: value,
    });

    currentDashboardSettings = nextSettings;
    renderDashboardSettings(nextSettings);
    await refreshHideSwitchLockState();

    try {
        await saveDashboardSettings(nextSettings);
    } catch (error) {
        console.error('[DASHBOARD:SAVE_GENERAL_SETTINGS]', error);
        currentDashboardSettings = previousSettings;
        renderDashboardSettings(currentDashboardSettings);
        await refreshHideSwitchLockState();
    }
}

function createToggleTrackerHandler(settingKey, eventName) {
    return async (event) => {
        tracker.track(eventName);
        await updateDashboardSetting(settingKey, Boolean(event.target.checked));
    };
}

function bindDashboardSettingsEvents() {
    if (settingsActivateSwitch) {
        settingsActivateSwitch.addEventListener('change', async (event) => {
            await updateDashboardSetting('hideSwitch', !Boolean(event.target.checked));
        });
    }

    if (settingsTheme) {
        settingsTheme.addEventListener('change', async (event) => {
            await updateDashboardSetting('theme', event.target.value);
        });
    }

    if (settingsLanguage) {
        settingsLanguage.addEventListener('change', async (event) => {
            await updateDashboardSetting('language', event.target.value);
        });
    }

    if (settingsFloatingTimer) {
        settingsFloatingTimer.addEventListener('change', createToggleTrackerHandler('floatingTimerEnable', 'SETTINGS_FLOATING_TIMER_TOGGLED'));
    }

    if (settingsDisableSync) {
        settingsDisableSync.addEventListener('change', createToggleTrackerHandler('disableSync', 'SETTINGS_DISABLE_SYNC_TOGGLED'));
    }

    if (settingsTrackAudio) {
        settingsTrackAudio.addEventListener('change', createToggleTrackerHandler('trackTabsPlayingAudio', 'SETTINGS_TRACK_AUDIO_TOGGLED'));
    }

    if (settingsNeverShowUpdates) {
        settingsNeverShowUpdates.addEventListener('change', createToggleTrackerHandler('neverShowUpdateNotices', 'SETTINGS_HIDE_UPDATES_TOGGLED'));
    }

    if (settingsHideAllowLinks) {
        settingsHideAllowLinks.addEventListener('change', createToggleTrackerHandler('hideAllowLinks', 'SETTINGS_HIDE_ALLOW_LINKS_TOGGLED'));
    }

    if (settingsRedirectMessage) {
        settingsRedirectMessage.addEventListener('input', async (event) => {
            await updateDashboardSetting('redirectMessage', event.target.value);
        });
    }

    if (settingsAddNotification && settingsNotificationsList) {
        settingsAddNotification.addEventListener('click', async () => {
            const rows = Array.from(settingsNotificationsList.querySelectorAll('[data-notification-row]'));
            const grouped = new Map();

            rows.forEach((field) => {
                const rowIndex = field.dataset.notificationRow || '0';
                const row = grouped.get(rowIndex) || { value: '', unit: 'seconds' };
                row[field.dataset.role] = field.value;
                grouped.set(rowIndex, row);
            });

            const nextNotifications = Array.from(grouped.values())
                .map((row) => {
                    const rawValue = Math.max(0, Number(row.value) || 0);
                    if (rawValue <= 0) {
                        return 0;
                    }

                    return row.unit === 'minutes' ? rawValue * 60 : rawValue;
                })
                .filter((value) => value > 0);

            await updateDashboardSetting('notifications', nextNotifications);
        });
    }

    if (settingsOptOutData) {
        settingsOptOutData.addEventListener('change', async (event) => {
            const nextValue = Boolean(event.target.checked);
            const confirmed = window.confirm('Continue with updating the data privacy preference?');

            if (!confirmed) {
                event.target.checked = currentDashboardSettings.optOutDataCollection;
                return;
            }

            await updateDashboardSetting('optOutDataCollection', nextValue);
        });
    }
}

function loadSettings() {
    try {
        chrome.storage.sync.get([STORAGE_KEY, 'isExtensionActive'], (data) => {
            if (chrome.runtime.lastError) {
                console.error('[DASHBOARD:LOAD_SETTINGS]', chrome.runtime.lastError);
                return;
            }

            isExtensionGloballyActive = data?.isExtensionActive !== false;
            updateGlobalActiveToggleVisual(isExtensionGloballyActive);
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

async function setExtensionActiveState(isActive) {
    try {
        await setSyncStorageData({ isExtensionActive: isActive });
        isExtensionGloballyActive = isActive;
        updateGlobalActiveToggleVisual(isActive);
    } catch (error) {
        console.error('[DASHBOARD:SET_EXTENSION_ACTIVE]', error);
    }
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

bindDashboardGlobalActiveToggle();

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync' && areaName !== 'local') {
        return;
    }

    if (changes.isExtensionActive) {
        isExtensionGloballyActive = changes.isExtensionActive.newValue !== false;
        updateGlobalActiveToggleVisual(isExtensionGloballyActive);
    }

    if (changes.siteTimers) {
        void refreshHideSwitchLockState();
    }

    if (changes[SETTINGS_STORAGE_KEY]) {
        void loadDashboardSettings();
    }
});

if (!location.hash) {
    history.replaceState(null, '', buildHashRoute(DEFAULT_ROUTE.panel));
}

renderRoute(parseHashRoute());
initOpeningTimerUI();
loadSettings();
bindDashboardSettingsEvents();
void loadDashboardSettings();

window.setDashboardChallengeActive = async (isActive) => {
    await updateDashboardSetting('isChallengeActive', Boolean(isActive));
};
