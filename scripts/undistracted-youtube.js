'use strict';
/* global chrome */

const STORAGE_KEY = 'inAppBlockingSettings';
const EXTENSION_ACTIVE_KEY = 'isExtensionActive';
const STYLE_ID = 'antidoom-yt-attribute-style';
const AUTH_ATTRIBUTE = 'sf-yt-authorized';
const DEFAULT_YOUTUBE_SETTINGS = {
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
};
const SETTING_ATTRIBUTE_MAP = {
    hideHomePage: 'sf-yt-hide-home-page',
    hideShorts: 'sf-yt-hide-shorts',
    hideComments: 'sf-yt-hide-comments',
    hideRecommendedVideos: 'sf-yt-hide-recommended-video',
    hideThumbnails: 'sf-yt-hide-thumbnails',
    blurThumbnails: 'sf-yt-blur-thumbnails',
    hideSubscriptions: 'sf-yt-hide-subscriptions',
    hideExplore: 'sf-yt-hide-explore',
    hideTopBar: 'sf-yt-hide-top-bar',
    disableEndCards: 'sf-yt-hide-cards',
    blackWhiteMode: 'sf-yt-black-white-mode',
    disableAutoplay: 'sf-yt-hide-autoplay',
};
const SHORTS_TITLES = new Set(['shorts', '\u30b7\u30e7\u30fc\u30c8']);
const AUTOPLAY_SELECTORS = [
    '.ytp-autonav-toggle-button[aria-checked]',
    'button[data-tooltip-target-id="ytp-autonav-toggle-button"]',
    'ytd-watch-flexy tp-yt-paper-toggle-button',
    'button[aria-label*="Autoplay"]',
].join(', ');
// Inject CSS exactly once, then drive behavior by toggling html attributes.
const STATIC_CSS = `
html[sf-yt-hide-home-page="true"] ytd-browse[role="main"][page-subtype="home"] #primary,
html[sf-yt-hide-home-page="true"] ytd-page-manager ytd-browse[page-subtype="home"] ytd-rich-grid-renderer,
html[sf-yt-hide-home-page="true"] ytd-page-manager ytd-browse[page-subtype="home"] #contents,
html[sf-yt-hide-home-page="true"] ytd-two-column-browse-results-renderer[page-subtype="home"] #primary {
    display: none !important;
}

html[sf-yt-hide-shorts="true"] ytd-rich-shelf-renderer[is-shorts],
html[sf-yt-hide-shorts="true"] #contents ytd-reel-shelf-renderer,
html[sf-yt-hide-shorts="true"] ytd-shorts.ytd-page-manager,
html[sf-yt-hide-shorts="true"] ytd-reel-shelf-renderer,
html[sf-yt-hide-shorts="true"] ytd-rich-item-renderer:has(yt-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]),
html[sf-yt-hide-shorts="true"] ytd-video-renderer:has(yt-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]),
html[sf-yt-hide-shorts="true"] ytd-compact-video-renderer:has(yt-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]),
html[sf-yt-hide-shorts="true"] ytd-grid-video-renderer:has(yt-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]),
html[sf-yt-hide-shorts="true"] ytd-playlist-panel-video-renderer:has(yt-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]),
html[sf-yt-hide-shorts="true"] ytm-video-with-context-renderer:has(yt-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]),
html[sf-yt-hide-shorts="true"] ytd-rich-item-renderer:has(a[href^="/shorts/"]),
html[sf-yt-hide-shorts="true"] ytd-video-renderer:has(a[href^="/shorts/"]),
html[sf-yt-hide-shorts="true"] ytd-compact-video-renderer:has(a[href^="/shorts/"]),
html[sf-yt-hide-shorts="true"] ytd-grid-video-renderer:has(a[href^="/shorts/"]),
html[sf-yt-hide-shorts="true"] ytd-playlist-panel-video-renderer:has(a[href^="/shorts/"]),
html[sf-yt-hide-shorts="true"] ytm-reel-shelf-renderer,
html[sf-yt-hide-shorts="true"] ytm-shorts-lockup-view-model-v2,
html[sf-yt-hide-shorts="true"] [is-shorts],
html[sf-yt-hide-shorts="true"] a[href^="/shorts/"],
html[sf-yt-hide-shorts="true"] grid-shelf-view-model:has(ytm-shorts-lockup-view-model),
html[sf-yt-hide-shorts="true"] .ytGridShelfViewModelGridShelfRow:has(ytm-shorts-lockup-view-model),
html[sf-yt-hide-shorts="true"] [role="tab"].pivot-shorts {
    display: none !important;
}

html[sf-yt-hide-comments="true"] #comments,
html[sf-yt-hide-comments="true"] #comment-teaser,
html[sf-yt-hide-comments="true"] ytd-comments,
html[sf-yt-hide-comments="true"] ytm-comment-section-renderer,
html[sf-yt-hide-comments="true"] [section-identifier="comment-item-section"] {
    display: none !important;
}

html[sf-yt-hide-recommended-video="true"] #items.ytd-watch-next-secondary-results-renderer,
html[sf-yt-hide-recommended-video="true"] #related,
html[sf-yt-hide-recommended-video="true"] ytd-rich-grid-renderer.ytd-watch-grid,
html[sf-yt-hide-recommended-video="true"] [section-identifier="related-items"],
html[sf-yt-hide-recommended-video="true"] .ytp-endscreen-content {
    display: none !important;
}

html[sf-yt-hide-thumbnails="true"] yt-thumbnail-view-model,
html[sf-yt-hide-thumbnails="true"] ytd-thumbnail img,
html[sf-yt-hide-thumbnails="true"] #thumbnail img,
html[sf-yt-hide-thumbnails="true"] yt-image img,
html[sf-yt-hide-thumbnails="true"] .yt-core-image {
    visibility: hidden !important;
}

html[sf-yt-blur-thumbnails="true"] yt-thumbnail-view-model,
html[sf-yt-blur-thumbnails="true"] ytd-thumbnail img,
html[sf-yt-blur-thumbnails="true"] #thumbnail img,
html[sf-yt-blur-thumbnails="true"] yt-image img,
html[sf-yt-blur-thumbnails="true"] .yt-core-image {
    filter: blur(18px) !important;
}

html[sf-yt-hide-subscriptions="true"] .yt-simple-endpoint[href^="/feed/subscriptions"],
html[sf-yt-hide-subscriptions="true"] ytd-guide-entry-renderer a[href="/feed/subscriptions"],
html[sf-yt-hide-subscriptions="true"] ytd-mini-guide-entry-renderer a[href="/feed/subscriptions"],
html[sf-yt-hide-subscriptions="true"][sf-yt-authorized] #sections > ytd-guide-section-renderer:nth-child(2),
html[sf-yt-hide-subscriptions="true"] ytd-browse[page-subtype="subscriptions"] #contents {
    display: none !important;
}

html[sf-yt-hide-explore="true"] .yt-simple-endpoint[href^="/feed/explore"],
html[sf-yt-hide-explore="true"] ytd-guide-entry-renderer a[href="/feed/explore"],
html[sf-yt-hide-explore="true"] ytd-mini-guide-entry-renderer a[href="/feed/explore"],
html[sf-yt-hide-explore="true"] ytd-browse[page-subtype="explore"] #contents {
    display: none !important;
}

html[sf-yt-hide-top-bar="true"] ytd-masthead,
html[sf-yt-hide-top-bar="true"] #masthead-container,
html[sf-yt-hide-top-bar="true"] .mobile-topbar-header-background {
    display: none !important;
}

html[sf-yt-hide-top-bar="true"] ytd-page-manager {
    margin-top: 0 !important;
}

html[sf-yt-hide-cards="true"] .ytp-ce-element,
html[sf-yt-hide-cards="true"] .ytp-ce-covering-overlay,
html[sf-yt-hide-cards="true"] .html5-endscreen:not(.mweb-endscreen),
html[sf-yt-hide-cards="true"] .ytp-autonav-endscreen-countdown-container,
html[sf-yt-hide-cards="true"] .ytp-endscreen-content {
    display: none !important;
}

html[sf-yt-hide-autoplay="true"] .autonav-endscreen,
html[sf-yt-hide-autoplay="true"] button[data-tooltip-target-id="ytp-autonav-toggle-button"],
html[sf-yt-hide-autoplay="true"] ytd-watch-flexy:not([playlist]) .ytp-next-button {
    display: none !important;
}

html[sf-yt-black-white-mode="true"] {
    filter: grayscale(1) !important;
}
`;
let cachedSettings = { ...DEFAULT_YOUTUBE_SETTINGS };
let runtimeObserver = null;
let observedContainer = null;
let lastNavigationHref = location.href;
let adSkipperObserver = null;
let autoplayHunterIntervalId = null;
let autoplayHunterTimeoutId = null;
let theaterModeListenerAttached = false;
let theaterModeHandler = null;
let shortsPopstateHandler = null;
let shortsNavigateHandler = null;
let isExtensionActive = true;

function mergeYouTubeSettings(storedSettings = {}) {
    return { ...DEFAULT_YOUTUBE_SETTINGS, ...(storedSettings.youtube || {}) };
}

function debounce(callback, delay) {
    let timerId = null;

    return (...args) => {
        if (timerId) {
            clearTimeout(timerId);
        }

        timerId = setTimeout(() => {
            timerId = null;
            callback(...args);
        }, delay);
    };
}

function ensureStyleElement() {
    let styleEl = document.getElementById(STYLE_ID);
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = STYLE_ID;
        styleEl.textContent = STATIC_CSS;
        (document.head || document.documentElement).appendChild(styleEl);
    } else if (styleEl.textContent !== STATIC_CSS) {
        styleEl.textContent = STATIC_CSS;
    }

    return styleEl;
}

function clearSettingsHtmlAttributes() {
    Object.values(SETTING_ATTRIBUTE_MAP).forEach((attributeName) => {
        document.documentElement.removeAttribute(attributeName);
    });

    document.documentElement.removeAttribute('data-vmu-hide-shorts');
    document.documentElement.removeAttribute(AUTH_ATTRIBUTE);
}

function setBooleanHtmlAttribute(attributeName, enabled) {
    const nextValue = enabled ? 'true' : 'false';
    if (document.documentElement.getAttribute(attributeName) !== nextValue) {
        document.documentElement.setAttribute(attributeName, nextValue);
    }
}

function syncSettingsToHtmlAttributes(settings) {
    ensureStyleElement();

    Object.entries(SETTING_ATTRIBUTE_MAP).forEach(([settingKey, attributeName]) => {
        setBooleanHtmlAttribute(attributeName, Boolean(settings[settingKey]));
    });
}

function syncAuthorizedAttribute() {
    const isAuthorized = Boolean(document.querySelector('#avatar-btn'));
    const hasAttribute = document.documentElement.hasAttribute(AUTH_ATTRIBUTE);

    if (isAuthorized && !hasAttribute) {
        document.documentElement.setAttribute(AUTH_ATTRIBUTE, '');
    } else if (!isAuthorized && hasAttribute) {
        document.documentElement.removeAttribute(AUTH_ATTRIBUTE);
    }
}

function toggleElementVisibility(element, shouldHide) {
    if (!(element instanceof HTMLElement)) {
        return;
    }

    if (shouldHide) {
        if (!element.hasAttribute('data-antidoom-inline-display')) {
            element.setAttribute('data-antidoom-inline-display', element.style.display || '');
        }
        element.style.setProperty('display', 'none', 'important');
        return;
    }

    if (element.hasAttribute('data-antidoom-inline-display')) {
        const previousValue = element.getAttribute('data-antidoom-inline-display') || '';
        if (previousValue) {
            element.style.display = previousValue;
        } else {
            element.style.removeProperty('display');
        }
        element.removeAttribute('data-antidoom-inline-display');
    }
}

function hideShortsNavigationItems(shouldHide) {
    const guideEntries = document.querySelectorAll('ytd-guide-entry-renderer, tp-yt-paper-item');
    guideEntries.forEach((entry) => {
        const title = entry.querySelector('yt-formatted-string.title, .title')?.textContent?.trim().toLowerCase();
        if (title && SHORTS_TITLES.has(title)) {
            toggleElementVisibility(entry, shouldHide);
        }
    });

    const miniGuideEntries = document.querySelectorAll('ytd-mini-guide-entry-renderer');
    miniGuideEntries.forEach((entry) => {
        const title = entry.textContent?.trim().toLowerCase();
        if (title && SHORTS_TITLES.has(title)) {
            toggleElementVisibility(entry, shouldHide);
        }
    });
}

function getObserverTarget() {
    return (
        document.querySelector('#page-manager') ||
        document.querySelector('ytd-page-manager') ||
        document.querySelector('#content') ||
        document.querySelector('ytd-app')
    );
}

function enforceAutoDisableAutoplay() {
    if (autoplayHunterIntervalId) {
        clearInterval(autoplayHunterIntervalId);
        autoplayHunterIntervalId = null;
    }

    if (autoplayHunterTimeoutId) {
        clearTimeout(autoplayHunterTimeoutId);
        autoplayHunterTimeoutId = null;
    }

    // Hunted interval: keep searching until the autoplay control is safely off.
    autoplayHunterIntervalId = window.setInterval(() => {
        const enabledToggle = document.querySelector('.ytp-autonav-toggle-button[aria-checked="true"]');
        if (enabledToggle instanceof HTMLElement) {
            const clickTarget = enabledToggle.closest('button') || enabledToggle;
            clickTarget.click();
            return;
        }

        const disabledToggle = document.querySelector('.ytp-autonav-toggle-button[aria-checked="false"]');
        if (disabledToggle) {
            clearInterval(autoplayHunterIntervalId);
            autoplayHunterIntervalId = null;

            if (autoplayHunterTimeoutId) {
                clearTimeout(autoplayHunterTimeoutId);
                autoplayHunterTimeoutId = null;
            }
        }
    }, 1000);

    autoplayHunterTimeoutId = window.setTimeout(() => {
        if (autoplayHunterIntervalId) {
            clearInterval(autoplayHunterIntervalId);
            autoplayHunterIntervalId = null;
        }
        autoplayHunterTimeoutId = null;
    }, 15000);
}

function resetAutoplayHunter() {
    if (autoplayHunterIntervalId) {
        clearInterval(autoplayHunterIntervalId);
        autoplayHunterIntervalId = null;
    }

    if (autoplayHunterTimeoutId) {
        clearTimeout(autoplayHunterTimeoutId);
        autoplayHunterTimeoutId = null;
    }
}

function enforceTheaterMode() {
    if (!theaterModeHandler) {
        theaterModeHandler = () => {
        // Give Polymer time to finish drawing the watch page and controls.
            window.setTimeout(() => {
                const player = document.querySelector('ytd-watch-flexy');
                const theaterButton = document.querySelector('.ytp-size-button');

                if (!(player instanceof HTMLElement) || !(theaterButton instanceof HTMLElement)) {
                    return;
                }

                if (!player.hasAttribute('theater')) {
                    theaterButton.click();
                }
            }, 1200);
        };
    }

    // Run once on the initial hard load.
    theaterModeHandler();

    // Use YouTube's native SPA navigation event for subsequent route changes.
    if (!theaterModeListenerAttached) {
        document.addEventListener('yt-navigate-finish', theaterModeHandler);
        theaterModeListenerAttached = true;
    }
}

function resetTheaterModeObserver() {
    if (theaterModeListenerAttached && theaterModeHandler) {
        document.removeEventListener('yt-navigate-finish', theaterModeHandler);
        theaterModeListenerAttached = false;
    }
}

function disableYouTubeFeatures() {
    cachedSettings = { ...DEFAULT_YOUTUBE_SETTINGS };
    clearSettingsHtmlAttributes();
    hideShortsNavigationItems(false);
    resetAutoplayHunter();
    resetTheaterModeObserver();
    enforceShortsWipeout(false);
    toggleAdSkipper(false);

    if (runtimeObserver) {
        runtimeObserver.disconnect();
        runtimeObserver = null;
    }

    observedContainer = null;

    const styleEl = document.getElementById(STYLE_ID);
    if (styleEl) {
        styleEl.remove();
    }
}

function enforceShortsWipeout(isActive) {
    const updateShortsAttribute = (enabled) => {
        const nextValue = enabled ? 'true' : 'false';
        if (document.documentElement.getAttribute('data-vmu-hide-shorts') !== nextValue) {
            document.documentElement.setAttribute('data-vmu-hide-shorts', nextValue);
        }
    };

    const redirectIfShortsPage = () => {
        if (!window.location.pathname.startsWith('/shorts/')) {
            return;
        }

        const redirectedUrl = window.location.href.replace('/shorts/', '/watch?v=');
        if (redirectedUrl !== window.location.href) {
            // Replace avoids adding a noisy shorts page entry into browser history.
            window.location.replace(redirectedUrl);
        }
    };

    if (!isActive) {
        updateShortsAttribute(false);

        if (shortsPopstateHandler) {
            window.removeEventListener('popstate', shortsPopstateHandler);
            shortsPopstateHandler = null;
        }

        if (shortsNavigateHandler) {
            document.removeEventListener('yt-navigate-finish', shortsNavigateHandler);
            shortsNavigateHandler = null;
        }

        return;
    }

    updateShortsAttribute(true);

    if (!shortsPopstateHandler) {
        shortsPopstateHandler = () => {
            updateShortsAttribute(true);
            redirectIfShortsPage();
        };
        window.addEventListener('popstate', shortsPopstateHandler);
    }

    if (!shortsNavigateHandler) {
        shortsNavigateHandler = () => {
            updateShortsAttribute(true);
            redirectIfShortsPage();
        };
        document.addEventListener('yt-navigate-finish', shortsNavigateHandler);
    }

    redirectIfShortsPage();
}

function initYouTubeFeatures(settings) {
    if (settings.disableAutoplay) {
        enforceAutoDisableAutoplay();
    } else {
        resetAutoplayHunter();
    }

    if (settings.enableTheaterMode) {
        enforceTheaterMode();
    } else {
        resetTheaterModeObserver();
    }

    enforceShortsWipeout(Boolean(settings.hideShorts));
}

function toggleAdSkipper(isActive) {
    const cleanupPlayer = () => {
        const player = document.querySelector('.html5-video-player');
        if (!(player instanceof HTMLElement)) {
            return;
        }

        player.style.opacity = '1';
    };

    const handleAdMutation = () => {
        const player = document.querySelector('.html5-video-player.ad-showing');
        if (!(player instanceof HTMLElement)) {
            cleanupPlayer();
            return;
        }

        const video = player.querySelector('video.html5-main-video, video');
        if (video instanceof HTMLVideoElement) {
            // Mute first to prevent an audio burst before the ad is skipped.
            video.muted = true;
            player.style.opacity = '0';
            video.playbackRate = 16;
            video.currentTime = video.duration && !Number.isNaN(video.duration) ? video.duration : 9999;
        }

        const skipButton = player.querySelector(
            '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-text.ytp-ad-skip-button-text'
        );

        if (!(skipButton instanceof HTMLElement)) {
            return;
        }

        const clickTarget = skipButton.closest('button') || skipButton;
        clickTarget.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
        }));
    };

    if (!isActive) {
        if (adSkipperObserver) {
            adSkipperObserver.disconnect();
            adSkipperObserver = null;
        }

        cleanupPlayer();
        return;
    }

    if (adSkipperObserver) {
        adSkipperObserver.disconnect();
        adSkipperObserver = null;
    }

    if (!document.body) {
        return;
    }

    adSkipperObserver = new MutationObserver(() => {
        handleAdMutation();
    });

    adSkipperObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
    });

    handleAdMutation();
}

function applyRuntimeDomEffects() {
    if (!isExtensionActive) {
        return;
    }

    syncAuthorizedAttribute();
    hideShortsNavigationItems(cachedSettings.hideShorts);
}

const scheduleRuntimeDomEffects = debounce(() => {
    observeRuntimeContainer();
    applyRuntimeDomEffects();
}, 200);

function observeRuntimeContainer() {
    if (!isExtensionActive) {
        return;
    }

    const nextContainer = getObserverTarget();

    if (!nextContainer || nextContainer === observedContainer) {
        return;
    }

    if (runtimeObserver) {
        runtimeObserver.disconnect();
    }

    // Observe the smallest stable SPA container we can find instead of the whole body.
    runtimeObserver = new MutationObserver((mutations) => {
        const shouldSchedule = mutations.some((mutation) => (
            mutation.type === 'childList' &&
            (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)
        ));

        if (shouldSchedule) {
            scheduleRuntimeDomEffects();
        }
    });

    runtimeObserver.observe(nextContainer, {
        childList: true,
        subtree: true,
    });

    observedContainer = nextContainer;
}

function applySettings(settings) {
    if (!isExtensionActive) {
        disableYouTubeFeatures();
        return;
    }

    cachedSettings = settings;
    syncSettingsToHtmlAttributes(settings);
    initYouTubeFeatures(settings);
    toggleAdSkipper(settings.autoSkipVideoAds);
    scheduleRuntimeDomEffects();
}

function loadAndApplySettings() {
    chrome.storage.sync.get([STORAGE_KEY, EXTENSION_ACTIVE_KEY], (data) => {
        isExtensionActive = data?.[EXTENSION_ACTIVE_KEY] !== false;
        if (!isExtensionActive) {
            disableYouTubeFeatures();
            return;
        }

        applySettings(mergeYouTubeSettings(data[STORAGE_KEY]));
    });
}

function handleNavigationEvent() {
    if (!isExtensionActive) {
        return;
    }

    if (lastNavigationHref === location.href) {
        observeRuntimeContainer();
        initYouTubeFeatures(cachedSettings);
        scheduleRuntimeDomEffects();
        return;
    }

    lastNavigationHref = location.href;
    observedContainer = null;
    observeRuntimeContainer();
    initYouTubeFeatures(cachedSettings);
    scheduleRuntimeDomEffects();
}

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && (changes[STORAGE_KEY] || changes[EXTENSION_ACTIVE_KEY])) {
        loadAndApplySettings();
    }
});

chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'inapp-settings-updated' && message.platform === 'youtube') {
        loadAndApplySettings();
    }
});

document.addEventListener('yt-navigate-finish', handleNavigationEvent);
window.addEventListener('popstate', handleNavigationEvent);
window.addEventListener('load', () => {
    observeRuntimeContainer();
    loadAndApplySettings();
});

if ('navigation' in window && typeof window.navigation.addEventListener === 'function') {
    window.navigation.addEventListener('navigate', () => {
        window.requestAnimationFrame(handleNavigationEvent);
    });
}

ensureStyleElement();
observeRuntimeContainer();
loadAndApplySettings();
