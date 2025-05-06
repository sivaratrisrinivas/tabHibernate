// TabHibernate - Background Script
// Handles tab monitoring, inactivity detection, and tab unloading with adaptive behavior

const IMPORTANCE_INTERACTION_WEIGHT = 1.5;
const IMPORTANCE_THRESHOLD_SKIP_HIBERNATE = 10; // Score above which a tab might be skipped
const IMPORTANCE_THRESHOLD_AUTO_EXCLUDE = 20; // Score above which a domain might be auto-excluded
const LEARNING_PERIOD_DURATION_MINUTES = 24 * 60; // 24 hours

// Default settings
const DEFAULT_SETTINGS = {
    inactivityThreshold: 10, // minutes
    excludePinnedTabs: true,
    excludedDomains: [],
    enabled: true,
    showIndicators: true,
    adaptiveMode: true,
    learningPeriod: true,
    learningPeriodStartTime: 0, // Timestamp for when the current learning period started
};

// Store for tab activity timestamps and usage patterns
const tabActivity = {};
const tabUsagePatterns = {};
let settings = { ...DEFAULT_SETTINGS };
// let systemMemoryInfo = { available: 0, total: 0 }; // Removed, was unused

// Initialize extension
async function initialize() {
    // console.log("Initializing TabHibernate with adaptive behavior");

    const storedData = await chrome.storage.local.get(["settings", "usagePatterns"]);
    if (storedData.settings) {
        settings = { ...DEFAULT_SETTINGS, ...storedData.settings };
    } else {
        // First run or cleared storage
        settings = { ...DEFAULT_SETTINGS };
        if (settings.adaptiveMode && settings.learningPeriod) {
            settings.learningPeriodStartTime = Date.now();
        }
        await chrome.storage.local.set({ settings });
    }

    // Ensure learningPeriodStartTime is set if learning is active but start time is missing
    if (settings.adaptiveMode && settings.learningPeriod && !settings.learningPeriodStartTime) {
        settings.learningPeriodStartTime = Date.now();
        // No need to await this save, it's not critical for startup flow
        chrome.storage.local.set({ settings });
    }


    if (storedData.usagePatterns) {
        Object.assign(tabUsagePatterns, storedData.usagePatterns);
    }

    const tabs = await chrome.tabs.query({});
    tabs.forEach((tab) => {
        tabActivity[tab.id] = Date.now();
        if (tab.url) {
            trackTabDomain(tab.url); // Will initialize pattern if new, but won't save immediately
        }
    });

    chrome.alarms.create("checkInactiveTabs", { periodInMinutes: 1 });
    chrome.alarms.create("analyzeUsagePatterns", { periodInMinutes: 30 });

    if (settings.adaptiveMode && settings.learningPeriod && settings.learningPeriodStartTime) {
        const alreadyElapsedMinutes = (Date.now() - settings.learningPeriodStartTime) / (1000 * 60);
        const remainingLearningMinutes = Math.max(1, LEARNING_PERIOD_DURATION_MINUTES - alreadyElapsedMinutes);
        chrome.alarms.create("endLearningPeriod", { delayInMinutes: remainingLearningMinutes });
    } else if (settings.adaptiveMode && settings.learningPeriod && !settings.learningPeriodStartTime) {
        // Fallback if start time somehow wasn't set but should be
        chrome.alarms.create("endLearningPeriod", { delayInMinutes: LEARNING_PERIOD_DURATION_MINUTES });
    }
}

// Event Listeners for Tab Activity
chrome.tabs.onActivated.addListener((activeInfo) => {
    tabActivity[activeInfo.tabId] = Date.now()

    // Track how long this tab was inactive before being activated
    chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (tab && tab.url) {
            trackTabActivation(tab.url)
        }
    })
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete") {
        tabActivity[tabId] = Date.now()

        // Track this domain in our usage patterns
        if (tab.url) {
            trackTabDomain(tab.url)
        }
    }
})

chrome.tabs.onRemoved.addListener((tabId) => {
    delete tabActivity[tabId]
    // Clean up stored state
    chrome.storage.local.remove(tabId.toString())
})

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "userActivity" && sender.tab) {
        tabActivity[sender.tab.id] = Date.now()
        if (sender.tab.url) {
            trackTabInteraction(sender.tab.url)
        }
        return false; // No async response needed currently
    } else if (message.type === "manualUnload") {
        checkInactiveTabs(true)
        sendResponse({ success: true }) // Acknowledge manual unload trigger
        return false; // No async response needed currently
    } else if (message.type === "getState" && sender.tab) {
        // Handle request for saved state from content script
        const tabIdStr = sender.tab.id.toString();
        (async () => {
            try {
                const data = await chrome.storage.local.get(tabIdStr);
                if (data && data[tabIdStr]) {
                    // console.log(`[${new Date().toLocaleTimeString()}] Found state for tab ${tabIdStr}`);
                    sendResponse({ state: data[tabIdStr] });
                } else {
                    // console.log(`[${new Date().toLocaleTimeString()}] No state found for tab ${tabIdStr}`);
                    sendResponse({ state: null });
                }
            } catch (e) {
                console.error(`Error getting state for tab ${tabIdStr}:`, e);
                sendResponse({ state: null });
            }
        })();
        return true; // Indicate asynchronous response
    }
    return false;
})

// Track tab domain for usage patterns
function trackTabDomain(url) {
    try {
        const domain = new URL(url).hostname

        if (!tabUsagePatterns[domain]) {
            tabUsagePatterns[domain] = {
                openCount: 0, // Start at 0, increment below
                interactionCount: 0,
                totalActiveTime: 0,
                lastActiveTime: Date.now(), // Set on creation
                importance: 0,
            }
        } else {
            tabUsagePatterns[domain].openCount++
        }

        // Save updated patterns periodically
        // saveUsagePatterns() // Removed: Save less frequently, e.g., via analyzeUsagePatterns alarm
    } catch (e) {
        // console.error("Error tracking tab domain:", e)
    }
}

// Track tab interaction for usage patterns
function trackTabInteraction(url) {
    try {
        const domain = new URL(url).hostname

        if (tabUsagePatterns[domain]) {
            tabUsagePatterns[domain].interactionCount++
            tabUsagePatterns[domain].lastActiveTime = Date.now()
        }
    } catch (e) {
        // console.error("Error tracking tab interaction:", e)
    }
}

// Track tab activation for usage patterns
function trackTabActivation(url) {
    try {
        const domain = new URL(url).hostname

        if (tabUsagePatterns[domain]) {
            const now = Date.now()

            // If we have a last active time, calculate how long this tab was active
            if (tabUsagePatterns[domain].lastActiveTime) {
                const activeTime = now - tabUsagePatterns[domain].lastActiveTime
                tabUsagePatterns[domain].totalActiveTime += activeTime
            }

            tabUsagePatterns[domain].lastActiveTime = now
        }
    } catch (e) {
        // console.error("Error tracking tab activation:", e)
    }
}

// Save usage patterns to storage
async function saveUsagePatterns() {
    try {
        await chrome.storage.local.set({ usagePatterns: tabUsagePatterns })
    } catch (e) {
        // console.error("Error saving usage patterns:", e)
    }
}

// Check for inactive tabs and unload them
async function checkInactiveTabs(manual = false) {
    if (!settings.enabled) return

    const tabs = await chrome.tabs.query({})
    const currentTime = Date.now()
    const currentThreshold = settings.adaptiveMode && !settings.learningPeriod ? getAdaptiveThreshold() : settings.inactivityThreshold;
    const inactivityThresholdMs = currentThreshold * 60 * 1000;

    for (const tab of tabs) {
        // Skip if tab is active or doesn't have a recorded activity
        if (tab.active) {
            continue;
        }
        if (!tabActivity[tab.id]) {
            continue;
        }

        // Skip excluded tabs
        if (settings.excludePinnedTabs && tab.pinned) {
            continue;
        }
        if (isExcludedDomain(tab.url)) {
            continue;
        }

        // Skip important tabs if we're in adaptive mode and not learning
        let importantSkip = false;
        if (settings.adaptiveMode && !settings.learningPeriod) {
            const important = isImportantTab(tab.url);
            if (important) {
                importantSkip = true;
            }
        }
        if (importantSkip) continue;

        // Check if tab is inactive for longer than threshold
        const lastActivity = tabActivity[tab.id];
        const inactiveDuration = currentTime - lastActivity;

        if (inactiveDuration > inactivityThresholdMs) {
            await unloadTab(tab)
        }
    }
}

// Get adaptive threshold based on system memory and usage patterns
function getAdaptiveThreshold() {
    // Base threshold
    let threshold = settings.inactivityThreshold

    // TODO: Future: Adjust threshold based on overall usage patterns or system memory.
    // For now, "adaptive" primarily means skipping important tabs, not changing this value.
    return threshold
}

// Check if a tab is considered important based on usage patterns
function isImportantTab(url) {
    if (!url) return false;
    let score = 0;

    try {
        const domain = new URL(url).hostname;
        if (tabUsagePatterns[domain]) {
            const pattern = tabUsagePatterns[domain];
            score =
                (pattern.interactionCount / Math.max(1, pattern.openCount)) * IMPORTANCE_INTERACTION_WEIGHT +
                (pattern.totalActiveTime / (1000 * 60 * Math.max(1, pattern.openCount)));
        }
    } catch (e) {
        // console.error("Error checking important tab:", e);
    }
    return score > IMPORTANCE_THRESHOLD_SKIP_HIBERNATE;
}

// Check if a URL belongs to an excluded domain
function isExcludedDomain(url) {
    if (!url || !settings.excludedDomains.length) return false

    try {
        const hostname = new URL(url).hostname
        return settings.excludedDomains.some((domain) => hostname.includes(domain))
    } catch (e) {
        // console.error("Error parsing URL:", e)
        return false
    }
}

// Unload a tab and save its state
async function unloadTab(tab) {
    try {
        let response = null;
        try {
            response = await chrome.tabs.sendMessage(tab.id, { type: "saveState" });
        } catch (e) {
            // This catch is for sendMessage failures (e.g. no content script)
            if (e.message.includes("Could not establish connection") || e.message.includes("Receiving end does not exist")) {
                console.warn(`Cannot save state for tab ${tab.id} (no content script): ${tab.url}`);
            } else {
                console.error(`Error sending saveState to tab ${tab.id}:`, e);
            }
        }

        if (response && response.success && response.state) {
            const tabIdStr = tab.id.toString();
            await chrome.storage.local.set({ [tabIdStr]: response.state });
        } else {
            // console.warn(`Could not get valid state for tab ${tab.id}. Response:`, response);
        }

        await chrome.tabs.discard(tab.id);
        // console.log(`Hibernated tab: ${tab.id} - ${tab.title}`);

    } catch (error) { // This catch is for discard errors or other issues in unloadTab
        console.error(`Error hibernating tab ${tab.id} (after attempting state save):`, error);
    }
}

// Analyze usage patterns and update settings accordingly
async function analyzeUsagePatterns() {
    if (!settings.adaptiveMode || settings.learningPeriod) return

    try {
        const domainsToExclude = []

        for (const [domain, pattern] of Object.entries(tabUsagePatterns)) {
            const importanceScore =
                (pattern.interactionCount / Math.max(1, pattern.openCount)) * IMPORTANCE_INTERACTION_WEIGHT +
                (pattern.totalActiveTime / (1000 * 60 * Math.max(1, pattern.openCount)));
            pattern.importance = importanceScore;

            if (importanceScore > IMPORTANCE_THRESHOLD_AUTO_EXCLUDE && !settings.excludedDomains.includes(domain)) {
                domainsToExclude.push(domain);
            }
        }

        if (domainsToExclude.length > 0) {
            settings.excludedDomains = [...new Set([...settings.excludedDomains, ...domainsToExclude])];
            await chrome.storage.local.set({ settings }); // Save updated settings
        }
        saveUsagePatterns(); // Save updated importance scores in patterns
    } catch (e) {
        console.error("Error analyzing usage patterns:", e)
    }
}

// End learning period
async function endLearningPeriod() {
    if (settings.adaptiveMode && settings.learningPeriod) {
        settings.learningPeriod = false;
        // settings.learningPeriodStartTime = 0; // Reset start time or keep for historical? Let's reset.
        await chrome.storage.local.set({ settings });
        console.log("Learning period ended, adaptive mode fully active.");
        analyzeUsagePatterns(); // Run analysis once learning ends
    }
}

// Listen for alarm to check inactive tabs
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "checkInactiveTabs") {
        checkInactiveTabs()
    } else if (alarm.name === "analyzeUsagePatterns") {
        analyzeUsagePatterns()
    } else if (alarm.name === "endLearningPeriod") {
        endLearningPeriod()
    }
})

// Listen for settings changes
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings) {
        const oldSettings = settings;
        settings = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };

        // If adaptive mode was just turned on AND learning period is true
        // (or if learning period was just turned on while adaptive mode is also on)
        // then (re)set the learning start time and the alarm.
        const newAdaptive = settings.adaptiveMode;
        const oldAdaptive = oldSettings.adaptiveMode;
        const newLearning = settings.learningPeriod;
        const oldLearning = oldSettings.learningPeriod;

        let updateLearningAlarm = false;

        if (newAdaptive && newLearning) {
            if ((!oldAdaptive && newAdaptive) || (!oldLearning && newLearning) || !settings.learningPeriodStartTime) {
                settings.learningPeriodStartTime = Date.now();
                chrome.storage.local.set({ settings }); // Save the updated start time
                updateLearningAlarm = true;
                console.log("Learning period initiated/reset by settings change.");
            }
        }

        if (updateLearningAlarm || (newAdaptive && newLearning && oldSettings.learningPeriodStartTime !== settings.learningPeriodStartTime)) {
            chrome.alarms.get("endLearningPeriod", (existingAlarm) => {
                if (existingAlarm) chrome.alarms.clear("endLearningPeriod");
                const alreadyElapsedMinutes = settings.learningPeriodStartTime ? (Date.now() - settings.learningPeriodStartTime) / (1000 * 60) : 0;
                const remainingLearningMinutes = Math.max(1, LEARNING_PERIOD_DURATION_MINUTES - alreadyElapsedMinutes);
                chrome.alarms.create("endLearningPeriod", { delayInMinutes: remainingLearningMinutes });
            });
        } else if (!newLearning || !newAdaptive) { // If learning or adaptive turned off, clear alarm
            chrome.alarms.clear("endLearningPeriod");
        }
    }
    if (area === "local" && changes.usagePatterns) {
        Object.assign(tabUsagePatterns, changes.usagePatterns.newValue);
    }
})

// Initialize when the extension is installed or updated
chrome.runtime.onInstalled.addListener(initialize)

// Initialize when the background script starts
initialize()
