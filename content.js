// Tab Memory Manager - Content Script
// Handles saving and restoring tab state

// Track user activity
function trackActivity() {
    const events = ["mousedown", "keydown", "scroll", "touchstart"]

    const reportActivity = debounce(() => {
        chrome.runtime.sendMessage({ type: "userActivity" })
    }, 1000)

    events.forEach((event) => {
        window.addEventListener(event, reportActivity, { passive: true })
    })
}

// Save the current tab state
function saveTabState() {
    const state = {
        url: window.location.href,
        scroll: window.scrollY,
        timestamp: Date.now(),
    }

    // State is sent back via sendResponse in the listener
    return state
}

// Restore the tab state
function restoreTabState() {
    // We need to wait for the page to fully load before restoring scroll position
    const attemptRestore = () => {
        chrome.runtime.sendMessage({ type: "getState" }, (response) => {
            // Add error checking
            if (chrome.runtime.lastError) {
                console.warn("Error getting tab state:", chrome.runtime.lastError.message);
                return;
            }
            if (response && response.state && typeof response.state.scroll === 'number') {
                console.log("Restoring scroll position to:", response.state.scroll);
                window.scrollTo(0, response.state.scroll);
            } else {
                console.log("No state found or state format incorrect for restoring scroll.");
            }
        });
    };

    if (document.readyState === "complete") {
        attemptRestore();
    } else {
        window.addEventListener("load", attemptRestore);
    }
}

// Debounce function to limit the frequency of events
function debounce(func, wait) {
    let timeout
    return function () {
        const args = arguments
        clearTimeout(timeout)
        timeout = setTimeout(() => {
            func.apply(this, args)
        }, wait)
    }
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "saveState") {
        const state = saveTabState()
        sendResponse({ success: true, state })
    }
    return true
})

// Initialize
trackActivity()
restoreTabState()
