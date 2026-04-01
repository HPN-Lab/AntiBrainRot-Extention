'use strict';

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.get(['inAppBlockingSettings'], (data) => {
        if (!data.inAppBlockingSettings) {
            chrome.storage.sync.set({
                inAppBlockingSettings: {
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
                    facebook: {
                        hideStories: false,
                        hideReels: true,
                        hideMarketplace: false,
                        blackWhiteMode: false,
                    },
                },
            });
        }
    });
});
