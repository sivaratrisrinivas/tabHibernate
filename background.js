// TabHibernate - Background Script
// Handles tab monitoring, inactivity detection, and tab unloading with adaptive behavior

// Default settings - these will be adjusted automatically based on usage patterns
const DEFAULT_SETTINGS = {
    inactivityThreshold: 0.1, // minutes - Temporary low value for testing!
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
    console.log("Initializing TabHibernate with adaptive behavior")

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

        sendResponse({ success: true })
    } else if (message.type === "manualUnload") {
        checkInactiveTabs(true)
        sendResponse({ success: true })
    }
    return true
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
    const currentThreshold = settings.adaptiveMode && !settings.learningPeriod ? getAdaptiveThreshold() : settings.inactivityThreshold;
    const inactivityThresholdMs = currentThreshold * 60 * 1000;

    console.log(`--- Running checkInactiveTabs at ${new Date().toLocaleTimeString()} --- Threshold: ${currentThreshold} min (${inactivityThresholdMs}ms) ---`);

    for (const tab of tabs) {
        console.log(`Checking Tab ${tab.id}: ${tab.title || tab.url}`);
        // Skip if tab is active or doesn't have a recorded activity
        if (tab.active) {
            console.log(`  - Skipping: Tab is active.`);
            continue;
        }
        if (!tabActivity[tab.id]) {
            console.log(`  - Skipping: No activity recorded.`);
            continue;
        }

        // Skip excluded tabs
        if (settings.excludePinnedTabs && tab.pinned) {
            console.log(`  - Skipping: Pinned tab.`);
            continue;
        }
        if (isExcludedDomain(tab.url)) {
            console.log(`  - Skipping: Domain excluded.`);
            continue;
        }

        // Skip important tabs if we're in adaptive mode and not learning
        let importantSkip = false;
        if (settings.adaptiveMode && !settings.learningPeriod) {
            const important = isImportantTab(tab.url);
            if (important) {
                console.log(`  - Skipping: Considered important (Adaptive Mode).`);
                importantSkip = true;
            }
        }
        if (importantSkip) continue;

        // Check if tab is inactive for longer than threshold
        const lastActivity = tabActivity[tab.id];
        const inactiveDuration = currentTime - lastActivity;
        console.log(`  - Last Activity: ${new Date(lastActivity).toLocaleTimeString()} (${Math.round(inactiveDuration / 1000)}s ago)`);

        if (inactiveDuration > inactivityThresholdMs) {
            console.log(`  - RESULT: Inactive duration (${Math.round(inactiveDuration / 1000)}s) > threshold (${Math.round(inactivityThresholdMs / 1000)}s). UNLOADING.`);
            await unloadTab(tab)
        } else {
            console.log(`  - RESULT: Inactive duration (${Math.round(inactiveDuration / 1000)}s) <= threshold (${Math.round(inactivityThresholdMs / 1000)}s). Keeping.`);
        }
    }
    console.log(`--- Finished checkInactiveTabs ---`);
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
    if (!url) return false;
    let score = 0; // Default score
    let reason = "No pattern data";

    try {
        const domain = new URL(url).hostname;

        if (tabUsagePatterns[domain]) {
            // Calculate importance score based on interaction count and active time
            const pattern = tabUsagePatterns[domain];
            // Give slightly more weight to interaction count
            score =
                (pattern.interactionCount / Math.max(1, pattern.openCount)) * 1.5 +
                (pattern.totalActiveTime / (1000 * 60 * Math.max(1, pattern.openCount)));
            reason = `Score: ${score.toFixed(2)} (Interactions: ${pattern.interactionCount}, Open: ${pattern.openCount}, ActiveMin: ${Math.round(pattern.totalActiveTime / 60000)})`;
        } else {
            reason = `No pattern data for domain: ${domain}`;
        }
    } catch (e) {
        console.error("Error checking important tab:", e);
        reason = "Error during check";
    }

    const isImportant = score > 10; // Threshold for importance
    // Log the check details only if adaptive mode is relevant
    if (settings.adaptiveMode && !settings.learningPeriod) {
        console.log(`  - Importance Check for ${url}: ${isImportant} (${reason})`);
    }
    return isImportant;
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
        // First, save the tab state by injecting a content script
        await chrome.tabs.sendMessage(tab.id, { type: "saveState" })

        // Then discard the tab
        await chrome.tabs.discard(tab.id)

        console.log(`Hibernated tab: ${tab.id} - ${tab.title}`)
    } catch (error) {
        console.error(`Error hibernating tab ${tab.id}:`, error)
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
