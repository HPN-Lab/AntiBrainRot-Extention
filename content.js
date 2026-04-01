'use strict';

(function () {
    const OVERLAY_ID = 'vmu-doom-overlay';
    const ROOT_ATTRIBUTE = 'vmu-blocked';
    let bodyObserver = null;

    function hideBodyIfPresent() {
        if (!(document.body instanceof HTMLBodyElement)) {
            return;
        }

        document.body.style.setProperty('display', 'none', 'important');
    }

    function injectOverlay() {
        if (document.getElementById(OVERLAY_ID)) {
            return;
        }

        document.documentElement.setAttribute(ROOT_ATTRIBUTE, 'true');
        document.documentElement.style.setProperty('overflow', 'hidden', 'important');

        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.setAttribute('role', 'alertdialog');
        overlay.setAttribute('aria-modal', 'true');

        const panel = document.createElement('div');
        panel.className = 'vmu-doom-panel';

        const eyebrow = document.createElement('p');
        eyebrow.className = 'vmu-doom-eyebrow';
        eyebrow.textContent = 'VMU - AntiDoom';

        const title = document.createElement('h1');
        title.className = 'vmu-doom-title';
        title.textContent = 'TRUY CAP BI TU CHOI';

        const message = document.createElement('p');
        message.className = 'vmu-doom-message';
        message.textContent = 'Trang web nay da bi khoa vi ban da het thoi gian truy cap.';

        const submessage = document.createElement('p');
        submessage.className = 'vmu-doom-submessage';
        submessage.textContent = 'Quay lai hoc di!';

        panel.appendChild(eyebrow);
        panel.appendChild(title);
        panel.appendChild(message);
        panel.appendChild(submessage);
        overlay.appendChild(panel);

        document.documentElement.appendChild(overlay);
        hideBodyIfPresent();

        if (bodyObserver) {
            bodyObserver.disconnect();
        }

        bodyObserver = new MutationObserver(() => {
            hideBodyIfPresent();
        });

        bodyObserver.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });
    }

    function checkCurrentUrl() {
        chrome.runtime.sendMessage(
            {
                type: 'checkURL',
                url: window.location.href,
            },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error('[CS:CHECK_URL]', chrome.runtime.lastError);
                    return;
                }

                if (response?.isBlocked === true) {
                    injectOverlay();
                }
            }
        );
    }

    checkCurrentUrl();
})();
