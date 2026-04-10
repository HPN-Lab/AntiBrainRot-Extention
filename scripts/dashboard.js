'use strict';

// #region agent log
fetch('http://127.0.0.1:7371/ingest/7634893a-f87f-456c-8e21-990ad9d66e04',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'71e079'},body:JSON.stringify({sessionId:'71e079',runId:'run3',hypothesisId:'H0',location:'dashboard.js:bootstrap',message:'dashboard script loaded',data:{href:location.href},timestamp:Date.now()})}).catch(()=>{});
// #endregion

const tabs = Array.from(document.querySelectorAll('.dashboard-tab'));
const panels = Array.from(document.querySelectorAll('.dashboard-panel'));
const inAppViews = Array.from(document.querySelectorAll('[data-inapp-view]'));
const inAppTargets = Array.from(document.querySelectorAll('[data-inapp-target]'));
const inAppBackButtons = Array.from(document.querySelectorAll('[data-inapp-back]'));
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

function createDefaultFacebookSettings() {
    const masters = [
        'masterSectionI',
        'masterSectionII',
        'masterSectionIII',
        'masterSectionIV',
        'masterSectionVI',
        'masterSectionVII',
        'masterSectionIX',
    ];
    const fb = {
        textFilterKeywords: '',
        hashtagFilterKeywords: '',
        allowByUrlList: '',
        allowPostKeywordsList: '',
    };
    masters.forEach((k) => {
        fb[k] = true;
    });
    const restFalse = [
        'hideEntireNewsfeed',
        'hideProfileInfoUpdates',
        'hideProductsShown',
        'hideTrendingPosts',
        'hideLikedPagePost',
        'hideLikedLinkPost',
        'hideSharedLinkPost',
        'hideCommentedLinkPost',
        'hideLikePageButtons',
        'hideAllPhotoPosts',
        'hideSharedPhotoAlbum',
        'hideProfilePictureCoverChange',
        'hideUploadedPhoto',
        'hide3dPhoto',
        'hideLikedPhoto',
        'hideCommentedOnPhoto',
        'disableVideoAutoplayFacebook',
        'hideAllVideoPosts',
        'hideLiveVideoPosts',
        'hideReelsShortVideo',
        'hideSharedVideo',
        'hideLikedVideo',
        'hideCommentedOnVideo',
        'hideHashtagPosts',
        'allowByUrlOnly',
        'allowPostKeywordsOnly',
        'hideSponsoredPosts',
        'hideSuggestedPosts',
        'hideMarketplaceAds',
        'hideRightColumnAll',
        'hideRightGameAppRequests',
        'hideRightMarketplacePanel',
        'hideRightRecommendedPages',
        'hideRightTodaysGames',
        'hideRightSuggestedGroups',
        'hideRightPokes',
        'hideRightHappeningLive',
        'hideRightEvents',
        'hideRightFriendRequests',
        'hideRightYourPages',
        'hideRightBirthdays',
        'hideRightWatch',
        'hideRightSaved',
        'hideRightRelated',
        'hideLeftAdsManager',
        'hideLeftBrowse',
        'hideLeftCampus',
        'hideLeftCommunityHelp',
        'hideLeftCreate',
        'hideLeftCreatorStudio',
        'hideLeftEvents',
        'hideLeftFavorites',
        'hideLeftFriends',
        'hideLeftFundraisers',
        'hideLeftGaming',
        'hideLeftGroups',
        'hideLeftJobs',
        'hideLeftMarketplace',
        'hideLeftMemories',
        'hideLeftMessenger',
        'hideLeftMetaAI',
        'hideLeftNews',
        'hideLeftOffers',
        'hideLeftOrderFood',
        'hideLeftPages',
        'hideLeftReels',
        'hideLeftSaved',
        'hideLeftShops',
        'hideLeftWatch',
        'hideLeftWeather',
        'hideLeftBloodDonations',
        'hideLeftClimateScience',
        'hideLeftCrisisResponse',
        'hideLeftDating',
        'hideLeftMovies',
        'hideLeftMusic',
        'hideLeftMostRecent',
        'hideLeftLiveVideos',
        'hideLeftGameStreaming',
        'hideLeftRecentActivity',
        'hideLeftRecentAdActivity',
        'hideLeftVotingInformation',
        'hideLeftLocal',
        'hideLeftAbout',
        'freezeTopNavBar',
        'showLogoutButton',
        'hideSearchBoxAndPopup',
        'hideNavHome',
        'hideNavPages',
        'hideNavReels',
        'hideNavMarketplace',
        'hideNavGroups',
        'hideNavGaming',
        'hideNavCreate',
        'hideNavMessenger',
        'hideNavNotifications',
        'hideNavNews',
        'hideNavEvents',
        'hideNavFriendRequests',
        'hideNavAccountSwitcher',
    ];
    restFalse.forEach((k) => {
        fb[k] = false;
    });
    return fb;
}

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
    facebook: createDefaultFacebookSettings(),
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

function migrateFacebookRomanSectionMasters(fb, storedFbRaw = {}) {
    const out = { ...fb };
    const oldFeedKeys = ['masterFeedFilters', 'masterLinkPosts', 'masterPhotoPosts', 'masterVideoPosts'];

    if (!Object.prototype.hasOwnProperty.call(storedFbRaw, 'masterSectionI')) {
        const hadOldFeedMasters = oldFeedKeys.some((k) => storedFbRaw[k] !== undefined);
        if (hadOldFeedMasters) {
            out.masterSectionI = oldFeedKeys.every((k) => fb[k] !== false);
        }
    }

    if (!Object.prototype.hasOwnProperty.call(storedFbRaw, 'masterSectionII') && fb.masterAdsContent !== undefined) {
        out.masterSectionII = fb.masterAdsContent !== false;
    }
    if (!Object.prototype.hasOwnProperty.call(storedFbRaw, 'masterSectionIII') && fb.masterTextFilter !== undefined) {
        out.masterSectionIII = fb.masterTextFilter !== false;
    }
    if (!Object.prototype.hasOwnProperty.call(storedFbRaw, 'masterSectionIV') && fb.masterAllowByUrl !== undefined) {
        out.masterSectionIV = fb.masterAllowByUrl !== false;
    }
    if (!Object.prototype.hasOwnProperty.call(storedFbRaw, 'masterSectionVI') && fb.masterRightColumn !== undefined) {
        out.masterSectionVI = fb.masterRightColumn !== false;
    }
    if (!Object.prototype.hasOwnProperty.call(storedFbRaw, 'masterSectionVII') && fb.masterLeftColumn !== undefined) {
        out.masterSectionVII = fb.masterLeftColumn !== false;
    }
    if (!Object.prototype.hasOwnProperty.call(storedFbRaw, 'masterSectionIX') && fb.masterTopNav !== undefined) {
        out.masterSectionIX = fb.masterTopNav !== false;
    }
    // #region agent log
    fetch('http://127.0.0.1:7371/ingest/7634893a-f87f-456c-8e21-990ad9d66e04', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '5f42da' }, body: JSON.stringify({ sessionId: '5f42da', hypothesisId: 'H1_post_fix', runId: 'post-fix', location: 'dashboard.js:migrateFacebookRomanSectionMasters', message: 'migration result', data: { storedHasII: Object.prototype.hasOwnProperty.call(storedFbRaw, 'masterSectionII'), masterSectionII_in: fb.masterSectionII, masterSectionII_out: out.masterSectionII, masterAdsContent: fb.masterAdsContent, skippedAdsMap: Object.prototype.hasOwnProperty.call(storedFbRaw, 'masterSectionII') }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion
    return out;
}

function mergeSettings(storedSettings = {}) {
    const storedFbRaw = storedSettings.facebook || {};
    const mergedFacebook = { ...DEFAULT_SETTINGS.facebook, ...storedFbRaw };
    return {
        youtube: { ...DEFAULT_SETTINGS.youtube, ...(storedSettings.youtube || {}) },
        facebook: migrateFacebookRomanSectionMasters(mergedFacebook, storedFbRaw),
    };
}

function sanitizeSettingsForStorage(settings = currentSettings) {
    const normalized = mergeSettings(settings);

    return {
        youtube: { ...normalized.youtube },
        facebook: { ...normalized.facebook },
    };
}

/** Clés enfant mises à jour par le bouton « bật/tắt tất cả » dans le panneau (le master de l’en-tête ne fait que verrouiller l’UI). */
const FACEBOOK_SECTION_BULK_CHILD_KEYS = {
    sectionI: [
        'hideEntireNewsfeed',
        'hideProfileInfoUpdates',
        'hideProductsShown',
        'hideTrendingPosts',
        'hideLikedPagePost',
        'hideLikedLinkPost',
        'hideSharedLinkPost',
        'hideCommentedLinkPost',
        'hideLikePageButtons',
        'hideAllPhotoPosts',
        'hideSharedPhotoAlbum',
        'hideProfilePictureCoverChange',
        'hideUploadedPhoto',
        'hide3dPhoto',
        'hideLikedPhoto',
        'hideCommentedOnPhoto',
        'disableVideoAutoplayFacebook',
        'hideAllVideoPosts',
        'hideLiveVideoPosts',
        'hideReelsShortVideo',
        'hideSharedVideo',
        'hideLikedVideo',
        'hideCommentedOnVideo',
        'hideHashtagPosts',
    ],
    sectionII: ['hideSponsoredPosts', 'hideSuggestedPosts', 'hideMarketplaceAds'],
    sectionIII: [],
    sectionIV: ['allowByUrlOnly', 'allowPostKeywordsOnly'],
    sectionVI: [
        'hideRightColumnAll',
        'hideRightGameAppRequests',
        'hideRightMarketplacePanel',
        'hideRightRecommendedPages',
        'hideRightTodaysGames',
        'hideRightSuggestedGroups',
        'hideRightPokes',
        'hideRightHappeningLive',
        'hideRightEvents',
        'hideRightFriendRequests',
        'hideRightYourPages',
        'hideRightBirthdays',
        'hideRightWatch',
        'hideRightSaved',
        'hideRightRelated',
    ],
    sectionVII: [
        'hideLeftAdsManager',
        'hideLeftBrowse',
        'hideLeftCampus',
        'hideLeftCommunityHelp',
        'hideLeftCreate',
        'hideLeftCreatorStudio',
        'hideLeftEvents',
        'hideLeftFavorites',
        'hideLeftFriends',
        'hideLeftFundraisers',
        'hideLeftGaming',
        'hideLeftGroups',
        'hideLeftJobs',
        'hideLeftMarketplace',
        'hideLeftMemories',
        'hideLeftMessenger',
        'hideLeftMetaAI',
        'hideLeftNews',
        'hideLeftOffers',
        'hideLeftOrderFood',
        'hideLeftPages',
        'hideLeftReels',
        'hideLeftSaved',
        'hideLeftShops',
        'hideLeftWatch',
        'hideLeftWeather',
        'hideLeftBloodDonations',
        'hideLeftClimateScience',
        'hideLeftCrisisResponse',
        'hideLeftDating',
        'hideLeftMovies',
        'hideLeftMusic',
        'hideLeftMostRecent',
        'hideLeftLiveVideos',
        'hideLeftGameStreaming',
        'hideLeftRecentActivity',
        'hideLeftRecentAdActivity',
        'hideLeftVotingInformation',
        'hideLeftLocal',
        'hideLeftAbout',
    ],
    sectionIX: [
        'freezeTopNavBar',
        'showLogoutButton',
        'hideSearchBoxAndPopup',
        'hideNavHome',
        'hideNavPages',
        'hideNavReels',
        'hideNavMarketplace',
        'hideNavGroups',
        'hideNavGaming',
        'hideNavCreate',
        'hideNavMessenger',
        'hideNavNotifications',
        'hideNavNews',
        'hideNavEvents',
        'hideNavFriendRequests',
        'hideNavAccountSwitcher',
    ],
};

function escapeHtmlFacebook(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderFacebookSubheading(label) {
    return `<p class="fb-subheading theme-title text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--theme-muted)]">${escapeHtmlFacebook(label)}</p>`;
}

function normalizeHashtagToken(value) {
    const cleaned = String(value || '').trim().toLowerCase();
    if (!cleaned) {
        return '';
    }
    const withHash = cleaned.startsWith('#') ? cleaned : `#${cleaned}`;
    const compact = withHash.replace(/\s+/g, '');
    if (compact === '#') {
        return '';
    }
    return compact;
}

function parseHashtagKeywords(raw) {
    if (typeof raw !== 'string' || !raw.trim()) {
        return [];
    }
    const uniq = new Set();
    raw.split(/\r?\n/).forEach((line) => {
        const normalized = normalizeHashtagToken(line);
        if (normalized) {
            uniq.add(normalized);
        }
    });
    return Array.from(uniq);
}

function serializeHashtagKeywords(tags) {
    return Array.isArray(tags) ? tags.join('\n') : '';
}

/** Khớp `parseUserTextKeywords` trong undistracted-facebook.js (xuống dòng hoặc dấu phẩy). */
function parseTextFilterKeywords(raw) {
    if (typeof raw !== 'string' || !raw.trim()) {
        return [];
    }
    const unique = new Set();
    raw
        .split(/\r?\n|,/)
        .map((word) => word.trim().toLowerCase())
        .filter(Boolean)
        .forEach((word) => unique.add(word));
    return Array.from(unique);
}

function serializeTextFilterKeywords(phrases) {
    return Array.isArray(phrases) ? phrases.join('\n') : '';
}

/** Khớp `parseAllowPostKeywordsList` trong undistracted-facebook.js (mỗi dòng một cụm, chữ thường). */
function parseAllowPostKeywordsPhrases(raw) {
    if (typeof raw !== 'string' || !raw.trim()) {
        return [];
    }
    const seen = new Set();
    const out = [];
    raw.split(/\r?\n/).forEach((line) => {
        const t = line.trim().toLowerCase();
        if (t && !seen.has(t)) {
            seen.add(t);
            out.push(t);
        }
    });
    return out;
}

function serializeAllowPostKeywordsPhrases(phrases) {
    return Array.isArray(phrases) ? phrases.join('\n') : '';
}

function mergeAllowPostKeywordPhrases(current, incoming) {
    const seen = new Set(current);
    const out = [...current];
    incoming.forEach((p) => {
        if (!seen.has(p)) {
            seen.add(p);
            out.push(p);
        }
    });
    return out;
}

function renderTextFilterChips(phrases, canEdit) {
    if (!Array.isArray(phrases) || phrases.length === 0) {
        return '<p class="theme-muted text-[11px]">Chưa có từ khóa nào.</p>';
    }

    return phrases.map((phrase) => `
        <span class="fb-hashtag-chip">
            <span>${escapeHtmlFacebook(phrase)}</span>
            <button type="button" class="fb-hashtag-chip-remove" data-fb-text-filter-remove="${escapeHtmlFacebook(phrase)}" ${canEdit ? '' : 'disabled'} aria-label="Xóa từ khóa ${escapeHtmlFacebook(phrase)}">×</button>
        </span>
    `).join('');
}

function renderHashtagChips(tags, canEdit) {
    if (!Array.isArray(tags) || tags.length === 0) {
        return '<p class="theme-muted text-[11px]">Chưa có hashtag nào.</p>';
    }

    return tags.map((tag) => `
        <span class="fb-hashtag-chip">
            <span>${escapeHtmlFacebook(tag)}</span>
            <button type="button" class="fb-hashtag-chip-remove" data-fb-hashtag-remove="${escapeHtmlFacebook(tag)}" ${canEdit ? '' : 'disabled'} aria-label="Xóa hashtag ${escapeHtmlFacebook(tag)}">×</button>
        </span>
    `).join('');
}

function renderAllowUrlChips(urls, canEdit) {
    if (!Array.isArray(urls) || urls.length === 0) {
        return '<p class="theme-muted text-[11px]">Chưa có URL nào.</p>';
    }

    return urls.map((url) => `
        <span class="fb-hashtag-chip fb-allow-url-chip">
            <span class="fb-allow-url-chip__text">${escapeHtmlFacebook(url)}</span>
            <button type="button" class="fb-hashtag-chip-remove" data-fb-allow-url-remove="${escapeHtmlFacebook(url)}" ${canEdit ? '' : 'disabled'} aria-label="Xóa URL ${escapeHtmlFacebook(url)}">×</button>
        </span>
    `).join('');
}

function renderAllowPostKeywordChips(phrases, canEdit) {
    if (!Array.isArray(phrases) || phrases.length === 0) {
        return '<p class="theme-muted text-[11px]">Chưa có từ / cụm nào.</p>';
    }

    return phrases.map((phrase) => `
        <span class="fb-hashtag-chip">
            <span>${escapeHtmlFacebook(phrase)}</span>
            <button type="button" class="fb-hashtag-chip-remove" data-fb-allow-kw-remove="${escapeHtmlFacebook(phrase)}" ${canEdit ? '' : 'disabled'} aria-label="Xóa cụm ${escapeHtmlFacebook(phrase)}">×</button>
        </span>
    `).join('');
}

function renderFacebookChildRow(sectionId, settingKey, label, hint = '') {
    const hintHtml = hint
        ? `<p class="theme-muted mt-0.5 text-[10px] leading-snug">${escapeHtmlFacebook(hint)}</p>`
        : '';
    return `
    <div class="fb-child-row flex items-start gap-4 rounded-xl px-2 py-2.5 sm:gap-5 sm:px-3 sm:py-3">
        <button type="button" class="theme-switch mt-0.5 shrink-0" data-switch data-platform="facebook" data-setting="${escapeHtmlFacebook(settingKey)}" data-fb-parent="${escapeHtmlFacebook(sectionId)}" aria-pressed="false"><span class="theme-switch-thumb"></span></button>
        <div class="min-w-0 pt-0.5">
            <p class="theme-title text-[13px] leading-snug">${escapeHtmlFacebook(label)}</p>
            ${hintHtml}
        </div>
    </div>`;
}

function renderFacebookBulkAllRow(sectionId) {
    const keys = FACEBOOK_SECTION_BULK_CHILD_KEYS[sectionId];
    if (!keys?.length) {
        return '';
    }
    return `
    <div class="fb-bulk-row fb-child-row -mx-2 flex items-start gap-4 rounded-t-xl border-b border-[var(--theme-border)] px-2 py-3 sm:-mx-3 sm:gap-5 sm:px-3 sm:py-3.5">
        <button type="button" class="theme-switch fb-bulk-all-switch mt-0.5 shrink-0" data-fb-bulk-sync="${escapeHtmlFacebook(sectionId)}" aria-pressed="false" aria-label="Bật hoặc tắt đồng thời mọi chức năng trong mục"><span class="theme-switch-thumb"></span></button>
        <div class="min-w-0 pt-0.5">
            <p class="theme-title text-[13px] font-semibold leading-snug">Bật / tắt tất cả chức năng bên dưới</p>
            <p class="theme-muted mt-0.5 text-[10px] leading-snug">Ghi vào từng tùy chọn đã lưu. Công tắc ngoài chỉ khóa giao diện, không đổi giá trị đã lưu.</p>
        </div>
    </div>`;
}

function renderFacebookSection(sectionId, masterKey, title, subtitle, children, extraBodyHtml = '', bodyClass = '') {
    const subHtml = subtitle
        ? `<p class="theme-muted mt-0.5 text-[12px] leading-relaxed">${escapeHtmlFacebook(subtitle)}</p>`
        : '';
    const childRows = children.map(([key, label, hint]) => renderFacebookChildRow(sectionId, key, label, hint)).join('');
    const bulkRow = renderFacebookBulkAllRow(sectionId);

    return `
    <div class="fb-section theme-dashed-panel overflow-hidden rounded-[18px] border-2 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
        <div class="flex items-start justify-between gap-4 border-b border-[var(--theme-border)] bg-[var(--theme-soft-surface)] px-4 py-4 sm:gap-5 sm:px-6 sm:py-4">
            <div class="flex min-w-0 flex-1 items-start gap-4 sm:gap-5">
                <button type="button" class="theme-switch fb-master-switch mt-0.5 shrink-0" data-switch data-platform="facebook" data-setting="${escapeHtmlFacebook(masterKey)}" data-fb-master="${escapeHtmlFacebook(sectionId)}" aria-pressed="true"><span class="theme-switch-thumb"></span></button>
                <div class="min-w-0">
                    <p class="theme-title text-[15px] font-semibold leading-snug">${escapeHtmlFacebook(title)}</p>
                    ${subHtml}
                </div>
            </div>
            <button type="button" class="fb-section-toggle ml-1 shrink-0 rounded-xl p-2.5 text-[var(--theme-muted)] transition hover:bg-black/5 dark:hover:bg-white/10 sm:p-3" data-fb-collapse="${escapeHtmlFacebook(sectionId)}" aria-expanded="false" aria-label="Thu gọn hoặc mở rộng mục">
                <svg class="fb-chevron h-5 w-5 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
            </button>
        </div>
        <div class="fb-section-body hidden space-y-3 p-5 sm:space-y-4 sm:p-6 ${bodyClass}" data-fb-panel="${escapeHtmlFacebook(sectionId)}">
            ${bulkRow}
            ${childRows}
            ${extraBodyHtml}
        </div>
    </div>`;
}

function mountFacebookInAppPanel() {
    const root = document.getElementById('facebook-inapp-settings-root');
    if (!root || root.dataset.mounted === 'true') {
        return;
    }
    root.dataset.mounted = 'true';

    const leftMenuChildren = [
        ['hideLeftAdsManager', 'Ads Manager'],
        ['hideLeftBrowse', 'Browse'],
        ['hideLeftCampus', 'Campus'],
        ['hideLeftCommunityHelp', 'Community Help'],
        ['hideLeftCreate', 'Create / Create section'],
        ['hideLeftCreatorStudio', 'Creator Studio'],
        ['hideLeftEvents', 'Events'],
        ['hideLeftFavorites', 'Favorites'],
        ['hideLeftFriends', 'Friends'],
        ['hideLeftFundraisers', 'Fundraisers'],
        ['hideLeftGaming', 'Gaming'],
        ['hideLeftGroups', 'Groups'],
        ['hideLeftJobs', 'Jobs'],
        ['hideLeftMarketplace', 'Marketplace'],
        ['hideLeftMemories', 'Memories'],
        ['hideLeftMessenger', 'Messenger'],
        ['hideLeftMetaAI', 'Meta AI'],
        ['hideLeftNews', 'News'],
        ['hideLeftOffers', 'Offers'],
        ['hideLeftOrderFood', 'Order Food'],
        ['hideLeftPages', 'Pages'],
        ['hideLeftReels', 'Reels'],
        ['hideLeftSaved', 'Saved'],
        ['hideLeftShops', 'Shops'],
        ['hideLeftWatch', 'Watch'],
        ['hideLeftWeather', 'Weather'],
        ['hideLeftBloodDonations', 'Blood Donations'],
        ['hideLeftClimateScience', 'Climate Science'],
        ['hideLeftCrisisResponse', 'Crisis Response'],
        ['hideLeftDating', 'Dating'],
        ['hideLeftMovies', 'Movies'],
        ['hideLeftMusic', 'Music'],
        ['hideLeftMostRecent', 'Most Recent'],
        ['hideLeftLiveVideos', 'Live Videos'],
        ['hideLeftGameStreaming', 'Game streaming'],
        ['hideLeftRecentActivity', 'Recent activity'],
        ['hideLeftRecentAdActivity', 'Recent ad activity'],
        ['hideLeftVotingInformation', 'Voting information'],
        ['hideLeftLocal', 'Local'],
        ['hideLeftAbout', 'About / help shortcuts'],
    ].map(([k, label]) => [k, label, '']);

    const sectionIInner = [
        renderFacebookSubheading('Bảng tin'),
        renderFacebookChildRow('sectionI', 'hideEntireNewsfeed', 'Ẩn toàn bộ Bảng tin', ''),
        renderFacebookChildRow('sectionI', 'hideProfileInfoUpdates', 'Ẩn bài cập nhật thông tin cá nhân', ''),
        renderFacebookChildRow('sectionI', 'hideProductsShown', 'Ẩn “Sản phẩm được hiển thị”', ''),
        renderFacebookChildRow('sectionI', 'hideTrendingPosts', 'Ẩn Đang thịnh hành (bài / link / video)', ''),
        renderFacebookSubheading('Link / Trang'),
        renderFacebookChildRow('sectionI', 'hideLikedPagePost', 'Ẩn bài đã thích Trang', ''),
        renderFacebookChildRow('sectionI', 'hideLikedLinkPost', 'Ẩn bài đã thích bài link', ''),
        renderFacebookChildRow('sectionI', 'hideSharedLinkPost', 'Ẩn bài chia sẻ liên kết', ''),
        renderFacebookChildRow('sectionI', 'hideCommentedLinkPost', 'Ẩn bài bình luận về liên kết', ''),
        renderFacebookChildRow('sectionI', 'hideLikePageButtons', 'Ẩn các nút “Thích trang” trong feed', ''),
        renderFacebookSubheading('Hình ảnh'),
        renderFacebookChildRow('sectionI', 'hideAllPhotoPosts', 'Ẩn toàn bộ bài ảnh', ''),
        renderFacebookChildRow('sectionI', 'hideSharedPhotoAlbum', 'Ẩn chia sẻ ảnh / album', ''),
        renderFacebookChildRow('sectionI', 'hideProfilePictureCoverChange', 'Ẩn đổi ảnh đại diện / ảnh bìa', ''),
        renderFacebookChildRow('sectionI', 'hideUploadedPhoto', 'Ẩn đã tải ảnh lên', ''),
        renderFacebookChildRow('sectionI', 'hide3dPhoto', 'Ẩn ảnh 3D', ''),
        renderFacebookChildRow('sectionI', 'hideLikedPhoto', 'Ẩn đã thích ảnh', ''),
        renderFacebookChildRow('sectionI', 'hideCommentedOnPhoto', 'Ẩn đã bình luận ảnh', ''),
        renderFacebookSubheading('Video'),
        renderFacebookChildRow('sectionI', 'disableVideoAutoplayFacebook', 'Tắt tự động phát video', ''),
        renderFacebookChildRow('sectionI', 'hideAllVideoPosts', 'Ẩn toàn bộ bài video', ''),
        renderFacebookChildRow('sectionI', 'hideLiveVideoPosts', 'Ẩn video trực tiếp / was live', ''),
        renderFacebookChildRow('sectionI', 'hideReelsShortVideo', 'Ẩn Reels / video ngắn', ''),
        renderFacebookChildRow('sectionI', 'hideSharedVideo', 'Ẩn chia sẻ video', ''),
        renderFacebookChildRow('sectionI', 'hideLikedVideo', 'Ẩn đã thích video', ''),
        renderFacebookChildRow('sectionI', 'hideCommentedOnVideo', 'Ẩn đã bình luận video', ''),
        renderFacebookSubheading('Hashtag'),
        renderFacebookChildRow('sectionI', 'hideHashtagPosts', 'Ẩn post theo hashtag', ''),
        `<div class="fb-hashtag-keywords-block mt-2 border-t border-[var(--theme-border)] pt-4" data-fb-hashtag-block>
            <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="theme-title text-[12px] font-medium">Danh sách hashtag đang chặn</p>
                <button type="button" id="fb-hashtag-open-popup" class="fb-hashtag-add-btn" data-fb-hashtag-open>+ THÊM HASHTAG</button>
            </div>
            <div id="fb-hashtag-list" class="fb-hashtag-list mt-3" data-fb-hashtag-list></div>
            <p class="theme-muted mt-2 text-[10px] leading-snug">Mỗi dòng một mục (có hoặc không dấu #). Ví dụ <code class="text-[10px]">vinfast</code> sẽ ẩn mọi bài có từ đó trong chữ, không chỉ hashtag. Nhấn «Thêm hashtag» để nhập hàng loạt.</p>
            <div class="fb-hashtag-modal hidden" data-fb-hashtag-modal>
                <div class="fb-hashtag-modal__backdrop" data-fb-hashtag-close></div>
                <div class="fb-hashtag-modal__panel theme-surface theme-border">
                    <div class="flex items-center justify-between gap-3 border-b border-[var(--theme-border)] px-4 py-3">
                        <p class="theme-title text-[16px] font-semibold">Add hashtags</p>
                        <button type="button" class="fb-hashtag-modal__close" data-fb-hashtag-close aria-label="Đóng popup">×</button>
                    </div>
                    <div class="px-4 py-4">
                        <textarea id="fb-hashtag-popup-input" rows="6" class="theme-surface theme-border w-full resize-y rounded-xl border px-3 py-2 text-[13px] outline-none focus:border-[var(--theme-primary)]" placeholder="#study
#focus"></textarea>
                        <p class="theme-muted mt-2 text-[11px]">Mỗi dòng một hashtag. Có thể nhập có hoặc không có dấu #.</p>
                        <div class="mt-4 flex justify-end gap-2">
                            <button type="button" class="fb-hashtag-action-btn fb-hashtag-action-btn--ghost" data-fb-hashtag-close>CANCEL</button>
                            <button type="button" class="fb-hashtag-action-btn" data-fb-hashtag-save>ADD HASHTAGS</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>`,
    ].join('');

    const textFilterExtra = `
        <div class="fb-text-filter-keywords-block mt-2 border-t border-[var(--theme-border)] pt-4" data-fb-keywords-block data-fb-text-filter-block>
            <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="theme-title text-[12px] font-medium">Danh sách từ khóa đang lọc</p>
                <button type="button" class="fb-hashtag-add-btn" data-fb-text-filter-open>+ THÊM TỪ KHÓA</button>
            </div>
            <div id="fb-text-filter-list" class="fb-hashtag-list mt-3" data-fb-text-filter-list></div>
            <p class="theme-muted mt-2 text-[10px] leading-snug">Ẩn bài có chứa bất kỳ từ/cụm sau trong nội dung chữ (không phân biệt hoa thường). Nhấn «Thêm từ khóa» để nhập nhiều mục: mỗi dòng một từ/cụm, hoặc cách nhau bằng dấu phẩy.</p>
            <div class="fb-hashtag-modal hidden" data-fb-text-filter-modal>
                <div class="fb-hashtag-modal__backdrop" data-fb-text-filter-close></div>
                <div class="fb-hashtag-modal__panel theme-surface theme-border">
                    <div class="flex items-center justify-between gap-3 border-b border-[var(--theme-border)] px-4 py-3">
                        <p class="theme-title text-[16px] font-semibold">Thêm từ khóa</p>
                        <button type="button" class="fb-hashtag-modal__close" data-fb-text-filter-close aria-label="Đóng popup">×</button>
                    </div>
                    <div class="px-4 py-4">
                        <textarea id="fb-text-filter-popup-input" rows="6" class="theme-surface theme-border w-full resize-y rounded-xl border px-3 py-2 text-[13px] outline-none focus:border-[var(--theme-primary)]" placeholder="giveaway
quảng cáo, spam"></textarea>
                        <p class="theme-muted mt-2 text-[11px]">Mỗi dòng một mục, hoặc cùng dòng cách nhau bằng dấu phẩy (giống bộ lọc trên Facebook).</p>
                        <div class="mt-4 flex justify-end gap-2">
                            <button type="button" class="fb-hashtag-action-btn fb-hashtag-action-btn--ghost" data-fb-text-filter-close>Hủy</button>
                            <button type="button" class="fb-hashtag-action-btn" data-fb-text-filter-save>Thêm</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    const allowByUrlExtra = `
        ${renderFacebookChildRow('sectionIV', 'allowByUrlOnly', 'Allow theo URL Facebook (chỉ hiển thị bài từ URL đã khai báo)', '')}
        <div class="fb-allow-url-block mt-2 border-t border-[var(--theme-border)] pt-4" data-fb-allow-url-block data-fb-allow-url-chip-root>
            <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="theme-title text-[12px] font-medium">Danh sách URL Facebook được phép</p>
                <button type="button" class="fb-hashtag-add-btn" data-fb-allow-url-open>+ THÊM URL</button>
            </div>
            <div id="fb-allow-url-list" class="fb-hashtag-list mt-3" data-fb-allow-url-list></div>
            <p class="theme-muted mt-2 text-[10px] leading-snug">Thêm URL trang, nhóm hoặc profile nguồn đăng (ví dụ link nhóm hoặc trang Page), không dùng link permalink từng bài. Extension chỉ lấy link tên trang/nhóm ở đầu bài (profile_name / tiêu đề), không quét link trong thân bài. Chỉ facebook.com; khớp từ DOM đã render. Nhấn «Thêm URL» để nhập nhiều dòng.</p>
            <div class="fb-hashtag-modal hidden" data-fb-allow-url-modal>
                <div class="fb-hashtag-modal__backdrop" data-fb-allow-url-close></div>
                <div class="fb-hashtag-modal__panel theme-surface theme-border">
                    <div class="flex items-center justify-between gap-3 border-b border-[var(--theme-border)] px-4 py-3">
                        <p class="theme-title text-[16px] font-semibold">Thêm URL Facebook</p>
                        <button type="button" class="fb-hashtag-modal__close" data-fb-allow-url-close aria-label="Đóng popup">×</button>
                    </div>
                    <div class="px-4 py-4">
                        <textarea id="fb-allow-url-popup-input" rows="6" class="theme-surface theme-border w-full resize-y rounded-xl border px-3 py-2 text-[13px] outline-none focus:border-[var(--theme-primary)]" placeholder="https://www.facebook.com/groups/123456789
https://www.facebook.com/somepage"></textarea>
                        <p class="theme-muted mt-2 text-[11px]">Mỗi dòng một URL. Dòng không hợp lệ hoặc không phải facebook.com sẽ bị bỏ qua.</p>
                        <div class="mt-4 flex justify-end gap-2">
                            <button type="button" class="fb-hashtag-action-btn fb-hashtag-action-btn--ghost" data-fb-allow-url-close>Hủy</button>
                            <button type="button" class="fb-hashtag-action-btn" data-fb-allow-url-save>Thêm</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        ${renderFacebookChildRow('sectionIV', 'allowPostKeywordsOnly', 'Allow theo từ khóa (chỉ hiển thị bài có ít nhất một cụm trong danh sách)', '')}
        <div class="fb-allow-keywords-block mt-2 border-t border-[var(--theme-border)] pt-4" data-fb-allow-keywords-block data-fb-allow-kw-chip-root>
            <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="theme-title text-[12px] font-medium">Danh sách từ / cụm được phép</p>
                <button type="button" class="fb-hashtag-add-btn" data-fb-allow-kw-open>+ THÊM CỤM</button>
            </div>
            <div id="fb-allow-keywords-list" class="fb-hashtag-list mt-3" data-fb-allow-kw-list></div>
            <p class="theme-muted mt-2 text-[10px] leading-snug">So khớp không phân biệt hoa thường, tìm chuỗi con trong nội dung bài (tiêu đề + phần chữ). Nếu bật cả Allow URL và Allow từ khóa, bài phải thỏa cả hai. Nhấn «Thêm cụm» để nhập nhiều dòng (mỗi dòng một cụm).</p>
            <div class="fb-hashtag-modal hidden" data-fb-allow-kw-modal>
                <div class="fb-hashtag-modal__backdrop" data-fb-allow-kw-close></div>
                <div class="fb-hashtag-modal__panel theme-surface theme-border">
                    <div class="flex items-center justify-between gap-3 border-b border-[var(--theme-border)] px-4 py-3">
                        <p class="theme-title text-[16px] font-semibold">Thêm từ / cụm được phép</p>
                        <button type="button" class="fb-hashtag-modal__close" data-fb-allow-kw-close aria-label="Đóng popup">×</button>
                    </div>
                    <div class="px-4 py-4">
                        <textarea id="fb-allow-kw-popup-input" rows="6" class="theme-surface theme-border w-full resize-y rounded-xl border px-3 py-2 text-[13px] outline-none focus:border-[var(--theme-primary)]" placeholder="sinh viên VMU
họp lớp"></textarea>
                        <p class="theme-muted mt-2 text-[11px]">Mỗi dòng một cụm. Khi lưu sẽ chuyển về chữ thường (giống cách so khớp trên Facebook).</p>
                        <div class="mt-4 flex justify-end gap-2">
                            <button type="button" class="fb-hashtag-action-btn fb-hashtag-action-btn--ghost" data-fb-allow-kw-close>Hủy</button>
                            <button type="button" class="fb-hashtag-action-btn" data-fb-allow-kw-save>Thêm</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;

    const sectionsHtml = [
        renderFacebookSection(
            'sectionI',
            'masterSectionI',
            'Lọc bài viết trên Bảng tin',
            'Gồm bảng tin, link/trang, ảnh, video. Tắt mục lớn chỉ khoá các nút con, không đổi trạng thái bật/tắt đã lưu.',
            [],
            sectionIInner,
        ),
        renderFacebookSection(
            'sectionII',
            'masterSectionII',
            'Chặn quảng cáo & nội dung đề xuất',
            'Sponsored, gợi ý, quảng cáo Marketplace.',
            [
                ['hideSponsoredPosts', 'Ẩn bài Được tài trợ / Sponsored', ''],
                ['hideSuggestedPosts', 'Ẩn bài đề xuất (Suggested)', 'Tách khỏi Sponsored khi nhận diện được.'],
                ['hideMarketplaceAds', 'Ẩn quảng cáo Marketplace', ''],
            ],
        ),
        renderFacebookSection(
            'sectionIII',
            'masterSectionIII',
            'Bộ lọc văn bản',
            'Từ khóa tự tạo từ nội dung văn bản bài viết.',
            [],
            textFilterExtra,
        ),
        renderFacebookSection(
            'sectionIV',
            'masterSectionIV',
            'Allow (URL & từ khóa)',
            'Chỉ giữ bài khớp URL và/hoặc chứa từ khóa cho phép (cấu hình bên dưới).',
            [],
            allowByUrlExtra,
        ),
        renderFacebookSection(
            'sectionVI',
            'masterSectionVI',
            'Ẩn cột phải',
            'Ẩn toàn cột hoặc từng khối: games, marketplace, gợi ý, v.v.',
            [
                ['hideRightColumnAll', 'Ẩn toàn bộ cột phải', ''],
                ['hideRightGameAppRequests', 'Ẩn Game / App requests', ''],
                ['hideRightMarketplacePanel', 'Ẩn Marketplace (panel phải)', ''],
                ['hideRightRecommendedPages', 'Ẩn Trang được đề xuất', ''],
                ['hideRightTodaysGames', "Ẩn Today's games", ''],
                ['hideRightSuggestedGroups', 'Ẩn Nhóm gợi ý', ''],
                ['hideRightPokes', 'Ẩn Pokes', ''],
                ['hideRightHappeningLive', 'Ẩn Happening now / Live', ''],
                ['hideRightEvents', 'Ẩn Events', ''],
                ['hideRightFriendRequests', 'Ẩn Lời mời kết bạn', ''],
                ['hideRightYourPages', 'Ẩn Your pages', ''],
                ['hideRightBirthdays', 'Ẩn Sinh nhật', ''],
                ['hideRightWatch', 'Ẩn Watch (video)', ''],
                ['hideRightSaved', 'Ẩn Saved / liên kết đã lưu', ''],
                ['hideRightRelated', 'Ẩn mục Related / liên quan', ''],
            ],
        ),
        renderFacebookSection(
            'sectionVII',
            'masterSectionVII',
            'Ẩn cột trái / menu trái',
            'Ẩn từng shortcut — danh sách có thể mở rộng thêm theo bản Facebook.',
            leftMenuChildren,
            '',
            'max-h-96 overflow-y-auto overflow-x-hidden',
        ),
        renderFacebookSection(
            'sectionIX',
            'masterSectionIX',
            'Tùy chọn top navigation bar',
            'Cố định bar, nút thoát, ô tìm kiếm, và từng icon điều hướng.',
            [
                ['freezeTopNavBar', 'Cố định top bar khi cuộn (freeze)', ''],
                ['showLogoutButton', 'Hiện nút Đăng xuất (nếu chèn được)', ''],
                ['hideSearchBoxAndPopup', 'Ẩn ô tìm kiếm & popup / xu hướng', ''],
                ['hideNavHome', 'Ẩn nút Home', ''],
                ['hideNavPages', 'Ẩn Pages', ''],
                ['hideNavReels', 'Ẩn Reels', ''],
                ['hideNavMarketplace', 'Ẩn Marketplace', ''],
                ['hideNavGroups', 'Ẩn Groups', ''],
                ['hideNavGaming', 'Ẩn Gaming', ''],
                ['hideNavCreate', 'Ẩn Create', ''],
                ['hideNavMessenger', 'Ẩn Messenger', ''],
                ['hideNavNotifications', 'Ẩn Notifications', ''],
                ['hideNavNews', 'Ẩn News', ''],
                ['hideNavEvents', 'Ẩn Events', ''],
                ['hideNavFriendRequests', 'Ẩn Friend requests', ''],
                ['hideNavAccountSwitcher', 'Ẩn chuyển tài khoản', ''],
            ],
        ),
    ].join('');

    root.innerHTML = `<div class="mt-6 space-y-5 sm:space-y-6">${sectionsHtml}</div>`;
}

/** Master toggles only enable/disable child controls in the UI; child on/off values in storage are never changed here. */
function refreshFacebookSectionUi() {
    const fb = currentSettings?.facebook || {};
    document.querySelectorAll('[data-fb-master]').forEach((masterBtn) => {
        const sectionId = masterBtn.dataset.fbMaster;
        const masterKey = masterBtn.dataset.setting;
        const sectionEnabled = fb[masterKey] !== false;

        document.querySelectorAll(`[data-fb-parent="${sectionId}"]`).forEach((childBtn) => {
            childBtn.disabled = !sectionEnabled;
            childBtn.setAttribute('aria-disabled', String(!sectionEnabled));
            const row = childBtn.closest('.fb-child-row');
            if (row) {
                row.classList.toggle('fb-child-row--locked', !sectionEnabled);
            }
        });

        const panel = document.querySelector(`[data-fb-panel="${sectionId}"]`);
        if (panel) {
            const bulkBtn = panel.querySelector(`[data-fb-bulk-sync="${sectionId}"]`);
            if (bulkBtn) {
                bulkBtn.disabled = !sectionEnabled;
                bulkBtn.setAttribute('aria-disabled', String(!sectionEnabled));
                const bulkRow = bulkBtn.closest('.fb-bulk-row');
                if (bulkRow) {
                    bulkRow.classList.toggle('fb-child-row--locked', !sectionEnabled);
                }
            }
        }
        if (sectionId === 'sectionIII' && panel) {
            const keywordsBlock = panel.querySelector('[data-fb-keywords-block]');
            const openButton = panel.querySelector('[data-fb-text-filter-open]');
            const removeButtons = panel.querySelectorAll('[data-fb-text-filter-remove]');
            if (openButton) {
                openButton.disabled = !sectionEnabled;
            }
            removeButtons.forEach((btn) => {
                btn.disabled = !sectionEnabled;
                btn.setAttribute('aria-disabled', String(!sectionEnabled));
            });
            if (!sectionEnabled && keywordsBlock) {
                const tfModal = keywordsBlock.querySelector('[data-fb-text-filter-modal]');
                if (tfModal) {
                    tfModal.classList.add('hidden');
                }
            }
            if (keywordsBlock) {
                keywordsBlock.classList.toggle('fb-keywords-block--locked', !sectionEnabled);
                if (sectionEnabled) {
                    keywordsBlock.removeAttribute('inert');
                } else {
                    keywordsBlock.setAttribute('inert', '');
                }
            }
        }
        if (sectionId === 'sectionIV' && panel) {
            const allowBlock = panel.querySelector('[data-fb-allow-url-block]');
            const allowToggle = panel.querySelector('[data-setting="allowByUrlOnly"][data-fb-parent="sectionIV"]');
            const allowOpenButton = panel.querySelector('[data-fb-allow-url-open]');
            const allowRemoveButtons = panel.querySelectorAll('[data-fb-allow-url-remove]');
            const allowEnabled = sectionEnabled && Boolean(fb.allowByUrlOnly);
            if (allowOpenButton) {
                allowOpenButton.disabled = !allowEnabled;
            }
            allowRemoveButtons.forEach((btn) => {
                btn.disabled = !allowEnabled;
                btn.setAttribute('aria-disabled', String(!allowEnabled));
            });
            if (!allowEnabled && allowBlock) {
                const allowModal = allowBlock.querySelector('[data-fb-allow-url-modal]');
                if (allowModal) {
                    allowModal.classList.add('hidden');
                }
            }
            if (allowBlock) {
                allowBlock.classList.toggle('fb-allow-url-block--locked', !allowEnabled);
                if (allowEnabled) {
                    allowBlock.removeAttribute('inert');
                } else {
                    allowBlock.setAttribute('inert', '');
                }
            }
            if (allowToggle) {
                allowToggle.setAttribute('aria-disabled', String(!sectionEnabled));
            }

            const kwBlock = panel.querySelector('[data-fb-allow-keywords-block]');
            const kwOpenButton = panel.querySelector('[data-fb-allow-kw-open]');
            const kwRemoveButtons = panel.querySelectorAll('[data-fb-allow-kw-remove]');
            const kwToggle = panel.querySelector('[data-setting="allowPostKeywordsOnly"][data-fb-parent="sectionIV"]');
            const kwEnabled = sectionEnabled && Boolean(fb.allowPostKeywordsOnly);
            if (kwOpenButton) {
                kwOpenButton.disabled = !kwEnabled;
            }
            kwRemoveButtons.forEach((btn) => {
                btn.disabled = !kwEnabled;
                btn.setAttribute('aria-disabled', String(!kwEnabled));
            });
            if (!kwEnabled && kwBlock) {
                const kwModal = kwBlock.querySelector('[data-fb-allow-kw-modal]');
                if (kwModal) {
                    kwModal.classList.add('hidden');
                }
            }
            if (kwBlock) {
                kwBlock.classList.toggle('fb-allow-keywords-block--locked', !kwEnabled);
                if (kwEnabled) {
                    kwBlock.removeAttribute('inert');
                } else {
                    kwBlock.setAttribute('inert', '');
                }
            }
            if (kwToggle) {
                kwToggle.setAttribute('aria-disabled', String(!sectionEnabled));
            }
        }

        if (sectionId === 'sectionI' && panel) {
            const hashtagBlock = panel.querySelector('[data-fb-hashtag-block]');
            const hashtagToggle = panel.querySelector('[data-setting="hideHashtagPosts"][data-fb-parent="sectionI"]');
            const hashtagOpenButton = panel.querySelector('[data-fb-hashtag-open]');
            const hashtagRemoveButtons = panel.querySelectorAll('[data-fb-hashtag-remove]');
            const hashtagEnabled = sectionEnabled && Boolean(fb.hideHashtagPosts);
            if (hashtagOpenButton) {
                hashtagOpenButton.disabled = !hashtagEnabled;
            }
            hashtagRemoveButtons.forEach((btn) => {
                btn.disabled = !hashtagEnabled;
                btn.setAttribute('aria-disabled', String(!hashtagEnabled));
            });
            if (!hashtagEnabled && hashtagBlock) {
                const modal = hashtagBlock.querySelector('[data-fb-hashtag-modal]');
                if (modal) {
                    modal.classList.add('hidden');
                }
            }
            if (hashtagBlock) {
                hashtagBlock.classList.toggle('fb-hashtag-block--locked', !hashtagEnabled);
                if (hashtagEnabled) {
                    hashtagBlock.removeAttribute('inert');
                } else {
                    hashtagBlock.setAttribute('inert', '');
                }
            }
            if (hashtagToggle) {
                hashtagToggle.setAttribute('aria-disabled', String(!sectionEnabled));
            }
        }
    });
}

function refreshFacebookBulkSyncVisuals() {
    const fb = currentSettings?.facebook || {};
    document.querySelectorAll('[data-fb-bulk-sync]').forEach((btn) => {
        const sectionId = btn.dataset.fbBulkSync;
        const keys = FACEBOOK_SECTION_BULK_CHILD_KEYS[sectionId];
        if (!keys?.length) {
            return;
        }
        const allOn = keys.every((k) => Boolean(fb[k]));
        setSwitchVisualState(btn, allOn);
    });
}

function bindFacebookBulkSyncControls() {
    document.querySelectorAll('[data-fb-bulk-sync]').forEach((btn) => {
        if (btn.dataset.boundBulk === 'true') {
            return;
        }
        btn.dataset.boundBulk = 'true';
        btn.addEventListener('click', () => {
            if (btn.disabled) {
                return;
            }
            const sectionId = btn.dataset.fbBulkSync;
            const keys = FACEBOOK_SECTION_BULK_CHILD_KEYS[sectionId];
            if (!keys?.length) {
                return;
            }
            try {
                chrome.storage.sync.get([STORAGE_KEY], (data) => {
                    if (chrome.runtime.lastError) {
                        console.error('[DASHBOARD:GET_BULK_SYNC]', chrome.runtime.lastError);
                        return;
                    }
                    const settings = mergeSettings(data[STORAGE_KEY]);
                    const fb = settings.facebook;
                    const allOn = keys.every((k) => Boolean(fb[k]));
                    const next = !allOn;
                    keys.forEach((k) => {
                        fb[k] = next;
                    });
                    saveSettings(settings);
                    applyStoredSettings(currentSettings);
                    notifyTabs('facebook');
                });
            } catch (error) {
                console.error('[DASHBOARD:BULK_SYNC]', error);
            }
        });
    });
}

function bindFacebookCollapseControls() {
    document.querySelectorAll('[data-fb-collapse]').forEach((btn) => {
        if (btn.dataset.bound === 'true') {
            return;
        }
        btn.dataset.bound = 'true';
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-fb-collapse');
            const panel = document.querySelector(`[data-fb-panel="${id}"]`);
            if (!panel) {
                return;
            }
            const expanded = btn.getAttribute('aria-expanded') === 'true';
            const nextExpanded = !expanded;
            btn.setAttribute('aria-expanded', String(nextExpanded));
            panel.classList.toggle('hidden', !nextExpanded);
        });
    });
}

function bindFacebookTextFilterChipUi() {
    const block = document.querySelector('[data-fb-text-filter-block]');
    const openButton = block?.querySelector('[data-fb-text-filter-open]');
    const listEl = block?.querySelector('[data-fb-text-filter-list]');
    const modal = block?.querySelector('[data-fb-text-filter-modal]');
    const popupInput = block?.querySelector('#fb-text-filter-popup-input');
    const saveButton = block?.querySelector('[data-fb-text-filter-save]');
    if (!block || !openButton || !listEl || !modal || !popupInput || !saveButton || block.dataset.tfBound === 'true') {
        return;
    }
    block.dataset.tfBound = 'true';

    const closeModal = () => {
        modal.classList.add('hidden');
    };
    const openModal = () => {
        if (openButton.disabled) {
            return;
        }
        popupInput.value = '';
        modal.classList.remove('hidden');
        popupInput.focus();
    };

    const persistPhrases = (nextPhrases) => {
        try {
            chrome.storage.sync.get([STORAGE_KEY], (data) => {
                if (chrome.runtime.lastError) {
                    return;
                }
                const settings = mergeSettings(data[STORAGE_KEY]);
                settings.facebook.textFilterKeywords = serializeTextFilterKeywords(nextPhrases);
                saveSettings(settings);
                notifyTabs('facebook');
                currentSettings = mergeSettings(settings);
                const canEdit = Boolean(currentSettings?.facebook?.masterSectionIII !== false);
                listEl.innerHTML = renderTextFilterChips(nextPhrases, canEdit);
                refreshFacebookSectionUi();
            });
        } catch (error) {
            console.error('[DASHBOARD:FB_TEXT_FILTER]', error);
        }
    };

    openButton.addEventListener('click', openModal);
    modal.querySelectorAll('[data-fb-text-filter-close]').forEach((btn) => {
        btn.addEventListener('click', closeModal);
    });
    saveButton.addEventListener('click', () => {
        const currentPhrases = parseTextFilterKeywords(currentSettings?.facebook?.textFilterKeywords || '');
        const incomingPhrases = parseTextFilterKeywords(popupInput.value);
        const merged = Array.from(new Set([...currentPhrases, ...incomingPhrases]));
        persistPhrases(merged);
        closeModal();
    });

    listEl.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target.closest('[data-fb-text-filter-remove]') : null;
        if (!(target instanceof HTMLButtonElement) || target.disabled) {
            return;
        }
        const phraseToRemove = target.getAttribute('data-fb-text-filter-remove') || '';
        if (!phraseToRemove) {
            return;
        }
        const nextPhrases = parseTextFilterKeywords(currentSettings?.facebook?.textFilterKeywords || '')
            .filter((p) => p !== phraseToRemove);
        persistPhrases(nextPhrases);
    });
}

function isFacebookUrlInput(raw) {
    try {
        const asUrl = new URL(raw.trim(), 'https://www.facebook.com');
        return /(^|\.)facebook\.com$/i.test(asUrl.hostname);
    } catch (error) {
        return false;
    }
}

function normalizeAllowUrlList(rawText) {
    if (typeof rawText !== 'string') {
        return '';
    }
    const uniq = new Set();
    rawText.split(/\r?\n/).forEach((line) => {
        const value = line.trim();
        if (!value || !isFacebookUrlInput(value)) {
            return;
        }
        const asUrl = new URL(value, 'https://www.facebook.com');
        let path = asUrl.pathname.replace(/\/+$/, '') || '/';
        path = path.toLowerCase();
        let query = '';
        if (path === '/profile.php') {
            const id = asUrl.searchParams.get('id');
            if (id) {
                query = `?id=${encodeURIComponent(id)}`;
            }
        }
        uniq.add(`https://www.facebook.com${path}${query}`);
    });
    return Array.from(uniq).join('\n');
}

function parseAllowUrlListToLines(raw) {
    if (typeof raw !== 'string' || !raw.trim()) {
        return [];
    }
    return raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function bindFacebookAllowUrlChipUi() {
    const root = document.querySelector('[data-fb-allow-url-chip-root]');
    if (!root || root.dataset.boundAllowUrl === 'true') {
        return;
    }
    root.dataset.boundAllowUrl = 'true';

    const listEl = root.querySelector('[data-fb-allow-url-list]');
    const openButton = root.querySelector('[data-fb-allow-url-open]');
    const modal = root.querySelector('[data-fb-allow-url-modal]');
    const popupInput = root.querySelector('#fb-allow-url-popup-input');
    const saveButton = root.querySelector('[data-fb-allow-url-save]');
    if (!listEl || !openButton || !modal || !popupInput || !(saveButton instanceof HTMLButtonElement)) {
        return;
    }

    const closeModal = () => {
        modal.classList.add('hidden');
    };
    const openModal = () => {
        if (openButton.disabled) {
            return;
        }
        popupInput.value = '';
        modal.classList.remove('hidden');
        popupInput.focus();
    };

    const persistNormalized = (normalized) => {
        try {
            chrome.storage.sync.get([STORAGE_KEY], (data) => {
                if (chrome.runtime.lastError) {
                    return;
                }
                const settings = mergeSettings(data[STORAGE_KEY]);
                settings.facebook.allowByUrlList = normalized;
                saveSettings(settings);
                notifyTabs('facebook');
                currentSettings = mergeSettings(settings);
                const urls = parseAllowUrlListToLines(normalized);
                const canEdit = Boolean(currentSettings?.facebook?.masterSectionIV !== false)
                    && Boolean(currentSettings?.facebook?.allowByUrlOnly);
                listEl.innerHTML = renderAllowUrlChips(urls, canEdit);
                refreshFacebookSectionUi();
            });
        } catch (error) {
            console.error('[DASHBOARD:FB_ALLOW_BY_URL]', error);
        }
    };

    openButton.addEventListener('click', openModal);
    modal.querySelectorAll('[data-fb-allow-url-close]').forEach((btn) => {
        btn.addEventListener('click', closeModal);
    });
    saveButton.addEventListener('click', () => {
        const currentRaw = currentSettings?.facebook?.allowByUrlList || '';
        const merged = normalizeAllowUrlList(`${currentRaw}\n${popupInput.value}`);
        persistNormalized(merged);
        closeModal();
    });

    listEl.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target.closest('[data-fb-allow-url-remove]') : null;
        if (!(target instanceof HTMLButtonElement) || target.disabled) {
            return;
        }
        const urlToRemove = target.getAttribute('data-fb-allow-url-remove') || '';
        if (!urlToRemove) {
            return;
        }
        const nextLines = parseAllowUrlListToLines(currentSettings?.facebook?.allowByUrlList || '')
            .filter((u) => u !== urlToRemove);
        persistNormalized(normalizeAllowUrlList(nextLines.join('\n')));
    });
}

function bindFacebookAllowPostKeywordsChipUi() {
    const root = document.querySelector('[data-fb-allow-kw-chip-root]');
    if (!root || root.dataset.boundAllowKw === 'true') {
        return;
    }
    root.dataset.boundAllowKw = 'true';

    const listEl = root.querySelector('[data-fb-allow-kw-list]');
    const openButton = root.querySelector('[data-fb-allow-kw-open]');
    const modal = root.querySelector('[data-fb-allow-kw-modal]');
    const popupInput = root.querySelector('#fb-allow-kw-popup-input');
    const saveButton = root.querySelector('[data-fb-allow-kw-save]');
    if (!listEl || !openButton || !modal || !popupInput || !(saveButton instanceof HTMLButtonElement)) {
        return;
    }

    const closeModal = () => {
        modal.classList.add('hidden');
    };
    const openModal = () => {
        if (openButton.disabled) {
            return;
        }
        popupInput.value = '';
        modal.classList.remove('hidden');
        popupInput.focus();
    };

    const persistPhrases = (nextPhrases) => {
        try {
            chrome.storage.sync.get([STORAGE_KEY], (data) => {
                if (chrome.runtime.lastError) {
                    return;
                }
                const settings = mergeSettings(data[STORAGE_KEY]);
                const serialized = serializeAllowPostKeywordsPhrases(nextPhrases);
                settings.facebook.allowPostKeywordsList = serialized;
                saveSettings(settings);
                notifyTabs('facebook');
                currentSettings = mergeSettings(settings);
                const canEdit = Boolean(currentSettings?.facebook?.masterSectionIV !== false)
                    && Boolean(currentSettings?.facebook?.allowPostKeywordsOnly);
                listEl.innerHTML = renderAllowPostKeywordChips(nextPhrases, canEdit);
                refreshFacebookSectionUi();
            });
        } catch (error) {
            console.error('[DASHBOARD:FB_ALLOW_KEYWORDS]', error);
        }
    };

    openButton.addEventListener('click', openModal);
    modal.querySelectorAll('[data-fb-allow-kw-close]').forEach((btn) => {
        btn.addEventListener('click', closeModal);
    });
    saveButton.addEventListener('click', () => {
        const currentPhrases = parseAllowPostKeywordsPhrases(currentSettings?.facebook?.allowPostKeywordsList || '');
        const incomingPhrases = parseAllowPostKeywordsPhrases(popupInput.value);
        const merged = mergeAllowPostKeywordPhrases(currentPhrases, incomingPhrases);
        persistPhrases(merged);
        closeModal();
    });

    listEl.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target.closest('[data-fb-allow-kw-remove]') : null;
        if (!(target instanceof HTMLButtonElement) || target.disabled) {
            return;
        }
        const phraseToRemove = target.getAttribute('data-fb-allow-kw-remove') || '';
        if (!phraseToRemove) {
            return;
        }
        const nextPhrases = parseAllowPostKeywordsPhrases(currentSettings?.facebook?.allowPostKeywordsList || '')
            .filter((p) => p !== phraseToRemove);
        persistPhrases(nextPhrases);
    });
}

function bindFacebookHashtagFilter() {
    const block = document.querySelector('[data-fb-hashtag-block]');
    const openButton = block?.querySelector('[data-fb-hashtag-open]');
    const listEl = block?.querySelector('[data-fb-hashtag-list]');
    const modal = block?.querySelector('[data-fb-hashtag-modal]');
    const popupInput = block?.querySelector('#fb-hashtag-popup-input');
    const saveButton = block?.querySelector('[data-fb-hashtag-save]');
    if (!block || !openButton || !listEl || !modal || !popupInput || !saveButton || block.dataset.bound === 'true') {
        return;
    }
    block.dataset.bound = 'true';

    const closeModal = () => {
        modal.classList.add('hidden');
    };
    const openModal = () => {
        if (openButton.disabled) {
            return;
        }
        popupInput.value = '';
        modal.classList.remove('hidden');
        popupInput.focus();
    };

    const persistTags = (nextTags) => {
        try {
            chrome.storage.sync.get([STORAGE_KEY], (data) => {
                if (chrome.runtime.lastError) {
                    return;
                }
                const settings = mergeSettings(data[STORAGE_KEY]);
                settings.facebook.hashtagFilterKeywords = serializeHashtagKeywords(nextTags);
                saveSettings(settings);
                notifyTabs('facebook');
                currentSettings = mergeSettings(settings);
                const canEdit = Boolean(currentSettings?.facebook?.masterSectionI !== false)
                    && Boolean(currentSettings?.facebook?.hideHashtagPosts);
                listEl.innerHTML = renderHashtagChips(nextTags, canEdit);
                refreshFacebookSectionUi();
            });
        } catch (error) {
            console.error('[DASHBOARD:FB_HASHTAG_FILTER]', error);
        }
    };

    openButton.addEventListener('click', openModal);
    modal.querySelectorAll('[data-fb-hashtag-close]').forEach((btn) => {
        btn.addEventListener('click', closeModal);
    });
    saveButton.addEventListener('click', () => {
        const currentTags = parseHashtagKeywords(currentSettings?.facebook?.hashtagFilterKeywords || '');
        const incomingTags = parseHashtagKeywords(popupInput.value);
        const merged = Array.from(new Set([...currentTags, ...incomingTags]));
        persistTags(merged);
        closeModal();
    });

    listEl.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target.closest('[data-fb-hashtag-remove]') : null;
        if (!(target instanceof HTMLButtonElement) || target.disabled) {
            return;
        }
        const tagToRemove = target.getAttribute('data-fb-hashtag-remove') || '';
        if (!tagToRemove) {
            return;
        }
        const nextTags = parseHashtagKeywords(currentSettings?.facebook?.hashtagFilterKeywords || '')
            .filter((tag) => tag !== tagToRemove);
        persistTags(nextTags);
    });
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

    document.querySelectorAll('[data-switch]').forEach((switchButton) => {
        const { platform, setting } = switchButton.dataset;
        if (!platform || !setting) {
            return;
        }
        const isOn = Boolean(currentSettings?.[platform]?.[setting]);
        setSwitchVisualState(switchButton, isOn);
    });

    const fbTextFilterList = document.getElementById('fb-text-filter-list');
    if (fbTextFilterList) {
        const phrases = parseTextFilterKeywords(currentSettings?.facebook?.textFilterKeywords || '');
        const canEdit = Boolean(currentSettings?.facebook?.masterSectionIII !== false);
        fbTextFilterList.innerHTML = renderTextFilterChips(phrases, canEdit);
    }
    const fbHashtagList = document.getElementById('fb-hashtag-list');
    if (fbHashtagList) {
        const tags = parseHashtagKeywords(currentSettings?.facebook?.hashtagFilterKeywords || '');
        const canEdit = Boolean(currentSettings?.facebook?.masterSectionI !== false)
            && Boolean(currentSettings?.facebook?.hideHashtagPosts);
        fbHashtagList.innerHTML = renderHashtagChips(tags, canEdit);
    }
    const fbAllowUrlList = document.getElementById('fb-allow-url-list');
    if (fbAllowUrlList) {
        const urls = parseAllowUrlListToLines(currentSettings?.facebook?.allowByUrlList || '');
        const canEdit = Boolean(currentSettings?.facebook?.masterSectionIV !== false)
            && Boolean(currentSettings?.facebook?.allowByUrlOnly);
        fbAllowUrlList.innerHTML = renderAllowUrlChips(urls, canEdit);
    }
    const fbAllowKwList = document.getElementById('fb-allow-keywords-list');
    if (fbAllowKwList) {
        const phrases = parseAllowPostKeywordsPhrases(currentSettings?.facebook?.allowPostKeywordsList || '');
        const canEdit = Boolean(currentSettings?.facebook?.masterSectionIV !== false)
            && Boolean(currentSettings?.facebook?.allowPostKeywordsOnly);
        fbAllowKwList.innerHTML = renderAllowPostKeywordChips(phrases, canEdit);
    }

    syncOpeningTimerUI(currentSettings);
    refreshFacebookSectionUi();
    refreshFacebookBulkSyncVisuals();
}

function saveSettings(settings = currentSettings) {
    try {
        const sanitizedSettings = sanitizeSettingsForStorage(settings);
        currentSettings = sanitizedSettings;
        chrome.storage.sync.set({ [STORAGE_KEY]: sanitizedSettings });
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

function bindInAppSwitch(switchButton) {
    if (!switchButton || switchButton.dataset.bound === 'true') {
        return;
    }

    switchButton.dataset.bound = 'true';
    switchButton.addEventListener('click', () => {
        if (switchButton.disabled) {
            return;
        }
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
                if (platform === 'facebook' && setting === 'allowByUrlOnly') {
                    // #region agent log
                    fetch('http://127.0.0.1:7371/ingest/7634893a-f87f-456c-8e21-990ad9d66e04',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'71e079'},body:JSON.stringify({sessionId:'71e079',runId:'run2',hypothesisId:'H1',location:'dashboard.js:bindInAppSwitch',message:'allowByUrlOnly toggled',data:{nextValue,allowByUrlList:(settings.facebook.allowByUrlList||'').slice(0,200)},timestamp:Date.now()})}).catch(()=>{});
                    // #endregion
                }
                setSwitchVisualState(switchButton, nextValue);
                saveSettings(settings);
                notifyTabs(platform);
                if (platform === 'facebook') {
                    // #region agent log
                    fetch('http://127.0.0.1:7371/ingest/7634893a-f87f-456c-8e21-990ad9d66e04', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '5f42da' }, body: JSON.stringify({ sessionId: '5f42da', hypothesisId: 'H2_toggle_save', location: 'dashboard.js:bindInAppSwitch', message: 'facebook toggle', data: { setting, nextValue, masterSectionI: settings.facebook?.masterSectionI, masterSectionII: settings.facebook?.masterSectionII, masterAdsContent: settings.facebook?.masterAdsContent }, timestamp: Date.now() }) }).catch(() => {});
                    // #endregion
                    refreshFacebookSectionUi();
                    refreshFacebookBulkSyncVisuals();
                }
            });
        } catch (error) {
            console.error('[DASHBOARD:TOGGLE_SWITCH]', error);
        }
    });
}

mountFacebookInAppPanel();
bindFacebookCollapseControls();
bindFacebookBulkSyncControls();
bindFacebookTextFilterChipUi();
bindFacebookHashtagFilter();
bindFacebookAllowUrlChipUi();
bindFacebookAllowPostKeywordsChipUi();
document.querySelectorAll('[data-switch]').forEach(bindInAppSwitch);

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

    if (changes[STORAGE_KEY]) {
        loadSettings();
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
