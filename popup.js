// Tab Memory Manager - Popup Script

// DOM Elements
const enableToggle = document.getElementById("enableToggle")
const statusText = document.getElementById("statusText")
const totalTabsElement = document.getElementById("totalTabs")
const unloadedTabsElement = document.getElementById("unloadedTabs")
const memorySavedElement = document.getElementById("memorySaved")
const tabStatusElement = document.getElementById("tabStatus")
const lastActiveElement = document.getElementById("lastActive")
const unloadButton = document.getElementById("unloadButton")
const settingsButton = document.getElementById("settingsButton")
const adaptiveStatusElement = document.getElementById("adaptiveStatus")

// Current settings and state
let settings = {}
let tabActivity = {}
let usagePatterns = {}

// Initialize popup
document.addEventListener("DOMContentLoaded", initialize)

// Event listeners
enableToggle.addEventListener("change", toggleExtension)
unloadButton.addEventListener("click", unloadInactiveTabs)
settingsButton.addEventListener("click", openSettings)

// Initialize the popup
async function initialize() {
    try {
        // Load settings
        const data = await chrome.storage.local.get(["settings", "tabActivity", "usagePatterns"])
        settings = data.settings || { enabled: true, adaptiveMode: true }
        tabActivity = data.tabActivity || {}
        usagePatterns = data.usagePatterns || {}

        // Update UI based on settings
        enableToggle.checked = settings.enabled
        statusText.textContent = settings.enabled ? "Enabled" : "Disabled"

        // Update adaptive mode status if present
        if (adaptiveStatusElement) {
            if (settings.adaptiveMode) {
                if (settings.learningPeriod) {
                    adaptiveStatusElement.textContent = "Learning"
                    adaptiveStatusElement.className = "status learning"
                } else {
                    adaptiveStatusElement.textContent = "Adaptive"
                    adaptiveStatusElement.className = "status adaptive"
                }
            } else {
                adaptiveStatusElement.textContent = "Manual"
                adaptiveStatusElement.className = "status manual"
            }
        }

        // Update statistics
        updateStatistics()

        // Get current tab info
        updateCurrentTabInfo()
    } catch (error) {
        console.error("Error initializing popup:", error)
    }
}

// Toggle extension enabled/disabled
async function toggleExtension() {
    try {
        settings.enabled = enableToggle.checked
        statusText.textContent = settings.enabled ? "Enabled" : "Disabled"

        // Save settings
        await chrome.storage.local.set({ settings })
    } catch (error) {
        console.error("Error toggling extension:", error)
    }
}

// Update statistics display
async function updateStatistics() {
    try {
        const tabs = await chrome.tabs.query({})
        const totalTabs = tabs.length

        // Count discarded tabs
        const unloadedTabs = tabs.filter((tab) => tab.discarded).length

        // Estimate memory saved (rough estimate: ~50MB per unloaded tab)
        const memorySaved = unloadedTabs * 50

        // Update UI
        totalTabsElement.textContent = totalTabs
        unloadedTabsElement.textContent = unloadedTabs
        memorySavedElement.textContent = `${memorySaved} MB`
    } catch (error) {
        console.error("Error updating statistics:", error)
    }
}

// Update current tab information
async function updateCurrentTabInfo() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

        if (tab) {
            // Check if tab is discarded
            if (tab.discarded) {
                tabStatusElement.textContent = "Unloaded"
                tabStatusElement.style.color = "var(--warning-color)"
            } else {
                tabStatusElement.textContent = "Active"
                tabStatusElement.style.color = "var(--success-color)"
            }

            // Get last active time
            const lastActive = tabActivity[tab.id] || Date.now()
            const timeDiff = Date.now() - lastActive

            if (timeDiff < 60000) {
                // Less than a minute
                lastActiveElement.textContent = "Just now"
            } else if (timeDiff < 3600000) {
                // Less than an hour
                const minutes = Math.floor(timeDiff / 60000)
                lastActiveElement.textContent = `${minutes} minute${minutes !== 1 ? "s" : ""} ago`
            } else {
                // Hours or more
                const hours = Math.floor(timeDiff / 3600000)
                lastActiveElement.textContent = `${hours} hour${hours !== 1 ? "s" : ""} ago`
            }

            // Show domain importance if available
            if (tab.url && settings.adaptiveMode) {
                try {
                    const domain = new URL(tab.url).hostname
                    if (usagePatterns[domain]) {
                        const importance = usagePatterns[domain].importance || 0

                        // Add importance info to the tab info section
                        const tabInfo = document.getElementById("currentTabInfo")
                        const importanceElement = document.createElement("p")
                        importanceElement.innerHTML = `Importance: <span style="color: ${getImportanceColor(importance)}">${importance.toFixed(1)}</span>`
                        tabInfo.appendChild(importanceElement)
                    }
                } catch (e) {
                    console.error("Error getting domain importance:", e)
                }
            }
        }
    } catch (error) {
        console.error("Error updating current tab info:", error)
    }
}

// Get color based on importance score
function getImportanceColor(importance) {
    if (importance > 15) return "var(--success-color)"
    if (importance > 5) return "var(--warning-color)"
    return "var(--text-secondary)"
}

// Manually unload inactive tabs
async function unloadInactiveTabs() {
    try {
        // Send message to background script
        chrome.runtime.sendMessage({ type: "manualUnload" }, (response) => {
            if (response && response.success) {
                // Update statistics after unloading
                setTimeout(updateStatistics, 500)

                // Show success message
                unloadButton.textContent = "Tabs Unloaded!"
                setTimeout(() => {
                    unloadButton.textContent = "Unload Inactive Tabs"
                }, 1500)
            }
        })
    } catch (error) {
        console.error("Error unloading tabs:", error)
    }
}

// Open settings page
function openSettings() {
    chrome.runtime.openOptionsPage()
}
