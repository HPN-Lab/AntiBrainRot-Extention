(function () {
    'use strict';

    const STORAGE_KEY = 'blockedGroups';
    const ALLOW_ONLY_KEY = 'blockAllExceptAllowlist';

    const addBtn = document.getElementById('blocked-add-group');
    const allowOnlyCheckbox = document.getElementById('blocked-block-all-except-allowlist');
    const listEl = document.getElementById('blocked-groups-list');
    const modal = document.getElementById('blocked-new-group-modal');
    const backdrop = document.getElementById('blocked-new-group-backdrop');
    const modalName = document.getElementById('blocked-modal-name');
    const modalHr = document.getElementById('blocked-modal-hr');
    const modalMin = document.getElementById('blocked-modal-min');
    const modalSites = document.getElementById('blocked-modal-sites');
    const modalTimerValue = document.getElementById('blocked-modal-timer-value');
    const modalCancel = document.getElementById('blocked-modal-cancel');
    const modalSave = document.getElementById('blocked-modal-save');
    const cardTemplate = document.getElementById('blocked-group-card-template');

    let bodyScrollLocked = false;

    let groupsCache = [];
    /** @type {boolean} */
    let savedAllowOnly = false;

    const HR_MAX = 23;
    const MIN_MAX = 59;

    function clampInt(raw, lo, hi) {
        const n = parseInt(String(raw).replace(/\D/g, ''), 10);
        if (Number.isNaN(n)) {
            return lo;
        }
        return Math.min(hi, Math.max(lo, n));
    }

    function formatHMS(totalSeconds) {
        const s = Math.max(0, Math.floor(totalSeconds));
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }

    function maxSecondsFromHrMin(hr, min) {
        return clampInt(hr, 0, HR_MAX) * 3600 + clampInt(min, 0, MIN_MAX) * 60;
    }

    /** Ghi lại ô input theo [0, max]; rỗng / không hợp lệ → 0 */
    function coerceHourField(el) {
        if (!el) {
            return;
        }
        const raw = String(el.value).trim();
        if (raw === '' || raw === '-') {
            el.value = '0';
            return;
        }
        const n = parseInt(raw, 10);
        if (Number.isNaN(n)) {
            el.value = '0';
            return;
        }
        el.value = String(Math.min(HR_MAX, Math.max(0, n)));
    }

    function coerceMinuteField(el) {
        if (!el) {
            return;
        }
        const raw = String(el.value).trim();
        if (raw === '' || raw === '-') {
            el.value = '0';
            return;
        }
        const n = parseInt(raw, 10);
        if (Number.isNaN(n)) {
            el.value = '0';
            return;
        }
        el.value = String(Math.min(MIN_MAX, Math.max(0, n)));
    }

    /** Khi gõ: vượt max → max; nhỏ hơn 0 → 0 (ô trống vẫn cho gõ tiếp) */
    function onHourFieldInput(el) {
        if (!el) {
            return;
        }
        const raw = String(el.value).trim();
        if (raw === '' || raw === '-') {
            return;
        }
        const n = parseInt(raw, 10);
        if (Number.isNaN(n)) {
            return;
        }
        const c = Math.min(HR_MAX, Math.max(0, n));
        if (c !== n) {
            el.value = String(c);
        }
    }

    function onMinuteFieldInput(el) {
        if (!el) {
            return;
        }
        const raw = String(el.value).trim();
        if (raw === '' || raw === '-') {
            return;
        }
        const n = parseInt(raw, 10);
        if (Number.isNaN(n)) {
            return;
        }
        const c = Math.min(MIN_MAX, Math.max(0, n));
        if (c !== n) {
            el.value = String(c);
        }
    }

    function bindHourMinInputs(hrEl, minEl, afterCoerce) {
        const tick = () => {
            if (typeof afterCoerce === 'function') {
                afterCoerce();
            }
        };
        hrEl?.addEventListener('input', () => {
            onHourFieldInput(hrEl);
            tick();
        });
        minEl?.addEventListener('input', () => {
            onMinuteFieldInput(minEl);
            tick();
        });
        hrEl?.addEventListener('blur', () => {
            coerceHourField(hrEl);
            tick();
        });
        minEl?.addEventListener('blur', () => {
            coerceMinuteField(minEl);
            tick();
        });
        hrEl?.addEventListener('change', () => {
            coerceHourField(hrEl);
            tick();
        });
        minEl?.addEventListener('change', () => {
            coerceMinuteField(minEl);
            tick();
        });
    }

    function getSyncStorageBulkExtra() {
        return new Promise((resolve, reject) => {
            try {
                chrome.storage.sync.get(['whitelistedSites', 'blockedSites'], (data) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                        return;
                    }
                    resolve(data || {});
                });
            } catch (e) {
                reject(e);
            }
        });
    }

    /**
     * Phân loại dòng nhập: chuẩn hóa (^ cho URL/path), hợp lệ, trùng, extension (cấm), không hợp lệ.
     * @param {string[]} existingLines
     * @param {string} rawText
     * @returns {{ merged: string[], invalid: string[], duplicates: string[], added: string[], extensionRejected: string[] }}
     */
    function dedupeSitesByRuleEquivalence(lines) {
        const seen = new Set();
        const out = [];
        (Array.isArray(lines) ? lines : []).forEach((line) => {
            const k = BlocklistPolicy.parseRuleLine(line);
            const ek = BlocklistPolicy.ruleEquivalenceKeyFromParsedKey(k);
            if (!ek || seen.has(ek)) {
                return;
            }
            seen.add(ek);
            out.push(line);
        });
        return out;
    }

    function partitionBulkSites(existingLines, rawText) {
        const existing = Array.isArray(existingLines) ? existingLines : [];
        const keySet = {};
        existing.forEach((line) => {
            const k = BlocklistPolicy.parseRuleLine(line);
            const ek = BlocklistPolicy.ruleEquivalenceKeyFromParsedKey(k);
            if (ek) {
                keySet[ek] = true;
            }
        });
        const invalid = [];
        const duplicates = [];
        const extensionRejected = [];
        const added = [];
        String(rawText || '')
            .split(/\r?\n/)
            .forEach((line) => {
                const t = line.trim();
                if (!t) {
                    return;
                }
                const norm = BlocklistPolicy.normalizeBulkBlockInputLine(t);
                if (!norm.ok) {
                    if (norm.reason === 'extension') {
                        extensionRejected.push(t);
                    } else {
                        invalid.push(t);
                    }
                    return;
                }
                const eqKey = BlocklistPolicy.ruleEquivalenceKeyFromParsedKey(norm.key);
                if (keySet[eqKey]) {
                    duplicates.push(t);
                    return;
                }
                keySet[eqKey] = true;
                added.push(norm.canonical);
            });
        return {
            merged: existing.concat(added),
            invalid,
            duplicates,
            added,
            extensionRejected,
        };
    }

    function findKeyInOtherPolicies(targetEquivKey, currentGroupId, blockedSitesFlat) {
        if (!targetEquivKey) {
            return '';
        }
        for (let gi = 0; gi < groupsCache.length; gi += 1) {
            const g = groupsCache[gi];
            if (currentGroupId != null && g && g.id === currentGroupId) {
                continue;
            }
            const sites = g && Array.isArray(g.sites) ? g.sites : [];
            for (let si = 0; si < sites.length; si += 1) {
                const ek = BlocklistPolicy.ruleEquivalenceKeyFromParsedKey(BlocklistPolicy.parseRuleLine(sites[si]));
                if (ek === targetEquivKey) {
                    return `Nhóm «${(g && g.name) || g.id}»`;
                }
            }
        }
        const bs = Array.isArray(blockedSitesFlat) ? blockedSitesFlat : [];
        for (let bi = 0; bi < bs.length; bi += 1) {
            const ek = BlocklistPolicy.ruleEquivalenceKeyFromParsedKey(BlocklistPolicy.parseRuleLine(String(bs[bi])));
            if (ek === targetEquivKey) {
                return 'Blacklist chung';
            }
        }
        return '';
    }

    function collectOtherGroupHits(canonicals, currentGroupId, blockedSitesFlat) {
        const hits = [];
        const seen = new Set();
        (canonicals || []).forEach((canonical) => {
            const equivKey = BlocklistPolicy.ruleEquivalenceKeyFromParsedKey(BlocklistPolicy.parseRuleLine(canonical));
            if (!equivKey || seen.has(equivKey)) {
                return;
            }
            const where = findKeyInOtherPolicies(equivKey, currentGroupId, blockedSitesFlat);
            if (where) {
                seen.add(equivKey);
                hits.push({ canonical, equivKey, where });
            }
        });
        return hits;
    }

    function formatWhereBullets(hits, max) {
        const n = Math.min(max, hits.length);
        const parts = [];
        for (let i = 0; i < n; i += 1) {
            parts.push(`• ${hits[i].canonical} → ${hits[i].where}`);
        }
        if (hits.length > max) {
            parts.push(`… và ${hits.length - max} mục nữa.`);
        }
        return parts.join('\n');
    }

    /**
     * @param {(merged: string[]) => void} commit
     */
    async function runBulkSavePipeline(existingLines, rawText, currentGroupId, commit) {
        const part = partitionBulkSites(existingLines, rawText);

        if (part.extensionRejected.length > 0) {
            const extList = formatLineBullets(part.extensionRejected, BULK_REPORT_MAX_LINES);
            if (typeof alertDashboardInfo === 'function') {
                await alertDashboardInfo(
                    'Không thể thêm URL extension',
                    `Không cho phép chặn trang extension (chrome-extension, moz-extension, …).\n${extList}\n\nToàn bộ thao tác bị hủy — không có mục nào được thêm.`,
                );
            } else {
                window.alert(`Không thể thêm URL extension.\n\n${extList}`);
            }
            return;
        }

        let toAdd = part.added.slice();
        let syncExtra = {};
        try {
            syncExtra = await getSyncStorageBulkExtra();
        } catch (e) {
            console.error('[BLOCKED_GROUPS:BULK_SYNC]', e);
        }
        const wl = Array.isArray(syncExtra.whitelistedSites) ? syncExtra.whitelistedSites : [];
        const bs = Array.isArray(syncExtra.blockedSites) ? syncExtra.blockedSites : [];

        const otherHits = collectOtherGroupHits(toAdd, currentGroupId, bs);
        if (otherHits.length > 0) {
            const body = `Các mục sau đã có trong nhóm khác hoặc Blacklist chung:\n${formatWhereBullets(otherHits, BULK_REPORT_MAX_LINES)}\n\nBỏ qua các mục trùng và chỉ thêm phần còn lại?`;
            let ok = false;
            if (typeof confirmDashboardClearList === 'function') {
                ok = await confirmDashboardClearList('Trùng với nhóm / blacklist khác', body, {
                    yesLabel: 'BỎ QUA TRÙNG',
                    noLabel: 'HỦY',
                });
            } else {
                ok = window.confirm(body);
            }
            if (!ok) {
                return;
            }
            const dropOther = new Set(otherHits.map((h) => h.equivKey));
            toAdd = toAdd.filter(
                (c) =>
                    !dropOther.has(BlocklistPolicy.ruleEquivalenceKeyFromParsedKey(BlocklistPolicy.parseRuleLine(c))),
            );
        }

        const allowHits = toAdd.filter((c) =>
            BlocklistPolicy.blockRuleKeyConflictsAllowlist(BlocklistPolicy.parseRuleLine(c), wl),
        );
        if (allowHits.length > 0) {
            const body = `Các mục sau trùng với Allow Website — trang vẫn được coi là cho phép, quy tắc chặn nhóm có thể không có tác dụng:\n${formatLineBullets(allowHits, BULK_REPORT_MAX_LINES)}\n\nBỏ qua các mục này và chỉ thêm phần còn lại?`;
            let okAllow = false;
            if (typeof confirmDashboardClearList === 'function') {
                okAllow = await confirmDashboardClearList('Trùng với Allow Website', body, {
                    yesLabel: 'BỎ QUA CÁC MỤC NÀY',
                    noLabel: 'HỦY',
                });
            } else {
                okAllow = window.confirm(body);
            }
            if (!okAllow) {
                return;
            }
            const dropAllow = new Set(
                allowHits.map((c) =>
                    BlocklistPolicy.ruleEquivalenceKeyFromParsedKey(BlocklistPolicy.parseRuleLine(c)),
                ),
            );
            toAdd = toAdd.filter(
                (c) =>
                    !dropAllow.has(BlocklistPolicy.ruleEquivalenceKeyFromParsedKey(BlocklistPolicy.parseRuleLine(c))),
            );
        }

        const merged = dedupeSitesByRuleEquivalence(existingLines.concat(toAdd));
        const reportPart = {
            merged,
            invalid: part.invalid,
            duplicates: part.duplicates,
            added: toAdd,
        };
        commit(merged);
        maybeAlertBulkSitesResult(reportPart);
    }

    function uniqueSitesFromLines(text) {
        return partitionBulkSites([], text).merged;
    }

    const BULK_REPORT_MAX_LINES = 8;

    function formatLineBullets(lines, max) {
        const n = Math.min(max, lines.length);
        const parts = [];
        for (let i = 0; i < n; i += 1) {
            parts.push(`• ${lines[i]}`);
        }
        if (lines.length > max) {
            parts.push(`… và ${lines.length - max} dòng nữa.`);
        }
        return parts.join('\n');
    }

    function bulkI18n(key, fallback) {
        const s = globalThis.ExtensionI18n && typeof globalThis.ExtensionI18n.getMessage === 'function' ? globalThis.ExtensionI18n.getMessage(key) : '';
        const out = String(s || '').trim();
        return out || fallback;
    }

    /** @param {{ invalid: string[], duplicates: string[], added: string[] }} part */
    function buildBulkSitesReport(part) {
        const chunks = [];
        if (part.added.length) {
            chunks.push(
                bulkI18n('bulk_report_valid_added', 'Added {N} valid entries.').replace('{N}', String(part.added.length)),
            );
        } else {
            chunks.push(bulkI18n('bulk_report_valid_none', 'No new valid entries were added.'));
        }
        if (part.invalid.length) {
            chunks.push(
                `\n${bulkI18n('bulk_report_invalid', 'Skipped {N} invalid lines (bad syntax / wildcards not supported):').replace('{N}', String(part.invalid.length))}\n${formatLineBullets(part.invalid, BULK_REPORT_MAX_LINES)}`,
            );
        }
        if (part.duplicates.length) {
            chunks.push(
                `\n${bulkI18n('bulk_report_dup', 'Skipped {N} duplicate lines (already in the group or duplicate in the text):').replace('{N}', String(part.duplicates.length))}\n${formatLineBullets(part.duplicates, BULK_REPORT_MAX_LINES)}`,
            );
        }
        return chunks.join('');
    }

    function maybeAlertBulkSitesResult(part) {
        if (!part.invalid.length && !part.duplicates.length) {
            return;
        }
        const msg = buildBulkSitesReport(part);
        const title = bulkI18n('bulk_report_title', 'Add blocked sites');
        if (typeof alertDashboardInfo === 'function') {
            alertDashboardInfo(title, msg);
        } else {
            window.alert(`${title}\n\n${msg}`);
        }
    }

    function persistGroupSites(groupId, nextSites, done) {
        const cleaned = dedupeSitesByRuleEquivalence(nextSites);
        const next = groupsCache.map((g) => (g.id === groupId ? { ...g, sites: cleaned } : g));
        saveGroups(next, done);
    }

    function newGroupId() {
        return `bg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    }

    function applyAllowOnlyFromStorage(value) {
        savedAllowOnly =
            typeof BlocklistPolicy !== 'undefined' && BlocklistPolicy.isBlockAllExceptAllowlistEnabled
                ? BlocklistPolicy.isBlockAllExceptAllowlistEnabled(value)
                : value === true || value === 1;
        if (allowOnlyCheckbox) {
            allowOnlyCheckbox.checked = savedAllowOnly;
        }
        refreshBlockedGroupsListLockUi();
    }

    function refreshBlockedGroupsListLockUi() {
        const locked = Boolean(savedAllowOnly);
        if (locked) {
            if (modal && modal.classList.contains('is-open')) {
                closeNewGroupModal();
            }
            if (listEl) {
                listEl.querySelectorAll('[data-card-sites-modal].blocked-add-sites-modal').forEach((panel) => {
                    if (!panel.classList.contains('hidden')) {
                        panel.classList.add('hidden');
                        panel.setAttribute('aria-hidden', 'true');
                    }
                });
            }
            document.body.classList.remove('blocked-add-sites-modal-open');
        }
        if (addBtn instanceof HTMLButtonElement) {
            addBtn.disabled = locked;
            addBtn.classList.toggle('opacity-50', locked);
            addBtn.classList.toggle('cursor-not-allowed', locked);
            addBtn.setAttribute('aria-disabled', String(locked));
        }
        if (listEl) {
            listEl.classList.toggle('blocked-groups-list--locked', locked);
            listEl.querySelectorAll('article').forEach((article) => {
                article.querySelectorAll('input, button, textarea, select').forEach((el) => {
                    el.disabled = locked;
                });
                setCardSaveState(article);
            });
        }
        updateModalSaveEnabled();
    }

    function loadBlockedPanel(callback) {
        try {
            chrome.storage.sync.get([STORAGE_KEY, ALLOW_ONLY_KEY], (data) => {
                if (chrome.runtime.lastError) {
                    console.error('[BLOCKED_GROUPS:LOAD]', chrome.runtime.lastError);
                    groupsCache = [];
                    applyAllowOnlyFromStorage(false);
                    callback(groupsCache);
                    return;
                }
                const raw = data[STORAGE_KEY];
                const arr = Array.isArray(raw) ? raw : [];
                let dedupeDirty = false;
                groupsCache = arr.map((g) => {
                    const prev = g && Array.isArray(g.sites) ? g.sites.length : 0;
                    const sites = dedupeSitesByRuleEquivalence(g && Array.isArray(g.sites) ? g.sites : []);
                    if (sites.length !== prev) {
                        dedupeDirty = true;
                    }
                    return { ...g, sites };
                });
                if (dedupeDirty) {
                    try {
                        chrome.storage.sync.set({ [STORAGE_KEY]: groupsCache }, () => {
                            if (chrome.runtime.lastError) {
                                console.error('[BLOCKED_GROUPS:DEDUPE_PERSIST]', chrome.runtime.lastError);
                            }
                        });
                    } catch (err) {
                        console.error('[BLOCKED_GROUPS:DEDUPE_PERSIST]', err);
                    }
                }
                applyAllowOnlyFromStorage(data[ALLOW_ONLY_KEY]);
                callback(groupsCache);
            });
        } catch (e) {
            console.error('[BLOCKED_GROUPS:LOAD]', e);
            groupsCache = [];
            applyAllowOnlyFromStorage(false);
            callback(groupsCache);
        }
    }

    function persistAllowOnly(nextValue, done) {
        try {
            chrome.storage.sync.set({ [ALLOW_ONLY_KEY]: Boolean(nextValue) }, () => {
                if (chrome.runtime.lastError) {
                    console.error('[BLOCKED_GROUPS:ALLOW_ONLY_SAVE]', chrome.runtime.lastError);
                    if (allowOnlyCheckbox) {
                        allowOnlyCheckbox.checked = savedAllowOnly;
                    }
                } else {
                    savedAllowOnly = Boolean(nextValue);
                    if (allowOnlyCheckbox) {
                        allowOnlyCheckbox.checked = savedAllowOnly;
                    }
                }
                refreshBlockedGroupsListLockUi();
                if (typeof done === 'function') {
                    done();
                }
            });
        } catch (err) {
            console.error('[BLOCKED_GROUPS:ALLOW_ONLY_SAVE]', err);
            refreshBlockedGroupsListLockUi();
            if (typeof done === 'function') {
                done();
            }
        }
    }

    function saveGroups(nextGroups, done) {
        const cleaned = nextGroups.map((g) => ({
            ...g,
            sites: dedupeSitesByRuleEquivalence(g.sites || []),
        }));
        groupsCache = cleaned;
        try {
            chrome.storage.sync.set({ [STORAGE_KEY]: cleaned }, () => {
                if (chrome.runtime.lastError) {
                    console.error('[BLOCKED_GROUPS:SAVE]', chrome.runtime.lastError);
                }
                if (typeof done === 'function') {
                    done();
                }
            });
        } catch (e) {
            console.error('[BLOCKED_GROUPS:SAVE]', e);
            if (typeof done === 'function') {
                done();
            }
        }
    }

    function updateModalTimer() {
        if (!modalTimerValue || !modalHr || !modalMin) {
            return;
        }
        const sec = maxSecondsFromHrMin(modalHr.value, modalMin.value);
        modalTimerValue.textContent = formatHMS(sec);
    }

    function updateModalSaveEnabled() {
        if (!modalSave || !modalName) {
            return;
        }
        if (savedAllowOnly) {
            modalSave.disabled = true;
            return;
        }
        const ok = modalName.value.trim().length > 0;
        modalSave.disabled = !ok;
    }

    function openNewGroupModal() {
        if (savedAllowOnly) {
            return;
        }
        if (!modal) {
            return;
        }
        if (modalName) {
            modalName.value = '';
        }
        if (modalHr) {
            modalHr.value = '1';
            coerceHourField(modalHr);
        }
        if (modalMin) {
            modalMin.value = '0';
            coerceMinuteField(modalMin);
        }
        if (modalSites) {
            modalSites.value = '';
        }
        updateModalTimer();
        updateModalSaveEnabled();
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        if (!bodyScrollLocked) {
            bodyScrollLocked = true;
            document.body.classList.add('blocked-new-group-modal-open');
        }
        document.addEventListener('keydown', onModalEscape);
        modalName?.focus();
    }

    function closeNewGroupModal() {
        if (!modal) {
            return;
        }
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.removeEventListener('keydown', onModalEscape);
        if (bodyScrollLocked) {
            bodyScrollLocked = false;
            document.body.classList.remove('blocked-new-group-modal-open');
        }
    }

    function onModalEscape(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            closeNewGroupModal();
        }
    }

    function onModalSaveClick() {
        if (savedAllowOnly) {
            return;
        }
        const name = modalName?.value.trim() || '';
        if (!name) {
            return;
        }
        coerceHourField(modalHr);
        coerceMinuteField(modalMin);
        const hr = clampInt(modalHr?.value, 0, HR_MAX);
        const min = clampInt(modalMin?.value, 0, MIN_MAX);
        void runBulkSavePipeline([], modalSites?.value || '', null, (merged) => {
            const g = {
                id: newGroupId(),
                name,
                maxHours: hr,
                maxMinutes: min,
                sites: merged,
            };
            const next = groupsCache.concat([g]);
            saveGroups(next, () => {
                closeNewGroupModal();
                renderAll();
            });
        });
    }

    function renderSiteChip(siteLabel) {
        const wrap = document.createElement('span');
        wrap.className = 'fb-hashtag-chip fb-allow-url-chip max-w-full';
        const text = document.createElement('span');
        text.className = 'fb-allow-url-chip__text';
        text.textContent = siteLabel;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fb-hashtag-chip-remove';
        btn.setAttribute('aria-label', `Xóa ${siteLabel}`);
        btn.dataset.cardSiteRemove = siteLabel;
        btn.textContent = '×';
        wrap.appendChild(text);
        wrap.appendChild(btn);
        return wrap;
    }

    function removeSiteFromGroup(groupId, siteLabel, done) {
        const key = BlocklistPolicy.parseRuleLine(siteLabel);
        const next = groupsCache.map((g) => {
            if (g.id !== groupId) {
                return g;
            }
            return {
                ...g,
                sites: (g.sites || []).filter((s) => BlocklistPolicy.parseRuleLine(s) !== key),
            };
        });
        saveGroups(next, typeof done === 'function' ? done : renderAll);
    }

    function updateCardTimer(article) {
        const hrEl = article.querySelector('[data-card-hr]');
        const minEl = article.querySelector('[data-card-min]');
        const valEl = article.querySelector('[data-card-timer-value]');
        if (!valEl) {
            return;
        }
        const sec = maxSecondsFromHrMin(hrEl?.value, minEl?.value);
        valEl.textContent = formatHMS(sec);
    }

    function isCardDirty(article) {
        const hr = clampInt(article.querySelector('[data-card-hr]')?.value, 0, HR_MAX);
        const min = clampInt(article.querySelector('[data-card-min]')?.value, 0, MIN_MAX);
        const sh = clampInt(article.dataset.savedHr, 0, HR_MAX);
        const sm = clampInt(article.dataset.savedMin, 0, MIN_MAX);
        const name = (article.querySelector('[data-card-name]')?.value || '').trim();
        const savedName = (article.dataset.savedName || '').trim();
        return hr !== sh || min !== sm || name !== savedName;
    }

    function setCardSaveState(article) {
        const btn = article.querySelector('[data-card-save]');
        if (!btn) {
            return;
        }
        if (savedAllowOnly) {
            btn.disabled = true;
            btn.classList.add('opacity-60', 'cursor-not-allowed');
            return;
        }
        const dirty = isCardDirty(article);
        btn.disabled = !dirty;
        btn.classList.toggle('opacity-60', !dirty);
        btn.classList.toggle('cursor-not-allowed', !dirty);
    }

    function bindGroupCard(article, group) {
        article.dataset.groupId = group.id;
        article.dataset.savedHr = String(clampInt(group.maxHours, 0, HR_MAX));
        article.dataset.savedMin = String(clampInt(group.maxMinutes, 0, MIN_MAX));
        article.dataset.savedName = group.name || '';

        const nameInput = article.querySelector('[data-card-name]');
        const hrInput = article.querySelector('[data-card-hr]');
        const minInput = article.querySelector('[data-card-min]');
        const saveBtn = article.querySelector('[data-card-save]');
        const delBtn = article.querySelector('[data-card-delete]');
        const addSiteBtn = article.querySelector('[data-card-add-site]');
        const clearSitesBtn = article.querySelector('[data-card-clear-sites]');
        const sitesList = article.querySelector('[data-card-sites-list]');
        const sitesModal = article.querySelector('[data-card-sites-modal]');
        const sitesBulkTa = article.querySelector('[data-card-sites-bulk]');
        const sitesBulkSave = article.querySelector('[data-card-sites-bulk-save]');
        const emptyP = article.querySelector('[data-card-empty]');

        let sitesModalEscapeHandler = null;
        const closeSitesModal = () => {
            if (!sitesModal) {
                return;
            }
            sitesModal.classList.add('hidden');
            sitesModal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('blocked-add-sites-modal-open');
            if (sitesModalEscapeHandler) {
                document.removeEventListener('keydown', sitesModalEscapeHandler);
                sitesModalEscapeHandler = null;
            }
        };
        const openSitesModal = () => {
            if (!sitesModal || !sitesBulkTa) {
                return;
            }
            sitesBulkTa.value = '';
            sitesModal.classList.remove('hidden');
            sitesModal.setAttribute('aria-hidden', 'false');
            document.body.classList.add('blocked-add-sites-modal-open');
            sitesModalEscapeHandler = (ev) => {
                if (ev.key === 'Escape') {
                    ev.preventDefault();
                    closeSitesModal();
                }
            };
            document.addEventListener('keydown', sitesModalEscapeHandler);
            sitesBulkTa.focus();
        };

        if (nameInput) {
            nameInput.value = group.name || '';
        }
        if (hrInput) {
            hrInput.value = String(group.maxHours ?? 0);
            coerceHourField(hrInput);
        }
        if (minInput) {
            minInput.value = String(group.maxMinutes ?? 0);
            coerceMinuteField(minInput);
        }

        updateCardTimer(article);
        setCardSaveState(article);

        const renderSites = () => {
            if (!sitesList || !emptyP) {
                return;
            }
            const gid = article.dataset.groupId;
            const g = groupsCache.find((x) => x.id === gid);
            const sites = g && Array.isArray(g.sites) ? g.sites : [];
            sitesList.innerHTML = '';
            sites.forEach((s) => sitesList.appendChild(renderSiteChip(s)));
            emptyP.classList.toggle('hidden', sites.length > 0);
            if (clearSitesBtn instanceof HTMLButtonElement) {
                clearSitesBtn.disabled = Boolean(savedAllowOnly) || sites.length === 0;
            }
            if (savedAllowOnly) {
                sitesList.querySelectorAll('button').forEach((b) => {
                    b.disabled = true;
                });
            }
        };
        renderSites();

        sitesList?.addEventListener('click', (event) => {
            const btn = event.target instanceof Element ? event.target.closest('[data-card-site-remove]') : null;
            if (!(btn instanceof HTMLButtonElement)) {
                return;
            }
            const label = btn.getAttribute('data-card-site-remove') || '';
            if (!label) {
                return;
            }
            removeSiteFromGroup(article.dataset.groupId, label, () => {
                renderSites();
                refreshBlockedGroupsListLockUi();
            });
        });

        sitesModal?.querySelectorAll('[data-card-sites-modal-close]').forEach((el) => {
            el.addEventListener('click', closeSitesModal);
        });
        sitesBulkSave?.addEventListener('click', () => {
            const gid = article.dataset.groupId;
            const g = groupsCache.find((x) => x.id === gid);
            if (!g || !sitesBulkTa) {
                closeSitesModal();
                return;
            }
            void runBulkSavePipeline(g.sites || [], sitesBulkTa.value, gid, (merged) => {
                persistGroupSites(gid, merged, () => {
                    renderSites();
                    closeSitesModal();
                    refreshBlockedGroupsListLockUi();
                });
            });
        });

        bindHourMinInputs(hrInput, minInput, () => {
            updateCardTimer(article);
            setCardSaveState(article);
        });
        nameInput?.addEventListener('input', () => setCardSaveState(article));

        saveBtn?.addEventListener('click', () => {
            const gid = article.dataset.groupId;
            const next = groupsCache.map((g) => {
                if (g.id !== gid) {
                    return g;
                }
                return {
                    ...g,
                    name: (nameInput?.value || '').trim() || g.name,
                    maxHours: clampInt(hrInput?.value, 0, HR_MAX),
                    maxMinutes: clampInt(minInput?.value, 0, MIN_MAX),
                };
            });
            saveGroups(next, () => {
                const updated = next.find((x) => x.id === gid);
                if (updated) {
                    article.dataset.savedHr = String(updated.maxHours);
                    article.dataset.savedMin = String(updated.maxMinutes);
                    article.dataset.savedName = (updated.name || '').trim();
                }
                setCardSaveState(article);
            });
        });

        delBtn?.addEventListener('click', () => {
            const gid = article.dataset.groupId;
            const g = groupsCache.find((x) => x.id === gid);
            const displayName = (g && g.name) || (nameInput?.value || '').trim() || 'nhóm này';
            const runDelete = () => {
                const next = groupsCache.filter((gr) => gr.id !== gid);
                saveGroups(next, renderAll);
            };
            if (typeof confirmDashboardClearList === 'function') {
                confirmDashboardClearList(
                    'Xóa nhóm chặn?',
                    `Bạn có chắc muốn xóa nhóm «${displayName}»? Toàn bộ trang trong nhóm sẽ bị gỡ khỏi nhóm; thao tác này không hoàn tác.`,
                    { yesLabel: 'XÓA NHÓM', noLabel: 'HỦY' },
                ).then((ok) => {
                    if (ok) {
                        runDelete();
                    }
                });
            } else {
                if (window.confirm(`Xóa nhóm «${displayName}»?`)) {
                    runDelete();
                }
            }
        });

        addSiteBtn?.addEventListener('click', (ev) => {
            ev.preventDefault();
            openSitesModal();
        });

        clearSitesBtn?.addEventListener('click', () => {
            const gid = article.dataset.groupId;
            const g = groupsCache.find((x) => x.id === gid);
            const sites = g && Array.isArray(g.sites) ? g.sites : [];
            if (sites.length === 0) {
                return;
            }
            const displayName = (g && g.name) || (nameInput?.value || '').trim() || 'nhóm này';
            const n = sites.length;
            const runClear = () => {
                persistGroupSites(gid, [], () => {
                    renderSites();
                    refreshBlockedGroupsListLockUi();
                });
            };
            if (typeof confirmDashboardClearList === 'function') {
                confirmDashboardClearList(
                    'Xóa hết trang trong nhóm?',
                    `Bạn có chắc muốn xóa tất cả ${n} mục trong nhóm «${displayName}»? Thao tác này không hoàn tác.`,
                    { yesLabel: 'XÓA HẾT', noLabel: 'HỦY' },
                ).then((ok) => {
                    if (ok) {
                        runClear();
                    }
                });
            } else if (window.confirm(`Xóa hết ${n} trang trong nhóm «${displayName}»?`)) {
                runClear();
            }
        });
    }

    function renderAll() {
        if (!listEl || !cardTemplate) {
            return;
        }
        listEl.innerHTML = '';
        groupsCache.forEach((g) => {
            const node = cardTemplate.content.firstElementChild.cloneNode(true);
            bindGroupCard(node, g);
            listEl.appendChild(node);
        });
        refreshBlockedGroupsListLockUi();
        if (globalThis.ExtensionI18n && typeof globalThis.ExtensionI18n.apply === 'function') {
            globalThis.ExtensionI18n.apply(listEl);
        }
    }

    function init() {
        if (!addBtn) {
            return;
        }

        void (async () => {
            if (globalThis.ExtensionI18n?.ready) {
                try {
                    await globalThis.ExtensionI18n.ready;
                } catch (e) {
                    console.error('[BLOCKED_GROUPS:I18N]', e);
                }
            }

            if (modal && modal.parentElement !== document.body) {
                document.body.appendChild(modal);
            }

            addBtn.addEventListener('click', (e) => {
                e.preventDefault();
                openNewGroupModal();
            });
            backdrop?.addEventListener('click', closeNewGroupModal);
            modalCancel?.addEventListener('click', closeNewGroupModal);
            bindHourMinInputs(modalHr, modalMin, updateModalTimer);
            modalName?.addEventListener('input', updateModalSaveEnabled);
            modalSave?.addEventListener('click', onModalSaveClick);

            loadBlockedPanel(() => renderAll());

            allowOnlyCheckbox?.addEventListener('change', () => {
                if (!allowOnlyCheckbox) {
                    return;
                }
                const next = Boolean(allowOnlyCheckbox.checked);
                if (next === savedAllowOnly) {
                    return;
                }
                const title = 'Xác nhận thay đổi';
                const message = next
                    ? 'Bật «Chặn mọi trang ngoài Allowlist»: chỉ các trang trong Allow Website được mở; mọi URL khác sẽ bị chặn. Bạn có chắc?'
                    : 'Tắt «Chặn mọi trang ngoài Allowlist»: các trang lại tuân theo nhóm chặn và blacklist như bình thường. Bạn có chắc?';
                const runSave = () => {
                    persistAllowOnly(next);
                };
                const revert = () => {
                    allowOnlyCheckbox.checked = savedAllowOnly;
                };
                if (typeof confirmDashboardClearList === 'function') {
                    confirmDashboardClearList(title, message, { yesLabel: 'LƯU', noLabel: 'HỦY' }).then((ok) => {
                        if (ok) {
                            runSave();
                        } else {
                            revert();
                        }
                    });
                } else if (window.confirm(`${title}\n\n${message}`)) {
                    runSave();
                } else {
                    revert();
                }
            });

            try {
                chrome.storage.onChanged.addListener((changes, area) => {
                    if (area !== 'sync') {
                        return;
                    }
                    if (changes[STORAGE_KEY]) {
                        const nv = changes[STORAGE_KEY].newValue;
                        groupsCache = Array.isArray(nv) ? nv : [];
                        renderAll();
                    }
                    if (changes[ALLOW_ONLY_KEY]) {
                        applyAllowOnlyFromStorage(changes[ALLOW_ONLY_KEY].newValue);
                    }
                });
            } catch (e) {
                /* ignore */
            }
        })();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
