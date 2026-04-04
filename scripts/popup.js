'use strict';

const STORAGE_KEY = 'inAppBlockingSettings';
const OPENING_TIMER_STATE_KEY = 'openingTimerState';
const SETTINGS_STORAGE_KEY = 'dashboardSettings';
const DEFAULT_OPENING_TIMER_MESSAGE = 'Chậm lại một chút trước khi mở nội dung gây xao nhãng.';
const DEFAULT_TIME_REMAINING_SECONDS = 25 * 60;

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
const popupActiveToggleHost = globalActiveToggleShell?.parentElement || null;
const popupActiveToggleMarkup = globalActiveToggleShell?.outerHTML || '';
let popupActiveTogglePlaceholder = document.createComment('popup-active-toggle-shell');

let popupTimerInterval = null;
let uiCountdownInterval = null;
let lastRenderedHost = '';
let latestPopupState = null;

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
    const showMain = screenName === 'mainScreen';
    mainScreen?.classList.toggle('hidden', !showMain);
    openingTimerWaitScreen?.classList.toggle('hidden', showMain);
}

function normalizeHost(hostname = '') {
    return hostname.replace(/^www\./i, '').toLowerCase();
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
        globalActiveToggleLabel.textContent = isActive ? 'Active' : 'Off';
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

function startUiCountdown(secondsRemaining) {
    if (!timeRemainingValue) {
        return;
    }

    if (uiCountdownInterval) {
        clearInterval(uiCountdownInterval);
        uiCountdownInterval = null;
    }

    const countdownState = {
        secondsLeft: Math.max(0, secondsRemaining),
    };

    const updateCountdown = () => {
        if (!latestPopupState || latestPopupState.status !== 'tracking') {
            if (uiCountdownInterval) {
                clearInterval(uiCountdownInterval);
                uiCountdownInterval = null;
            }
            return;
        }

        timeRemainingValue.textContent = formatSeconds(countdownState.secondsLeft);

        if (countdownState.secondsLeft <= 0) {
            latestPopupState.status = 'blocked';
            latestPopupState.statusLabel = "Time's Up";
            latestPopupState.note = 'Đã hết thời gian cho website này.';
            updateUIState(latestPopupState, latestPopupState.currentTabInfo);
            return;
        }

        countdownState.secondsLeft -= 1;
    };

    updateCountdown();
    uiCountdownInterval = window.setInterval(updateCountdown, 1000);
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

function buildPopupState(storageData, currentTabInfo) {
    const extensionSettings = storageData?.[STORAGE_KEY] || {};
    const isExtensionActive = storageData?.isExtensionActive !== false;
    const currentUrl = currentTabInfo?.url || '';
    const parsedUrl = currentUrl ? new URL(currentUrl) : null;
    const hostname = normalizeHost(parsedUrl?.hostname || '');
    const blockedSites = Array.isArray(storageData?.blockedSites) ? storageData.blockedSites.map(normalizeHost) : [];
    const whitelistedSites = Array.isArray(storageData?.whitelistedSites) ? storageData.whitelistedSites.map(normalizeHost) : [];
    const siteTimers = storageData?.siteTimers && typeof storageData.siteTimers === 'object' ? storageData.siteTimers : {};
    const currentTimer = siteTimers[hostname];
    const remainingSeconds = Math.max(0, Number(currentTimer?.remainingSeconds) || DEFAULT_TIME_REMAINING_SECONDS);

    if (!isExtensionActive) {
        return {
            isExtensionActive: false,
            hostname,
            fullUrl: currentUrl,
            status: 'disabled',
            statusLabel: 'Disabled',
            note: 'Extension is currently Disabled',
            remainingSeconds: null,
            currentTabInfo,
            youtubeSettings: extensionSettings.youtube || {},
        };
    }

    if (whitelistedSites.includes(hostname)) {
        return {
            isExtensionActive: true,
            hostname,
            fullUrl: currentUrl,
            status: 'whitelisted',
            statusLabel: 'Whitelisted',
            note: 'Website này luôn được phép truy cập.',
            remainingSeconds: null,
            currentTabInfo,
            youtubeSettings: extensionSettings.youtube || {},
        };
    }

    if (blockedSites.includes(hostname) || currentTimer?.isBlocked || remainingSeconds <= 0) {
        return {
            isExtensionActive: true,
            hostname,
            fullUrl: currentUrl,
            status: 'blocked',
            statusLabel: "Time's Up",
            note: 'Website này hiện đang bị chặn.',
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
        statusLabel: 'Tracking',
        note: 'Thời gian đang được theo dõi cho website này.',
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
        activeWebsiteName.textContent = hostname || 'Website';
    }

    if (activeWebsiteUrl) {
        activeWebsiteUrl.textContent = state.fullUrl || 'Không đọc được URL hiện tại.';
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
        timeRemainingLabel.textContent = state.status === 'whitelisted' ? 'Status' : 'Time Remaining';
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
            timeRemainingValue.textContent = 'Always Allowed';
        }
        return;
    }

    if (state.status === 'blocked') {
        if (timeRemainingValue) {
            timeRemainingValue.textContent = "Blocked";
        }
        return;
    }

    startUiCountdown(state.remainingSeconds);
}

async function releaseOpeningTimerLock() {
    clearIntervals();
    await removeLocalStorage([OPENING_TIMER_STATE_KEY]);
    showScreen('mainScreen');
    await initPopup();
}

function updateOpeningTimerScreen(timerState) {
    if (openingTimerMessage) {
        openingTimerMessage.textContent = timerState.message || DEFAULT_OPENING_TIMER_MESSAGE;
    }
}

async function startOpeningTimer(timerState) {
    clearIntervals();
    showScreen('openingTimerWaitScreen');
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
        showScreen('mainScreen');
        return false;
    }

    const timerSeconds = getOpeningTimerDurationInSeconds(youtubeSettings);
    const isYouTubeTab = /^https?:\/\/(www\.)?youtube\.com\//i.test(currentUrl || '');

    if (!isYouTubeTab || !youtubeSettings?.openingTimerEnabled || timerSeconds <= 0) {
        showScreen('mainScreen');
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
        message: DEFAULT_OPENING_TIMER_MESSAGE,
    };

    await setLocalStorage({ [OPENING_TIMER_STATE_KEY]: nextTimerState });
    await startOpeningTimer(nextTimerState);
    return true;
}

async function refreshPopupView() {
    try {
        const currentTabInfo = await queryActiveTab();
        const [storageData, localSettingsData] = await Promise.all([
            getSyncStorage([
                STORAGE_KEY,
                'isExtensionActive',
                'blockedSites',
                'whitelistedSites',
                'siteTimers',
                SETTINGS_STORAGE_KEY,
            ]),
            getLocalStorage([SETTINGS_STORAGE_KEY]),
        ]);

        const dashboardSettings = resolveDashboardSettings(storageData, localSettingsData);
        renderPopupActiveToggleVisibility(Boolean(dashboardSettings.hideSwitch));
        const popupState = buildPopupState(storageData, currentTabInfo);
        updateUIState(popupState, currentTabInfo);
    } catch (error) {
        console.error('[POPUP:REFRESH_VIEW]', error);
    }
}

async function initPopup() {
    try {
        const currentTabInfo = await queryActiveTab();
        const [syncData, localSettingsData] = await Promise.all([
            getSyncStorage([
                STORAGE_KEY,
                'isExtensionActive',
                'blockedSites',
                'whitelistedSites',
                'siteTimers',
                SETTINGS_STORAGE_KEY,
            ]),
            getLocalStorage([SETTINGS_STORAGE_KEY]),
        ]);

        const dashboardSettings = resolveDashboardSettings(syncData, localSettingsData);
        renderPopupActiveToggleVisibility(Boolean(dashboardSettings.hideSwitch));
        const popupState = buildPopupState(syncData, currentTabInfo);
        updateUIState(popupState, currentTabInfo);

        if (!popupState.isExtensionActive) {
            showScreen('mainScreen');
            return;
        }

        const youtubeSettings = syncData?.[STORAGE_KEY]?.youtube || {};
        const timerScreenIsActive = await checkIfBlockedByOpeningTimer(youtubeSettings, currentTabInfo?.url || '');
        if (timerScreenIsActive) {
            return;
        }

        showScreen('mainScreen');
        updateUIState(popupState, currentTabInfo);
    } catch (error) {
        console.error('[POPUP:INIT]', error);
        showScreen('mainScreen');
    }
}

if (expandBtn) {
    expandBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });
}

bindPopupActiveToggle();

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync' && areaName !== 'local') {
        return;
    }

    if (changes.isExtensionActive || changes.blockedSites || changes.whitelistedSites || changes.siteTimers || changes[STORAGE_KEY] || changes[SETTINGS_STORAGE_KEY] || changes[OPENING_TIMER_STATE_KEY]) {
        void initPopup();
    }
});

void initPopup();
