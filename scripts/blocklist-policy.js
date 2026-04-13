/* global self */
(function () {
    'use strict';

    var root = typeof self !== 'undefined' ? self : globalThis;

    /** Hạn mức/ngày mặc định cho site chặn theo timer từng host (không thuộc nhóm có quota timestamp). */
    var DEFAULT_REMAINING_SECONDS = 60 * 60;

    /** Khóa nội bộ — không trùng hostname thường */
    var PREFIX_KW = '!kw:';
    var PREFIX_URL = '!url:';

    /**
     * Đọc cờ sync storage an toàn: tránh coi chuỗi "false" là true (Boolean("false") === true trong JS).
     * Mặc định tắt — chỉ bật khi lưu đúng boolean true hoặc chuỗi "true"/"1"/"yes"/"on".
     */
    function isBlockAllExceptAllowlistEnabled(raw) {
        if (raw === true || raw === 1) {
            return true;
        }
        if (raw === false || raw === 0) {
            return false;
        }
        if (raw == null) {
            return false;
        }
        if (typeof raw === 'string') {
            var t = String(raw).trim().toLowerCase();
            return t === 'true' || t === '1' || t === 'yes' || t === 'on';
        }
        return false;
    }

    function normalizeHost(hostname) {
        return String(hostname || '')
            .replace(/^www\./i, '')
            .toLowerCase();
    }

    /**
     * Phần sau dấu ^ đầu dòng có dạng URL / đường dẫn / query → quy tắc chặn theo URL.
     * Còn lại → chặn theo từ (cụm chữ trong URL).
     */
    function isUrlLikeRest(rest) {
        if (!rest) {
            return false;
        }
        if (/^https?:\/\//i.test(rest)) {
            return true;
        }
        if (rest.indexOf('/') >= 0) {
            return true;
        }
        if (rest.indexOf('?') >= 0) {
            return true;
        }
        if (/^[a-z0-9.-]+\.[a-z]{2,}(:\d+)?$/i.test(rest)) {
            return true;
        }
        return false;
    }

    /** Quy tắc chặn theo chuỗi con trong href (từ hoặc URL). */
    function isSubstringBlockRuleKey(r) {
        return typeof r === 'string' && (r.indexOf(PREFIX_KW) === 0 || r.indexOf(PREFIX_URL) === 0);
    }

    function fullUrlMatchesSubstringRule(fullUrl, ruleKey) {
        if (!fullUrl || !ruleKey) {
            return false;
        }
        var lower = String(fullUrl).toLowerCase();
        if (ruleKey.indexOf(PREFIX_KW) === 0) {
            var innerKw = ruleKey.slice(PREFIX_KW.length);
            return Boolean(innerKw) && lower.indexOf(innerKw) >= 0;
        }
        if (ruleKey.indexOf(PREFIX_URL) === 0) {
            var innerUrl = ruleKey.slice(PREFIX_URL.length);
            return Boolean(innerUrl) && lower.indexOf(innerUrl) >= 0;
        }
        return false;
    }

    /**
     * Chuẩn hóa một dòng rule để so khớp / gỡ trùng.
     * - Domain: facebook.com (không hỗ trợ *.domain — dùng ^… để khớp URL/từ).
     * - ^cụm từ (một dấu ^ đầu dòng): khớp chuỗi con trong URL.
     * - ^https://… hoặc ^path/query/domain…: khớp theo URL.
     */
    function parseRuleLine(raw) {
        var s = String(raw || '').trim();
        if (!s) {
            return '';
        }
        if (s.charAt(0) === '^') {
            var rest = s.slice(1).trim();
            if (!rest || rest.indexOf('*.') === 0) {
                return '';
            }
            var lowerRest = rest.toLowerCase();
            if (isUrlLikeRest(rest)) {
                return PREFIX_URL + lowerRest;
            }
            return PREFIX_KW + lowerRest;
        }
        s = s.replace(/^https?:\/\//i, '');
        var slash = s.indexOf('/');
        if (slash >= 0) {
            s = s.slice(0, slash);
        }
        s = s.trim().toLowerCase();
        if (s.indexOf('*.') === 0) {
            return '';
        }
        return normalizeHost(s);
    }

    /**
     * Khóa gỡ trùng ngữ nghĩa: ^facebook.com/, ^https://www.facebook.com/, facebook.com → cùng một mục (chặn cả domain gốc).
     * Quy tắc ^từ / path cụ thể vẫn tách biệt.
     */
    function ruleEquivalenceKeyFromParsedKey(k) {
        if (!k) {
            return '';
        }
        if (k.indexOf(PREFIX_KW) === 0) {
            return k;
        }
        if (k.indexOf(PREFIX_URL) !== 0) {
            return k;
        }
        var inner = k.slice(PREFIX_URL.length);
        if (!inner) {
            return k;
        }
        try {
            var urlStr = inner.indexOf('://') >= 0 ? inner : 'https://' + inner.replace(/^\/+/, '');
            var u = new URL(urlStr);
            var h = normalizeHost(u.hostname);
            var path = u.pathname || '/';
            var search = u.search || '';
            if (!search && (path === '/' || path === '')) {
                return h;
            }
            var pathNorm = path;
            if (pathNorm.length > 1 && pathNorm.endsWith('/')) {
                pathNorm = pathNorm.replace(/\/$/, '');
            }
            return PREFIX_URL + 'https://' + h + (pathNorm === '/' ? '/' : pathNorm) + search;
        } catch (e) {
            return k;
        }
    }

    function ruleEquivalenceKeyFromRaw(raw) {
        return ruleEquivalenceKeyFromParsedKey(parseRuleLine(raw));
    }

    function hostMatchesBlockedRule(hostname, ruleRaw) {
        var host = normalizeHost(hostname);
        var r = typeof ruleRaw === 'string' ? parseRuleLine(ruleRaw) : parseRuleLine(String(ruleRaw));
        if (!r || !host) {
            return false;
        }
        if (isSubstringBlockRuleKey(r)) {
            return false;
        }
        return host === r || host.endsWith('.' + r);
    }

    function listMatchesHostname(hostname, entries) {
        if (!Array.isArray(entries)) {
            return false;
        }
        for (var i = 0; i < entries.length; i += 1) {
            if (hostMatchesBlockedRule(hostname, entries[i])) {
                return true;
            }
        }
        return false;
    }

    /**
     * Danh sách cho phép (whitelist): chỉ khiến URL khớp được mở; không hạn chế các URL khác
     * (trừ khi bật isBlockAllExceptAllowlistEnabled — xử lý riêng trong evaluateHostname).
     * Cú pháp dòng giống blocklist — domain / ^từ / ^url; khớp host hoặc substring URL khi có fullUrl.
     */
    function listMatchesAllowlist(hostname, fullUrl, entries) {
        if (!Array.isArray(entries)) {
            return false;
        }
        var host = hostname;
        var url = typeof fullUrl === 'string' ? fullUrl : '';
        for (var i = 0; i < entries.length; i += 1) {
            var raw = entries[i];
            var r = parseRuleLine(raw);
            if (!r) {
                continue;
            }
            if (isSubstringBlockRuleKey(r)) {
                if (url && fullUrlMatchesSubstringRule(url, r)) {
                    return true;
                }
            } else if (hostMatchesBlockedRule(host, raw)) {
                return true;
            }
        }
        return false;
    }

    function flattenRulesFromGroups(blockedGroups) {
        var out = [];
        if (!Array.isArray(blockedGroups)) {
            return out;
        }
        blockedGroups.forEach(function (g) {
            if (g && Array.isArray(g.sites)) {
                g.sites.forEach(function (line) {
                    var r = parseRuleLine(line);
                    if (r) {
                        out.push(r);
                    }
                });
            }
        });
        return out;
    }

    function effectiveBlockedRules(data) {
        var set = {};
        var ordered = [];
        function add(r) {
            var ek = ruleEquivalenceKeyFromParsedKey(r);
            if (!r || !ek || set[ek]) {
                return;
            }
            set[ek] = true;
            ordered.push(r);
        }
        flattenRulesFromGroups(data && data.blockedGroups).forEach(add);
        if (data && Array.isArray(data.blockedSites)) {
            data.blockedSites.forEach(function (s) {
                add(parseRuleLine(String(s)));
            });
        }
        return ordered;
    }

    /**
     * @param {object} params
     * @param {string} [params.fullUrl] — URL đầy đủ của tab; cần cho quy tắc ^từ và ^url.
     * Thứ tự: whitelist → (nếu bật) chặn mọi thứ ngoài allowlist → blocklist → timer.
     * @returns {{ blocked: boolean, reason: string }}
     */
    function evaluateHostname(params) {
        var hostname = params.hostname;
        var fullUrl = typeof params.fullUrl === 'string' ? params.fullUrl : '';
        var isExtensionActive = params.isExtensionActive !== false;
        var blockAllExceptAllowlist = isBlockAllExceptAllowlistEnabled(params.blockAllExceptAllowlist);
        var whitelistedSites = Array.isArray(params.whitelistedSites) ? params.whitelistedSites : [];
        var siteTimers = params.siteTimers && typeof params.siteTimers === 'object' ? params.siteTimers : {};
        var defaultRemaining = Number(params.defaultRemainingSeconds);
        if (Number.isNaN(defaultRemaining) || defaultRemaining <= 0) {
            defaultRemaining = DEFAULT_REMAINING_SECONDS;
        }

        if (!isExtensionActive) {
            return { blocked: false, reason: 'inactive' };
        }

        if (!hostname) {
            return { blocked: false, reason: 'no-host' };
        }

        if (listMatchesAllowlist(hostname, fullUrl, whitelistedSites)) {
            return { blocked: false, reason: 'whitelist' };
        }

        if (blockAllExceptAllowlist) {
            return { blocked: true, reason: 'allow-only' };
        }

        var rules = effectiveBlockedRules({
            blockedGroups: params.blockedGroups,
            blockedSites: params.blockedSites,
        });
        for (var i = 0; i < rules.length; i += 1) {
            var rule = rules[i];
            if (rule.indexOf(PREFIX_KW) === 0) {
                if (fullUrl && fullUrlMatchesSubstringRule(fullUrl, rule)) {
                    return { blocked: true, reason: 'blocklist-keyword' };
                }
            } else if (rule.indexOf(PREFIX_URL) === 0) {
                if (fullUrl && fullUrlMatchesSubstringRule(fullUrl, rule)) {
                    return { blocked: true, reason: 'blocklist-url' };
                }
            } else if (hostMatchesBlockedRule(hostname, rule)) {
                return { blocked: true, reason: 'blocklist' };
            }
        }

        var currentTimer = siteTimers[hostname];
        var remRaw = currentTimer ? currentTimer.remainingSeconds : undefined;
        var remNum = Number(remRaw);
        var hasExplicitRemaining =
            currentTimer != null &&
            remRaw !== undefined &&
            remRaw !== null &&
            !Number.isNaN(remNum);
        var remainingSeconds = Math.max(0, hasExplicitRemaining ? remNum : defaultRemaining);
        if (currentTimer && currentTimer.isBlocked) {
            return { blocked: true, reason: 'timer' };
        }
        if (remainingSeconds <= 0) {
            return { blocked: true, reason: 'timer' };
        }

        return { blocked: false, reason: 'allow' };
    }

    function isExtensionSchemeLine(s) {
        var t = String(s || '').trim().toLowerCase();
        return (
            t.indexOf('chrome-extension:') === 0 ||
            t.indexOf('moz-extension:') === 0 ||
            t.indexOf('edge-extension:') === 0 ||
            t.indexOf('safari-web-extension:') === 0
        );
    }

    /**
     * Chuẩn hóa một dòng người dùng nhập (textarea bulk):
     * - Domain / host → chữ thường, bỏ www (giống parseRuleLine).
     * - URL / đường dẫn / ?query → lưu dạng ^… (PREFIX_URL / PREFIX_KW) để không mất path.
     * - Đã có ^ → giữ cú pháp, chuẩn hóa chữ thường phần nội dung.
     */
    function normalizeBulkBlockInputLine(raw) {
        var s = String(raw || '').trim();
        if (!s) {
            return { ok: false, reason: 'empty' };
        }
        if (isExtensionSchemeLine(s)) {
            return { ok: false, reason: 'extension' };
        }
        var lower = s.toLowerCase();
        if (s.charAt(0) === '^') {
            var rest = s.slice(1).trim();
            if (!rest || rest.indexOf('*.') === 0) {
                return { ok: false, reason: 'invalid' };
            }
            var body = isUrlLikeRest(rest) ? rest.toLowerCase() : rest.toLowerCase();
            var canonical = '^' + body;
            var key = parseRuleLine(canonical);
            if (!key) {
                return { ok: false, reason: 'invalid' };
            }
            var eq = ruleEquivalenceKeyFromParsedKey(key);
            if (eq && !isSubstringBlockRuleKey(eq)) {
                return { ok: true, canonical: eq, key: eq };
            }
            return { ok: true, canonical: canonical, key: key };
        }
        if (/^https?:\/\//i.test(s) || s.indexOf('/') >= 0 || s.indexOf('?') >= 0) {
            var canonicalUrl = '^' + lower;
            var keyU = parseRuleLine(canonicalUrl);
            if (!keyU) {
                return { ok: false, reason: 'invalid' };
            }
            var eqU = ruleEquivalenceKeyFromParsedKey(keyU);
            if (eqU && !isSubstringBlockRuleKey(eqU)) {
                return { ok: true, canonical: eqU, key: eqU };
            }
            return { ok: true, canonical: canonicalUrl, key: keyU };
        }
        var keyH = parseRuleLine(s);
        if (!keyH) {
            return { ok: false, reason: 'invalid' };
        }
        var withoutProto = lower.replace(/^https?:\/\//i, '');
        var slash = withoutProto.indexOf('/');
        var hostPart = slash >= 0 ? withoutProto.slice(0, slash) : withoutProto;
        var h = normalizeHost(hostPart.trim());
        if (!h) {
            return { ok: false, reason: 'invalid' };
        }
        return { ok: true, canonical: h, key: keyH };
    }

    /**
     * Quy tắc chặn (sau parseRuleLine key) có chồng lấn rõ ràng với Allow Website không.
     */
    function blockRuleKeyConflictsAllowlist(key, whitelistedSites) {
        if (!key || !Array.isArray(whitelistedSites)) {
            return false;
        }
        var ekBlock = ruleEquivalenceKeyFromParsedKey(key);
        var i;
        for (i = 0; i < whitelistedSites.length; i += 1) {
            var ak = parseRuleLine(whitelistedSites[i]);
            if (ak && ruleEquivalenceKeyFromParsedKey(ak) === ekBlock) {
                return true;
            }
        }
        if (!isSubstringBlockRuleKey(key)) {
            var host = key;
            var sample = 'https://' + host + '/';
            if (listMatchesAllowlist(host, sample, whitelistedSites)) {
                return true;
            }
            return false;
        }
        if (key.indexOf(PREFIX_URL) === 0) {
            var inner = key.slice(PREFIX_URL.length);
            try {
                var joined =
                    inner.indexOf('://') >= 0
                        ? inner
                        : 'https://placeholder.invalid' + (inner.charAt(0) === '/' ? '' : '/') + inner;
                var u = new URL(joined);
                var hn = normalizeHost(u.hostname);
                if (listMatchesAllowlist(hn, u.href, whitelistedSites)) {
                    return true;
                }
            } catch (e) {
                /* ignore */
            }
        }
        return false;
    }

    root.BlocklistPolicy = {
        DEFAULT_REMAINING_SECONDS: DEFAULT_REMAINING_SECONDS,
        isBlockAllExceptAllowlistEnabled: isBlockAllExceptAllowlistEnabled,
        normalizeHost: normalizeHost,
        parseRuleLine: parseRuleLine,
        isSubstringBlockRuleKey: isSubstringBlockRuleKey,
        fullUrlMatchesSubstringRule: fullUrlMatchesSubstringRule,
        /** @deprecated Dùng isSubstringBlockRuleKey */
        isKeywordRuleKey: isSubstringBlockRuleKey,
        /** @deprecated Dùng fullUrlMatchesSubstringRule */
        urlMatchesKeywordRule: fullUrlMatchesSubstringRule,
        hostMatchesBlockedRule: hostMatchesBlockedRule,
        listMatchesHostname: listMatchesHostname,
        listMatchesAllowlist: listMatchesAllowlist,
        effectiveBlockedRules: effectiveBlockedRules,
        evaluateHostname: evaluateHostname,
        isExtensionSchemeLine: isExtensionSchemeLine,
        normalizeBulkBlockInputLine: normalizeBulkBlockInputLine,
        blockRuleKeyConflictsAllowlist: blockRuleKeyConflictsAllowlist,
        ruleEquivalenceKeyFromParsedKey: ruleEquivalenceKeyFromParsedKey,
        ruleEquivalenceKeyFromRaw: ruleEquivalenceKeyFromRaw,
    };
})();
