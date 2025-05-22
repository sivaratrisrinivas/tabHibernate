// Mock Chrome APIs
global.chrome = {
  alarms: { // Though not directly used by these functions, good to have a basic mock
    create: jest.fn(),
    get: jest.fn(),
    clear: jest.fn(),
    onAlarm: { addListener: jest.fn() },
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
      onChanged: { addListener: jest.fn() },
    },
  },
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn(),
    discard: jest.fn(),
    // Mock other tab events if they were relevant, but not for these specific functions
    onUpdated: { addListener: jest.fn() },
    onActivated: { addListener: jest.fn() },
    onRemoved: { addListener: jest.fn() },
  },
  runtime: { // Basic mock
    onInstalled: { addListener: jest.fn() },
    onMessage: { addListener: jest.fn() },
    getURL: (path) => `chrome-extension://test-extension-id/${path}`,
    id: 'test-extension-id',
  },
  action: { // Basic mock
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn(),
  }
};

// Import functions and constants from background.js
// This assumes background.js has been modified to use module.exports
// and exports the necessary functions and state accessors.
const backgroundModule = require('./background');
const {
  // Functions to test
  checkInactiveTabs,
  unloadTab, // Renamed from hibernateTab in previous tasks, assuming consistency
  
  // State accessors (assuming these are exported from background.js)
  _setSettings,
  _getSettings,
  _setTabActivity,
  _getTabActivity,
  // _setTabUsagePatterns, // Not directly used here but good for consistency if needed
  // _getTabUsagePatterns,
  
  // Other functions that might be dependencies (mocked or real)
  // isExcludedDomain, // Will be mocked via backgroundModule
  // isImportantTab,   // Will be mocked via backgroundModule
  // getAdaptiveThreshold, // Will be mocked via backgroundModule
} = backgroundModule;

// Default settings structure, similar to ACTUAL_DEFAULT_SETTINGS in core tests
const DEFAULT_TEST_SETTINGS = {
    enabled: true, // Extension enabled by default for tests
    inactivityThreshold: 30 * 60 * 1000, // 30 minutes
    maxHibernatedTabs: 10,
    autoHibernate: true,
    excludedDomains: ["youtube.com", "docs.google.com"],
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
    debugMode: false,
    excludePinnedTabs: false, // Default for testing this feature
    // Add any other settings relevant to these tests
};

describe('Background Script Tab Management', () => {
  let settingsProxy;
  let tabActivityProxy;
  let mockDateNow;

  beforeEach(() => {
    jest.clearAllMocks();

    // Deep clone DEFAULT_TEST_SETTINGS and set it in background.js
    const currentSettings = JSON.parse(JSON.stringify(DEFAULT_TEST_SETTINGS));
    _setSettings(currentSettings);
    settingsProxy = _getSettings(); // Get a live reference

    // Reset tabActivity in background.js
    _setTabActivity({});
    tabActivityProxy = _getTabActivity();

    // Mock Date.now() for consistent time checks
    mockDateNow = jest.spyOn(global.Date, 'now').mockReturnValue(new Date('2024-02-01T12:00:00.000Z').getTime());

    // Mock dependent functions from background.js itself
    // These will be controlled per test suite or test case if their behavior needs to vary.
    if (backgroundModule.isExcludedDomain) {
        jest.spyOn(backgroundModule, 'isExcludedDomain').mockReturnValue(false);
    }
    if (backgroundModule.isImportantTab) {
        jest.spyOn(backgroundModule, 'isImportantTab').mockReturnValue(false);
    }
    if (backgroundModule.getAdaptiveThreshold) {
        // Default to returning the standard inactivity threshold
        jest.spyOn(backgroundModule, 'getAdaptiveThreshold').mockImplementation(() => settingsProxy.inactivityThreshold);
    }
    
    // Default mock implementations for Chrome APIs that return promises
    chrome.tabs.query.mockResolvedValue([]); // Default to no tabs
    chrome.tabs.sendMessage.mockResolvedValue({ success: true, state: { scrollY: 0 } }); // Default success
    chrome.tabs.discard.mockResolvedValue(undefined); // Default success (discard doesn't return a value)
    chrome.storage.local.set.mockImplementation((items, callback) => {
      if (callback) {
        Promise.resolve().then(callback);
      }
      return Promise.resolve();
    });
    chrome.storage.local.get.mockImplementation((keys, callback) => {
        // Simplified: assumes getting settings or usagePatterns, adapt if more complex gets are needed
        const result = {};
        if (typeof keys === 'string' && keys === 'settings') result.settings = settingsProxy;
        else if (typeof keys === 'object' && keys.settings) result.settings = keys.settings; // Use default from get if specified
        else result.settings = settingsProxy;

        if (callback) Promise.resolve().then(() => callback(result));
        else return Promise.resolve(result);
    });

  });

  afterEach(() => {
    mockDateNow.mockRestore(); // Restore original Date.now
    jest.restoreAllMocks(); // Restore all other mocks
  });

  // Test suites for checkInactiveTabs and unloadTab will go here
  describe('checkInactiveTabs()', () => {
    let mockTabs;
    let unloadTabSpy; // Spy on backgroundModule.unloadTab

    beforeEach(() => {
      // Reset settings for each test to ensure defaults or specific overrides
      _setSettings(JSON.parse(JSON.stringify(DEFAULT_TEST_SETTINGS)));
      settingsProxy = _getSettings();

      _setTabActivity({});
      tabActivityProxy = _getTabActivity();
      
      // Spy on unloadTab from the imported backgroundModule
      // Ensure unloadTab is exported from background.js for this to work
      if (backgroundModule.unloadTab) {
        unloadTabSpy = jest.spyOn(backgroundModule, 'unloadTab').mockImplementation(async () => {}); // Mock implementation
      } else {
        // Fallback or error if unloadTab is not exported, though the task implies it should be
        console.error("Warning: backgroundModule.unloadTab is not defined. Cannot spy on it.");
        unloadTabSpy = jest.fn(); // Dummy spy
      }

      // Default mocks for functions called by checkInactiveTabs
      // These can be overridden in specific tests
      if (backgroundModule.isExcludedDomain) jest.spyOn(backgroundModule, 'isExcludedDomain').mockReturnValue(false);
      if (backgroundModule.isImportantTab) jest.spyOn(backgroundModule, 'isImportantTab').mockReturnValue(false);
      if (backgroundModule.getAdaptiveThreshold) jest.spyOn(backgroundModule, 'getAdaptiveThreshold').mockReturnValue(settingsProxy.inactivityThreshold);
      
      chrome.tabs.query.mockResolvedValue([]); // Default to no tabs
    });

    test('should not run if settings.enabled is false', async () => {
      settingsProxy.enabled = false;
      _setSettings(settingsProxy);
      await checkInactiveTabs();
      expect(chrome.tabs.query).not.toHaveBeenCalled();
      expect(unloadTabSpy).not.toHaveBeenCalled();
    });

    test('should correctly identify and try to unload an inactive tab', async () => {
      mockTabs = [{ id: 101, active: false, pinned: false, url: "http://inactive.com", discarded: false, autoDiscardable: true }];
      chrome.tabs.query.mockResolvedValue(mockTabs);
      tabActivityProxy[101] = { lastActive: Date.now() - (settingsProxy.inactivityThreshold + 1000) }; // Clearly inactive
      _setTabActivity(tabActivityProxy);

      await checkInactiveTabs();
      expect(unloadTabSpy).toHaveBeenCalledWith(mockTabs[0]);
    });

    test('should skip active tabs', async () => {
      mockTabs = [{ id: 102, active: true, pinned: false, url: "http://active.com", discarded: false, autoDiscardable: true }];
      chrome.tabs.query.mockResolvedValue(mockTabs);
      tabActivityProxy[102] = { lastActive: Date.now() - (settingsProxy.inactivityThreshold + 1000) };
      _setTabActivity(tabActivityProxy);
      
      await checkInactiveTabs();
      expect(unloadTabSpy).not.toHaveBeenCalled();
    });

    test('should skip tabs with no tabActivity entry', async () => {
      mockTabs = [{ id: 103, active: false, pinned: false, url: "http://noactivity.com", discarded: false, autoDiscardable: true }];
      chrome.tabs.query.mockResolvedValue(mockTabs);
      // No entry in tabActivityProxy for tab 103

      await checkInactiveTabs();
      expect(unloadTabSpy).not.toHaveBeenCalled();
    });
    
    test('should skip recently active tabs (within threshold)', async () => {
      mockTabs = [{ id: 104, active: false, pinned: false, url: "http://recent.com", discarded: false, autoDiscardable: true }];
      chrome.tabs.query.mockResolvedValue(mockTabs);
      tabActivityProxy[104] = { lastActive: Date.now() - (settingsProxy.inactivityThreshold - 10000) }; // Active 10s ago, inside threshold
       _setTabActivity(tabActivityProxy);

      await checkInactiveTabs();
      expect(unloadTabSpy).not.toHaveBeenCalled();
    });

    describe('Exclusion Logic', () => {
      test('should skip pinned tabs if settings.excludePinnedTabs is true', async () => {
        settingsProxy.excludePinnedTabs = true;
        _setSettings(settingsProxy);
        mockTabs = [{ id: 201, active: false, pinned: true, url: "http://pinned.com", discarded: false, autoDiscardable: true }];
        chrome.tabs.query.mockResolvedValue(mockTabs);
        tabActivityProxy[201] = { lastActive: Date.now() - (settingsProxy.inactivityThreshold + 1000) };
        _setTabActivity(tabActivityProxy);

        await checkInactiveTabs();
        expect(unloadTabSpy).not.toHaveBeenCalled();
      });

      test('should NOT skip pinned tabs if settings.excludePinnedTabs is false', async () => {
        settingsProxy.excludePinnedTabs = false;
        _setSettings(settingsProxy);
        mockTabs = [{ id: 202, active: false, pinned: true, url: "http://pinnedbutok.com", discarded: false, autoDiscardable: true }];
        chrome.tabs.query.mockResolvedValue(mockTabs);
        tabActivityProxy[202] = { lastActive: Date.now() - (settingsProxy.inactivityThreshold + 1000) };
        _setTabActivity(tabActivityProxy);
        
        await checkInactiveTabs();
        expect(unloadTabSpy).toHaveBeenCalledWith(mockTabs[0]);
      });

      test('should skip tabs in excluded domains', async () => {
        if (backgroundModule.isExcludedDomain) backgroundModule.isExcludedDomain.mockReturnValue(true);
        mockTabs = [{ id: 203, active: false, pinned: false, url: "http://excluded.com", discarded: false, autoDiscardable: true }];
        chrome.tabs.query.mockResolvedValue(mockTabs);
        tabActivityProxy[203] = { lastActive: Date.now() - (settingsProxy.inactivityThreshold + 1000) };
        _setTabActivity(tabActivityProxy);

        await checkInactiveTabs();
        expect(unloadTabSpy).not.toHaveBeenCalled();
        expect(backgroundModule.isExcludedDomain).toHaveBeenCalledWith(mockTabs[0].url);
      });
    });

    describe('Adaptive Mode Logic', () => {
      beforeEach(() => {
        settingsProxy.adaptiveMode = true;
        _setSettings(settingsProxy); // Ensure adaptiveMode is on for these tests
      });

      test('should skip important tabs if adaptiveMode is true and learningPeriod is false', async () => {
        settingsProxy.learningPeriod = false;
        _setSettings(settingsProxy);
        if (backgroundModule.isImportantTab) backgroundModule.isImportantTab.mockReturnValue(true);

        mockTabs = [{ id: 301, active: false, pinned: false, url: "http://important.com", discarded: false, autoDiscardable: true }];
        chrome.tabs.query.mockResolvedValue(mockTabs);
        tabActivityProxy[301] = { lastActive: Date.now() - (settingsProxy.inactivityThreshold + 1000) };
        _setTabActivity(tabActivityProxy);

        await checkInactiveTabs();
        expect(unloadTabSpy).not.toHaveBeenCalled();
        expect(backgroundModule.isImportantTab).toHaveBeenCalledWith(mockTabs[0].url);
      });

      test('should NOT skip important tabs if learningPeriod is true (even if adaptiveMode is true)', async () => {
        settingsProxy.learningPeriod = true; // Learning period is ON
        _setSettings(settingsProxy);
        if (backgroundModule.isImportantTab) backgroundModule.isImportantTab.mockReturnValue(true); // Tab is "important"

        mockTabs = [{ id: 302, active: false, pinned: false, url: "http://importantduringlearning.com", discarded: false, autoDiscardable: true }];
        chrome.tabs.query.mockResolvedValue(mockTabs);
        tabActivityProxy[302] = { lastActive: Date.now() - (settingsProxy.inactivityThreshold + 1000) };
        _setTabActivity(tabActivityProxy);

        await checkInactiveTabs();
        expect(unloadTabSpy).toHaveBeenCalledWith(mockTabs[0]);
        expect(backgroundModule.isImportantTab).not.toHaveBeenCalled(); // isImportantTab should not even be called if learningPeriod is true
      });

      test('should NOT skip important tabs if adaptiveMode is false', async () => {
        settingsProxy.adaptiveMode = false; // Adaptive mode is OFF
        settingsProxy.learningPeriod = false;
        _setSettings(settingsProxy);
        if (backgroundModule.isImportantTab) backgroundModule.isImportantTab.mockReturnValue(true); // Tab is "important"

        mockTabs = [{ id: 303, active: false, pinned: false, url: "http://importantnoadaptive.com", discarded: false, autoDiscardable: true }];
        chrome.tabs.query.mockResolvedValue(mockTabs);
        tabActivityProxy[303] = { lastActive: Date.now() - (settingsProxy.inactivityThreshold + 1000) };
        _setTabActivity(tabActivityProxy);

        await checkInactiveTabs();
        expect(unloadTabSpy).toHaveBeenCalledWith(mockTabs[0]);
        expect(backgroundModule.isImportantTab).not.toHaveBeenCalled(); // isImportantTab should not be called if adaptiveMode is false
      });
      
      test('should use adaptive threshold if adaptiveMode is on and learning is off', async () => {
        const adaptiveThreshold = settingsProxy.inactivityThreshold / 2;
        settingsProxy.learningPeriod = false;
        _setSettings(settingsProxy);
        if (backgroundModule.getAdaptiveThreshold) backgroundModule.getAdaptiveThreshold.mockReturnValue(adaptiveThreshold);

        mockTabs = [{ id: 304, active: false, pinned: false, url: "http://adaptivethreshold.com", discarded: false, autoDiscardable: true }];
        chrome.tabs.query.mockResolvedValue(mockTabs);
        // Barely inactive by standard threshold, but active by adaptive
        tabActivityProxy[304] = { lastActive: Date.now() - (adaptiveThreshold - 1000) }; 
        _setTabActivity(tabActivityProxy);
        
        await checkInactiveTabs();
        expect(unloadTabSpy).not.toHaveBeenCalled(); // Should not unload, still active by adaptive

        // Now make it inactive by adaptive threshold
        tabActivityProxy[304].lastActive = Date.now() - (adaptiveThreshold + 1000);
        _setTabActivity(tabActivityProxy);
        await checkInactiveTabs();
        expect(unloadTabSpy).toHaveBeenCalledWith(mockTabs[0]);
        expect(backgroundModule.getAdaptiveThreshold).toHaveBeenCalled();
      });
    });
    
    test('should not unload more tabs than settings.maxHibernatedTabs allows if this logic is in checkInactiveTabs', async () => {
        // This test depends on whether maxHibernatedTabs is enforced globally or per checkInactiveTabs call.
        // Assuming checkInactiveTabs considers it.
        settingsProxy.maxHibernatedTabs = 1;
        _setSettings(settingsProxy);

        const tab1 = { id: 401, active: false, pinned: false, url: "http://inactive1.com", discarded: false, autoDiscardable: true };
        const tab2 = { id: 402, active: false, pinned: false, url: "http://inactive2.com", discarded: false, autoDiscardable: true };
        const tab3 = { id: 403, active: false, pinned: false, url: "http://inactive3.com", discarded: true, autoDiscardable: true }; // Already discarded
        mockTabs = [tab1, tab2, tab3];
        chrome.tabs.query.mockResolvedValue(mockTabs);

        tabActivityProxy[401] = { lastActive: Date.now() - (settingsProxy.inactivityThreshold + 2000) };
        tabActivityProxy[402] = { lastActive: Date.now() - (settingsProxy.inactivityThreshold + 1000) }; // Slightly more recent but still inactive
         _setTabActivity(tabActivityProxy);

        // Mock that one tab is already hibernated (discarded)
        // The logic in background.js counts non-discarded tabs that are candidates.
        // If maxHibernatedTabs is 1, and one is already discarded (tab3), then no new tabs should be hibernated.
        // This needs to be adjusted based on actual implementation of maxHibernatedTabs logic.
        // For now, let's assume the count of *already discarded tabs* is what matters.
        // If the background script counts discarded tabs towards maxHibernatedTabs:
        // const discardedTabs = mockTabs.filter(t => t.discarded);
        // If discardedTabs.length >= settingsProxy.maxHibernatedTabs, then don't hibernate.
        // This test might need adjustment if checkInactiveTabs doesn't directly query discarded count each time.
        // Update: background.js's checkInactiveTabs iterates and unloads one by one,
        // and has a `hibernatedCount` variable. It queries ALL tabs and counts discarded ones.
        // So, we need to ensure `chrome.tabs.query` in the main call returns all tabs.
        
        // Simulate one tab already discarded by other means or previous run
        const allTabsIncludingDiscarded = [
            { id: 401, active: false, pinned: false, url: "http://inactive1.com", discarded: false, autoDiscardable: true },
            { id: 402, active: false, pinned: false, url: "http://inactive2.com", discarded: false, autoDiscardable: true },
            { id: 403, active: false, pinned: false, url: "http://alreadyhibernated.com", discarded: true, autoDiscardable: true }
        ];
        chrome.tabs.query.mockImplementation((options) => {
            if (options.hasOwnProperty('discarded')) { // For counting hibernated tabs
                return Promise.resolve(allTabsIncludingDiscarded.filter(t => t.discarded === options.discarded));
            }
            return Promise.resolve(allTabsIncludingDiscarded.filter(t => !t.discarded)); // For finding candidates
        });


        await checkInactiveTabs();
        // Since maxHibernatedTabs is 1, and one is already discarded (tab 403), no more tabs should be unloaded.
        expect(unloadTabSpy).not.toHaveBeenCalled();
        
        // Now, if maxHibernatedTabs = 2
        settingsProxy.maxHibernatedTabs = 2;
        _setSettings(settingsProxy);
        await checkInactiveTabs();
        // One tab (403) is discarded. Max is 2. So one of (401 or 402) can be discarded.
        // checkInactiveTabs sorts by lastActive, so 401 (older) should be chosen.
        expect(unloadTabSpy).toHaveBeenCalledTimes(1);
        expect(unloadTabSpy).toHaveBeenCalledWith(expect.objectContaining({id: 401}));
    });

  });
  
  describe('unloadTab(tab)', () => {
    let mockTab;
    let consoleWarnSpy;
    let consoleErrorSpy;

    beforeEach(() => {
      // Reset settings and ensure discardInsteadOfHibernate is false by default for these tests
      // unless a specific test overrides it.
      _setSettings(JSON.parse(JSON.stringify(DEFAULT_TEST_SETTINGS)));
      settingsProxy = _getSettings();
      settingsProxy.discardInsteadOfHibernate = false; // Default for most unloadTab tests
      _setSettings(settingsProxy);


      mockTab = { id: 501, url: 'http://testunload.com', title: 'Test Tab to Unload', windowId: 1, discarded: false };
      
      // Spy on console messages
      consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Ensure Chrome API mocks are reset for each test
      chrome.tabs.sendMessage.mockReset();
      chrome.tabs.discard.mockReset();
      chrome.storage.local.set.mockReset();
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    test('should send "saveState" message and save returned state to local storage', async () => {
      const mockScrollState = { scrollY: 123, scrollX: 0 };
      chrome.tabs.sendMessage.mockResolvedValue({ success: true, state: mockScrollState });

      await unloadTab(mockTab);

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(mockTab.id, { type: "saveState" });
      const expectedStorageKey = `tabState_${mockTab.id}`;
      const expectedStoredValue = { ...mockScrollState, title: mockTab.title, url: mockTab.url, id: mockTab.id, timestamp: Date.now() };
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ [expectedStorageKey]: expectedStoredValue });
    });

    test('should still discard tab even if sendMessage fails (e.g., no content script)', async () => {
      chrome.tabs.sendMessage.mockRejectedValue(new Error("Could not establish connection. Receiving end does not exist."));
      
      await unloadTab(mockTab);

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(mockTab.id, { type: "saveState" });
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(`Failed to save state for tab ${mockTab.id}`), expect.any(Error));
      expect(chrome.storage.local.set).not.toHaveBeenCalled(); // State saving should not occur
      expect(chrome.tabs.discard).toHaveBeenCalledWith(mockTab.id); // Tab should still be discarded
    });

    test('should still discard tab if sendMessage response indicates failure (response.success is false)', async () => {
      chrome.tabs.sendMessage.mockResolvedValue({ success: false, message: "Content script failed to get state" });

      await unloadTab(mockTab);

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(mockTab.id, { type: "saveState" });
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(`Content script could not save state for tab ${mockTab.id}`));
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
      expect(chrome.tabs.discard).toHaveBeenCalledWith(mockTab.id);
    });
    
    test('should still discard tab if sendMessage response has no state (response.state is missing)', async () => {
      chrome.tabs.sendMessage.mockResolvedValue({ success: true, state: null }); // Null state

      await unloadTab(mockTab);

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(mockTab.id, { type: "saveState" });
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(`Content script did not return state for tab ${mockTab.id}`));
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
      expect(chrome.tabs.discard).toHaveBeenCalledWith(mockTab.id);
    });

    test('should call chrome.tabs.discard to unload the tab', async () => {
      chrome.tabs.sendMessage.mockResolvedValue({ success: true, state: { scrollY: 0 } }); // Assume state saving is fine
      
      await unloadTab(mockTab);
      
      expect(chrome.tabs.discard).toHaveBeenCalledWith(mockTab.id);
    });
    
    test('should handle errors during chrome.tabs.discard and log them', async () => {
      chrome.tabs.sendMessage.mockResolvedValue({ success: true, state: { scrollY: 0 } }); // State saving ok
      chrome.tabs.discard.mockRejectedValue(new Error("Failed to discard tab"));

      await unloadTab(mockTab);

      expect(chrome.tabs.discard).toHaveBeenCalledWith(mockTab.id);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining(`Error discarding tab ${mockTab.id}`), expect.any(Error));
    });
    
    test('should NOT attempt to save state if settings.discardInsteadOfHibernate is true', async () => {
        settingsProxy.discardInsteadOfHibernate = true;
        _setSettings(settingsProxy);

        await unloadTab(mockTab);

        expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
        expect(chrome.storage.local.set).not.toHaveBeenCalled();
        expect(chrome.tabs.discard).toHaveBeenCalledWith(mockTab.id); // Still discards
    });

    test('should update tabActivity to mark tab as hibernated', async () => {
      chrome.tabs.sendMessage.mockResolvedValue({ success: true, state: { scrollY: 0 } });
      tabActivityProxy[mockTab.id] = { lastActive: Date.now() - 100000, domain: "testunload.com" };
      _setTabActivity(tabActivityProxy);

      await unloadTab(mockTab);

      const activity = _getTabActivity();
      expect(activity[mockTab.id]).toBeDefined();
      expect(activity[mockTab.id].hibernated).toBe(true);
      expect(activity[mockTab.id].hibernationTime).toBe(Date.now());
    });
  });

});
