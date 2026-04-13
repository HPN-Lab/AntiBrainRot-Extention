'use strict';
/* global chrome */

const STORAGE_KEY = 'inAppBlockingSettings';
const EXTENSION_ACTIVE_KEY = 'isExtensionActive';
/** Bài trên bảng tin — đúng `individualpostdomquery` script.js ~341. */
const ARTICLE_SELECTOR = 'div[aria-posinset],div[role="feed"] div[role="article"],div[role="feed"] article';
/** Gốc một bài (closest / ẩn cả khối). */
const FEED_POST_ROOT_SELECTOR = 'div[aria-posinset],div[role="feed"] div[role="article"],div[role="feed"] article,div[role="article"],article';
/** Bài trong [role=main] khi cần quét lại (ẩn cả bảng tin). */
const MAIN_COLUMN_POST_SELECTOR = '[role="main"] div[aria-posinset],[role="main"] div[role="feed"] div[role="article"],[role="main"] div[role="feed"] article,[role="main"] div[role="article"],[role="main"] article';
const HIDDEN_FLAG = 'data-fb-sponsored-hidden';
const PROCESSED_FLAG = 'data-fb-sponsored-checked';
const FEED_HIDDEN_FLAG = 'data-fb-feed-hidden';
const LIKE_PAGE_BTN_HIDDEN_ATTR = 'data-sf-fb-likepage-btn-hidden';
/** Ẩn bảng tin khi Facebook chỉ còn [role="article"] / article / div[aria-posinset] thay vì khung feed đầy đủ. */
/** Bật hook GraphQL trong page (facebook-feed-network-bridge.js) khi ẩn toàn bộ bảng tin. */
const FB_HOME_GRAPHQL_BLOCK_ATTR = 'data-sf-block-home-graphql';
const FB_GRAYSCALE_ATTR = 'sf-fb-grayscale-mode';
const FB_GRAYSCALE_STYLE_ID = 'sf-fb-grayscale-style';

function ensureFacebookGrayscaleStyle() {
    if (document.getElementById(FB_GRAYSCALE_STYLE_ID)) {
        return;
    }
    const el = document.createElement('style');
    el.id = FB_GRAYSCALE_STYLE_ID;
    el.textContent = `html[${FB_GRAYSCALE_ATTR}="true"]{filter:grayscale(1)!important;}`;
    (document.head || document.documentElement).appendChild(el);
}

function syncFacebookGrayscale(enabled) {
    ensureFacebookGrayscaleStyle();
    if (enabled) {
        document.documentElement.setAttribute(FB_GRAYSCALE_ATTR, 'true');
    } else {
        document.documentElement.removeAttribute(FB_GRAYSCALE_ATTR);
    }
}
const FB_NEWSFEED_HIDE_ATTR = 'data-sf-hide-fb-newsfeed';
const FB_NEWSFEED_HIDE_STYLE_ID = 'sf-fb-hide-newsfeed-style';
const FB_HOME_FEED_ATTR = 'data-sf-fb-home-feed';
/** Landmark chính (khi Facebook vẫn dùng). */
const FB_NEWSFEED_HIDE_CSS = `
html[data-sf-hide-fb-newsfeed="true"] [role="main"] [role="feed"] {
    display: none !important;
}
html[data-sf-hide-fb-newsfeed="true"] [role="main"] [role="article"],
html[data-sf-hide-fb-newsfeed="true"] [role="main"] article,
html[data-sf-hide-fb-newsfeed="true"] [role="main"] div[aria-posinset] {
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
/**
 * Comet / nhãn đa ngôn ngữ (bổ sung sau lớp F.B. Purity). EN: \bsponsored\b — tránh "unsponsored".
 */
const EN_SPONSORED_TOKEN_RE = /\bsponsored\b/i;
const SPONSORED_NON_EN_FRAGMENTS = [
    'được tài trợ',
    'duoc tai tro',
    'sponsorisé',
    'patrocinado',
    'gesponsert',
    'sponsorizzato',
];
const MAX_ARIA_SPONSORED_SCAN_LEN = 280;
/**
 * F.B. Purity `sponsoredbox`: chuỗi và cách dựng RegExp copy từ script.js — KHÔNG đổi thuật toán.
 * header: new RegExp(headerTextFilter.replace(/,/g,'|'),'gi') — ~4431–4433
 * text: fbpescaperegex → comma→pipe — ~4403–4412, 3698
 * story header: querySelector('h5,h4,h3').textContent — ~6373–6383
 * khớp header: ~6946; text + OCR: ~7022–7024
 * @see scripts/script.js ~503–522, ~3695–3700, ~6946, ~7022
 */
function fbpEscaperegexLikeScriptJs(str) {
    const replacements = {
        '(': '\\(',
        ')': '\\)',
        '[': '\\[',
        ']': '\\]',
        '{': '\\{',
        '}': '\\}',
    };
    let s = str;
    try {
        Object.keys(replacements).forEach((key) => {
            s = s.split(key).join(replacements[key]);
        });
    } catch (e) {
        /* giống script.js: nuốt lỗi */
    }
    return s;
}
/** Đúng nội dung `headerTextFilter +=` dòng sponsoredbox (sau bỏ dấu phẩy đầu → pipe). */
const FBP_SPONSORED_HEADER_FILTER_COMMA_LIST = ' claimed an offer from, posted an offer,shared an offer,shared a product\\.,shared their product\\.,posted a job\\.';
/** Đúng nội dung `extraTextFilter +=` dòng sponsoredbox (không gồm dấu phẩy nối vào chuỗi trước). */
const FBP_SPONSORED_EXTRA_TEXT_FILTER_COMMA_LIST = 'Get Offer ·,Advertiser-sponsored poll,· Paid ·,· Paid for by,Paid partnership ·,Paid Partnership  ·,Get offerAll reactions';
let FBP_SPONSORED_HEADER_RX = null;
let FBP_SPONSORED_TEXT_RX = null;
try {
    FBP_SPONSORED_HEADER_RX = new RegExp(FBP_SPONSORED_HEADER_FILTER_COMMA_LIST.replace(/,/g, '|'), 'gi');
} catch (e) {
    FBP_SPONSORED_HEADER_RX = null;
}
try {
    let tmptextfilter = fbpEscaperegexLikeScriptJs(FBP_SPONSORED_EXTRA_TEXT_FILTER_COMMA_LIST);
    tmptextfilter = tmptextfilter.replace(/,,/g, ',').replace(/,+$|^,+/g, '');
    FBP_SPONSORED_TEXT_RX = new RegExp(tmptextfilter.replace(/,/g, '|').replace(/&#44;/g, ','), 'gi');
} catch (e) {
    FBP_SPONSORED_TEXT_RX = null;
}
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
    /\bchia sẻ album\b/i,
    /\bchia sẻ (\d+ )?ảnh\b/i,
    /\bđã chia sẻ (\d+ )?ảnh\b/i,
    /\bshared? (a )?(photo|album)\b/i,
    /\bshared an album\b/i,
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
    /\bthêm \d+ ảnh\b/i,
    /\bđã thêm \d+ ảnh\b/i,
    /\btải lên (một )?ảnh\b/i,
    /\bđăng (một )?ảnh\b/i,
    /\bđã đăng (một )?ảnh\b/i,
    /\buploaded (a )?photo\b/i,
    /\badded \d+ photos?\b/i,
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
    /\bđang livestream\b/i,
    /\blivestream\b/i,
    /\bđã phát trực tiếp\b/i,
    /\bvideo trực tiếp\b/i,
    /\bphát trực tiếp\b/i,
    /\bis live\b/i,
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
    /\bchia sẻ video\b/i,
    /\bđã\s+chia sẻ\s+(một\s+)?video\b/i,
    /\bđã chia sẻ video\b/i,
    /\bshared?\s+a\s+video\b/i,
];
const LIKED_VIDEO_STORY_PATTERNS = [
    /\bthích\s+(một\s+)?video\b/i,
    /\bthích video\b/i,
    /\bđã\s+thích\s+(một\s+)?video\b/i,
    /\bđã thích video\b/i,
    /\bliked?\s+a\s+video\b/i,
    /\blikes?\s+a\s+video\b/i,
    /\breacted to\s+a\s+video\b/i,
];
const COMMENTED_VIDEO_STORY_PATTERNS = [
    /\bbình luận về\s+(một\s+)?video\b/i,
    /\bbình luận về video\b/i,
    /\bđã\s+bình luận về\s+(một\s+)?video\b/i,
    /\bđã bình luận về video\b/i,
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
const DEBUG_MODE = false;
const RIGHT_COL_SCAN_INTERVAL_MS = 2500;
const RIGHT_COL_HIDDEN_FLAG = 'data-fb-rightcol-hidden';
const LEFT_COL_SCAN_INTERVAL_MS = 3500;
/** script.js ~337–339 `leftrailcode` / `leftrailcode2` / `leftrailcode3` — chỉ đổi tên. */
const LEFT_COL_FBP_CSS_STYLE_ID = 'sf-fb-leftcol-fbp-scriptjs';
const _fbpUiLrSsrbNext = '#ssrb_left_rail_start+div';
const _fbpUiLrBannerAnimLayout = 'div[role="banner"]+div+div[data-isanimatedlayout]';
const _fbpUiLrBannerSingle = 'div[role="banner"]+div';
/** script.js top nav: cùng chuỗi `div[role="banner"]` trong fbpfreestyle / fbpboxstyles — chỉ đổi tên biến. */
const _fbpUiTpBn = 'div[role="banner"]';
const TOP_NAV_STYLE_ID = 'purify-topnav-styles';
const RIGHT_COL_WIDGET_DICTIONARIES = {
    birthdays: ['sinh nhật', 'birthdays', 'birthday'],
    friendRequests: ['yêu cầu kết bạn', 'friend requests'],
    events: ['sự kiện', 'đang diễn ra', 'events', 'happening now'],
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
    allowByUrlOnly: false,
    allowPostKeywordsOnly: false,
    hideHashtagPosts: false,
    textFilterEnabled: false,
    textFilterKeepMatchingOnly: false,
    hideRightColumnAll: false,
    hideRightBirthdays: false,
    hideRightFriendRequests: false,
    hideRightEvents: false,
    hideRightSponsoredAds: false,
    hideLeftColumnAll: false,
    hideLeftPages: false,
    hideLeftGroups: false,
    hideLeftFriends: false,
    hideLeftWatch: false,
    hideLeftMarketplace: false,
    hideLeftMemories: false,
    hideLeftSaved: false,
    hideLeftEvents: false,
    hideLeftCreate: false,
    hideLeftGaming: false,
    hideLeftGameStreaming: false,
    hideLeftAdsManager: false,
    hideLeftFundraisers: false,
    hideLeftBloodDonations: false,
    hideLeftClimateScience: false,
    hideLeftProfessional: false,
    hideLeftFeedsMenu: false,
    hideLeftPayAndOrders: false,
    hideLeftOrderFood: false,
    hideLeftOffers: false,
    hideLeftWeather: false,
    hideLeftShops: false,
    hideLeftLiveVideos: false,
    hideLeftReels: false,
    hideLeftMovies: false,
    hideLeftMessenger: false,
    hideLeftJobs: false,
    hideLeftVotingInformation: false,
    hideLeftCrisisResponse: false,
    hideLeftNews: false,
    hideLeftMetaAI: false,
    hideLeftMusic: false,
    hideLeftShortcuts: false,
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
    hideSuggestedPosts: false,
    hideMarketplaceAds: false,
    hideSponsoredPosts: true,
    grayscaleMode: false,
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
    const styleTag = document.getElementById(TOP_NAV_STYLE_ID);
    if (styleTag) {
        styleTag.remove();
    }
    const leftColFbpStyle = document.getElementById(LEFT_COL_FBP_CSS_STYLE_ID);
    if (leftColFbpStyle) {
        leftColFbpStyle.remove();
    }
    const legacyLogoutBtn = document.getElementById('quick-logout-btn');
    if (legacyLogoutBtn) {
        legacyLogoutBtn.remove();
    }
    document.documentElement.removeAttribute(FB_GRAYSCALE_ATTR);
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

function disclosurePlaintextMatches(text) {
    if (!text || typeof text !== 'string') {
        return false;
    }
    const t = text.trim().toLowerCase();
    if (!t) {
        return false;
    }
    if (EN_SPONSORED_TOKEN_RE.test(t)) {
        return true;
    }
    return SPONSORED_NON_EN_FRAGMENTS.some((frag) => t.includes(frag));
}

/** Haystack = tiêu đề + đầu nội dung hiển thị — tránh khớp ở comment hoặc thân bài xa. */
function getSponsoredLabelHaystack(article, fullVisibleText, headerText, actionHeaderText) {
    const h = (headerText || '').trim().toLowerCase();
    const a = (actionHeaderText || '').trim().toLowerCase();
    const top = (fullVisibleText || '').slice(0, 720).trim().toLowerCase();
    if (h || a) {
        return `${h} ${a} ${top}`.trim();
    }
    if (!(article instanceof Element)) {
        return top;
    }
    const fallbackHeader = getHeaderText(article);
    const fallbackAction = getActionHeaderText(article);
    return `${(fallbackHeader || '').trim().toLowerCase()} ${(fallbackAction || '').trim().toLowerCase()} ${top}`.trim();
}

function matchesSponsoredLabelHaystack(haystack) {
    if (!haystack) {
        return false;
    }
    return disclosurePlaintextMatches(haystack);
}

/** script.js CSS: article[…][data-ft*='"ei":"'] — story promoted trong JSON data-ft. */
function hasScriptJsDataFtEiSponsored(article) {
    if (!(article instanceof Element)) {
        return false;
    }
    const scanFt = (el) => {
        const v = el.getAttribute('data-ft');
        if (!v || typeof v !== 'string') {
            return false;
        }
        return v.includes('"ei":"') || v.includes('"ei":');
    };
    if (article.hasAttribute('data-ft') && scanFt(article)) {
        return true;
    }
    const nodes = article.querySelectorAll('[data-ft]');
    for (let i = 0; i < nodes.length; i++) {
        if (scanFt(nodes[i])) {
            return true;
        }
    }
    return false;
}

/** script.js fbpfreestyle: div.sponsored_ad { display:none } */
function hasScriptJsLegacySponsoredAdClass(article) {
    if (!(article instanceof Element)) {
        return false;
    }
    if (article.classList?.contains('sponsored_ad')) {
        return true;
    }
    return article.querySelector('.sponsored_ad') !== null;
}

/** cleartheshizzle ~6373: storysaction = story.querySelector('h5,h4,h3'). */
function getFbpStorysactionText(article) {
    if (!(article instanceof Element)) {
        return '';
    }
    const storysaction = article.querySelector('h5,h4,h3');
    return storysaction ? String(storysaction.textContent || '') : '';
}

/**
 * cleartheshizzle ~6946 — điều kiện headertextfilterRX (chỉ mẫu sponsoredbox).
 * Dùng textContent gốc cho nhánh split · (không phải extractVisibleText).
 */
function matchesFbpSponsoredHeaderTextFilter(article) {
    if (!FBP_SPONSORED_HEADER_RX) {
        return false;
    }
    const rx = FBP_SPONSORED_HEADER_RX;
    const storysactiontext = getFbpStorysactionText(article);
    if (storysactiontext.length) {
        rx.lastIndex = 0;
        if (rx.test(storysactiontext)) {
            return true;
        }
    }
    const nodeText = article.textContent || '';
    if (nodeText.includes('\u00b7')) {
        rx.lastIndex = 0;
        if (rx.test(nodeText.split('\u00b7')[0])) {
            return true;
        }
    }
    return false;
}

/** cleartheshizzle ~6963–6967: OCR từ img alt cho text filter. */
function getFbpStoryOcrChunk(article) {
    if (!(article instanceof Element)) {
        return '';
    }
    const img = article.querySelector('img[alt*="text that says"]');
    if (!img) {
        return '';
    }
    const alt = img.getAttribute('alt') || '';
    const ocrImageTextMatch = alt.match(/text that says ('|")(.*)('|")$/);
    if (ocrImageTextMatch && ocrImageTextMatch.length > 2 && ocrImageTextMatch[2]) {
        return ocrImageTextMatch[2];
    }
    return '';
}

/**
 * cleartheshizzle ~7022–7024 — cùng chuỗi `story.textContent` (+ OCR) dùng cho textfilterRX sponsored;
 * hashtag filter tái sử dụng (lower-case ở bước ghép haystack).
 */
function getFbpStoryBodyTextForTextFilter(article) {
    if (!(article instanceof Element)) {
        return '';
    }
    const ocrImageText = getFbpStoryOcrChunk(article);
    const storyText = article.textContent || '';
    return ocrImageText.length ? `${storyText} ${ocrImageText}` : storyText;
}

/**
 * cleartheshizzle ~7022–7024 — textfilterRX trên toàn story.textContent (+ OCR).
 * Giống FBP: không cắt 4800, không lower-case.
 */
function matchesFbpSponsoredStoryTextFilter(article) {
    if (!FBP_SPONSORED_TEXT_RX) {
        return false;
    }
    const haystack = getFbpStoryBodyTextForTextFilter(article);
    if (!haystack.length) {
        return false;
    }
    FBP_SPONSORED_TEXT_RX.lastIndex = 0;
    const tmpmatch = haystack.match(FBP_SPONSORED_TEXT_RX);
    return Boolean(tmpmatch && tmpmatch.length);
}

function markBlockedByDebug(article, reason) {
    if (!DEBUG_MODE || !(article instanceof HTMLElement)) {
        return;
    }
    article.style.setProperty('outline', '3px solid #ef4444', 'important');
    article.style.setProperty('background', 'rgba(239,68,68,0.12)', 'important');
    article.setAttribute('data-fb-block-reason', reason);
}

function hasSponsoredLabelInAria(article) {
    if (!(article instanceof Element)) {
        return false;
    }
    const nodes = article.querySelectorAll('[aria-label], svg[aria-label], svg title');
    for (const node of nodes) {
        const raw = node.getAttribute && node.getAttribute('aria-label')
            ? node.getAttribute('aria-label').trim()
            : '';
        const tc = (node.textContent || '').trim();
        const combined = `${raw} ${tc}`.trim().toLowerCase();
        if (!combined) {
            continue;
        }
        if (combined.length > MAX_ARIA_SPONSORED_SCAN_LEN) {
            continue;
        }
        if (disclosurePlaintextMatches(combined)) {
            return true;
        }
    }
    return false;
}

/**
 * Bản sao `AD_LANG_MAP` script.js ~345–412 — dùng cho adString / adStringRegEx / sponsormatchRX.
 * Tên biến nội bộ đổi để tránh trùng chuỗi với script gốc.
 */
const FBP_UI_AD_LANG_MAP = {
    af_ZA: ['Geborg', 'Adverteerderskakel'],
    id_ID: ['Bersponsor', 'Tautan pengiklan'],
    ms_MY: ['Ditaja', 'Pautan pengiklan'],
    bs_BA: ['Sponzorirano', ''],
    ca_ES: ['Patrocinat', ''],
    cs_CZ: ['Sponzorováno', 'Odkaz od inzerenta'],
    da_DK: ['Sponsoreret', 'Link fra annoncør'],
    de_DE: ['Anzeige', 'Werbelink'],
    et_EE: ['Sponsitud', ''],
    en_GB: ['Sponsored', 'Advertiser link'],
    en_US: ['Sponsored', 'Advertiser link'],
    en_PI: ['Chartered', ''],
    es_LA: ['Publicidad', 'Enlace del anunciante'],
    es_CO: ['Patrocinado', 'Enlace del anunciante'],
    es_ES: ['Publicidad', 'Enlace del anunciante'],
    eu_ES: ['Babestua', ''],
    tl_PH: ['May Sponsor', 'Link ng advertiser'],
    fr_CA: ['Commandité', 'Lien de l\’annonceur'],
    fr_FR: ['Sponsorisé', 'Lien de l\’annonceur'],
    ga_IE: ['Urraithe', ''],
    hr_HR: ['Plaćeni oglas', 'Veza oglašivača'],
    is_IS: ['Kostað', 'Advertiser link'],
    it_IT: ['Sponsorizzato', "Link dell'inserzionista"],
    lv_LV: ['Apmaksāta reklāma', ''],
    lt_LT: ['Rėmėjai', ''],
    hu_HU: ['Hirdetés', 'Hirdető hivatkozása'],
    nl_NL: ['Gesponsord', 'Adverteerderslink'],
    nl_BE: ['Gesponsord', 'Adverteerderslink'],
    nb_NO: ['Sponset', 'Annonsørlenke'],
    nn_NO: ['Sponsa', 'Advertiser link'],
    pl_PL: ['Sponsorowane', 'Link reklamodawcy'],
    pt_BR: ['Patrocinado', 'Link do anunciante'],
    pt_PT: ['Patrocinado', 'Ligação do anunciante'],
    ro_RO: ['Sponsorizat', 'Link promotor'],
    sq_AL: ['Sponsorizuar', ''],
    sk_SK: ['Sponzorované', 'Odkaz na inzerenta'],
    sl_SI: ['Sponzorirano', 'Povezava oglaševalca'],
    fi_FI: ['Sponsoroitu', 'Mainostajan linkki'],
    sv_SE: ['Sponsrad', 'Annonsörlänk'],
    vi_VN: ['Được tài trợ', 'Liên kết của nhà quảng cáo'],
    tr_TR: ['Sponsorlu', 'Reklamveren bağlantısı'],
    el_GR: ['Χορηγούμενη', 'Σύνδεσμος διαφημιζόμενου'],
    bg_BG: ['Спонсорирано', 'Връзка на рекламодателя'],
    mk_MK: ['Спонзорирано', ''],
    ru_RU: ['Реклама', 'Ссылка рекламодателя'],
    sr_RS: ['Спонзорисано', ''],
    uk_UA: ['Реклама', ''],
    he_IL: ['ממומן', 'קישור של מפרסם'],
    ur_PK: ['تعاون کردہ', ''],
    ar_AR: ['مُموَّل', 'رابط المعلن'],
    fa_IR: ['دارای پشتیبانی مالی', ''],
    ne_NP: ['प्रायोजित', ''],
    hi_IN: ['प्रायोजित', 'विज्ञापनाता का लिंक'],
    bn_IN: ['সৌজন্যে', ''],
    pa_IN: ['ਸਰਪ੍ਰਸਤੀ ਪ੍ਰਾਪਤ', ''],
    gu_IN: ['પ્રાયોજિત', ''],
    ta_IN: ['ஸ்பான்சர் செய்யப்பட்டது', ''],
    ml_IN: ['സ്പോൺസർ ചെയ്തത്', ''],
    th_TH: ['ได้รับการสนับสนุน', 'ลิงก์ของโฆษณา'],
    my_MM: ['ပံ့ပိုးထားသည်', ''],
    ko_KR: ['Sponsored', '광고주 링크'],
    ja_JP: ['広告', '広告主によるリンク'],
    ja_KS: ['広告', '広告主によるリンク'],
    zh_CN: ['赞助内容', '广告主链接'],
    zh_TW: ['贊助', '廣告商連結'],
    zh_HK: ['贊助', '廣告商連結'],
};

let _fbpUiSpLocaleCache = null;

function detectFbpUiLangCodeLikeScript() {
    try {
        const htmlLang = (document.documentElement && document.documentElement.getAttribute('lang'))
            ? document.documentElement.getAttribute('lang').replace('-', '_')
            : '';
        if (htmlLang && FBP_UI_AD_LANG_MAP[htmlLang]) {
            return htmlLang;
        }
        const links = document.querySelectorAll('link[href*="static.xx.fbcdn.net"]');
        for (let i = 0; i < links.length; i++) {
            const src = links[i].getAttribute('href') || '';
            const m = src.match(/\/(.._..)\//);
            if (m) {
                return m[1];
            }
        }
    } catch (e) {
        /* giống script.js: nuốt */
    }
    return 'en_US';
}

function getFbpUiSponsoredLocaleBundle() {
    if (_fbpUiSpLocaleCache) {
        return _fbpUiSpLocaleCache;
    }
    let langKey = detectFbpUiLangCodeLikeScript();
    let primary = 'Sponsored';
    let secondary = 'Advertiser link';
    try {
        const row = FBP_UI_AD_LANG_MAP[langKey];
        if (row && row[0]) {
            primary = row[0];
            secondary = row[1] || secondary;
        }
    } catch (e) {
        langKey = 'en_US';
    }
    const primaryLen = primary.length;
    let charRunRx = null;
    let storyDotRx = null;
    try {
        charRunRx = new RegExp(`[${primary}]{${primaryLen},}`);
        /* script.js ~11013: không cờ `i` */
        storyDotRx = new RegExp(`^X?Suggested |FacebookSuggested|sponsoredtriangle|playersPlay Now|${primary} \u00b7`);
    } catch (e) {
        charRunRx = null;
        storyDotRx = null;
    }
    _fbpUiSpLocaleCache = {
        langKey,
        primary,
        secondary,
        primaryLen,
        charRunRx,
        storyDotRx,
    };
    return _fbpUiSpLocaleCache;
}

function fbpUiMeasureCanvasWordWidth735(imageData, bgColor) {
    const data = imageData.data;
    const bgColorRed = bgColor[0];
    const bgColorGreen = bgColor[1];
    const bgColorBlue = bgColor[2];
    let minX = imageData.width;
    let maxX = 0;
    for (let x = 0; x < imageData.width; x++) {
        for (let y = 0; y < imageData.height; y++) {
            const index = (y * imageData.width + x) * 4;
            const red = data[index];
            const green = data[index + 1];
            const blue = data[index + 2];
            if (red !== bgColorRed || green !== bgColorGreen || blue !== bgColorBlue) {
                if (x < minX) {
                    minX = x;
                }
                if (x > maxX) {
                    maxX = x;
                }
            }
        }
    }
    return maxX - minX + 1;
}

/** script.js checkforsponsoredpostOct23 ~11066 — chỉ nhánh 71/88/79 (không có currentSPWidth). */
function fbpUiApplyOct23CanvasHideIfMatch(targetEl) {
    if (!(targetEl instanceof HTMLElement) || !document.contains(targetEl)) {
        return;
    }
    const canvas = targetEl.querySelector('canvas');
    if (!canvas || canvas.width === 0) {
        return;
    }
    let ctx;
    try {
        ctx = canvas.getContext('2d', { willReadFrequently: true });
    } catch (e) {
        return;
    }
    if (!ctx) {
        return;
    }
    const bgColorSample = ctx.getImageData(0, 0, 1, 1).data;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const wordWidth = fbpUiMeasureCanvasWordWidth735(imageData, bgColorSample);
    if (wordWidth === 71 || wordWidth === 88 || wordWidth === 79) {
        hideArticle(targetEl);
    }
}

function scheduleFbpUiOct23CanvasProbe(storyEl) {
    try {
        window.setTimeout(fbpUiApplyOct23CanvasHideIfMatch, 500, storyEl);
    } catch (e) {
        /* giống script.js */
    }
}

function matchesFbpUiSpObjectOct25(storyEl, charRunRx) {
    if (!(storyEl instanceof Element) || !charRunRx) {
        return false;
    }
    try {
        const objectTagsInNode = storyEl.querySelectorAll('object');
        if (objectTagsInNode.length >= 3) {
            const targetObject = objectTagsInNode[2];
            const innerLink = targetObject.querySelector('a');
            if (innerLink && innerLink.textContent.replace(/-/g, '').match(charRunRx)) {
                return true;
            }
        }
    } catch (e) {
        /* script.js: log trong debug — bỏ qua */
    }
    return false;
}

function matchesFbpUiSpSvgJun25(storyEl, charRunRx) {
    if (!(storyEl instanceof Element) || !charRunRx) {
        return false;
    }
    try {
        const rawSvg = storyEl.querySelector('SVG:not([class])');
        const useEl = rawSvg && rawSvg.querySelector('use');
        const href = useEl && (useEl.getAttribute('xlink:href') || useEl.getAttribute('href'));
        if (!href) {
            return false;
        }
        const sym = document.querySelector(href);
        const txt = sym && sym.parentNode && sym.parentNode.textContent;
        return Boolean(txt && txt.match(charRunRx));
    } catch (e) {
        return false;
    }
}

function matchesFbpUiSpSvgUseSep22(storyEl, charRunRx) {
    if (!(storyEl instanceof Element) || !charRunRx) {
        return false;
    }
    try {
        const svguse = storyEl.querySelector('svg>use');
        if (!svguse) {
            return false;
        }
        const svgusexlink = svguse.getAttribute('xlink:href') || svguse.getAttribute('href');
        if (!svgusexlink) {
            return false;
        }
        const symNode = document.querySelector(svgusexlink);
        if (!symNode) {
            return false;
        }
        let svgusexlinktext = symNode.nextSibling == null
            ? symNode.textContent
            : symNode.nextSibling.textContent;
        if (svgusexlinktext && svgusexlinktext.match(charRunRx)) {
            return true;
        }
        if (storyEl.querySelectorAll('svg>use').length > 1) {
            const svguse2 = storyEl.querySelectorAll('svg>use')[1];
            const svgusexlink2 = svguse2 && (svguse2.getAttribute('xlink:href') || svguse2.getAttribute('href'));
            if (svgusexlink2) {
                const sym2 = document.querySelector(svgusexlink2);
                const svgusexlinktext2 = sym2 ? sym2.textContent : '';
                if (svgusexlinktext2 && (svgusexlinktext + svgusexlinktext2).match(charRunRx)) {
                    return true;
                }
            }
        }
    } catch (e) {
        return false;
    }
    return false;
}

function matchesFbpUiSpAnchorIndices(storyEl, charRunRx) {
    if (!(storyEl instanceof Element) || !charRunRx) {
        return false;
    }
    const anchors = storyEl.querySelectorAll('a');
    if (anchors.length <= 2) {
        return false;
    }
    const t3 = anchors[3] && anchors[3].innerText && anchors[3].innerText.match(charRunRx);
    const t2 = anchors[2] && anchors[2].innerText && anchors[2].innerText.match(charRunRx);
    return Boolean(t3 || t2);
}

function matchesFbpUiSpFlexSpans2022(storyEl, primaryWord) {
    if (!(storyEl instanceof Element) || !primaryWord) {
        return false;
    }
    const flexRoot = storyEl.querySelector('span[style^="flex"]');
    if (!flexRoot) {
        return false;
    }
    const flexes = storyEl.querySelectorAll('span[style^="flex"]');
    const adString = primaryWord;
    const adStringLength = adString.length;
    const word = [];
    const word2 = [];
    for (let ix = 0; ix < flexes.length; ix++) {
        const y = flexes[ix].textContent;
        if (ix === adStringLength) {
            break;
        }
        let z;
        const om = flexes[ix].outerHTML.match(/order: (\d+)/);
        if (om) {
            z = om[1];
        }
        if (ix > adStringLength - 2) {
            /* eslint-disable-next-line eqeqeq -- đúng biểu thức script.js ~6610 */
            if (typeof (word[z]) != undefined) {
                word2[z] = y;
            } else {
                word2[z + 1] = y;
            }
        /* eslint-disable-next-line eqeqeq -- đúng biểu thức script.js ~6618 */
        } else if (typeof (word[z]) != undefined) {
            word[z] = y;
            word2[z] = y;
        } else {
            word[z + 1] = y;
            word2[z + 1] = y;
        }
    }
    const wholeword = word.filter(Boolean).join('');
    const wholeword2 = word2.filter(Boolean).join('');
    return Boolean(
        (wholeword.length && adString.match(wholeword))
        || (wholeword2.length && adString.match(wholeword2)),
    );
}

function fbpUiFindFlexContainerHargobind(el, minLen) {
    let result = null;
    const style = window.getComputedStyle(el);
    if (style.display === 'flex' && el.children.length >= minLen && el.textContent.length >= minLen) {
        return el;
    }
    for (const child_index in el.children) {
        if (el.children[child_index].nodeType === 1
            && (result = fbpUiFindFlexContainerHargobind(el.children[child_index], minLen))) {
            return result;
        }
    }
    return null;
}

function matchesFbpUiSpHargobindFlex(storyEl, primaryWord) {
    if (!(storyEl instanceof Element) || !primaryWord) {
        return false;
    }
    const adString = primaryWord;
    const minLen = adString.length;
    let found_ad = false;
    const spon_link_containers = storyEl.querySelectorAll('a[role="link"]');
    for (let f = 0; f < spon_link_containers.length; f++) {
        const spon_text_parent = fbpUiFindFlexContainerHargobind(spon_link_containers[f], minLen);
        if (!spon_text_parent) {
            continue;
        }
        let ordered_letters = [];
        Array.prototype.map.call(spon_text_parent.children, (childEl) => {
            const st = window.getComputedStyle(childEl);
            if (st.position === 'relative') {
                ordered_letters[st.order] = childEl.textContent;
            }
        });
        ordered_letters = ordered_letters.join('');
        if (ordered_letters === adString) {
            found_ad = true;
            break;
        }
        const stringSortChars = (text) => text.split('').sort().join('');
        const letters_exclude_regex = new RegExp(`[^${adString}]`, 'g');
        const letters_cleaned = stringSortChars(spon_text_parent.textContent).replace(letters_exclude_regex, '');
        const spon_match_regex = new RegExp(
            Array.prototype.map.call(stringSortChars(adString).split(''), (chr) => `${chr}{2,}`).join(''),
        );
        if (letters_cleaned.match(spon_match_regex)) {
            found_ad = true;
            break;
        }
    }
    return found_ad;
}

function matchesFbpUiSpSubtitleComposite(storyEl, ctx) {
    if (!(storyEl instanceof Element) || !ctx.charRunRx || !ctx.storyDotRx) {
        return false;
    }
    const { primary, charRunRx, storyDotRx } = ctx;
    try {
        const h5div = storyEl.querySelector('h5+div,h6+div');
        const h5match = h5div && h5div.firstChild && h5div.firstChild.innerText
            && h5div.firstChild.innerText.match(charRunRx);
        if (h5match || storyDotRx.test(storyEl.textContent)) {
            return true;
        }
        const branded = storyEl.querySelector(
            `[data-testid="story-subtitle"] [role="link"],`
            + `a[ajaxify^="/feed/verified_voice_context"],`
            + `a[ajaxify^="/feed/branded_content/"],`
            + `[aria-label="${primary}"]>*,`
            + 'a[href^="/ads/about/"]>*',
        );
        return Boolean(branded);
    } catch (e) {
        return false;
    }
}

/**
 * Nhánh sponsoredbox trong cleartheshizzle script.js ~6431–6760 (đồng bộ thứ tự),
 * tên hàm/biến đổi; không gỡ các nhánh Comet/haystack riêng của extension.
 */
function matchesFbpUiCleartheshizzleSponsoredDom(storyEl) {
    if (!(storyEl instanceof Element)) {
        return false;
    }
    const ctx = getFbpUiSponsoredLocaleBundle();
    if (!ctx.charRunRx) {
        return false;
    }
    if (matchesFbpUiSpObjectOct25(storyEl, ctx.charRunRx)) {
        markBlockedByDebug(storyEl, 'sponsored:fbp:oct25-object');
        return true;
    }
    if (matchesFbpUiSpSvgJun25(storyEl, ctx.charRunRx)) {
        markBlockedByDebug(storyEl, 'sponsored:fbp:jun25-svg');
        return true;
    }
    scheduleFbpUiOct23CanvasProbe(storyEl);
    if (matchesFbpUiSpSvgUseSep22(storyEl, ctx.charRunRx)) {
        markBlockedByDebug(storyEl, 'sponsored:fbp:sep22-svg-use');
        return true;
    }
    if (matchesFbpUiSpAnchorIndices(storyEl, ctx.charRunRx)) {
        markBlockedByDebug(storyEl, 'sponsored:fbp:anchor-index');
        return true;
    }
    if (matchesFbpUiSpFlexSpans2022(storyEl, ctx.primary)) {
        markBlockedByDebug(storyEl, 'sponsored:fbp:flex-2022');
        return true;
    }
    if (matchesFbpUiSpHargobindFlex(storyEl, ctx.primary)) {
        markBlockedByDebug(storyEl, 'sponsored:fbp:hargobind-flex');
        return true;
    }
    if (matchesFbpUiSpSubtitleComposite(storyEl, ctx)) {
        markBlockedByDebug(storyEl, 'sponsored:fbp:subtitle-composite');
        return true;
    }
    return false;
}

function checkSponsoredPost(article, text, headerText, actionHeaderText) {
    /* fbpfreestyle + cleartheshizzle (sponsoredbox), sau đó Comet. script.js không sửa. */
    if (hasScriptJsDataFtEiSponsored(article)) {
        markBlockedByDebug(article, 'sponsored:fbp:data-ft-ei');
        return true;
    }
    if (hasScriptJsLegacySponsoredAdClass(article)) {
        markBlockedByDebug(article, 'sponsored:fbp:sponsored_ad');
        return true;
    }
    if (matchesFbpUiCleartheshizzleSponsoredDom(article)) {
        return true;
    }
    if (matchesFbpSponsoredHeaderTextFilter(article)) {
        markBlockedByDebug(article, 'sponsored:fbp:header_text_filter');
        return true;
    }
    if (matchesFbpSponsoredStoryTextFilter(article)) {
        markBlockedByDebug(article, 'sponsored:fbp:story_text_filter');
        return true;
    }
    if (article.querySelector('a[href*="/ad_preferences/"]')) {
        markBlockedByDebug(article, 'sponsored:ad_preferences');
        return true;
    }
    if (hasSponsoredLabelInAria(article)) {
        markBlockedByDebug(article, 'sponsored:aria');
        return true;
    }
    const labelHaystack = getSponsoredLabelHaystack(article, text, headerText, actionHeaderText);
    if (matchesSponsoredLabelHaystack(labelHaystack)) {
        markBlockedByDebug(article, 'sponsored:comet:haystack');
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
    if (quickHeader.includes('được tài trợ') || EN_SPONSORED_TOKEN_RE.test(quickHeader)) {
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

/**
 * Ghép CSS ẩn link cột trái đúng khối script.js ~3979–4238 (`fbpfreestyle.textContent +=` per tùy chọn).
 * Neo rail: `_fbpUiLrSsrbNext` / `_fbpUiLrBannerAnimLayout` / `_fbpUiLrBannerSingle` thay `leftrailcode` 1–3.
 */
function buildFbpLeftColumnCssFromScriptJs() {
    const _lrA = _fbpUiLrSsrbNext;
    const _lrB = _fbpUiLrBannerAnimLayout;
    const _lrC = _fbpUiLrBannerSingle;
    const o = fbBlockConfig;
    let t = '';

    if (o.hideLeftColumnAll && !/facebook\.com\/marketplace/i.test(window.location.href)) {
        t += ` ${_lrA},${_lrB}, div[role="banner"]+div[data-isanimatedlayout],div[role="banner"]+div+div[data-isanimatedlayout], div[role="banner"]+div div[role="navigation"] div[data-visualcompletion="ignore-dynamic"] {display:none} {display:none !important} body.SettingsPage #leftCol {display:block !important}`;
    }

    if (o.hideLeftPages) {
        t += ` ${_lrA} a[href^="https://www.facebook.com/pages/"],li>div>a[href^="https://www.facebook.com/pages/"], div[data-isanimatedlayout] a[href="/pages/?category=your_pages&ref=bookmarks"], div[role="navigation"] li div a[href^="https://www.facebook.com/pages/"] {display:none !important}`;
    }
    if (o.hideLeftGroups) {
        t += ` ${_lrA} a[href^="https://www.facebook.com/groups/?ref="],li>div>a[href^="https://www.facebook.com/groups/?ref="], ${_lrA} a[href$="/groups/"],li>div>a[href$="/groups/"], div[data-isanimatedlayout] a[href="/groups/"],  div[data-isanimatedlayout] div[aria-label="Groups"], div[role="navigation"] li div a[href^="https://www.facebook.com/groups/"]  {display:none !important}`;
    }
    if (o.hideLeftFriends) {
        t += ` ${_lrA} a[href^="https://www.facebook.com/friends/"],li>div>a[href^="https://www.facebook.com/friends/"], div[role="navigation"] li div a[href^="https://www.facebook.com/friends/"] {display:none !important}`;
    }
    if (o.hideLeftCreate) {
        t += ' #createNav, '
            + '#sideNav div[data-itemid="188619144602540"], #navItem_188619144602540, #createNav a[href^="/pages/create/"],'
            + '#sideNav div[data-itemid="400915586638539"], #adsNav, #navItem_400915586638539, #createNav a[href^="/campaign/landing.php"],'
            + '#sideNav div[data-itemid="230259100322928"], #navItem_230259100322928, #createNav a[ajaxify^="/ajax/groups/create_get.php"],'
            + '#eventsNav div[data-itemid="704148512977427"], #navItem_704148512977427, #createNav a[ajaxify^="/events/dialog/create/"], '
            + '#navItem_336549256737756 {display:none !important}';
    }
    if (o.hideLeftEvents) {
        t += '  a[href^="https://www.facebook.com/events?source=46"] {display:none}';
    }
    if (o.hideLeftGaming) {
        t += `  ${_lrC} a[href^="/gaming/play/"],${_lrC} a[href^="https://www.facebook.com/instantgames/"],li>div>a[href^="https://www.facebook.com/games/"], div[role="banner"]~div[data-isanimatedlayout] a[href^="/gaming/play"], div[class="__fb-light-mode"] a[href^="https://www.facebook.com/gaming/play/"], div[class="__fb-light-mode"] a[href^="https://www.facebook.com/instantgames/"] {display:none !important}`;
    }
    if (o.hideLeftFundraisers) {
        t += `  ${_lrC} a[href^="https://www.facebook.com/fundraisers/"],li>div>a[href^="https://www.facebook.com/fundraisers/"], div[class="__fb-light-mode"] a[href^="https://www.facebook.com/fundraisers/"] {display:none !important}`;
    }
    if (o.hideLeftMemories) {
        t += ` ${_lrC} a[href^="https://www.facebook.com/onthisday/"],  ${_lrA} a[href^="https://www.facebook.com/onthisday/"], ${_lrB} a[href*="/onthisday/"],li>div>a[href*="/memories/"], div[class="__fb-light-mode"] a[href^="https://www.facebook.com/onthisday/"], div[data-isanimatedlayout] a[href^="https://www.facebook.com/onthisday/"] {display:none !important}`;
    }
    if (o.hideLeftWeather) {
        t += ` ${_lrA} a[href^="https://www.facebook.com/weather/"],li>div>a[href^="https://www.facebook.com/weather/"] {display:none !important}`;
    }
    if (o.hideLeftProfessional) {
        t += ` ${_lrA} a[href^="https://www.facebook.com/creatorstudio/"],li>div>a[href^="https://www.facebook.com/creatorstudio/"] {display:none !important}`;
        t += ' #navItem_151408195724475 {display:none !important}';
    }
    if (o.hideLeftOffers) {
        t += ` ${_lrA} a[href^="https://www.facebook.com/offers/"],li>div>a[href^="https://www.facebook.com/offers/"] {display:none !important}`;
    }
    if (o.hideLeftSaved) {
        t += ` ${_lrC} a[href^="https://www.facebook.com/saved/"], ${_lrA} a[href^="https://www.facebook.com/saved/"],li>div>a[href^="https://www.facebook.com/saved/"], div[class="__fb-light-mode"] a[href^="https://www.facebook.com/saved/"] {display:none !important}`;
    }
    if (o.hideLeftMarketplace) {
        t += ` #pagelet_marketplace_recently_viewed_rhc, #pagelet_marketplace_recently_viewed_candidate_rhc, #pagelet_marketplace_rental_rhc, #pagelet_group_marketplace_rental_rhc, #pagelet_marketplace_new_user_vehicle_rhc, #pagelet_marketplace_bsg_recently_viewed_rhc, #pagelet_marketplace_new_user_top_picks_rhc, ${_lrA} a[href="https://www.facebook.com/marketplace/?ref=bookmark"], ${_lrC} a[href="https://www.facebook.com/marketplace/?ref=bookmark"], div[data-isanimatedlayout] a[href="/marketplace/?ref=apps_tab"],  div[data-isanimatedlayout] a[aria-label="Marketplace"] {display:none !important}`;
    }
    if (o.hideLeftShops) {
        t += ' #navItem_181728832201978 {display:none !important}';
    }
    if (o.hideLeftPayAndOrders) {
        t += ` ${_lrC} a[href^="https://secure.facebook.com/facebook_pay/"], li>div>a[href^="https://secure.facebook.com/facebook_pay/"], div[class="__fb-light-mode"] a[href^="https://secure.facebook.com/facebook_pay/"] {display:none !important}`;
    }
    if (o.hideLeftOrderFood) {
        t += ' #navItem_766859123481602 {display:none}';
    }
    if (o.hideLeftLiveVideos) {
        t += ` ${_lrC} a[href^="https://www.facebook.com/watch/live/"] ,li>div>a[href^="https://www.facebook.com/watch/live/"], div[data-pagelet="page"] a[href^="https://www.facebook.com/watch/live/"], a[href="https://www.facebook.com/watch/live/?ref=mega_menu"] {display:none !important}`;
    }
    if (o.hideLeftBloodDonations) {
        t += ` ${_lrC} a[href*="/blooddonations/"],li>div>a[href*="/blooddonations/"], div[class="__fb-light-mode"] a[href*="/blooddonations/"] {display:none !important}`;
    }
    if (o.hideLeftAdsManager) {
        t += ` ${_lrC} a[href^="https://www.facebook.com/ads/activity/"], li>div>a[href^="https://www.facebook.com/ads/activity/"], div[class="__fb-light-mode"] [href^="https://www.facebook.com/ads/activity/"] {display:none !important}`;
    }
    if (o.hideLeftClimateScience) {
        t += ` ${_lrC} a[href*="/climatescienceinfo/"],li>div>a[href*="/climatescienceinfo/"], div[class="__fb-light-mode"] a[href^="https://www.facebook.com/climatescienceinfo/"] {display:none !important}`;
    }
    if (o.hideLeftReels) {
        t += ` ${_lrC} div[data-visualcompletion="ignore-dynamic"]>a[href*="/reel/"],li>div>a[href*="/reel/"],div[role="navigation"] li div a[href^="https://www.facebook.com/reel/"] {display:none !important}`;
    }
    if (o.hideLeftMovies) {
        t += ` ${_lrC} a[href^="https://www.facebook.com/movies/"],li>div>a[href^="https://www.facebook.com/movies/"] {display:none !important}`;
    }
    if (o.hideLeftMessenger) {
        t += ` ${_lrC} a[href^="https://www.facebook.com/messages/t/"],li>div>a[href^="https://www.facebook.com/messages/t/"], div[class="__fb-light-mode"] a[href^="https://www.facebook.com/messages/t/"] {display:none !important}`;
    }
    if (o.hideLeftWatch) {
        t += ` ${_lrB} a[href*="/watch/"], a[href="https://www.facebook.com/watch/?ref=mega_menu"], div[role="banner"]+div[data-isanimatedlayout] a[href*="/watch/"], div[role="navigation"] li div[data-visualcompletion="ignore-dynamic"] a[href="https://www.facebook.com/watch/"], div[role="navigation"] li div a[href^="https://www.facebook.com/watch/"] {display:none !important}`;
    }
    if (o.hideLeftShortcuts) {
        t += ' #pinnedNav, div[role="navigation"] div.sj5x9vvc+ul, div[data-isanimatedlayout] div[aria-label="Shortcuts"] {display:none}';
        t += ` ${_lrC} a[href*="?sk=favorites"],li>div>a[href*="?sk=favorites"] {display:none !important}`;
    }
    if (o.hideLeftJobs) {
        t += ` ${_lrC} a[href^="https://www.facebook.com/jobs/"],li>div>a[href^="https://www.facebook.com/jobs/"] {display:none}`;
    }
    if (o.hideLeftGameStreaming) {
        t += ` ${_lrC} a[href^="https://www.facebook.com/gaming/"],li>div>a[href^="https://www.facebook.com/gaming/"],div[data-isanimatedlayout] a[href="/gaming/?ref=games_tab"], div[class="__fb-light-mode"] a[href^="https://www.facebook.com/gaming/?external_ref"] {display:none !important}`;
    }
    if (o.hideLeftVotingInformation) {
        t += ` ${_lrC} a[href*="/votinginformationcenter"],li>div>a[href*="/votinginformationcenter"] {display:none !important}`;
    }
    if (o.hideLeftCrisisResponse) {
        t += ` ${_lrC} a[href^="https://www.facebook.com/crisisresponse/"],li>div>a[href^="https://www.facebook.com/crisisresponse/"], div[class="__fb-light-mode"] a[href^="https://www.facebook.com/crisisresponse/"] {display:none !important}`;
    }
    if (o.hideLeftNews) {
        t += ` ${_lrC} a[href^="https://www.facebook.com/news/"],li>div>a[href^="https://www.facebook.com/news/"], div[class="__fb-light-mode"] a[href^="https://www.facebook.com/news/"], a[href="/news/"] {display:none !important}`;
    }
    if (o.hideLeftMetaAI) {
        t += ' div[role="navigation"] a[href^="https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.meta.ai%2F"], div[role="navigation"] a[href^="https://www.meta.ai"] {display:none !important}';
    }
    if (o.hideLeftFeedsMenu) {
        t += ` ${_lrA} a[href*="/feeds/"],li>div>a[href*="/feeds/"], ${_lrC} a[href*="/feeds/"], div[data-isanimatedlayout] a[href*="/feeds/"] {display:none !important}`;
    }
    if (o.hideLeftMusic) {
        t += ' #sideNav div[data-itemid="119960514742544"], #navItem_119960514742544 {display:none !important}';
    }

    return t;
}

function syncLeftColumnFbpStylesheet() {
    const prev = document.getElementById(LEFT_COL_FBP_CSS_STYLE_ID);
    if (prev) {
        prev.remove();
    }
    const css = buildFbpLeftColumnCssFromScriptJs();
    if (!css || !String(css).trim()) {
        return;
    }
    const st = document.createElement('style');
    st.id = LEFT_COL_FBP_CSS_STYLE_ID;
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
}

function isAnyLeftColumnFbpOptionOn() {
    const o = fbBlockConfig;
    return Boolean(
        o.hideLeftColumnAll || o.hideLeftPages || o.hideLeftGroups || o.hideLeftFriends
        || o.hideLeftCreate || o.hideLeftEvents || o.hideLeftGaming || o.hideLeftFundraisers
        || o.hideLeftMemories || o.hideLeftWeather || o.hideLeftProfessional || o.hideLeftOffers
        || o.hideLeftSaved || o.hideLeftMarketplace || o.hideLeftShops || o.hideLeftPayAndOrders
        || o.hideLeftOrderFood || o.hideLeftLiveVideos || o.hideLeftBloodDonations || o.hideLeftAdsManager
        || o.hideLeftClimateScience || o.hideLeftReels || o.hideLeftMovies || o.hideLeftMessenger
        || o.hideLeftWatch || o.hideLeftShortcuts || o.hideLeftJobs || o.hideLeftGameStreaming
        || o.hideLeftVotingInformation || o.hideLeftCrisisResponse || o.hideLeftNews || o.hideLeftMetaAI
        || o.hideLeftFeedsMenu || o.hideLeftMusic,
    );
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
        } else if (shouldHideRightColumnWidget('hideRightEvents') && isMatch('events')) {
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
        || fbBlockConfig.hideRightEvents
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
    syncLeftColumnFbpStylesheet();
}

function startLeftColumnManager() {
    if (!isAnyLeftColumnFbpOptionOn()) {
        return;
    }

    window.setTimeout(runLeftColumnPurifier, 400);
    leftColumnTimer = window.setInterval(runLeftColumnPurifier, LEFT_COL_SCAN_INTERVAL_MS);
}

/**
 * Ghép CSS top bar đúng chuỗi script.js: `fbpfreestyle` ~3826–3868, 3880–3881 (`hidesearchbox`, `topnav*`, `hidepagestopnav`, `homelink`);
 * Messenger / Notifications / Create từ `fbpboxstyles` ~4578–4588 (`hidemesstopnav`, `hidenotiftopnav`, `hidecreatetopnav`).
 * `_fbpUiTpBn` thay literal `div[role="banner"]` — thuật toán giữ nguyên.
 */
function buildFbpTopNavCssFromScriptJs() {
    const B = _fbpUiTpBn;
    const o = fbBlockConfig;
    let t = '';

    if (o.hideSearchBoxAndPopup) {
        t += ' #blueBarDOMInspector div[role="search"], #searchBarClickRef,' + B + ' div[data-testid="Keycommand_wrapper"], ' + B + '>div>div>div>div>div>div>label[class],' + B + '>div>div>div>div>div>div>div>div>div>div>div>label[class]  {display:none}';
    }

    if (o.hideNavReels) {
        t += ' ' + B + ' a[href*="/watch/"],a[href="/watch/?ref=tab"], ' + B + ' a[href="/reel/?s=tab"] {display:none}';
    }

    if (o.hideNavNews) {
        t += ' ' + B + ' a[href^="/news/"] {display:none}';
    }

    if (o.hideNavEvents) {
        t += ' ' + B + ' a[href^="/events/"] {display:none}';
    }

    if (o.hideNavGroups) {
        t += ' ' + B + ' a[href^="/groups/"], div[data-isanimatedlayout] a[href="/groups/"] {display:none}';
    }

    if (o.hideNavGaming) {
        t += ' ' + B + ' a[href*="/gaming/"], div[data-isanimatedlayout] a[href="/gaming/?ref=games_tab"] {display: none !important}';
    }

    if (o.hideNavMarketplace) {
        t += ' ' + B + ' a[href*="/marketplace/"], a[href="/marketplace/?ref=app_tab"] {display:none}';
    }

    if (o.hideNavPages) {
        t += ' ' + B + ' a[href^="/pages/"], div[data-isanimatedlayout] a[href="/pages/?category=your_pages&ref=bookmarks"] {display: none !important}';
    }

    if (o.hideNavHome) {
        t += ' #blueBarDOMInspector a[data-gt*="home_chrome"], ' + B + ' a[aria-label^="Home"] {display:none}';
    }

    if (o.hideNavMessenger) {
        t += '#pagelet_bluebar a[name="mercurymessages"], ' + B + ' div[aria-label="Messenger"], a[aria-label^="Messenger"]{display:none}';
    }

    if (o.hideNavNotifications) {
        t += '#fbNotificationsJewel, ' + B + ' div[aria-label^="Notifications"],a[aria-label^="Notifications"] {display:none !important}';
    }

    if (o.hideNavCreate) {
        t += ' #creation_hub_entrypoint, ' + B + ' div[aria-label="Create"] {display:none}';
    }

    return t;
}

function injectTopNavStyles() {
    const existing = document.getElementById(TOP_NAV_STYLE_ID);
    if (existing) {
        existing.remove();
    }
    const css = buildFbpTopNavCssFromScriptJs();
    if (!css || !String(css).trim()) {
        return;
    }
    const styleTag = document.createElement('style');
    styleTag.id = TOP_NAV_STYLE_ID;
    styleTag.textContent = css;
    document.head.appendChild(styleTag);
}

function startTopNavManager() {
    const shouldRun = fbBlockConfig.hideSearchBoxAndPopup
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
        || fbBlockConfig.hideNavEvents;
    if (!shouldRun) {
        return;
    }
    topNavInitTimer = window.setTimeout(() => {
        injectTopNavStyles();
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
 * - Bộ lọc văn bản theo từ khóa (regex + OCR) đã gỡ khỏi dashboard; chỉ còn lọc URL / cụm cho phép ở đây và các bộ lọc khác (hashtag, sponsored, …).
 *
 * Kết hợp
 * - Khi **cả** Allow URL **và** Allow từ khóa đều bật (và có dữ liệu), bài được giữ nếu thỏa **một trong hai** (OR).
 * - Chỉ một trong hai bật thì vẫn chỉ áp dụng điều kiện đó.
 *
 * Thứ tự gate trong shouldHideArticle (trước các bộ lọc ẩn bài khác)
 * 1) Kết hợp isArticleAllowedByUrl và isArticleAllowedByPostKeywords theo OR hoặc một nhánh — nếu không đạt → ẩn.
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

/**
 * Haystack bộ lọc văn bản: visible + toàn story + OCR (cùng lớp getFbpStoryBodyTextForTextFilter như sponsored),
 * cộng caption / header / action — chữ thường để so khớp regex `iu`.
 */
function buildTextFilterHaystack(article) {
    if (!(article instanceof Element)) {
        return '';
    }
    const visible = extractVisibleText(article);
    const body = getFbpStoryBodyTextForTextFilter(article);
    const cap = getCaptionText(article);
    const h = getHeaderText(article);
    const ah = getActionHeaderText(article);
    return [visible, body, cap, h, ah]
        .filter(Boolean)
        .join('\n')
        .toLowerCase();
}

function applyUserTextFilter(article) {
    if (!fbBlockConfig.textFilterEnabled || !cachedKeywordRegex || !(article instanceof Element)) {
        return false;
    }

    const haystack = buildTextFilterHaystack(article);
    cachedKeywordRegex.lastIndex = 0;
    const matched = haystack.match(cachedKeywordRegex);

    if (fbBlockConfig.textFilterKeepMatchingOnly) {
        if (!haystack.trim()) {
            markBlockedByDebug(article, 'text-filter:empty-haystack');
            return true;
        }
        if (matched) {
            return false;
        }
        markBlockedByDebug(article, 'text-filter:no-keyword-match');
        return true;
    }

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
        const regex = new RegExp(`(^|[^\\p{L}\\p{N}_-])#${token}(?=$|[^\\p{L}\\p{N}_-])`, 'iu');
        hashtagRegexCache.set(tag, regex);
    });
}

function resolveFacebookNavHrefForHashtagParse(rawHref) {
    let h = String(rawHref || '').trim();
    if (!h) {
        return h;
    }
    try {
        if (/l\.php|lm\.php/i.test(h)) {
            const u = new URL(h, 'https://www.facebook.com');
            const inner = u.searchParams.get('u');
            if (inner) {
                h = decodeURIComponent(inner);
            }
        }
    } catch (_) {
        /* ignore */
    }
    return h;
}

/**
 * Facebook hay gắn hashtag bằng link /hashtag/ten hoặc redirect l.php; thêm path biến thể.
 */
function collectHashtagHrefHaystack(article) {
    if (!(article instanceof Element)) {
        return '';
    }
    const parts = [];
    const seen = new Set();
    const pushTag = (token) => {
        const t = String(token || '').trim().toLowerCase();
        if (!t || seen.has(t)) {
            return;
        }
        seen.add(t);
        parts.push(`#${t}`);
    };

    article.querySelectorAll('a[href]').forEach((a) => {
        const raw = a.getAttribute('href') || '';
        const href = resolveFacebookNavHrefForHashtagParse(raw);
        if (!href) {
            return;
        }
        if (!/\/hashtag\//i.test(href) && !/[?&]hashtag=/i.test(href) && !/\/keywords\/hashtags\//i.test(href)) {
            return;
        }
        try {
            const u = new URL(href, 'https://www.facebook.com');
            const pathMatch = u.pathname.match(/\/hashtag\/([^/?]+)/i)
                || u.pathname.match(/\/keywords\/hashtags\/([^/?]+)/i);
            if (pathMatch) {
                const dec = decodeURIComponent(pathMatch[1]).replace(/\+/g, ' ').trim().toLowerCase();
                if (dec) {
                    pushTag(dec);
                }
                return;
            }
            const hv = u.searchParams.get('hashtag');
            if (hv) {
                pushTag(normalizeHashtagLine(hv.startsWith('#') ? hv : `#${hv}`));
                return;
            }
            const q = u.searchParams.get('q');
            if (q && /^#/i.test(q.trim())) {
                const inner = normalizeHashtagLine(q);
                if (inner) {
                    pushTag(inner);
                }
            }
        } catch (_) {
            /* ignore */
        }
    });
    return parts.join(' ');
}

/**
 * Haystack hashtag: lớp story.textContent + OCR (cùng sponsored textfilter), cộng caption/visible/header,
 * và hashtag từ href (sau khi giải l.php).
 */
function buildHashtagSearchHaystack(article, captionText, visibleText, headerText, actionHeaderText) {
    const storyBody = getFbpStoryBodyTextForTextFilter(article);
    const fromLinks = article instanceof Element ? collectHashtagHrefHaystack(article) : '';
    const blob = [
        storyBody,
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
    if (/^[\p{L}\p{N}_-]+$/u.test(t)) {
        try {
            return new RegExp(`(?<![\\p{L}\\p{N}_-])${escapeRegex(t)}(?![\\p{L}\\p{N}_-])`, 'iu').test(haystack);
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
        // Chỉ dùng regex có ranh giới từ; đừng dùng haystack.includes(`#${tag}`) — sẽ chặn nhầm (#cat khớp #category).
        if (hashRegex && hashRegex.test(haystack)) {
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
        'article div[dir="auto"]',
        'div[aria-posinset] div[dir="auto"]',
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

/** Gom dòng tiêu đề + loại bài + đoạn caption đầu — Facebook hay tách chữ “chia sẻ ảnh” khỏi thẻ heading. */
function getStoryTypeHaystack(article) {
    if (!(article instanceof Element)) {
        return '';
    }
    const h = getHeaderText(article);
    const a = getActionHeaderText(article);
    const cap = (getCaptionText(article) || '').slice(0, 320);
    return `${h} ${a} ${cap}`.trim();
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
    /* Bài video/reel dùng poster ảnh lớn — không coi là “bài ảnh” thuần (tránh ẩn nhầm khi chỉ bật ẩn ảnh). */
    if (hasVideoElement(article)) {
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
            || container.closest(FEED_POST_ROOT_SELECTOR)
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
        'a[href*="/watch/"], a[href*="/watch?v="], a[href*="/videos/"], a[href*="/reel/"], a[href*="/reels/"], a[href*="fb.watch"], a[href*="facebook.com/watch"]',
    ) !== null;
}

function isLiveVideoPost(article, text) {
    const storyHaystack = getStoryTypeHaystack(article);
    const blob = `${storyHaystack} ${(text || '').slice(0, 500)}`;
    return matchesAnyPattern(blob, LIVE_VIDEO_PATTERNS);
}

function isSingleReelPost(article, text) {
    if (!(article instanceof Element)) {
        return false;
    }
    if (article.querySelector('a[href*="/reel/"], a[href*="/reels/"]')) {
        return true;
    }
    if (article.querySelector('a[href*="fb.watch/"], a[href*="facebook.com/watch"]')) {
        return true;
    }
    const signalText = `${getStoryTypeHaystack(article)} ${(text || '').slice(0, 280)}`;
    return /\breel(s)?\b/i.test(signalText) || /\bvideo ngắn\b/i.test(signalText) || /\bshort video\b/i.test(signalText);
}

function shouldHideVideoFeedStoryInteractions(article, text) {
    const storyHaystack = getStoryTypeHaystack(article);
    const blob = `${storyHaystack} ${(text || '').slice(0, 500)}`;
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

    /* Gate Allow: một chế độ → chỉ kiểm tra chế đó; cả hai bật và có dữ liệu → OR. Xem spec trên parseAllowByUrlList. */
    const urlGateActive = Boolean(fbBlockConfig.allowByUrlOnly) && allowUrlSet.size > 0;
    const kwGateActive = Boolean(fbBlockConfig.allowPostKeywordsOnly) && allowPostKeywordPhrases.length > 0;
    const urlOk = isArticleAllowedByUrl(article);
    const kwOk = isArticleAllowedByPostKeywords(article);
    const allowPass = urlGateActive && kwGateActive
        ? (urlOk || kwOk)
        : (urlOk && kwOk);
    if (!allowPass) {
        if (urlGateActive && kwGateActive) {
            debugAllowByUrlLog('run1', 'H3', 'undistracted-facebook.js:shouldHideArticle', 'blocked by allow gate (neither url nor keywords)', {
                pageHref: window.location.href,
                urlOk,
                kwOk,
            });
            markBlockedByDebug(article, 'allow-combined:not-allowed');
        } else if (urlGateActive && !urlOk) {
            debugAllowByUrlLog('run1', 'H3', 'undistracted-facebook.js:shouldHideArticle', 'blocked by allow-by-url gate', {
                pageHref: window.location.href,
            });
            markBlockedByDebug(article, 'allow-by-url:not-allowed');
        } else if (kwGateActive && !kwOk) {
            markBlockedByDebug(article, 'allow-keywords:not-allowed');
        }
        return true;
    }

    if (fbBlockConfig.hideNewsfeed && article.closest('[role="main"]')) {
        return true;
    }

    // Keep sponsored check first for early-return performance.
    if (fbBlockConfig.hideSponsoredPosts) {
        if (checkSponsoredPost(article, text, headerText, actionHeaderText)) {
            return true;
        }
    }

    if (fbBlockConfig.hideHashtagPosts) {
        const hashtagHaystack = buildHashtagSearchHaystack(article, captionText, text, headerText, actionHeaderText);
        if (hasBlockedHashtagInHaystack(hashtagHaystack)) {
            markBlockedByDebug(article, 'hashtag:blocked');
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

    const photoStoryHaystack = getStoryTypeHaystack(article);

    if (fbBlockConfig.hideUpdatedProfilePictures && isUpdatedProfilePhotoPost(photoStoryHaystack)) {
        return true;
    }

    if (fbBlockConfig.hideSharedPhotoAlbums && isSharedPhotoOrAlbumPost(photoStoryHaystack)) {
        return true;
    }

    if (fbBlockConfig.hideUploadedPhotos && isUploadedPhotoPost(photoStoryHaystack)) {
        return true;
    }

    if (fbBlockConfig.hide3DPhotos && is3DPhotoPost(photoStoryHaystack, text)) {
        return true;
    }

    if (fbBlockConfig.hideLikedPhotos && isLikedPhotoPost(photoStoryHaystack)) {
        return true;
    }

    if (fbBlockConfig.hideCommentedPhotos && isCommentedPhotoPost(photoStoryHaystack)) {
        return true;
    }

    if (fbBlockConfig.hideAllPhotoPosts && hasPhotoMediaSignals(article)) {
        return true;
    }

    if (shouldHideVideoFeedStoryInteractions(article, text)) {
        return true;
    }

    if (fbBlockConfig.hideSingleReelPosts && isSingleReelPost(article, text)) {
        return true;
    }

    if (fbBlockConfig.hideLiveVideos && isLiveVideoPost(article, text)) {
        return true;
    }

    if (fbBlockConfig.hideAllVideos && hasVideoElement(article)) {
        return true;
    }

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
    const wrapper = (article instanceof Element && article.matches(FEED_POST_ROOT_SELECTOR))
        ? article
        : (article instanceof Element ? article.closest(FEED_POST_ROOT_SELECTOR) : null) || article;
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
    document.querySelectorAll(MAIN_COLUMN_POST_SELECTOR).forEach((el) => {
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
            mutation.addedNodes.forEach((node) => {
                queueFromNode(node);
            });
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
            /* Bộ lọc văn bản (dashboard mục III) đã bỏ; không áp dụng textFilterKeywords / masterSectionIII. */
            buildRegexEngine([]);
            const isTextFilterEnabled = false;
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
            const isHideRightEventsEnabled = rightSectionOn
                && Boolean(facebookSettings?.hideRightEvents || facebookSettings?.hideRightHappeningLive);
            const isHideRightSponsoredAdsEnabled = rightSectionOn && Boolean(facebookSettings?.hideSponsoredPosts);
            const leftSectionOn = facebookSettings.masterSectionVII !== false;
            const isHideLeftColumnAllEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftColumnAll);
            const isHideLeftPagesEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftPages);
            const isHideLeftGroupsEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftGroups);
            const isHideLeftFriendsEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftFriends);
            const isHideLeftWatchEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftWatch);
            const isHideLeftMarketplaceEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftMarketplace);
            const isHideLeftMemoriesEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftMemories);
            const isHideLeftSavedEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftSaved);
            const isHideLeftEventsEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftEvents);
            const isHideLeftCreateEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftCreate);
            const isHideLeftGamingEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftGaming);
            const isHideLeftGameStreamingEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftGameStreaming);
            const isHideLeftAdsManagerEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftRecentAdActivity);
            const isHideLeftFundraisersEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftFundraisers);
            const isHideLeftBloodDonationsEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftBloodDonations);
            const isHideLeftClimateScienceEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftClimateScience);
            const isHideLeftProfessionalEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftProfessional);
            const isHideLeftFeedsMenuEnabled = leftSectionOn && Boolean(
                facebookSettings?.hideLeftFeedsMenu || facebookSettings?.hideLeftMostRecent,
            );
            const isHideLeftPayAndOrdersEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftPayAndOrders);
            const isHideLeftOrderFoodEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftOrderFood);
            const isHideLeftOffersEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftOffers);
            const isHideLeftWeatherEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftWeather);
            const isHideLeftShopsEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftShops);
            const isHideLeftLiveVideosEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftLiveVideos);
            const isHideLeftReelsEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftReels);
            const isHideLeftMoviesEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftMovies);
            const isHideLeftMessengerEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftMessenger);
            const isHideLeftJobsEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftJobs);
            const isHideLeftVotingInformationEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftVotingInformation);
            const isHideLeftCrisisResponseEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftCrisisResponse);
            const isHideLeftNewsEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftNews);
            const isHideLeftMetaAIEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftMetaAI);
            const isHideLeftMusicEnabled = leftSectionOn && Boolean(facebookSettings?.hideLeftMusic);
            const isHideLeftShortcutsEnabled = leftSectionOn && Boolean(
                facebookSettings?.hideLeftShortcuts || facebookSettings?.hideLeftFavorites,
            );
            const topNavSectionOn = facebookSettings.masterSectionIX !== false;
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
            const isGrayscaleEnabled = isExtensionActive && Boolean(facebookSettings?.grayscaleMode);

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
                || isHashtagBlockingEnabled
                || isAllowByUrlEnabled
                || isAllowPostKeywordsEnabled
                || isSuggestedBlockingEnabled
                || isMarketplaceBlockingEnabled
                || isHideRightColumnAllEnabled
                || isHideRightBirthdaysEnabled
                || isHideRightFriendRequestsEnabled
                || isHideRightEventsEnabled
                || isHideRightSponsoredAdsEnabled
                || isHideLeftColumnAllEnabled
                || isHideLeftPagesEnabled
                || isHideLeftGroupsEnabled
                || isHideLeftFriendsEnabled
                || isHideLeftWatchEnabled
                || isHideLeftMarketplaceEnabled
                || isHideLeftMemoriesEnabled
                || isHideLeftSavedEnabled
                || isHideLeftEventsEnabled
                || isHideLeftCreateEnabled
                || isHideLeftGamingEnabled
                || isHideLeftGameStreamingEnabled
                || isHideLeftAdsManagerEnabled
                || isHideLeftFundraisersEnabled
                || isHideLeftBloodDonationsEnabled
                || isHideLeftClimateScienceEnabled
                || isHideLeftProfessionalEnabled
                || isHideLeftFeedsMenuEnabled
                || isHideLeftPayAndOrdersEnabled
                || isHideLeftOrderFoodEnabled
                || isHideLeftOffersEnabled
                || isHideLeftWeatherEnabled
                || isHideLeftShopsEnabled
                || isHideLeftLiveVideosEnabled
                || isHideLeftReelsEnabled
                || isHideLeftMoviesEnabled
                || isHideLeftMessengerEnabled
                || isHideLeftJobsEnabled
                || isHideLeftVotingInformationEnabled
                || isHideLeftCrisisResponseEnabled
                || isHideLeftNewsEnabled
                || isHideLeftMetaAIEnabled
                || isHideLeftMusicEnabled
                || isHideLeftShortcutsEnabled
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
                allowByUrlOnly: isExtensionActive && isAllowByUrlEnabled,
                allowPostKeywordsOnly: isExtensionActive && isAllowPostKeywordsEnabled,
                hideHashtagPosts: isExtensionActive && isHashtagBlockingEnabled,
                textFilterEnabled: isExtensionActive && isTextFilterEnabled,
                textFilterKeepMatchingOnly: isExtensionActive && isTextFilterEnabled
                    && Boolean(facebookSettings?.textFilterKeepMatchingOnly),
                hideRightColumnAll: isExtensionActive && isHideRightColumnAllEnabled,
                hideRightBirthdays: isExtensionActive && isHideRightBirthdaysEnabled,
                hideRightFriendRequests: isExtensionActive && isHideRightFriendRequestsEnabled,
                hideRightEvents: isExtensionActive && isHideRightEventsEnabled,
                hideRightSponsoredAds: isExtensionActive && isHideRightSponsoredAdsEnabled,
                hideLeftColumnAll: isExtensionActive && isHideLeftColumnAllEnabled,
                hideLeftPages: isExtensionActive && isHideLeftPagesEnabled,
                hideLeftGroups: isExtensionActive && isHideLeftGroupsEnabled,
                hideLeftFriends: isExtensionActive && isHideLeftFriendsEnabled,
                hideLeftWatch: isExtensionActive && isHideLeftWatchEnabled,
                hideLeftMarketplace: isExtensionActive && isHideLeftMarketplaceEnabled,
                hideLeftMemories: isExtensionActive && isHideLeftMemoriesEnabled,
                hideLeftSaved: isExtensionActive && isHideLeftSavedEnabled,
                hideLeftEvents: isExtensionActive && isHideLeftEventsEnabled,
                hideLeftCreate: isExtensionActive && isHideLeftCreateEnabled,
                hideLeftGaming: isExtensionActive && isHideLeftGamingEnabled,
                hideLeftGameStreaming: isExtensionActive && isHideLeftGameStreamingEnabled,
                hideLeftAdsManager: isExtensionActive && isHideLeftAdsManagerEnabled,
                hideLeftFundraisers: isExtensionActive && isHideLeftFundraisersEnabled,
                hideLeftBloodDonations: isExtensionActive && isHideLeftBloodDonationsEnabled,
                hideLeftClimateScience: isExtensionActive && isHideLeftClimateScienceEnabled,
                hideLeftProfessional: isExtensionActive && isHideLeftProfessionalEnabled,
                hideLeftFeedsMenu: isExtensionActive && isHideLeftFeedsMenuEnabled,
                hideLeftPayAndOrders: isExtensionActive && isHideLeftPayAndOrdersEnabled,
                hideLeftOrderFood: isExtensionActive && isHideLeftOrderFoodEnabled,
                hideLeftOffers: isExtensionActive && isHideLeftOffersEnabled,
                hideLeftWeather: isExtensionActive && isHideLeftWeatherEnabled,
                hideLeftShops: isExtensionActive && isHideLeftShopsEnabled,
                hideLeftLiveVideos: isExtensionActive && isHideLeftLiveVideosEnabled,
                hideLeftReels: isExtensionActive && isHideLeftReelsEnabled,
                hideLeftMovies: isExtensionActive && isHideLeftMoviesEnabled,
                hideLeftMessenger: isExtensionActive && isHideLeftMessengerEnabled,
                hideLeftJobs: isExtensionActive && isHideLeftJobsEnabled,
                hideLeftVotingInformation: isExtensionActive && isHideLeftVotingInformationEnabled,
                hideLeftCrisisResponse: isExtensionActive && isHideLeftCrisisResponseEnabled,
                hideLeftNews: isExtensionActive && isHideLeftNewsEnabled,
                hideLeftMetaAI: isExtensionActive && isHideLeftMetaAIEnabled,
                hideLeftMusic: isExtensionActive && isHideLeftMusicEnabled,
                hideLeftShortcuts: isExtensionActive && isHideLeftShortcutsEnabled,
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
                hideSuggestedPosts: isExtensionActive && isSuggestedBlockingEnabled,
                hideMarketplaceAds: isExtensionActive && isMarketplaceBlockingEnabled,
                hideSponsoredPosts: isExtensionActive && isSponsoredBlockingEnabled,
                grayscaleMode: isGrayscaleEnabled,
            };

            syncFacebookGrayscale(isGrayscaleEnabled);

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
