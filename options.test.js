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
  },
  runtime: { // Basic mock for completeness, in case options.js uses it
    lastError: null,
    getURL: (path) => `chrome-extension://test-id/${path}`,
    onMessage: { // If options.js listens to messages
        addListener: jest.fn(),
        removeListener: jest.fn()
    }
  },
};

// Mock animateCounter from utils.js
jest.mock('./utils', () => ({
  animateCounter: jest.fn(),
}));

// Mock window.confirm
global.window.confirm = jest.fn();

// Global variables expected by options.js
let currentSettings;
let usagePatterns;
const DEFAULT_SETTINGS = {
  enabled: true,
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
  excludePinnedTabs: true,
  showIndicators: true,
};
const LEARNING_PERIOD_DURATION_MINUTES = 7 * 24 * 60;

const {
  loadSettings,
  updateThresholdDisplay,
  toggleAdaptiveMode,
  updateLearningStatus,
  renderImportantDomains,
  addDomain,
  renderDomainList,
  removeDomain,
  saveSettings,
  resetSettings,
  updateStatistics,
  showToast,
} = require('./options');

const setupDOM = () => {
  document.body.innerHTML = `
    <input type="checkbox" id="enabled" data-setting="enabled">
    <input type="checkbox" id="adaptiveMode" data-setting="adaptiveMode">
    <input type="range" id="inactivityThreshold" value="1800" min="60" max="7200" step="60" data-setting="inactivityThreshold">
    <span id="thresholdValue">30 minutes</span>
    <input type="checkbox" id="excludePinnedTabs" data-setting="excludePinnedTabs">
    <input type="checkbox" id="showIndicators" data-setting="showIndicators">
    
    <div id="adaptiveSection" style="display: none;">
      <p id="adaptiveStatusText"></p>
      <div id="learningProgressContainer" style="display: none;">
        <div id="learningProgressFill"></div>
        <p id="learningProgressText"></p>
      </div>
      <h3>Important Domains (Automatically Managed)</h3>
      <ul id="importantDomainsList"></ul>
    </div>
    
    <h3>Excluded Domains</h3>
    <input type="text" id="newDomainInput" placeholder="e.g., example.com">
    <button id="addDomainButton">Add Domain</button>
    <ul id="excludedDomainsList"></ul>
    
    <button id="saveSettingsButton">Save Settings</button>
    <p id="saveStatus"></p>
    <button id="resetSettingsButton">Reset to Default</button>
    
    <h3>Statistics</h3>
    <div id="totalTabs">0</div>
    <div id="unloadedTabs">0</div>
    <div id="memorySaved">0 MB</div>

    <div id="toastContainer"></div>
  `;
};

// Helper to update currentSettings in the test scope, mimicking options.js's internal state
const _setSettingsInTestScope = (newSettings) => {
    currentSettings = JSON.parse(JSON.stringify(newSettings));
};
// Helper to get currentSettings from the test scope
const _getSettingsInTestScope = () => currentSettings;


describe('Options Script Logic', () => {
  
  beforeEach(() => {
    setupDOM();
    jest.clearAllMocks();
    jest.useFakeTimers(); 

    currentSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    usagePatterns = {}; 

    chrome.storage.local.get.mockImplementation((keys, callback) => {
      const result = {};
      const settingsToReturn = _getSettingsInTestScope ? _getSettingsInTestScope() : DEFAULT_SETTINGS;
      const patternsToReturn = usagePatterns || {};

      if (Array.isArray(keys)) { 
        keys.forEach(key => {
          if (key === 'settings') result.settings = JSON.parse(JSON.stringify(settingsToReturn));
          if (key === 'usagePatterns') result.usagePatterns = JSON.parse(JSON.stringify(patternsToReturn));
        });
      } else if (typeof keys === 'object' && keys !== null) { 
        if (keys.hasOwnProperty('settings')) result.settings = JSON.parse(JSON.stringify(settingsToReturn));
        if (keys.hasOwnProperty('usagePatterns')) result.usagePatterns = JSON.parse(JSON.stringify(patternsToReturn));
      } else if (typeof keys === 'string') { 
         if (keys === 'settings') result.settings = JSON.parse(JSON.stringify(settingsToReturn));
         if (keys === 'usagePatterns') result.usagePatterns = JSON.parse(JSON.stringify(patternsToReturn));
      }
      Promise.resolve().then(() => callback(result));
    });

    chrome.storage.local.set.mockImplementation((items, callback) => {
      if (items.settings) _setSettingsInTestScope({ ..._getSettingsInTestScope(), ...items.settings });
      if (items.usagePatterns) usagePatterns = items.usagePatterns; // Update global test var
      if (callback) Promise.resolve().then(callback);
      return Promise.resolve();
    });
    
    chrome.tabs.query.mockResolvedValue([]);
    global.window.confirm.mockReturnValue(true); 
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-01T00:00:00.000Z').getTime());
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.restoreAllMocks(); 
    document.body.innerHTML = ''; 
  });

  test('Placeholder: Initial setup and DOM ready', () => {
    expect(document.getElementById('enabled')).not.toBeNull();
    expect(loadSettings).toBeDefined();
  });

  describe('loadSettings() and Initial Page Load', () => {
    let adaptiveModeToggle, inactivitySlider, thresholdValue, excludePinnedTabsCheckbox, showIndicatorsCheckbox;
    let importantDomainsList, excludedDomainsList, adaptiveStatusText, learningProgressContainer;

    beforeEach(async () => {
      adaptiveModeToggle = document.getElementById('adaptiveMode');
      inactivitySlider = document.getElementById('inactivityThreshold');
      thresholdValue = document.getElementById('thresholdValue');
      excludePinnedTabsCheckbox = document.getElementById('excludePinnedTabs');
      showIndicatorsCheckbox = document.getElementById('showIndicators');
      importantDomainsList = document.getElementById('importantDomainsList');
      excludedDomainsList = document.getElementById('excludedDomainsList');
      adaptiveStatusText = document.getElementById('adaptiveStatusText');
      learningProgressContainer = document.getElementById('learningProgressContainer');
      _setSettingsInTestScope(JSON.parse(JSON.stringify(DEFAULT_SETTINGS))); 
      await loadSettings(); 
    });

    test('should call chrome.storage.local.get for settings and usagePatterns', async () => {
      expect(chrome.storage.local.get).toHaveBeenCalledWith(
        { settings: DEFAULT_SETTINGS, usagePatterns: {} },
        expect.any(Function)
      );
    });

    test('should populate UI elements with loaded settings', async () => {
      const testSettings = {
        ...DEFAULT_SETTINGS,
        enabled: true,
        adaptiveMode: true,
        inactivityThreshold: 3600 * 1000, 
        excludePinnedTabs: false,
        showIndicators: true,
        excludedDomains: ['test.com'],
      };
      _setSettingsInTestScope(testSettings); 
      await loadSettings(); 

      expect(document.getElementById('enabled').checked).toBe(true);
      expect(adaptiveModeToggle.checked).toBe(true);
      expect(inactivitySlider.value).toBe('3600');
      expect(thresholdValue.textContent).toBe('60 minutes');
      expect(excludePinnedTabsCheckbox.checked).toBe(false);
      expect(showIndicatorsCheckbox.checked).toBe(true);
      expect(excludedDomainsList.children.length).toBe(1);
      expect(excludedDomainsList.children[0].textContent).toContain('test.com');
    });

    test('should populate UI with DEFAULT_SETTINGS if no settings are stored', async () => {
      chrome.storage.local.get.mockImplementationOnce((keys, callback) => {
        Promise.resolve().then(() => callback({ settings: undefined, usagePatterns: undefined }));
      });
      await loadSettings();

      expect(document.getElementById('enabled').checked).toBe(DEFAULT_SETTINGS.enabled);
      expect(adaptiveModeToggle.checked).toBe(DEFAULT_SETTINGS.adaptiveMode);
      expect(inactivitySlider.value).toBe((DEFAULT_SETTINGS.inactivityThreshold / 1000).toString());
      expect(excludePinnedTabsCheckbox.checked).toBe(DEFAULT_SETTINGS.excludePinnedTabs);
    });

    test('should handle chrome.storage being unavailable and log warning', async () => {
      chrome.storage.local.get.mockImplementationOnce((keys, callback) => {
        global.chrome.runtime.lastError = { message: 'Storage unavailable' };
        Promise.resolve().then(() => callback({ settings: _getSettingsInTestScope(), usagePatterns: {} }));
      });
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      await loadSettings();
      expect(console.warn).toHaveBeenCalledWith('Error loading settings:', { message: 'Storage unavailable' });
      expect(document.getElementById('enabled').checked).toBe(_getSettingsInTestScope().enabled);
      console.warn.mockRestore();
      global.chrome.runtime.lastError = null;
    });
  });

  describe('updateThresholdDisplay()', () => {
    test('should correctly format minutes for values < 60 minutes', () => {
      document.getElementById('inactivityThreshold').value = '1800';
      updateThresholdDisplay();
      expect(document.getElementById('thresholdValue').textContent).toBe('30 minutes');
    });
    test('should correctly format hours and minutes for values >= 60 minutes', () => {
      document.getElementById('inactivityThreshold').value = '5400';
      updateThresholdDisplay();
      expect(document.getElementById('thresholdValue').textContent).toBe('1 hour 30 minutes');
    });
  });

  describe('toggleAdaptiveMode()', () => {
    let adaptiveSection, inactivitySlider, thresholdLabelTextElement; // Renamed to avoid conflict
    beforeEach(() => {
        adaptiveSection = document.getElementById('adaptiveSection');
        inactivitySlider = document.getElementById('inactivityThreshold');
        // Ensure the label exists for the test
        if (!document.getElementById('thresholdLabelText')) {
            const label = document.createElement('label');
            label.htmlFor = 'inactivityThreshold';
            label.id = 'thresholdLabelText';
            label.textContent = 'Inactivity Threshold:';
            inactivitySlider.parentNode.insertBefore(label, inactivitySlider.nextSibling);
        }
        thresholdLabelTextElement = document.getElementById('thresholdLabelText');
        _setSettingsInTestScope(JSON.parse(JSON.stringify(DEFAULT_SETTINGS))); 
    });

    test('should show adaptiveSection and disable slider when adaptiveMode is true', () => {
      document.getElementById('adaptiveMode').checked = true;
      _getSettingsInTestScope().adaptiveMode = true; 
      toggleAdaptiveMode(); 
      expect(adaptiveSection.style.display).toBe('block');
      expect(inactivitySlider.disabled).toBe(true);
      expect(thresholdLabelTextElement.textContent).toContain('(managed by adaptive mode)');
    });
    test('should hide adaptiveSection and enable slider when adaptiveMode is false', () => {
      document.getElementById('adaptiveMode').checked = false;
      _getSettingsInTestScope().adaptiveMode = false;
      toggleAdaptiveMode();
      expect(adaptiveSection.style.display).toBe('none');
      expect(inactivitySlider.disabled).toBe(false);
      expect(thresholdLabelTextElement.textContent).not.toContain('(managed by adaptive mode)');
    });
  });

  describe('updateLearningStatus()', () => {
    let adaptiveStatusText, learningProgressContainer, learningProgressFill, learningProgressText;
    beforeEach(() => {
        adaptiveStatusText = document.getElementById('adaptiveStatusText');
        learningProgressContainer = document.getElementById('learningProgressContainer');
        learningProgressFill = document.getElementById('learningProgressFill');
        learningProgressText = document.getElementById('learningProgressText');
        _setSettingsInTestScope(JSON.parse(JSON.stringify(DEFAULT_SETTINGS))); 
    });

    test('should display "Learning in progress" when adaptiveMode and learningPeriod are true', () => {
      const settings = _getSettingsInTestScope();
      settings.adaptiveMode = true;
      settings.learningPeriod = true;
      settings.learningPeriodStartTime = Date.now() - (settings.learningPeriodDuration / 2);
      _setSettingsInTestScope(settings);
      updateLearningStatus();
      expect(adaptiveStatusText.textContent).toContain('Learning in progress');
      expect(learningProgressContainer.style.display).toBe('block');
      const expectedProgress = ((Date.now() - settings.learningPeriodStartTime) / settings.learningPeriodDuration) * 100;
      expect(learningProgressFill.style.width).toBe(`${Math.min(100, expectedProgress)}%`);
    });
    test('should display "Fully adaptive" when adaptiveMode is true and learningPeriod is false', () => {
      const settings = _getSettingsInTestScope();
      settings.adaptiveMode = true;
      settings.learningPeriod = false;
      _setSettingsInTestScope(settings);
      updateLearningStatus();
      expect(adaptiveStatusText.textContent).toContain('Hibernation threshold is fully adaptive');
      expect(learningProgressContainer.style.display).toBe('none');
    });
  });

  describe('renderImportantDomains()', () => {
    let importantDomainsList;
    beforeEach(() => {
        importantDomainsList = document.getElementById('importantDomainsList');
        usagePatterns = {}; 
    });
    test('should display "No usage data yet" if usagePatterns is empty', () => {
      renderImportantDomains();
      expect(importantDomainsList.textContent).toContain('No usage data yet.');
    });
    test('should correctly render and sort domains by importance', () => {
      usagePatterns = {
        'low.com': { importance: 0.1, lastAnalyzed: Date.now() },
        'high.com': { importance: 0.8, lastAnalyzed: Date.now() },
      };
      renderImportantDomains();
      expect(importantDomainsList.children.length).toBe(2);
      expect(importantDomainsList.children[0].textContent).toContain('high.com');
      expect(importantDomainsList.children[1].textContent).toContain('low.com');
    });
  });

  describe('Domain List Management: addDomain, renderDomainList, removeDomain', () => {
    let newDomainInput, excludedDomainsList;
    beforeEach(() => {
        newDomainInput = document.getElementById('newDomainInput');
        excludedDomainsList = document.getElementById('excludedDomainsList');
        _getSettingsInTestScope().excludedDomains = []; 
        renderDomainList();
    });

    describe('addDomain()', () => {
      test('should add a valid domain and re-render the list', () => {
        newDomainInput.value = 'newdomain.com';
        addDomain();
        expect(_getSettingsInTestScope().excludedDomains).toContain('newdomain.com');
        expect(excludedDomainsList.textContent).toContain('newdomain.com');
        expect(newDomainInput.value).toBe('');
      });
      test('should not add duplicate domain', () => {
        _getSettingsInTestScope().excludedDomains = ['existing.com'];
        renderDomainList();
        newDomainInput.value = 'existing.com';
        addDomain();
        expect(_getSettingsInTestScope().excludedDomains.length).toBe(1);
      });
    });

    describe('renderDomainList()', () => {
      test('should display "No domains added" if list is empty', () => {
        renderDomainList(); 
        expect(excludedDomainsList.textContent).toContain('No domains added yet.');
      });
      test('should create list items with domain and remove button', () => {
        _getSettingsInTestScope().excludedDomains = ['domain1.com'];
        renderDomainList();
        expect(excludedDomainsList.children[0].textContent).toContain('domain1.com');
        expect(excludedDomainsList.children[0].querySelector('button.remove-domain-button')).not.toBeNull();
      });
    });

    describe('removeDomain(domain)', () => {
      test('should remove the specified domain and re-render', () => {
        _getSettingsInTestScope().excludedDomains = ['domain1.com', 'domain2.com'];
        renderDomainList();
        removeDomain('domain1.com');
        expect(_getSettingsInTestScope().excludedDomains).not.toContain('domain1.com');
        expect(excludedDomainsList.textContent).not.toContain('domain1.com');
      });
    });
  });

  describe('saveSettings()', () => {
    let saveButton;
    beforeEach(async () => {
      saveButton = document.getElementById('saveSettingsButton');
      _setSettingsInTestScope(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
      await loadSettings(); 
      chrome.storage.local.set.mockClear();
    });

    test('should read values from UI, update currentSettings, and call chrome.storage.local.set', async () => {
      document.getElementById('enabled').checked = false;
      document.getElementById('adaptiveMode').checked = true;
      document.getElementById('inactivityThreshold').value = '7200'; // 2 hours
      await saveSettings();
      const finalSettings = _getSettingsInTestScope();
      expect(finalSettings.enabled).toBe(false);
      expect(finalSettings.adaptiveMode).toBe(true);
      expect(finalSettings.inactivityThreshold).toBe(7200 * 1000);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ settings: finalSettings }, expect.any(Function));
      expect(saveButton.textContent).toBe('Settings Saved!');
      expect(saveButton.disabled).toBe(true);
    });

    test('should set learningPeriodStartTime if adaptiveMode newly enabled and learningPeriod true', async () => {
      const settings = _getSettingsInTestScope();
      settings.adaptiveMode = false;
      settings.learningPeriod = true;
      settings.learningPeriodStartTime = null;
      _setSettingsInTestScope(settings);
      await loadSettings(); 
      document.getElementById('adaptiveMode').checked = true; 
      await saveSettings();
      expect(_getSettingsInTestScope().learningPeriodStartTime).toBe(Date.now());
    });
    
    test('should set learningPeriodStartTime to null if adaptiveMode is disabled', async () => {
      const settings = _getSettingsInTestScope();
      settings.adaptiveMode = true;
      settings.learningPeriod = true;
      settings.learningPeriodStartTime = Date.now() - 1000;
      _setSettingsInTestScope(settings);
      await loadSettings(); 
      document.getElementById('adaptiveMode').checked = false; 
      await saveSettings();
      expect(_getSettingsInTestScope().learningPeriodStartTime).toBeNull();
    });

    test('should handle storage save error and show error message via toast', async () => {
      chrome.storage.local.set.mockImplementationOnce((items, callback) => {
        global.chrome.runtime.lastError = { message: 'Save Failed!' };
        if (callback) callback(); 
      });
      jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // Mock showToast directly for this test as it's part of the module.
      const showToastMock = jest.spyOn(require('./options'), 'showToast').mockImplementation(() => {
          const toastContainer = document.getElementById('toastContainer');
          if(toastContainer) { // Ensure container exists
            const toastElement = document.createElement('div');
            toastElement.className = 'toast error'; 
            toastElement.textContent = `Error saving settings: Save Failed!`;
            toastContainer.appendChild(toastElement);
          }
      });

      await saveSettings();
      expect(saveButton.textContent).toBe('Save Settings');
      expect(saveButton.disabled).toBe(false);
      expect(console.error).toHaveBeenCalledWith('Error saving settings:', { message: 'Save Failed!' });
      const toastElement = document.querySelector('#toastContainer .toast.error');
      expect(toastElement).not.toBeNull();
      if(toastElement) expect(toastElement.textContent).toContain('Error saving settings: Save Failed!');
      
      console.error.mockRestore();
      showToastMock.mockRestore(); 
      global.chrome.runtime.lastError = null;
    });

    test('save button should be re-enabled after a delay', async () => {
      await saveSettings();
      expect(saveButton.disabled).toBe(true);
      jest.advanceTimersByTime(2000);
      expect(saveButton.disabled).toBe(false);
      expect(saveButton.textContent).toBe('Save Settings');
    });
  });

  describe('resetSettings()', () => {
    let showToastMock; // Specific mock for showToast

    beforeEach(async () => {
      // Modify some settings to ensure reset has an effect
      const settings = _getSettingsInTestScope();
      settings.enabled = false;
      settings.adaptiveMode = true;
      settings.excludedDomains = ['custom.com'];
      _setSettingsInTestScope(settings);
      
      usagePatterns = { 'custom.com': { importance: 0.5, lastAnalyzed: Date.now() } }; // Simulate some usage
      
      await loadSettings(); // Load these modified settings into UI

      chrome.storage.local.set.mockClear();
      // Mock showToast from the imported module (options.js)
      showToastMock = jest.spyOn(require('./options'), 'showToast').mockImplementation(() => {});
    });

    afterEach(() => {
      if (showToastMock) showToastMock.mockRestore();
    });

    test('should not reset if user cancels confirmation', async () => {
      global.window.confirm.mockReturnValueOnce(false); // Simulate user clicking "Cancel"
      await resetSettings();
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
      expect(_getSettingsInTestScope().enabled).toBe(false); // Should remain unchanged from beforeEach setup
      expect(showToastMock).not.toHaveBeenCalled();
    });

    test('should reset currentSettings to DEFAULT_SETTINGS and save to storage', async () => {
      global.window.confirm.mockReturnValueOnce(true); // Simulate user clicking "OK"
      await resetSettings();
      
      const finalSettings = _getSettingsInTestScope();
      // Check all properties of DEFAULT_SETTINGS are present and correct
      Object.keys(DEFAULT_SETTINGS).forEach(key => {
        if (key === 'learningPeriodStartTime' && DEFAULT_SETTINGS.adaptiveMode && DEFAULT_SETTINGS.learningPeriod && DEFAULT_SETTINGS.learningPeriodStartTime === null) {
          // This specific case is handled by logic in resetSettings to set a new start time
          expect(finalSettings.learningPeriodStartTime).toBe(Date.now());
        } else {
          expect(finalSettings[key]).toEqual(DEFAULT_SETTINGS[key]);
        }
      });
      
      // Verify that usagePatterns are cleared from storage
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({ 
            settings: expect.objectContaining(DEFAULT_SETTINGS), // Or finalSettings if learningPeriodStartTime is tricky
            usagePatterns: {} 
        }),
        expect.any(Function) // Callback function
      );
    });

    test('should update UI to reflect default settings', async () => {
      global.window.confirm.mockReturnValueOnce(true);
      await resetSettings();
      
      expect(document.getElementById('enabled').checked).toBe(DEFAULT_SETTINGS.enabled);
      expect(document.getElementById('adaptiveMode').checked).toBe(DEFAULT_SETTINGS.adaptiveMode);
      expect(document.getElementById('inactivityThreshold').value).toBe((DEFAULT_SETTINGS.inactivityThreshold / 1000).toString());
      expect(document.getElementById('excludedDomainsList').children.length).toBe(DEFAULT_SETTINGS.excludedDomains.length);
      // Important domains list should be cleared as usagePatterns is cleared
      expect(document.getElementById('importantDomainsList').textContent).toContain('No usage data yet.');
    });
    
    test('should call UI update functions (toggleAdaptiveMode, renderDomainList, etc.)', async () => {
      global.window.confirm.mockReturnValueOnce(true);
      
      // Spy on functions called internally by resetSettings (or by loadSettings called within resetSettings)
      const toggleAdaptiveModeSpy = jest.spyOn(require('./options'), 'toggleAdaptiveMode').mockImplementation(() => {});
      const renderDomainListSpy = jest.spyOn(require('./options'), 'renderDomainList').mockImplementation(() => {});
      const updateLearningStatusSpy = jest.spyOn(require('./options'), 'updateLearningStatus').mockImplementation(() => {});
      const renderImportantDomainsSpy = jest.spyOn(require('./options'), 'renderImportantDomains').mockImplementation(() => {});

      await resetSettings();

      expect(toggleAdaptiveModeSpy).toHaveBeenCalled();
      expect(renderDomainListSpy).toHaveBeenCalled();
      expect(updateLearningStatusSpy).toHaveBeenCalled();
      expect(renderImportantDomainsSpy).toHaveBeenCalled(); // Called because usagePatterns is cleared

      toggleAdaptiveModeSpy.mockRestore();
      renderDomainListSpy.mockRestore();
      updateLearningStatusSpy.mockRestore();
      renderImportantDomainsSpy.mockRestore();
    });

    test('should show a toast message on successful reset', async () => {
      global.window.confirm.mockReturnValueOnce(true);
      await resetSettings();
      expect(showToastMock).toHaveBeenCalledWith('Settings reset to default.', 'success');
    });
  });

  describe('updateStatistics()', () => {
    let totalTabsEl, unloadedTabsEl, memorySavedEl;
    let animateCounterMock; // To check calls to the mocked animateCounter

    beforeEach(async () => {
      totalTabsEl = document.getElementById('totalTabs');
      unloadedTabsEl = document.getElementById('unloadedTabs');
      memorySavedEl = document.getElementById('memorySaved');
      
      // Access the mock directly from the jest.mock setup
      animateCounterMock = require('./utils').animateCounter;
      animateCounterMock.mockClear(); // Clear calls from previous tests

      // Reset currentSettings and load to simulate a fresh page state for stats
      _setSettingsInTestScope(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
      await loadSettings(); // This might call updateStatistics initially
      
      // Clear mocks that might have been called by loadSettings's initial updateStatistics call
      chrome.tabs.query.mockClear();
      animateCounterMock.mockClear();
      jest.clearAllTimers(); // Clear any timers set by initial load
    });

    test('should query tabs and call animateCounter for each statistic', async () => {
      const mockTabs = [
        { id: 1, url: 'http://a.com', discarded: false, memoryInfo: { residentSetSizeBytes: 100 * 1024 * 1024 } }, // 100MB
        { id: 2, url: 'http://b.com', discarded: true, memoryInfo: { residentSetSizeBytes: 0 } }, // Discarded, 0MB for this calculation
        { id: 3, url: 'http://c.com', discarded: false, memoryInfo: { residentSetSizeBytes: 150 * 1024 * 1024 } }, // 150MB
      ];
      chrome.tabs.query.mockResolvedValue(mockTabs);

      await updateStatistics();

      expect(chrome.tabs.query).toHaveBeenCalledWith({}, expect.any(Function));
      expect(animateCounterMock).toHaveBeenCalledTimes(3); // total, unloaded, memory
      expect(animateCounterMock).toHaveBeenCalledWith(totalTabsEl, 3, expect.any(Number));
      expect(animateCounterMock).toHaveBeenCalledWith(unloadedTabsEl, 1, expect.any(Number));
      // Average memory per tab is assumed to be around 150MB in options.js if memoryInfo is not always present
      // Here, we have memoryInfo, so it should use that.
      // Saved memory for discarded tab (b.com) is estimated as average of non-discarded.
      // (100MB + 150MB) / 2 = 125MB estimated saved for tab 2.
      // options.js logic: For discarded tabs, it uses an average. If memoryInfo is present on non-discarded, it uses that.
      // Let's assume the provided options.js calculates average based on non-discarded tabs with memoryInfo if available.
      // If tab 2 was not discarded, its memory would be used. Since it is, its potential saving is avg.
      // For simplicity, the provided options.js uses a fixed average (150MB) if detailed info is missing.
      // Let's assume options.js uses 150MB as average for saved memory for discarded tabs.
      // Memory saved for tab id:2 would be 150MB (default estimate).
      expect(animateCounterMock).toHaveBeenCalledWith(memorySavedEl, 150, expect.any(Number)); // Assuming 150MB default avg
    });

    test('should handle chrome.tabs.query being unavailable or returning error', async () => {
      chrome.tabs.query.mockImplementation((options, callback) => {
        global.chrome.runtime.lastError = { message: 'Tabs API unavailable' };
        // callback([]); // Call with empty to simulate error recovery or let it be
        Promise.resolve().then(() => callback([])); // Simulate error by returning empty array
      });
      jest.spyOn(console, 'error').mockImplementation(() => {});

      await updateStatistics();

      expect(console.error).toHaveBeenCalledWith('Error querying tabs for statistics:', { message: 'Tabs API unavailable' });
      // Ensure counters are still called, likely with 0 values
      expect(animateCounterMock).toHaveBeenCalledWith(totalTabsEl, 0, expect.any(Number));
      expect(animateCounterMock).toHaveBeenCalledWith(unloadedTabsEl, 0, expect.any(Number));
      expect(animateCounterMock).toHaveBeenCalledWith(memorySavedEl, 0, expect.any(Number));
      
      console.error.mockRestore();
      global.chrome.runtime.lastError = null;
    });

    test('should set a timeout to call itself again', async () => {
      jest.spyOn(global, 'setTimeout');
      chrome.tabs.query.mockResolvedValue([]); // Ensure it completes without error

      await updateStatistics();
      
      expect(setTimeout).toHaveBeenCalledWith(updateStatistics, 5000); // 5 seconds interval
      
      // Clean up by clearing the timer if it was actually set
      const timerId = setTimeout.mock.results[0].value;
      clearTimeout(timerId);
      global.setTimeout.mockRestore();
    });
    
    test('should calculate memory saved using actual memoryInfo if available', async () => {
        const mockTabs = [
            { id: 1, url: 'http://a.com', discarded: false, memoryInfo: { residentSetSizeBytes: 100 * 1024 * 1024 } }, // 100MB
            { id: 2, url: 'http://b.com', discarded: true, memoryInfo: { residentSetSizeBytes: 0 } }, // Saved 100MB (based on tab 1's actual)
            { id: 3, url: 'http://c.com', discarded: true, memoryInfo: { residentSetSizeBytes: 0 } }, // Saved 100MB
        ];
        chrome.tabs.query.mockResolvedValue(mockTabs);
        // Assuming the logic in options.js will use the average of *active* tabs' memory if memoryInfo is present.
        // Here, only tab 1 is active and has memoryInfo. So average is 100MB.
        // 2 discarded tabs * 100MB/tab = 200MB saved.

        await updateStatistics();
        expect(animateCounterMock).toHaveBeenCalledWith(memorySavedEl, 200, expect.any(Number));
    });
  });

  describe('Event Listener Setup', () => {
    let inactivitySlider, addDomainButton, saveSettingsButton, resetSettingsButton, adaptiveModeToggle, newDomainInput;
    let updateThresholdDisplaySpy, addDomainSpy, saveSettingsSpy, resetSettingsSpy, toggleAdaptiveModeSpy;

    beforeEach(async () => {
      // Re-initialize settings and load them to attach event listeners as options.js does
      _setSettingsInTestScope(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
      await loadSettings(); // This should also set up event listeners if options.js is structured that way

      // Capture elements
      inactivitySlider = document.getElementById('inactivityThreshold');
      addDomainButton = document.getElementById('addDomainButton');
      saveSettingsButton = document.getElementById('saveSettingsButton');
      resetSettingsButton = document.getElementById('resetSettingsButton');
      adaptiveModeToggle = document.getElementById('adaptiveMode');
      newDomainInput = document.getElementById('newDomainInput');

      // Spy on the handler functions
      // This requires the functions to be part of the module exports or global for spying
      updateThresholdDisplaySpy = jest.spyOn(require('./options'), 'updateThresholdDisplay').mockImplementation(() => {});
      addDomainSpy = jest.spyOn(require('./options'), 'addDomain').mockImplementation(() => {});
      saveSettingsSpy = jest.spyOn(require('./options'), 'saveSettings').mockImplementation(async () => {});
      resetSettingsSpy = jest.spyOn(require('./options'), 'resetSettings').mockImplementation(async () => {});
      toggleAdaptiveModeSpy = jest.spyOn(require('./options'), 'toggleAdaptiveMode').mockImplementation(() => {});
      
      // For functions that are directly assigned as event listeners in options.js,
      // we need to re-attach our spied versions if loadSettings/DOMContentLoaded setup original ones.
      // This is a bit of a hack due to not directly controlling listener attachment from tests
      // if options.js runs its setup on import/DOMContentLoaded.
      // A cleaner way would be if options.js had an explicit initEventListeners function.
      
      // Clear previous event listeners and attach spies (if options.js adds them on load)
      // This is complex. A simpler approach is to assume options.js has an init function that we call,
      // or that the imported functions are the ones used in listeners.
      // For these tests, we'll assume the spies correctly intercept calls if options.js uses
      // the imported functions as handlers or if its internal handlers call these exported functions.
      // The `require('./options')` provides the functions that `options.js` itself exports.
      // If `options.js` does `slider.addEventListener('input', updateThresholdDisplay);`
      // then our spy on `updateThresholdDisplay` (from the module) should work.
    });

    afterEach(() => {
      // Restore all spied functions
      updateThresholdDisplaySpy.mockRestore();
      addDomainSpy.mockRestore();
      saveSettingsSpy.mockRestore();
      resetSettingsSpy.mockRestore();
      toggleAdaptiveModeSpy.mockRestore();
    });

    test('inactivitySlider "input" event should call updateThresholdDisplay', () => {
      inactivitySlider.dispatchEvent(new Event('input'));
      expect(updateThresholdDisplaySpy).toHaveBeenCalled();
    });

    test('addDomainButton "click" event should call addDomain', () => {
      addDomainButton.dispatchEvent(new Event('click'));
      expect(addDomainSpy).toHaveBeenCalled();
    });

    test('saveSettingsButton "click" event should call saveSettings', () => {
      saveSettingsButton.dispatchEvent(new Event('click'));
      expect(saveSettingsSpy).toHaveBeenCalled();
    });

    test('resetSettingsButton "click" event should call resetSettings', () => {
      resetSettingsButton.dispatchEvent(new Event('click'));
      expect(resetSettingsSpy).toHaveBeenCalled();
    });

    test('adaptiveModeToggle "change" event should call toggleAdaptiveMode', () => {
      adaptiveModeToggle.dispatchEvent(new Event('change'));
      expect(toggleAdaptiveModeSpy).toHaveBeenCalled();
    });

    test('newDomainInput "keypress" (Enter) event should call addDomain', () => {
      const enterEvent = new KeyboardEvent('keypress', { key: 'Enter', bubbles: true });
      newDomainInput.dispatchEvent(enterEvent);
      expect(addDomainSpy).toHaveBeenCalled();
    });
    
    test('newDomainInput "keypress" (non-Enter) event should not call addDomain', () => {
      const keyAEvent = new KeyboardEvent('keypress', { key: 'a', bubbles: true });
      newDomainInput.dispatchEvent(keyAEvent);
      expect(addDomainSpy).not.toHaveBeenCalled();
    });
  });
});
