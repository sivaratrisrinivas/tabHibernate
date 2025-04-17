// Tab Memory Manager - Background Script
// Handles tab monitoring, inactivity detection, and tab unloading with adaptive behavior

// Default settings - these will be adjusted automatically based on usage patterns
const DEFAULT_SETTINGS = {
    inactivityThreshold: 10, // minutes - will be adjusted automatically
    excludePinnedTabs: true,
    excludedDomains: [],
    enabled: true,
    showIndicators: true,
    adaptiveMode: true, // New setting for adaptive behavior
    learningPeriod: true, // Initial learning period active
}

// Store for tab activity timestamps and usage patterns
const tabActivity = {}
const tabUsagePatterns = {}
let settings = DEFAULT_SETTINGS
let systemMemoryInfo = { available: 0, total: 0 }

// Initialize extension
async function initialize() {
    console.log("Initializing Tab Memory Manager with adaptive behavior")

    // Load settings
    const storedSettings = await chrome.storage.local.get(["settings", "usagePatterns"])
    if (storedSettings.settings) {
        settings = { ...DEFAULT_SETTINGS, ...storedSettings.settings }
    } else {
        await chrome.storage.local.set({ settings: DEFAULT_SETTINGS })
    }

    if (storedSettings.usagePatterns) {
        Object.assign(tabUsagePatterns, storedSettings.usagePatterns)
    }

    // Initialize tab activity for existing tabs
    const tabs = await chrome.tabs.query({})
    tabs.forEach((tab) => {
        tabActivity[tab.id] = Date.now()

        // Start tracking this tab's usage pattern
        if (tab.url) {
            trackTabDomain(tab.url)
        }
    })

    // Set up periodic check for inactive tabs
    chrome.alarms.create("checkInactiveTabs", {
        periodInMinutes: 1,
    })

    // Set up periodic analysis of usage patterns
    chrome.alarms.create("analyzeUsagePatterns", {
        periodInMinutes: 30, // Analyze every 30 minutes
    })

    // Check system memory periodically
    chrome.alarms.create("checkSystemMemory", {
        periodInMinutes: 5,
    })

    // If in learning period, set an alarm to end it after 24 hours
    if (settings.learningPeriod) {
        chrome.alarms.create("endLearningPeriod", {
            delayInMinutes: 1440, // 24 hours
        })
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

        // Track interaction with this domain
        if (sender.tab.url) {
            trackTabInteraction(sender.tab.url)
        }
    } else if (message.type === "manualUnload") {
        checkInactiveTabs(true)
    } else if (message.type === "getState" && sender.tab) {
        // Handle request for saved state
        const tabIdStr = sender.tab.id.toString();
        (async () => {
            try {
                const data = await chrome.storage.local.get(tabIdStr);
                if (data && data[tabIdStr]) {
                    console.log(`Found state for tab ${tabIdStr}:`, data[tabIdStr]);
                    sendResponse({ state: data[tabIdStr] });
                } else {
                    console.log(`No state found for tab ${tabIdStr}`);
                    sendResponse({ state: null }); // Explicitly send null
                }
            } catch (e) {
                console.error(`Error getting state for tab ${tabIdStr}:`, e);
                sendResponse({ state: null }); // Send null on error
            }
        })();
        return true; // Indicate asynchronous response
    }
    return true; // If not handling asynchronously, return false or undefined
})

// Track tab domain for usage patterns
function trackTabDomain(url) {
    try {
        const domain = new URL(url).hostname

        if (!tabUsagePatterns[domain]) {
            tabUsagePatterns[domain] = {
                openCount: 1,
                interactionCount: 0,
                totalActiveTime: 0,
                lastActiveTime: Date.now(),
                importance: 0,
            }
        } else {
            tabUsagePatterns[domain].openCount++
        }

        // Save updated patterns periodically
        saveUsagePatterns()
    } catch (e) {
        console.error("Error tracking tab domain:", e)
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
        console.error("Error tracking tab interaction:", e)
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
        console.error("Error tracking tab activation:", e)
    }
}

// Save usage patterns to storage
async function saveUsagePatterns() {
    try {
        await chrome.storage.local.set({ usagePatterns: tabUsagePatterns })
    } catch (e) {
        console.error("Error saving usage patterns:", e)
    }
}

// Check for inactive tabs and unload them
async function checkInactiveTabs(manual = false) {
    if (!settings.enabled) return

    const tabs = await chrome.tabs.query({})
    const currentTime = Date.now()

    // Get adaptive threshold based on system memory if not in manual mode
    let inactivityThresholdMs

    if (manual) {
        // For manual unloading, use a shorter threshold
        inactivityThresholdMs = 5 * 60 * 1000 // 5 minutes
    } else if (settings.adaptiveMode && !settings.learningPeriod) {
        // Use adaptive threshold based on system memory and usage patterns
        inactivityThresholdMs = getAdaptiveThreshold() * 60 * 1000
    } else {
        // Use the configured threshold
        inactivityThresholdMs = settings.inactivityThreshold * 60 * 1000
    }

    for (const tab of tabs) {
        // Skip if tab is active or doesn't have a recorded activity
        if (tab.active || !tabActivity[tab.id]) continue

        // Skip excluded tabs
        if (settings.excludePinnedTabs && tab.pinned) continue
        if (isExcludedDomain(tab.url)) continue

        // Skip important tabs if we're in adaptive mode
        if (settings.adaptiveMode && isImportantTab(tab.url)) continue

        // Check if tab is inactive for longer than threshold
        const lastActivity = tabActivity[tab.id]
        if (currentTime - lastActivity > inactivityThresholdMs) {
            await unloadTab(tab)
        }
    }
}

// Get adaptive threshold based on system memory and usage patterns
function getAdaptiveThreshold() {
    // Base threshold
    let threshold = settings.inactivityThreshold

    // Adjust based on available memory (lower threshold when memory is low)
    if (systemMemoryInfo.available && systemMemoryInfo.total) {
        const memoryRatio = systemMemoryInfo.available / systemMemoryInfo.total

        if (memoryRatio < 0.2) {
            // Less than 20% memory available - be more aggressive
            threshold = Math.max(5, threshold - 5)
        } else if (memoryRatio > 0.5) {
            // More than 50% memory available - be more lenient
            threshold = Math.min(30, threshold + 5)
        }
    }

    return threshold
}

// Check if a tab is considered important based on usage patterns
function isImportantTab(url) {
    if (!url) return false

    try {
        const domain = new URL(url).hostname

        if (tabUsagePatterns[domain]) {
            // Calculate importance score based on interaction count and active time
            const pattern = tabUsagePatterns[domain]
            const importanceScore =
                pattern.interactionCount / Math.max(1, pattern.openCount) +
                pattern.totalActiveTime / (1000 * 60 * Math.max(1, pattern.openCount))

            // Consider a tab important if score is above threshold
            return importanceScore > 10
        }
    } catch (e) {
        console.error("Error checking important tab:", e)
    }

    return false
}

// Check if a URL belongs to an excluded domain
function isExcludedDomain(url) {
    if (!url || !settings.excludedDomains.length) return false

    try {
        const hostname = new URL(url).hostname
        return settings.excludedDomains.some((domain) => hostname.includes(domain))
    } catch (e) {
        console.error("Error parsing URL:", e)
        return false
    }
}

// Unload a tab and save its state
async function unloadTab(tab) {
    try {
        // First, save the tab state by sending a message and awaiting the response
        console.log(`Requesting state save for tab ${tab.id}`);
        const response = await chrome.tabs.sendMessage(tab.id, { type: "saveState" });

        // Check if state was successfully received and save it
        if (response && response.success && response.state) {
            const tabIdStr = tab.id.toString();
            await chrome.storage.local.set({ [tabIdStr]: response.state });
            console.log(`Saved state for tab ${tab.id}:`, response.state);
        } else {
            console.warn(`Could not save state for tab ${tab.id}. Response:`, response);
        }

        // Then discard the tab (only after attempting to save state)
        await chrome.tabs.discard(tab.id);
        console.log(`Unloaded tab: ${tab.id} - ${tab.title}`);

        // Optionally, remove the state from storage after discarding if it's no longer needed
        // await chrome.storage.local.remove(tab.id.toString());

    } catch (error) {
        // Check if the error is because the content script isn't available (e.g., chrome:// pages)
        if (error.message.includes("Could not establish connection") || error.message.includes("Receiving end does not exist")) {
            console.warn(`Cannot save state for tab ${tab.id} (likely a protected page or content script issue): ${tab.url}`);
            // Discard anyway if saving state failed because the content script isn't there
            try {
                await chrome.tabs.discard(tab.id);
                console.log(`Unloaded tab without saved state: ${tab.id} - ${tab.title}`);
            } catch (discardError) {
                console.error(`Error discarding tab ${tab.id} after state save failure:`, discardError);
            }
        } else {
            console.error(`Error unloading tab ${tab.id}:`, error);
        }
    }
}

// Analyze usage patterns and update settings accordingly
async function analyzeUsagePatterns() {
    if (!settings.adaptiveMode || settings.learningPeriod) return

    try {
        // Identify frequently used domains that should be excluded
        const domainsToExclude = []

        for (const [domain, pattern] of Object.entries(tabUsagePatterns)) {
            // Calculate importance score
            const importanceScore =
                pattern.interactionCount / Math.max(1, pattern.openCount) +
                pattern.totalActiveTime / (1000 * 60 * Math.max(1, pattern.openCount))

            // Update importance score in the pattern
            pattern.importance = importanceScore

            // If domain is very important and not already excluded, add it
            if (importanceScore > 20 && !settings.excludedDomains.includes(domain)) {
                domainsToExclude.push(domain)
            }
        }

        // Update excluded domains if we found new ones
        if (domainsToExclude.length > 0) {
            settings.excludedDomains = [...new Set([...settings.excludedDomains, ...domainsToExclude])]
            await chrome.storage.local.set({ settings })
            console.log("Automatically added excluded domains:", domainsToExclude)
        }

        // Save updated patterns
        saveUsagePatterns()
    } catch (e) {
        console.error("Error analyzing usage patterns:", e)
    }
}

// Check system memory
async function checkSystemMemory() {
    try {
        // Chrome doesn't provide direct memory API, but we can use performance API
        if (performance && performance.memory) {
            systemMemoryInfo = {
                total: performance.memory.jsHeapSizeLimit,
                available: performance.memory.jsHeapSizeLimit - performance.memory.usedJSHeapSize,
            }
        }
    } catch (e) {
        console.error("Error checking system memory:", e)
    }
}

// End learning period
async function endLearningPeriod() {
    if (settings.learningPeriod) {
        settings.learningPeriod = false
        await chrome.storage.local.set({ settings })
        console.log("Learning period ended, adaptive mode fully active")

        // Run initial analysis
        analyzeUsagePatterns()
    }
}

// Listen for alarm to check inactive tabs
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "checkInactiveTabs") {
        checkInactiveTabs()
    } else if (alarm.name === "analyzeUsagePatterns") {
        analyzeUsagePatterns()
    } else if (alarm.name === "checkSystemMemory") {
        checkSystemMemory()
    } else if (alarm.name === "endLearningPeriod") {
        endLearningPeriod()
    }
})

// Listen for settings changes
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings) {
        settings = changes.settings.newValue
    }
})

// Initialize when the extension is installed or updated
chrome.runtime.onInstalled.addListener(initialize)

// Initialize when the background script starts
initialize()
