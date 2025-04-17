// TabHibernate - Popup Script

// DOM Elements
const enableToggle = document.getElementById("enableToggle")
const statusText = document.getElementById("statusText")
const totalTabsElement = document.getElementById("totalTabs")
const unloadedTabsElement = document.getElementById("unloadedTabs")
const memorySavedElement = document.getElementById("memorySaved")
const tabStatusElement = document.getElementById("tabStatus")
const lastActiveElement = document.getElementById("lastActive")
const tabImportanceElement = document.getElementById("tabImportance")
const unloadButton = document.getElementById("unloadButton")
const settingsButton = document.getElementById("settingsButton")
const adaptiveStatusElement = document.getElementById("adaptiveStatus")
const helpLink = document.getElementById("helpLink")

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
helpLink.addEventListener("click", openHelp)

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

        // Update adaptive mode status
        updateAdaptiveStatus()

        // Update statistics
        updateStatistics()

        // Get current tab info
        updateCurrentTabInfo()
    } catch (error) {
        console.error("Error initializing popup:", error)
    }
}

// Update adaptive mode status display
function updateAdaptiveStatus() {
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

        // Update UI with animation
        animateCounter(totalTabsElement, totalTabs)
        animateCounter(unloadedTabsElement, unloadedTabs)
        animateCounter(memorySavedElement, memorySaved, " MB")
    } catch (error) {
        console.error("Error updating statistics:", error)
    }
}

// Animate counter from current to target value
function animateCounter(element, targetValue, suffix = "") {
    const currentValue = Number.parseInt(element.textContent) || 0
    const duration = 500 // ms
    const stepTime = 20 // ms
    const steps = duration / stepTime
    const increment = (targetValue - currentValue) / steps

    let currentStep = 0
    const timer = setInterval(() => {
        currentStep++
        const newValue = Math.round(currentValue + increment * currentStep)
        element.textContent = newValue + suffix

        if (currentStep >= steps) {
            element.textContent = targetValue + suffix
            clearInterval(timer)
        }
    }, stepTime)
}

// Update current tab information
async function updateCurrentTabInfo() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

        if (tab) {
            // Check if tab is discarded
            if (tab.discarded) {
                tabStatusElement.textContent = "Hibernating"
                tabStatusElement.className = "status-indicator status-hibernating"
            } else {
                tabStatusElement.textContent = "Active"
                tabStatusElement.className = "status-indicator status-active"
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
                        tabImportanceElement.textContent = getImportanceLabel(importance)
                        tabImportanceElement.style.color = getImportanceColor(importance)
                    } else {
                        tabImportanceElement.textContent = "Unknown"
                        tabImportanceElement.style.color = "var(--gray-500)"
                    }
                } catch (e) {
                    console.error("Error getting domain importance:", e)
                    tabImportanceElement.textContent = "Unknown"
                    tabImportanceElement.style.color = "var(--gray-500)"
                }
            } else {
                tabImportanceElement.textContent = settings.adaptiveMode ? "Calculating..." : "N/A"
                tabImportanceElement.style.color = "var(--gray-500)"
            }
        }
    } catch (error) {
        console.error("Error updating current tab info:", error)
    }
}

// Get importance label based on score
function getImportanceLabel(importance) {
    if (importance > 15) return "High"
    if (importance > 5) return "Medium"
    return "Low"
}

// Get color based on importance score
function getImportanceColor(importance) {
    if (importance > 15) return "var(--success)"
    if (importance > 5) return "var(--warning)"
    return "var(--gray-500)"
}

// Manually unload inactive tabs
async function unloadInactiveTabs() {
    try {
        // Show loading state
        unloadButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="animate-spin">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M12 6v6l4 2"></path>
      </svg>
      Processing...
    `
        unloadButton.disabled = true

        // Send message to background script
        chrome.runtime.sendMessage({ type: "manualUnload" }, (response) => {
            if (response && response.success) {
                // Update statistics after unloading
                setTimeout(updateStatistics, 500)

                // Show success message
                unloadButton.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          Tabs Hibernated!
        `

                setTimeout(() => {
                    unloadButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18.364 5.636a9 9 0 1 1-12.728 0"></path>
              <path d="M12 2v8"></path>
            </svg>
            Hibernate Tabs
          `
                    unloadButton.disabled = false
                }, 1500)
            }
        })
    } catch (error) {
        console.error("Error unloading tabs:", error)
        unloadButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18.364 5.636a9 9 0 1 1-12.728 0"></path>
        <path d="M12 2v8"></path>
      </svg>
      Hibernate Tabs
    `
        unloadButton.disabled = false
    }
}

// Open settings page
function openSettings() {
    chrome.runtime.openOptionsPage()
}

// Open help page
function openHelp() {
    chrome.tabs.create({ url: "https://tabhibernate.com/help" })
}

// Add CSS animation for spinner
const style = document.createElement("style")
style.textContent = `
  .animate-spin {
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`
document.head.appendChild(style)
