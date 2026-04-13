(function () {
    "use strict";

    /** Set true to test challenge flow before persisting saves. */
    const RequireChallenge = false;

    const RING_R = 52;
    const RING_C = 2 * Math.PI * RING_R;

    const addGroupBtn = document.getElementById("bs-add-group");
    const challengeOverlay = document.getElementById("bs-challenge-overlay");
    const challengeOk = document.getElementById("bs-challenge-ok");
    const challengeCancel = document.getElementById("bs-challenge-cancel");

    const newOverlay = document.getElementById("bs-new-group-overlay");
    const newName = document.getElementById("bs-new-group-name");
    const newHr = document.getElementById("bs-new-group-hr");
    const newMin = document.getElementById("bs-new-group-min");
    const newSites = document.getElementById("bs-new-group-sites");
    const newSave = document.getElementById("bs-new-group-save");
    const newCancel = document.getElementById("bs-new-group-cancel");
    const ringProgress = document.getElementById("bs-new-group-ring-progress");
    const timerValue = document.getElementById("bs-new-group-timer-value");

    function formatHMS(totalSeconds) {
        const s = Math.max(0, Math.floor(totalSeconds));
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    }

    function clampInt(raw, lo, hi) {
        const n = parseInt(String(raw).replace(/\D/g, ""), 10);
        if (Number.isNaN(n)) return lo;
        return Math.min(hi, Math.max(lo, n));
    }

    function readModalMaxSeconds() {
        const hr = clampInt(newHr?.value, 0, 23);
        const min = clampInt(newMin?.value, 0, 59);
        return hr * 3600 + min * 60;
    }

    function updateModalTimerVisual() {
        if (!ringProgress || !timerValue) return;
        const maxSec = readModalMaxSeconds();
        const remaining = maxSec;
        const denom = Math.max(1, maxSec || 1);
        const ratio = maxSec <= 0 ? 0 : Math.min(1, remaining / denom);

        ringProgress.style.strokeDasharray = `${RING_C}`;
        ringProgress.style.strokeDashoffset = `${RING_C * (1 - ratio)}`;
        timerValue.textContent = formatHMS(remaining);
    }

    function isSaveGroupEnabled() {
        return Boolean(newName && newName.value.trim().length > 0);
    }

    function updateSaveGroupButton() {
        if (!newSave) return;
        newSave.disabled = !isSaveGroupEnabled();
    }

    function resetNewGroupForm() {
        if (newName) newName.value = "";
        if (newHr) newHr.value = "1";
        if (newMin) newMin.value = "0";
        if (newSites) newSites.value = "";
        updateModalTimerVisual();
        updateSaveGroupButton();
        newName?.focus();
    }

    function openNewGroupModal() {
        resetNewGroupForm();
        if (!newOverlay) return;
        newOverlay.hidden = false;
        newOverlay.setAttribute("aria-hidden", "false");
        document.addEventListener("keydown", onNewGroupEscape);
    }

    function closeNewGroupModal() {
        if (!newOverlay) return;
        newOverlay.hidden = true;
        newOverlay.setAttribute("aria-hidden", "true");
        document.removeEventListener("keydown", onNewGroupEscape);
    }

    function onNewGroupEscape(e) {
        if (e.key === "Escape") {
            e.preventDefault();
            closeNewGroupModal();
        }
    }

    /**
     * @returns {Promise<boolean>}
     */
    function triggerChallengeModal() {
        return new Promise((resolve) => {
            challengeOverlay.hidden = false;
            challengeOverlay.setAttribute("aria-hidden", "false");

            const onOk = () => {
                cleanup();
                resolve(true);
            };
            const onCancel = () => {
                cleanup();
                resolve(false);
            };
            function cleanup() {
                challengeOverlay.hidden = true;
                challengeOverlay.setAttribute("aria-hidden", "true");
                challengeOk.removeEventListener("click", onOk);
                challengeCancel.removeEventListener("click", onCancel);
                challengeOverlay.removeEventListener("click", onOverlay);
            }
            function onOverlay(e) {
                if (e.target === challengeOverlay) onCancel();
            }

            challengeOk.addEventListener("click", onOk);
            challengeCancel.addEventListener("click", onCancel);
            challengeOverlay.addEventListener("click", onOverlay);
        });
    }

    async function onSaveGroupClick() {
        if (!isSaveGroupEnabled()) return;

        if (RequireChallenge) {
            const ok = await triggerChallengeModal();
            if (!ok) return;
        }

        const payload = {
            name: newName.value.trim(),
            maxHr: clampInt(newHr.value, 0, 23),
            maxMin: clampInt(newMin.value, 0, 59),
            sitesText: newSites.value,
        };

        // Placeholder: sau này gắn chrome.storage / API
        console.log("[blocked-sites] save group (mock)", payload);

        newSave.textContent = "Saved";
        newSave.classList.add("is-success-flash");
        window.setTimeout(() => {
            newSave.textContent = "Save group";
            newSave.classList.remove("is-success-flash");
            closeNewGroupModal();
        }, 600);
    }

    function wirePlaceholderLinks() {
        document.querySelectorAll("[data-placeholder-link]").forEach((a) => {
            a.addEventListener("click", (e) => {
                e.preventDefault();
            });
        });
    }

    function init() {
        addGroupBtn?.addEventListener("click", openNewGroupModal);
        newCancel?.addEventListener("click", closeNewGroupModal);
        newSave?.addEventListener("click", () => onSaveGroupClick());

        newOverlay?.addEventListener("click", (e) => {
            if (e.target === newOverlay) closeNewGroupModal();
        });

        newName?.addEventListener("input", updateSaveGroupButton);
        newHr?.addEventListener("input", updateModalTimerVisual);
        newMin?.addEventListener("input", updateModalTimerVisual);

        wirePlaceholderLinks();
        updateModalTimerVisual();
    }

    init();
})();
