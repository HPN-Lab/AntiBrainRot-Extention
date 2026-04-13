'use strict';

(function activeScheduleUi() {
    const ACTIVE_SCHEDULE_KEY = 'vmuActiveSchedule';
    const LEGACY_SCHEDULE_KEY = 'vmuFocusSchedule';

    const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

    /** @type {Record<number, string>} */
    const DAY_EN_SHORT = {
        1: 'Mon',
        2: 'Tue',
        3: 'Wed',
        4: 'Thu',
        5: 'Fri',
        6: 'Sat',
        0: 'Sun',
    };

    /** @type {Record<number, string>} */
    const DAY_VI = {
        1: 'Thứ Hai',
        2: 'Thứ Ba',
        3: 'Thứ Tư',
        4: 'Thứ Năm',
        5: 'Thứ Sáu',
        6: 'Thứ Bảy',
        0: 'Chủ nhật',
    };

    const defaultSchedule = () => ({
        activeDays: [1, 2, 3, 4, 5],
        activeHours: { start: '09:00', end: '17:00' },
        dailyResetTime: '00:00',
    });

    let state = defaultSchedule();
    let persistTimer = null;
    /** @type {'days'|'hours'|'reset'} */
    let pendingSaveKind = 'days';

    /** Tránh onChanged ghi đè banner “đã lưu” ngay sau khi persist cục bộ. */
    let scheduleBannerRefreshSuppressedUntil = 0;

    const els = {
        start: document.getElementById('schedule-active-start'),
        end: document.getElementById('schedule-active-end'),
        reset: document.getElementById('schedule-daily-reset'),
        btnHours: document.getElementById('schedule-save-hours'),
        btnReset: document.getElementById('schedule-save-reset'),
        selectAll: document.getElementById('schedule-select-all-days'),
    };

    const bottomBannerPack = {
        banner: document.getElementById('schedule-save-banner'),
        msg: document.getElementById('schedule-save-banner-msg'),
        detail: document.getElementById('schedule-save-banner-detail'),
    };

    const hoursBannerPack = {
        banner: document.getElementById('schedule-hours-banner'),
        msg: document.getElementById('schedule-hours-banner-msg'),
        detail: document.getElementById('schedule-hours-banner-detail'),
    };

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    /** @param {Date} d */
    function formatSavedStamp(d) {
        const hmss = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
        const day = d.getDate();
        const month = d.getMonth() + 1;
        const y = d.getFullYear();
        const dmy = `${day}/${month}/${y}`;
        return { hmss, dmy };
    }

    /** @param {string} [t] */
    function normalizeTimeDisplay(t) {
        const m = String(t || '').trim().match(/^(\d{1,2}):(\d{2})$/);
        if (!m) {
            return t || '';
        }
        return `${pad2(Number(m[1]))}:${m[2]}`;
    }

    /** @param {'days'|'hours'|'reset'} saveKind */
    function buildSavePrimary(saveKind, savedAt) {
        const { hmss, dmy } = formatSavedStamp(savedAt);
        const head = `Starting at ${hmss} ${dmy}`;
        if (saveKind === 'reset') {
            const rt = normalizeTimeDisplay(state.dailyResetTime);
            return `${head} your Daily Reset Time will be ${rt}.`;
        }
        if (saveKind === 'hours') {
            const a = normalizeTimeDisplay(state.activeHours.start);
            const b = normalizeTimeDisplay(state.activeHours.end);
            return `${head} your Active Hours Start time will be ${a} and End time will be ${b}.`;
        }
        if (!state.activeDays.length) {
            return `${head} no weekdays are selected — scheduled time limits are off until you pick at least one day.`;
        }
        const labels = state.activeDays.map((d) => DAY_EN_SHORT[d] || String(d)).join(', ');
        return `${head} your Active Days now include: ${labels}.`;
    }

    /** @param {'days'|'hours'|'reset'} saveKind */
    function buildSaveDetail(saveKind) {
        if (saveKind === 'reset') {
            return 'Mỗi ngày đúng giờ trên, extension reset thời gian còn lại (siteTimers) cho các hostname nằm trong danh sách / nhóm chặn. Giờ hiển thị theo đồng hồ máy tính của bạn.';
        }
        if (saveKind === 'hours') {
            return 'Mỗi ngày đã tích ở Active Days, hạn mức theo lịch chỉ áp dụng trong khoảng Start–End theo giờ máy bạn (đúng hai mốc vừa lưu). Ngoài khung đó hạn mức theo lịch không chạy; trang trong danh sách được phép vẫn vào bình thường. Giờ hiển thị theo đồng hồ máy tính của bạn.';
        }
        return 'Chỉ các ngày được tích mới bật hạn mức theo lịch. Bỏ hết tích nếu bạn muốn tắt hạn mức theo lịch; chặn theo danh sách vẫn theo cài đặt extension.';
    }

    /** @param {{ banner: HTMLElement|null, msg: HTMLElement|null, detail: HTMLElement|null }} pack */
    function clearBannerPack(pack) {
        if (!pack.banner || !pack.msg) {
            return;
        }
        pack.banner.classList.add('hidden');
        pack.banner.removeAttribute('data-kind');
        pack.msg.textContent = '';
        if (pack.detail) {
            pack.detail.textContent = '';
            pack.detail.classList.add('hidden');
        }
    }

    /**
     * @param {{ banner: HTMLElement|null, msg: HTMLElement|null, detail: HTMLElement|null }} pack
     * @param {'success'|'error'|'info'} [kind]
     */
    function fillBannerPack(pack, msg, kind, detail) {
        if (!pack.banner || !pack.msg) {
            return;
        }
        const nextKind = kind === 'error' ? 'error' : kind === 'info' ? 'info' : 'success';
        pack.banner.setAttribute('data-kind', nextKind);
        pack.msg.textContent = msg;
        pack.banner.classList.remove('hidden');
        if (pack.detail) {
            if (detail) {
                pack.detail.textContent = detail;
                pack.detail.classList.remove('hidden');
            } else {
                pack.detail.textContent = '';
                pack.detail.classList.add('hidden');
            }
        }
    }

    /**
     * @param {string} msg
     * @param {'success'|'error'} [kind]
     * @param {string} [detail]
     * @param {'bottom'|'hours'} [placement] — giờ hoạt động: banner ngay dưới Active Hours; ngày/reset: banner cuối
     */
    function setStatus(msg, kind, detail, placement) {
        const place = placement === 'hours' ? 'hours' : 'bottom';
        const primary = place === 'hours' ? hoursBannerPack : bottomBannerPack;
        if (!msg) {
            clearBannerPack(bottomBannerPack);
            clearBannerPack(hoursBannerPack);
            return;
        }
        fillBannerPack(primary, msg, kind, detail);
    }

    /** Luôn hiển thị tóm tắt cấu hình hiện tại (không cần chờ lưu). */
    function refreshInfoBannersFromState() {
        if (!hoursBannerPack.banner || !bottomBannerPack.banner) {
            return;
        }
        const a = normalizeTimeDisplay(state.activeHours.start);
        const b = normalizeTimeDisplay(state.activeHours.end);
        const hoursPrimary = `Khung Active Hours hiện tại: ${a} – ${b} (giờ máy bạn).`;
        fillBannerPack(hoursBannerPack, hoursPrimary, 'info', buildSaveDetail('hours'));

        const rt = normalizeTimeDisplay(state.dailyResetTime);
        let bottomPrimary;
        if (!state.activeDays.length) {
            bottomPrimary = `Chưa chọn ngày nào — hạn mức theo lịch đang tắt. Giờ reset hằng ngày (siteTimers): ${rt}.`;
        } else {
            const ordered = DAY_ORDER.filter((d) => state.activeDays.includes(d));
            const labels = ordered.map((d) => DAY_VI[d] || String(d)).join(', ');
            bottomPrimary = `Các ngày áp dụng: ${labels}. Giờ reset hằng ngày: ${rt}.`;
        }
        const bottomDetail = [buildSaveDetail('days'), buildSaveDetail('reset')].join('\n\n');
        fillBannerPack(bottomBannerPack, bottomPrimary, 'info', bottomDetail);
    }

    function migrateFromLegacy(legacyPack) {
        const slot = legacyPack && legacyPack.slots && legacyPack.slots[0];
        if (!slot) {
            return defaultSchedule();
        }
        const raw = Array.isArray(slot.activeDays) ? slot.activeDays : [1, 2, 3, 4, 5];
        const days = raw.filter((n) => n === 0 || (Number.isInteger(n) && n >= 1 && n <= 6));
        return {
            activeDays: days.length ? days : [1, 2, 3, 4, 5],
            activeHours: {
                start: typeof slot.start === 'string' && slot.start ? slot.start : '09:00',
                end: typeof slot.end === 'string' && slot.end ? slot.end : '17:00',
            },
            dailyResetTime: '00:00',
        };
    }

    function normalizeSchedule(raw) {
        const d = defaultSchedule();
        if (!raw || typeof raw !== 'object') {
            return d;
        }
        if (Array.isArray(raw.activeDays)) {
            d.activeDays = raw.activeDays.filter((n) => n === 0 || (Number.isInteger(n) && n >= 1 && n <= 6));
        }
        if (raw.activeHours && typeof raw.activeHours === 'object') {
            if (typeof raw.activeHours.start === 'string') {
                d.activeHours.start = raw.activeHours.start;
            }
            if (typeof raw.activeHours.end === 'string') {
                d.activeHours.end = raw.activeHours.end;
            }
        }
        if (typeof raw.dailyResetTime === 'string' && /^\d{1,2}:\d{2}$/.test(raw.dailyResetTime.trim())) {
            d.dailyResetTime = raw.dailyResetTime.trim();
        }
        return d;
    }

    /**
     * @param {'days'|'hours'|'reset'} [saveKind]
     */
    function persist(saveKind) {
        pendingSaveKind = saveKind || 'days';
        window.clearTimeout(persistTimer);
        persistTimer = window.setTimeout(() => {
            const kind = pendingSaveKind;
            const savedAt = new Date();
            try {
                scheduleBannerRefreshSuppressedUntil = Date.now() + 600;
                chrome.storage.sync.set({ [ACTIVE_SCHEDULE_KEY]: state }, () => {
                    if (chrome.runtime.lastError) {
                        console.error('[ACTIVE_SCHEDULE:SAVE]', chrome.runtime.lastError);
                        setStatus(
                            'Không lưu được cấu hình lịch.',
                            'error',
                            'Kiểm tra kết nối hoặc quyền đồng bộ Chrome (chrome.storage.sync).',
                            kind === 'hours' ? 'hours' : 'bottom',
                        );
                        return;
                    }
                    setStatus(
                        buildSavePrimary(kind, savedAt),
                        'success',
                        buildSaveDetail(kind),
                        kind === 'hours' ? 'hours' : 'bottom',
                    );
                });
            } catch (e) {
                console.error('[ACTIVE_SCHEDULE:SAVE]', e);
                setStatus(
                    'Không lưu được cấu hình lịch.',
                    'error',
                    'Đã xảy ra lỗi khi ghi dữ liệu. Thử tải lại trang hoặc kiểm tra console.',
                    kind === 'hours' ? 'hours' : 'bottom',
                );
            }
        }, 200);
    }

    function syncDayCheckboxes() {
        const set = new Set(state.activeDays);
        DAY_ORDER.forEach((d) => {
            const el = document.getElementById(`schedule-day-${d}`);
            if (el) {
                el.checked = set.has(d);
            }
        });
    }

    function syncTimeInputs() {
        if (els.start) {
            els.start.value = state.activeHours.start || '09:00';
        }
        if (els.end) {
            els.end.value = state.activeHours.end || '17:00';
        }
        if (els.reset) {
            els.reset.value = state.dailyResetTime || '00:00';
        }
    }

    function applyStateToDom() {
        syncDayCheckboxes();
        syncTimeInputs();
    }

    function load() {
        try {
            chrome.storage.sync.get([ACTIVE_SCHEDULE_KEY, LEGACY_SCHEDULE_KEY], (data) => {
                if (chrome.runtime.lastError) {
                    console.error('[ACTIVE_SCHEDULE:LOAD]', chrome.runtime.lastError);
                    return;
                }
                let next = null;
                if (data[ACTIVE_SCHEDULE_KEY] && typeof data[ACTIVE_SCHEDULE_KEY] === 'object') {
                    next = normalizeSchedule(data[ACTIVE_SCHEDULE_KEY]);
                } else {
                    next = migrateFromLegacy(data[LEGACY_SCHEDULE_KEY]);
                    chrome.storage.sync.set({ [ACTIVE_SCHEDULE_KEY]: next }, () => {});
                }
                state = next;
                applyStateToDom();
                refreshInfoBannersFromState();
            });
        } catch (e) {
            console.error('[ACTIVE_SCHEDULE:LOAD]', e);
        }
    }

    function wireDay(d) {
        const el = document.getElementById(`schedule-day-${d}`);
        if (!el) {
            return;
        }
        el.addEventListener('change', () => {
            const set = new Set(state.activeDays);
            if (el.checked) {
                set.add(d);
            } else {
                set.delete(d);
            }
            state.activeDays = DAY_ORDER.filter((x) => set.has(x));
            persist('days');
        });
    }

    DAY_ORDER.forEach(wireDay);

    if (els.selectAll) {
        els.selectAll.addEventListener('click', () => {
            state.activeDays = [...DAY_ORDER];
            syncDayCheckboxes();
            persist('days');
        });
    }

    if (els.btnHours) {
        els.btnHours.addEventListener('click', () => {
            const s = els.start && els.start.value ? els.start.value : '09:00';
            const e = els.end && els.end.value ? els.end.value : '17:00';
            state.activeHours = { start: s, end: e };
            persist('hours');
        });
    }

    if (els.btnReset) {
        els.btnReset.addEventListener('click', () => {
            const t = els.reset && els.reset.value ? els.reset.value : '00:00';
            state.dailyResetTime = t;
            persist('reset');
        });
    }

    try {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'sync' && changes[ACTIVE_SCHEDULE_KEY]) {
                state = normalizeSchedule(changes[ACTIVE_SCHEDULE_KEY].newValue);
                applyStateToDom();
                if (Date.now() >= scheduleBannerRefreshSuppressedUntil) {
                    refreshInfoBannersFromState();
                }
            }
        });
    } catch (e) {
        /* ignore */
    }

    load();
})();
