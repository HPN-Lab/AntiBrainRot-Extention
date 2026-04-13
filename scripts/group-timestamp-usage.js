/* global BlocklistPolicy, self */
/**
 * Đánh giá chặn + hạn mức theo nhóm bằng timestamp (committedTimeMs + activeSessions theo tabId),
 * không trừ dần mỗi giây — timeLeft = cap - committed - tổng(now - start) mọi tab đang mở trong nhóm.
 * Phụ thuộc BlocklistPolicy (importScripts trước file này).
 */
(function () {
    'use strict';

    var root = typeof self !== 'undefined' ? self : globalThis;

    function groupAllowedMs(g) {
        if (!g || typeof g !== 'object') {
            return 0;
        }
        var hr = Math.max(0, Math.min(23, Number(g.maxHours) || 0));
        var min = Math.max(0, Math.min(59, Number(g.maxMinutes) || 0));
        return (hr * 3600 + min * 60) * 1000;
    }

    function lineMatchesHostOrUrl(hostname, fullUrl, rawLine) {
        var r = BlocklistPolicy.parseRuleLine(rawLine);
        if (!r) {
            return false;
        }
        if (BlocklistPolicy.isSubstringBlockRuleKey(r)) {
            return Boolean(fullUrl && BlocklistPolicy.fullUrlMatchesSubstringRule(fullUrl, r));
        }
        return BlocklistPolicy.hostMatchesBlockedRule(hostname, rawLine);
    }

    /**
     * Giống thứ tự effectiveBlockedRules: từng nhóm rồi blockedSites; khử trùng theo khóa tương đương (cùng domain gốc).
     * @returns {{ ruleKey: string, groupId: string|null, rawLine: string }[]}
     */
    function flatRulesWithGroupMeta(blockedGroups, blockedSites) {
        var seen = {};
        var out = [];
        function push(ruleKey, groupId, rawLine) {
            if (!ruleKey) {
                return;
            }
            var ek = BlocklistPolicy.ruleEquivalenceKeyFromParsedKey(ruleKey);
            if (!ek || seen[ek]) {
                return;
            }
            seen[ek] = true;
            out.push({ ruleKey: ruleKey, groupId: groupId, rawLine: rawLine });
        }
        (Array.isArray(blockedGroups) ? blockedGroups : []).forEach(function (g) {
            if (!g || !Array.isArray(g.sites)) {
                return;
            }
            var gid = typeof g.id === 'string' ? g.id : null;
            g.sites.forEach(function (line) {
                push(BlocklistPolicy.parseRuleLine(line), gid, line);
            });
        });
        (Array.isArray(blockedSites) ? blockedSites : []).forEach(function (s) {
            push(BlocklistPolicy.parseRuleLine(String(s)), null, String(s));
        });
        return out;
    }

    function migrateLegacyActiveSession(entry) {
        if (!entry || typeof entry !== 'object') {
            return;
        }
        if (!entry.activeSessions || typeof entry.activeSessions !== 'object' || Array.isArray(entry.activeSessions)) {
            entry.activeSessions = {};
        }
        var leg = entry.activeSession;
        if (leg && typeof leg.startTime === 'number') {
            var tid = leg.tabId;
            if (tid != null && tid !== '') {
                var k = String(tid);
                if (!entry.activeSessions[k]) {
                    entry.activeSessions[k] = {
                        domain: leg.domain,
                        startTime: leg.startTime,
                    };
                }
            }
            entry.activeSession = null;
        }
    }

    function ensureUsageEntry(usageMap, groupId, today) {
        var u = usageMap[groupId];
        if (!u || typeof u !== 'object') {
            u = { date: today, committedTimeMs: 0, activeSessions: {} };
            usageMap[groupId] = u;
            return u;
        }
        if (u.date !== today) {
            u.date = today;
            u.committedTimeMs = 0;
            u.activeSessions = {};
            delete u.activeSession;
            return u;
        }
        migrateLegacyActiveSession(u);
        return u;
    }

    function getTotalUsedMs(entry, nowMs) {
        migrateLegacyActiveSession(entry);
        var t = Math.max(0, Number(entry && entry.committedTimeMs) || 0);
        var sessions = entry && entry.activeSessions;
        if (sessions && typeof sessions === 'object') {
            Object.keys(sessions).forEach(function (k) {
                var s = sessions[k];
                if (s && typeof s.startTime === 'number') {
                    t += Math.max(0, nowMs - s.startTime);
                }
            });
        }
        return t;
    }

    /**
     * @param {Record<string, { date?: string, committedTimeMs?: number, activeSessions?: Record<string, { domain?: string, startTime: number }>, activeSession?: { domain?: string, startTime: number, tabId?: number }|null }>} usageMap
     */
    function evaluateBlockingWithGroupUsage(data, hostname, fullUrl, usageMap, nowMs) {
        var isExt = data.isExtensionActive !== false;
        if (!isExt) {
            return { blocked: false, reason: 'inactive' };
        }
        if (!hostname) {
            return { blocked: false, reason: 'no-host' };
        }
        var wl = Array.isArray(data.whitelistedSites) ? data.whitelistedSites : [];
        if (BlocklistPolicy.listMatchesAllowlist(hostname, fullUrl, wl)) {
            return { blocked: false, reason: 'whitelist' };
        }
        if (BlocklistPolicy.isBlockAllExceptAllowlistEnabled(data.blockAllExceptAllowlist)) {
            return { blocked: true, reason: 'allow-only' };
        }

        var metaRules = flatRulesWithGroupMeta(data.blockedGroups, data.blockedSites);
        var d = new Date(nowMs);
        var today =
            d.getFullYear() +
            '-' +
            String(d.getMonth() + 1).padStart(2, '0') +
            '-' +
            String(d.getDate()).padStart(2, '0');
        var groups = Array.isArray(data.blockedGroups) ? data.blockedGroups : [];

        for (var i = 0; i < metaRules.length; i += 1) {
            var mr = metaRules[i];
            if (!lineMatchesHostOrUrl(hostname, fullUrl, mr.rawLine)) {
                continue;
            }
            if (mr.groupId) {
                var g = null;
                for (var j = 0; j < groups.length; j += 1) {
                    if (groups[j] && groups[j].id === mr.groupId) {
                        g = groups[j];
                        break;
                    }
                }
                var cap = g ? groupAllowedMs(g) : 0;
                if (cap <= 0) {
                    return { blocked: true, reason: 'blocklist' };
                }
                var entry = ensureUsageEntry(usageMap, mr.groupId, today);
                var used = getTotalUsedMs(entry, nowMs);
                var left = cap - used;
                if (left <= 0) {
                    return { blocked: true, reason: 'timer' };
                }
                return { blocked: false, reason: 'allow' };
            }
            return { blocked: true, reason: 'blocklist' };
        }

        return BlocklistPolicy.evaluateHostname({
            hostname: hostname,
            fullUrl: fullUrl,
            isExtensionActive: true,
            blockAllExceptAllowlist: false,
            blockedGroups: [],
            blockedSites: [],
            whitelistedSites: wl,
            siteTimers: data.siteTimers && typeof data.siteTimers === 'object' ? data.siteTimers : {},
            defaultRemainingSeconds: BlocklistPolicy.DEFAULT_REMAINING_SECONDS,
        });
    }

    /**
     * Host có khớp quy tắc thuộc nhóm và có quota thời gian > 0 (dùng timestamp, không tick +1 legacy).
     */
    function hostUsesTimestampBudget(hostname, fullUrl, data) {
        var meta = flatRulesWithGroupMeta(data.blockedGroups, data.blockedSites);
        var groups = Array.isArray(data.blockedGroups) ? data.blockedGroups : [];
        for (var i = 0; i < meta.length; i += 1) {
            var mr = meta[i];
            if (!lineMatchesHostOrUrl(hostname, fullUrl, mr.rawLine)) {
                continue;
            }
            if (!mr.groupId) {
                return false;
            }
            var g = null;
            for (var j = 0; j < groups.length; j += 1) {
                if (groups[j] && groups[j].id === mr.groupId) {
                    g = groups[j];
                    break;
                }
            }
            return groupAllowedMs(g) > 0;
        }
        return false;
    }

    /**
     * Nhóm (có quota) khớp host/url đầu tiên theo thứ tự rule — để commit phiên khi hết giờ.
     */
    function firstTimestampGroupIdForHost(hostname, fullUrl, data) {
        var meta = flatRulesWithGroupMeta(data.blockedGroups, data.blockedSites);
        var groups = Array.isArray(data.blockedGroups) ? data.blockedGroups : [];
        for (var i = 0; i < meta.length; i += 1) {
            var mr = meta[i];
            if (!lineMatchesHostOrUrl(hostname, fullUrl, mr.rawLine)) {
                continue;
            }
            if (!mr.groupId) {
                return null;
            }
            var g = null;
            for (var j = 0; j < groups.length; j += 1) {
                if (groups[j] && groups[j].id === mr.groupId) {
                    g = groups[j];
                    break;
                }
            }
            if (g && groupAllowedMs(g) > 0) {
                return mr.groupId;
            }
            return null;
        }
        return null;
    }

    root.GroupTimestampUsage = {
        groupAllowedMs: groupAllowedMs,
        lineMatchesHostOrUrl: lineMatchesHostOrUrl,
        flatRulesWithGroupMeta: flatRulesWithGroupMeta,
        ensureUsageEntry: ensureUsageEntry,
        getTotalUsedMs: getTotalUsedMs,
        migrateLegacyActiveSession: migrateLegacyActiveSession,
        evaluateBlockingWithGroupUsage: evaluateBlockingWithGroupUsage,
        hostUsesTimestampBudget: hostUsesTimestampBudget,
        firstTimestampGroupIdForHost: firstTimestampGroupIdForHost,
    };
})();
