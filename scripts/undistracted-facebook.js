'use strict';
/* global chrome */

// #region agent log
fetch('http://127.0.0.1:7371/ingest/7634893a-f87f-456c-8e21-990ad9d66e04',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'71e079'},body:JSON.stringify({sessionId:'71e079',runId:'run3',hypothesisId:'H0',location:'undistracted-facebook.js:bootstrap',message:'facebook content script loaded',data:{href:location.href},timestamp:Date.now()})}).catch(()=>{});
// #endregion

const STORAGE_KEY = 'inAppBlockingSettings';
const EXTENSION_ACTIVE_KEY = 'isExtensionActive';
const ARTICLE_SELECTOR = '[role="article"]';
const HIDDEN_FLAG = 'data-fb-sponsored-hidden';
const PROCESSED_FLAG = 'data-fb-sponsored-checked';
const FEED_HIDDEN_FLAG = 'data-fb-feed-hidden';
const MAX_SCAN_TEXT_LENGTH = 6000;
const SAFE_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK']);
const SPONSORED_KEYWORDS = [
    'sponsored',
    'được tài trợ',
    'duoc tai tro',
    'quảng cáo',
    'quang cao',
    'sponsorisé',
    'patrocinado',
    'gesponsert',
    'sponsorizzato',
];
const TRACKER_PATTERNS = ['/ads/about/', '__tn__', 'ad_id=', 'adset_id=', '/business/help/'];
const PROFILE_UPDATE_KEYWORDS = [
    'cập nhật ảnh đại diện',
    'cập nhật ảnh bìa',
    'đã cập nhật ảnh đại diện',
    'đã cập nhật ảnh bìa',
    'updated their profile picture',
    'updated his profile picture',
    'updated her profile picture',
    'updated their cover photo',
    'updated his cover photo',
    'updated her cover photo',
    'updated their status',
    'updated his status',
    'updated her status',
];
const PRODUCT_SHOWN_KEYWORDS = [
    'sản phẩm được hiển thị',
    'sản phẩm',
    'products shown',
];
const TRENDING_KEYWORDS = ['đang thịnh hành', 'thịnh hành', 'trending'];
const LINK_INTERACTION_PATTERNS = [
    /\bthích\s+(một\s+)?liên kết\b/i,
    /\bchia sẻ\s+(một\s+)?liên kết\b/i,
    /\bbình luận về (liên kết|điều này|trang)\b/i,
    /\bthích\s+trang(\s+này)?\b/i,
    /\bliked?\s+a\s+link\b/i,
    /\bshared?\s+a\s+link\b/i,
    /\bcommented on (a link|this|a page)\b/i,
    /\blikes?\s+a\s+page\b/i,
    /\bliked?\s+this\b/i,
];
const LIKE_PAGE_PATTERNS = [
    /\bthích trang\b/i,
    /\blike page\b/i,
    /\bfollow page\b/i,
];
const SHARED_PHOTO_ALBUM_PATTERNS = [
    /\bchia sẻ (một )?(ảnh|album ảnh)\b/i,
    /\bshared? (a )?(photo|album)\b/i,
];
const UPDATED_PROFILE_PHOTO_PATTERNS = [
    /\bcập nhật ảnh (đại diện|bìa)\b/i,
    /\bđã cập nhật ảnh (đại diện|bìa)\b/i,
    /\bupdated (their|his|her) (profile picture|cover photo)\b/i,
];
const UPLOADED_PHOTO_PATTERNS = [
    /\bđã tải ảnh lên\b/i,
    /\btải lên (một )?ảnh\b/i,
    /\buploaded (a )?photo\b/i,
    /\badded new photos?\b/i,
];
const PHOTO_3D_PATTERNS = [
    /\bảnh 3d\b/i,
    /\b3d photo\b/i,
];
const LIKED_PHOTO_PATTERNS = [
    /\bthích (một )?ảnh\b/i,
    /\bliked? (a )?photo\b/i,
];
const COMMENTED_PHOTO_PATTERNS = [
    /\bbình luận về (một )?ảnh\b/i,
    /\bcommented on (a )?photo\b/i,
];
const LIVE_VIDEO_PATTERNS = [
    /\btrực tiếp( ngay bây giờ)?\b/i,
    /\bđã phát trực tiếp\b/i,
    /\bis live now\b/i,
    /\bwas live\b/i,
];
const VIDEO_INTERACTION_PATTERNS = [
    /\b(thích|chia sẻ|bình luận về)(.*?)video\b/i,
    /\b(liked|shared|commented on)(.*?)video\b/i,
];
const REELS_LABELS = [
    'reels',
    'reels và video ngắn',
    'reels and short videos',
];
const SUGGESTED_KEYWORDS = [
    'gợi ý cho bạn',
    'có thể bạn thích',
    'bạn bè gợi ý',
    'trang gợi ý',
    'suggested for you',
    'people you may know',
    'groups you might be interested in',
];
const SPONSORED_LABELS = ['được tài trợ', 'sponsored'];
const DEBUG_MODE = false;
const RIGHT_COL_SCAN_INTERVAL_MS = 2500;
const RIGHT_COL_HIDDEN_FLAG = 'data-fb-rightcol-hidden';
const LEFT_COL_SCAN_INTERVAL_MS = 3500;
const LEFT_COL_HIDDEN_FLAG = 'data-fb-leftcol-hidden';
const TOP_NAV_STYLE_ID = 'purify-topnav-styles';
const QUICK_LOGOUT_ID = 'quick-logout-btn';
const RIGHT_COL_WIDGET_DICTIONARIES = {
    birthdays: ['sinh nhật', 'birthdays', 'birthday'],
    friendRequests: ['yêu cầu kết bạn', 'friend requests'],
    yourPages: ['trang của bạn', 'trang và trang cá nhân', 'your pages', 'your profiles'],
    recommendedPages: ['gợi ý trang', 'trang gợi ý', 'recommended pages', 'suggested pages'],
    suggestedGroups: ['nhóm gợi ý', 'suggested groups', 'groups you might'],
    events: ['sự kiện', 'đang diễn ra', 'events', 'happening now'],
    gamesAndApps: ['trò chơi', 'games', 'game requests', 'ứng dụng', 'app requests'],
    marketplace: ['marketplace', 'chợ'],
    pokes: ['chọc', 'pokes'],
    watch: ['watch', 'video đề xuất', 'suggested videos'],
};
const LEFT_NAV_DICTIONARY = {
    pages: ['/pages/', '/bookmarks/pages/'],
    groups: ['/groups/', '/bookmarks/groups/'],
    watch: ['/watch/'],
    marketplace: ['/marketplace/'],
    memories: ['/memories/', '/onthisday/'],
    saved: ['/saved/'],
    events: ['/events/'],
    gaming: ['/gaming/', '/games/'],
    adsManager: ['/ad_center/', '/adsmanager/', '/ads/'],
    fundraisers: ['/fundraisers/', '/charity/'],
    bloodDonations: ['/blooddonations/'],
    climateScience: ['/climatescienceinfo/'],
    professional: ['/professional_dashboard/', '/business/'],
    feedsMenu: ['/feeds/'],
    payAndOrders: ['/facebook_pay/', '/orders/'],
};

let observer = null;
let isAdBlockEnabled = false;
let pendingArticles = new Set();
let scanTimer = null;
let rightColumnTimer = null;
let leftColumnTimer = null;
let hashtagFilterSet = new Set();
let hashtagRegexCache = new Map();
let cachedKeywordRegex = null;
let allowUrlSet = new Set();
let topNavInitTimer = null;
let allowByUrlDebugCount = 0;
let fbBlockConfig = {
    hideNewsfeed: false,
    hideProfileUpdates: true,
    hideProductsShown: true,
    hideTrendingPosts: true,
    hideLinkInteractions: true,
    hideLikePageCards: true,
    hideAllPhotoPosts: true,
    hideSharedPhotoAlbums: true,
    hideUpdatedProfilePictures: true,
    hideUploadedPhotos: true,
    hide3DPhotos: true,
    hideLikedPhotos: true,
    hideCommentedPhotos: true,
    hideAllVideos: true,
    hideLiveVideos: true,
    hideVideoInteractions: true,
    hideReelsTray: true,
    hideSingleReelPosts: true,
    disableVideoAutoplay: true,
    allowByUrlOnly: false,
    hideHashtagPosts: false,
    textFilterEnabled: false,
    hideRightColumnAll: false,
    hideRightBirthdays: false,
    hideRightFriendRequests: false,
    hideRightYourPages: false,
    hideRightRecommendedPages: false,
    hideRightSuggestedGroups: false,
    hideRightEvents: false,
    hideRightGameAppRequests: false,
    hideRightMarketplacePanel: false,
    hideRightPokes: false,
    hideRightWatch: false,
    hideRightSponsoredAds: false,
    hideLeftColumnAll: false,
    hideLeftPages: false,
    hideLeftGroups: false,
    hideLeftWatch: false,
    hideLeftMarketplace: false,
    hideLeftMemories: false,
    hideLeftSaved: false,
    hideLeftEvents: false,
    hideLeftGaming: false,
    hideLeftAdsManager: false,
    hideLeftFundraisers: false,
    hideLeftBloodDonations: false,
    hideLeftClimateScience: false,
    hideLeftProfessional: false,
    hideLeftFeedsMenu: false,
    hideLeftPayAndOrders: false,
    hideLeftShortcuts: false,
    freezeTopNavBar: false,
    showLogoutButton: false,
    hideSearchBoxAndPopup: false,
    hideNavHome: false,
    hideNavPages: false,
    hideNavReels: false,
    hideNavMarketplace: false,
    hideNavGroups: false,
    hideNavGaming: false,
    hideNavCreate: false,
    hideNavMessenger: false,
    hideNavNotifications: false,
    hideNavNews: false,
    hideNavEvents: false,
    hideNavFriendRequests: false,
    hideNavAccountSwitcher: false,
    hideSuggestedPosts: false,
    hideMarketplaceAds: false,
    hideSponsoredPosts: true,
};

function mergeFacebookBranch(syncData, localData) {
    const syncFb = syncData?.[STORAGE_KEY]?.facebook;
    const localFb = localData?.[STORAGE_KEY]?.facebook;
    return { ...(localFb || {}), ...(syncFb || {}) };
}

function clearFacebookRuntime() {
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    if (scanTimer !== null) {
        window.clearTimeout(scanTimer);
        scanTimer = null;
    }
    if (rightColumnTimer !== null) {
        window.clearInterval(rightColumnTimer);
        rightColumnTimer = null;
    }
    if (leftColumnTimer !== null) {
        window.clearInterval(leftColumnTimer);
        leftColumnTimer = null;
    }
    if (topNavInitTimer !== null) {
        window.clearTimeout(topNavInitTimer);
        topNavInitTimer = null;
    }
    pendingArticles.clear();
    document.querySelectorAll(`[${PROCESSED_FLAG}]`).forEach((el) => el.removeAttribute(PROCESSED_FLAG));
    document.querySelectorAll(`[${HIDDEN_FLAG}]`).forEach((el) => {
        el.removeAttribute(HIDDEN_FLAG);
        el.style.removeProperty('display');
    });
    document.querySelectorAll(`[${FEED_HIDDEN_FLAG}]`).forEach((el) => {
        el.removeAttribute(FEED_HIDDEN_FLAG);
        el.style.removeProperty('display');
    });
    document.querySelectorAll(`[${RIGHT_COL_HIDDEN_FLAG}]`).forEach((el) => {
        el.removeAttribute(RIGHT_COL_HIDDEN_FLAG);
        el.style.removeProperty('display');
    });
    document.querySelectorAll(`[${LEFT_COL_HIDDEN_FLAG}]`).forEach((el) => {
        el.removeAttribute(LEFT_COL_HIDDEN_FLAG);
        el.style.removeProperty('display');
    });
    const styleTag = document.getElementById(TOP_NAV_STYLE_ID);
    if (styleTag) {
        styleTag.remove();
    }
    const logoutBtn = document.getElementById(QUICK_LOGOUT_ID);
    if (logoutBtn) {
        logoutBtn.remove();
    }
}

function isElementVisible(node) {
    if (!(node instanceof Element)) {
        return false;
    }
    const style = window.getComputedStyle(node);
    if (!style || style.display === 'none' || style.visibility === 'hidden') {
        return false;
    }
    if (Number.parseFloat(style.opacity || '1') === 0) {
        return false;
    }
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
        return false;
    }
    if (style.position === 'absolute' && (rect.width === 0 || rect.height === 0)) {
        return false;
    }
    return true;
}

function extractVisibleText(root) {
    if (!(root instanceof Element)) {
        return '';
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const chunks = [];
    let totalLength = 0;

    while (walker.nextNode()) {
        const textNode = walker.currentNode;
        const parent = textNode.parentElement;
        if (!parent || SAFE_TAGS.has(parent.tagName) || !isElementVisible(parent)) {
            continue;
        }
        const value = (textNode.nodeValue || '').trim();
        if (!value) {
            continue;
        }
        const lower = value.toLowerCase();
        chunks.push(lower);
        totalLength += lower.length + 1;
        if (totalLength > MAX_SCAN_TEXT_LENGTH) {
            break;
        }
    }

    return chunks.join(' ');
}

function hasSponsoredKeyword(text) {
    if (!text) {
        return false;
    }
    return SPONSORED_KEYWORDS.some((keyword) => text.includes(keyword));
}

function markBlockedByDebug(article, reason) {
    if (!DEBUG_MODE || !(article instanceof HTMLElement)) {
        return;
    }
    article.style.setProperty('outline', '3px solid #ef4444', 'important');
    article.style.setProperty('background', 'rgba(239,68,68,0.12)', 'important');
    article.setAttribute('data-fb-block-reason', reason);
}

function hasAriaOrIconSignals(article) {
    const ariaNodes = article.querySelectorAll('[aria-label]');
    for (const node of ariaNodes) {
        const label = (node.getAttribute('aria-label') || '').toLowerCase();
        if (hasSponsoredKeyword(label)) {
            return true;
        }
    }

    const svgNodes = article.querySelectorAll('svg[aria-label], svg title');
    for (const node of svgNodes) {
        const raw = typeof node.getAttribute === 'function' ? node.getAttribute('aria-label') : '';
        const value = ((node.textContent || '') + ' ' + (raw || '')).toLowerCase();
        if (hasSponsoredKeyword(value)) {
            return true;
        }
    }

    return false;
}

function hasAdTrackerLinks(article) {
    const links = article.querySelectorAll('a[href]');
    for (const link of links) {
        const href = (link.getAttribute('href') || '').toLowerCase();
        if (TRACKER_PATTERNS.some((pattern) => href.includes(pattern))) {
            return true;
        }
    }
    return false;
}

function hasSponsoredLabelInAria(article) {
    const nodes = article.querySelectorAll('[aria-label]');
    for (const node of nodes) {
        const label = (node.getAttribute('aria-label') || '').trim().toLowerCase();
        if (SPONSORED_LABELS.some((needle) => label === needle || label.includes(needle))) {
            return true;
        }
    }
    return false;
}

function hasObfuscatedSponsoredHeaderSignals(article) {
    const headerLinks = article.querySelectorAll('h1 a[role="link"], h2 a[role="link"], h3 a[role="link"], h4 a[role="link"]');
    for (const link of headerLinks) {
        const href = (link.getAttribute('href') || '').trim();
        if (href && href !== '#' && href !== '/') {
            continue;
        }
        const hasSvgUse = link.querySelector('use') !== null;
        const hasNoVisibleText = ((link.textContent || '').trim() === '');
        if (hasSvgUse || hasNoVisibleText) {
            return true;
        }
    }
    return false;
}

function checkSponsoredPost(article, text) {
    const adSettingsLink = article.querySelector('a[href*="/ad_preferences/"], a[href*="/ads/about/"]');
    if (adSettingsLink) {
        markBlockedByDebug(article, 'sponsored:ad_preferences');
        return true;
    }

    if (hasSponsoredLabelInAria(article)) {
        markBlockedByDebug(article, 'sponsored:aria');
        return true;
    }

    if (hasObfuscatedSponsoredHeaderSignals(article)) {
        markBlockedByDebug(article, 'sponsored:obfuscated_header');
        return true;
    }

    if (hasSponsoredKeyword(text) || hasAriaOrIconSignals(article) || hasAdTrackerLinks(article)) {
        markBlockedByDebug(article, 'sponsored:keyword_fallback');
        return true;
    }

    return false;
}

function checkSuggestedPost(article, headerText) {
    const quickHeader = (headerText || '').slice(0, 180);
    if (includesAnyKeyword(quickHeader, SUGGESTED_KEYWORDS)) {
        markBlockedByDebug(article, 'suggested:header');
        return true;
    }

    const suggestTray = article.querySelector('[aria-label="Nhóm gợi ý"], [aria-label="Suggested groups"]');
    if (suggestTray) {
        markBlockedByDebug(article, 'suggested:tray');
        return true;
    }

    return false;
}

function checkMarketplaceAds(article, headerText) {
    const hasMarketplaceLinks = article.querySelector('a[href*="/marketplace/"]');
    if (!hasMarketplaceLinks) {
        return false;
    }

    if (hasSponsoredLabelInAria(article)) {
        markBlockedByDebug(article, 'marketplace:sponsored_aria');
        return true;
    }

    const quickHeader = (headerText || '').slice(0, 70);
    if (quickHeader.includes('được tài trợ') || quickHeader.includes('sponsored')) {
        markBlockedByDebug(article, 'marketplace:sponsored_text');
        return true;
    }

    return false;
}

function markRightColumnHidden(node) {
    if (!(node instanceof HTMLElement)) {
        return;
    }
    if (node.getAttribute(RIGHT_COL_HIDDEN_FLAG) === 'true') {
        return;
    }
    node.setAttribute(RIGHT_COL_HIDDEN_FLAG, 'true');
    node.style.setProperty('display', 'none', 'important');
}

function markLeftColumnHidden(node) {
    if (!(node instanceof HTMLElement)) {
        return;
    }
    if (node.getAttribute(LEFT_COL_HIDDEN_FLAG) === 'true') {
        return;
    }
    node.setAttribute(LEFT_COL_HIDDEN_FLAG, 'true');
    node.style.setProperty('display', 'none', 'important');
}

function findRightColumnRoot() {
    const complementaryAreas = Array.from(document.querySelectorAll('[role="complementary"]'))
        .filter((col) => col instanceof HTMLElement && col.offsetWidth > 150);
    if (complementaryAreas.length === 0) {
        return null;
    }
    complementaryAreas.sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left);
    return complementaryAreas[0];
}

function shouldHideRightColumnWidget(configKey) {
    return Boolean(fbBlockConfig[configKey]);
}

function resolveRightWidgetWrapper(header) {
    return header.closest('div[data-pagelet*="RightRail"]')
        || header.closest('div[class*="x1n2onr6"]')
        || header.parentElement?.parentElement?.parentElement
        || null;
}

function runRightColumnPurifier() {
    if (document.visibilityState !== 'visible') {
        return;
    }
    const rightCol = findRightColumnRoot();
    if (!(rightCol instanceof HTMLElement)) {
        return;
    }

    if (fbBlockConfig.hideRightColumnAll) {
        markRightColumnHidden(rightCol);
        return;
    }

    const headers = rightCol.querySelectorAll('h2, h3, h4, span[dir="auto"], span[class*="x193iq5w"]');
    headers.forEach((header) => {
        const text = (header.textContent || '').trim().toLowerCase();
        if (!text) {
            return;
        }
        const wrapper = resolveRightWidgetWrapper(header);
        if (!(wrapper instanceof HTMLElement) || wrapper.style.display === 'none') {
            return;
        }

        const isMatch = (category) => RIGHT_COL_WIDGET_DICTIONARIES[category].some((kw) => text.includes(kw));

        if (shouldHideRightColumnWidget('hideRightBirthdays') && isMatch('birthdays')) {
            markRightColumnHidden(wrapper);
        } else if (shouldHideRightColumnWidget('hideRightFriendRequests') && isMatch('friendRequests')) {
            markRightColumnHidden(wrapper);
        } else if (shouldHideRightColumnWidget('hideRightYourPages') && isMatch('yourPages')) {
            markRightColumnHidden(wrapper);
        } else if (shouldHideRightColumnWidget('hideRightRecommendedPages') && isMatch('recommendedPages')) {
            markRightColumnHidden(wrapper);
        } else if (shouldHideRightColumnWidget('hideRightSuggestedGroups') && isMatch('suggestedGroups')) {
            markRightColumnHidden(wrapper);
        } else if (shouldHideRightColumnWidget('hideRightEvents') && isMatch('events')) {
            markRightColumnHidden(wrapper);
        } else if (shouldHideRightColumnWidget('hideRightGameAppRequests') && isMatch('gamesAndApps')) {
            markRightColumnHidden(wrapper);
        } else if (shouldHideRightColumnWidget('hideRightMarketplacePanel') && isMatch('marketplace')) {
            markRightColumnHidden(wrapper);
        } else if (shouldHideRightColumnWidget('hideRightPokes') && isMatch('pokes')) {
            markRightColumnHidden(wrapper);
        } else if (shouldHideRightColumnWidget('hideRightWatch') && isMatch('watch')) {
            markRightColumnHidden(wrapper);
        }
    });

    if (fbBlockConfig.hideRightSponsoredAds) {
        const rightAds = rightCol.querySelectorAll(
            '[aria-label="Được tài trợ"], [aria-label="Sponsored"], a[href*="/ad_preferences/"], a[href*="/ads/about/"], a[role="link"]:not([href])',
        );
        rightAds.forEach((ad) => {
            const wrapper = ad.closest('div[class*="x1n2onr6"]')
                || ad.parentElement?.parentElement?.parentElement
                || null;
            if (wrapper instanceof HTMLElement) {
                markRightColumnHidden(wrapper);
            }
        });
    }
}

function startRightColumnManager() {
    const shouldRun = fbBlockConfig.hideRightColumnAll
        || fbBlockConfig.hideRightBirthdays
        || fbBlockConfig.hideRightFriendRequests
        || fbBlockConfig.hideRightYourPages
        || fbBlockConfig.hideRightRecommendedPages
        || fbBlockConfig.hideRightSuggestedGroups
        || fbBlockConfig.hideRightEvents
        || fbBlockConfig.hideRightGameAppRequests
        || fbBlockConfig.hideRightMarketplacePanel
        || fbBlockConfig.hideRightPokes
        || fbBlockConfig.hideRightWatch
        || fbBlockConfig.hideRightSponsoredAds;
    if (!shouldRun) {
        return;
    }

    window.setTimeout(runRightColumnPurifier, 500);
    rightColumnTimer = window.setInterval(runRightColumnPurifier, RIGHT_COL_SCAN_INTERVAL_MS);
}

function runLeftColumnPurifier() {
    if (document.visibilityState !== 'visible') {
        return;
    }

    const navArea = document.querySelector('[role="navigation"]');
    if (!(navArea instanceof HTMLElement)) {
        return;
    }

    if (fbBlockConfig.hideLeftColumnAll) {
        const leftMasterCol = navArea.parentElement;
        if (leftMasterCol instanceof HTMLElement) {
            markLeftColumnHidden(leftMasterCol);
        }
        return;
    }

    const navLinks = navArea.querySelectorAll('a[href]');
    const configsToMap = [
        { id: 'hideLeftPages', dict: 'pages' },
        { id: 'hideLeftGroups', dict: 'groups' },
        { id: 'hideLeftWatch', dict: 'watch' },
        { id: 'hideLeftMarketplace', dict: 'marketplace' },
        { id: 'hideLeftMemories', dict: 'memories' },
        { id: 'hideLeftSaved', dict: 'saved' },
        { id: 'hideLeftEvents', dict: 'events' },
        { id: 'hideLeftGaming', dict: 'gaming' },
        { id: 'hideLeftAdsManager', dict: 'adsManager' },
        { id: 'hideLeftFundraisers', dict: 'fundraisers' },
        { id: 'hideLeftBloodDonations', dict: 'bloodDonations' },
        { id: 'hideLeftClimateScience', dict: 'climateScience' },
        { id: 'hideLeftProfessional', dict: 'professional' },
        { id: 'hideLeftFeedsMenu', dict: 'feedsMenu' },
        { id: 'hideLeftPayAndOrders', dict: 'payAndOrders' },
    ];

    navLinks.forEach((linkObj) => {
        const theUrl = (linkObj.getAttribute('href') || '').toLowerCase();
        if (!theUrl) {
            return;
        }
        const itemWrapper = linkObj.closest('li') || linkObj.closest('div[class*="x1v"]') || linkObj.parentElement;
        if (!(itemWrapper instanceof HTMLElement) || itemWrapper.style.display === 'none') {
            return;
        }

        let shouldHide = false;
        for (const map of configsToMap) {
            if (!fbBlockConfig[map.id]) {
                continue;
            }
            const dict = LEFT_NAV_DICTIONARY[map.dict];
            if (Array.isArray(dict) && dict.some((pathStr) => theUrl.includes(pathStr))) {
                shouldHide = true;
                break;
            }
        }

        if (shouldHide) {
            markLeftColumnHidden(itemWrapper);
        }
    });

    if (fbBlockConfig.hideLeftShortcuts) {
        const headers = navArea.querySelectorAll('span, h3');
        headers.forEach((header) => {
            const txt = (header.textContent || '').trim().toLowerCase();
            if (txt !== 'lối tắt' && txt !== 'your shortcuts') {
                return;
            }
            const shortcutWrapperBlock = header.closest('div[class*="x1"]')
                || header.parentElement?.parentElement
                || null;
            if (shortcutWrapperBlock instanceof HTMLElement) {
                markLeftColumnHidden(shortcutWrapperBlock);
            }
        });
    }
}

function startLeftColumnManager() {
    const shouldRun = fbBlockConfig.hideLeftColumnAll
        || fbBlockConfig.hideLeftPages
        || fbBlockConfig.hideLeftGroups
        || fbBlockConfig.hideLeftWatch
        || fbBlockConfig.hideLeftMarketplace
        || fbBlockConfig.hideLeftMemories
        || fbBlockConfig.hideLeftSaved
        || fbBlockConfig.hideLeftEvents
        || fbBlockConfig.hideLeftGaming
        || fbBlockConfig.hideLeftAdsManager
        || fbBlockConfig.hideLeftFundraisers
        || fbBlockConfig.hideLeftBloodDonations
        || fbBlockConfig.hideLeftClimateScience
        || fbBlockConfig.hideLeftProfessional
        || fbBlockConfig.hideLeftFeedsMenu
        || fbBlockConfig.hideLeftPayAndOrders
        || fbBlockConfig.hideLeftShortcuts;
    if (!shouldRun) {
        return;
    }

    window.setTimeout(runLeftColumnPurifier, 1000);
    leftColumnTimer = window.setInterval(runLeftColumnPurifier, LEFT_COL_SCAN_INTERVAL_MS);
}

function getTopNavCssRules() {
    const cssRules = [];

    if (fbBlockConfig.freezeTopNavBar) {
        cssRules.push(`
            div[role="banner"] {
                position: sticky !important;
                top: 0 !important;
                z-index: 999 !important;
            }
        `);
    }

    if (fbBlockConfig.hideSearchBoxAndPopup) {
        cssRules.push(`
            input[type="search"],
            label[aria-label*="Tìm kiếm"],
            label[aria-label*="Search"],
            div[role="combobox"] + div[role="listbox"],
            div[aria-label="Tìm kiếm gần đây"],
            div[aria-label="Recent searches"] {
                display: none !important;
            }
        `);
    }

    const ariaIconMap = {
        hideNavHome: ['Trang chủ', 'Home'],
        hideNavPages: ['Trang', 'Pages'],
        hideNavReels: ['Reels'],
        hideNavMarketplace: ['Marketplace'],
        hideNavGroups: ['Nhóm', 'Groups'],
        hideNavGaming: ['Trò chơi', 'Gaming', 'Gaming Video'],
        hideNavNews: ['Tin tức', 'News'],
        hideNavEvents: ['Sự kiện', 'Events'],
        hideNavCreate: ['Tạo', 'Create'],
        hideNavMessenger: ['Messenger', 'Tin nhắn'],
        hideNavNotifications: ['Thông báo', 'Notifications'],
        hideNavFriendRequests: ['Bạn bè', 'Friends', 'Friend requests'],
        hideNavAccountSwitcher: ['Chuyển tài khoản', 'Switch Accounts', 'Chuyển trang profile'],
    };

    Object.keys(ariaIconMap).forEach((key) => {
        if (!fbBlockConfig[key]) {
            return;
        }
        const labels = ariaIconMap[key];
        const selectors = labels.map((label) => `
            a[aria-label="${label}"],
            div[aria-label="${label}"]
        `).join(', ');
        cssRules.push(`${selectors} { display: none !important; }`);
    });

    return cssRules;
}

function injectTopNavStyles() {
    const existing = document.getElementById(TOP_NAV_STYLE_ID);
    if (existing) {
        existing.remove();
    }
    const cssRules = getTopNavCssRules();
    if (cssRules.length === 0) {
        return;
    }
    const styleTag = document.createElement('style');
    styleTag.id = TOP_NAV_STYLE_ID;
    styleTag.textContent = cssRules.join('\n');
    document.head.appendChild(styleTag);
}

function triggerLogoutFlow() {
    const toggleMenuBtn = document.querySelector(
        'div[role="banner"] div[aria-label*="Trang cá nhân"], div[role="banner"] div[aria-label*="Tài khoản"], div[role="banner"] div[aria-label*="Account"]',
    );
    if (toggleMenuBtn instanceof HTMLElement) {
        (toggleMenuBtn.closest('[role="button"]') || toggleMenuBtn).click();
    }
    window.setTimeout(() => {
        const menuItems = document.querySelectorAll('div[role="menuitem"] span[dir="auto"]');
        menuItems.forEach((item) => {
            const text = (item.textContent || '').trim().toLowerCase();
            if (text === 'đăng xuất' || text === 'log out' || text === 'logout') {
                const menuItem = item.closest('div[role="menuitem"]');
                if (menuItem instanceof HTMLElement) {
                    menuItem.click();
                }
            }
        });
    }, 320);
}

function injectLogoutShortcut() {
    if (!fbBlockConfig.showLogoutButton) {
        return;
    }
    if (document.getElementById(QUICK_LOGOUT_ID)) {
        return;
    }
    const rightControlGroup = document.querySelector('div[role="banner"] > div:last-child');
    if (!(rightControlGroup instanceof HTMLElement)) {
        return;
    }
    const logOutBtn = document.createElement('div');
    logOutBtn.id = QUICK_LOGOUT_ID;
    logOutBtn.style.cssText = [
        'background-color:#e4e6eb',
        'border-radius:50%',
        'width:40px',
        'height:40px',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'cursor:pointer',
        'margin-left:8px',
        'font-weight:bold',
        'font-size:11px',
        'color:#e40000',
        'z-index:9999',
    ].join(';');
    logOutBtn.textContent = 'OUT';
    logOutBtn.title = 'Đăng xuất nhanh';
    logOutBtn.addEventListener('click', triggerLogoutFlow);
    rightControlGroup.appendChild(logOutBtn);
}

function startTopNavManager() {
    const shouldRun = fbBlockConfig.freezeTopNavBar
        || fbBlockConfig.showLogoutButton
        || fbBlockConfig.hideSearchBoxAndPopup
        || fbBlockConfig.hideNavHome
        || fbBlockConfig.hideNavPages
        || fbBlockConfig.hideNavReels
        || fbBlockConfig.hideNavMarketplace
        || fbBlockConfig.hideNavGroups
        || fbBlockConfig.hideNavGaming
        || fbBlockConfig.hideNavCreate
        || fbBlockConfig.hideNavMessenger
        || fbBlockConfig.hideNavNotifications
        || fbBlockConfig.hideNavNews
        || fbBlockConfig.hideNavEvents
        || fbBlockConfig.hideNavFriendRequests
        || fbBlockConfig.hideNavAccountSwitcher;
    if (!shouldRun) {
        return;
    }
    topNavInitTimer = window.setTimeout(() => {
        injectTopNavStyles();
        injectLogoutShortcut();
    }, 500);
}

function includesAnyKeyword(text, keywords) {
    if (!text) {
        return false;
    }
    return keywords.some((keyword) => text.includes(keyword));
}

function matchesAnyPattern(text, patterns) {
    if (!text) {
        return false;
    }
    return patterns.some((pattern) => pattern.test(text));
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeHashtagLine(line) {
    const cleaned = String(line || '').trim().toLowerCase();
    if (!cleaned) {
        return '';
    }
    const withoutHash = cleaned.replace(/^#+/, '');
    if (!withoutHash) {
        return '';
    }
    const [firstToken] = withoutHash.split(/\s+/);
    return firstToken || '';
}

function parseHashtagFilters(rawValue) {
    if (typeof rawValue !== 'string' || rawValue.trim() === '') {
        return new Set();
    }
    const uniq = new Set();
    rawValue.split(/\r?\n/).forEach((line) => {
        const token = normalizeHashtagLine(line);
        if (token) {
            uniq.add(token);
        }
    });
    return uniq;
}

function parseUserTextKeywords(rawValue) {
    if (typeof rawValue !== 'string' || rawValue.trim() === '') {
        return [];
    }
    const unique = new Set();
    rawValue
        .split(/\r?\n|,/)
        .map((word) => word.trim().toLowerCase())
        .filter(Boolean)
        .forEach((word) => unique.add(word));
    return Array.from(unique);
}

function isFacebookHostname(hostname) {
    return /(^|\.)facebook\.com$/i.test(hostname || '');
}

function normalizeFacebookUrl(rawValue) {
    if (typeof rawValue !== 'string' || !rawValue.trim()) {
        return '';
    }
    try {
        const parsed = new URL(rawValue.trim(), 'https://www.facebook.com');
        if (!isFacebookHostname(parsed.hostname)) {
            return '';
        }
        const path = parsed.pathname.replace(/\/+$/, '') || '/';
        return `${parsed.origin.toLowerCase()}${path.toLowerCase()}`;
    } catch (error) {
        return '';
    }
}

function parseAllowByUrlList(rawValue) {
    const next = new Set();
    if (typeof rawValue !== 'string' || !rawValue.trim()) {
        return next;
    }
    rawValue.split(/\r?\n/).forEach((line) => {
        const normalized = normalizeFacebookUrl(line);
        if (normalized) {
            next.add(normalized);
        }
    });
    return next;
}

function debugAllowByUrlLog(runId, hypothesisId, location, message, data) {
    if (allowByUrlDebugCount >= 40) {
        return;
    }
    allowByUrlDebugCount += 1;
    // #region agent log
    fetch('http://127.0.0.1:7371/ingest/7634893a-f87f-456c-8e21-990ad9d66e04',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'71e079'},body:JSON.stringify({sessionId:'71e079',runId,hypothesisId,location,message,data,timestamp:Date.now()})}).catch(()=>{});
    // #endregion
}

function extractArticleSourceUrls(article) {
    if (!(article instanceof Element)) {
        return [];
    }
    const sources = new Set();
    const sourceAnchors = article.querySelectorAll(
        'h1 a[href], h2 a[href], h3 a[href], h4 a[href], [role="heading"] a[href]',
    );
    sourceAnchors.forEach((anchor) => {
        const href = anchor.getAttribute('href') || '';
        const normalized = normalizeFacebookUrl(href);
        if (normalized) {
            sources.add(normalized);
        }
    });
    return Array.from(sources);
}

function isArticleAllowedByUrl(article) {
    const pageHref = window.location.href;
    const isFeedPage = /facebook\.com\/($|home|\\?sk=)/i.test(pageHref) || /facebook\.com\/\?/.test(pageHref);
    if (!isFeedPage) {
        debugAllowByUrlLog('run1', 'H3', 'undistracted-facebook.js:isArticleAllowedByUrl', 'skip allow-by-url outside feed page', {
            pageHref,
            allowByUrlOnly: fbBlockConfig.allowByUrlOnly,
        });
    }
    if (!fbBlockConfig.allowByUrlOnly || allowUrlSet.size === 0) {
        debugAllowByUrlLog('run1', 'H1', 'undistracted-facebook.js:isArticleAllowedByUrl', 'allow-by-url disabled or empty set', {
            allowByUrlOnly: fbBlockConfig.allowByUrlOnly,
            allowUrlSetSize: allowUrlSet.size,
            pageHref,
        });
        return true;
    }
    const sourceUrls = extractArticleSourceUrls(article);
    if (sourceUrls.length === 0) {
        debugAllowByUrlLog('run1', 'H4', 'undistracted-facebook.js:isArticleAllowedByUrl', 'article has no source urls', {
            pageHref,
            allowUrlSetSize: allowUrlSet.size,
        });
        return false;
    }
    for (const source of sourceUrls) {
        for (const allowUrl of allowUrlSet) {
            if (source === allowUrl || source.startsWith(`${allowUrl}/`)) {
                debugAllowByUrlLog('run1', 'H2', 'undistracted-facebook.js:isArticleAllowedByUrl', 'matched allow url', {
                    pageHref,
                    source,
                    allowUrl,
                });
                return true;
            }
        }
    }
    debugAllowByUrlLog('run1', 'H2', 'undistracted-facebook.js:isArticleAllowedByUrl', 'no allow url matched', {
        pageHref,
        sourceUrls: sourceUrls.slice(0, 5),
        allowUrlSetSample: Array.from(allowUrlSet).slice(0, 5),
    });
    return false;
}

function buildRegexEngine(keywordArray) {
    if (!Array.isArray(keywordArray) || keywordArray.length === 0) {
        cachedKeywordRegex = null;
        return;
    }

    const sanitizedWords = keywordArray
        .map((word) => word.trim())
        .filter((word) => word.length > 0)
        .map((word) => escapeRegex(word));

    if (sanitizedWords.length === 0) {
        cachedKeywordRegex = null;
        return;
    }

    const patternString = `(${sanitizedWords.join('|')})`;
    cachedKeywordRegex = new RegExp(patternString, 'iu');
}

function applyUserTextFilter(article) {
    if (!fbBlockConfig.textFilterEnabled || !cachedKeywordRegex || !(article instanceof Element)) {
        return false;
    }

    const postTextContent = extractVisibleText(article);
    if (!postTextContent) {
        return false;
    }

    const matched = postTextContent.match(cachedKeywordRegex);
    if (!matched) {
        return false;
    }

    markBlockedByDebug(article, `text-filter:${matched[0]}`);
    return true;
}

function buildHashtagRegexCache(tags) {
    hashtagRegexCache = new Map();
    tags.forEach((tag) => {
        const token = escapeRegex(tag);
        const regex = new RegExp(`(^|[^\\p{L}\\p{N}_])#${token}(?=$|[^\\p{L}\\p{N}_])`, 'iu');
        hashtagRegexCache.set(tag, regex);
    });
}

function getCaptionText(article) {
    if (!(article instanceof Element)) {
        return '';
    }

    const chunks = [];
    const selectors = [
        'div[data-ad-comet-preview="message"]',
        'div[data-ad-preview="message"]',
        '[data-testid="post_message"]',
        '[role="article"] div[dir="auto"]',
    ];

    for (const selector of selectors) {
        const nodes = article.querySelectorAll(selector);
        for (const node of nodes) {
            const text = (node.textContent || '').trim().toLowerCase();
            if (!text || text.length < 2) {
                continue;
            }
            chunks.push(text.slice(0, 450));
            if (chunks.length >= 5) {
                return chunks.join(' ');
            }
        }
    }

    // Fallback: only take visible text near the beginning, not full post/comments.
    const fallback = extractVisibleText(article).slice(0, 800);
    if (fallback) {
        chunks.push(fallback);
    }

    return chunks.join(' ');
}

function hasBlockedHashtag(captionText) {
    if (!captionText || hashtagFilterSet.size === 0 || hashtagRegexCache.size === 0) {
        return false;
    }
    for (const regex of hashtagRegexCache.values()) {
        if (regex.test(captionText)) {
            return true;
        }
    }
    return false;
}

function getHeaderText(article) {
    if (!(article instanceof Element)) {
        return '';
    }
    const header = article.querySelector('h1, h2, h3, h4, [role="heading"]');
    if (!header) {
        return '';
    }
    return (header.textContent || '').trim().toLowerCase();
}

function getActionHeaderText(article) {
    if (!(article instanceof Element)) {
        return '';
    }

    const chunks = [];
    const headingNodes = article.querySelectorAll('h2, h3, h4, [role="heading"]');
    for (let i = 0; i < headingNodes.length && i < 4; i += 1) {
        const text = (headingNodes[i].textContent || '').trim();
        if (text) {
            chunks.push(text.toLowerCase());
        }
    }

    if (chunks.length > 0) {
        return chunks.join(' ');
    }

    // Fallback when heading tags are A/B-tested away.
    const topNodes = article.querySelectorAll(':scope > div, :scope > span');
    for (let i = 0; i < topNodes.length && i < 4; i += 1) {
        const text = (topNodes[i].textContent || '').trim().toLowerCase();
        if (!text) {
            continue;
        }
        chunks.push(text.slice(0, 180));
    }

    return chunks.join(' ');
}

function checkLinkInteractions(article, headerText) {
    if (!(article instanceof Element)) {
        return false;
    }

    if (LINK_INTERACTION_PATTERNS.some((pattern) => pattern.test(headerText))) {
        return true;
    }

    const externalLinkCards = article.querySelectorAll(
        'a[target="_blank"][href*="l.facebook.com/l.php"], a[href*="l.facebook.com/l.php"]',
    );
    return externalLinkCards.length > 0 && /shared?|chia sẻ|link|liên kết/i.test(headerText);
}

function removeLikePageButtonsAndCards(article) {
    if (!(article instanceof Element)) {
        return false;
    }

    const selectors = [
        '[aria-label="Thích Trang"]',
        '[aria-label="Like Page"]',
        '[aria-label="Follow Page"]',
        'div[role="button"][aria-label]',
        'a[role="button"][aria-label]',
        'button[aria-label]',
    ];

    const candidates = article.querySelectorAll(selectors.join(', '));
    for (const button of candidates) {
        const aria = (button.getAttribute('aria-label') || '').trim().toLowerCase();
        const text = (button.textContent || '').trim().toLowerCase();
        const haystack = `${aria} ${text}`;
        if (!haystack) {
            continue;
        }
        if (LIKE_PAGE_PATTERNS.some((pattern) => pattern.test(haystack))) {
            return true;
        }
    }

    return false;
}

function hasPhotoMediaSignals(article) {
    if (!(article instanceof Element)) {
        return false;
    }

    const photoLinks = article.querySelectorAll(
        'a[href*="/photo"], a[href*="/photos/"], a[href*="/media/set/"], a[href*="fbid="]',
    );
    if (photoLinks.length > 0) {
        return true;
    }

    const labeledMedia = article.querySelectorAll(
        '[aria-label*="Photo"], [aria-label*="photo"], [aria-label*="Ảnh"], [aria-label*="ảnh"]',
    );
    if (labeledMedia.length > 0) {
        return true;
    }

    const imgs = article.querySelectorAll('img[src]');
    for (const img of imgs) {
        const rect = img.getBoundingClientRect();
        if (rect.width >= 120 && rect.height >= 120) {
            return true;
        }
    }

    return false;
}

function isSharedPhotoOrAlbumPost(headerText) {
    return matchesAnyPattern(headerText, SHARED_PHOTO_ALBUM_PATTERNS);
}

function isUpdatedProfilePhotoPost(headerText) {
    return matchesAnyPattern(headerText, UPDATED_PROFILE_PHOTO_PATTERNS);
}

function isUploadedPhotoPost(headerText) {
    return matchesAnyPattern(headerText, UPLOADED_PHOTO_PATTERNS);
}

function is3DPhotoPost(headerText, text) {
    return matchesAnyPattern(headerText, PHOTO_3D_PATTERNS) || matchesAnyPattern(text, PHOTO_3D_PATTERNS);
}

function isLikedPhotoPost(headerText) {
    return matchesAnyPattern(headerText, LIKED_PHOTO_PATTERNS);
}

function isCommentedPhotoPost(headerText) {
    return matchesAnyPattern(headerText, COMMENTED_PHOTO_PATTERNS);
}

function disableVideoAutoplayInArticle(article) {
    if (!(article instanceof Element) || !fbBlockConfig.disableVideoAutoplay) {
        return;
    }
    const videos = article.querySelectorAll('video');
    videos.forEach((video) => {
        video.autoplay = false;
        video.removeAttribute('autoplay');
        if (!video.paused) {
            video.pause();
        }
    });
}

function hideReelsTrayIfEnabled(scopeNode) {
    if (!isAdBlockEnabled || !fbBlockConfig.hideReelsTray) {
        return;
    }
    const scope = scopeNode instanceof Element ? scopeNode : document;
    const reelsSelectors = REELS_LABELS
        .map((label) => `[aria-label="${label}"]`)
        .join(', ');
    const reelsContainers = scope.querySelectorAll(reelsSelectors);
    reelsContainers.forEach((container) => {
        const masterWrap = container.closest('[data-pagelet^="FeedUnit_"]')
            || container.closest('[role="article"]')
            || container.parentElement?.parentElement
            || container.parentElement;
        if (masterWrap instanceof HTMLElement) {
            masterWrap.style.setProperty('display', 'none', 'important');
        }
    });
}

function hasVideoElement(article) {
    return article.querySelector('video') !== null;
}

function isLiveVideoPost(text, headerText) {
    return matchesAnyPattern(headerText, LIVE_VIDEO_PATTERNS)
        || matchesAnyPattern((text || '').slice(0, 500), LIVE_VIDEO_PATTERNS);
}

function isSingleReelPost(article, text, headerText) {
    if (!(article instanceof Element)) {
        return false;
    }
    if (article.querySelector('a[href*="/reel/"]')) {
        return true;
    }
    const signalText = `${headerText} ${(text || '').slice(0, 250)}`;
    return /\breel(s)?\b/i.test(signalText);
}

function isVideoInteractionPost(headerText) {
    return matchesAnyPattern(headerText, VIDEO_INTERACTION_PATTERNS);
}

function hasProductsShownSignals(article, text) {
    if (includesAnyKeyword(text, PRODUCT_SHOWN_KEYWORDS)) {
        return true;
    }

    const ariaNodes = article.querySelectorAll('[aria-label]');
    for (const node of ariaNodes) {
        const label = (node.getAttribute('aria-label') || '').toLowerCase();
        if (includesAnyKeyword(label, PRODUCT_SHOWN_KEYWORDS)) {
            return true;
        }
    }

    return false;
}

function isProfileUpdatePost(text) {
    return includesAnyKeyword(text, PROFILE_UPDATE_KEYWORDS);
}

function isTrendingPost(text, headerText) {
    if (includesAnyKeyword(headerText, TRENDING_KEYWORDS)) {
        return true;
    }

    // Facebook can place trending labels near the top section of a post.
    const topSlice = (text || '').slice(0, 300);
    return includesAnyKeyword(topSlice, TRENDING_KEYWORDS);
}

function shouldHideArticle(article) {
    const text = extractVisibleText(article);
    const captionText = getCaptionText(article);
    const headerText = getHeaderText(article);
    const actionHeaderText = getActionHeaderText(article);

    if (!isArticleAllowedByUrl(article)) {
        debugAllowByUrlLog('run1', 'H3', 'undistracted-facebook.js:shouldHideArticle', 'blocked by allow-by-url gate', {
            pageHref: window.location.href,
        });
        markBlockedByDebug(article, 'allow-by-url:not-allowed');
        return true;
    }

    // Keep sponsored check first for early-return performance.
    if (fbBlockConfig.hideSponsoredPosts) {
        if (checkSponsoredPost(article, text)) {
            return true;
        }
    }

    if (fbBlockConfig.hideSuggestedPosts && checkSuggestedPost(article, headerText)) {
        return true;
    }

    if (fbBlockConfig.hideMarketplaceAds && checkMarketplaceAds(article, headerText)) {
        return true;
    }

    if (applyUserTextFilter(article)) {
        return true;
    }

    if (fbBlockConfig.hideProfileUpdates && isProfileUpdatePost(text)) {
        return true;
    }

    if (fbBlockConfig.hideProductsShown && hasProductsShownSignals(article, text)) {
        return true;
    }

    if (fbBlockConfig.hideTrendingPosts && isTrendingPost(text, headerText)) {
        return true;
    }

    if (fbBlockConfig.hideLinkInteractions && checkLinkInteractions(article, actionHeaderText)) {
        return true;
    }

    if (fbBlockConfig.hideLikePageCards && removeLikePageButtonsAndCards(article)) {
        return true;
    }

    if (fbBlockConfig.hideUpdatedProfilePictures && isUpdatedProfilePhotoPost(actionHeaderText)) {
        return true;
    }

    if (fbBlockConfig.hideSharedPhotoAlbums && isSharedPhotoOrAlbumPost(actionHeaderText)) {
        return true;
    }

    if (fbBlockConfig.hideUploadedPhotos && isUploadedPhotoPost(actionHeaderText)) {
        return true;
    }

    if (fbBlockConfig.hide3DPhotos && is3DPhotoPost(actionHeaderText, text)) {
        return true;
    }

    if (fbBlockConfig.hideLikedPhotos && isLikedPhotoPost(actionHeaderText)) {
        return true;
    }

    if (fbBlockConfig.hideCommentedPhotos && isCommentedPhotoPost(actionHeaderText)) {
        return true;
    }

    if (fbBlockConfig.hideAllPhotoPosts && hasPhotoMediaSignals(article)) {
        return true;
    }

    if (fbBlockConfig.hideVideoInteractions && isVideoInteractionPost(actionHeaderText)) {
        return true;
    }

    if (fbBlockConfig.hideSingleReelPosts && isSingleReelPost(article, text, actionHeaderText)) {
        return true;
    }

    if (fbBlockConfig.hideLiveVideos && isLiveVideoPost(text, actionHeaderText)) {
        return true;
    }

    if (fbBlockConfig.hideAllVideos && hasVideoElement(article)) {
        return true;
    }

    if (fbBlockConfig.hideHashtagPosts && hasBlockedHashtag(captionText)) {
        return true;
    }

    disableVideoAutoplayInArticle(article);

    return false;
}

function hideNewsfeedIfEnabled() {
    if (!isAdBlockEnabled || !fbBlockConfig.hideNewsfeed) {
        return;
    }
    const feed = document.querySelector('[role="main"] [role="feed"]');
    if (!(feed instanceof HTMLElement)) {
        return;
    }
    if (feed.getAttribute(FEED_HIDDEN_FLAG) === 'true') {
        return;
    }
    feed.setAttribute(FEED_HIDDEN_FLAG, 'true');
    feed.style.setProperty('display', 'none', 'important');
}

function hideArticle(article) {
    const wrapper = article.closest('div[role="article"]') || article;
    if (!(wrapper instanceof HTMLElement)) {
        return;
    }
    if (wrapper.getAttribute(HIDDEN_FLAG) === 'true') {
        return;
    }
    wrapper.setAttribute(HIDDEN_FLAG, 'true');
    wrapper.style.setProperty('display', 'none', 'important');
}

function scanArticle(article) {
    if (!isAdBlockEnabled || !(article instanceof Element)) {
        return;
    }
    if (article.getAttribute(PROCESSED_FLAG) === 'true') {
        return;
    }
    article.setAttribute(PROCESSED_FLAG, 'true');
    if (shouldHideArticle(article)) {
        hideArticle(article);
    }
}

function flushPendingArticles() {
    scanTimer = null;
    if (!isAdBlockEnabled || pendingArticles.size === 0) {
        pendingArticles.clear();
        return;
    }
    const articles = Array.from(pendingArticles);
    pendingArticles.clear();
    articles.forEach(scanArticle);
    hideNewsfeedIfEnabled();
    hideReelsTrayIfEnabled(document);
}

function queueArticle(article) {
    if (!(article instanceof Element) || !isAdBlockEnabled) {
        return;
    }
    pendingArticles.add(article);
    if (scanTimer !== null) {
        return;
    }
    scanTimer = window.setTimeout(flushPendingArticles, 60);
}

function queueFromNode(node) {
    if (!(node instanceof Element) || !isAdBlockEnabled) {
        return;
    }
    hideReelsTrayIfEnabled(node);
    if (node.matches(ARTICLE_SELECTOR)) {
        queueArticle(node);
    }
    node.querySelectorAll(ARTICLE_SELECTOR).forEach(queueArticle);
}

function scanExistingArticles() {
    if (!isAdBlockEnabled) {
        return;
    }
    hideNewsfeedIfEnabled();
    hideReelsTrayIfEnabled(document);
    document.querySelectorAll(ARTICLE_SELECTOR).forEach(queueArticle);
}

function startObserver() {
    if (observer || !isAdBlockEnabled) {
        return;
    }
    observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type !== 'childList' || mutation.addedNodes.length === 0) {
                return;
            }
            mutation.addedNodes.forEach(queueFromNode);
        });
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
}

function loadFacebookSettings() {
    chrome.storage.sync.get([STORAGE_KEY, EXTENSION_ACTIVE_KEY], (syncData) => {
        chrome.storage.local.get([STORAGE_KEY, EXTENSION_ACTIVE_KEY], (localData) => {
            const isExtensionActive = syncData?.[EXTENSION_ACTIVE_KEY] !== undefined
                ? syncData[EXTENSION_ACTIVE_KEY] !== false
                : localData?.[EXTENSION_ACTIVE_KEY] !== false;

            const facebookSettings = mergeFacebookBranch(syncData, localData);
            const feedSectionOn = facebookSettings.masterSectionI !== false;
            const adsSectionOn = facebookSettings.masterSectionII !== undefined
                ? facebookSettings.masterSectionII !== false
                : facebookSettings.masterAdsContent !== false;
            const isSponsoredBlockingEnabled = adsSectionOn && Boolean(facebookSettings?.hideSponsoredPosts);
            const isSuggestedBlockingEnabled = adsSectionOn && Boolean(facebookSettings?.hideSuggestedPosts);
            const isMarketplaceBlockingEnabled = adsSectionOn && Boolean(facebookSettings?.hideMarketplaceAds);
            const isFeedBlockingEnabled = feedSectionOn && Boolean(facebookSettings?.hideEntireNewsfeed);
            const isProfileUpdateBlockingEnabled = feedSectionOn
                && (facebookSettings?.hideProfileInfoUpdates || facebookSettings?.hideProfileUpdatePosts);
            const isProductsShownBlockingEnabled = feedSectionOn
                && (facebookSettings?.hideProductsShown || facebookSettings?.hideProductsShownPosts);
            const isTrendingBlockingEnabled = feedSectionOn
                && (facebookSettings?.hideTrendingPosts !== false);
            const isLinkInteractionBlockingEnabled = feedSectionOn && Boolean(
                facebookSettings?.hideLinkInteractionPosts
                || facebookSettings?.hideLikedPagePost
                || facebookSettings?.hideLikedLinkPost
                || facebookSettings?.hideSharedLinkPost
                || facebookSettings?.hideCommentedLinkPost,
            );
            const isLikePageCardBlockingEnabled = feedSectionOn
                && (facebookSettings?.hideLikePageButtons || facebookSettings?.hideLikePageCards);
            const isAllPhotoPostsBlockingEnabled = feedSectionOn
                && (facebookSettings?.hideAllPhotoPosts !== false);
            const isSharedPhotoAlbumBlockingEnabled = feedSectionOn
                && (facebookSettings?.hideSharedPhotoAlbum || facebookSettings?.hideSharedPhotoAlbums);
            const isUpdatedProfilePictureBlockingEnabled = feedSectionOn
                && (facebookSettings?.hideProfilePictureCoverChange || facebookSettings?.hideUpdatedProfilePictures);
            const isUploadedPhotoBlockingEnabled = feedSectionOn
                && (facebookSettings?.hideUploadedPhoto || facebookSettings?.hideUploadedPhotos);
            const is3DPhotoBlockingEnabled = feedSectionOn
                && (facebookSettings?.hide3dPhoto || facebookSettings?.hide3DPhotos);
            const isLikedPhotoBlockingEnabled = feedSectionOn
                && (facebookSettings?.hideLikedPhoto || facebookSettings?.hideLikedPhotos);
            const isCommentedPhotoBlockingEnabled = feedSectionOn
                && (facebookSettings?.hideCommentedOnPhoto || facebookSettings?.hideCommentedPhotos);
            const isAllVideosBlockingEnabled = feedSectionOn
                && (facebookSettings?.hideAllVideoPosts || facebookSettings?.hideAllVideos);
            const isLiveVideosBlockingEnabled = feedSectionOn
                && (facebookSettings?.hideLiveVideoPosts || facebookSettings?.hideLiveVideos);
            const isVideoInteractionsBlockingEnabled = feedSectionOn && Boolean(
                facebookSettings?.hideVideoInteractionPosts
                || facebookSettings?.hideSharedVideo
                || facebookSettings?.hideLikedVideo
                || facebookSettings?.hideCommentedOnVideo,
            );
            const isReelsTrayBlockingEnabled = feedSectionOn
                && (facebookSettings?.hideReelsShortVideo || facebookSettings?.hideReelsTray);
            const isSingleReelPostBlockingEnabled = feedSectionOn
                && (facebookSettings?.hideSingleReelPosts || facebookSettings?.hideReelsShortVideo);
            const isDisableVideoAutoplayEnabled = feedSectionOn
                && (facebookSettings?.disableVideoAutoplayFacebook || facebookSettings?.disableVideoAutoplay);
            const isHashtagBlockingEnabled = feedSectionOn && Boolean(facebookSettings?.hideHashtagPosts);
            const isTextFilterSectionEnabled = facebookSettings.masterSectionIII !== false;
            const userTextKeywords = parseUserTextKeywords(facebookSettings?.textFilterKeywords || '');
            buildRegexEngine(userTextKeywords);
            const isTextFilterEnabled = isTextFilterSectionEnabled && userTextKeywords.length > 0;
            const allowByUrlSectionOn = facebookSettings.masterSectionIV !== false;
            allowUrlSet = parseAllowByUrlList(facebookSettings?.allowByUrlList || '');
            const isAllowByUrlEnabled = allowByUrlSectionOn
                && Boolean(facebookSettings?.allowByUrlOnly)
                && allowUrlSet.size > 0;
            debugAllowByUrlLog('run1', 'H1', 'undistracted-facebook.js:loadFacebookSettings', 'computed allow-by-url config', {
                pageHref: window.location.href,
                allowByUrlSectionOn,
                allowByUrlOnlyRaw: Boolean(facebookSettings?.allowByUrlOnly),
                allowUrlSetSize: allowUrlSet.size,
                isAllowByUrlEnabled,
            });
            hashtagFilterSet = parseHashtagFilters(facebookSettings?.hashtagFilterKeywords);
            buildHashtagRegexCache(hashtagFilterSet);
            const rightSectionOn = facebookSettings.masterSectionVI !== false;
            const isHideRightColumnAllEnabled = rightSectionOn && Boolean(facebookSettings?.hideRightColumnAll);
            const isHideRightBirthdaysEnabled = rightSectionOn && Boolean(facebookSettings?.hideRightBirthdays);
            const isHideRightFriendRequestsEnabled = rightSectionOn && Boolean(facebookSettings?.hideRightFriendRequests);
            const isHideRightYourPagesEnabled = rightSectionOn && Boolean(facebookSettings?.hideRightYourPages);
            const isHideRightRecommendedPagesEnabled = rightSectionOn && Boolean(facebookSettings?.hideRightRecommendedPages);
            const isHideRightSuggestedGroupsEnabled = rightSectionOn && Boolean(facebookSettings?.hideRightSuggestedGroups);
            const isHideRightEventsEnabled = rightSectionOn
                && Boolean(facebookSettings?.hideRightEvents || facebookSettings?.hideRightHappeningLive);
            const isHideRightGameAppRequestsEnabled = rightSectionOn && Boolean(facebookSettings?.hideRightGameAppRequests);
            const isHideRightMarketplacePanelEnabled = rightSectionOn && Boolean(facebookSettings?.hideRightMarketplacePanel);
            const isHideRightPokesEnabled = rightSectionOn && Boolean(facebookSettings?.hideRightPokes);
            const isHideRightWatchEnabled = rightSectionOn && Boolean(facebookSettings?.hideRightWatch);
            const isHideRightSponsoredAdsEnabled = rightSectionOn && Boolean(facebookSettings?.hideSponsoredPosts);
            const leftSectionOn = facebookSettings.masterSectionVII !== false;
            const isHideLeftColumnAllEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftColumnAll);
            const isHideLeftPagesEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftPages);
            const isHideLeftGroupsEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftGroups);
            const isHideLeftWatchEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftWatch);
            const isHideLeftMarketplaceEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftMarketplace);
            const isHideLeftMemoriesEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftMemories);
            const isHideLeftSavedEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftSaved);
            const isHideLeftEventsEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftEvents);
            const isHideLeftGamingEnabled = leftSectionOn && Boolean(
                facebookSettings?.hideLeftGaming || facebookSettings?.hideLeftGameStreaming,
            );
            const isHideLeftAdsManagerEnabled = leftSectionOn && Boolean(
                facebookSettings?.hideLeftAdsManager || facebookSettings?.hideLeftRecentAdActivity,
            );
            const isHideLeftFundraisersEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftFundraisers);
            const isHideLeftBloodDonationsEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftBloodDonations);
            const isHideLeftClimateScienceEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftClimateScience);
            const isHideLeftProfessionalEnabled = leftSectionOn && Boolean(
                facebookSettings?.hideLeftProfessional || facebookSettings?.hideLeftCreatorStudio,
            );
            const isHideLeftFeedsMenuEnabled = leftSectionOn && Boolean(
                facebookSettings?.hideLeftFeedsMenu || facebookSettings?.hideLeftMostRecent,
            );
            const isHideLeftPayAndOrdersEnabled = leftSectionOn && Boolean(
                facebookSettings?.hideLeftPayAndOrders || facebookSettings?.hideLeftOrderFood || facebookSettings?.hideLeftOffers,
            );
            const isHideLeftShortcutsEnabled = leftSectionOn && Boolean(
                facebookSettings?.hideLeftShortcuts || facebookSettings?.hideLeftFavorites,
            );
            const topNavSectionOn = facebookSettings.masterSectionIX !== false;
            const isFreezeTopNavBarEnabled = topNavSectionOn && Boolean(facebookSettings?.freezeTopNavBar);
            const isShowLogoutButtonEnabled = topNavSectionOn && Boolean(facebookSettings?.showLogoutButton);
            const isHideSearchBoxAndPopupEnabled = topNavSectionOn && Boolean(facebookSettings?.hideSearchBoxAndPopup);
            const isHideNavHomeEnabled = topNavSectionOn && Boolean(facebookSettings?.hideNavHome);
            const isHideNavPagesEnabled = topNavSectionOn && Boolean(facebookSettings?.hideNavPages);
            const isHideNavReelsEnabled = topNavSectionOn && Boolean(facebookSettings?.hideNavReels);
            const isHideNavMarketplaceEnabled = topNavSectionOn && Boolean(facebookSettings?.hideNavMarketplace);
            const isHideNavGroupsEnabled = topNavSectionOn && Boolean(facebookSettings?.hideNavGroups);
            const isHideNavGamingEnabled = topNavSectionOn && Boolean(facebookSettings?.hideNavGaming);
            const isHideNavCreateEnabled = topNavSectionOn && Boolean(facebookSettings?.hideNavCreate);
            const isHideNavMessengerEnabled = topNavSectionOn && Boolean(facebookSettings?.hideNavMessenger);
            const isHideNavNotificationsEnabled = topNavSectionOn && Boolean(facebookSettings?.hideNavNotifications);
            const isHideNavNewsEnabled = topNavSectionOn && Boolean(facebookSettings?.hideNavNews);
            const isHideNavEventsEnabled = topNavSectionOn && Boolean(facebookSettings?.hideNavEvents);
            const isHideNavFriendRequestsEnabled = topNavSectionOn && Boolean(facebookSettings?.hideNavFriendRequests);
            const isHideNavAccountSwitcherEnabled = topNavSectionOn && Boolean(facebookSettings?.hideNavAccountSwitcher);

            clearFacebookRuntime();

            const shouldEnableFacebookFiltering = isExtensionActive && (
                isSponsoredBlockingEnabled
                || isFeedBlockingEnabled
                || isProfileUpdateBlockingEnabled
                || isProductsShownBlockingEnabled
                || isTrendingBlockingEnabled
                || isLinkInteractionBlockingEnabled
                || isLikePageCardBlockingEnabled
                || isAllPhotoPostsBlockingEnabled
                || isSharedPhotoAlbumBlockingEnabled
                || isUpdatedProfilePictureBlockingEnabled
                || isUploadedPhotoBlockingEnabled
                || is3DPhotoBlockingEnabled
                || isLikedPhotoBlockingEnabled
                || isCommentedPhotoBlockingEnabled
                || isAllVideosBlockingEnabled
                || isLiveVideosBlockingEnabled
                || isVideoInteractionsBlockingEnabled
                || isReelsTrayBlockingEnabled
                || isSingleReelPostBlockingEnabled
                || isDisableVideoAutoplayEnabled
                || isHashtagBlockingEnabled
                || isTextFilterEnabled
                || isAllowByUrlEnabled
                || isSuggestedBlockingEnabled
                || isMarketplaceBlockingEnabled
                || isHideRightColumnAllEnabled
                || isHideRightBirthdaysEnabled
                || isHideRightFriendRequestsEnabled
                || isHideRightYourPagesEnabled
                || isHideRightRecommendedPagesEnabled
                || isHideRightSuggestedGroupsEnabled
                || isHideRightEventsEnabled
                || isHideRightGameAppRequestsEnabled
                || isHideRightMarketplacePanelEnabled
                || isHideRightPokesEnabled
                || isHideRightWatchEnabled
                || isHideRightSponsoredAdsEnabled
                || isHideLeftColumnAllEnabled
                || isHideLeftPagesEnabled
                || isHideLeftGroupsEnabled
                || isHideLeftWatchEnabled
                || isHideLeftMarketplaceEnabled
                || isHideLeftMemoriesEnabled
                || isHideLeftSavedEnabled
                || isHideLeftEventsEnabled
                || isHideLeftGamingEnabled
                || isHideLeftAdsManagerEnabled
                || isHideLeftFundraisersEnabled
                || isHideLeftBloodDonationsEnabled
                || isHideLeftClimateScienceEnabled
                || isHideLeftProfessionalEnabled
                || isHideLeftFeedsMenuEnabled
                || isHideLeftPayAndOrdersEnabled
                || isHideLeftShortcutsEnabled
                || isFreezeTopNavBarEnabled
                || isShowLogoutButtonEnabled
                || isHideSearchBoxAndPopupEnabled
                || isHideNavHomeEnabled
                || isHideNavPagesEnabled
                || isHideNavReelsEnabled
                || isHideNavMarketplaceEnabled
                || isHideNavGroupsEnabled
                || isHideNavGamingEnabled
                || isHideNavCreateEnabled
                || isHideNavMessengerEnabled
                || isHideNavNotificationsEnabled
                || isHideNavNewsEnabled
                || isHideNavEventsEnabled
                || isHideNavFriendRequestsEnabled
                || isHideNavAccountSwitcherEnabled
            );

            isAdBlockEnabled = shouldEnableFacebookFiltering;
            fbBlockConfig = {
                hideNewsfeed: isExtensionActive && isFeedBlockingEnabled,
                hideProfileUpdates: isExtensionActive && isProfileUpdateBlockingEnabled,
                hideProductsShown: isExtensionActive && isProductsShownBlockingEnabled,
                hideTrendingPosts: isExtensionActive && isTrendingBlockingEnabled,
                hideLinkInteractions: isExtensionActive && isLinkInteractionBlockingEnabled,
                hideLikePageCards: isExtensionActive && isLikePageCardBlockingEnabled,
                hideAllPhotoPosts: isExtensionActive && isAllPhotoPostsBlockingEnabled,
                hideSharedPhotoAlbums: isExtensionActive && isSharedPhotoAlbumBlockingEnabled,
                hideUpdatedProfilePictures: isExtensionActive && isUpdatedProfilePictureBlockingEnabled,
                hideUploadedPhotos: isExtensionActive && isUploadedPhotoBlockingEnabled,
                hide3DPhotos: isExtensionActive && is3DPhotoBlockingEnabled,
                hideLikedPhotos: isExtensionActive && isLikedPhotoBlockingEnabled,
                hideCommentedPhotos: isExtensionActive && isCommentedPhotoBlockingEnabled,
                hideAllVideos: isExtensionActive && isAllVideosBlockingEnabled,
                hideLiveVideos: isExtensionActive && isLiveVideosBlockingEnabled,
                hideVideoInteractions: isExtensionActive && isVideoInteractionsBlockingEnabled,
                hideReelsTray: isExtensionActive && isReelsTrayBlockingEnabled,
                hideSingleReelPosts: isExtensionActive && isSingleReelPostBlockingEnabled,
                disableVideoAutoplay: isExtensionActive && isDisableVideoAutoplayEnabled,
                allowByUrlOnly: isExtensionActive && isAllowByUrlEnabled,
                hideHashtagPosts: isExtensionActive && isHashtagBlockingEnabled,
                textFilterEnabled: isExtensionActive && isTextFilterEnabled,
                hideRightColumnAll: isExtensionActive && isHideRightColumnAllEnabled,
                hideRightBirthdays: isExtensionActive && isHideRightBirthdaysEnabled,
                hideRightFriendRequests: isExtensionActive && isHideRightFriendRequestsEnabled,
                hideRightYourPages: isExtensionActive && isHideRightYourPagesEnabled,
                hideRightRecommendedPages: isExtensionActive && isHideRightRecommendedPagesEnabled,
                hideRightSuggestedGroups: isExtensionActive && isHideRightSuggestedGroupsEnabled,
                hideRightEvents: isExtensionActive && isHideRightEventsEnabled,
                hideRightGameAppRequests: isExtensionActive && isHideRightGameAppRequestsEnabled,
                hideRightMarketplacePanel: isExtensionActive && isHideRightMarketplacePanelEnabled,
                hideRightPokes: isExtensionActive && isHideRightPokesEnabled,
                hideRightWatch: isExtensionActive && isHideRightWatchEnabled,
                hideRightSponsoredAds: isExtensionActive && isHideRightSponsoredAdsEnabled,
                hideLeftColumnAll: isExtensionActive && isHideLeftColumnAllEnabled,
                hideLeftPages: isExtensionActive && isHideLeftPagesEnabled,
                hideLeftGroups: isExtensionActive && isHideLeftGroupsEnabled,
                hideLeftWatch: isExtensionActive && isHideLeftWatchEnabled,
                hideLeftMarketplace: isExtensionActive && isHideLeftMarketplaceEnabled,
                hideLeftMemories: isExtensionActive && isHideLeftMemoriesEnabled,
                hideLeftSaved: isExtensionActive && isHideLeftSavedEnabled,
                hideLeftEvents: isExtensionActive && isHideLeftEventsEnabled,
                hideLeftGaming: isExtensionActive && isHideLeftGamingEnabled,
                hideLeftAdsManager: isExtensionActive && isHideLeftAdsManagerEnabled,
                hideLeftFundraisers: isExtensionActive && isHideLeftFundraisersEnabled,
                hideLeftBloodDonations: isExtensionActive && isHideLeftBloodDonationsEnabled,
                hideLeftClimateScience: isExtensionActive && isHideLeftClimateScienceEnabled,
                hideLeftProfessional: isExtensionActive && isHideLeftProfessionalEnabled,
                hideLeftFeedsMenu: isExtensionActive && isHideLeftFeedsMenuEnabled,
                hideLeftPayAndOrders: isExtensionActive && isHideLeftPayAndOrdersEnabled,
                hideLeftShortcuts: isExtensionActive && isHideLeftShortcutsEnabled,
                freezeTopNavBar: isExtensionActive && isFreezeTopNavBarEnabled,
                showLogoutButton: isExtensionActive && isShowLogoutButtonEnabled,
                hideSearchBoxAndPopup: isExtensionActive && isHideSearchBoxAndPopupEnabled,
                hideNavHome: isExtensionActive && isHideNavHomeEnabled,
                hideNavPages: isExtensionActive && isHideNavPagesEnabled,
                hideNavReels: isExtensionActive && isHideNavReelsEnabled,
                hideNavMarketplace: isExtensionActive && isHideNavMarketplaceEnabled,
                hideNavGroups: isExtensionActive && isHideNavGroupsEnabled,
                hideNavGaming: isExtensionActive && isHideNavGamingEnabled,
                hideNavCreate: isExtensionActive && isHideNavCreateEnabled,
                hideNavMessenger: isExtensionActive && isHideNavMessengerEnabled,
                hideNavNotifications: isExtensionActive && isHideNavNotificationsEnabled,
                hideNavNews: isExtensionActive && isHideNavNewsEnabled,
                hideNavEvents: isExtensionActive && isHideNavEventsEnabled,
                hideNavFriendRequests: isExtensionActive && isHideNavFriendRequestsEnabled,
                hideNavAccountSwitcher: isExtensionActive && isHideNavAccountSwitcherEnabled,
                hideSuggestedPosts: isExtensionActive && isSuggestedBlockingEnabled,
                hideMarketplaceAds: isExtensionActive && isMarketplaceBlockingEnabled,
                hideSponsoredPosts: isExtensionActive && isSponsoredBlockingEnabled,
            };

            if (isAdBlockEnabled) {
                scanExistingArticles();
                startObserver();
                startRightColumnManager();
                startLeftColumnManager();
                startTopNavManager();
            }
        });
    });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync' && areaName !== 'local') {
        return;
    }

    if (changes[STORAGE_KEY] || changes[EXTENSION_ACTIVE_KEY]) {
        loadFacebookSettings();
    }
});

chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'inapp-settings-updated' && message.platform === 'facebook') {
        loadFacebookSettings();
    }
});

window.addEventListener('load', () => {
    loadFacebookSettings();
});

loadFacebookSettings();
