'use strict';

const STORAGE_KEY = 'inAppBlockingSettings';
const OPENING_TIMER_STATE_KEY = 'openingTimerState';
const SETTINGS_STORAGE_KEY = 'dashboardSettings';

function i18nMsg(key, fallback) {
    if (typeof globalThis.ExtensionI18n?.getMessage === 'function') {
        const s = globalThis.ExtensionI18n.getMessage(key);
        if (s) {
            return s;
        }
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

    return fallback;
}

function getDefaultOpeningTimerMessage() {
    return i18nMsg(
        'opening_timer_message_default',
        'Take a short pause before opening distracting content.',
    );
}

const mainScreen = document.getElementById('main-screen');
const openingTimerWaitScreen = document.getElementById('opening-timer-wait-screen');
const openingTimerLeftSeconds = document.getElementById('opening-timer-left-seconds');
const openingTimerMessage = document.getElementById('opening-timer-message');
const activeWebsiteName = document.getElementById('active-website-name');
const activeWebsiteUrl = document.getElementById('active-website-url');
const activeWebsiteNote = document.getElementById('active-website-note');
const currentSiteBadge = document.getElementById('current-site-badge');
const siteStatusCard = document.getElementById('site-status-card');
const siteStatusContent = document.getElementById('site-status-content');
const statusIconShell = document.getElementById('status-icon-shell');
const statusIcon = document.getElementById('status-icon');
const siteFavicon = document.getElementById('site-favicon');
const timeRemainingLabel = document.getElementById('time-remaining-label');
const timeRemainingValue = document.getElementById('time-remaining-value');
const disabledMessage = document.getElementById('disabled-message');
let globalActiveToggleShell = document.getElementById('popup-active-toggle-shell');
let globalActiveToggle = document.getElementById('global-active-toggle');
let globalActiveToggleLabel = document.getElementById('global-active-toggle-label');
const expandBtn = document.getElementById('expand-btn');
const popupSettingsScreen = document.getElementById('popup-settings-screen');
const popupSettingsBtn = document.getElementById('popup-settings-btn');
const popupSettingsBack = document.getElementById('popup-settings-back');
const popupSettingsTheme = document.getElementById('popup-settings-theme');
const popupSettingsShowToggle = document.getElementById('popup-settings-show-toggle');
const popupSettingsFloatingTimer = document.getElementById('popup-settings-floating-timer');
const popupSettingsDisableSync = document.getElementById('popup-settings-disable-sync');
const popupOpenFullSettings = document.getElementById('popup-open-full-settings');
const popupActiveToggleHost = globalActiveToggleShell?.parentElement || null;
const popupActiveToggleMarkup = globalActiveToggleShell?.outerHTML || '';
let popupActiveTogglePlaceholder = document.createComment('popup-active-toggle-shell');

let popupTimerInterval = null;
let uiCountdownInterval = null;
let lastRenderedHost = '';
let latestPopupState = null;
let popupUiMode = 'main';

const DEFAULT_DASHBOARD_SETTINGS_POPUP = {
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

function mergeDashboardSettingsPopup(storedSettings = {}) {
    return {
        ...DEFAULT_DASHBOARD_SETTINGS_POPUP,
        ...(storedSettings || {}),
        notifications: Array.isArray(storedSettings?.notifications)
            ? storedSettings.notifications
                .map((value) => Math.max(0, Number(value) || 0))
                .filter((value) => value > 0)
            : [...DEFAULT_DASHBOARD_SETTINGS_POPUP.notifications],
    };
}

function hydratePopupToggleRefs() {
    globalActiveToggleShell = document.getElementById('popup-active-toggle-shell');
    globalActiveToggle = document.getElementById('global-active-toggle');
    globalActiveToggleLabel = document.getElementById('global-active-toggle-label');
}

function bindPopupActiveToggle() {
    if (!globalActiveToggle || globalActiveToggle.dataset.bound === 'true') {
        return;
    }

    globalActiveToggle.dataset.bound = 'true';
    globalActiveToggle.addEventListener('click', async () => {
        const nextValue = globalActiveToggle.getAttribute('aria-pressed') !== 'true';

        try {
            await setSyncStorage({ isExtensionActive: nextValue });
            await refreshPopupView();
        } catch (error) {
            console.error('[POPUP:TOGGLE_ACTIVE]', error);
        }
    });
}

function renderPopupActiveToggleVisibility(shouldHide) {
    if (shouldHide) {
        if (globalActiveToggleShell?.parentNode) {
            globalActiveToggleShell.replaceWith(popupActiveTogglePlaceholder);
        }
        hydratePopupToggleRefs();
        return;
    }

    if (!globalActiveToggleShell && popupActiveToggleHost && popupActiveToggleMarkup) {
        const template = document.createElement('template');
        template.innerHTML = popupActiveToggleMarkup.trim();
        const nextShell = template.content.firstElementChild;
        if (nextShell) {
            if (popupActiveTogglePlaceholder.parentNode) {
                popupActiveTogglePlaceholder.replaceWith(nextShell);
            } else {
                popupActiveToggleHost.appendChild(nextShell);
            }
        }
    }

    hydratePopupToggleRefs();
    bindPopupActiveToggle();
}

function resolveDashboardSettings(syncData = {}, localData = {}) {
    const localSettings = localData?.[SETTINGS_STORAGE_KEY];
    const syncSettings = syncData?.[SETTINGS_STORAGE_KEY];
    return localSettings?.disableSync ? (localSettings || {}) : (syncSettings || localSettings || {});
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

function setSyncStorage(payload) {
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

function setLocalStorage(payload) {
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

function removeLocalStorage(keys) {
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

function removeSyncStorage(keys) {
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

async function loadMergedDashboardSettingsPopup() {
    const [localData, syncData] = await Promise.all([
        getLocalStorage([SETTINGS_STORAGE_KEY]),
        getSyncStorage([SETTINGS_STORAGE_KEY]),
    ]);
    const localSettings = localData?.[SETTINGS_STORAGE_KEY];
    const syncSettings = syncData?.[SETTINGS_STORAGE_KEY];
    const raw = localSettings?.disableSync ? localSettings : (syncSettings || localSettings || {});
    return mergeDashboardSettingsPopup(raw);
}

async function saveDashboardSettingsPopup(settings) {
    const merged = mergeDashboardSettingsPopup(settings);
    const payload = { [SETTINGS_STORAGE_KEY]: merged };

    if (merged.disableSync) {
        await setLocalStorage(payload);
        await removeSyncStorage([SETTINGS_STORAGE_KEY]);
    } else {
        await setSyncStorage(payload);
        await removeLocalStorage([SETTINGS_STORAGE_KEY]);
    }

    return merged;
}

async function hydratePopupSettingsForm() {
    if (!popupSettingsTheme) {
        return;
    }

    try {
        const s = await loadMergedDashboardSettingsPopup();
        const th = s.theme;
        popupSettingsTheme.value = th === 'light' || th === 'dark' || th === 'auto' ? th : 'auto';
        if (popupSettingsShowToggle) {
            popupSettingsShowToggle.checked = !s.hideSwitch;
        }

        if (popupSettingsFloatingTimer) {
            popupSettingsFloatingTimer.checked = Boolean(s.floatingTimerEnable);
        }

        if (popupSettingsDisableSync) {
            popupSettingsDisableSync.checked = Boolean(s.disableSync);
        }
    } catch (error) {
        console.error('[POPUP:HYDRATE_SETTINGS]', error);
    }
}

async function persistPopupDashboardPatch(patch) {
    let previous;
    try {
        previous = await loadMergedDashboardSettingsPopup();
        const next = mergeDashboardSettingsPopup({ ...previous, ...patch });
        await saveDashboardSettingsPopup(next);
        if (Object.prototype.hasOwnProperty.call(patch, 'hideSwitch')) {
            renderPopupActiveToggleVisibility(Boolean(next.hideSwitch));
        }
    } catch (error) {
        console.error('[POPUP:PERSIST_SETTINGS]', error);
        await hydratePopupSettingsForm();
        if (previous !== undefined && Object.prototype.hasOwnProperty.call(patch, 'hideSwitch')) {
            renderPopupActiveToggleVisibility(Boolean(previous.hideSwitch));
        }
    }
}

function queryActiveTab() {
    return new Promise((resolve, reject) => {
        try {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                    return;
                }

                resolve(tabs[0] || null);
            });
        } catch (error) {
            reject(error);
        }
    });
}

function clearIntervals() {
    if (popupTimerInterval) {
        clearInterval(popupTimerInterval);
        popupTimerInterval = null;
    }

    if (uiCountdownInterval) {
        clearInterval(uiCountdownInterval);
        uiCountdownInterval = null;
    }
}

function formatSeconds(totalSeconds) {
    const safeSeconds = Math.max(0, totalSeconds);
    const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, '0');
    const seconds = (safeSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
}

function showScreen(screenName) {
    const showMain = screenName === 'main';
    const showTimer = screenName === 'timer';
    const showSettings = screenName === 'settings';
    mainScreen?.classList.toggle('hidden', !showMain);
    openingTimerWaitScreen?.classList.toggle('hidden', !showTimer);
    popupSettingsScreen?.classList.toggle('hidden', !showSettings);
}

function normalizeHost(hostname = '') {
    return BlocklistPolicy.normalizeHost(hostname);
}

function getOpeningTimerDurationInSeconds(youtubeSettings) {
    const rawValue = Math.max(0, Number(youtubeSettings?.openingTimerValue) || 0);
    return youtubeSettings?.openingTimerUnit === 'minutes' ? rawValue * 60 : rawValue;
}

function updateToggleVisual(isActive) {
    if (!globalActiveToggle) {
        return;
    }

    globalActiveToggle.classList.toggle('is-on', isActive);
    globalActiveToggle.setAttribute('aria-pressed', String(isActive));

    if (globalActiveToggleLabel) {
        globalActiveToggleLabel.textContent = isActive
            ? i18nMsg('popup_toggle_on', 'Active')
            : i18nMsg('popup_toggle_off', 'Off');
    }
}

function updateSiteFavicon(currentTabInfo) {
    if (!siteFavicon || !statusIcon) {
        return;
    }

    const currentUrl = typeof currentTabInfo?.url === 'string' ? currentTabInfo.url : '';
    if (!currentUrl) {
        siteFavicon.removeAttribute('src');
        siteFavicon.classList.add('hidden');
        statusIcon.classList.remove('hidden');
        return;
    }

    const faviconUrl = chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(currentUrl)}&size=32`);

    siteFavicon.onerror = () => {
        siteFavicon.removeAttribute('src');
        siteFavicon.classList.add('hidden');
        statusIcon.classList.remove('hidden');
    };

    siteFavicon.onload = () => {
        siteFavicon.classList.remove('hidden');
        statusIcon.classList.add('hidden');
    };

    siteFavicon.src = faviconUrl;
}

const POPUP_COUNTDOWN_SYNC_KEYS = [
    STORAGE_KEY,
    'isExtensionActive',
    'blockedSites',
    'blockedGroups',
    'blockAllExceptAllowlist',
    'whitelistedSites',
    'siteTimers',
];

/**
 * Đọc lại storage mỗi giây để khớp hạn nhóm (nhiều tab cùng nhóm cộng dồn) và siteTimers từ service worker.
 */
function startUiCountdown() {
    if (!timeRemainingValue) {
        return;
    }

    if (uiCountdownInterval) {
        clearInterval(uiCountdownInterval);
        uiCountdownInterval = null;
    }

    const tick = async () => {
        if (!latestPopupState || latestPopupState.status !== 'tracking') {
            if (uiCountdownInterval) {
                clearInterval(uiCountdownInterval);
                uiCountdownInterval = null;
            }
            return;
        }

        try {
            const currentTabInfo = await queryActiveTab();
            const [storageData, groupUsageRaw] = await Promise.all([
                getSyncStorage(POPUP_COUNTDOWN_SYNC_KEYS),
                getLocalStorage(['vmuGroupUsageTs']),
            ]);
            const groupUsageMap =
                groupUsageRaw && groupUsageRaw.vmuGroupUsageTs && typeof groupUsageRaw.vmuGroupUsageTs === 'object'
                    ? groupUsageRaw.vmuGroupUsageTs
                    : {};
            const state = buildPopupState(storageData, currentTabInfo, groupUsageMap);
            if (state.status !== 'tracking') {
                if (uiCountdownInterval) {
                    clearInterval(uiCountdownInterval);
                    uiCountdownInterval = null;
                }
                updateUIState(state, currentTabInfo);
                return;
            }
            const sec = Math.max(0, Number(state.remainingSeconds) || 0);
            timeRemainingValue.textContent = formatSeconds(sec);
            if (sec <= 0) {
                if (uiCountdownInterval) {
                    clearInterval(uiCountdownInterval);
                    uiCountdownInterval = null;
                }
                const blockedState = {
                    ...state,
                    status: 'blocked',
                    statusLabel: i18nMsg('popup_status_times_up', "Time's up"),
                    note: i18nMsg('popup_note_time_up', 'Time for this site has run out.'),
                    remainingSeconds: 0,
                    currentTabInfo,
                };
                updateUIState(blockedState, currentTabInfo);
            }
        } catch (error) {
            console.error('[POPUP:COUNTDOWN]', error);
        }
    };

    void tick();
    uiCountdownInterval = window.setInterval(() => {
        void tick();
    }, 1000);
}

function setStatusVisual(status) {
    if (!currentSiteBadge || !statusIconShell || !statusIcon || !siteStatusContent) {
        return;
    }

    currentSiteBadge.classList.remove('bg-red-100', 'text-red-600', 'bg-green-100', 'text-green-600', 'bg-slate-100', 'text-slate-600');
    statusIconShell.classList.remove('bg-red-100', 'bg-green-100', 'bg-slate-200');
    statusIcon.classList.remove('fill-red-600', 'fill-green-600', 'fill-slate-600');
    siteStatusContent.classList.remove('bg-red-50', 'bg-green-50', 'bg-slate-100');

    if (status === 'blocked') {
        currentSiteBadge.classList.add('bg-red-100', 'text-red-600');
        statusIconShell.classList.add('bg-red-100');
        statusIcon.classList.add('fill-red-600');
        siteStatusContent.classList.add('bg-red-50');
        return;
    }

    if (status === 'whitelisted') {
        currentSiteBadge.classList.add('bg-green-100', 'text-green-600');
        statusIconShell.classList.add('bg-green-100');
        statusIcon.classList.add('fill-green-600');
        siteStatusContent.classList.add('bg-green-50');
        return;
    }

    currentSiteBadge.classList.add('bg-slate-100', 'text-slate-600');
    statusIconShell.classList.add('bg-slate-200');
    statusIcon.classList.add('fill-slate-600');
    siteStatusContent.classList.add('bg-slate-100');
}

function buildPopupState(storageData, currentTabInfo, groupUsageMap) {
    const extensionSettings = storageData?.[STORAGE_KEY] || {};
    const isExtensionActive = storageData?.isExtensionActive !== false;
    const currentUrl = currentTabInfo?.url || '';
    const parsedUrl = currentUrl ? new URL(currentUrl) : null;
    const hostname = normalizeHost(parsedUrl?.hostname || '');
    const whitelistedSites = Array.isArray(storageData?.whitelistedSites) ? storageData.whitelistedSites : [];
    const siteTimers = storageData?.siteTimers && typeof storageData.siteTimers === 'object' ? storageData.siteTimers : {};
    const gm =
        groupUsageMap && typeof groupUsageMap === 'object' && !Array.isArray(groupUsageMap) ? groupUsageMap : {};
    const usageSafe = JSON.parse(JSON.stringify(gm));

    if (!isExtensionActive) {
        return {
            isExtensionActive: false,
            hostname,
            fullUrl: currentUrl,
            status: 'disabled',
            statusLabel: i18nMsg('popup_status_disabled', 'Off'),
            note: i18nMsg('popup_note_extension_disabled', 'The extension is turned off.'),
            remainingSeconds: null,
            currentTabInfo,
            youtubeSettings: extensionSettings.youtube || {},
        };
    }

    if (BlocklistPolicy.listMatchesAllowlist(hostname, currentUrl, whitelistedSites)) {
        return {
            isExtensionActive: true,
            hostname,
            fullUrl: currentUrl,
            status: 'whitelisted',
            statusLabel: i18nMsg('popup_status_whitelisted', 'Allowed'),
            note: i18nMsg('popup_note_whitelisted', 'This site is always allowed.'),
            remainingSeconds: null,
            currentTabInfo,
            youtubeSettings: extensionSettings.youtube || {},
        };
    }

    const evalPayload = {
        isExtensionActive: true,
        blockAllExceptAllowlist: BlocklistPolicy.isBlockAllExceptAllowlistEnabled(
            storageData?.blockAllExceptAllowlist,
        ),
        blockedGroups: storageData?.blockedGroups,
        blockedSites: storageData?.blockedSites,
        whitelistedSites,
        siteTimers,
    };
    const evalResult = GroupTimestampUsage.evaluateBlockingWithGroupUsage(
        evalPayload,
        hostname,
        currentUrl,
        usageSafe,
        Date.now(),
    );

    let remainingSeconds = BlocklistPolicy.DEFAULT_REMAINING_SECONDS;
    if (!evalResult.blocked && GroupTimestampUsage.hostUsesTimestampBudget(hostname, currentUrl, storageData)) {
        const gid = GroupTimestampUsage.firstTimestampGroupIdForHost(hostname, currentUrl, storageData);
        const groups = Array.isArray(storageData?.blockedGroups) ? storageData.blockedGroups : [];
        const g = groups.find((x) => x && x.id === gid);
        const cap = GroupTimestampUsage.groupAllowedMs(g);
        const d = new Date();
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const entry = GroupTimestampUsage.ensureUsageEntry(usageSafe, gid, today);
        const used = GroupTimestampUsage.getTotalUsedMs(entry, Date.now());
        remainingSeconds = Math.max(0, Math.floor((cap - used) / 1000));
    } else if (!evalResult.blocked) {
        const currentTimer = siteTimers[hostname];
        const remRaw = currentTimer && currentTimer.remainingSeconds;
        const remNum = Number(remRaw);
        const hasExplicit =
            currentTimer != null && remRaw !== undefined && remRaw !== null && !Number.isNaN(remNum);
        remainingSeconds = Math.max(0, hasExplicit ? remNum : BlocklistPolicy.DEFAULT_REMAINING_SECONDS);
    }

    if (evalResult.blocked) {
        return {
            isExtensionActive: true,
            hostname,
            fullUrl: currentUrl,
            status: 'blocked',
            statusLabel: i18nMsg('popup_status_times_up', "Time's up"),
            note: i18nMsg('popup_note_blocked', 'This site is currently blocked.'),
            remainingSeconds: 0,
            currentTabInfo,
            youtubeSettings: extensionSettings.youtube || {},
        };
    }

    return {
        isExtensionActive: true,
        hostname,
        fullUrl: currentUrl,
        status: 'tracking',
        statusLabel: i18nMsg('popup_status_tracking', 'Tracking'),
        note: i18nMsg('popup_note_tracking', 'Time is being tracked for this site.'),
        remainingSeconds,
        currentTabInfo,
        youtubeSettings: extensionSettings.youtube || {},
    };
}

function updateUIState(state, currentTabInfo) {
    latestPopupState = state;
    clearIntervals();
    updateToggleVisual(Boolean(state.isExtensionActive));

    const hostname = state.hostname || normalizeHost(new URL(currentTabInfo?.url || 'https://example.com').hostname);
    lastRenderedHost = hostname;

    if (activeWebsiteName) {
        activeWebsiteName.textContent = hostname || i18nMsg('popup_website_placeholder', 'Website');
    }

    if (activeWebsiteUrl) {
        activeWebsiteUrl.textContent = state.fullUrl || i18nMsg('popup_url_unreadable', 'Could not read the current tab URL.');
    }

    updateSiteFavicon(currentTabInfo);

    if (currentSiteBadge) {
        currentSiteBadge.textContent = state.statusLabel;
    }

    if (activeWebsiteNote) {
        activeWebsiteNote.textContent = state.note;
    }

    if (siteStatusCard) {
        siteStatusCard.classList.toggle('opacity-60', !state.isExtensionActive);
    }

    if (disabledMessage) {
        disabledMessage.classList.toggle('hidden', state.isExtensionActive);
    }

    if (siteStatusContent) {
        siteStatusContent.classList.toggle('hidden', !state.isExtensionActive);
    }

    if (timeRemainingLabel) {
        timeRemainingLabel.textContent = state.status === 'whitelisted'
            ? i18nMsg('popup_time_status_label', 'Status')
            : i18nMsg('popup_time_remaining', 'Time remaining');
    }

    setStatusVisual(state.status);

    if (!state.isExtensionActive) {
        if (timeRemainingValue) {
            timeRemainingValue.textContent = '--:--';
        }
        return;
    }

    if (state.status === 'whitelisted') {
        if (timeRemainingValue) {
            timeRemainingValue.textContent = i18nMsg('popup_value_always_allowed', 'Always allowed');
        }
        return;
    }

    if (state.status === 'blocked') {
        if (timeRemainingValue) {
            timeRemainingValue.textContent = i18nMsg('popup_value_blocked', 'Blocked');
        }
        return;
    }

    startUiCountdown();
}

async function releaseOpeningTimerLock() {
    clearIntervals();
    await removeLocalStorage([OPENING_TIMER_STATE_KEY]);
    popupUiMode = 'main';
    showScreen('main');
    await initPopup();
}

function updateOpeningTimerScreen(timerState) {
    if (openingTimerMessage) {
        openingTimerMessage.textContent = timerState.message || getDefaultOpeningTimerMessage();
    }
}

async function startOpeningTimer(timerState) {
    clearIntervals();
    showScreen('timer');
    updateOpeningTimerScreen(timerState);

    const updateCountdown = async () => {
        const secondsLeft = Math.max(0, Math.ceil((timerState.endsAt - Date.now()) / 1000));

        if (openingTimerLeftSeconds) {
            openingTimerLeftSeconds.textContent = formatSeconds(secondsLeft);
        }

        if (secondsLeft <= 0) {
            await releaseOpeningTimerLock();
        }
    };

    await updateCountdown();

    popupTimerInterval = window.setInterval(() => {
        void updateCountdown();
    }, 1000);
}

async function checkIfBlockedByOpeningTimer(youtubeSettings, currentUrl) {
    if (latestPopupState && latestPopupState.isExtensionActive === false) {
        showScreen(popupUiMode === 'settings' ? 'settings' : 'main');
        return false;
    }

    const timerSeconds = getOpeningTimerDurationInSeconds(youtubeSettings);
    const isYouTubeTab = /^https?:\/\/(www\.)?youtube\.com\//i.test(currentUrl || '');

    const openingTimerAllowed = youtubeSettings?.masterYtMisc !== false && youtubeSettings?.openingTimerEnabled;
    if (!isYouTubeTab || !openingTimerAllowed || timerSeconds <= 0) {
        showScreen(popupUiMode === 'settings' ? 'settings' : 'main');
        return false;
    }

    const { [OPENING_TIMER_STATE_KEY]: timerState } = await getLocalStorage([OPENING_TIMER_STATE_KEY]);
    const now = Date.now();

    if (
        timerState &&
        timerState.app === 'youtube' &&
        Number(timerState.endsAt) > now
    ) {
        await startOpeningTimer(timerState);
        return true;
    }

    const nextTimerState = {
        app: 'youtube',
        endsAt: now + (timerSeconds * 1000),
        message: getDefaultOpeningTimerMessage(),
    };

    await setLocalStorage({ [OPENING_TIMER_STATE_KEY]: nextTimerState });
    await startOpeningTimer(nextTimerState);
    return true;
}

async function refreshPopupView() {
    try {
        if (globalThis.ExtensionI18n?.reload && globalThis.ExtensionI18n?.apply) {
            await globalThis.ExtensionI18n.reload();
            globalThis.ExtensionI18n.apply(document.getElementById('popup-root') || document);
        }

        const currentTabInfo = await queryActiveTab();
        const [storageData, localSettingsData, groupUsageRaw] = await Promise.all([
            getSyncStorage([
                STORAGE_KEY,
                'isExtensionActive',
                'blockedSites',
                'blockedGroups',
                'blockAllExceptAllowlist',
                'whitelistedSites',
                'siteTimers',
                SETTINGS_STORAGE_KEY,
            ]),
            getLocalStorage([SETTINGS_STORAGE_KEY]),
            getLocalStorage(['vmuGroupUsageTs']),
        ]);

        const dashboardSettings = resolveDashboardSettings(storageData, localSettingsData);
        renderPopupActiveToggleVisibility(Boolean(dashboardSettings.hideSwitch));
        const groupUsageMap =
            groupUsageRaw && groupUsageRaw.vmuGroupUsageTs && typeof groupUsageRaw.vmuGroupUsageTs === 'object'
                ? groupUsageRaw.vmuGroupUsageTs
                : {};
        const popupState = buildPopupState(storageData, currentTabInfo, groupUsageMap);
        updateUIState(popupState, currentTabInfo);
    } catch (error) {
        console.error('[POPUP:REFRESH_VIEW]', error);
    }
}

async function initPopup() {
    try {
        if (globalThis.ExtensionI18n?.reload && globalThis.ExtensionI18n?.apply) {
            try {
                await globalThis.ExtensionI18n.reload();
            } catch (e) {
                console.error('[POPUP:I18N_RELOAD]', e);
            }

            globalThis.ExtensionI18n.apply(document.getElementById('popup-root') || document);
        }

        const currentTabInfo = await queryActiveTab();
        const [syncData, localSettingsData, groupUsageRaw] = await Promise.all([
            getSyncStorage([
                STORAGE_KEY,
                'isExtensionActive',
                'blockedSites',
                'blockedGroups',
                'blockAllExceptAllowlist',
                'whitelistedSites',
                'siteTimers',
                SETTINGS_STORAGE_KEY,
            ]),
            getLocalStorage([SETTINGS_STORAGE_KEY]),
            getLocalStorage(['vmuGroupUsageTs']),
        ]);

        const dashboardSettings = resolveDashboardSettings(syncData, localSettingsData);
        renderPopupActiveToggleVisibility(Boolean(dashboardSettings.hideSwitch));
        const groupUsageMap =
            groupUsageRaw && groupUsageRaw.vmuGroupUsageTs && typeof groupUsageRaw.vmuGroupUsageTs === 'object'
                ? groupUsageRaw.vmuGroupUsageTs
                : {};
        const popupState = buildPopupState(syncData, currentTabInfo, groupUsageMap);
        updateUIState(popupState, currentTabInfo);

        if (!popupState.isExtensionActive) {
            if (popupUiMode === 'settings') {
                showScreen('settings');
                await hydratePopupSettingsForm();
            } else {
                showScreen('main');
            }

            return;
        }

        const youtubeSettings = syncData?.[STORAGE_KEY]?.youtube || {};
        const timerScreenIsActive = await checkIfBlockedByOpeningTimer(youtubeSettings, currentTabInfo?.url || '');
        if (timerScreenIsActive) {
            return;
        }

        if (popupUiMode === 'settings') {
            showScreen('settings');
            await hydratePopupSettingsForm();
        } else {
            showScreen('main');
        }

        updateUIState(popupState, currentTabInfo);
    } catch (error) {
        console.error('[POPUP:INIT]', error);
        popupUiMode = 'main';
        showScreen('main');
    }
}

if (expandBtn) {
    expandBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });
}

function bindPopupSettingsUi() {
    if (!popupSettingsBtn || popupSettingsBtn.dataset.bound === 'true') {
        return;
    }

    popupSettingsBtn.dataset.bound = 'true';
    popupSettingsBtn.addEventListener('click', () => {
        popupUiMode = 'settings';
        showScreen('settings');
        void hydratePopupSettingsForm();
    });

    popupSettingsBack?.addEventListener('click', () => {
        popupUiMode = 'main';
        showScreen('main');
    });

    popupSettingsTheme?.addEventListener('change', async (event) => {
        await persistPopupDashboardPatch({ theme: event.target.value });
    });

    popupSettingsShowToggle?.addEventListener('change', async (event) => {
        await persistPopupDashboardPatch({ hideSwitch: !event.target.checked });
    });

    popupSettingsFloatingTimer?.addEventListener('change', async (event) => {
        await persistPopupDashboardPatch({ floatingTimerEnable: Boolean(event.target.checked) });
    });

    popupSettingsDisableSync?.addEventListener('change', async (event) => {
        const next = Boolean(event.target.checked);
        if (next) {
            const ok = window.confirm('Chỉ lưu trên máy này sẽ gỡ cài đặt bảng điều khiển khỏi đồng bộ Chrome. Tiếp tục?');
            if (!ok) {
                event.target.checked = false;
                return;
            }
        }

        await persistPopupDashboardPatch({ disableSync: next });
    });

    popupOpenFullSettings?.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });
}

bindPopupActiveToggle();
bindPopupSettingsUi();

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync' && areaName !== 'local') {
        return;
    }

    if (
        changes.isExtensionActive ||
        changes.blockedSites ||
        changes.blockedGroups ||
        changes.blockAllExceptAllowlist ||
        changes.whitelistedSites ||
        changes.siteTimers ||
        changes[STORAGE_KEY] ||
        changes[SETTINGS_STORAGE_KEY] ||
        changes[OPENING_TIMER_STATE_KEY] ||
        changes.vmuGroupUsageTs
    ) {
        void initPopup();
    }
});

void initPopup();
