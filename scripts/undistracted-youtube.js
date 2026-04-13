'use strict';
/* global chrome */

const STORAGE_KEY = 'inAppBlockingSettings';
const EXTENSION_ACTIVE_KEY = 'isExtensionActive';
const STYLE_ID = 'antidoom-yt-attribute-style';
const AUTH_ATTRIBUTE = 'sf-yt-authorized';
const DEFAULT_YOUTUBE_SETTINGS = {
    masterYtPlayer: true,
    masterYtWatch: true,
    masterYtShorts: true,
    masterYtThumbnails: true,
    masterYtNav: true,
    masterYtAppearance: true,
    masterYtSearch: true,
    masterYtFilter: true,
    masterYtMisc: true,
    masterYtFuture: true,
    disableAutoplay: false,
    autoSkipVideoAds: false,
    enableTheaterMode: false,
    autoShowChapters: false,
    hideRecommendedVideos: false,
    centerWatchContent: false,
    autoExpandDescription: false,
    hideComments: false,
    disableEndCards: false,
    hideShorts: false,
    redirectShortsToWatch: false,
    hideThumbnails: false,
    blurThumbnails: false,
    blackWhiteMode: false,
    grayscaleMode: false,
    hideHomePage: false,
    hideSubscriptions: false,
    hideExplore: false,
    hideTopBar: false,
    sidebarAutoCollapse: false,
    sidebarAutoExpandPlaylists: false,
    sidebarAutoExpandSubscriptions: false,
    filterVideosEnabled: false,
    filterVideosKeywords: '',
    filterChannelsEnabled: false,
    filterChannelsList: '',
    contextMenuBlockEnabled: false,
    searchSortBy: '',
    hideSearchAdsPlanned: false,
    replaceThumbnailPlanned: false,
    shortsSlowScrollPlanned: false,
    hideNavCustomizationPlanned: false,
    openingTimerEnabled: false,
    openingTimerValue: 0,
    openingTimerUnit: 'seconds',
};

const YOUTUBE_MASTER_CHILDREN = {
    masterYtPlayer: ['disableAutoplay', 'autoSkipVideoAds', 'enableTheaterMode', 'autoShowChapters'],
    masterYtWatch: ['hideRecommendedVideos', 'centerWatchContent', 'autoExpandDescription', 'hideComments', 'disableEndCards'],
    masterYtShorts: ['hideShorts', 'redirectShortsToWatch'],
    masterYtThumbnails: ['hideThumbnails', 'blurThumbnails', 'blackWhiteMode', 'grayscaleMode'],
    masterYtNav: ['hideHomePage', 'hideSubscriptions', 'hideExplore', 'hideTopBar'],
    masterYtAppearance: ['sidebarAutoCollapse', 'sidebarAutoExpandPlaylists', 'sidebarAutoExpandSubscriptions'],
    masterYtSearch: ['hideSearchAdsPlanned', 'searchSortBy'],
    masterYtFilter: ['filterVideosEnabled', 'filterChannelsEnabled', 'contextMenuBlockEnabled'],
    masterYtMisc: ['openingTimerEnabled', 'openingTimerValue', 'openingTimerUnit'],
    masterYtFuture: ['replaceThumbnailPlanned', 'shortsSlowScrollPlanned', 'hideNavCustomizationPlanned'],
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
    hideSearchAdsPlanned: 'sf-yt-hide-search-ads-planned',
};

const CONTENT_FILTER_TAGS = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-rich-grid-slim-media',
    'ytd-reel-item-renderer',
    'ytd-compact-video-renderer',
    'ytd-playlist-renderer',
    'ytd-playlist-video-renderer',
    'ytd-reel-video-renderer',
    'ytd-channel-renderer',
    'ytd-radio-renderer',
    'ytd-universal-watch-card-renderer',
    'yt-lockup-view-model',
];
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
html[sf-yt-hide-explore="true"] .yt-simple-endpoint[href="/feed/trending"],
html[sf-yt-hide-explore="true"] .yt-simple-endpoint[href^="/feed/trending?"],
html[sf-yt-hide-explore="true"] ytd-guide-entry-renderer a[href="/feed/explore"],
html[sf-yt-hide-explore="true"] ytd-guide-entry-renderer a[href="/feed/trending"],
html[sf-yt-hide-explore="true"] ytd-mini-guide-entry-renderer a[href="/feed/explore"],
html[sf-yt-hide-explore="true"] ytd-mini-guide-entry-renderer a[href="/feed/trending"],
html[sf-yt-hide-explore="true"] ytd-browse[role="main"][page-subtype="explore"] #primary,
html[sf-yt-hide-explore="true"] ytd-page-manager ytd-browse[page-subtype="explore"] ytd-rich-grid-renderer,
html[sf-yt-hide-explore="true"] ytd-page-manager ytd-browse[page-subtype="explore"] #contents,
html[sf-yt-hide-explore="true"] ytd-page-manager ytd-browse[page-subtype="explore"] #primary,
html[sf-yt-hide-explore="true"] ytd-two-column-browse-results-renderer[page-subtype="explore"] #primary,
html[sf-yt-hide-explore="true"] ytd-two-column-browse-results-renderer[page-subtype="explore"] #contents,
html[sf-yt-hide-explore="true"] ytd-browse[role="main"][page-subtype="trending"] #primary,
html[sf-yt-hide-explore="true"] ytd-page-manager ytd-browse[page-subtype="trending"] ytd-rich-grid-renderer,
html[sf-yt-hide-explore="true"] ytd-page-manager ytd-browse[page-subtype="trending"] #contents,
html[sf-yt-hide-explore="true"] ytd-page-manager ytd-browse[page-subtype="trending"] #primary,
html[sf-yt-hide-explore="true"] ytd-two-column-browse-results-renderer[page-subtype="trending"] #primary,
html[sf-yt-hide-explore="true"] ytd-two-column-browse-results-renderer[page-subtype="trending"] #contents {
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

html[sf-yt-center-watch="true"] ytd-watch-flexy #columns.ytd-watch-flexy,
html[sf-yt-center-watch="true"] ytd-watch-flexy #primary.ytd-watch-flexy {
    margin-left: auto !important;
    margin-right: auto !important;
    max-width: min(1080px, 100%) !important;
}

html[sf-yt-hide-search-ads-planned="true"] ytd-search-pyv-renderer,
html[sf-yt-hide-search-ads-planned="true"] ytd-ad-slot-renderer,
html[sf-yt-hide-search-ads-planned="true"] ytd-in-feed-ad-layout-renderer {
    display: none !important;
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
let shortsRedirectHandler = null;
let descriptionObserver = null;
let filterObserver = null;
let filterDebounceTimer = null;
let contextObserver = null;
let sidebarGuideObserver = null;
let sidebarTickTimer = null;
const FILTER_CHECKED_ATTR = 'data-sf-yt-filter-checked';
let isExtensionActive = true;

function mergeYouTubeSettings(storedSettings = {}) {
    return { ...DEFAULT_YOUTUBE_SETTINGS, ...(storedSettings.youtube || {}) };
}

function resolveYoutubeForRuntime(settings) {
    const out = { ...settings };
    Object.entries(YOUTUBE_MASTER_CHILDREN).forEach(([masterKey, keys]) => {
        if (settings[masterKey] !== false) {
            return;
        }
        keys.forEach((k) => {
            if (k === 'searchSortBy') {
                out[k] = '';
            } else if (k === 'openingTimerUnit') {
                out[k] = 'seconds';
            } else if (k === 'openingTimerValue') {
                out[k] = 0;
            } else if (typeof DEFAULT_YOUTUBE_SETTINGS[k] === 'boolean') {
                out[k] = false;
            }
        });
    });
    return out;
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
    document.documentElement.removeAttribute('sf-yt-center-watch');

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
        if (settingKey === 'blackWhiteMode') {
            setBooleanHtmlAttribute(
                attributeName,
                Boolean(settings.blackWhiteMode || settings.grayscaleMode),
            );
            return;
        }
        setBooleanHtmlAttribute(attributeName, Boolean(settings[settingKey]));
    });

    const centerOn = Boolean(settings.centerWatchContent && settings.hideRecommendedVideos);
    setBooleanHtmlAttribute('sf-yt-center-watch', centerOn);
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

function getEffectiveYoutubeSettings() {
    return resolveYoutubeForRuntime(cachedSettings);
}

function teardownAuxiliaryObservers() {
    if (descriptionObserver) {
        descriptionObserver.disconnect();
        descriptionObserver = null;
    }
    if (filterObserver) {
        filterObserver.disconnect();
        filterObserver = null;
    }
    if (filterDebounceTimer) {
        window.clearTimeout(filterDebounceTimer);
        filterDebounceTimer = null;
    }
    if (contextObserver) {
        contextObserver.disconnect();
        contextObserver = null;
    }
    if (sidebarGuideObserver) {
        sidebarGuideObserver.disconnect();
        sidebarGuideObserver = null;
    }
    if (sidebarTickTimer) {
        window.clearInterval(sidebarTickTimer);
        sidebarTickTimer = null;
    }
    document.querySelectorAll(`[${FILTER_CHECKED_ATTR}]`).forEach((el) => {
        el.removeAttribute(FILTER_CHECKED_ATTR);
        if (el instanceof HTMLElement) {
            el.style.removeProperty('display');
        }
    });
}

function tryClickDescriptionExpand() {
    const btn = document.querySelector('tp-yt-paper-button#expand:not([hidden])');
    if (btn instanceof HTMLElement) {
        btn.click();
        return true;
    }
    return false;
}

function setupAutoExpandDescription(settings) {
    if (!settings.autoExpandDescription) {
        return;
    }
    if (tryClickDescriptionExpand()) {
        return;
    }
    if (descriptionObserver) {
        descriptionObserver.disconnect();
    }
    descriptionObserver = new MutationObserver(() => {
        if (tryClickDescriptionExpand()) {
            descriptionObserver.disconnect();
            descriptionObserver = null;
        }
    });
    descriptionObserver.observe(document.body, { childList: true, subtree: true, attributes: true });
    window.setTimeout(() => {
        if (descriptionObserver) {
            descriptionObserver.disconnect();
            descriptionObserver = null;
        }
    }, 8000);
}

function setupAutoShowChapters(settings) {
    if (!settings.autoShowChapters) {
        return;
    }
    document.querySelectorAll(
        'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-macro-markers-auto-chapters"][hide],'
        + ' ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-macro-markers-description-chapters"][hide]',
    ).forEach((p) => {
        p.removeAttribute('hide');
    });
}

function parseFilterLines(raw) {
    if (typeof raw !== 'string' || !raw.trim()) {
        return [];
    }
    const seen = new Set();
    const out = [];
    raw.split(/\r?\n/).forEach((line) => {
        const t = line.trim();
        if (t && !seen.has(t)) {
            seen.add(t);
            out.push(t);
        }
    });
    return out;
}

function filterCardForRules(element, videoRules, channelRules) {
    const itemText = element.textContent || '';
    for (let i = 0; i < videoRules.length; i += 1) {
        const rule = videoRules[i];
        if (rule.length < 2) {
            continue;
        }
        const esc = rule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rx = new RegExp(esc, 'gi');
        if (rx.test(itemText)) {
            element.style.setProperty('display', 'none', 'important');
            return;
        }
    }
    for (let j = 0; j < channelRules.length; j += 1) {
        const rule = channelRules[j];
        if (rule.length < 2) {
            continue;
        }
        const esc = rule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        try {
            const nodes = element.querySelectorAll(`a[href*="${esc}" i], [aria-label*="${esc}" i]`);
            if (nodes.length > 0) {
                element.style.setProperty('display', 'none', 'important');
                return;
            }
        } catch {
            /* invalid selector — skip */
        }
    }
}

function runContentFilterScan() {
    const settings = getEffectiveYoutubeSettings();
    const videoOn = Boolean(settings.filterVideosEnabled);
    const channelOn = Boolean(settings.filterChannelsEnabled);
    if (!videoOn && !channelOn) {
        return;
    }
    const videoRules = videoOn ? parseFilterLines(settings.filterVideosKeywords || '') : [];
    const channelRules = channelOn ? parseFilterLines(settings.filterChannelsList || '') : [];
    if (videoRules.length === 0 && channelRules.length === 0) {
        return;
    }
    const selector = CONTENT_FILTER_TAGS.map((tag) => `${tag}:not([${FILTER_CHECKED_ATTR}])`).join(', ');
    document.querySelectorAll(selector).forEach((element) => {
        if (!(element instanceof HTMLElement)) {
            return;
        }
        const tag = element.tagName.toLowerCase();
        const isCardLike = (
            (element.querySelector('#thumbnail') || tag === 'ytd-channel-renderer')
            && tag !== 'ytd-watch-metadata'
        ) || tag === 'ytd-rich-item-renderer' || tag === 'yt-lockup-view-model';
        if (!isCardLike) {
            return;
        }
        filterCardForRules(element, videoRules, channelRules);
        element.setAttribute(FILTER_CHECKED_ATTR, '1');
    });
}

function scheduleContentFilterScan() {
    const settings = getEffectiveYoutubeSettings();
    const videoOn = Boolean(settings.filterVideosEnabled);
    const channelOn = Boolean(settings.filterChannelsEnabled);
    if (!videoOn && !channelOn) {
        return;
    }
    if (filterDebounceTimer) {
        window.clearTimeout(filterDebounceTimer);
    }
    filterDebounceTimer = window.setTimeout(() => {
        filterDebounceTimer = null;
        runContentFilterScan();
    }, 200);
}

function setupContentFilter(settings) {
    if (filterObserver) {
        filterObserver.disconnect();
        filterObserver = null;
    }
    const videoOn = Boolean(settings.filterVideosEnabled);
    const channelOn = Boolean(settings.filterChannelsEnabled);
    if (!videoOn && !channelOn) {
        return;
    }
    if (!document.body) {
        return;
    }
    filterObserver = new MutationObserver(() => {
        scheduleContentFilterScan();
    });
    filterObserver.observe(document.body, { childList: true, subtree: true });
    runContentFilterScan();
}

function appendContextBlockButton(itemsRoot, label, onActivate) {
    if (!itemsRoot || itemsRoot.querySelector(`[data-sf-yt-ctx="${label}"]`)) {
        return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'style-scope ytd-menu-service-item-renderer';
    wrap.setAttribute('data-sf-yt-ctx', label);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'yt-simple-endpoint style-scope yt-formatted-string';
    btn.style.cssText = 'display:block;width:100%;padding:10px 16px;text-align:left;font-size:13px;';
    btn.textContent = label;
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onActivate();
    });
    wrap.appendChild(btn);
    itemsRoot.appendChild(wrap);
}

function setupContextMenuBlock(settings) {
    if (contextObserver) {
        contextObserver.disconnect();
        contextObserver = null;
    }
    if (!settings.contextMenuBlockEnabled) {
        return;
    }
    const tryInject = () => {
        const items = document.querySelector('ytd-menu-popup-renderer #items')
            || document.querySelector('yt-sheet-view-model .ytListViewModelHost');
        if (!(items instanceof HTMLElement)) {
            return;
        }
        appendContextBlockButton(items, 'SF: block this channel', () => {
            const href = window.location.href;
            chrome.storage.sync.get([STORAGE_KEY], (data) => {
                const merged = mergeYouTubeSettings(data[STORAGE_KEY] || {});
                const lines = parseFilterLines(merged.filterChannelsList || '');
                if (!lines.includes(href)) {
                    lines.unshift(href);
                }
                merged.filterChannelsList = lines.join('\n');
                merged.filterChannelsEnabled = true;
                chrome.storage.sync.set({
                    [STORAGE_KEY]: {
                        ...(data[STORAGE_KEY] || {}),
                        youtube: merged,
                    },
                });
            });
        });
        appendContextBlockButton(items, 'SF: block this video title', () => {
            const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, ytd-watch-metadata h1 yt-formatted-string');
            const title = (titleEl && titleEl.textContent) ? titleEl.textContent.trim() : '';
            if (!title) {
                return;
            }
            chrome.storage.sync.get([STORAGE_KEY], (data) => {
                const merged = mergeYouTubeSettings(data[STORAGE_KEY] || {});
                const lines = parseFilterLines(merged.filterVideosKeywords || '');
                if (!lines.includes(title)) {
                    lines.unshift(title);
                }
                merged.filterVideosKeywords = lines.join('\n');
                merged.filterVideosEnabled = true;
                chrome.storage.sync.set({
                    [STORAGE_KEY]: {
                        ...(data[STORAGE_KEY] || {}),
                        youtube: merged,
                    },
                });
            });
        });
    };
    contextObserver = new MutationObserver(() => {
        tryInject();
    });
    if (document.body) {
        contextObserver.observe(document.body, { childList: true, subtree: true });
    }
    tryInject();
}

function tryCollapseGuide() {
    const app = document.querySelector('ytd-app[guide-persistent-and-visible]');
    if (!(app instanceof HTMLElement)) {
        return;
    }
    const burger = document.querySelector('ytd-app[guide-persistent-and-visible] #masthead #guide-button');
    if (burger instanceof HTMLElement) {
        burger.click();
    }
}

function tryExpandGuideSection(selector) {
    const btn = document.querySelector(selector);
    if (btn instanceof HTMLElement) {
        btn.click();
    }
}

function setupSidebarAppearance(settings) {
    if (sidebarGuideObserver) {
        sidebarGuideObserver.disconnect();
        sidebarGuideObserver = null;
    }
    if (sidebarTickTimer) {
        window.clearInterval(sidebarTickTimer);
        sidebarTickTimer = null;
    }
    const any = settings.sidebarAutoCollapse || settings.sidebarAutoExpandPlaylists || settings.sidebarAutoExpandSubscriptions;
    if (!any) {
        return;
    }
    if (settings.sidebarAutoCollapse) {
        tryCollapseGuide();
        sidebarGuideObserver = new MutationObserver(() => {
            tryCollapseGuide();
        });
        if (document.body) {
            sidebarGuideObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['guide-persistent-and-visible'] });
        }
    }
    sidebarTickTimer = window.setInterval(() => {
        if (settings.sidebarAutoExpandPlaylists) {
            tryExpandGuideSection(
                "tp-yt-app-drawer#guide #sections #items ytd-guide-collapsible-section-entry-renderer:has(a[href*='feed/you']) #expander-item",
            );
        }
        if (settings.sidebarAutoExpandSubscriptions) {
            tryExpandGuideSection(
                'tp-yt-app-drawer#guide #sections #items ytd-guide-section-renderer:nth-child(2) #expander-item',
            );
        }
    }, 2500);
}

function getSearchSortSp(sortBy) {
    if (sortBy === 'uploadDate') {
        return 'EgIIBQ';
    }
    if (sortBy === 'viewCount') {
        return 'CAM';
    }
    if (sortBy === 'rating') {
        return 'CAE';
    }
    return null;
}

function tryApplySearchSort(settings) {
    const sortBy = settings.searchSortBy;
    if (!sortBy || sortBy === 'relevance') {
        return;
    }
    const spValue = getSearchSortSp(sortBy);
    if (!spValue) {
        return;
    }
    let url;
    try {
        url = new URL(window.location.href);
    } catch {
        return;
    }
    if (url.hostname.replace(/^www\./, '') !== 'youtube.com' || url.pathname !== '/results') {
        return;
    }
    if (!url.searchParams.get('search_query')) {
        return;
    }
    const currentSp = (url.searchParams.get('sp') || '').replace(/=+$/g, '');
    if (currentSp === spValue) {
        return;
    }
    const guardKey = '__sf_yt_search_sort__';
    const guardVal = `${spValue}::${url.searchParams.get('search_query')}`;
    if (sessionStorage.getItem(guardKey) === guardVal) {
        return;
    }
    sessionStorage.setItem(guardKey, guardVal);
    url.searchParams.set('sp', spValue);
    window.location.replace(url.toString());
}

function maybeRedirectShortsToWatch(settings) {
    if (!settings.redirectShortsToWatch) {
        return;
    }
    const m = window.location.pathname.match(/^\/shorts\/([^/?#]+)/);
    if (!m) {
        return;
    }
    const id = m[1];
    const target = `${window.location.origin}/watch?v=${encodeURIComponent(id)}`;
    if (window.location.href.split('#')[0] !== target) {
        window.location.replace(target);
    }
}

function setupShortsDomAndRedirect(settings) {
    if (shortsPopstateHandler) {
        window.removeEventListener('popstate', shortsPopstateHandler);
        shortsPopstateHandler = null;
    }
    if (shortsNavigateHandler) {
        document.removeEventListener('yt-navigate-finish', shortsNavigateHandler);
        shortsNavigateHandler = null;
    }
    if (shortsRedirectHandler) {
        window.removeEventListener('popstate', shortsRedirectHandler);
        document.removeEventListener('yt-navigate-finish', shortsRedirectHandler);
        shortsRedirectHandler = null;
    }

    const hideShorts = Boolean(settings.hideShorts);
    const redirectOn = Boolean(settings.redirectShortsToWatch);

    if (redirectOn) {
        shortsRedirectHandler = () => {
            maybeRedirectShortsToWatch(resolveYoutubeForRuntime(cachedSettings));
        };
        window.addEventListener('popstate', shortsRedirectHandler);
        document.addEventListener('yt-navigate-finish', shortsRedirectHandler);
        maybeRedirectShortsToWatch(settings);
    }

    if (hideShorts) {
        shortsPopstateHandler = () => {
            hideShortsNavigationItems(Boolean(resolveYoutubeForRuntime(cachedSettings).hideShorts));
        };
        window.addEventListener('popstate', shortsPopstateHandler);
        shortsNavigateHandler = () => {
            hideShortsNavigationItems(Boolean(resolveYoutubeForRuntime(cachedSettings).hideShorts));
        };
        document.addEventListener('yt-navigate-finish', shortsNavigateHandler);
    }
}

function disableYouTubeFeatures() {
    teardownAuxiliaryObservers();
    cachedSettings = { ...DEFAULT_YOUTUBE_SETTINGS };
    clearSettingsHtmlAttributes();
    hideShortsNavigationItems(false);
    resetAutoplayHunter();
    resetTheaterModeObserver();
    setupShortsDomAndRedirect(resolveYoutubeForRuntime(cachedSettings));
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

    setupShortsDomAndRedirect(settings);
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
    hideShortsNavigationItems(Boolean(getEffectiveYoutubeSettings().hideShorts));
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
    const resolved = resolveYoutubeForRuntime(settings);
    syncSettingsToHtmlAttributes(resolved);
    initYouTubeFeatures(resolved);
    toggleAdSkipper(Boolean(resolved.autoSkipVideoAds));
    setupAutoExpandDescription(resolved);
    setupAutoShowChapters(resolved);
    setupContentFilter(resolved);
    setupContextMenuBlock(resolved);
    setupSidebarAppearance(resolved);
    tryApplySearchSort(resolved);
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

    const resolved = resolveYoutubeForRuntime(cachedSettings);

    if (lastNavigationHref === location.href) {
        observeRuntimeContainer();
        initYouTubeFeatures(resolved);
        setupAutoExpandDescription(resolved);
        setupAutoShowChapters(resolved);
        scheduleContentFilterScan();
        tryApplySearchSort(resolved);
        scheduleRuntimeDomEffects();
        return;
    }

    lastNavigationHref = location.href;
    observedContainer = null;
    observeRuntimeContainer();
    initYouTubeFeatures(resolved);
    setupAutoExpandDescription(resolved);
    setupAutoShowChapters(resolved);
    scheduleContentFilterScan();
    tryApplySearchSort(resolved);
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
