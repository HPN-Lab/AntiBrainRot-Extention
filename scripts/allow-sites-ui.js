(function () {
    'use strict';

    const STORAGE_KEY = 'whitelistedSites';

    function t(key, fallback) {
        const s = globalThis.ExtensionI18n && typeof globalThis.ExtensionI18n.getMessage === 'function' ? globalThis.ExtensionI18n.getMessage(key) : '';
        const out = String(s || '').trim();
        return out || fallback;
    }

    const clearAllBtn = document.getElementById('allow-clear-all-sites');
    const addOpenBtn = document.getElementById('allow-add-sites-open');
    const listEl = document.getElementById('allow-sites-list');
    const emptyP = document.getElementById('allow-sites-empty');
    const modal = document.getElementById('allow-sites-modal');
    const modalTitle = document.getElementById('allow-sites-modal-title');
    const modalDescAdd = document.getElementById('allow-sites-modal-desc-add');
    const modalDescEdit = document.getElementById('allow-sites-modal-desc-edit');
    const modalHints = document.getElementById('allow-sites-modal-hints');
    const bulkTa = document.getElementById('allow-sites-bulk');
    const modalSave = document.getElementById('allow-sites-modal-save');

    let listCache = [];
    /** @type {string|null} */
    let editOriginalLine = null;
    let modalEscapeHandler = null;
    let bodyScrollLocked = false;

    function uniqueSitesFromLines(text) {
        const lines = String(text || '').split(/\r?\n/);
        const seen = {};
        const out = [];
        lines.forEach((line) => {
            const trimmed = line.trim();
            if (!trimmed) {
                return;
            }
            const key = BlocklistPolicy.parseRuleLine(trimmed);
            if (key && !seen[key]) {
                seen[key] = true;
                out.push(trimmed);
            }
        });
        return out;
    }

    function mergeSitesIntoExisting(existing, linesText) {
        const seen = {};
        const out = [];
        const pushLine = (line) => {
            const key = BlocklistPolicy.parseRuleLine(line);
            if (!key || seen[key]) {
                return;
            }
            seen[key] = true;
            out.push(line);
        };
        (Array.isArray(existing) ? existing : []).forEach(pushLine);
        uniqueSitesFromLines(linesText).forEach(pushLine);
        return out;
    }

    function loadList(callback) {
        try {
            chrome.storage.sync.get([STORAGE_KEY], (data) => {
                if (chrome.runtime.lastError) {
                    console.error('[ALLOW_SITES:LOAD]', chrome.runtime.lastError);
                    listCache = [];
                    callback(listCache);
                    return;
                }
                const raw = data[STORAGE_KEY];
                listCache = Array.isArray(raw) ? raw : [];
                callback(listCache);
            });
        } catch (e) {
            console.error('[ALLOW_SITES:LOAD]', e);
            listCache = [];
            callback(listCache);
        }
    }

    function saveList(next, done) {
        listCache = next;
        try {
            chrome.storage.sync.set({ [STORAGE_KEY]: next }, () => {
                if (chrome.runtime.lastError) {
                    console.error('[ALLOW_SITES:SAVE]', chrome.runtime.lastError);
                }
                if (typeof done === 'function') {
                    done();
                }
            });
        } catch (e) {
            console.error('[ALLOW_SITES:SAVE]', e);
            if (typeof done === 'function') {
                done();
            }
        }
    }

    function closeModal() {
        if (!modal) {
            return;
        }
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        editOriginalLine = null;
        document.body.classList.remove('allow-add-sites-modal-open');
        if (bodyScrollLocked) {
            bodyScrollLocked = false;
        }
        if (modalEscapeHandler) {
            document.removeEventListener('keydown', modalEscapeHandler);
            modalEscapeHandler = null;
        }
    }

    function openModalAdd() {
        if (!modal || !bulkTa || !modalTitle || !modalSave) {
            return;
        }
        editOriginalLine = null;
        modalTitle.textContent = t('allow_modal_title', 'Add allowed site(s)');
        modalSave.textContent = t('allow_modal_btn_add', 'Add');
        modalDescAdd?.classList.remove('hidden');
        modalDescEdit?.classList.add('hidden');
        modalHints?.classList.remove('hidden');
        bulkTa.value = '';
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        if (!bodyScrollLocked) {
            bodyScrollLocked = true;
            document.body.classList.add('allow-add-sites-modal-open');
        }
        modalEscapeHandler = (ev) => {
            if (ev.key === 'Escape') {
                ev.preventDefault();
                closeModal();
            }
        };
        document.addEventListener('keydown', modalEscapeHandler);
        bulkTa.focus();
    }

    function openModalEdit(rawLine) {
        if (!modal || !bulkTa || !modalTitle || !modalSave) {
            return;
        }
        editOriginalLine = rawLine;
        modalTitle.textContent = t('allow_modal_title_edit', 'Edit allowed site');
        modalSave.textContent = t('common_save', 'Save');
        modalDescAdd?.classList.add('hidden');
        modalDescEdit?.classList.remove('hidden');
        modalHints?.classList.add('hidden');
        bulkTa.value = rawLine;
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        if (!bodyScrollLocked) {
            bodyScrollLocked = true;
            document.body.classList.add('allow-add-sites-modal-open');
        }
        modalEscapeHandler = (ev) => {
            if (ev.key === 'Escape') {
                ev.preventDefault();
                closeModal();
            }
        };
        document.addEventListener('keydown', modalEscapeHandler);
        bulkTa.focus();
        bulkTa.select();
    }

    function removeOne(rawLine, done) {
        const key = BlocklistPolicy.parseRuleLine(rawLine);
        const next = listCache.filter((s) => BlocklistPolicy.parseRuleLine(s) !== key);
        saveList(next, typeof done === 'function' ? done : renderList);
    }

    function replaceEntry(oldRaw, newRawTrimmed, done) {
        const oldKey = BlocklistPolicy.parseRuleLine(oldRaw);
        const newKey = BlocklistPolicy.parseRuleLine(newRawTrimmed);
        if (!oldKey || !newKey) {
            if (typeof done === 'function') {
                done(false);
            }
            return;
        }
        const idx = listCache.findIndex((s) => BlocklistPolicy.parseRuleLine(s) === oldKey);
        if (idx < 0) {
            if (typeof done === 'function') {
                done(false);
            }
            return;
        }
        const dup = listCache.some((s, j) => j !== idx && BlocklistPolicy.parseRuleLine(s) === newKey);
        if (dup) {
            if (typeof done === 'function') {
                done(false);
            }
            return;
        }
        const next = listCache.slice();
        next[idx] = newRawTrimmed;
        saveList(next, () => {
            if (typeof done === 'function') {
                done(true);
            }
            renderList();
        });
    }

    function onModalSave() {
        if (!bulkTa) {
            closeModal();
            return;
        }
        if (editOriginalLine !== null) {
            const trimmed = bulkTa.value.trim();
            if (!trimmed) {
                return;
            }
            replaceEntry(editOriginalLine, trimmed, (ok) => {
                if (ok) {
                    closeModal();
                } else {
                    window.alert(t('allow_alert_save_fail', 'Could not save: empty entry, not found, or duplicate with another entry.'));
                }
            });
            return;
        }
        const merged = mergeSitesIntoExisting(listCache, bulkTa.value);
        saveList(merged, () => {
            renderList();
            closeModal();
        });
    }

    function renderList() {
        if (!listEl || !emptyP) {
            return;
        }
        listEl.innerHTML = '';
        const sites = Array.isArray(listCache) ? listCache : [];
        sites.forEach((line) => {
            const row = document.createElement('div');
            row.className =
                'theme-surface theme-border flex flex-col gap-3 rounded-3xl border px-6 py-5 shadow-none transition-all duration-200 ease-in-out sm:flex-row sm:items-center sm:justify-between';
            const left = document.createElement('div');
            left.className = 'min-w-0 flex-1';
            const title = document.createElement('p');
            title.className = 'theme-title break-all text-[18px] font-semibold';
            title.textContent = line;
            left.appendChild(title);

            const right = document.createElement('div');
            right.className = 'flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end';

            const badge = document.createElement('span');
            badge.className =
                'rounded-full bg-emerald-100 px-3 py-1.5 text-[12px] font-semibold uppercase text-emerald-800 sm:text-[14px]';
            badge.textContent = t('allow_badge_allowed', 'Allowed');

            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className =
                'inline-flex min-h-[2.5rem] items-center justify-center gap-1.5 rounded-lg border border-[var(--theme-primary)] bg-transparent px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-[var(--theme-primary)] transition hover:bg-[var(--theme-primary-soft)] sm:text-[12px]';
            editBtn.setAttribute('aria-label', t('allow_edit_aria', 'Edit {LINE}').replace('{LINE}', line));
            editBtn.innerHTML = `<i class="fa-solid fa-pen shrink-0 text-[13px]" aria-hidden="true"></i> ${t('allow_btn_edit', 'Edit')}`;

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className =
                'inline-flex min-h-[2.5rem] items-center justify-center gap-2 rounded-lg border border-red-500 bg-transparent px-4 py-2.5 text-[12px] font-bold uppercase tracking-wide text-red-600 transition hover:bg-red-50';
            delBtn.setAttribute('aria-label', t('allow_delete_aria', 'Delete {LINE}').replace('{LINE}', line));
            delBtn.innerHTML = `<i class="fa-solid fa-trash-can text-[13px]" aria-hidden="true"></i> ${t('allow_btn_delete', 'Delete')}`;

            editBtn.addEventListener('click', () => {
                openModalEdit(line);
            });
            delBtn.addEventListener('click', () => {
                const run = () => removeOne(line, renderList);
                if (typeof confirmDashboardClearList === 'function') {
                    confirmDashboardClearList(
                        t('allow_confirm_delete_title', 'Remove allowed site?'),
                        t('allow_confirm_delete_body', 'Are you sure you want to remove «{LINE}» from the allow list?').replace('{LINE}', line),
                        {
                            yesLabel: t('allow_confirm_yes_delete', 'DELETE'),
                            noLabel: t('dash_confirm_no', 'Cancel'),
                        },
                    ).then((ok) => {
                        if (ok) {
                            run();
                        }
                    });
                } else if (
                    window.confirm(
                        t('allow_confirm_delete_body', 'Are you sure you want to remove «{LINE}» from the allow list?').replace('{LINE}', line),
                    )
                ) {
                    run();
                }
            });

            right.appendChild(badge);
            right.appendChild(editBtn);
            right.appendChild(delBtn);
            row.appendChild(left);
            row.appendChild(right);
            listEl.appendChild(row);
        });

        emptyP.classList.toggle('hidden', sites.length > 0);
        if (clearAllBtn instanceof HTMLButtonElement) {
            clearAllBtn.disabled = sites.length === 0;
        }
    }

    function init() {
        if (!addOpenBtn || !listEl) {
            return;
        }

        if (modal && modal.parentElement !== document.body) {
            document.body.appendChild(modal);
        }

        addOpenBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openModalAdd();
        });

        modal?.querySelectorAll('[data-allow-sites-modal-close]').forEach((el) => {
            el.addEventListener('click', closeModal);
        });
        modalSave?.addEventListener('click', onModalSave);

        clearAllBtn?.addEventListener('click', () => {
            const sites = Array.isArray(listCache) ? listCache : [];
            if (sites.length === 0) {
                return;
            }
            const n = sites.length;
            const runClear = () => {
                saveList([], renderList);
            };
            if (typeof confirmDashboardClearList === 'function') {
                confirmDashboardClearList(
                    t('allow_confirm_clear_all_title', 'Remove all allowed sites?'),
                    t('allow_confirm_clear_all_body', 'This will remove all {N} entries from the allow list. This cannot be undone.').replace('{N}', String(n)),
                    {
                        yesLabel: t('allow_confirm_yes_clear_all', 'DELETE ALL'),
                        noLabel: t('dash_confirm_no', 'Cancel'),
                    },
                ).then((ok) => {
                    if (ok) {
                        runClear();
                    }
                });
            } else if (
                window.confirm(
                    t('allow_confirm_clear_all_body', 'This will remove all {N} entries from the allow list. This cannot be undone.').replace(
                        '{N}',
                        String(n),
                    ),
                )
            ) {
                runClear();
            }
        });

        loadList(() => renderList());

        try {
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area !== 'sync' && area !== 'local') {
                    return;
                }
                if (changes[STORAGE_KEY]) {
                    const nv = changes[STORAGE_KEY].newValue;
                    listCache = Array.isArray(nv) ? nv : [];
                }
                if (changes[STORAGE_KEY] || changes.dashboardSettings) {
                    renderList();
                }
            });
        } catch (e) {
            /* ignore */
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
