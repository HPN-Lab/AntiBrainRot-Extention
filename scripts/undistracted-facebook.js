'use strict';
/* global chrome */

const STORAGE_KEY = 'inAppBlockingSettings';
const EXTENSION_ACTIVE_KEY = 'isExtensionActive';
const ARTICLE_SELECTOR = '[role="article"]';
const HIDDEN_FLAG = 'data-fb-sponsored-hidden';
const PROCESSED_FLAG = 'data-fb-sponsored-checked';
const FEED_HIDDEN_FLAG = 'data-fb-feed-hidden';
const LIKE_PAGE_BTN_HIDDEN_ATTR = 'data-sf-fb-likepage-btn-hidden';
/** Ẩn bảng tin khi Facebook không còn bọc nội dung trong [role="feed"] (chỉ còn [role="article"]). */
/** Bật hook GraphQL trong page (facebook-feed-network-bridge.js) khi ẩn toàn bộ bảng tin. */
const FB_HOME_GRAPHQL_BLOCK_ATTR = 'data-sf-block-home-graphql';
const FB_NEWSFEED_HIDE_ATTR = 'data-sf-hide-fb-newsfeed';
const FB_NEWSFEED_HIDE_STYLE_ID = 'sf-fb-hide-newsfeed-style';
const FB_HOME_FEED_ATTR = 'data-sf-fb-home-feed';
/** Landmark chính (khi Facebook vẫn dùng). */
const FB_NEWSFEED_HIDE_CSS = `
html[data-sf-hide-fb-newsfeed="true"] [role="main"] [role="feed"] {
    display: none !important;
}
html[data-sf-hide-fb-newsfeed="true"] [role="main"] [role="article"],
html[data-sf-hide-fb-newsfeed="true"] [role="main"] article {
    display: none !important;
}
html[data-sf-hide-fb-newsfeed="true"] [role="main"] [data-pagelet^="Stories"] {
    display: none !important;
}
`;
/** Trang chủ: feed đôi khi không nằm trong [role="main"] (DOM muộn hoặc layout mới). */
const FB_NEWSFEED_HIDE_CSS_HOME = `
html[data-sf-hide-fb-newsfeed="true"][data-sf-fb-home-feed="1"] [role="feed"] {
    display: none !important;
}
html[data-sf-hide-fb-newsfeed="true"][data-sf-fb-home-feed="1"] [data-pagelet="FeedTimeline"],
html[data-sf-hide-fb-newsfeed="true"][data-sf-fb-home-feed="1"] [data-pagelet^="FeedUnit_"] {
    display: none !important;
}
`;
/** Trang chủ: ẩn toàn bộ cột chính (FB đôi khi không dùng role=feed/article trong main). */
const FB_NEWSFEED_HIDE_CSS_HOME_MAIN = `
html[data-sf-hide-fb-newsfeed="true"][data-sf-fb-home-feed="1"] [role="main"] {
    display: none !important;
}
`;
/**
 * Theo script.js (FB Purity) ~3780: neo SSR #ssrb_feed_start / #fbpurityinfowrapper để ẩn cột feed khi FB vẫn chèn marker.
 */
const FB_NEWSFEED_HIDE_CSS_FBPURITY = `
html[data-sf-hide-fb-newsfeed="true"] #ssrb_feed_start {
    display: block !important;
}
html[data-sf-hide-fb-newsfeed="true"] #ssrb_feed_start::after {
    color: var(--primary-text, inherit);
    content: "Bảng tin đã ẩn (VMU AntiDistract).";
    display: block;
    padding: 12px 16px;
    font-size: 15px;
}
html[data-sf-hide-fb-newsfeed="true"] #ssrb_feed_start + div[role="feed"],
html[data-sf-hide-fb-newsfeed="true"] #ssrb_feed_start + div {
    display: none !important;
}
html[data-sf-hide-fb-newsfeed="true"] #fbpurityinfowrapper + h3 + div,
html[data-sf-hide-fb-newsfeed="true"] #fbpurityinfowrapper + h3 + div[aria-hidden="true"] + div {
    display: none !important;
}
html[data-sf-hide-fb-newsfeed="true"] #fbpurityinfowrapper::after {
    color: var(--primary-text, inherit);
    content: "Bảng tin đã ẩn (VMU AntiDistract).";
    display: block;
    padding: 12px 16px;
    font-size: 15px;
}
`;
/** script.js hidewholenewsfeedfixforposts: trên /posts/ hoặc Marketplace không áp dụng ẩn sibling #ssrb_feed_start. */
const HIDE_NEWSFEED_SSR_PATH_FIX_ID = 'sf-fb-hidenewsfeed-ssrb-fix';
const MAX_SCAN_TEXT_LENGTH = 6000;
/** Haystack cho Allow từ khóa — không dùng toàn bộ innerText bài (tránh comment/UI). */
const ALLOW_KEYWORD_HAYSTACK_MAX = 5000;
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
    'đã thay đổi ảnh đại diện',
    'đã thay đổi ảnh bìa',
    'thay đổi ảnh đại diện',
    'thay đổi ảnh bìa',
    'cập nhật tiểu sử',
    'cập nhật phần giới thiệu',
    'cập nhật thông tin liên hệ',
    'cập nhật công việc',
    'cập nhật học vấn',
    'cập nhật nơi sống',
    'cập nhật mối quan hệ',
    'đã cập nhật tiểu sử',
    'updated their profile picture',
    'updated his profile picture',
    'updated her profile picture',
    'updated their cover photo',
    'updated his cover photo',
    'updated her cover photo',
    'updated their profile information',
    'updated his profile information',
    'updated her profile information',
    'updated their intro',
    'updated his intro',
    'updated her intro',
    'updated their status',
    'updated his status',
    'updated her status',
    'updated their work',
    'updated their education',
];
const PRODUCT_SHOWN_KEYWORDS = [
    'sản phẩm được hiển thị',
    'sản phẩm từ',
    'products shown',
    'products shown:',
    'featured products',
    'shared a product',
    'items from shop',
];
const TRENDING_KEYWORDS = [
    'đang thịnh hành',
    'thịnh hành',
    'xu hướng',
    'trending',
    '· trending',
    'is trending',
    'trending articles',
    'trending videos',
    'most shared',
    'popular across facebook',
    'featured topic',
    'places trending',
    'top 5 places',
    'recent articles about',
];
/** Legacy: bật một lần cả bốn loại tương tác link (hideLinkInteractionPosts). */
const LINK_INTERACTION_LEGACY_PATTERNS = [
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
const LIKED_PAGE_STORY_PATTERNS = [
    /\bthích\s+trang(\s+này)?\b/i,
    /\bđã\s+thích\s+trang\b/i,
    /\blikes?\s+a\s+page\b/i,
    /\bliked?\s+a\s+page\b/i,
    /\breacted?\s+to\s+a\s+page\b/i,
];
const LIKED_LINK_STORY_PATTERNS = [
    /\bthích\s+(một\s+)?liên kết\b/i,
    /\bđã\s+thích\s+(một\s+)?liên kết\b/i,
    /\bliked?\s+a\s+link\b/i,
    /\blikes?\s+a\s+link\b/i,
];
const SHARED_LINK_STORY_PATTERNS = [
    /\bchia sẻ\s+(một\s+)?liên kết\b/i,
    /\bđã\s+chia sẻ\s+(một\s+)?liên kết\b/i,
    /\bshared?\s+a\s+link\b/i,
];
const COMMENTED_LINK_STORY_PATTERNS = [
    /\bbình luận về\s+(liên kết|điều này)\b/i,
    /\bcommented on\s+(a link|this)\b/i,
];
const LIKE_PAGE_PATTERNS = [
    /\bthích trang\b/i,
    /\blike page\b/i,
    /\bfollow page\b/i,
];
const SHARED_PHOTO_ALBUM_PATTERNS = [
    /\bchia sẻ (một )?(ảnh|album ảnh)\b/i,
    /\bchia sẻ (\d+ )?ảnh\b/i,
    /\bshared? (a )?(photo|album)\b/i,
    /\bshared? (\d+ )?photos?\b/i,
];
const UPDATED_PROFILE_PHOTO_PATTERNS = [
    /\bcập nhật ảnh (đại diện|bìa)\b/i,
    /\bđã cập nhật ảnh (đại diện|bìa)\b/i,
    /\bđã thay đổi ảnh (đại diện|bìa)\b/i,
    /\bthay đổi ảnh (đại diện|bìa)\b/i,
    /\bupdated (their|his|her) (profile picture|cover photo)\b/i,
];
const UPLOADED_PHOTO_PATTERNS = [
    /\bđã tải ảnh lên\b/i,
    /\btải lên (một )?ảnh\b/i,
    /\bđăng (một )?ảnh\b/i,
    /\bđã đăng (một )?ảnh\b/i,
    /\buploaded (a )?photo\b/i,
    /\badded new photos?\b/i,
    /\badded photos?\b/i,
];
const PHOTO_3D_PATTERNS = [
    /\bảnh 3d\b/i,
    /\bảnh ba chiều\b/i,
    /\b3d photo\b/i,
];
const LIKED_PHOTO_PATTERNS = [
    /\bthích (một )?ảnh\b/i,
    /\bđã thích (một )?ảnh\b/i,
    /\bliked? (a )?photo\b/i,
    /\breacted to (a )?photo\b/i,
];
const COMMENTED_PHOTO_PATTERNS = [
    /\bbình luận về (một )?ảnh\b/i,
    /\bđã bình luận về (một )?ảnh\b/i,
    /\bcommented on (a )?photo\b/i,
];
const LIVE_VIDEO_PATTERNS = [
    /\btrực tiếp( ngay bây giờ)?\b/i,
    /\bđang phát trực tiếp\b/i,
    /\bđã phát trực tiếp\b/i,
    /\bvideo trực tiếp\b/i,
    /\bphát trực tiếp\b/i,
    /\bis live now\b/i,
    /\bwas live\b/i,
    /\bstarted a live video\b/i,
    /\bended a live video\b/i,
];
/** Legacy: hideVideoInteractionPosts — bật cả ba loại câu chuyện video. */
const VIDEO_INTERACTION_LEGACY_PATTERNS = [
    /\b(thích|chia sẻ|bình luận về)(.*?)video\b/i,
    /\b(liked|shared|commented on)(.*?)video\b/i,
];
const SHARED_VIDEO_STORY_PATTERNS = [
    /\bchia sẻ\s+(một\s+)?video\b/i,
    /\bđã\s+chia sẻ\s+(một\s+)?video\b/i,
    /\bshared?\s+a\s+video\b/i,
];
const LIKED_VIDEO_STORY_PATTERNS = [
    /\bthích\s+(một\s+)?video\b/i,
    /\bđã\s+thích\s+(một\s+)?video\b/i,
    /\bliked?\s+a\s+video\b/i,
    /\blikes?\s+a\s+video\b/i,
];
const COMMENTED_VIDEO_STORY_PATTERNS = [
    /\bbình luận về\s+(một\s+)?video\b/i,
    /\bđã\s+bình luận về\s+(một\s+)?video\b/i,
    /\bcommented on\s+(a\s+)?video\b/i,
];
const REELS_LABELS = [
    'reels',
    'reels và video ngắn',
    'reels and short videos',
    'video ngắn',
    'short video',
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
    trending: [
        'thịnh hành',
        'đang thịnh hành',
        'xu hướng',
        'trending',
        'most shared',
        'popular across',
        'featured topic',
    ],
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
/** Cụm từ (chữ thường) cho Allow theo từ khóa. */
let allowPostKeywordPhrases = [];
let topNavInitTimer = null;
let topNavObserver = null;
let topNavLogoutDebounceTimer = null;
const TOP_NAV_LOGOUT_RESYNC_DEBOUNCE_MS = 450;
let allowByUrlDebugCount = 0;
/** Khi DEBUG_MODE: log tối đa N bài không trích được URL nguồn (hỗ trợ chỉnh selector). */
const ALLOW_URL_DOM_DEBUG_MAX = 12;
let allowUrlDomDebugCount = 0;
/** Allow URL: bài [role=article] đôi khi chưa có `a[href]` khi observer chạy — chờ hydrate rồi quét lại. */
const allowUrlHydrationObservedArticles = new WeakSet();
let fbBlockConfig = {
    hideNewsfeed: false,
    hideProfileUpdates: true,
    hideProductsShown: true,
    hideTrendingPosts: true,
    hideLinkInteractionsLegacy: false,
    hideLikedPagePost: false,
    hideLikedLinkPost: false,
    hideSharedLinkPost: false,
    hideCommentedLinkPost: false,
    hideLikePageStrip: false,
    hideLikePageCards: false,
    hideAllPhotoPosts: true,
    hideSharedPhotoAlbums: true,
    hideUpdatedProfilePictures: true,
    hideUploadedPhotos: true,
    hide3DPhotos: true,
    hideLikedPhotos: true,
    hideCommentedPhotos: true,
    hideAllVideos: true,
    hideLiveVideos: true,
    hideVideoInteractionsLegacy: false,
    hideSharedVideoPost: false,
    hideLikedVideoPost: false,
    hideCommentedVideoPost: false,
    hideReelsTray: true,
    hideSingleReelPosts: true,
    disableVideoAutoplay: true,
    allowByUrlOnly: false,
    allowPostKeywordsOnly: false,
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
    if (topNavLogoutDebounceTimer !== null) {
        window.clearTimeout(topNavLogoutDebounceTimer);
        topNavLogoutDebounceTimer = null;
    }
    if (topNavObserver) {
        topNavObserver.disconnect();
        topNavObserver = null;
    }
    pendingArticles.clear();
    document.querySelectorAll(`[${LIKE_PAGE_BTN_HIDDEN_ATTR}]`).forEach((el) => {
        el.removeAttribute(LIKE_PAGE_BTN_HIDDEN_ATTR);
        if (el instanceof HTMLElement) {
            el.style.removeProperty('display');
        }
    });
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
    /* Không gỡ data-sf-hide-fb-newsfeed / GraphQL / style ở đây — tránh khoảng trống hook + CSS
       trước khi loadFacebookSettings gán lại; tắt hoàn toàn do syncFacebookNewsfeedHideOverlay + nhánh else. */
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

        if (fbBlockConfig.hideTrendingPosts && isMatch('trending')) {
            markRightColumnHidden(wrapper);
        } else if (shouldHideRightColumnWidget('hideRightBirthdays') && isMatch('birthdays')) {
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
        || fbBlockConfig.hideTrendingPosts
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

/**
 * CSS ẩn top nav: kết hợp aria-label (đa ngôn ngữ) với bộ chọn theo href / legacy
 * từ script.js (FB Purity ~3734–3795, ~4471–4496) để vẫn khớp khi Facebook đổi nhãn.
 */
function getTopNavCssRules() {
    const cssRules = [];
    const B = 'div[role="banner"]';

    if (fbBlockConfig.freezeTopNavBar) {
        cssRules.push(`
            ${B},
            div[aria-label="Facebook"][role="navigation"] {
                position: sticky !important;
                top: 0 !important;
                z-index: 99999 !important;
            }
        `);
    }

    if (fbBlockConfig.hideSearchBoxAndPopup) {
        cssRules.push(`
            #blueBarDOMInspector div[role="search"],
            #searchBarClickRef,
            ${B} div[data-testid="Keycommand_wrapper"],
            ${B} > div > div > div > div > div > div > label[class],
            ${B} > div > div > div > div > div > div > div > div > div > div > div > label[class],
            ${B} input[type="search"],
            input[type="search"][aria-label*="Search"],
            input[type="search"][aria-label*="Tìm kiếm"],
            label[aria-label*="Tìm kiếm"],
            label[aria-label*="Search"],
            ${B} div[role="combobox"] + div[role="listbox"],
            div[aria-label="Tìm kiếm gần đây"],
            div[aria-label="Recent searches"],
            #facebar_typeahead_view_list,
            div.litestandTypeaheadview[data-click="Search"],
            #facebar_typeahead_view_list._21c._2yob,
            #blueBarDOMInspector div.injectedSearchSuggestion,
            div._21es {
                display: none !important;
            }
        `);
    }

    const pushHide = (selectors) => {
        const list = selectors.filter(Boolean);
        if (list.length === 0) {
            return;
        }
        cssRules.push(`${list.join(',\n')} {\n    display: none !important;\n}`);
    };

    if (fbBlockConfig.hideNavHome) {
        pushHide([
            '#blueBarDOMInspector a[data-gt*="home_chrome"]',
            `${B} a[aria-label^="Home"]`,
            `${B} a[aria-label^="Trang chủ"]`,
            `${B} a[role="link"][href="/"]`,
            `${B} a[aria-label="Trang chủ"]`,
            `${B} a[aria-label="Home"]`,
            `${B} div[aria-label="Trang chủ"]`,
            `${B} div[aria-label="Home"]`,
        ]);
    }

    if (fbBlockConfig.hideNavPages) {
        pushHide([
            `${B} a[href^="/pages/"]`,
            'div[data-isanimatedlayout] a[href="/pages/?category=your_pages&ref=bookmarks"]',
            `${B} a[aria-label="Trang"]`,
            `${B} a[aria-label="Pages"]`,
            `${B} div[aria-label="Trang"]`,
            `${B} div[aria-label="Pages"]`,
        ]);
    }

    if (fbBlockConfig.hideNavReels) {
        pushHide([
            `${B} a[href*="/watch/"]`,
            `${B} a[href="/watch/?ref=tab"]`,
            `${B} a[href="/reel/?s=tab"]`,
            `${B} a[href^="/reels/"]`,
            `${B} a[aria-label="Reels"]`,
            `${B} div[aria-label="Reels"]`,
        ]);
    }

    if (fbBlockConfig.hideNavMarketplace) {
        pushHide([
            `${B} a[href*="/marketplace/"]`,
            `${B} a[href="/marketplace/?ref=app_tab"]`,
            `${B} a[aria-label="Marketplace"]`,
            `${B} div[aria-label="Marketplace"]`,
        ]);
    }

    if (fbBlockConfig.hideNavGroups) {
        pushHide([
            `${B} a[href^="/groups/"]`,
            'div[data-isanimatedlayout] a[href="/groups/"]',
            `${B} a[aria-label="Nhóm"]`,
            `${B} a[aria-label="Groups"]`,
            `${B} div[aria-label="Nhóm"]`,
            `${B} div[aria-label="Groups"]`,
        ]);
    }

    if (fbBlockConfig.hideNavGaming) {
        pushHide([
            `${B} a[href*="/gaming/"]`,
            'div[data-isanimatedlayout] a[href="/gaming/?ref=games_tab"]',
            `${B} a[aria-label="Trò chơi"]`,
            `${B} a[aria-label="Gaming"]`,
            `${B} a[aria-label="Gaming Video"]`,
            `${B} div[aria-label="Trò chơi"]`,
            `${B} div[aria-label="Gaming"]`,
            `${B} div[aria-label="Gaming Video"]`,
        ]);
    }

    if (fbBlockConfig.hideNavNews) {
        pushHide([
            `${B} a[href^="/news/"]`,
            `${B} a[aria-label="Tin tức"]`,
            `${B} a[aria-label="News"]`,
            `${B} div[aria-label="Tin tức"]`,
            `${B} div[aria-label="News"]`,
        ]);
    }

    if (fbBlockConfig.hideNavEvents) {
        pushHide([
            `${B} a[href^="/events/"]`,
            `${B} a[aria-label="Sự kiện"]`,
            `${B} a[aria-label="Events"]`,
            `${B} div[aria-label="Sự kiện"]`,
            `${B} div[aria-label="Events"]`,
        ]);
    }

    if (fbBlockConfig.hideNavCreate) {
        pushHide([
            '#creation_hub_entrypoint',
            `${B} div[aria-label="Create"]`,
            `${B} div[aria-label="Tạo"]`,
            `${B} a[aria-label="Tạo"]`,
            `${B} a[aria-label="Create"]`,
        ]);
    }

    if (fbBlockConfig.hideNavMessenger) {
        pushHide([
            '#pagelet_bluebar a[name="mercurymessages"]',
            `${B} div[aria-label="Messenger"]`,
            `${B} a[aria-label^="Messenger"]`,
            `${B} a[aria-label="Tin nhắn"]`,
            `${B} div[aria-label="Tin nhắn"]`,
        ]);
    }

    if (fbBlockConfig.hideNavNotifications) {
        pushHide([
            '#fbNotificationsJewel',
            `${B} div[aria-label^="Notifications"]`,
            `${B} a[aria-label^="Notifications"]`,
            `${B} a[aria-label="Thông báo"]`,
            `${B} div[aria-label="Thông báo"]`,
        ]);
    }

    if (fbBlockConfig.hideNavFriendRequests) {
        pushHide([
            '#fbRequestsJewel',
            '#fb2k_pagelet_bluebar a.jewelButton[data-gt=\'{"ua_id":"jewel:requests"}\']',
            `${B} a[href="/friends/"]`,
            `${B} a[aria-label="Bạn bè"]`,
            `${B} a[aria-label="Friends"]`,
            `${B} a[aria-label="Friend requests"]`,
            `${B} div[aria-label="Bạn bè"]`,
            `${B} div[aria-label="Friends"]`,
            `${B} div[aria-label="Friend requests"]`,
        ]);
    }

    if (fbBlockConfig.hideNavAccountSwitcher) {
        pushHide([
            'div#pagelet_bluebar a[data-tooltip-content="Account switcher"]',
            'div#pagelet_bluebar a[data-tooltip-content="Account Switcher"]',
            `${B} a[aria-label="Chuyển tài khoản"]`,
            `${B} a[aria-label="Switch Accounts"]`,
            `${B} a[aria-label="Chuyển trang profile"]`,
            `${B} div[aria-label="Chuyển tài khoản"]`,
            `${B} div[aria-label="Switch Accounts"]`,
            `${B} div[aria-label="Chuyển trang profile"]`,
        ]);
    }

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

function scheduleTopNavLogoutResync() {
    if (!fbBlockConfig.showLogoutButton) {
        return;
    }
    window.clearTimeout(topNavLogoutDebounceTimer);
    topNavLogoutDebounceTimer = window.setTimeout(() => {
        topNavLogoutDebounceTimer = null;
        injectLogoutShortcut();
    }, TOP_NAV_LOGOUT_RESYNC_DEBOUNCE_MS);
}

function injectLogoutShortcut() {
    if (!fbBlockConfig.showLogoutButton) {
        return;
    }
    const existingLogout = document.getElementById(QUICK_LOGOUT_ID);
    if (existingLogout) {
        if (existingLogout.isConnected) {
            return;
        }
        existingLogout.remove();
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
        if (fbBlockConfig.showLogoutButton && !topNavObserver) {
            topNavObserver = new MutationObserver(() => scheduleTopNavLogoutResync());
            topNavObserver.observe(document.documentElement, { childList: true, subtree: true });
        }
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

function isFacebookPathBlockedForNormalize(pathLower) {
    if (!pathLower || pathLower === '/') {
        return false;
    }
    if (pathLower.startsWith('/l.php')) {
        return true;
    }
    const blockedRoots = ['/login', '/sharer', '/dialog', '/ajax', '/video_redirect', '/flx'];
    return blockedRoots.some((pre) => pathLower === pre || pathLower.startsWith(`${pre}/`));
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
        let path = parsed.pathname.replace(/\/+/g, '/').replace(/\/+$/, '') || '/';
        path = path.toLowerCase();
        if (isFacebookPathBlockedForNormalize(path)) {
            return '';
        }
        if (path === '/profile.php') {
            const id = parsed.searchParams.get('id');
            if (!id) {
                return '';
            }
            return `https://www.facebook.com/profile.php?id=${encodeURIComponent(id)}`;
        }
        return `https://www.facebook.com${path}`;
    } catch (error) {
        return '';
    }
}

/** Áp dụng trên URL đã normalizeFacebookUrl — theo segment path (tránh nhầm "watch" trong "watching"). */
const FB_MEDIA_OR_SYSTEM_PATH_SEGMENTS = new Set([
    'watch',
    'video',
    'videos',
    'reel',
    'reels',
    'stories',
    'story',
    'events',
    'event',
    'marketplace',
    'gaming',
    'ads',
    'help',
    'policies',
    'hashtag',
]);

/** Chỉ segment đầu path — tránh loại nhầm `/user/videos/…`, `/page/photos/…` (vẫn là URL actor). */
function isSystemOrMediaUrl(normalizedUrl) {
    if (typeof normalizedUrl !== 'string' || !normalizedUrl) {
        return true;
    }
    try {
        const u = new URL(normalizedUrl);
        const parts = u.pathname.toLowerCase().split('/').filter(Boolean);
        if (parts.length === 0) {
            return false;
        }
        return FB_MEDIA_OR_SYSTEM_PATH_SEGMENTS.has(parts[0]);
    } catch (_) {
        return true;
    }
}

/** Trang / nhóm / profile — bỏ qua link quảng cáo, reel, l.php, v.v. */
const FB_ACTOR_PATH_RESERVED = new Set([
    'watch', 'reels', 'reel', 'marketplace', 'gaming', 'games', 'events', 'saved', 'groups',
    'pages', 'friends', 'messages', 'notifications', 'settings', 'login', 'recover',
    'bookmarks', 'me', 'ads', 'business', 'help', 'privacy', 'policies', 'reg', 'activities',
    'places', 'fundraisers', 'jobs', 'paid_content', 'share', 'dialog', 'plugins', 'sharer',
    'photo', 'photos', 'videos', 'stories', 'live', 'broadcasts',
]);

/** Segment 2 của URL profile/page vanity: /name/posts/..., /name/about, … — feed hay dùng. */
const FB_ACTOR_VANITY_SECOND_SEG = new Set([
    'posts',
    'about',
    'photos',
    'videos',
    'reels',
    'stories',
    'mentions',
    'community',
    'reviews',
    'likes',
    'events',
    'followers',
    'following',
    'groups',
    'shop',
]);

function isLikelyFacebookActorHref(href) {
    if (typeof href !== 'string' || !href.trim() || href.startsWith('#')) {
        return false;
    }
    const trimmed = href.trim();
    if (/l\.facebook\.com\/l\.php/i.test(trimmed) || /\/l\.php\?/i.test(trimmed)) {
        return false;
    }
    try {
        const u = new URL(trimmed, 'https://www.facebook.com');
        if (!isFacebookHostname(u.hostname)) {
            return false;
        }
        const pathRaw = (u.pathname || '/').replace(/\/+$/, '') || '/';
        const pathLower = pathRaw.toLowerCase();
        if (pathLower.startsWith('/groups/')) {
            const rest = pathRaw.slice('/groups/'.length).replace(/\/+$/, '');
            if (!rest) {
                return false;
            }
            const rLower = rest.toLowerCase();
            if (['discover', 'feed', 'browse', 'you', 'join', 'search'].includes(rLower)) {
                return false;
            }
            return true;
        }
        if (pathLower.startsWith('/pages/') || pathLower.startsWith('/people/')) {
            return true;
        }
        if (pathLower === '/profile.php') {
            return u.searchParams.has('id');
        }
        const parts = pathRaw.split('/').filter(Boolean);
        if (parts.length === 1) {
            const seg = parts[0];
            if (!/^[a-z0-9._-]+$/i.test(seg) || seg.length < 2) {
                return false;
            }
            return !FB_ACTOR_PATH_RESERVED.has(seg.toLowerCase());
        }
        if (parts.length >= 2) {
            const seg0 = parts[0];
            const s0 = seg0.toLowerCase();
            const s1 = parts[1].toLowerCase();
            if (
                /^[a-z0-9._-]+$/i.test(seg0)
                && seg0.length >= 2
                && !FB_ACTOR_PATH_RESERVED.has(s0)
                && FB_ACTOR_VANITY_SECOND_SEG.has(s1)
            ) {
                return true;
            }
        }
        return false;
    } catch (_) {
        return false;
    }
}

/*
 * --- Allow URL & Allow từ khóa (chỉ DOM, không sửa response API) ---
 *
 * Allow URL
 * - Chỉ đọc markup đã render; không đọc GraphQL / fetch.
 * - So khớp URL **nguồn đăng**: ưu tiên **chỉ** `profile_name` / role kết thúc `name` khi DOM có — không trộn thêm heading/header
 *   (tránh link tới trang allow nằm ở tiêu đề phụ / “shared” / `header` làm lọt bài trang khác). Chỉ khi không có link actor ở tầng đó mới dùng heading, rồi fallback trước thân bài.
 * - Danh sách allow: mỗi dòng một hoặc nhiều URL cách nhau bằng dấu phẩy hoặc chấm phẩy.
 * - Chuẩn hóa: `https://www.facebook.com` + path (và `?id=` cho `profile.php`); path hệ thống (/l.php, /login, …) → bỏ.
 * - Khớp: URL trích được === một mục allow, hoặc bắt đầu bằng `allowUrl + '/'` (ví dụ nhóm + permalink path).
 * - Không trích được URL nguồn → coi là không thuộc allow (ẩn bài khi chế độ allow URL bật).
 *
 * Allow từ khóa
 * - Haystack: caption, header, action header, message/story_message roles, post_message, tên actor (profile_name), alt ảnh,
 *   hashtag từ href, thêm một lát extractVisibleText (cap); chuỗi gộp cắt tối đa ALLOW_KEYWORD_HAYSTACK_MAX ký tự.
 * - List từ khóa: mỗi dòng một hoặc nhiều cụm cách nhau bằng dấu phẩy/chấm phẩy; ít nhất một cụm là chuỗi con (không phân biệt hoa thường).
 *
 * Kết hợp
 * - Khi **cả** Allow URL **và** Allow từ khóa đều bật (và có dữ liệu), bài phải thỏa **cả hai** (AND).
 *
 * Thứ tự gate trong shouldHideArticle (trước các bộ lọc ẩn bài khác)
 * 1) isArticleAllowedByUrl — nếu false → ẩn.
 * 2) isArticleAllowedByPostKeywords — nếu false → ẩn.
 * 3) hideNewsfeed toàn feed, rồi sponsored / suggested / … theo pipeline hiện tại.
 */
function parseAllowByUrlList(rawValue) {
    const next = new Set();
    if (typeof rawValue !== 'string' || !rawValue.trim()) {
        return next;
    }
    rawValue.split(/\r?\n/).forEach((line) => {
        line.split(/[,;]+/u).forEach((piece) => {
            const normalized = normalizeFacebookUrl(piece.trim());
            if (normalized) {
                next.add(normalized);
            }
        });
    });
    return next;
}

function parseAllowPostKeywordsList(rawValue) {
    if (typeof rawValue !== 'string' || !rawValue.trim()) {
        return [];
    }
    const seen = new Set();
    const out = [];
    rawValue.split(/\r?\n/).forEach((line) => {
        line.split(/[,;]+/u).forEach((piece) => {
            const t = piece.trim().toLowerCase();
            if (t && !seen.has(t)) {
                seen.add(t);
                out.push(t);
            }
        });
    });
    return out;
}

/** Văn bản từ các vùng message mà FB đôi khi tách khỏi caption — chỉ DOM. */
function getAllowKeywordRenderingRoleText(article) {
    if (!(article instanceof Element)) {
        return '';
    }
    const chunks = [];
    const selectors = [
        '[data-ad-rendering-role="message"]',
        '[data-ad-rendering-role="story_message"]',
    ];
    selectors.forEach((sel) => {
        article.querySelectorAll(sel).forEach((node) => {
            const t = (node.textContent || '').trim();
            if (t.length >= 2) {
                chunks.push(t.slice(0, 900));
            }
        });
    });
    return chunks.join('\n');
}

function getAllowProfileNameText(article) {
    if (!(article instanceof Element)) {
        return '';
    }
    const chunks = [];
    article
        .querySelectorAll('[data-ad-rendering-role="profile_name"], [data-ad-rendering-role$="name"]')
        .forEach((node) => {
            const t = (node.textContent || '').trim();
            if (t.length >= 1) {
                chunks.push(t.slice(0, 400));
            }
        });
    return chunks.join('\n');
}

function getAllowPostMessageTestIdText(article) {
    if (!(article instanceof Element)) {
        return '';
    }
    const chunks = [];
    article.querySelectorAll('[data-testid="post_message"]').forEach((node) => {
        const t = (node.textContent || '').trim();
        if (t.length >= 2) {
            chunks.push(t.slice(0, 900));
        }
    });
    return chunks.join('\n');
}

function getAllowImageAltText(article) {
    if (!(article instanceof Element)) {
        return '';
    }
    const parts = [];
    article.querySelectorAll('img[alt]').forEach((img) => {
        const alt = (img.getAttribute('alt') || '').trim();
        if (alt.length >= 2) {
            parts.push(alt.slice(0, 300));
        }
    });
    return parts.join('\n');
}

function getArticleKeywordHaystack(article) {
    if (!(article instanceof Element)) {
        return '';
    }
    const fromLinks = collectHashtagHrefHaystack(article);
    const visibleSlice = extractVisibleText(article).slice(0, 3000);
    const parts = [
        getAllowProfileNameText(article),
        getCaptionText(article),
        getHeaderText(article),
        getActionHeaderText(article),
        getAllowKeywordRenderingRoleText(article),
        getAllowPostMessageTestIdText(article),
        getAllowImageAltText(article),
        fromLinks,
        visibleSlice,
    ];
    const haystack = parts.filter(Boolean).join('\n').toLowerCase().replace(/\uFF03/g, '#');
    return haystack.slice(0, ALLOW_KEYWORD_HAYSTACK_MAX);
}

function isArticleAllowedByPostKeywords(article) {
    if (!fbBlockConfig.allowPostKeywordsOnly || allowPostKeywordPhrases.length === 0) {
        return true;
    }
    const haystack = getArticleKeywordHaystack(article);
    const ok = allowPostKeywordPhrases.some((phrase) => haystack.includes(phrase));
    return ok;
}

function debugAllowByUrlLog(runId, hypothesisId, location, message, data) {
    if (!DEBUG_MODE) {
        return;
    }
    if (allowByUrlDebugCount >= 40) {
        return;
    }
    allowByUrlDebugCount += 1;
    console.debug(`[VMU-AntiDistract][allow-url] ${message}`, { runId, hypothesisId, location, data });
}

function resolveFacebookHref(anchor) {
    if (!(anchor instanceof Element)) {
        return '';
    }
    let href = (anchor.getAttribute('href') || '').trim();
    if (!href || href === '#') {
        return '';
    }
    if (href.startsWith('//')) {
        href = `https:${href}`;
    } else if (/^www\.facebook\.com\//i.test(href)) {
        href = `https://${href}`;
    }
    if (/^https?:\/\//i.test(href)) {
        return href;
    }
    if (href.startsWith('/')) {
        return `https://www.facebook.com${href}`;
    }
    return '';
}

/** Tầng 1 — actor thật; nếu có kết quả thì KHÔNG gộp tầng 2 (tránh khớp nhầm). */
const ALLOW_URL_PRIMARY_SELECTORS = [
    '[data-ad-rendering-role="profile_name"] a[href]',
    '[data-ad-rendering-role$="name"] a[href]',
];

/** Tầng 2 — chỉ khi tầng 1 không có link; bỏ `header` / aria “shared” (dễ trúng link ngoài actor). */
const ALLOW_URL_SECONDARY_SELECTORS = [
    'h2 a[href], h3 a[href], h1 a[href], h4 a[href], [role="heading"] a[href]',
];

/** Marker thân bài — chỉ dùng link *trước* marker làm fallback actor (tránh role=link trong caption/body khớp nhầm allow). */
const ALLOW_URL_BODY_MARKERS_SELECTOR =
    '[data-ad-rendering-role="story_message"], [data-ad-rendering-role="message"], [data-testid="post_message"]';

function allowUrlAnchorBeforePostBody(anchor, bodyMarker) {
    if (!(anchor instanceof Element)) {
        return true;
    }
    if (!bodyMarker || !(bodyMarker instanceof Element)) {
        return true;
    }
    try {
        const pos = bodyMarker.compareDocumentPosition(anchor);
        return (pos & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
    } catch (_) {
        return true;
    }
}

function allowUrlFilterAnchorsBeforeBody(article, nodeList) {
    const bodyMarker = article.querySelector(ALLOW_URL_BODY_MARKERS_SELECTOR);
    if (!bodyMarker) {
        return Array.from(nodeList);
    }
    return Array.from(nodeList).filter((a) => allowUrlAnchorBeforePostBody(a, bodyMarker));
}

/** Phân loại path cho log (không lộ username/slug). */
/** Khớp exact, allow là tiền tố của source, hoặc source là tiền tố của allow (list nhập dài hơn URL trích được). */
function facebookAllowUrlMatchesSource(source, allowUrl) {
    if (source === allowUrl) {
        return true;
    }
    if (source.startsWith(`${allowUrl}/`)) {
        return true;
    }
    if (allowUrl.startsWith(`${source}/`)) {
        return true;
    }
    return false;
}

/** Thêm biến thể URL để khớp allow (vd. list: /bbc — DOM: /pages/bbc/123). */
function facebookAllowComparableUrls(normalizedHttpsUrl) {
    const out = new Set();
    if (typeof normalizedHttpsUrl !== 'string' || !normalizedHttpsUrl) {
        return out;
    }
    out.add(normalizedHttpsUrl);
    try {
        const u = new URL(normalizedHttpsUrl);
        const path = u.pathname || '';
        const lower = path.toLowerCase();
        const addVanity = (seg) => {
            const s = String(seg || '').toLowerCase();
            if (s && /^[a-z0-9._-]+$/i.test(s) && s.length >= 2) {
                out.add(`https://www.facebook.com/${s}`);
            }
        };
        const mPg = path.match(/^\/pg\/([^/]+)/i);
        if (mPg) {
            addVanity(mPg[1]);
        }
        const mPages = path.match(/^\/pages\/([^/]+)/i);
        if (mPages) {
            addVanity(mPages[1]);
        }
        const mPeople = path.match(/^\/people\/([^/]+)/i);
        if (mPeople) {
            addVanity(mPeople[1]);
        }
        const pathSegs = path.split('/').filter(Boolean);
        if (pathSegs.length >= 2 && FB_ACTOR_VANITY_SECOND_SEG.has(pathSegs[1].toLowerCase())) {
            addVanity(pathSegs[0]);
        }
        if (lower.startsWith('/groups/')) {
            const rest = path.slice('/groups/'.length).split('/')[0];
            if (rest) {
                out.add(`https://www.facebook.com/groups/${rest.toLowerCase()}`);
            }
        }
        const oneSeg = path.split('/').filter(Boolean);
        if (oneSeg.length === 1 && /^\d{5,20}$/.test(oneSeg[0])) {
            const id = oneSeg[0];
            out.add(`https://www.facebook.com/profile.php?id=${encodeURIComponent(id)}`);
        }
        if (lower === '/profile.php' || lower.startsWith('/profile.php')) {
            const id = u.searchParams.get('id');
            if (id && /^\d+$/.test(String(id).trim())) {
                const tid = String(id).trim();
                out.add(`https://www.facebook.com/${tid}`);
                out.add(`https://www.facebook.com/profile.php?id=${encodeURIComponent(tid)}`);
            }
        }
    } catch (_) {
        /* ignore */
    }
    return out;
}

function facebookAllowMatchesAnyPair(sourceUrls, allowSet) {
    for (const source of sourceUrls) {
        const srcCands = facebookAllowComparableUrls(source);
        for (const allowUrl of allowSet) {
            const allowCands = facebookAllowComparableUrls(allowUrl);
            for (const s of srcCands) {
                for (const a of allowCands) {
                    if (facebookAllowUrlMatchesSource(s, a)) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}

function extractArticleSourceUrls(article) {
    if (!(article instanceof Element)) {
        return [];
    }
    const seen = new Set();
    const result = [];

    const tryAddAnchor = (anchor) => {
        if (result.length >= 5) {
            return;
        }
        const raw = resolveFacebookHref(anchor);
        if (!raw) {
            return;
        }
        if (!isLikelyFacebookActorHref(raw)) {
            return;
        }
        const normalized = normalizeFacebookUrl(raw);
        if (!normalized) {
            return;
        }
        if (isSystemOrMediaUrl(normalized)) {
            return;
        }
        if (seen.has(normalized)) {
            return;
        }
        seen.add(normalized);
        result.push(normalized);
    };

    const runSelectorList = (list) => {
        for (let si = 0; si < list.length; si += 1) {
            if (result.length >= 5) {
                break;
            }
            article.querySelectorAll(list[si]).forEach((a) => tryAddAnchor(a));
        }
    };

    runSelectorList(ALLOW_URL_PRIMARY_SELECTORS);

    /** Có actor từ profile_name / *name → dừng, không gộp heading (tránh bài trang khác có link tới trang allow). */
    if (result.length === 0) {
        runSelectorList(ALLOW_URL_SECONDARY_SELECTORS);
    }

    /** FB thường đặt tên actor trong `a[role="link"]` không nằm trong h2 — fallback có trần. */
    if (result.length === 0) {
        const roleLinks = allowUrlFilterAnchorsBeforeBody(article, article.querySelectorAll('a[href][role="link"]'));
        const lim = Math.min(roleLinks.length, 14);
        for (let ri = 0; ri < lim && result.length < 5; ri += 1) {
            tryAddAnchor(roleLinks[ri]);
        }
    }

    if (result.length === 0) {
        const anyAnchors = allowUrlFilterAnchorsBeforeBody(article, article.querySelectorAll('a[href]'));
        const alim = Math.min(anyAnchors.length, 20);
        for (let ai = 0; ai < alim && result.length < 5; ai += 1) {
            tryAddAnchor(anyAnchors[ai]);
        }
    }

    if (result.length === 0) {
        const labelId = article.getAttribute('aria-labelledby');
        const bodyMarker = article.querySelector(ALLOW_URL_BODY_MARKERS_SELECTOR);
        if (labelId) {
            for (const id of labelId.trim().split(/\s+/)) {
                if (!id || result.length >= 5) {
                    break;
                }
                const owner = article.ownerDocument.getElementById(id);
                if (!owner) {
                    continue;
                }
                owner.querySelectorAll('a[href]').forEach((a) => {
                    if (!allowUrlAnchorBeforePostBody(a, bodyMarker)) {
                        return;
                    }
                    tryAddAnchor(a);
                });
            }
        }
    }

    return result;
}

function maybeLogAllowUrlEmptyDomSources(article) {
    if (!DEBUG_MODE || allowUrlDomDebugCount >= ALLOW_URL_DOM_DEBUG_MAX) {
        return;
    }
    if (!fbBlockConfig.allowByUrlOnly || allowUrlSet.size === 0) {
        return;
    }
    allowUrlDomDebugCount += 1;
    const samples = [];
    const anchors = article.querySelectorAll('a[href]');
    for (let i = 0; i < Math.min(10, anchors.length); i += 1) {
        samples.push((anchors[i].getAttribute('href') || '').slice(0, 160));
    }
    console.warn('[VMU-AntiDistract][allow-url] Không trích được URL nguồn từ DOM. Mẫu href (tối đa 10) đầu cây bài:', samples);
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
        maybeLogAllowUrlEmptyDomSources(article);
        debugAllowByUrlLog('run1', 'H4', 'undistracted-facebook.js:isArticleAllowedByUrl', 'article has no source urls', {
            pageHref,
            allowUrlSetSize: allowUrlSet.size,
        });
        return false;
    }
    if (facebookAllowMatchesAnyPair(sourceUrls, allowUrlSet)) {
        debugAllowByUrlLog('run1', 'H2', 'undistracted-facebook.js:isArticleAllowedByUrl', 'matched allow url', {
            pageHref,
            sourceUrls: sourceUrls.slice(0, 3),
            allowUrlSetSample: Array.from(allowUrlSet).slice(0, 3),
        });
        return true;
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
    if (!(tags instanceof Set) && !Array.isArray(tags)) {
        return;
    }
    const iterable = tags instanceof Set ? tags : new Set(tags);
    iterable.forEach((tag) => {
        if (!tag) {
            return;
        }
        const token = escapeRegex(tag);
        const regex = new RegExp(`(^|[^\\p{L}\\p{N}_])#${token}(?=$|[^\\p{L}\\p{N}_])`, 'iu');
        hashtagRegexCache.set(tag, regex);
    });
}

/**
 * Facebook hay gắn hashtag bằng link /hashtag/ten thay vì chữ # trong DOM.
 */
function collectHashtagHrefHaystack(article) {
    if (!(article instanceof Element)) {
        return '';
    }
    const parts = [];
    article.querySelectorAll('a[href]').forEach((a) => {
        const raw = a.getAttribute('href') || '';
        if (!/\/hashtag\//i.test(raw) && !/[?&]hashtag=/i.test(raw)) {
            return;
        }
        try {
            const u = new URL(raw, 'https://www.facebook.com');
            const pathMatch = u.pathname.match(/\/hashtag\/([^/?]+)/i);
            if (pathMatch) {
                const dec = decodeURIComponent(pathMatch[1]).replace(/\+/g, ' ').trim().toLowerCase();
                if (dec) {
                    parts.push(`#${dec}`);
                }
                return;
            }
            const q = u.searchParams.get('hashtag') || u.searchParams.get('q');
            if (q && /^#/i.test(q)) {
                const inner = normalizeHashtagLine(q);
                if (inner) {
                    parts.push(`#${inner}`);
                }
            }
        } catch (_) {
            /* ignore */
        }
    });
    return parts.join(' ');
}

function buildHashtagSearchHaystack(article, captionText, visibleText, headerText, actionHeaderText) {
    const fromLinks = collectHashtagHrefHaystack(article);
    const blob = [
        captionText || '',
        visibleText || '',
        headerText || '',
        actionHeaderText || '',
        fromLinks,
    ]
        .filter(Boolean)
        .join('\n')
        .toLowerCase();
    return blob.replace(/\uFF03/g, '#');
}

/**
 * Khớp từ khóa trong nội dung bài (không bắt buộc có #): ví dụ #vinfast → chặn mọi chỗ có chữ vinfast.
 * Với cụm chỉ a-z0-9_ dùng ranh giới từ để tránh khớp nhầm (vd. không chặn supervinfast).
 */
function plainHashtagTokenMatchesHaystack(haystack, tag) {
    const t = String(tag || '').trim().toLowerCase();
    if (!t || !haystack) {
        return false;
    }
    if (/^[a-z0-9_]+$/i.test(t)) {
        try {
            return new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegex(t)}(?![\\p{L}\\p{N}_])`, 'iu').test(haystack);
        } catch (_) {
            return haystack.includes(t);
        }
    }
    return haystack.includes(t);
}

function hasBlockedHashtagInHaystack(haystack) {
    if (!haystack || hashtagFilterSet.size === 0) {
        return false;
    }
    for (const tag of hashtagFilterSet) {
        if (!tag) {
            continue;
        }
        const hashRegex = hashtagRegexCache.get(tag);
        if (hashRegex && hashRegex.test(haystack)) {
            return true;
        }
        if (haystack.includes(`#${tag}`)) {
            return true;
        }
        if (plainHashtagTokenMatchesHaystack(haystack, tag)) {
            return true;
        }
    }
    return false;
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

function hasOutboundLinkCard(article) {
    if (!(article instanceof Element)) {
        return false;
    }
    return article.querySelector(
        'a[target="_blank"][href*="l.facebook.com/l.php"], a[href*="l.facebook.com/l.php"], a[href*="facebook.com/l.php"]',
    ) !== null;
}

function checkLinkInteractionsLegacy(article, headerText) {
    if (!(article instanceof Element)) {
        return false;
    }

    if (LINK_INTERACTION_LEGACY_PATTERNS.some((pattern) => pattern.test(headerText))) {
        return true;
    }

    return hasOutboundLinkCard(article)
        && /shared?|chia sẻ|link|liên kết|liked?|thích|comment|bình luận/i.test(headerText);
}

function isLikedPageFeedStory(headerText) {
    return matchesAnyPattern(headerText, LIKED_PAGE_STORY_PATTERNS);
}

function isLikedLinkFeedStory(article, headerText) {
    if (matchesAnyPattern(headerText, LIKED_LINK_STORY_PATTERNS)) {
        return true;
    }
    return hasOutboundLinkCard(article)
        && (/\bliked?\s+this\b/i.test(headerText) || /\bthích\s+(bài|điều)\s+này\b/i.test(headerText));
}

function isSharedLinkFeedStory(article, headerText) {
    if (matchesAnyPattern(headerText, SHARED_LINK_STORY_PATTERNS)) {
        return true;
    }
    return hasOutboundLinkCard(article)
        && /shared?|chia sẻ/i.test(headerText)
        && /link|liên kết/i.test(headerText);
}

function isCommentedLinkFeedStory(article, headerText) {
    if (matchesAnyPattern(headerText, COMMENTED_LINK_STORY_PATTERNS)) {
        return true;
    }
    return hasOutboundLinkCard(article)
        && /comment|bình luận/i.test(headerText);
}

function shouldHideLinkFeedInteractions(article, headerText) {
    if (fbBlockConfig.hideLinkInteractionsLegacy && checkLinkInteractionsLegacy(article, headerText)) {
        return true;
    }
    if (fbBlockConfig.hideLikedPagePost && isLikedPageFeedStory(headerText)) {
        return true;
    }
    if (fbBlockConfig.hideLikedLinkPost && isLikedLinkFeedStory(article, headerText)) {
        return true;
    }
    if (fbBlockConfig.hideSharedLinkPost && isSharedLinkFeedStory(article, headerText)) {
        return true;
    }
    if (fbBlockConfig.hideCommentedLinkPost && isCommentedLinkFeedStory(article, headerText)) {
        return true;
    }
    return false;
}

function stripLikePageButtonsInArticle(article) {
    if (!(article instanceof Element) || !fbBlockConfig.hideLikePageStrip) {
        return;
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
        if (!(button instanceof HTMLElement)) {
            continue;
        }
        if (button.getAttribute(LIKE_PAGE_BTN_HIDDEN_ATTR) === '1') {
            continue;
        }
        const aria = (button.getAttribute('aria-label') || '').trim().toLowerCase();
        const text = (button.textContent || '').trim().toLowerCase();
        const haystack = `${aria} ${text}`;
        if (!haystack) {
            continue;
        }
        if (LIKE_PAGE_PATTERNS.some((pattern) => pattern.test(haystack))) {
            button.setAttribute(LIKE_PAGE_BTN_HIDDEN_ATTR, '1');
            button.style.setProperty('display', 'none', 'important');
        }
    }
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
    if (!(article instanceof Element)) {
        return false;
    }
    if (article.querySelector('video')) {
        return true;
    }
    return article.querySelector(
        'a[href*="/watch/"], a[href*="/watch?v="], a[href*="/videos/"], a[href*="/reel/"], a[href*="fb.watch"]',
    ) !== null;
}

function isLiveVideoPost(text, headerText, actionHeaderText) {
    const blob = `${headerText || ''} ${actionHeaderText || ''} ${(text || '').slice(0, 500)}`;
    return matchesAnyPattern(blob, LIVE_VIDEO_PATTERNS);
}

function isSingleReelPost(article, text, headerText, actionHeaderText) {
    if (!(article instanceof Element)) {
        return false;
    }
    if (article.querySelector('a[href*="/reel/"], a[href*="/reels/"]')) {
        return true;
    }
    if (article.querySelector('a[href*="fb.watch/"], a[href*="facebook.com/watch"]')) {
        return true;
    }
    const signalText = `${headerText} ${actionHeaderText} ${(text || '').slice(0, 280)}`;
    return /\breel(s)?\b/i.test(signalText) || /\bvideo ngắn\b/i.test(signalText) || /\bshort video\b/i.test(signalText);
}

function shouldHideVideoFeedStoryInteractions(actionHeaderText, text) {
    const blob = `${actionHeaderText || ''} ${(text || '').slice(0, 500)}`;
    if (fbBlockConfig.hideVideoInteractionsLegacy) {
        if (VIDEO_INTERACTION_LEGACY_PATTERNS.some((p) => p.test(blob))) {
            return true;
        }
    }
    if (fbBlockConfig.hideSharedVideoPost && matchesAnyPattern(blob, SHARED_VIDEO_STORY_PATTERNS)) {
        return true;
    }
    if (fbBlockConfig.hideLikedVideoPost && matchesAnyPattern(blob, LIKED_VIDEO_STORY_PATTERNS)) {
        return true;
    }
    if (fbBlockConfig.hideCommentedVideoPost && matchesAnyPattern(blob, COMMENTED_VIDEO_STORY_PATTERNS)) {
        return true;
    }
    return false;
}

function hasProductsShownCommerceLinks(article) {
    if (!(article instanceof Element)) {
        return false;
    }
    const anchors = article.querySelectorAll('a[href]');
    for (let i = 0; i < anchors.length; i += 1) {
        const h = (anchors[i].getAttribute('href') || '').toLowerCase();
        if (h.includes('/commerce/products/') || h.includes('/commerce/product/')) {
            return true;
        }
        if (/\/shop\/?(\?|#|$)/.test(h) || h.includes('/shop/')) {
            return true;
        }
    }
    return false;
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

    if (hasProductsShownCommerceLinks(article)) {
        return true;
    }

    return false;
}

function isProfileUpdatePost(text, headerText, actionHeaderText) {
    const blob = `${text || ''} ${headerText || ''} ${actionHeaderText || ''}`;
    return includesAnyKeyword(blob, PROFILE_UPDATE_KEYWORDS);
}

function isTrendingPost(text, headerText, actionHeaderText) {
    const headers = `${headerText || ''} ${actionHeaderText || ''}`;
    if (includesAnyKeyword(headers, TRENDING_KEYWORDS)) {
        return true;
    }

    // Facebook can place trending labels near the top section of a post.
    const topSlice = (text || '').slice(0, 450);
    return includesAnyKeyword(topSlice, TRENDING_KEYWORDS);
}

function shouldHideArticle(article) {
    const text = extractVisibleText(article);
    const captionText = getCaptionText(article);
    const headerText = getHeaderText(article);
    const actionHeaderText = getActionHeaderText(article);

    /* Gate Allow: URL trước, từ khóa sau (AND nếu cả hai bật). Xem spec trên parseAllowByUrlList. */
    if (!isArticleAllowedByUrl(article)) {
        debugAllowByUrlLog('run1', 'H3', 'undistracted-facebook.js:shouldHideArticle', 'blocked by allow-by-url gate', {
            pageHref: window.location.href,
        });
        markBlockedByDebug(article, 'allow-by-url:not-allowed');
        return true;
    }

    if (!isArticleAllowedByPostKeywords(article)) {
        markBlockedByDebug(article, 'allow-keywords:not-allowed');
        return true;
    }

    if (fbBlockConfig.hideNewsfeed && article.closest('[role="main"]')) {
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

    if (fbBlockConfig.hideProfileUpdates && isProfileUpdatePost(text, headerText, actionHeaderText)) {
        return true;
    }

    if (fbBlockConfig.hideProductsShown && hasProductsShownSignals(article, text)) {
        return true;
    }

    if (fbBlockConfig.hideTrendingPosts && isTrendingPost(text, headerText, actionHeaderText)) {
        return true;
    }

    if (shouldHideLinkFeedInteractions(article, actionHeaderText)) {
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

    if (shouldHideVideoFeedStoryInteractions(actionHeaderText, text)) {
        return true;
    }

    if (fbBlockConfig.hideSingleReelPosts && isSingleReelPost(article, text, headerText, actionHeaderText)) {
        return true;
    }

    if (fbBlockConfig.hideLiveVideos && isLiveVideoPost(text, headerText, actionHeaderText)) {
        return true;
    }

    if (fbBlockConfig.hideAllVideos && hasVideoElement(article)) {
        return true;
    }

    if (fbBlockConfig.hideHashtagPosts) {
        const hashtagHaystack = buildHashtagSearchHaystack(article, captionText, text, headerText, actionHeaderText);
        if (hasBlockedHashtagInHaystack(hashtagHaystack)) {
            markBlockedByDebug(article, 'hashtag:blocked');
            return true;
        }
    }

    disableVideoAutoplayInArticle(article);

    return false;
}

function isFacebookHomeFeedPath() {
    const p = (location.pathname || '/').replace(/\/+$/, '') || '/';
    return p === '/' || p === '/home.php' || p === '/home';
}

function buildFacebookNewsfeedHideCss() {
    const home = isFacebookHomeFeedPath();
    return FB_NEWSFEED_HIDE_CSS
        + (home ? FB_NEWSFEED_HIDE_CSS_HOME : '')
        + (home ? FB_NEWSFEED_HIDE_CSS_HOME_MAIN : '')
        + FB_NEWSFEED_HIDE_CSS_FBPURITY;
}

function syncHideNewsfeedSsrPathFix() {
    const el = document.getElementById(HIDE_NEWSFEED_SSR_PATH_FIX_ID);
    const on = isAdBlockEnabled && fbBlockConfig.hideNewsfeed;
    const path = String(location.pathname || '');
    const needsShowSsrbSibling = on && (/\/posts\//i.test(path) || /marketplace/i.test(path));

    if (!needsShowSsrbSibling) {
        if (el) {
            el.remove();
        }
        return;
    }
    let st = el;
    if (!st) {
        st = document.createElement('style');
        st.id = HIDE_NEWSFEED_SSR_PATH_FIX_ID;
        (document.head || document.documentElement).appendChild(st);
    }
    st.textContent = 'html[data-sf-hide-fb-newsfeed="true"] #ssrb_feed_start + div { display: block !important; }';
}

function syncFacebookNewsfeedHideOverlay() {
    const root = document.documentElement;
    const on = Boolean(isAdBlockEnabled && fbBlockConfig.hideNewsfeed);
    if (!on) {
        root.removeAttribute(FB_NEWSFEED_HIDE_ATTR);
        root.removeAttribute(FB_HOME_FEED_ATTR);
        const st = document.getElementById(FB_NEWSFEED_HIDE_STYLE_ID);
        if (st) {
            st.remove();
        }
        const fixEl = document.getElementById(HIDE_NEWSFEED_SSR_PATH_FIX_ID);
        if (fixEl) {
            fixEl.remove();
        }
        return;
    }
    root.setAttribute(FB_NEWSFEED_HIDE_ATTR, 'true');
    if (isFacebookHomeFeedPath()) {
        root.setAttribute(FB_HOME_FEED_ATTR, '1');
    } else {
        root.removeAttribute(FB_HOME_FEED_ATTR);
    }
    let st = document.getElementById(FB_NEWSFEED_HIDE_STYLE_ID);
    if (!st) {
        st = document.createElement('style');
        st.id = FB_NEWSFEED_HIDE_STYLE_ID;
        (document.head || document.documentElement).appendChild(st);
    }
    st.textContent = buildFacebookNewsfeedHideCss();
}

function hideNewsfeedIfEnabled() {
    syncFacebookNewsfeedHideOverlay();
    syncHideNewsfeedSsrPathFix();
    rescanMainArticlesForHideNewsfeed();
}

function hideArticle(article) {
    const wrapper = article.closest('[role="article"]') || article;
    if (!(wrapper instanceof HTMLElement)) {
        return;
    }
    if (wrapper.getAttribute(HIDDEN_FLAG) === 'true') {
        return;
    }
    wrapper.setAttribute(HIDDEN_FLAG, 'true');
    wrapper.style.setProperty('display', 'none', 'important');
}

/** Chờ hydrate: chỉ khi đã có link thật (không đếm href="#" / rỗng). */
function articleHasUsableHrefForAllowScan(article) {
    if (!(article instanceof Element)) {
        return false;
    }
    const anchors = article.querySelectorAll('a[href]');
    for (let i = 0; i < anchors.length; i += 1) {
        const raw = (anchors[i].getAttribute('href') || '').trim();
        if (!raw || raw === '#' || raw.startsWith('#')) {
            continue;
        }
        if (/^javascript:/i.test(raw)) {
            continue;
        }
        return true;
    }
    return false;
}

function scanArticle(article) {
    if (!isAdBlockEnabled || !(article instanceof Element)) {
        return;
    }
    if (article.getAttribute(PROCESSED_FLAG) === 'true') {
        return;
    }
    if (
        fbBlockConfig.allowByUrlOnly
        && allowUrlSet.size > 0
        && !articleHasUsableHrefForAllowScan(article)
    ) {
        if (allowUrlHydrationObservedArticles.has(article)) {
            return;
        }
        allowUrlHydrationObservedArticles.add(article);
        const obs = new MutationObserver(() => {
            if (article.querySelectorAll('a[href]').length === 0) {
                return;
            }
            obs.disconnect();
            allowUrlHydrationObservedArticles.delete(article);
            article.removeAttribute(PROCESSED_FLAG);
            queueArticle(article);
        });
        obs.observe(article, { childList: true, subtree: true });
        return;
    }

    article.setAttribute(PROCESSED_FLAG, 'true');
    stripLikePageButtonsInArticle(article);
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

function rescanMainArticlesForHideNewsfeed() {
    if (!isAdBlockEnabled || !fbBlockConfig.hideNewsfeed) {
        return;
    }
    document.querySelectorAll('[role="main"] [role="article"]').forEach((el) => {
        if (!(el instanceof Element)) {
            return;
        }
        if (el.getAttribute(HIDDEN_FLAG) === 'true') {
            return;
        }
        el.removeAttribute(PROCESSED_FLAG);
        scanArticle(el);
    });
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
                && Boolean(facebookSettings?.hideTrendingPosts);
            const hideLinkFeedLegacy = Boolean(facebookSettings?.hideLinkInteractionPosts);
            const isLinkInteractionBlockingEnabled = feedSectionOn && (
                hideLinkFeedLegacy
                || Boolean(facebookSettings?.hideLikedPagePost)
                || Boolean(facebookSettings?.hideLikedLinkPost)
                || Boolean(facebookSettings?.hideSharedLinkPost)
                || Boolean(facebookSettings?.hideCommentedLinkPost)
            );
            const isStripLikePageButtonsEnabled = feedSectionOn
                && Boolean(facebookSettings?.hideLikePageButtons);
            const isHideArticleForLikePageEnabled = feedSectionOn
                && Boolean(facebookSettings?.hideLikePageCards);
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
            const hideVideoFeedLegacy = Boolean(facebookSettings?.hideVideoInteractionPosts);
            const isVideoInteractionsBlockingEnabled = feedSectionOn && (
                hideVideoFeedLegacy
                || Boolean(facebookSettings?.hideSharedVideo)
                || Boolean(facebookSettings?.hideLikedVideo)
                || Boolean(facebookSettings?.hideCommentedOnVideo)
            );
            const isReelsTrayBlockingEnabled = feedSectionOn
                && (facebookSettings?.hideReelsShortVideo || facebookSettings?.hideReelsTray);
            const isSingleReelPostBlockingEnabled = feedSectionOn
                && (facebookSettings?.hideSingleReelPosts || facebookSettings?.hideReelsShortVideo);
            const isDisableVideoAutoplayEnabled = feedSectionOn
                && (facebookSettings?.disableVideoAutoplayFacebook || facebookSettings?.disableVideoAutoplay);
            const isTextFilterSectionEnabled = facebookSettings.masterSectionIII !== false;
            const userTextKeywords = parseUserTextKeywords(facebookSettings?.textFilterKeywords || '');
            buildRegexEngine(userTextKeywords);
            const isTextFilterEnabled = isTextFilterSectionEnabled && userTextKeywords.length > 0;
            const allowByUrlSectionOn = facebookSettings.masterSectionIV !== false;
            allowUrlSet = parseAllowByUrlList(facebookSettings?.allowByUrlList || '');
            const isAllowByUrlEnabled = allowByUrlSectionOn
                && Boolean(facebookSettings?.allowByUrlOnly)
                && allowUrlSet.size > 0;
            allowPostKeywordPhrases = parseAllowPostKeywordsList(facebookSettings?.allowPostKeywordsList || '');
            const isAllowPostKeywordsEnabled = allowByUrlSectionOn
                && Boolean(facebookSettings?.allowPostKeywordsOnly)
                && allowPostKeywordPhrases.length > 0;
            debugAllowByUrlLog('run1', 'H1', 'undistracted-facebook.js:loadFacebookSettings', 'computed allow-by-url config', {
                pageHref: window.location.href,
                allowByUrlSectionOn,
                allowByUrlOnlyRaw: Boolean(facebookSettings?.allowByUrlOnly),
                allowUrlSetSize: allowUrlSet.size,
                isAllowByUrlEnabled,
            });
            hashtagFilterSet = parseHashtagFilters(facebookSettings?.hashtagFilterKeywords);
            buildHashtagRegexCache(hashtagFilterSet);
            const isHashtagBlockingEnabled = feedSectionOn
                && Boolean(facebookSettings?.hideHashtagPosts)
                && hashtagFilterSet.size > 0;
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
                || isStripLikePageButtonsEnabled
                || isHideArticleForLikePageEnabled
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
                || isAllowPostKeywordsEnabled
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
                hideLinkInteractionsLegacy: isExtensionActive && feedSectionOn && hideLinkFeedLegacy,
                hideLikedPagePost: isExtensionActive && feedSectionOn
                    && !hideLinkFeedLegacy && Boolean(facebookSettings?.hideLikedPagePost),
                hideLikedLinkPost: isExtensionActive && feedSectionOn
                    && !hideLinkFeedLegacy && Boolean(facebookSettings?.hideLikedLinkPost),
                hideSharedLinkPost: isExtensionActive && feedSectionOn
                    && !hideLinkFeedLegacy && Boolean(facebookSettings?.hideSharedLinkPost),
                hideCommentedLinkPost: isExtensionActive && feedSectionOn
                    && !hideLinkFeedLegacy && Boolean(facebookSettings?.hideCommentedLinkPost),
                hideLikePageStrip: isExtensionActive && isStripLikePageButtonsEnabled,
                hideLikePageCards: isExtensionActive && isHideArticleForLikePageEnabled,
                hideAllPhotoPosts: isExtensionActive && isAllPhotoPostsBlockingEnabled,
                hideSharedPhotoAlbums: isExtensionActive && isSharedPhotoAlbumBlockingEnabled,
                hideUpdatedProfilePictures: isExtensionActive && isUpdatedProfilePictureBlockingEnabled,
                hideUploadedPhotos: isExtensionActive && isUploadedPhotoBlockingEnabled,
                hide3DPhotos: isExtensionActive && is3DPhotoBlockingEnabled,
                hideLikedPhotos: isExtensionActive && isLikedPhotoBlockingEnabled,
                hideCommentedPhotos: isExtensionActive && isCommentedPhotoBlockingEnabled,
                hideAllVideos: isExtensionActive && isAllVideosBlockingEnabled,
                hideLiveVideos: isExtensionActive && isLiveVideosBlockingEnabled,
                hideVideoInteractionsLegacy: isExtensionActive && feedSectionOn && hideVideoFeedLegacy,
                hideSharedVideoPost: isExtensionActive && feedSectionOn
                    && !hideVideoFeedLegacy && Boolean(facebookSettings?.hideSharedVideo),
                hideLikedVideoPost: isExtensionActive && feedSectionOn
                    && !hideVideoFeedLegacy && Boolean(facebookSettings?.hideLikedVideo),
                hideCommentedVideoPost: isExtensionActive && feedSectionOn
                    && !hideVideoFeedLegacy && Boolean(facebookSettings?.hideCommentedOnVideo),
                hideReelsTray: isExtensionActive && isReelsTrayBlockingEnabled,
                hideSingleReelPosts: isExtensionActive && isSingleReelPostBlockingEnabled,
                disableVideoAutoplay: isExtensionActive && isDisableVideoAutoplayEnabled,
                allowByUrlOnly: isExtensionActive && isAllowByUrlEnabled,
                allowPostKeywordsOnly: isExtensionActive && isAllowPostKeywordsEnabled,
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

            if (isAdBlockEnabled && fbBlockConfig.hideNewsfeed) {
                document.documentElement.setAttribute(FB_HOME_GRAPHQL_BLOCK_ATTR, 'true');
            } else {
                document.documentElement.removeAttribute(FB_HOME_GRAPHQL_BLOCK_ATTR);
            }

            if (isAdBlockEnabled) {
                scanExistingArticles();
                startObserver();
                startRightColumnManager();
                startLeftColumnManager();
                startTopNavManager();
            }
            hideNewsfeedIfEnabled();
        });
    });
}

window.addEventListener('popstate', () => {
    hideNewsfeedIfEnabled();
});

window.addEventListener('message', (ev) => {
    try {
        const h = new URL(ev.origin).hostname.toLowerCase().replace(/^www\./, '');
        if (h !== 'facebook.com' && !h.endsWith('.facebook.com')) {
            return;
        }
    } catch (_) {
        return;
    }
    if (ev.data?.source !== 'sf-fb-ext' || ev.data?.type !== 'sf-nav') {
        return;
    }
    hideNewsfeedIfEnabled();
});

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
