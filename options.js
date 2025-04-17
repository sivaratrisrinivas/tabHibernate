// TabHibernate - Options Page Script

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
newDomainInput.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
        addDomain()
    }
})

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
        emptyItem.style.color = "var(--gray-500)"
        emptyItem.style.fontStyle = "italic"
        emptyItem.style.padding = "var(--space-8) var(--space-16)"
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
        showToast("Please enter a valid domain", "error")
        return
    }

    // Check if domain already exists
    if (currentSettings.excludedDomains.includes(domain)) {
        showToast("This domain is already in the list", "warning")
        return
    }

    // Add domain to the list
    currentSettings.excludedDomains.push(domain)

    // Clear input and update UI
    newDomainInput.value = ""
    renderDomainList()
    showToast(`Added ${domain} to excluded domains`, "success")
}

// Render the list of excluded domains
function renderDomainList() {
    domainList.innerHTML = ""

    if (currentSettings.excludedDomains.length === 0) {
        const emptyItem = document.createElement("li")
        emptyItem.textContent = "No domains added"
        emptyItem.style.color = "var(--gray-500)"
        emptyItem.style.fontStyle = "italic"
        emptyItem.style.textAlign = "center"
        emptyItem.style.padding = "var(--space-12) var(--space-16)"
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
    showToast(`Removed ${domain} from excluded domains`, "info")
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
        showToast("Settings saved successfully!", "success")

        // Visual feedback on save button
        const saveButton = document.getElementById("saveSettings")
        const originalText = saveButton.textContent
        saveButton.textContent = "Saved!"
        saveButton.style.backgroundColor = "var(--success)"

        setTimeout(() => {
            saveButton.textContent = originalText
            saveButton.style.backgroundColor = ""
        }, 1500)
    } catch (error) {
        console.error("Error saving settings:", error)
        showToast("Error saving settings. Please try again.", "error")
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

        showToast("Settings reset to defaults", "info")
    }
}

// Update statistics display
async function updateStatistics() {
    try {
        // Check if chrome is available
        if (typeof chrome === "undefined" || typeof chrome.tabs === "undefined") {
            console.warn("chrome.tabs is not available. Running in a non-extension environment?")
            // Mock chrome object for testing purposes
            window.chrome = window.chrome || {}
            chrome.tabs = chrome.tabs || {
                query: (options, callback) => {
                    console.warn("Mock chrome.tabs.query called. Returning empty array.")
                    callback([])
                },
            }
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

        // Update UI with animation
        animateCounter(totalTabsElement, totalTabs)
        animateCounter(unloadedTabsElement, unloadedTabs)
        animateCounter(memorySavedElement, memorySaved, " MB")

        // Update every 10 seconds
        setTimeout(updateStatistics, 10000)
    } catch (error) {
        console.error("Error updating statistics:", error)
    }
}

// Animate counter from current to target value
function animateCounter(element, targetValue, suffix = "") {
    const currentValue = Number.parseInt(element.textContent) || 0
    const duration = 800 // ms
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

// Show toast notification
function showToast(message, type = "info") {
    // Create toast container if it doesn't exist
    let toastContainer = document.querySelector(".toast-container")
    if (!toastContainer) {
        toastContainer = document.createElement("div")
        toastContainer.className = "toast-container"
        document.body.appendChild(toastContainer)

        // Add styles
        const style = document.createElement("style")
        style.textContent = `
        .toast-container {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 1000;
        }
        
        .toast {
          padding: 12px 16px;
          margin-top: 8px;
          border-radius: 6px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          display: flex;
          align-items: center;
          font-size: 14px;
          min-width: 250px;
          max-width: 350px;
          animation: toast-in 0.3s ease-out forwards;
          color: white;
        }
        
        .toast.success {
          background-color: var(--success);
        }
        
        .toast.error {
          background-color: var(--error);
        }
        
        .toast.warning {
          background-color: var(--warning);
        }
        
        .toast.info {
          background-color: var(--info);
        }
        
        .toast-icon {
          margin-right: 12px;
        }
        
        .toast-message {
          flex: 1;
        }
        
        .toast-close {
          background: none;
          border: none;
          color: white;
          opacity: 0.7;
          cursor: pointer;
          font-size: 16px;
          padding: 0 4px;
        }
        
        .toast-close:hover {
          opacity: 1;
        }
        
        @keyframes toast-in {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        
        @keyframes toast-out {
          from {
            transform: translateY(0);
            opacity: 1;
          }
          to {
            transform: translateY(100%);
            opacity: 0;
          }
        }
      `
        document.head.appendChild(style)
    }

    // Create toast element
    const toast = document.createElement("div")
    toast.className = `toast ${type}`

    // Icon based on type
    let iconSvg = ""
    switch (type) {
        case "success":
            iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`
            break
        case "error":
            iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`
            break
        case "warning":
            iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`
            break
        default:
            iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
    }

    toast.innerHTML = `
      <div class="toast-icon">${iconSvg}</div>
      <div class="toast-message">${message}</div>
      <button class="toast-close">&times;</button>
    `

    // Add to container
    toastContainer.appendChild(toast)

    // Close button functionality
    const closeButton = toast.querySelector(".toast-close")
    closeButton.addEventListener("click", () => {
        removeToast(toast)
    })

    // Auto remove after 3 seconds
    setTimeout(() => {
        removeToast(toast)
    }, 3000)
}

// Remove toast with animation
function removeToast(toast) {
    toast.style.animation = "toast-out 0.3s forwards"
    setTimeout(() => {
        toast.remove()
    }, 300)
}
