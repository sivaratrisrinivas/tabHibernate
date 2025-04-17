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

    chrome.runtime.sendMessage({
        type: "saveState",
        state: state,
    })

    return state
}

// Restore the tab state
function restoreTabState() {
    // We need to wait for the page to fully load before restoring scroll position
    if (document.readyState === "complete") {
        chrome.runtime.sendMessage({ type: "getState" }, (response) => {
            if (response && response.state && response.state.scroll) {
                window.scrollTo(0, response.state.scroll)
            }
        })
    } else {
        window.addEventListener("load", () => {
            chrome.runtime.sendMessage({ type: "getState" }, (response) => {
                if (response && response.state && response.state.scroll) {
                    window.scrollTo(0, response.state.scroll)
                }
            })
        })
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
