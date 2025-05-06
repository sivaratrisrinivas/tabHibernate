// TabHibernate - Options Page Script

const LEARNING_PERIOD_DURATION_MINUTES = 24 * 60; // 24 hours, should match background.js

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
    document.getElementById("adaptiveSection").style.display = isAdaptive ? "block" : "none"

    if (isAdaptive) {
        inactivitySlider.disabled = true
        document.querySelector(".setting-header label[for='inactivityThreshold']").textContent =
            "Base Inactivity Threshold (minutes) - Important tabs are prioritized"
    } else {
        inactivitySlider.disabled = false
        document.querySelector(".setting-header label[for='inactivityThreshold']").textContent =
            "Inactivity Threshold (minutes)"
    }
    updateLearningStatus()
}

// Update learning status display
function updateLearningStatus() {
    if (currentSettings.adaptiveMode && currentSettings.learningPeriod && currentSettings.learningPeriodStartTime) {
        const startTime = currentSettings.learningPeriodStartTime;
        const totalDurationMs = LEARNING_PERIOD_DURATION_MINUTES * 60 * 1000;
        const elapsedMs = Date.now() - startTime;
        const progress = Math.min(100, Math.max(0, Math.round((elapsedMs / totalDurationMs) * 100)));

        adaptiveStatusElement.textContent = "Learning your browsing habits";
        adaptiveStatusElement.className = "status-learning";
        document.getElementById("learningProgressContainer").style.display = "block";
        learningProgressElement.style.width = `${progress}%`;
        learningProgressElement.textContent = `${progress}%`;
        document.querySelector("#learningProgressContainer .description").textContent = `Learning period: ${LEARNING_PERIOD_DURATION_MINUTES / 60} hours`;

    } else if (currentSettings.adaptiveMode) { // Adaptive but not learning (or no start time)
        adaptiveStatusElement.textContent = "Fully adaptive";
        adaptiveStatusElement.className = "status-active";
        document.getElementById("learningProgressContainer").style.display = "none";
    } else { // Not adaptive mode
        // The entire adaptiveSection is hidden by toggleAdaptiveMode, so this might not be strictly necessary
        // but good for clarity if adaptiveSection could be visible for other reasons.
        document.getElementById("learningProgressContainer").style.display = "none";
        adaptiveStatusElement.textContent = "Manual Mode"; // Or some other appropriate status
        adaptiveStatusElement.className = "status-manual"; // Example class
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
        if (typeof chrome === "undefined" || !chrome.storage) {
            // console.warn("chrome.storage is not available.");
            return;
        }

        const oldLearningPeriod = currentSettings.learningPeriod;
        const oldAdaptiveMode = currentSettings.adaptiveMode;

        currentSettings.enabled = enabledToggle.checked;
        currentSettings.adaptiveMode = adaptiveModeToggle.checked;
        currentSettings.inactivityThreshold = Number.parseInt(inactivitySlider.value);
        currentSettings.excludePinnedTabs = excludePinnedToggle.checked;
        currentSettings.showIndicators = showIndicatorsToggle.checked;

        // If adaptive mode is being enabled, and learning period was off, or it just got enabled.
        // Or if adaptive mode is on and learning was just enabled.
        if (currentSettings.adaptiveMode && !oldAdaptiveMode && currentSettings.learningPeriod) {
            // Freshly enabled adaptive mode and learning period is default true
            currentSettings.learningPeriodStartTime = Date.now();
        } else if (currentSettings.adaptiveMode && currentSettings.learningPeriod && !oldLearningPeriod) {
            // Adaptive mode was on, and learning period was just toggled on
            currentSettings.learningPeriodStartTime = Date.now();
        } else if (!currentSettings.adaptiveMode) {
            currentSettings.learningPeriodStartTime = 0; // Reset if adaptive mode is off
        }
        // Note: The background script also has logic to manage learningPeriodStartTime and alarms
        // when settings change. This ensures the options page reflects a potential reset too.

        await chrome.storage.local.set({ settings: currentSettings });

        showToast("Settings saved successfully!", "success");

        saveButton.disabled = true;
        saveButton.classList.add('success');
        const originalText = saveButton.textContent;
        saveButton.textContent = "Saved!";

        setTimeout(() => {
            saveButton.textContent = originalText;
            saveButton.classList.remove('success');
            saveButton.disabled = false;
        }, 1500);
    } catch (error) {
        console.error("Error saving settings:", error);
        showToast("Error saving settings. Please try again.", "error");
        // Add error state to button if desired
    }
}

// Reset settings to defaults
function resetSettings() {
    if (confirm("Are you sure you want to reset all settings to defaults?")) {
        const newDefaults = { ...DEFAULT_SETTINGS }; // Get fresh defaults
        if (newDefaults.adaptiveMode && newDefaults.learningPeriod) {
            newDefaults.learningPeriodStartTime = Date.now();
        }
        currentSettings = newDefaults;

        enabledToggle.checked = currentSettings.enabled;
        adaptiveModeToggle.checked = currentSettings.adaptiveMode;
        inactivitySlider.value = currentSettings.inactivityThreshold;
        thresholdValue.textContent = currentSettings.inactivityThreshold;
        excludePinnedToggle.checked = currentSettings.excludePinnedTabs;
        showIndicatorsToggle.checked = currentSettings.showIndicators;

        toggleAdaptiveMode();
        renderDomainList();
        updateLearningStatus(); // Explicitly call to update based on new default learning state

        if (typeof chrome !== "undefined" && chrome.storage) {
            chrome.storage.local.set({ settings: currentSettings, usagePatterns: {} }); // Also clear usage patterns on reset
            renderImportantDomains(); // Re-render important domains (will be empty)
        }
        showToast("Settings reset to defaults", "info");
    }
}

// Update statistics display
async function updateStatistics() {
    try {
        // Check if chrome is available
        if (typeof chrome === "undefined" || typeof chrome.tabs === "undefined") {
            // console.warn("chrome.tabs is not available. Running in a non-extension environment?");
            // Mock chrome object for testing purposes (consider removing for production)
            window.chrome = window.chrome || {};
            chrome.tabs = chrome.tabs || {
                query: (options, callback) => {
                    // console.warn("Mock chrome.tabs.query called. Returning empty array.");
                    callback([]);
                },
            };
            // return; // Decide if to return or let it try and fail if mock isn't enough
        }

        // Check if chrome.tabs.query is a function before calling it
        if (typeof chrome.tabs.query !== "function") {
            // console.warn("chrome.tabs.query is not a function. Running in a non-extension environment?");
            return;
        }

        const tabs = await chrome.tabs.query({});
        const totalTabs = tabs.length;
        const unloadedTabs = tabs.filter((tab) => tab.discarded).length;
        const memorySaved = unloadedTabs * 50;

        // Update UI with animation - using animateCounter from utils.js
        animateCounter(totalTabsElement, totalTabs, 800);
        animateCounter(unloadedTabsElement, unloadedTabs, 800);
        animateCounter(memorySavedElement, memorySaved, 800, " MB");

        // Update every 10 seconds
        setTimeout(updateStatistics, 10000);
    } catch (error) {
        // console.error("Error updating statistics:", error);
    }
}

// Animate counter function removed, now in utils.js

// Ensure toast container exists once
let toastContainer = null;
function ensureToastContainer() {
    if (!toastContainer) {
        toastContainer = document.createElement("div");
        toastContainer.className = "toast-container";
        document.body.appendChild(toastContainer);
    }
    return toastContainer;
}

// Store SVG icons to avoid creating them repeatedly
const TOAST_ICONS = {
    success: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
    error: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
    warning: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
    info: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
};

// Show toast notification (Refactored)
function showToast(message, type = "info") {
    const container = ensureToastContainer();

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    const iconSvg = TOAST_ICONS[type] || TOAST_ICONS.info;

    toast.innerHTML = `
      <span class="toast-icon">${iconSvg}</span>
      <span class="toast-message"></span>
      <button type="button" class="toast-close">&times;</button>
    `;
    // Safely set the message text to prevent XSS if message could ever contain HTML
    toast.querySelector(".toast-message").textContent = message;

    container.appendChild(toast);

    // Trigger the animation
    // Timeout ensures the 'show' class is added after the element is in the DOM and opacity 0 is set.
    setTimeout(() => {
        toast.classList.add("show");
    }, 10); // Small delay for transition to trigger

    const closeButton = toast.querySelector(".toast-close");
    closeButton.addEventListener("click", () => removeToast(toast));

    setTimeout(() => {
        removeToast(toast);
    }, 3000);
}

// Remove toast with animation (Refactored)
function removeToast(toast) {
    toast.classList.remove("show");
    // Wait for fade out animation to complete before removing from DOM
    toast.addEventListener('transitionend', () => {
        if (toast.parentElement) { // Check if still in DOM
            toast.remove();
        }
    }, { once: true });
    // Fallback if transitionend doesn't fire (e.g. if display:none is applied too quickly)
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, 400); // slightly longer than CSS transition
}
