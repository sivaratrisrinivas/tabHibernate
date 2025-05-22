// Mock Chrome APIs
global.chrome = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
    },
  },
  tabs: {
    query: jest.fn(),
    create: jest.fn(), // For openHelp
  },
  runtime: {
    sendMessage: jest.fn(),
    openOptionsPage: jest.fn(), // For openSettings
    lastError: null,
    getURL: (path) => `chrome-extension://test-popup-id/${path}`, // For help link
  },
};

// Mock animateCounter from utils.js
jest.mock('./utils', () => ({
  animateCounter: jest.fn(),
}));

// DOM elements will be created in beforeEach or describe blocks

// Global variables expected by popup.js
let settings;
let tabActivity;
let usagePatterns;

// Constants that popup.js might use (based on background.js or defined in popup.js)
const DEFAULT_POPUP_SETTINGS = { // Based on typical extension settings
  enabled: true,
  adaptiveMode: false,
  learningPeriod: true,
  learningPeriodStartTime: null,
  learningPeriodDuration: 7 * 24 * 60 * 60 * 1000, // 7 days
  // Add other settings if popup.js directly uses them beyond these for status
};

const IMPORTANCE_LABEL_HIGH_THRESHOLD = 0.7;
const IMPORTANCE_LABEL_MEDIUM_THRESHOLD = 0.4;


// Import functions from popup.js
// This requires popup.js to be modified for module.exports.
const {
  initialize,
  updateAdaptiveStatus,
  toggleExtension,
  updateStatistics,
  updateCurrentTabInfo,
  getImportanceLabel,
  getImportanceColor,
  unloadInactiveTabs,
  openSettings, // If exported directly
  openHelp,     // If exported directly
  // Event listener setup functions if they are exported, otherwise test by simulating events
} = require('./popup'); // Assuming popup.js is in the same directory

// Helper function to set up the DOM for popup.html
const setupPopupDOM = () => {
  document.body.innerHTML = `
    <input type="checkbox" id="enableToggle">
    <span id="statusText"></span>
    <div id="adaptiveStatus" class="status-indicator"></div>
    
    <div class="stat-item">
        <span id="totalTabs">0</span> Total Tabs
    </div>
    <div class="stat-item">
        <span id="unloadedTabs">0</span> Hibernated
    </div>
    <div class="stat-item">
        <span id="memorySaved">0 MB</span> Memory Saved
    </div>

    <div id="currentTabSection">
        <h3>Current Tab</h3>
        <div id="tabStatus" class="status-indicator">Loading...</div>
        <p>Last Active: <span id="lastActive">N/A</span></p>
        <p>Importance: <span id="tabImportance">N/A</span></p>
    </div>

    <button id="unloadButton"><svg><path/></svg> Hibernate Tabs</button>
    <button id="settingsButton">Settings</button>
    <a href="#" id="helpLink">Help</a>
  `;
};


describe('Popup Script Logic', () => {
  
  beforeEach(() => {
    setupPopupDOM();
    jest.clearAllMocks();
    jest.useFakeTimers(); // For debounce, timeouts if any

    // Initialize global state for each test
    settings = JSON.parse(JSON.stringify(DEFAULT_POPUP_SETTINGS));
    tabActivity = {};
    usagePatterns = {};

    // Mock chrome.storage.local.get
    chrome.storage.local.get.mockImplementation((keys, callback) => {
      const result = {};
      if (Array.isArray(keys)) {
        keys.forEach(key => {
          if (key === 'settings') result.settings = JSON.parse(JSON.stringify(settings));
          if (key === 'tabActivity') result.tabActivity = JSON.parse(JSON.stringify(tabActivity));
          if (key === 'usagePatterns') result.usagePatterns = JSON.parse(JSON.stringify(usagePatterns));
        });
      } else if (typeof keys === 'object' && keys !== null) {
        if (keys.hasOwnProperty('settings')) result.settings = JSON.parse(JSON.stringify(settings));
        if (keys.hasOwnProperty('tabActivity')) result.tabActivity = JSON.parse(JSON.stringify(tabActivity));
        if (keys.hasOwnProperty('usagePatterns')) result.usagePatterns = JSON.parse(JSON.stringify(usagePatterns));
      }
      Promise.resolve().then(() => callback(result));
    });

    // Mock chrome.storage.local.set
    chrome.storage.local.set.mockImplementation((items, callback) => {
      if (items.settings) settings = { ...settings, ...items.settings };
      // popup.js typically doesn't set tabActivity or usagePatterns
      if (callback) Promise.resolve().then(callback);
      return Promise.resolve();
    });
    
    // Mock chrome.tabs.query
    chrome.tabs.query.mockResolvedValue([]); // Default to no tabs
    
    // Mock chrome.runtime.sendMessage
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      // Default success for manualUnload, can be overridden
      if (message && message.type === "manualUnload") {
        if (callback) Promise.resolve().then(() => callback({ success: true, unloadedCount: 0 }));
        return Promise.resolve({ success: true, unloadedCount: 0 });
      }
      if (callback) Promise.resolve().then(() => callback({})); // Generic callback
      return Promise.resolve({});
    });

    // Mock Date.now for consistent time checks if needed (e.g., in lastActive formatting)
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2024-02-15T12:00:00.000Z').getTime());
    
    // Reset lastError
    chrome.runtime.lastError = null;
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.restoreAllMocks(); // Restore Date.now and other mocks
    document.body.innerHTML = ''; // Clean up DOM
  });

  test('Placeholder: Initial setup and DOM ready', () => {
    expect(document.getElementById('enableToggle')).not.toBeNull();
    expect(initialize).toBeDefined(); // Check if function is imported
  });

  // Test suites for each function will follow here
  describe('initialize() and Initial Page Load', () => {
    let enableToggle, statusText;
    let updateAdaptiveStatusSpy, updateStatisticsSpy, updateCurrentTabInfoSpy;

    beforeEach(() => {
      enableToggle = document.getElementById('enableToggle');
      statusText = document.getElementById('statusText');

      // Spy on functions called by initialize
      // This requires these functions to be exported from popup.js or part of the module
      updateAdaptiveStatusSpy = jest.spyOn(require('./popup'), 'updateAdaptiveStatus').mockImplementation(() => {});
      updateStatisticsSpy = jest.spyOn(require('./popup'), 'updateStatistics').mockImplementation(async () => {});
      updateCurrentTabInfoSpy = jest.spyOn(require('./popup'), 'updateCurrentTabInfo').mockImplementation(async () => {});
    });

    afterEach(() => {
      updateAdaptiveStatusSpy.mockRestore();
      updateStatisticsSpy.mockRestore();
      updateCurrentTabInfoSpy.mockRestore();
    });

    test('should call chrome.storage.local.get for settings, tabActivity, and usagePatterns', async () => {
      await initialize();
      expect(chrome.storage.local.get).toHaveBeenCalledWith(
        ['settings', 'tabActivity', 'usagePatterns'],
        expect.any(Function)
      );
    });

    test('should set UI elements based on loaded settings.enabled (true)', async () => {
      settings.enabled = true;
      _setPopupSettings(settings); // Update the global settings for the mock

      await initialize();

      expect(enableToggle.checked).toBe(true);
      expect(statusText.textContent).toBe('Enabled');
    });
    
    test('should set UI elements based on loaded settings.enabled (false)', async () => {
      settings.enabled = false;
      _setPopupSettings(settings);

      await initialize();

      expect(enableToggle.checked).toBe(false);
      expect(statusText.textContent).toBe('Disabled');
    });

    test('should call updateAdaptiveStatus, updateStatistics, and updateCurrentTabInfo', async () => {
      await initialize();
      expect(updateAdaptiveStatusSpy).toHaveBeenCalled();
      expect(updateStatisticsSpy).toHaveBeenCalled();
      expect(updateCurrentTabInfoSpy).toHaveBeenCalled();
    });

    test('should handle errors during chrome.storage.local.get', async () => {
      chrome.storage.local.get.mockImplementation((keys, callback) => {
        chrome.runtime.lastError = { message: "Storage fetch error" };
        // Simulate callback with empty data or default structure
        Promise.resolve().then(() => callback({ settings: DEFAULT_POPUP_SETTINGS, tabActivity: {}, usagePatterns: {} }));
      });
      jest.spyOn(console, 'error').mockImplementation(() => {});

      await initialize();

      expect(console.error).toHaveBeenCalledWith('Error loading data:', { message: "Storage fetch error" });
      // Check if UI is still set to some default state
      expect(enableToggle.checked).toBe(DEFAULT_POPUP_SETTINGS.enabled);
      expect(statusText.textContent).toBe(DEFAULT_POPUP_SETTINGS.enabled ? 'Enabled' : 'Disabled');
      
      console.error.mockRestore();
    });
  });

  describe('updateAdaptiveStatus()', () => {
    let adaptiveStatusElement;

    beforeEach(() => {
      adaptiveStatusElement = document.getElementById('adaptiveStatus');
    });

    test('should display "Learning" when adaptiveMode and learningPeriod are true', () => {
      settings.adaptiveMode = true;
      settings.learningPeriod = true;
      settings.learningPeriodStartTime = Date.now() - (settings.learningPeriodDuration / 2);
      _setPopupSettings(settings);

      updateAdaptiveStatus();

      expect(adaptiveStatusElement.textContent).toBe('Learning');
      expect(adaptiveStatusElement.className).toContain('learning');
      expect(adaptiveStatusElement.className).not.toContain('adaptive');
      expect(adaptiveStatusElement.className).not.toContain('manual');
    });

    test('should display "Adaptive" when adaptiveMode is true and learningPeriod is false', () => {
      settings.adaptiveMode = true;
      settings.learningPeriod = false;
      _setPopupSettings(settings);

      updateAdaptiveStatus();

      expect(adaptiveStatusElement.textContent).toBe('Adaptive');
      expect(adaptiveStatusElement.className).toContain('adaptive');
      expect(adaptiveStatusElement.className).not.toContain('learning');
      expect(adaptiveStatusElement.className).not.toContain('manual');
    });

    test('should display "Manual" when adaptiveMode is false', () => {
      settings.adaptiveMode = false;
      _setPopupSettings(settings);

      updateAdaptiveStatus();

      expect(adaptiveStatusElement.textContent).toBe('Manual');
      expect(adaptiveStatusElement.className).toContain('manual');
      expect(adaptiveStatusElement.className).not.toContain('learning');
      expect(adaptiveStatusElement.className).not.toContain('adaptive');
    });
    
    test('should display "Learning" even if learningPeriodStartTime is null (will start on save)', () => {
        settings.adaptiveMode = true;
        settings.learningPeriod = true;
        settings.learningPeriodStartTime = null; // Not yet started
        _setPopupSettings(settings);

        updateAdaptiveStatus();

        expect(adaptiveStatusElement.textContent).toBe('Learning');
        expect(adaptiveStatusElement.className).toContain('learning');
    });
  });

  describe('toggleExtension()', () => {
    let enableToggle, statusText;

    beforeEach(() => {
      enableToggle = document.getElementById('enableToggle');
      statusText = document.getElementById('statusText');
      
      // Ensure settings are loaded for context
      settings.enabled = true; // Default to enabled for initial state
      _setPopupSettings(settings);
      enableToggle.checked = true;
      statusText.textContent = 'Enabled';
    });

    test('should update settings.enabled to false and UI when toggled off', async () => {
      enableToggle.checked = false; // Simulate user toggling off
      await toggleExtension();

      expect(settings.enabled).toBe(false);
      expect(statusText.textContent).toBe('Disabled');
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ settings: settings }, expect.any(Function));
    });

    test('should update settings.enabled to true and UI when toggled on', async () => {
      settings.enabled = false; // Start with it disabled
      _setPopupSettings(settings);
      enableToggle.checked = true; // Simulate user toggling on
      
      await toggleExtension();

      expect(settings.enabled).toBe(true);
      expect(statusText.textContent).toBe('Enabled');
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ settings: settings }, expect.any(Function));
    });

    test('should handle error during chrome.storage.local.set', async () => {
      enableToggle.checked = false; // Attempt to toggle off
      chrome.storage.local.set.mockImplementation((items, callback) => {
        chrome.runtime.lastError = { message: "Storage set error" };
        // Callback might still be called, or not, depending on Chrome's behavior
        // For robustness, assume it might be called or the promise might reject
        if (callback) Promise.resolve().then(callback); // Simulate callback
        // Or return Promise.reject(new Error("Storage set error")); if options.js uses promises for set
      });
      jest.spyOn(console, 'error').mockImplementation(() => {});

      await toggleExtension();

      expect(console.error).toHaveBeenCalledWith('Error saving settings:', { message: "Storage set error" });
      // UI should ideally revert or show an error state, but current function doesn't specify UI revert
      // We check that settings.enabled was attempted to be changed locally before save failed
      expect(settings.enabled).toBe(false); // Local settings object updated
      
      console.error.mockRestore();
    });
  });

  describe('updateStatistics()', () => {
    let totalTabsEl, unloadedTabsEl, memorySavedEl;
    let animateCounterMock;

    beforeEach(() => {
      totalTabsEl = document.getElementById('totalTabs');
      unloadedTabsEl = document.getElementById('unloadedTabs');
      memorySavedEl = document.getElementById('memorySaved');
      
      animateCounterMock = require('./utils').animateCounter; // Get the mock
      animateCounterMock.mockClear(); // Clear previous calls
    });

    test('should query tabs and call animateCounter for each statistic', async () => {
      const mockTabs = [
        { id: 1, discarded: false, memoryInfo: { residentSetSizeBytes: 100 * 1024 * 1024 } },
        { id: 2, discarded: true, memoryInfo: { residentSetSizeBytes: 0 } }, // Effectively 0 for active memory
        { id: 3, discarded: false, memoryInfo: { residentSetSizeBytes: 150 * 1024 * 1024 } },
      ];
      chrome.tabs.query.mockResolvedValue(mockTabs);

      await updateStatistics();

      expect(chrome.tabs.query).toHaveBeenCalledWith({}, expect.any(Function));
      expect(animateCounterMock).toHaveBeenCalledTimes(3);
      expect(animateCounterMock).toHaveBeenCalledWith(totalTabsEl, 3, expect.any(Number));
      expect(animateCounterMock).toHaveBeenCalledWith(unloadedTabsEl, 1, expect.any(Number));
      // Memory saved is based on an estimate (e.g., 150MB per unloaded tab in popup.js's default logic)
      // If tab 2 was estimated at 150MB saved:
      expect(animateCounterMock).toHaveBeenCalledWith(memorySavedEl, 150, expect.any(Number)); 
    });

    test('should handle chrome.tabs.query error and set stats to 0', async () => {
      chrome.tabs.query.mockImplementation((options, callback) => {
        chrome.runtime.lastError = { message: "Tabs query failed" };
        Promise.resolve().then(() => callback([])); // Simulate error by returning empty
      });
      jest.spyOn(console, 'error').mockImplementation(() => {});

      await updateStatistics();

      expect(console.error).toHaveBeenCalledWith('Error fetching tabs for statistics:', { message: "Tabs query failed" });
      expect(animateCounterMock).toHaveBeenCalledWith(totalTabsEl, 0, expect.any(Number));
      expect(animateCounterMock).toHaveBeenCalledWith(unloadedTabsEl, 0, expect.any(Number));
      expect(animateCounterMock).toHaveBeenCalledWith(memorySavedEl, 0, expect.any(Number));
      
      console.error.mockRestore();
    });
    
    test('should correctly calculate memory saved with mixed memoryInfo presence', async () => {
      const mockTabs = [
        { id: 1, discarded: false, memoryInfo: { residentSetSizeBytes: 100 * 1024 * 1024 } }, // 100MB
        { id: 2, discarded: true }, // No memoryInfo, should use default estimate (e.g., 150MB)
        { id: 3, discarded: false }, // No memoryInfo, not counted for average of active
        { id: 4, discarded: true, memoryInfo: { residentSetSizeBytes: 0 } }, // Has memoryInfo, but discarded, so uses estimate
      ];
      chrome.tabs.query.mockResolvedValue(mockTabs);
      // Assuming default average memory per tab is 150MB in popup.js logic
      // Tab 2 saved: 150MB (estimate)
      // Tab 4 saved: 150MB (estimate, even though memoryInfo is 0, it's an estimate of what it *would* have used)
      // Total saved: 150 + 150 = 300 MB

      await updateStatistics();
      expect(animateCounterMock).toHaveBeenCalledWith(memorySavedEl, 300, expect.any(Number));
    });
  });

  describe('updateCurrentTabInfo()', () => {
    let tabStatusEl, lastActiveEl, tabImportanceEl;
    let getImportanceLabelSpy, getImportanceColorSpy;
    const activeTab = { id: 101, url: 'http://active.com/page', discarded: false };
    const hibernatedTab = { id: 102, url: 'http://hibernated.com/page', discarded: true };

    beforeEach(() => {
      tabStatusEl = document.getElementById('tabStatus');
      lastActiveEl = document.getElementById('lastActive');
      tabImportanceEl = document.getElementById('tabImportance');

      getImportanceLabelSpy = jest.spyOn(require('./popup'), 'getImportanceLabel');
      getImportanceColorSpy = jest.spyOn(require('./popup'), 'getImportanceColor');
      
      // Reset settings and other global states
      _setPopupSettings(JSON.parse(JSON.stringify(DEFAULT_POPUP_SETTINGS)));
      _setPopupTabActivity({});
      _setPopupUsagePatterns({});
    });

    afterEach(() => {
      getImportanceLabelSpy.mockRestore();
      getImportanceColorSpy.mockRestore();
    });

    test('should display "Active" for a non-discarded tab', async () => {
      chrome.tabs.query.mockResolvedValue([activeTab]);
      await updateCurrentTabInfo();
      expect(tabStatusEl.textContent).toBe('Active');
      expect(tabStatusEl.className).toContain('active');
      expect(tabStatusEl.className).not.toContain('hibernating');
    });

    test('should display "Hibernating" for a discarded tab', async () => {
      chrome.tabs.query.mockResolvedValue([hibernatedTab]);
      await updateCurrentTabInfo();
      expect(tabStatusEl.textContent).toBe('Hibernating');
      expect(tabStatusEl.className).toContain('hibernating');
      expect(tabStatusEl.className).not.toContain('active');
    });

    test('should display "Just now" for recently active tab', async () => {
      chrome.tabs.query.mockResolvedValue([activeTab]);
      tabActivity[activeTab.id] = { lastActive: Date.now() - 10000 }; // 10 seconds ago
      _setPopupTabActivity(tabActivity);
      await updateCurrentTabInfo();
      expect(lastActiveEl.textContent).toBe('Just now');
    });
    
    test('should display "X minute(s) ago" for older tabs', async () => {
      chrome.tabs.query.mockResolvedValue([activeTab]);
      tabActivity[activeTab.id] = { lastActive: Date.now() - (5 * 60 * 1000) }; // 5 minutes ago
      _setPopupTabActivity(tabActivity);
      await updateCurrentTabInfo();
      expect(lastActiveEl.textContent).toBe('5 minute(s) ago');
    });

    test('should display "X hour(s) ago" for very old tabs', async () => {
      chrome.tabs.query.mockResolvedValue([activeTab]);
      tabActivity[activeTab.id] = { lastActive: Date.now() - (2 * 60 * 60 * 1000) }; // 2 hours ago
      _setPopupTabActivity(tabActivity);
      await updateCurrentTabInfo();
      expect(lastActiveEl.textContent).toBe('2 hour(s) ago');
    });
    
    test('should display "N/A" for last active if no activity entry', async () => {
      chrome.tabs.query.mockResolvedValue([activeTab]);
      // No entry in tabActivity for activeTab.id
      await updateCurrentTabInfo();
      expect(lastActiveEl.textContent).toBe('N/A');
    });

    describe('Tab Importance Display', () => {
      beforeEach(() => {
        settings.adaptiveMode = true; // Enable adaptive mode for these tests
        _setPopupSettings(settings);
      });

      test('should display importance label and color if adaptiveMode and pattern exists', async () => {
        usagePatterns['active.com'] = { importance: 0.8, lastAnalyzed: Date.now() };
        _setPopupUsagePatterns(usagePatterns);
        getImportanceLabelSpy.mockReturnValue('High');
        getImportanceColorSpy.mockReturnValue('var(--success)');
        chrome.tabs.query.mockResolvedValue([activeTab]);

        await updateCurrentTabInfo();

        expect(tabImportanceEl.textContent).toBe('High');
        expect(tabImportanceEl.style.color).toBe('var(--success)');
        expect(getImportanceLabelSpy).toHaveBeenCalledWith(0.8);
        expect(getImportanceColorSpy).toHaveBeenCalledWith(0.8);
      });

      test('should display "Calculating..." if adaptiveMode but no pattern for domain', async () => {
        // usagePatterns is empty for 'active.com'
        chrome.tabs.query.mockResolvedValue([activeTab]);
        await updateCurrentTabInfo();
        expect(tabImportanceEl.textContent).toBe('Calculating...');
        expect(tabImportanceEl.style.color).toBe(''); // Default color
      });
      
      test('should display "N/A" for importance if adaptiveMode is false', async () => {
        settings.adaptiveMode = false;
        _setPopupSettings(settings);
        usagePatterns['active.com'] = { importance: 0.8, lastAnalyzed: Date.now() };
        _setPopupUsagePatterns(usagePatterns);
        chrome.tabs.query.mockResolvedValue([activeTab]);

        await updateCurrentTabInfo();
        expect(tabImportanceEl.textContent).toBe('N/A');
      });
    });

    test('should handle no active tab found', async () => {
      chrome.tabs.query.mockResolvedValue([]); // No active tab
      await updateCurrentTabInfo();
      expect(tabStatusEl.textContent).toBe('N/A');
      expect(lastActiveEl.textContent).toBe('N/A');
      expect(tabImportanceEl.textContent).toBe('N/A');
    });
    
    test('should handle invalid tab URL (e.g., chrome://)', async () => {
      const invalidUrlTab = { id: 103, url: 'chrome://extensions', discarded: false };
      chrome.tabs.query.mockResolvedValue([invalidUrlTab]);
      await updateCurrentTabInfo();
      expect(tabStatusEl.textContent).toBe('Active'); // Still active
      expect(lastActiveEl.textContent).toBe('N/A'); // No domain to get activity from
      expect(tabImportanceEl.textContent).toBe('N/A'); // No domain for importance
    });
  });

  describe('getImportanceLabel(importance)', () => {
    test('should return "High" for importance >= HIGH_THRESHOLD', () => {
      expect(getImportanceLabel(IMPORTANCE_LABEL_HIGH_THRESHOLD)).toBe('High');
      expect(getImportanceLabel(IMPORTANCE_LABEL_HIGH_THRESHOLD + 0.1)).toBe('High');
    });

    test('should return "Medium" for importance >= MEDIUM_THRESHOLD and < HIGH_THRESHOLD', () => {
      expect(getImportanceLabel(IMPORTANCE_LABEL_MEDIUM_THRESHOLD)).toBe('Medium');
      expect(getImportanceLabel(IMPORTANCE_LABEL_HIGH_THRESHOLD - 0.01)).toBe('Medium');
    });

    test('should return "Low" for importance < MEDIUM_THRESHOLD', () => {
      expect(getImportanceLabel(IMPORTANCE_LABEL_MEDIUM_THRESHOLD - 0.01)).toBe('Low');
      expect(getImportanceLabel(0)).toBe('Low');
      expect(getImportanceLabel(-0.5)).toBe('Low'); // Negative values
    });
     test('should handle undefined or null importance as "Low"', () => {
      expect(getImportanceLabel(undefined)).toBe('Low');
      expect(getImportanceLabel(null)).toBe('Low');
    });
  });

  describe('getImportanceColor(importance)', () => {
    test('should return success color for importance >= HIGH_THRESHOLD', () => {
      expect(getImportanceColor(IMPORTANCE_LABEL_HIGH_THRESHOLD)).toBe('var(--success)');
    });

    test('should return warning color for importance >= MEDIUM_THRESHOLD and < HIGH_THRESHOLD', () => {
      expect(getImportanceColor(IMPORTANCE_LABEL_MEDIUM_THRESHOLD)).toBe('var(--warning)');
    });

    test('should return gray color for importance < MEDIUM_THRESHOLD', () => {
      expect(getImportanceColor(IMPORTANCE_LABEL_MEDIUM_THRESHOLD - 0.1)).toBe('var(--gray-500)');
    });
    test('should handle undefined or null importance with gray color', () => {
      expect(getImportanceColor(undefined)).toBe('var(--gray-500)');
      expect(getImportanceColor(null)).toBe('var(--gray-500)');
    });
  });

  describe('unloadInactiveTabs()', () => {
    let unloadButton;
    let updateStatisticsSpy; // Spy on the local updateStatistics

    beforeEach(() => {
      unloadButton = document.getElementById('unloadButton');
      // Ensure the button has the initial SVG content for replacement tests
      unloadButton.innerHTML = '<svg id="initial-icon"><path d="M1"/></svg> Hibernate Tabs';
      
      updateStatisticsSpy = jest.spyOn(require('./popup'), 'updateStatistics').mockImplementation(async () => {});
    });

    afterEach(() => {
      updateStatisticsSpy.mockRestore();
    });

    test('should disable button, show loading state, and call sendMessage', async () => {
      await unloadInactiveTabs();

      expect(unloadButton.disabled).toBe(true);
      expect(unloadButton.innerHTML).toContain('spinner-icon'); // Check for loading SVG
      expect(unloadButton.textContent).toContain('Hibernating...');
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        { type: "manualUnload" },
        expect.any(Function)
      );
    });

    test('on successful sendMessage, should call updateStatistics and show success state then revert', async () => {
      chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        if (message.type === "manualUnload") {
          Promise.resolve().then(() => callback({ success: true, unloadedCount: 3 }));
        }
      });

      await unloadInactiveTabs();

      expect(updateStatisticsSpy).toHaveBeenCalled();
      expect(unloadButton.innerHTML).toContain('check-icon'); // Success SVG
      expect(unloadButton.textContent).toContain('Done!');
      expect(unloadButton.disabled).toBe(false); // Re-enabled after success animation timeout

      // Fast-forward timers for the revert state
      jest.advanceTimersByTime(2000); // Timeout for success/error message display
      expect(unloadButton.innerHTML).toContain('initial-icon'); // Back to initial SVG
      expect(unloadButton.textContent).toContain('Hibernate Tabs');
    });

    test('on failed sendMessage (response.success is false), should show error state then revert', async () => {
      chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        if (message.type === "manualUnload") {
          Promise.resolve().then(() => callback({ success: false, message: 'Failed to unload' }));
        }
      });

      await unloadInactiveTabs();

      expect(updateStatisticsSpy).not.toHaveBeenCalled(); // Should not call on failure
      expect(unloadButton.innerHTML).toContain('error-icon'); // Error SVG
      expect(unloadButton.textContent).toContain('Error!');
      expect(unloadButton.disabled).toBe(false);

      jest.advanceTimersByTime(2000);
      expect(unloadButton.innerHTML).toContain('initial-icon');
      expect(unloadButton.textContent).toContain('Hibernate Tabs');
    });
    
    test('on sendMessage error (e.g., no listener), should show error state then revert', async () => {
      chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        chrome.runtime.lastError = { message: "No background listener" };
        // Callback might not be called, or called with no response.
        // Let's simulate it not being called or called with undefined for this error.
        if (callback) Promise.resolve().then(() => callback(undefined));
      });
      jest.spyOn(console, 'error').mockImplementation(() => {});


      await unloadInactiveTabs();

      expect(updateStatisticsSpy).not.toHaveBeenCalled();
      expect(unloadButton.innerHTML).toContain('error-icon');
      expect(unloadButton.textContent).toContain('Error!');
      expect(console.error).toHaveBeenCalledWith('Error during manual unload:', { message: "No background listener" });
      expect(unloadButton.disabled).toBe(false);
      
      jest.advanceTimersByTime(2000);
      expect(unloadButton.innerHTML).toContain('initial-icon');
      expect(unloadButton.textContent).toContain('Hibernate Tabs');
      console.error.mockRestore();
    });
  });

  describe('Event Listener Setup', () => {
    let enableToggle, unloadButton, settingsButton, helpLink;
    let toggleExtensionSpy, unloadInactiveTabsSpy, openSettingsSpy, openHelpSpy;
    
    // Helper to simulate DOMContentLoaded if popup.js relies on it to add listeners
    const simulateDOMContentLoaded = () => {
        // If popup.js has a main init function called on DOMContentLoaded, call it here.
        // Or, if listeners are added directly in the global scope of popup.js,
        // they should be active when `require('./popup')` is done.
        // This test suite assumes that `loadSettings` or `initialize` (called in most `beforeEach`)
        // also sets up the event listeners as shown in the example popup.js.
        // If not, we would need an explicit initEventListeners() function from popup.js.
        
        // For this test, we'll re-call initialize to ensure listeners are fresh,
        // assuming initialize also handles listener setup or calls a function that does.
        return initialize(); 
    };

    beforeEach(async () => {
      // Setup DOM and initial settings
      _setPopupSettings(JSON.parse(JSON.stringify(DEFAULT_POPUP_SETTINGS)));
      _setPopupTabActivity({});
      _setPopupUsagePatterns({});
      
      // Spy on the handler functions from the imported module
      toggleExtensionSpy = jest.spyOn(require('./popup'), 'toggleExtension').mockImplementation(async () => {});
      unloadInactiveTabsSpy = jest.spyOn(require('./popup'), 'unloadInactiveTabs').mockImplementation(async () => {});
      
      // For openSettings and openHelp, if they are not exported, we test the chrome API calls directly.
      // If they *are* exported, we can spy on them too. Let's assume they are for directness.
      openSettingsSpy = jest.spyOn(require('./popup'), 'openSettings').mockImplementation(() => {});
      openHelpSpy = jest.spyOn(require('./popup'), 'openHelp').mockImplementation(() => {});

      // It's crucial that event listeners in popup.js use the *exported* functions
      // for these spies to work. If they use internal/anonymous functions,
      // we'd have to test the side effects of those functions instead.
      
      // Call initialize to set up UI and potentially listeners
      await simulateDOMContentLoaded();

      // Capture elements after DOM is set up and initialize might have run
      enableToggle = document.getElementById('enableToggle');
      unloadButton = document.getElementById('unloadButton');
      settingsButton = document.getElementById('settingsButton');
      helpLink = document.getElementById('helpLink');
    });

    afterEach(() => {
      toggleExtensionSpy.mockRestore();
      unloadInactiveTabsSpy.mockRestore();
      openSettingsSpy.mockRestore();
      openHelpSpy.mockRestore();
    });

    test('enableToggle "change" event should call toggleExtension', () => {
      enableToggle.dispatchEvent(new Event('change'));
      expect(toggleExtensionSpy).toHaveBeenCalled();
    });

    test('unloadButton "click" event should call unloadInactiveTabs', () => {
      unloadButton.dispatchEvent(new Event('click'));
      expect(unloadInactiveTabsSpy).toHaveBeenCalled();
    });

    test('settingsButton "click" event should call openSettings (or chrome.runtime.openOptionsPage)', () => {
      // If openSettings is exported and spied:
      settingsButton.dispatchEvent(new Event('click'));
      expect(openSettingsSpy).toHaveBeenCalled();
      // Or, if testing the direct Chrome API call because openSettings is not exported/spied:
      // chrome.runtime.openOptionsPage.mockClear(); // Clear calls from initialize if any
      // settingsButton.dispatchEvent(new Event('click'));
      // expect(chrome.runtime.openOptionsPage).toHaveBeenCalled();
    });

    test('helpLink "click" event should call openHelp (or chrome.tabs.create)', () => {
      // If openHelp is exported and spied:
      helpLink.dispatchEvent(new Event('click'));
      expect(openHelpSpy).toHaveBeenCalled();
      // Or, if testing the direct Chrome API call:
      // chrome.tabs.create.mockClear();
      // helpLink.dispatchEvent(new Event('click'));
      // expect(chrome.tabs.create).toHaveBeenCalledWith({ url: expect.any(String) });
    });
  });
});








// Helper functions to simulate settings state for tests (if popup.js doesn't export them)
const _setPopupSettings = (newSettings) => {
    settings = JSON.parse(JSON.stringify(newSettings));
};
const _setPopupTabActivity = (newActivity) => {
    tabActivity = JSON.parse(JSON.stringify(newActivity));
};
const _setPopupUsagePatterns = (newPatterns) => {
    usagePatterns = JSON.parse(JSON.stringify(newPatterns));
};
