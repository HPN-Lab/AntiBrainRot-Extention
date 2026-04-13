'use strict';

importScripts('blocklist-policy.js', 'group-timestamp-usage.js');

const BLOCKLIST_STORAGE_KEY = 'blockedSites';
const BLOCKED_GROUPS_KEY = 'blockedGroups';
const DEFAULT_BLACKLIST = ['facebook.com', 'tiktok.com'];

/** Mặc định khi chưa có cấu hình trong sync. */
const ACTIVE_TIME_FALLBACK = {
    activeDays: [1, 2, 3, 4, 5],
    activeHours: { start: '09:00', end: '17:00' },
    dailyResetTime: '00:00',
};

const SCHEDULE_STORAGE_KEY = 'vmuFocusSchedule';
const ACTIVE_SCHEDULE_KEY = 'vmuActiveSchedule';

const DEFAULT_ACTIVE_SCHEDULE = {
    activeDays: [1, 2, 3, 4, 5],
    activeHours: { start: '09:00', end: '17:00' },
    dailyResetTime: '00:00',
};

/**
 * @param {Record<string, unknown>} syncData
 * @returns {{ activeDays: number[], activeHours: { start: string, end: string }, dailyResetTime: string }}
 */
function getActiveSchedule(syncData) {
    const fb = {
        activeDays: [...ACTIVE_TIME_FALLBACK.activeDays],
        activeHours: { ...ACTIVE_TIME_FALLBACK.activeHours },
        dailyResetTime: ACTIVE_TIME_FALLBACK.dailyResetTime,
    };
    const ac = syncData && syncData[ACTIVE_SCHEDULE_KEY];
    if (ac && typeof ac === 'object' && Array.isArray(ac.activeDays)) {
        const days = ac.activeDays.filter((n) => n === 0 || (Number.isInteger(n) && n >= 1 && n <= 6));
        const ah = ac.activeHours && typeof ac.activeHours === 'object' ? ac.activeHours : {};
        return {
            activeDays: days,
            activeHours: {
                start: typeof ah.start === 'string' && ah.start ? ah.start : fb.activeHours.start,
                end: typeof ah.end === 'string' && ah.end ? ah.end : fb.activeHours.end,
            },
            dailyResetTime:
                typeof ac.dailyResetTime === 'string' && ac.dailyResetTime ? ac.dailyResetTime : fb.dailyResetTime,
        };
    }
    const pack = syncData && syncData[SCHEDULE_STORAGE_KEY];
    if (!pack || typeof pack !== 'object' || !Array.isArray(pack.slots) || pack.slots.length === 0) {
        return fb;
    }
    const s = pack.slots[0];
    const rawDays = Array.isArray(s.activeDays) ? s.activeDays : fb.activeDays;
    const days = rawDays.filter((n) => n === 0 || (Number.isInteger(n) && n >= 1 && n <= 6));
    const start = typeof s.start === 'string' && s.start ? s.start : fb.activeHours.start;
    const end = typeof s.end === 'string' && s.end ? s.end : fb.activeHours.end;
    return {
        activeDays: days.length ? days : fb.activeDays,
        activeHours: { start, end },
        dailyResetTime: fb.dailyResetTime,
    };
}

function hostnameMatchesHostOnlyBlockRule(hostname, rules) {
    if (!Array.isArray(rules) || !hostname) {
        return false;
    }
    for (let i = 0; i < rules.length; i += 1) {
        const rule = rules[i];
        if (typeof rule !== 'string') {
            continue;
        }
        if (rule.indexOf('!kw:') === 0 || rule.indexOf('!url:') === 0) {
            continue;
        }
        if (BlocklistPolicy.hostMatchesBlockedRule(hostname, rule)) {
            return true;
        }
    }
    return false;
}

function resetSiteTimersForBlockedHosts(siteTimers, data, dailyLimit) {
    const rules = BlocklistPolicy.effectiveBlockedRules({
        blockedGroups: data.blockedGroups,
        blockedSites: data.blockedSites,
    });
    const next = siteTimers && typeof siteTimers === 'object' ? { ...siteTimers } : {};
    Object.keys(next).forEach((hostname) => {
        if (!hostnameMatchesHostOnlyBlockRule(hostname, rules)) {
            return;
        }
        const prev = next[hostname] && typeof next[hostname] === 'object' ? next[hostname] : {};
        next[hostname] = {
            ...prev,
            remainingSeconds: dailyLimit,
            isBlocked: false,
        };
    });
    return next;
}

/** Reset ngày theo lịch local (sang ngày mới sau nửa đêm, ví dụ 00:00). */

const TIME_TRACKER_LOCAL_KEY = 'vmuTimeTrackerState';
/** Dùng mốc thời gian tuyệt đối (committedTimeMs + activeSessions theo tabId) theo nhóm */
const GROUP_USAGE_TS_KEY = 'vmuGroupUsageTs';
const TICK_MS = 1000;

const SYNC_SNAPSHOT_KEYS = [
    'isExtensionActive',
    'blockedSites',
    'blockedGroups',
    'whitelistedSites',
    'blockAllExceptAllowlist',
    'siteTimers',
    SCHEDULE_STORAGE_KEY,
    ACTIVE_SCHEDULE_KEY,
];

function pad2(n) {
    return String(n).padStart(2, '0');
}

function calendarDayKey(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * @param {string} hhmm — "HH:mm"
 * @returns {number} phút từ 00:00 (0..1439)
 */
function parseTimeToMinutesFromMidnight(hhmm) {
    const s = String(hhmm || '').trim();
    const m = /^(\d{1,2}):(\d{2})$/.exec(s);
    if (!m) {
        return 0;
    }
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) {
        return 0;
    }
    return h * 60 + min;
}

/**
 * Kiểm tra thời điểm có nằm trong ngày & khung giờ hoạt động (thuần hàm).
 * @param {Date} [now]
 * @param {{ activeDays: number[], activeHours: { start: string, end: string } }} [cfg]
 */
function checkIsActive(now, cfg) {
    const d = now instanceof Date ? now : new Date();
    const c = cfg || ACTIVE_TIME_FALLBACK;
    const days = Array.isArray(c.activeDays) ? c.activeDays : [];
    if (days.length === 0) {
        return false;
    }
    const dow = d.getDay();
    if (days.indexOf(dow) === -1) {
        return false;
    }

    const ah = c.activeHours || { start: '00:00', end: '23:59' };
    const startM = parseTimeToMinutesFromMidnight(ah.start);
    const endM = parseTimeToMinutesFromMidnight(ah.end);
    const currM = d.getHours() * 60 + d.getMinutes();

    if (startM === endM) {
        return false;
    }

    if (startM < endM) {
        return startM <= currM && currM <= endM;
    }

    return currM >= startM || currM <= endM;
}

/**
 * Reset hạn mức một lần mỗi ngày lịch, sau khi đạt mốc dailyResetTime (local).
 * @param {Date} now
 * @param {{ lastDailyResetDate: string|null|undefined, usedTime: Record<string, number> }} tracker — mutate
 * @param {string} dailyResetHHMM
 * @param {() => void} onReset
 * @returns {boolean}
 */
function maybeRunUserDailyReset(now, tracker, dailyResetHHMM, onReset) {
    const todayKey = calendarDayKey(now);
    if (tracker.lastDailyResetDate === todayKey) {
        return false;
    }
    const resetM = parseTimeToMinutesFromMidnight(dailyResetHHMM);
    const nowM = now.getHours() * 60 + now.getMinutes();
    if (nowM < resetM) {
        return false;
    }
    tracker.lastDailyResetDate = todayKey;
    onReset();
    return true;
}

function defaultTrackerState() {
    return { lastDailyResetDate: null, usedTime: {} };
}

function loadTrackerState(callback) {
    chrome.storage.local.get([TIME_TRACKER_LOCAL_KEY], (local) => {
        if (chrome.runtime.lastError) {
            console.error('[SW:TIME_TRACKER_LOAD]', chrome.runtime.lastError);
            callback(defaultTrackerState());
            return;
        }
        const raw = local[TIME_TRACKER_LOCAL_KEY];
        const usedTime =
            raw && typeof raw.usedTime === 'object' && raw.usedTime !== null && !Array.isArray(raw.usedTime)
                ? raw.usedTime
                : {};
        const legacyDay = raw && raw.lastCalendarDay != null ? String(raw.lastCalendarDay) : null;
        callback({
            lastDailyResetDate:
                raw && raw.lastDailyResetDate != null ? String(raw.lastDailyResetDate) : legacyDay || null,
            usedTime,
        });
    });
}

function saveTrackerState(tracker, callback) {
    const payload = {
        [TIME_TRACKER_LOCAL_KEY]: {
            lastDailyResetDate: tracker.lastDailyResetDate,
            usedTime: tracker.usedTime,
        },
    };
    chrome.storage.local.set(payload, () => {
        if (chrome.runtime.lastError) {
            console.error('[SW:TIME_TRACKER_SAVE]', chrome.runtime.lastError);
        }
        if (typeof callback === 'function') {
            callback();
        }
    });
}

function evaluateRawBlocking(data, hostname, fullUrl, groupUsageMap) {
    return GroupTimestampUsage.evaluateBlockingWithGroupUsage(
        data,
        hostname,
        fullUrl,
        groupUsageMap && typeof groupUsageMap === 'object' && !Array.isArray(groupUsageMap) ? groupUsageMap : {},
        Date.now(),
    );
}

function parseGroupUsageMap(loc) {
    const raw = loc && loc[GROUP_USAGE_TS_KEY];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {};
    }
    return { ...raw };
}

function commitTabSession(entry, tabId, nowMs) {
    GroupTimestampUsage.migrateLegacyActiveSession(entry);
    if (!entry || !entry.activeSessions) {
        return false;
    }
    const key = String(tabId);
    const sess = entry.activeSessions[key];
    if (!sess || typeof sess.startTime !== 'number') {
        return false;
    }
    const dur = Math.max(0, nowMs - sess.startTime);
    entry.committedTimeMs = (Number(entry.committedTimeMs) || 0) + dur;
    delete entry.activeSessions[key];
    return true;
}

function commitAllTabSessions(entry, nowMs) {
    GroupTimestampUsage.migrateLegacyActiveSession(entry);
    if (!entry || !entry.activeSessions) {
        return false;
    }
    const keys = Object.keys(entry.activeSessions);
    if (keys.length === 0) {
        return false;
    }
    let any = false;
    keys.forEach((k) => {
        if (commitTabSession(entry, k, nowMs)) {
            any = true;
        }
    });
    return any;
}

function saveGroupUsageMap(map, done) {
    try {
        chrome.storage.local.set({ [GROUP_USAGE_TS_KEY]: map }, () => {
            if (chrome.runtime.lastError) {
                console.error('[SW:GROUP_USAGE_SAVE]', chrome.runtime.lastError);
            }
            if (typeof done === 'function') {
                done();
            }
        });
    } catch (e) {
        console.error('[SW:GROUP_USAGE_SAVE]', e);
        if (typeof done === 'function') {
            done();
        }
    }
}

/**
 * Sau khi tải xong khung chính: mỗi tab có một phiên trong nhóm; nhiều tab cùng nhóm cộng dồn thời gian.
 * @returns {boolean} đã sửa map
 */
function syncSessionsForTabUrl(tabId, url, syncData, map, nowMs) {
    let changed = false;
    const tabKey = String(tabId);

    const commitThisTabEverywhere = () => {
        Object.keys(map).forEach((gid) => {
            const e = map[gid];
            if (e && commitTabSession(e, tabId, nowMs)) {
                changed = true;
            }
        });
    };

    if (!url || !/^https?:\/\//i.test(url)) {
        commitThisTabEverywhere();
        return changed;
    }

    let hostname = '';
    try {
        hostname = BlocklistPolicy.normalizeHost(new URL(url).hostname);
    } catch {
        return changed;
    }

    const groupId = GroupTimestampUsage.firstTimestampGroupIdForHost(hostname, url, syncData);
    if (!groupId) {
        commitThisTabEverywhere();
        return changed;
    }

    const today = calendarDayKey(new Date(nowMs));
    const entry = GroupTimestampUsage.ensureUsageEntry(map, groupId, today);

    Object.keys(map).forEach((gid) => {
        if (gid === groupId) {
            return;
        }
        const e = map[gid];
        if (e && commitTabSession(e, tabId, nowMs)) {
            changed = true;
        }
    });

    GroupTimestampUsage.migrateLegacyActiveSession(entry);
    if (!entry.activeSessions) {
        entry.activeSessions = {};
    }

    const existing = entry.activeSessions[tabKey];
    const prevDom =
        existing && existing.domain ? BlocklistPolicy.normalizeHost(String(existing.domain)) : '';
    if (existing && prevDom && prevDom !== hostname) {
        if (commitTabSession(entry, tabId, nowMs)) {
            changed = true;
        }
    }

    if (!entry.activeSessions[tabKey]) {
        entry.activeSessions[tabKey] = { domain: hostname, startTime: nowMs };
        changed = true;
    }

    return changed;
}

function resetStaleGroupUsageForAllGroups(blockedGroups, map, nowMs) {
    const today = calendarDayKey(new Date(nowMs));
    let changed = false;
    (Array.isArray(blockedGroups) ? blockedGroups : []).forEach((g) => {
        if (!g || typeof g.id !== 'string') {
            return;
        }
        const e = map[g.id];
        if (e && e.date && e.date !== today) {
            GroupTimestampUsage.ensureUsageEntry(map, g.id, today);
            changed = true;
        }
    });
    return changed;
}

/** Áp dụng quy tắc: ngoài khung active thì không chặn vì hết giờ (timer). */
function isEffectivelyBlocked(rawResult, scheduleActive) {
    if (rawResult.blocked !== true) {
        return false;
    }
    if (!scheduleActive && rawResult.reason === 'timer') {
        return false;
    }
    return true;
}

const BLOCK_REDIRECT_DOC = 'block.html';

function navigationUrlSkippedForBlockHook(url) {
    if (!url || typeof url !== 'string') {
        return true;
    }
    const lower = url.toLowerCase();
    if (
        lower.startsWith('chrome:') ||
        lower.startsWith('chrome-extension:') ||
        lower.startsWith('edge:') ||
        lower.startsWith('about:') ||
        lower.startsWith('data:') ||
        lower.startsWith('file:') ||
        lower.startsWith('devtools:') ||
        lower.startsWith('javascript:') ||
        lower.startsWith('view-source:') ||
        lower.startsWith('blob:')
    ) {
        return true;
    }
    try {
        if (url.startsWith(chrome.runtime.getURL(''))) {
            return true;
        }
    } catch {
        /* ignore */
    }
    return false;
}

/**
 * Chặn tại điểm vào: main frame http(s) → chuyển sang trang block nội bộ (đồng bộ pipeline với checkURL).
 * @param {number} tabId
 * @param {string} url
 */
function maybeRedirectTabIfBlocked(tabId, url) {
    if (tabId === undefined || tabId === null || tabId < 0) {
        return;
    }
    if (navigationUrlSkippedForBlockHook(url)) {
        return;
    }
    if (!/^https?:\/\//i.test(url)) {
        return;
    }

    chrome.storage.sync.get(SYNC_SNAPSHOT_KEYS, (data) => {
        if (chrome.runtime.lastError) {
            return;
        }
        chrome.storage.local.get([GROUP_USAGE_TS_KEY], (loc) => {
            if (chrome.runtime.lastError) {
                return;
            }
            let hostname = '';
            try {
                hostname = BlocklistPolicy.normalizeHost(new URL(url).hostname);
            } catch {
                return;
            }
            const usageMap = parseGroupUsageMap(loc);
            const sch = getActiveSchedule(data);
            const scheduleActive = checkIsActive(new Date(), {
                activeDays: sch.activeDays,
                activeHours: sch.activeHours,
            });
            const rawResult = evaluateRawBlocking(data, hostname, url, usageMap);
            if (!isEffectivelyBlocked(rawResult, scheduleActive)) {
                return;
            }
            let target = '';
            try {
                target = `${chrome.runtime.getURL(BLOCK_REDIRECT_DOC)}?u=${encodeURIComponent(url)}`;
            } catch {
                return;
            }
            chrome.tabs.update(tabId, { url: target }, () => {
                if (chrome.runtime.lastError) {
                    console.warn('[SW:BLOCK_NAV_REDIRECT]', chrome.runtime.lastError.message);
                }
            });
        });
    });
}

try {
    if (typeof chrome !== 'undefined' && chrome.webNavigation && chrome.webNavigation.onBeforeNavigate) {
        chrome.webNavigation.onBeforeNavigate.addListener((details) => {
            if (details.frameId !== 0) {
                return;
            }
            maybeRedirectTabIfBlocked(details.tabId, details.url);
        });
        chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
            if (details.frameId !== 0) {
                return;
            }
            maybeRedirectTabIfBlocked(details.tabId, details.url || '');
        });
    }
} catch (e) {
    console.warn('[SW:WEB_NAVIGATION]', e);
}

function ensureUsedTimeFromRemaining(hostname, usedTime, siteTimers, dailyLimit) {
    if (Object.prototype.hasOwnProperty.call(usedTime, hostname)) {
        return;
    }
    const t = siteTimers[hostname];
    const remaining = Math.max(0, Number(t && t.remainingSeconds) || dailyLimit);
    usedTime[hostname] = Math.max(0, dailyLimit - remaining);
}

let timeTrackingIntervalId = null;

function runTimeTrackingTick() {
    const now = new Date();

    chrome.storage.sync.get(SYNC_SNAPSHOT_KEYS, (data) => {
        if (chrome.runtime.lastError) {
            console.error('[SW:TICK_SYNC]', chrome.runtime.lastError);
            return;
        }

        const scheduleCfg = getActiveSchedule(data);
        const scheduleActive = checkIsActive(now, {
            activeDays: scheduleCfg.activeDays,
            activeHours: scheduleCfg.activeHours,
        });

        const dailyLimit = BlocklistPolicy.DEFAULT_REMAINING_SECONDS;
        let siteTimers =
            data.siteTimers && typeof data.siteTimers === 'object' ? { ...data.siteTimers } : {};

        chrome.storage.local.get([GROUP_USAGE_TS_KEY], (loc) => {
            if (chrome.runtime.lastError) {
                console.error('[SW:TICK_GROUP_USAGE]', chrome.runtime.lastError);
            }
            const groupUsageMap = parseGroupUsageMap(loc);
            if (resetStaleGroupUsageForAllGroups(data.blockedGroups, groupUsageMap, now.getTime())) {
                saveGroupUsageMap(groupUsageMap);
            }

            loadTrackerState((tracker) => {
                const rules = BlocklistPolicy.effectiveBlockedRules({
                    blockedGroups: data.blockedGroups,
                    blockedSites: data.blockedSites,
                });
                const dayKeyBefore = tracker.lastDailyResetDate;
                const didReset = maybeRunUserDailyReset(now, tracker, scheduleCfg.dailyResetTime, () => {
                    siteTimers = resetSiteTimersForBlockedHosts(siteTimers, data, dailyLimit);
                    Object.keys(tracker.usedTime).forEach((host) => {
                        if (hostnameMatchesHostOnlyBlockRule(host, rules)) {
                            delete tracker.usedTime[host];
                        }
                    });
                    chrome.storage.sync.set({ siteTimers }, () => {
                        if (chrome.runtime.lastError) {
                            console.error('[SW:DAILY_RESET_SYNC]', chrome.runtime.lastError);
                        }
                    });
                });

                const trackerMetaChanged = didReset || dayKeyBefore !== tracker.lastDailyResetDate;

                const persistTrackerIfNeeded = () => {
                    if (trackerMetaChanged) {
                        saveTrackerState(tracker);
                    }
                };

                if (!scheduleActive) {
                    persistTrackerIfNeeded();
                    return;
                }

                chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
                    if (chrome.runtime.lastError) {
                        console.error('[SW:TICK_TABS]', chrome.runtime.lastError);
                        persistTrackerIfNeeded();
                        return;
                    }

                    const tab = tabs && tabs[0];
                    const rawUrl = typeof tab?.url === 'string' ? tab.url : '';
                    if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
                        persistTrackerIfNeeded();
                        return;
                    }

                    let hostname = '';
                    try {
                        hostname = BlocklistPolicy.normalizeHost(new URL(rawUrl).hostname);
                    } catch (e) {
                        persistTrackerIfNeeded();
                        return;
                    }

                    const rawEval = evaluateRawBlocking(data, hostname, rawUrl, groupUsageMap);

                    if (GroupTimestampUsage.hostUsesTimestampBudget(hostname, rawUrl, data)) {
                        if (rawEval.blocked && rawEval.reason === 'timer' && tab && tab.id != null) {
                            const gid = GroupTimestampUsage.firstTimestampGroupIdForHost(hostname, rawUrl, data);
                            if (gid && groupUsageMap[gid]) {
                                commitAllTabSessions(groupUsageMap[gid], Date.now());
                                saveGroupUsageMap(groupUsageMap);
                            }
                            let target = '';
                            try {
                                target = `${chrome.runtime.getURL(BLOCK_REDIRECT_DOC)}?u=${encodeURIComponent(rawUrl)}`;
                            } catch {
                                persistTrackerIfNeeded();
                                return;
                            }
                            chrome.tabs.update(tab.id, { url: target }, () => {
                                if (chrome.runtime.lastError) {
                                    console.warn('[SW:TICK_BLOCK_REDIRECT]', chrome.runtime.lastError.message);
                                }
                            });
                            persistTrackerIfNeeded();
                            return;
                        }
                        if (rawEval.reason !== 'allow' || rawEval.blocked) {
                            persistTrackerIfNeeded();
                            return;
                        }
                        persistTrackerIfNeeded();
                        return;
                    }

                    if (rawEval.reason !== 'allow' || rawEval.blocked) {
                        persistTrackerIfNeeded();
                        return;
                    }

                    ensureUsedTimeFromRemaining(hostname, tracker.usedTime, siteTimers, dailyLimit);
                    tracker.usedTime[hostname] = (Number(tracker.usedTime[hostname]) || 0) + 1;
                    const used = tracker.usedTime[hostname];
                    const remaining = Math.max(0, dailyLimit - used);
                    const isBlocked = remaining <= 0;

                    const prevEntry = siteTimers[hostname] && typeof siteTimers[hostname] === 'object' ? siteTimers[hostname] : {};
                    siteTimers[hostname] = {
                        ...prevEntry,
                        remainingSeconds: remaining,
                        isBlocked,
                    };

                    chrome.storage.sync.set({ siteTimers }, () => {
                        if (chrome.runtime.lastError) {
                            console.error('[SW:TICK_SET_TIMERS]', chrome.runtime.lastError);
                        }
                    });
                    saveTrackerState(tracker);
                });
            });
        });
    });
}

function startTimeTrackingLoop() {
    if (timeTrackingIntervalId !== null) {
        clearInterval(timeTrackingIntervalId);
    }
    timeTrackingIntervalId = setInterval(runTimeTrackingTick, TICK_MS);
}

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get([BLOCKLIST_STORAGE_KEY], (localData) => {
        if (chrome.runtime.lastError) {
            console.error('[SW:INIT_LOCAL]', chrome.runtime.lastError);
            return;
        }

        chrome.storage.sync.get([BLOCKLIST_STORAGE_KEY, BLOCKED_GROUPS_KEY, SCHEDULE_STORAGE_KEY, ACTIVE_SCHEDULE_KEY], (syncData) => {
            if (chrome.runtime.lastError) {
                console.error('[SW:INIT_SYNC]', chrome.runtime.lastError);
                return;
            }

            const syncList = syncData[BLOCKLIST_STORAGE_KEY];
            const hasSyncList = Array.isArray(syncList) && syncList.length > 0;
            const localList = localData[BLOCKLIST_STORAGE_KEY];
            const hasLocalList = Array.isArray(localList) && localList.length > 0;

            const payload = {};

            if (!hasSyncList && hasLocalList) {
                payload[BLOCKLIST_STORAGE_KEY] = localList;
            } else if (!hasSyncList && !hasLocalList) {
                payload[BLOCKLIST_STORAGE_KEY] = DEFAULT_BLACKLIST;
            }

            if (!Array.isArray(syncData[BLOCKED_GROUPS_KEY])) {
                payload[BLOCKED_GROUPS_KEY] = [];
            }

            const hasActiveSchedule =
                syncData[ACTIVE_SCHEDULE_KEY] &&
                typeof syncData[ACTIVE_SCHEDULE_KEY] === 'object' &&
                Array.isArray(syncData[ACTIVE_SCHEDULE_KEY].activeDays);
            if (!hasActiveSchedule) {
                payload[ACTIVE_SCHEDULE_KEY] = DEFAULT_ACTIVE_SCHEDULE;
            }

            if (Object.keys(payload).length === 0) {
                return;
            }

            chrome.storage.sync.set(payload, () => {
                if (chrome.runtime.lastError) {
                    console.error('[SW:INIT_SYNC_SET]', chrome.runtime.lastError);
                }
            });
        });
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'sf-debug-ingest') {
        const url = message.endpoint;
        const body = message.body;
        if (typeof url === 'string' && body && typeof body === 'object') {
            const headers = { 'Content-Type': 'application/json' };
            const sid = body.sessionId;
            if (sid !== undefined && sid !== null && sid !== '') {
                headers['X-Debug-Session-Id'] = String(sid);
            }
            fetch(url, { method: 'POST', headers, body: JSON.stringify(body) }).catch(() => {});
        }
        return false;
    }

    if (message?.type !== 'checkURL') {
        return false;
    }

    const rawUrl = typeof message.url === 'string' ? message.url : '';

    chrome.storage.sync.get(SYNC_SNAPSHOT_KEYS, (data) => {
        if (chrome.runtime.lastError) {
            console.error('[SW:CHECK_URL_STORAGE]', chrome.runtime.lastError);
            sendResponse({ isBlocked: false });
            return;
        }

        let hostname = '';
        try {
            hostname = BlocklistPolicy.normalizeHost(new URL(rawUrl).hostname);
        } catch (error) {
            sendResponse({ isBlocked: false });
            return;
        }

        chrome.storage.local.get([GROUP_USAGE_TS_KEY], (loc) => {
            if (chrome.runtime.lastError) {
                console.error('[SW:CHECK_URL_GROUP_USAGE]', chrome.runtime.lastError);
            }
            const usageMap = parseGroupUsageMap(loc);
            const sch = getActiveSchedule(data);
            const scheduleActive = checkIsActive(new Date(), {
                activeDays: sch.activeDays,
                activeHours: sch.activeHours,
            });
            const rawResult = evaluateRawBlocking(data, hostname, rawUrl, usageMap);
            sendResponse({ isBlocked: isEffectivelyBlocked(rawResult, scheduleActive) });
        });
    });

    return true;
});

try {
    if (chrome.tabs && chrome.tabs.onRemoved) {
        chrome.tabs.onRemoved.addListener((tabId) => {
            chrome.storage.local.get([GROUP_USAGE_TS_KEY], (loc) => {
                if (chrome.runtime.lastError) {
                    return;
                }
                const map = parseGroupUsageMap(loc);
                const nowMs = Date.now();
                let changed = false;
                Object.keys(map).forEach((gid) => {
                    const e = map[gid];
                    if (e && commitTabSession(e, tabId, nowMs)) {
                        changed = true;
                    }
                });
                if (changed) {
                    saveGroupUsageMap(map);
                }
            });
        });
    }
} catch (e) {
    console.warn('[SW:TABS_ON_REMOVED]', e);
}

try {
    if (chrome.webNavigation && chrome.webNavigation.onCompleted) {
        chrome.webNavigation.onCompleted.addListener((details) => {
            if (details.frameId !== 0) {
                return;
            }
            const u = details.url || '';
            if (!/^https?:\/\//i.test(u)) {
                return;
            }
            chrome.storage.sync.get(SYNC_SNAPSHOT_KEYS, (data) => {
                if (chrome.runtime.lastError) {
                    return;
                }
                chrome.storage.local.get([GROUP_USAGE_TS_KEY], (loc) => {
                    if (chrome.runtime.lastError) {
                        return;
                    }
                    const map = parseGroupUsageMap(loc);
                    if (syncSessionsForTabUrl(details.tabId, u, data, map, Date.now())) {
                        saveGroupUsageMap(map);
                    }
                });
            });
        });
    }
} catch (e) {
    console.warn('[SW:WEB_NAV_COMPLETED]', e);
}

try {
    if (chrome.runtime && chrome.runtime.onSuspend) {
        chrome.runtime.onSuspend.addListener(() => {
            chrome.storage.local.get([GROUP_USAGE_TS_KEY], (loc) => {
                const map = parseGroupUsageMap(loc);
                const nowMs = Date.now();
                let changed = false;
                Object.keys(map).forEach((gid) => {
                    const e = map[gid];
                    if (e && commitAllTabSessions(e, nowMs)) {
                        changed = true;
                    }
                });
                if (changed) {
                    chrome.storage.local.set({ [GROUP_USAGE_TS_KEY]: map });
                }
            });
        });
    }
} catch (e) {
    console.warn('[SW:ON_SUSPEND]', e);
}

startTimeTrackingLoop();
