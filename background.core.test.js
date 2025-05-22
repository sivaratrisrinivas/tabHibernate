// Mock Chrome APIs
global.chrome = {
  alarms: {
    create: jest.fn(),
    get: jest.fn(),
    clear: jest.fn(),
    onAlarm: {
      addListener: jest.fn(),
      removeListener: jest.fn(), // Added for completeness
    },
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
      onChanged: {
        addListener: jest.fn(),
        removeListener: jest.fn(), // Added for completeness
      },
    },
  },
  tabs: {
    query: jest.fn(),
    onUpdated: { // Added for completeness, though may not be used directly
        addListener: jest.fn(),
    },
    onActivated: { // Added for completeness
        addListener: jest.fn(),
    },
    onRemoved: { // Added for completeness
        addListener: jest.fn(),
    }
  },
  runtime: {
    onInstalled: {
      addListener: jest.fn(),
    },
    onMessage: {
      addListener: jest.fn(),
    },
    getURL: (path) => `chrome-extension://your-extension-id/${path}`, // Mock getURL
    id: 'your-extension-id', // Mock extension ID
  },
  action: { // Mock chrome.action based on manifest V3
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn(),
  }
};

// Import functions and constants from background.js
// This will require background.js to be modified to use module.exports
// For now, this will likely fail until background.js is modified.
const {
  initialize,
  isExcludedDomain,
  isImportantTab,
  getAdaptiveThreshold,
  trackTabDomain,
  trackTabInteraction,
  trackTabActivation,
  analyzeUsagePatterns,
  endLearningPeriod,
  // Constants that might be referenced if not directly from the settings object
  // DEFAULT_SETTINGS, // This will be loaded by initialize or set directly
  // IMPORTANCE_INTERACTION_WEIGHT,
  // IMPORTANCE_THRESHOLD_SKIP_HIBERNATE,
  // IMPORTANCE_THRESHOLD_AUTO_EXCLUDE,
  // ANALYSIS_INTERVAL_MINUTES,
  // CHECK_INTERVAL_MINUTES,
  // LEARNING_PERIOD_ALARM_NAME,
  // ANALYSIS_ALARM_NAME,
  // CHECK_ALARM_NAME,

  // Exported global variables for manipulation and verification in tests
  _setSettings, // Function to set internal settings for testing
  _getSettings, // Function to get internal settings for testing
  _setTabUsagePatterns,
  _getTabUsagePatterns,
  _setTabActivity,
  _getTabActivity,
  _setLastHibernatedTabId,
  _setLearningPeriodTimeoutId,
  // Actual functions from background.js
  // These might need to be mocked if they call chrome APIs not fully mocked for a specific test
  // saveSettings,
  // saveUsagePatterns,
} = require('./background');

// Global state that background.js uses (will be managed by _setSettings etc.)
let settingsProxy; // To hold the settings from background.js
let tabUsagePatternsProxy; // To hold usage patterns from background.js
// These are the actual default settings from background.js
// They will be loaded via initialize or set directly for tests.
const ACTUAL_DEFAULT_SETTINGS = {
    inactivityThreshold: 30 * 60 * 1000, // 30 minutes
    maxHibernatedTabs: 10,
    autoHibernate: true,
    excludedDomains: ["youtube.com", "docs.google.com"], // Example from background.js
    adaptiveMode: false,
    learningPeriod: true,
    learningPeriodDuration: 7 * 24 * 60 * 60 * 1000, // 7 days
    learningPeriodStartTime: null,
    hibernationStrategy: "idle",
    lowPowerMode: false,
    discardInsteadOfHibernate: false,
    aggressiveMode: false,
    minTabsToKeepActive: 1,
    notificationsEnabled: true,
    theme: "system",
    debugMode: false
};

// Constants used in tests, mirroring those in background.js
const IMPORTANCE_INTERACTION_WEIGHT = 0.6; // from background.js
const IMPORTANCE_THRESHOLD_SKIP_HIBERNATE = 0.7; // from background.js
const IMPORTANCE_THRESHOLD_AUTO_EXCLUDE = 0.9; // from background.js
// const ANALYSIS_INTERVAL_MINUTES = 60; // from background.js
// const CHECK_INTERVAL_MINUTES = 1; // from background.js


describe('Background Script Core Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Set the settings in background.js to a known default state for each test
    // This assumes background.js exports a setter for its internal 'settings' variable
    _setSettings(JSON.parse(JSON.stringify(ACTUAL_DEFAULT_SETTINGS)));
    settingsProxy = _getSettings(); // Get a reference to the live settings in background.js

    // Reset other state in background.js
    _setTabUsagePatterns({});
    tabUsagePatternsProxy = _getTabUsagePatterns();
    _setTabActivity({});
    _setLastHibernatedTabId(null);
    _setLearningPeriodTimeoutId(null);


    // Mock chrome.storage.local.get
    global.chrome.storage.local.get.mockImplementation((keys, callback) => {
      const result = {};
      const currentSettingsFromBG = _getSettings(); // Use the live settings from background.js
      const currentUsagePatternsFromBG = _getTabUsagePatterns();

      if (Array.isArray(keys)) {
        keys.forEach(key => {
          if (key === 'settings') result[key] = JSON.parse(JSON.stringify(currentSettingsFromBG));
          if (key === 'usagePatterns') result[key] = JSON.parse(JSON.stringify(currentUsagePatternsFromBG));
        });
      } else if (typeof keys === 'object' && keys !== null) { // typeof keys === 'object'
        if ('settings' in keys) result.settings = JSON.parse(JSON.stringify(keys.settings !== undefined ? keys.settings : currentSettingsFromBG));
        if ('usagePatterns' in keys) result.usagePatterns = JSON.parse(JSON.stringify(keys.usagePatterns !== undefined ? keys.usagePatterns : currentUsagePatternsFromBG));
      } else if (typeof keys === 'string') { // Single key string
          if (keys === 'settings') result.settings = JSON.parse(JSON.stringify(currentSettingsFromBG));
          if (keys === 'usagePatterns') result.usagePatterns = JSON.parse(JSON.stringify(currentUsagePatternsFromBG));
      }
      // Simulate async behavior
      Promise.resolve().then(() => callback(result));
    });

    // Mock chrome.storage.local.set
    global.chrome.storage.local.set.mockImplementation((items, callback) => {
      if (items.settings) {
        _setSettings({ ..._getSettings(), ...items.settings }); // Update background.js's internal settings
      }
      if (items.usagePatterns) {
        _setTabUsagePatterns(items.usagePatterns); // Update background.js's internal usage patterns
      }
      if (callback) {
        Promise.resolve().then(callback);
      }
      return Promise.resolve(); // Return a resolved promise as per Chrome API
    });

    global.chrome.alarms.get.mockImplementation((name, callback) => {
        Promise.resolve().then(() => callback(undefined)); // Default to no alarm
    });
    global.chrome.alarms.clear.mockImplementation((name, callback) => {
        if (callback) Promise.resolve().then(() => callback(true)); // Simulate successful clear
        return Promise.resolve(true);
    });
    global.chrome.alarms.create.mockImplementation((name, options) => {
        // console.log(`Mock alarm created: ${name}`);
    });


    global.chrome.tabs.query.mockImplementation((options, callback) => {
        Promise.resolve().then(() => callback([])); // Default to no tabs
    });
  });

  describe('isExcludedDomain(url)', () => {
    test('should return true if URL hostname is in excludedDomains', () => {
      settingsProxy.excludedDomains = ['example.com', 'test.com'];
      _setSettings(settingsProxy);
      expect(isExcludedDomain('http://example.com/page')).toBe(true);
    });

    test('should return false if URL hostname is not in excludedDomains', () => {
      settingsProxy.excludedDomains = ['example.com'];
      _setSettings(settingsProxy);
      expect(isExcludedDomain('http://another.com/page')).toBe(false);
    });

    test('should return false if excludedDomains is empty', () => {
      settingsProxy.excludedDomains = [];
      _setSettings(settingsProxy);
      expect(isExcludedDomain('http://example.com/page')).toBe(false);
    });

    test('should handle invalid URLs gracefully and return false', () => {
      settingsProxy.excludedDomains = ['example.com'];
      _setSettings(settingsProxy);
      expect(isExcludedDomain('chrome://extensions')).toBe(false);
      expect(isExcludedDomain('invalid-url')).toBe(false);
      expect(isExcludedDomain(null)).toBe(false);
      expect(isExcludedDomain(undefined)).toBe(false);
    });

    test('should be case-insensitive for domain matching', () => {
      settingsProxy.excludedDomains = ['Example.com'];
      _setSettings(settingsProxy);
      expect(isExcludedDomain('http://example.com/page')).toBe(true);
      expect(isExcludedDomain('http://EXAMPLE.COM/page')).toBe(true);
    });

     test('should handle subdomains correctly (exact match needed)', () => {
      settingsProxy.excludedDomains = ['example.com'];
      _setSettings(settingsProxy);
      expect(isExcludedDomain('http://sub.example.com/page')).toBe(false); // Not excluded unless sub.example.com is listed
      
      settingsProxy.excludedDomains = ['sub.example.com'];
      _setSettings(settingsProxy);
      expect(isExcludedDomain('http://sub.example.com/page')).toBe(true);
    });
  });

  describe('isImportantTab(url)', () => {
    beforeEach(() => {
      // Reset tabUsagePatterns before each test in this suite
      _setTabUsagePatterns({});
      tabUsagePatternsProxy = _getTabUsagePatterns();
    });

    test('should return true if importance score > IMPORTANCE_THRESHOLD_SKIP_HIBERNATE', () => {
      tabUsagePatternsProxy['example.com'] = { openCount: 10, interactionCount: 8, totalActiveTime: 5000, lastActiveTime: Date.now() };
      _setTabUsagePatterns(tabUsagePatternsProxy);
      // score = (8 / 10 * IMPORTANCE_INTERACTION_WEIGHT) + ((1 - IMPORTANCE_INTERACTION_WEIGHT) * (is high if frequently opened, assume some logic here))
      // Simplified for this test: (8/10) * 0.6 = 0.48. If we want it to be > 0.7, interaction count needs to be higher or weight different
      // Let's assume importance calculation makes it > 0.7
      // Forcing a high score:
      tabUsagePatternsProxy['example.com'].interactionCount = 10; // Score: (10/10) * 0.6 = 0.6 (Still not enough)
      // The formula in background.js is:
      // const interactionRatio = (domainPattern.interactionCount / domainPattern.openCount) || 0;
      // const importance = interactionRatio * IMPORTANCE_INTERACTION_WEIGHT;
      // To exceed 0.7 with weight 0.6, interactionRatio must be > 0.7 / 0.6 = 1.16, which is possible if interactionCount > openCount
      tabUsagePatternsProxy['example.com'].interactionCount = 12; // interactionRatio = 1.2, importance = 1.2 * 0.6 = 0.72
       _setTabUsagePatterns(tabUsagePatternsProxy);
      expect(isImportantTab('http://example.com/page1')).toBe(true);
    });

    test('should return false if importance score <= IMPORTANCE_THRESHOLD_SKIP_HIBERNATE', () => {
      tabUsagePatternsProxy['example.com'] = { openCount: 10, interactionCount: 5, totalActiveTime: 2000, lastActiveTime: Date.now() };
      _setTabUsagePatterns(tabUsagePatternsProxy);
      // interactionRatio = 5/10 = 0.5. importance = 0.5 * 0.6 = 0.3
      expect(isImportantTab('http://example.com/page2')).toBe(false);
    });

    test('should return false if domain is not in tabUsagePatterns (score is 0)', () => {
      expect(isImportantTab('http://unknown.com/page')).toBe(false);
    });

    test('should handle invalid URLs gracefully and return false', () => {
      tabUsagePatternsProxy['example.com'] = { openCount: 10, interactionCount: 10, totalActiveTime: 5000, lastActiveTime: Date.now() };
       _setTabUsagePatterns(tabUsagePatternsProxy); // Ensure some pattern exists
      expect(isImportantTab('chrome://history')).toBe(false);
      expect(isImportantTab('invalid-url-format')).toBe(false);
      expect(isImportantTab(null)).toBe(false);
    });

    test('should return false if openCount is 0 (to avoid division by zero)', () => {
      tabUsagePatternsProxy['example.com'] = { openCount: 0, interactionCount: 5, totalActiveTime: 1000, lastActiveTime: Date.now() };
      _setTabUsagePatterns(tabUsagePatternsProxy);
      // importance would be 0
      expect(isImportantTab('http://example.com/page3')).toBe(false);
    });
  });

  describe('isImportantTab(url)', () => {
    beforeEach(() => {
      // Reset tabUsagePatterns before each test in this suite
      _setTabUsagePatterns({});
      tabUsagePatternsProxy = _getTabUsagePatterns(); // Ensure proxy is updated
    });

    test('should return true if importance score > IMPORTANCE_THRESHOLD_SKIP_HIBERNATE', () => {
      tabUsagePatternsProxy['example.com'] = { openCount: 10, interactionCount: 12, totalActiveTime: 5000, lastActiveTime: Date.now() };
      // importance = (12 / 10) * 0.6 = 1.2 * 0.6 = 0.72
      // IMPORTANCE_THRESHOLD_SKIP_HIBERNATE is 0.7
      _setTabUsagePatterns(tabUsagePatternsProxy);
      expect(isImportantTab('http://example.com/page1')).toBe(true);
    });

    test('should return false if importance score <= IMPORTANCE_THRESHOLD_SKIP_HIBERNATE', () => {
      tabUsagePatternsProxy['example.com'] = { openCount: 10, interactionCount: 5, totalActiveTime: 2000, lastActiveTime: Date.now() };
      // importance = (5 / 10) * 0.6 = 0.5 * 0.6 = 0.3
      _setTabUsagePatterns(tabUsagePatternsProxy);
      expect(isImportantTab('http://example.com/page2')).toBe(false);
    });
    
    test('should return false if importance score is exactly IMPORTANCE_THRESHOLD_SKIP_HIBERNATE', () => {
      // To get score = 0.7, interactionRatio * 0.6 = 0.7 => interactionRatio = 0.7 / 0.6 = 1.1666...
      // Let openCount = 6, interactionCount = 7. Ratio = 7/6 = 1.1666...
      // Importance = (7/6) * 0.6 = 0.7
      tabUsagePatternsProxy['example.com'] = { openCount: 6, interactionCount: 7, totalActiveTime: 2000, lastActiveTime: Date.now() };
      _setTabUsagePatterns(tabUsagePatternsProxy);
      expect(isImportantTab('http://example.com/page_exact')).toBe(false); // ">" threshold, so false
    });

    test('should return false if domain is not in tabUsagePatterns (score is 0)', () => {
      expect(isImportantTab('http://unknown.com/page')).toBe(false);
    });

    test('should handle invalid URLs gracefully and return false', () => {
      tabUsagePatternsProxy['example.com'] = { openCount: 10, interactionCount: 12, totalActiveTime: 5000, lastActiveTime: Date.now() };
      _setTabUsagePatterns(tabUsagePatternsProxy); // Ensure some pattern exists
      expect(isImportantTab('chrome://history')).toBe(false); // Internal chrome URLs
      expect(isImportantTab('invalid-url-format')).toBe(false); // Malformed URLs
      expect(isImportantTab(null)).toBe(false); // Null input
      expect(isImportantTab(undefined)).toBe(false); // Undefined input
    });

    test('should return false if openCount is 0 (to avoid division by zero, importance is 0)', () => {
      tabUsagePatternsProxy['example.com'] = { openCount: 0, interactionCount: 5, totalActiveTime: 1000, lastActiveTime: Date.now() };
      _setTabUsagePatterns(tabUsagePatternsProxy);
      expect(isImportantTab('http://example.com/page3')).toBe(false);
    });

    test('should return false if interactionCount is undefined (treated as 0)', () => {
      tabUsagePatternsProxy['example.com'] = { openCount: 5, totalActiveTime: 1000, lastActiveTime: Date.now() }; // interactionCount is undefined
      _setTabUsagePatterns(tabUsagePatternsProxy);
      expect(isImportantTab('http://example.com/page_no_interaction')).toBe(false);
    });
  });

  describe('getAdaptiveThreshold()', () => {
    test('should return settings.inactivityThreshold', () => {
      settingsProxy.inactivityThreshold = 50000; // Set a specific value
      _setSettings(settingsProxy);
      expect(getAdaptiveThreshold()).toBe(50000);
    });

    test('should return default inactivityThreshold if not changed', () => {
      // Assumes ACTUAL_DEFAULT_SETTINGS.inactivityThreshold is the default
      _setSettings(JSON.parse(JSON.stringify(ACTUAL_DEFAULT_SETTINGS))); // Reset to default
      expect(getAdaptiveThreshold()).toBe(ACTUAL_DEFAULT_SETTINGS.inactivityThreshold);
    });
  });

  describe('initialize()', () => {
    let mockTabs;
    let initialSettings;

    beforeEach(() => {
      // Reset to a clean state for background.js internal variables via setters
      _setSettings(JSON.parse(JSON.stringify(ACTUAL_DEFAULT_SETTINGS)));
      _setTabUsagePatterns({});
      _setTabActivity({});
      _setLearningPeriodTimeoutId(null); // Assuming background.js uses this for the alarm/timeout

      initialSettings = JSON.parse(JSON.stringify(ACTUAL_DEFAULT_SETTINGS));

      mockTabs = [
        { id: 1, url: 'http://example.com/page1', active: true, windowId: 1, discarded: false, audible: false, pinned: false },
        { id: 2, url: 'http://another.com/page2', active: false, windowId: 1, discarded: false, audible: false, pinned: false },
      ];
      global.chrome.tabs.query.mockImplementation((options, callback) => {
        Promise.resolve().then(() => callback(mockTabs));
      });
      global.chrome.alarms.get.mockImplementation((name, callback) => {
        // Simulate no alarms exist by default for these tests
        Promise.resolve().then(() => callback(undefined));
      });
       jest.spyOn(global.Date, 'now').mockReturnValue(new Date('2024-01-01T00:00:00.000Z').getTime());
    });
    
    afterEach(() => {
        jest.restoreAllMocks(); // Clean up Date.now mock
    });

    test('should load settings from storage and merge with defaults', async () => {
      const storedSettings = { inactivityThreshold: 60 * 60 * 1000, maxHibernatedTabs: 5 };
      global.chrome.storage.local.get.mockImplementation((keys, callback) => {
        const result = { settings: storedSettings, usagePatterns: {} };
        Promise.resolve().then(() => callback(result));
      });

      await initialize(); // initialize is async due to storage operations

      const finalSettings = _getSettings();
      expect(global.chrome.storage.local.get).toHaveBeenCalledWith({ settings: initialSettings, usagePatterns: {} }, expect.any(Function));
      expect(finalSettings.inactivityThreshold).toBe(60 * 60 * 1000);
      expect(finalSettings.maxHibernatedTabs).toBe(5);
      expect(finalSettings.autoHibernate).toBe(true); // From default
    });

    test('should apply default settings if no settings are stored', async () => {
      global.chrome.storage.local.get.mockImplementation((keys, callback) => {
        Promise.resolve().then(() => callback({ settings: undefined, usagePatterns: {} })); // No settings in storage
      });

      await initialize();
      
      const finalSettings = _getSettings();
      expect(finalSettings).toEqual(expect.objectContaining(ACTUAL_DEFAULT_SETTINGS));
    });

    test('should set learningPeriodStartTime if adaptiveMode and learningPeriod are true and no startTime exists', async () => {
      initialSettings.adaptiveMode = true;
      initialSettings.learningPeriod = true;
      initialSettings.learningPeriodStartTime = null;
      _setSettings(initialSettings); // Ensure background.js starts with this state before initialize loads from "storage"

      global.chrome.storage.local.get.mockImplementation((keys, callback) => {
        Promise.resolve().then(() => callback({ settings: initialSettings, usagePatterns: {} }));
      });
       
      await initialize();

      const finalSettings = _getSettings();
      expect(finalSettings.learningPeriodStartTime).toBe(Date.now());
      expect(global.chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({
        settings: expect.objectContaining({ learningPeriodStartTime: Date.now() })
      }), expect.any(Function));
    });
    
    test('should NOT set learningPeriodStartTime if it already exists', async () => {
      const fixedStartTime = Date.now() - 100000;
      initialSettings.adaptiveMode = true;
      initialSettings.learningPeriod = true;
      initialSettings.learningPeriodStartTime = fixedStartTime;
      _setSettings(initialSettings);

      global.chrome.storage.local.get.mockImplementation((keys, callback) => {
        Promise.resolve().then(() => callback({ settings: initialSettings, usagePatterns: {} }));
      });
      
      const setSpy = jest.spyOn(global.chrome.storage.local, 'set');

      await initialize();
      
      const finalSettings = _getSettings();
      expect(finalSettings.learningPeriodStartTime).toBe(fixedStartTime);
      // Check if set was called, but NOT with a different learningPeriodStartTime
      let setCallWithStartTime = false;
      setSpy.mock.calls.forEach(call => {
        if (call[0] && call[0].settings && call[0].settings.learningPeriodStartTime !== fixedStartTime) {
            setCallWithStartTime = true;
        }
      });
      expect(setCallWithStartTime).toBe(false);
    });

    test('should load usagePatterns from storage', async () => {
      const storedPatterns = { 'example.com': { openCount: 5 } };
      global.chrome.storage.local.get.mockImplementation((keys, callback) => {
        Promise.resolve().then(() => callback({ settings: initialSettings, usagePatterns: storedPatterns }));
      });

      await initialize();

      expect(_getTabUsagePatterns()).toEqual(storedPatterns);
    });

    test('should initialize tabActivity for currently open tabs', async () => {
      global.chrome.storage.local.get.mockImplementation((keys, callback) => {
         Promise.resolve().then(() => callback({ settings: initialSettings, usagePatterns: {} }));
      });
      await initialize();
      
      const activity = _getTabActivity();
      expect(activity[1]).toEqual({ lastActive: Date.now(), domain: 'example.com' });
      expect(activity[2]).toEqual({ lastActive: Date.now(), domain: 'another.com' }); // All tabs get an initial lastActive
    });

    test('should create checkInactiveTabs and analyzeUsagePatterns alarms', async () => {
        await initialize();
        expect(global.chrome.alarms.create).toHaveBeenCalledWith('checkInactiveTabs', { periodInMinutes: 1 }); // Assuming CHECK_INTERVAL_MINUTES = 1
        expect(global.chrome.alarms.create).toHaveBeenCalledWith('analyzeUsagePatterns', { periodInMinutes: 60 }); // Assuming ANALYSIS_INTERVAL_MINUTES = 60
    });

    test('should create endLearningPeriod alarm if learningPeriod is active', async () => {
      initialSettings.adaptiveMode = true;
      initialSettings.learningPeriod = true;
      initialSettings.learningPeriodStartTime = Date.now() - (initialSettings.learningPeriodDuration / 2); // Started halfway
      _setSettings(initialSettings);
       global.chrome.storage.local.get.mockImplementation((keys, callback) => {
        Promise.resolve().then(() => callback({ settings: initialSettings, usagePatterns: {} }));
      });

      await initialize();
      
      const expectedDelay = Math.max(0, (initialSettings.learningPeriodStartTime + initialSettings.learningPeriodDuration) - Date.now());
      expect(global.chrome.alarms.create).toHaveBeenCalledWith('endLearningPeriod', { delayInMilliseconds: expectedDelay });
    });

    test('should NOT create endLearningPeriod alarm if learningPeriod is false', async () => {
      initialSettings.adaptiveMode = true;
      initialSettings.learningPeriod = false;
      _setSettings(initialSettings);
      global.chrome.storage.local.get.mockImplementation((keys, callback) => {
        Promise.resolve().then(() => callback({ settings: initialSettings, usagePatterns: {} }));
      });
      await initialize();
      expect(global.chrome.alarms.create).not.toHaveBeenCalledWith('endLearningPeriod', expect.anything());
    });
     test('should NOT create endLearningPeriod alarm if adaptiveMode is false', async () => {
      initialSettings.adaptiveMode = false;
      initialSettings.learningPeriod = true;
      _setSettings(initialSettings);
       global.chrome.storage.local.get.mockImplementation((keys, callback) => {
        Promise.resolve().then(() => callback({ settings: initialSettings, usagePatterns: {} }));
      });
      await initialize();
      expect(global.chrome.alarms.create).not.toHaveBeenCalledWith('endLearningPeriod', expect.anything());
    });
  });

  describe('Tracking Functions: trackTabDomain, trackTabInteraction, trackTabActivation', () => {
    const testUrl = 'http://trackme.com/path';
    const testDomain = 'trackme.com';
    let saveUsagePatternsSpy;

    beforeEach(() => {
      _setTabUsagePatterns({}); // Reset before each tracking test
      tabUsagePatternsProxy = _getTabUsagePatterns();
      // Spy on saveUsagePatterns if it's exported and we want to check if it's called
      // For now, we assume it is and it internally calls chrome.storage.local.set for usagePatterns
      // If saveUsagePatterns is not exported, we'd check chrome.storage.local.set({ usagePatterns: ... })
      saveUsagePatternsSpy = jest.spyOn(global.chrome.storage.local, 'set'); // Assuming saveUsagePatterns calls this
      
      jest.spyOn(global.Date, 'now').mockReturnValue(new Date('2024-01-01T10:00:00.000Z').getTime());
    });
    
    afterEach(() => {
        jest.restoreAllMocks(); // Clean up Date.now mock and other spies
    });

    describe('trackTabDomain(url)', () => {
      test('should initialize pattern for a new domain', () => {
        trackTabDomain(testUrl);
        expect(tabUsagePatternsProxy[testDomain]).toBeDefined();
        expect(tabUsagePatternsProxy[testDomain].openCount).toBe(1);
        expect(tabUsagePatternsProxy[testDomain].interactionCount).toBe(0);
        expect(tabUsagePatternsProxy[testDomain].totalActiveTime).toBe(0);
        expect(tabUsagePatternsProxy[testDomain].lastActiveTime).toBe(Date.now());
        expect(saveUsagePatternsSpy).toHaveBeenCalled();
      });

      test('should increment openCount for an existing domain and update lastActiveTime', () => {
        // Initial track
        trackTabDomain(testUrl);
        const initialTime = tabUsagePatternsProxy[testDomain].lastActiveTime;
        
        jest.spyOn(global.Date, 'now').mockReturnValue(new Date('2024-01-01T10:05:00.000Z').getTime()); // Advance time

        // Second track
        trackTabDomain(testUrl);
        expect(tabUsagePatternsProxy[testDomain].openCount).toBe(2);
        expect(tabUsagePatternsProxy[testDomain].interactionCount).toBe(0); // Should not change
        expect(tabUsagePatternsProxy[testDomain].lastActiveTime).toBe(Date.now());
        expect(tabUsagePatternsProxy[testDomain].lastActiveTime).not.toBe(initialTime);
        expect(saveUsagePatternsSpy).toHaveBeenCalledTimes(2);
      });

      test('should not process invalid URLs', () => {
        trackTabDomain('invalid-url');
        trackTabDomain(null);
        expect(Object.keys(tabUsagePatternsProxy).length).toBe(0);
        expect(saveUsagePatternsSpy).not.toHaveBeenCalled();
      });
    });

    describe('trackTabInteraction(url)', () => {
      test('should initialize pattern and set interactionCount to 1 if domain is new', () => {
        trackTabInteraction(testUrl);
        expect(tabUsagePatternsProxy[testDomain]).toBeDefined();
        expect(tabUsagePatternsProxy[testDomain].openCount).toBe(1); // Assumes trackTabInteraction also implies an open
        expect(tabUsagePatternsProxy[testDomain].interactionCount).toBe(1);
        expect(tabUsagePatternsProxy[testDomain].lastActiveTime).toBe(Date.now());
        expect(saveUsagePatternsSpy).toHaveBeenCalled();
      });

      test('should increment interactionCount and update lastActiveTime for existing domain', () => {
        trackTabDomain(testUrl); // Initial open
        saveUsagePatternsSpy.mockClear(); // Clear spy calls from domain tracking
        jest.spyOn(global.Date, 'now').mockReturnValue(new Date('2024-01-01T10:05:00.000Z').getTime()); // Advance time

        trackTabInteraction(testUrl);
        expect(tabUsagePatternsProxy[testDomain].interactionCount).toBe(1);
        expect(tabUsagePatternsProxy[testDomain].lastActiveTime).toBe(Date.now());
        expect(saveUsagePatternsSpy).toHaveBeenCalled();
      });
       test('should not process invalid URLs', () => {
        trackTabInteraction('invalid-url');
        expect(Object.keys(tabUsagePatternsProxy).length).toBe(0);
        expect(saveUsagePatternsSpy).not.toHaveBeenCalled();
      });
    });

    describe('trackTabActivation(url, sessionStartTime)', () => {
      const sessionStartTime = new Date('2024-01-01T09:55:00.000Z').getTime(); // 5 minutes before current Date.now() mock

      test('should initialize pattern if domain is new, setting totalActiveTime based on session', () => {
        trackTabActivation(testUrl, sessionStartTime); // Current time is 10:00:00
        const expectedActiveTime = Date.now() - sessionStartTime; // 5 minutes = 300000 ms
        
        expect(tabUsagePatternsProxy[testDomain]).toBeDefined();
        expect(tabUsagePatternsProxy[testDomain].openCount).toBe(1); // Assumes activation also implies an open
        expect(tabUsagePatternsProxy[testDomain].totalActiveTime).toBe(expectedActiveTime);
        expect(tabUsagePatternsProxy[testDomain].lastActiveTime).toBe(Date.now());
        expect(saveUsagePatternsSpy).toHaveBeenCalled();
      });

      test('should update totalActiveTime and lastActiveTime for existing domain', () => {
        trackTabDomain(testUrl); // Initial open, totalActiveTime = 0
        tabUsagePatternsProxy[testDomain].totalActiveTime = 100000; // Simulate some previous active time
        _setTabUsagePatterns(tabUsagePatternsProxy);
        saveUsagePatternsSpy.mockClear();
        
        jest.spyOn(global.Date, 'now').mockReturnValue(new Date('2024-01-01T10:10:00.000Z').getTime()); // Current time
        const newSessionStartTime = new Date('2024-01-01T10:08:00.000Z').getTime(); // 2 minutes active in this session
        const activeTimeInThisSession = Date.now() - newSessionStartTime; // 120000 ms

        trackTabActivation(testUrl, newSessionStartTime);
        
        expect(tabUsagePatternsProxy[testDomain].totalActiveTime).toBe(100000 + activeTimeInThisSession);
        expect(tabUsagePatternsProxy[testDomain].lastActiveTime).toBe(Date.now());
        expect(saveUsagePatternsSpy).toHaveBeenCalled();
      });
      
      test('should handle sessionStartTime being later than Date.now() (active time is 0)', () => {
        const futureSessionStartTime = Date.now() + 10000; // Start time in the future
        trackTabActivation(testUrl, futureSessionStartTime);
        expect(tabUsagePatternsProxy[testDomain].totalActiveTime).toBe(0);
        expect(saveUsagePatternsSpy).toHaveBeenCalled();
      });

      test('should not process invalid URLs', () => {
        trackTabActivation('invalid-url', sessionStartTime);
        expect(Object.keys(tabUsagePatternsProxy).length).toBe(0);
        expect(saveUsagePatternsSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('analyzeUsagePatterns()', () => {
    let setStorageSpy;

    beforeEach(() => {
      _setSettings(JSON.parse(JSON.stringify(ACTUAL_DEFAULT_SETTINGS)));
      settingsProxy = _getSettings();
      _setTabUsagePatterns({});
      tabUsagePatternsProxy = _getTabUsagePatterns();
      
      setStorageSpy = jest.spyOn(global.chrome.storage.local, 'set');
      jest.spyOn(global.Date, 'now').mockReturnValue(new Date('2024-01-10T00:00:00.000Z').getTime()); // Consistent time for 'lastAnalyzed'
    });
    
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('should do nothing if adaptiveMode is false', () => {
      settingsProxy.adaptiveMode = false;
      _setSettings(settingsProxy);
      analyzeUsagePatterns();
      expect(setStorageSpy).not.toHaveBeenCalled();
    });

    test('should do nothing if learningPeriod is true', () => {
      settingsProxy.adaptiveMode = true;
      settingsProxy.learningPeriod = true;
      _setSettings(settingsProxy);
      analyzeUsagePatterns();
      expect(setStorageSpy).not.toHaveBeenCalled();
    });

    test('should recalculate importance and update lastAnalyzed for domains', () => {
      settingsProxy.adaptiveMode = true;
      settingsProxy.learningPeriod = false;
      _setSettings(settingsProxy);

      tabUsagePatternsProxy['site1.com'] = { openCount: 10, interactionCount: 2, totalActiveTime: 100, lastActiveTime: Date.now() - 1000 };
      // importance = (2/10) * 0.6 = 0.12
      tabUsagePatternsProxy['site2.com'] = { openCount: 5, interactionCount: 4, totalActiveTime: 200, lastActiveTime: Date.now() - 2000 };
      // importance = (4/5) * 0.6 = 0.48
      _setTabUsagePatterns(tabUsagePatternsProxy);

      analyzeUsagePatterns();

      expect(tabUsagePatternsProxy['site1.com'].importance).toBeCloseTo(0.12);
      expect(tabUsagePatternsProxy['site1.com'].lastAnalyzed).toBe(Date.now());
      expect(tabUsagePatternsProxy['site2.com'].importance).toBeCloseTo(0.48);
      expect(tabUsagePatternsProxy['site2.com'].lastAnalyzed).toBe(Date.now());
      expect(setStorageSpy).toHaveBeenCalledWith(expect.objectContaining({
        usagePatterns: expect.objectContaining({
          'site1.com': expect.objectContaining({ importance: expect.any(Number), lastAnalyzed: Date.now() }),
          'site2.com': expect.objectContaining({ importance: expect.any(Number), lastAnalyzed: Date.now() })
        })
      }), expect.any(Function));
    });

    test('should add domain to excludedDomains if importance > IMPORTANCE_THRESHOLD_AUTO_EXCLUDE', () => {
      settingsProxy.adaptiveMode = true;
      settingsProxy.learningPeriod = false;
      settingsProxy.excludedDomains = ['alreadyexcluded.com']; // Initial excluded domains
      _setSettings(settingsProxy);

      // This site will exceed the auto-exclude threshold (0.9)
      // importance = (10/6) * 0.6 = 1.666 * 0.6 = 1.0
      tabUsagePatternsProxy['autoexclude.com'] = { openCount: 6, interactionCount: 10, totalActiveTime: 500, lastActiveTime: Date.now() - 500 };
      tabUsagePatternsProxy['staynormal.com'] = { openCount: 5, interactionCount: 1, totalActiveTime: 100, lastActiveTime: Date.now() - 1000 };
      _setTabUsagePatterns(tabUsagePatternsProxy);
      
      analyzeUsagePatterns();

      const finalSettings = _getSettings();
      expect(finalSettings.excludedDomains).toContain('autoexclude.com');
      expect(finalSettings.excludedDomains).toContain('alreadyexcluded.com'); // Should not remove existing
      expect(finalSettings.excludedDomains.length).toBe(2);
      
      expect(tabUsagePatternsProxy['autoexclude.com'].importance).toBeCloseTo(1.0);
      expect(setStorageSpy).toHaveBeenCalledTimes(1); // Once for usagePatterns, once for settings
      expect(setStorageSpy).toHaveBeenCalledWith(expect.objectContaining({
        settings: expect.objectContaining({ excludedDomains: expect.arrayContaining(['autoexclude.com', 'alreadyexcluded.com']) })
      }), expect.any(Function));
    });
    
    test('should not add domain to excludedDomains if already present', () => {
      settingsProxy.adaptiveMode = true;
      settingsProxy.learningPeriod = false;
      settingsProxy.excludedDomains = ['autoexclude.com']; // Already excluded
      _setSettings(settingsProxy);
      
      tabUsagePatternsProxy['autoexclude.com'] = { openCount: 6, interactionCount: 10, totalActiveTime: 500, lastActiveTime: Date.now() - 500 };
       _setTabUsagePatterns(tabUsagePatternsProxy);

      analyzeUsagePatterns();
      
      const finalSettings = _getSettings();
      expect(finalSettings.excludedDomains.filter(d => d === 'autoexclude.com').length).toBe(1); // Ensure no duplicates
      expect(finalSettings.excludedDomains.length).toBe(1);
      // Check that set was called, but settings might not have changed if no *new* exclusions
       expect(setStorageSpy).toHaveBeenCalledWith(expect.objectContaining({
        settings: expect.objectContaining({ excludedDomains: ['autoexclude.com'] })
      }), expect.any(Function));
    });
  });

  describe('endLearningPeriod()', () => {
    let setStorageSpy;
    // Mock analyzeUsagePatterns as its detailed testing is separate
    // We only want to check if endLearningPeriod calls it.
    // This requires analyzeUsagePatterns to be part of the module.exports from background.js
    let analyzeUsagePatternsSpy;


    beforeEach(() => {
      _setSettings(JSON.parse(JSON.stringify(ACTUAL_DEFAULT_SETTINGS)));
      settingsProxy = _getSettings();
      setStorageSpy = jest.spyOn(global.chrome.storage.local, 'set');
      
      // This is tricky. If analyzeUsagePatterns is not exported, we can't directly spy on it.
      // We would have to rely on its side effects (like calling setStorageSpy again),
      // which makes the test less direct.
      // For now, let's assume 'analyzeUsagePatterns' IS exported and can be spied on.
      // If not, the test for 'calls analyzeUsagePatterns' needs to be different.
      // analyzeUsagePatternsSpy = jest.spyOn(require('./background'), 'analyzeUsagePatterns');
      // The above spyOn won't work well with the current setup where functions are destructured.
      // Instead, we'd need to mock the module or test its side effects.
      // For now, we'll check if setStorage is called by analyzeUsagePatterns as an indirect way.
    });

    afterEach(() => {
      jest.restoreAllMocks();
      // if (analyzeUsagePatternsSpy) analyzeUsagePatternsSpy.mockRestore();
    });

    test('should do nothing if adaptiveMode is false', () => {
      settingsProxy.adaptiveMode = false;
      settingsProxy.learningPeriod = true; // Ensure learning period is true
      _setSettings(settingsProxy);
      
      endLearningPeriod();
      
      expect(settingsProxy.learningPeriod).toBe(true); // Should not change
      expect(setStorageSpy).not.toHaveBeenCalled();
    });

    test('should do nothing if learningPeriod is already false', () => {
      settingsProxy.adaptiveMode = true;
      settingsProxy.learningPeriod = false;
      _setSettings(settingsProxy);
      
      endLearningPeriod();
      
      expect(setStorageSpy).not.toHaveBeenCalled();
    });

    test('should set learningPeriod to false and save settings', () => {
      settingsProxy.adaptiveMode = true;
      settingsProxy.learningPeriod = true;
      _setSettings(settingsProxy);
      
      endLearningPeriod();
      
      const finalSettings = _getSettings();
      expect(finalSettings.learningPeriod).toBe(false);
      expect(setStorageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ settings: expect.objectContaining({ learningPeriod: false }) }),
        expect.any(Function)
      );
    });

    test('should call analyzeUsagePatterns after ending learning period', () => {
      settingsProxy.adaptiveMode = true;
      settingsProxy.learningPeriod = true;
      _setSettings(settingsProxy);
      
      // Add some patterns to ensure analyzeUsagePatterns has something to do (and thus calls set)
      _setTabUsagePatterns({ 'test.com': { openCount:1, interactionCount:1, totalActiveTime:1, lastActiveTime:1 }});

      endLearningPeriod();
      
      // analyzeUsagePatterns internally calls set for usagePatterns and potentially settings.
      // We expect at least two calls to set:
      // 1. From endLearningPeriod itself (for settings.learningPeriod = false)
      // 2. From analyzeUsagePatterns (for usagePatterns, and settings if exclusions change)
      // The exact number of calls depends on analyzeUsagePatterns' logic.
      // Here, we primarily check that analyzeUsagePatterns *was* called,
      // which we infer by the settings being updated and potentially usagePatterns being saved again.
      expect(setStorageSpy.mock.calls.length).toBeGreaterThanOrEqual(1); 
      // More specific check: one call updates learningPeriod, another might update usagePatterns
      expect(setStorageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ settings: expect.objectContaining({ learningPeriod: false }) }),
        expect.any(Function)
      );
       // If analyzeUsagePatterns updates patterns, it will call set again.
       // This is an indirect way to check if analyzeUsagePatterns was called.
      expect(setStorageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ usagePatterns: expect.any(Object) }),
        expect.any(Function)
      );
    });
  });

  describe('Alarm Handling (handleAlarm)', () => {
    // Mock the functions that would be called by the alarms
    // These would need to be part of the 'require("./background")' destructuring
    // For now, we'll assume they are, and if not, the test will fail, indicating they need to be exported.
    // Or, we can use jest.spyOn(backgroundModule, 'functionName') if backgroundModule is the result of require.
    
    // To truly test handleAlarm, we need to import it.
    // And to test that handleAlarm calls the *correct versions* of these functions from background.js,
    // those functions (checkInactiveTabs, analyzeUsagePatterns, endLearningPeriod) must also be spied upon.
    // This requires a slightly different import style or module mocking.
    
    // Let's assume background.js exports:
    // handleAlarm, checkInactiveTabs, analyzeUsagePatterns, endLearningPeriod,
    // CHECK_ALARM_NAME, ANALYSIS_ALARM_NAME, LEARNING_PERIOD_ALARM_NAME

    let mockCheckInactiveTabs;
    let mockAnalyzeUsagePatterns;
    let mockEndLearningPeriod;
    
    // This is a common pattern: require the module, then spy on its methods.
    const backgroundModule = require('./background');
    // These constants need to be defined in background.js and exported.
    // If not, the tests will use 'undefined' and likely fail or be incorrect.
    const CHECK_ALARM_NAME_CONST = backgroundModule.CHECK_ALARM_NAME || 'checkInactiveTabs';
    const ANALYSIS_ALARM_NAME_CONST = backgroundModule.ANALYSIS_ALARM_NAME || 'analyzeUsagePatterns';
    const LEARNING_PERIOD_ALARM_NAME_CONST = backgroundModule.LEARNING_PERIOD_ALARM_NAME || 'endLearningPeriod';


    beforeEach(() => {
      // Reset settings and other relevant state
      _setSettings(JSON.parse(JSON.stringify(ACTUAL_DEFAULT_SETTINGS)));
      settingsProxy = _getSettings();
      _setTabUsagePatterns({}); // In case analyzeUsagePatterns is called

      // Spy on the functions expected to be called by handleAlarm
      // This assumes they are methods of the imported module or can be spied on.
      // If they are just loose functions, this won't work without module-level mocking.
      mockCheckInactiveTabs = jest.spyOn(backgroundModule, 'checkInactiveTabs').mockImplementation(() => {});
      mockAnalyzeUsagePatterns = jest.spyOn(backgroundModule, 'analyzeUsagePatterns').mockImplementation(() => {});
      mockEndLearningPeriod = jest.spyOn(backgroundModule, 'endLearningPeriod').mockImplementation(() => {});
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('should call checkInactiveTabs when "checkInactiveTabs" alarm fires', () => {
      backgroundModule.handleAlarm({ name: CHECK_ALARM_NAME_CONST });
      expect(mockCheckInactiveTabs).toHaveBeenCalledTimes(1);
      expect(mockAnalyzeUsagePatterns).not.toHaveBeenCalled();
      expect(mockEndLearningPeriod).not.toHaveBeenCalled();
    });

    test('should call analyzeUsagePatterns when "analyzeUsagePatterns" alarm fires', () => {
      settingsProxy.adaptiveMode = true; // analyzeUsagePatterns might check this
      settingsProxy.learningPeriod = false;
      _setSettings(settingsProxy);

      backgroundModule.handleAlarm({ name: ANALYSIS_ALARM_NAME_CONST });
      expect(mockAnalyzeUsagePatterns).toHaveBeenCalledTimes(1);
      expect(mockCheckInactiveTabs).not.toHaveBeenCalled();
      expect(mockEndLearningPeriod).not.toHaveBeenCalled();
    });

    test('should call endLearningPeriod when "endLearningPeriod" alarm fires', () => {
      settingsProxy.adaptiveMode = true; // endLearningPeriod checks this
      settingsProxy.learningPeriod = true; // endLearningPeriod checks this
      _setSettings(settingsProxy);
      
      backgroundModule.handleAlarm({ name: LEARNING_PERIOD_ALARM_NAME_CONST });
      expect(mockEndLearningPeriod).toHaveBeenCalledTimes(1);
      expect(mockCheckInactiveTabs).not.toHaveBeenCalled();
      expect(mockAnalyzeUsagePatterns).not.toHaveBeenCalled(); // endLearningPeriod calls analyzeUsagePatterns internally, so this might be >0 if not mocked deeply
    });
    
    test('should do nothing for an unknown alarm name', () => {
      backgroundModule.handleAlarm({ name: 'unknownAlarmTest' });
      expect(mockCheckInactiveTabs).not.toHaveBeenCalled();
      expect(mockAnalyzeUsagePatterns).not.toHaveBeenCalled();
      expect(mockEndLearningPeriod).not.toHaveBeenCalled();
    });
  });

  describe('Settings Change Handler (handleStorageChange)', () => {
    const LEARNING_PERIOD_ALARM_NAME_CONST = (require('./background').LEARNING_PERIOD_ALARM_NAME || 'endLearningPeriod');
    let initialSettingsCopy;

    beforeEach(() => {
      initialSettingsCopy = JSON.parse(JSON.stringify(ACTUAL_DEFAULT_SETTINGS));
      _setSettings(initialSettingsCopy); // Set initial state in background.js
      settingsProxy = _getSettings(); // Get proxy to background.js's settings

      _setTabUsagePatterns({ 'existing.com': { openCount: 1 } }); // Initial patterns

      jest.spyOn(global.Date, 'now').mockReturnValue(new Date('2024-01-15T00:00:00.000Z').getTime());
      global.chrome.alarms.clear.mockClear();
      global.chrome.alarms.create.mockClear();
      global.chrome.storage.local.set.mockClear(); // To check if settings are re-saved
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('should update local settings with changed values', () => {
      const changes = {
        settings: {
          newValue: { ...settingsProxy, inactivityThreshold: 10000, maxHibernatedTabs: 3 },
          oldValue: { ...settingsProxy }
        }
      };
      backgroundModule.handleStorageChange(changes, 'local');
      
      const updatedSettings = _getSettings();
      expect(updatedSettings.inactivityThreshold).toBe(10000);
      expect(updatedSettings.maxHibernatedTabs).toBe(3);
    });

    test('should update local tabUsagePatterns with changed values', () => {
      const newPatterns = { 'newly.com': { openCount: 10 } };
      const changes = {
        usagePatterns: {
          newValue: newPatterns,
          oldValue: _getTabUsagePatterns()
        }
      };
      backgroundModule.handleStorageChange(changes, 'local');
      expect(_getTabUsagePatterns()).toEqual(newPatterns);
    });

    test('should ignore changes not in "local" storage area', () => {
      const changes = { settings: { newValue: { inactivityThreshold: 10000 } } };
      backgroundModule.handleStorageChange(changes, 'sync');
      expect(_getSettings().inactivityThreshold).toBe(initialSettingsCopy.inactivityThreshold); // Should not change
    });

    test('should ignore changes if newValue is undefined (e.g. on clear)', () => {
       const changes = { settings: { newValue: undefined, oldValue: {...settingsProxy} } };
       backgroundModule.handleStorageChange(changes, 'local');
       expect(_getSettings()).toEqual(initialSettingsCopy); // Should not change from initial test setup
    });

    describe('Learning Period Alarm Management on Settings Change', () => {
      test('should start learning period if adaptiveMode and learningPeriod are newly enabled', () => {
        settingsProxy.adaptiveMode = false; // Initially off
        settingsProxy.learningPeriod = false;
        _setSettings(JSON.parse(JSON.stringify(settingsProxy))); // Save this initial state to background.js

        const changes = {
          settings: {
            newValue: { ...settingsProxy, adaptiveMode: true, learningPeriod: true, learningPeriodStartTime: null },
            oldValue: { ...settingsProxy }
          }
        };
        backgroundModule.handleStorageChange(changes, 'local');
        
        const finalSettings = _getSettings();
        expect(finalSettings.learningPeriodStartTime).toBe(Date.now());
        expect(global.chrome.alarms.create).toHaveBeenCalledWith(LEARNING_PERIOD_ALARM_NAME_CONST, { delayInMilliseconds: finalSettings.learningPeriodDuration });
        expect(global.chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({
            settings: expect.objectContaining({ learningPeriodStartTime: Date.now() })
        }), expect.any(Function));
      });

      test('should clear learning period alarm if adaptiveMode is disabled', () => {
        settingsProxy.adaptiveMode = true;
        settingsProxy.learningPeriod = true;
        settingsProxy.learningPeriodStartTime = Date.now() - 1000;
        _setSettings(JSON.parse(JSON.stringify(settingsProxy)));

        const changes = {
          settings: {
            newValue: { ...settingsProxy, adaptiveMode: false },
            oldValue: { ...settingsProxy }
          }
        };
        backgroundModule.handleStorageChange(changes, 'local');
        expect(global.chrome.alarms.clear).toHaveBeenCalledWith(LEARNING_PERIOD_ALARM_NAME_CONST);
      });
      
      test('should clear learning period alarm if learningPeriod setting is disabled', () => {
        settingsProxy.adaptiveMode = true;
        settingsProxy.learningPeriod = true;
        settingsProxy.learningPeriodStartTime = Date.now() - 1000;
         _setSettings(JSON.parse(JSON.stringify(settingsProxy)));

        const changes = {
          settings: {
            newValue: { ...settingsProxy, learningPeriod: false },
            oldValue: { ...settingsProxy }
          }
        };
        backgroundModule.handleStorageChange(changes, 'local');
        expect(global.chrome.alarms.clear).toHaveBeenCalledWith(LEARNING_PERIOD_ALARM_NAME_CONST);
      });

      test('should reset learning period alarm if settings change but learning continues and startTime exists', () => {
        const startTime = Date.now() - (initialSettingsCopy.learningPeriodDuration / 4); // 1/4 through
        settingsProxy.adaptiveMode = true;
        settingsProxy.learningPeriod = true;
        settingsProxy.learningPeriodStartTime = startTime;
        _setSettings(JSON.parse(JSON.stringify(settingsProxy)));

        const changes = {
          settings: { // e.g., inactivityThreshold changed, but learning mode is still on
            newValue: { ...settingsProxy, inactivityThreshold: settingsProxy.inactivityThreshold + 1000 },
            oldValue: { ...settingsProxy }
          }
        };
        backgroundModule.handleStorageChange(changes, 'local');
        
        const remainingTime = (startTime + initialSettingsCopy.learningPeriodDuration) - Date.now();
        expect(global.chrome.alarms.clear).toHaveBeenCalledWith(LEARNING_PERIOD_ALARM_NAME_CONST);
        expect(global.chrome.alarms.create).toHaveBeenCalledWith(LEARNING_PERIOD_ALARM_NAME_CONST, { delayInMilliseconds: Math.max(0, remainingTime) });
      });
      
       test('should not try to reset learning alarm if learningPeriodStartTime is null (e.g. learning never started or just ended)', () => {
        settingsProxy.adaptiveMode = true;
        settingsProxy.learningPeriod = true; // Still true
        settingsProxy.learningPeriodStartTime = null; // But no start time
        _setSettings(JSON.parse(JSON.stringify(settingsProxy)));

        const changes = {
          settings: {
            newValue: { ...settingsProxy, inactivityThreshold: settingsProxy.inactivityThreshold + 1000 },
            oldValue: { ...settingsProxy }
          }
        };
        backgroundModule.handleStorageChange(changes, 'local');
        // Alarm should be cleared (as part of ensuring correct state) but not necessarily re-created if no start time
        expect(global.chrome.alarms.clear).toHaveBeenCalledWith(LEARNING_PERIOD_ALARM_NAME_CONST);
        // Check that create was not called with endLearningPeriod alarm if learningPeriodStartTime is still null after update
        const createCallsForLearningAlarm = global.chrome.alarms.create.mock.calls.filter(
            call => call[0] === LEARNING_PERIOD_ALARM_NAME_CONST
        );
        // It might be created if the change *itself* starts the learning period.
        // In this specific test, the change doesn't re-initiate learning period start time.
        // So, if startTime is still null, no new alarm.
        if (_getSettings().learningPeriodStartTime === null) {
            expect(createCallsForLearningAlarm.length).toBe(0);
        }
      });
    });
  });

});

// Helper to simulate alarm firing
// const simulateAlarmFire = (alarmName) => {
//   const alarmListener = global.chrome.alarms.onAlarm.addListener.mock.calls[0][0];
//   alarmListener({ name: alarmName });
// };

// Helper to simulate storage change
// const simulateStorageChange = (changes, areaName) => {
//   if (areaName === 'local') {
//     const storageListener = global.chrome.storage.onChanged.addListener.mock.calls[0][0];
//     storageListener(changes, areaName);
//   }
// };

// At the very end of this file, if background.js is modified for module.exports:
// jest.mock('./background', () => {
//   const originalModule = jest.requireActual('./background');
//   return {
//     ...originalModule,
//     // Mock specific functions if needed, e.g., saveUsagePatterns if it's too complex
//     // or has side effects not relevant to the current test unit.
//   };
// });
