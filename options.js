// Tab Memory Manager - Options Page Script

// Default settings
const DEFAULT_SETTINGS = {
    inactivityThreshold: 10, // minutes
    excludePinnedTabs: true,
    excludedDomains: [],
    enabled: true,
    showIndicators: true,
    adaptiveMode: true, // New setting for adaptive behavior
    learningPeriod: true, // Initial learning period active
}

// DOM Elements
const enabledToggle = document.getElementById("enabled")
const adaptiveModeToggle = document.getElementById("adaptiveMode")
const inactivitySlider = document.getElementById("inactivityThreshold")
const thresholdValue = document.getElementById("thresholdValue")
const excludePinnedToggle = document.getElementById("excludePinnedTabs")
const showIndicatorsToggle = document.getElementById("showIndicators")
const newDomainInput = document.getElementById("newDomain")
const addDomainButton = document.getElementById("addDomain")
const domainList = document.getElementById("domainList")
const saveButton = document.getElementById("saveSettings")
const resetButton = document.getElementById("resetSettings")
const totalTabsElement = document.getElementById("totalTabs")
const unloadedTabsElement = document.getElementById("unloadedTabs")
const memorySavedElement = document.getElementById("memorySaved")
const adaptiveStatusElement = document.getElementById("adaptiveStatus")
const learningProgressElement = document.getElementById("learningProgress")
const importantDomainsElement = document.getElementById("importantDomains")

// Current settings
let currentSettings = { ...DEFAULT_SETTINGS }
let usagePatterns = {}

// Load settings when the page loads
document.addEventListener("DOMContentLoaded", loadSettings)

// Event listeners
inactivitySlider.addEventListener("input", updateThresholdDisplay)
addDomainButton.addEventListener("click", addDomain)
saveButton.addEventListener("click", saveSettings)
resetButton.addEventListener("click", resetSettings)
adaptiveModeToggle.addEventListener("change", toggleAdaptiveMode)

// Load settings from storage
async function loadSettings() {
    try {
        // Ensure chrome is available (usually provided by the browser extension environment)
        if (typeof chrome === "undefined" || !chrome.storage) {
            console.warn("chrome.storage is not available. Running in a non-extension environment?")
            return // Or provide a mock implementation for testing
        }

        const data = await chrome.storage.local.get(["settings", "usagePatterns"])
        if (data.settings) {
            currentSettings = { ...DEFAULT_SETTINGS, ...data.settings }

            // Update UI with loaded settings
            enabledToggle.checked = currentSettings.enabled
            adaptiveModeToggle.checked = currentSettings.adaptiveMode || false
            inactivitySlider.value = currentSettings.inactivityThreshold
            thresholdValue.textContent = currentSettings.inactivityThreshold
            excludePinnedToggle.checked = currentSettings.excludePinnedTabs
            showIndicatorsToggle.checked = currentSettings.showIndicators

            // Update adaptive mode UI
            toggleAdaptiveMode()

            // Populate excluded domains
            renderDomainList()
        }

        // Load usage patterns
        if (data.usagePatterns) {
            usagePatterns = data.usagePatterns
            renderImportantDomains()
        }

        // Load statistics
        updateStatistics()

        // Update learning status
        updateLearningStatus()
    } catch (error) {
        console.error("Error loading settings:", error)
    }
}

// Update the threshold display when slider is moved
function updateThresholdDisplay() {
    thresholdValue.textContent = inactivitySlider.value
}

// Toggle adaptive mode UI elements
function toggleAdaptiveMode() {
    const isAdaptive = adaptiveModeToggle.checked

    // Show/hide adaptive-specific elements
    document.getElementById("adaptiveSection").style.display = isAdaptive ? "block" : "none"

    // Disable/enable manual threshold if adaptive mode is on/off
    if (isAdaptive) {
        inactivitySlider.disabled = true
        document.querySelector(".setting-header label[for='inactivityThreshold']").textContent =
            "Base Inactivity Threshold (minutes) - Automatically adjusted"
    } else {
        inactivitySlider.disabled = false
        document.querySelector(".setting-header label[for='inactivityThreshold']").textContent =
            "Inactivity Threshold (minutes)"
    }
}

// Update learning status display
function updateLearningStatus() {
    if (currentSettings.learningPeriod) {
        // Calculate when the learning period started (24 hours ago)
        const startTime = Date.now() - 24 * 60 * 60 * 1000
        const endTime = startTime + 24 * 60 * 60 * 1000
        const currentTime = Date.now()
        const progress = Math.min(100, Math.round(((currentTime - startTime) / (endTime - startTime)) * 100))

        adaptiveStatusElement.textContent = "Learning your browsing habits"
        adaptiveStatusElement.className = "status-learning"

        // Update progress bar
        learningProgressElement.style.width = `${progress}%`
        learningProgressElement.textContent = `${progress}%`
    } else {
        adaptiveStatusElement.textContent = "Fully adaptive"
        adaptiveStatusElement.className = "status-active"

        // Hide progress bar
        document.getElementById("learningProgressContainer").style.display = "none"
    }
}

// Render important domains based on usage patterns
function renderImportantDomains() {
    importantDomainsElement.innerHTML = ""

    // Sort domains by importance
    const sortedDomains = Object.entries(usagePatterns)
        .sort((a, b) => b[1].importance - a[1].importance)
        .slice(0, 5) // Top 5 domains

    if (sortedDomains.length === 0) {
        const emptyItem = document.createElement("li")
        emptyItem.textContent = "No data yet"
        emptyItem.style.color = "var(--text-secondary)"
        emptyItem.style.fontStyle = "italic"
        importantDomainsElement.appendChild(emptyItem)
        return
    }

    sortedDomains.forEach(([domain, pattern]) => {
        const listItem = document.createElement("li")

        const domainText = document.createElement("span")
        domainText.textContent = domain

        const scoreText = document.createElement("span")
        scoreText.textContent = `Score: ${pattern.importance.toFixed(1)}`
        scoreText.className = "domain-score"

        listItem.appendChild(domainText)
        listItem.appendChild(scoreText)
        importantDomainsElement.appendChild(listItem)
    })
}

// Add a new domain to the excluded list
function addDomain() {
    const domain = newDomainInput.value.trim().toLowerCase()

    if (!domain) {
        alert("Please enter a valid domain")
        return
    }

    // Check if domain already exists
    if (currentSettings.excludedDomains.includes(domain)) {
        alert("This domain is already in the list")
        return
    }

    // Add domain to the list
    currentSettings.excludedDomains.push(domain)

    // Clear input and update UI
    newDomainInput.value = ""
    renderDomainList()
}

// Render the list of excluded domains
function renderDomainList() {
    domainList.innerHTML = ""

    if (currentSettings.excludedDomains.length === 0) {
        const emptyItem = document.createElement("li")
        emptyItem.textContent = "No domains added"
        emptyItem.style.color = "var(--text-secondary)"
        emptyItem.style.fontStyle = "italic"
        domainList.appendChild(emptyItem)
        return
    }

    currentSettings.excludedDomains.forEach((domain) => {
        const listItem = document.createElement("li")

        const domainText = document.createElement("span")
        domainText.textContent = domain

        const removeButton = document.createElement("button")
        removeButton.innerHTML = "&times;"
        removeButton.className = "remove-domain"
        removeButton.title = "Remove domain"
        removeButton.addEventListener("click", () => removeDomain(domain))

        listItem.appendChild(domainText)
        listItem.appendChild(removeButton)
        domainList.appendChild(listItem)
    })
}

// Remove a domain from the excluded list
function removeDomain(domain) {
    currentSettings.excludedDomains = currentSettings.excludedDomains.filter((d) => d !== domain)
    renderDomainList()
}

// Save settings to storage
async function saveSettings() {
    try {
        // Ensure chrome is available
        if (typeof chrome === "undefined" || !chrome.storage) {
            console.warn("chrome.storage is not available. Running in a non-extension environment?")
            return
        }

        // Get values from UI
        currentSettings.enabled = enabledToggle.checked
        currentSettings.adaptiveMode = adaptiveModeToggle.checked
        currentSettings.inactivityThreshold = Number.parseInt(inactivitySlider.value)
        currentSettings.excludePinnedTabs = excludePinnedToggle.checked
        currentSettings.showIndicators = showIndicatorsToggle.checked

        // Save to storage
        await chrome.storage.local.set({ settings: currentSettings })

        // Show success message
        const saveButton = document.getElementById("saveSettings")
        const originalText = saveButton.textContent
        saveButton.textContent = "Saved!"
        saveButton.style.backgroundColor = "var(--success-color)"

        setTimeout(() => {
            saveButton.textContent = originalText
            saveButton.style.backgroundColor = ""
        }, 1500)
    } catch (error) {
        console.error("Error saving settings:", error)
        alert("Error saving settings. Please try again.")
    }
}

// Reset settings to defaults
function resetSettings() {
    if (confirm("Are you sure you want to reset all settings to defaults?")) {
        currentSettings = { ...DEFAULT_SETTINGS }

        // Update UI
        enabledToggle.checked = currentSettings.enabled
        adaptiveModeToggle.checked = currentSettings.adaptiveMode
        inactivitySlider.value = currentSettings.inactivityThreshold
        thresholdValue.textContent = currentSettings.inactivityThreshold
        excludePinnedToggle.checked = currentSettings.excludePinnedTabs
        showIndicatorsToggle.checked = currentSettings.showIndicators

        // Update adaptive mode UI
        toggleAdaptiveMode()

        // Clear domains
        renderDomainList()

        // Ensure chrome is available
        if (typeof chrome === "undefined" || !chrome.storage) {
            console.warn("chrome.storage is not available. Running in a non-extension environment?")
            return
        }

        // Save to storage
        chrome.storage.local.set({ settings: currentSettings })
    }
}

// Update statistics display
async function updateStatistics() {
    try {
        // Ensure chrome is available
        if (typeof chrome === "undefined" || !chrome.tabs) {
            console.warn("chrome.tabs is not available. Running in a non-extension environment?")
            return
        }

        // Check if chrome.tabs.query is a function before calling it
        if (typeof chrome.tabs.query !== "function") {
            console.warn("chrome.tabs.query is not a function. Running in a non-extension environment?")
            return
        }

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

        // Update every 5 seconds
        setTimeout(updateStatistics, 5000)
    } catch (error) {
        console.error("Error updating statistics:", error)
    }
}
