// Mock Chrome APIs
global.chrome = {
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn(), // For completeness
    },
    lastError: null, // To simulate errors
  },
};

// Mock window properties and methods
// window.location.href
Object.defineProperty(window, 'location', {
  value: { href: 'http://test.com/page' },
  writable: true,
});
// window.scrollY and window.scrollTo
let currentScrollY = 0;
Object.defineProperty(window, 'scrollY', {
  get: jest.fn(() => currentScrollY),
  configurable: true,
});
window.scrollTo = jest.fn((x, y) => {
  currentScrollY = y;
});

// Mock document.readyState
Object.defineProperty(document, 'readyState', {
  value: 'complete', // Default to 'complete' for most tests
  writable: true,
});

// Mock addEventListener for window and document
window.addEventListener = jest.fn();
document.addEventListener = jest.fn(); // Though not directly used by content.js, good to have a similar setup


// Import functions from content.js
// This will require content.js to be modified to use module.exports
// For now, this will likely fail until content.js is modified.
const {
  saveTabState,
  restoreTabState,
  trackActivity,
  // Assuming debounce is internal to trackActivity and not exported directly
  // If the message listener setup is top-level in content.js, we'll test its effects.
} = require('./content'); // Assuming content.js is in the same directory

describe('Content Script Logic', () => {
  let sendResponseCallback; // To capture and invoke sendResponse

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers(); // Use Jest's fake timers

    // Reset mocks and state
    currentScrollY = 0; // Reset scroll position
    window.location.href = 'http://test.com/page'; // Reset URL
    document.readyState = 'complete'; // Reset readyState
    chrome.runtime.lastError = null; // Clear any previous errors

    // Capture the listener added to chrome.runtime.onMessage
    // This assumes content.js adds its listener when loaded/imported.
    // If addListener is called multiple times (e.g. in different test setups),
    // this might need adjustment or more specific spy.
    if (chrome.runtime.onMessage.addListener.mock.calls.length > 0) {
        // This is a common pattern if the listener is added on script load.
        // However, for modular tests, we might trigger this setup manually if needed.
    }
    
    // Default mock for sendMessage
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      if (callback) {
        // Simulate async callback with a default response or based on message type
        // This might be overridden in specific tests
        Promise.resolve().then(() => callback({ success: true, state: null }));
      }
      return Promise.resolve({ success: true, state: null }); // For promises
    });

  });

  afterEach(() => {
    jest.clearAllTimers(); // Clear all fake timers
    // jest.restoreAllMocks(); // This can be too broad, restore specific mocks if needed
  });

  // Test suites for saveTabState, restoreTabState, trackActivity, and message listener
  describe('saveTabState()', () => {
    test('should correctly capture URL, scroll position, and timestamp', () => {
      window.location.href = 'http://example.com/testpage';
      currentScrollY = 150; // Set scrollY via our mock setup
      jest.spyOn(Date, 'now').mockReturnValue(1234567890000); // Mock Date.now()

      const state = saveTabState();

      expect(state.url).toBe('http://example.com/testpage');
      expect(state.scroll).toBe(150);
      expect(state.timestamp).toBe(1234567890000);
      
      Date.now.mockRestore(); // Clean up mock
    });

    test('should return scroll 0 if window.scrollY is not a number or undefined', () => {
      currentScrollY = undefined;
      let state = saveTabState();
      expect(state.scroll).toBe(0);

      currentScrollY = 'not a number';
      state = saveTabState();
      expect(state.scroll).toBe(0);
    });
  });

  describe('restoreTabState()', () => {
    beforeEach(() => {
      // Reset scrollTo mock calls for each test
      window.scrollTo.mockClear();
    });

    test('should call sendMessage to get state and scroll if readyState is "complete"', () => {
      document.readyState = 'complete';
      const mockSavedState = { url: 'http://test.com/page', scroll: 200, timestamp: Date.now() };
      chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        if (message.type === "getState") {
          Promise.resolve().then(() => callback({ success: true, state: mockSavedState }));
        }
      });

      restoreTabState();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "getState" }, expect.any(Function));
      expect(window.scrollTo).toHaveBeenCalledWith(0, 200);
    });

    test('should add "load" event listener and scroll if readyState is "loading"', () => {
      document.readyState = 'loading';
      const mockSavedState = { scroll: 250 };
      chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        if (message.type === "getState") {
          Promise.resolve().then(() => callback({ success: true, state: mockSavedState }));
        }
      });

      restoreTabState();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "getState" }, expect.any(Function));
      expect(window.scrollTo).not.toHaveBeenCalled(); // Not yet
      expect(window.addEventListener).toHaveBeenCalledWith('load', expect.any(Function));

      // Simulate the 'load' event
      const loadCallback = window.addEventListener.mock.calls.find(call => call[0] === 'load')[1];
      loadCallback(); // Execute the event handler

      expect(window.scrollTo).toHaveBeenCalledWith(0, 250);
    });
    
    test('should handle chrome.runtime.lastError during sendMessage', () => {
        document.readyState = 'complete';
        chrome.runtime.lastError = { message: "Background script error" };
        jest.spyOn(console, 'error').mockImplementation(() => {}); // Suppress console.error for this test

        restoreTabState();

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "getState" }, expect.any(Function));
        expect(console.error).toHaveBeenCalledWith("Error getting tab state:", { message: "Background script error" });
        expect(window.scrollTo).not.toHaveBeenCalled();
        console.error.mockRestore();
    });

    test('should not scroll if response is null or state is missing', () => {
      document.readyState = 'complete';
      chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        if (message.type === "getState") {
          Promise.resolve().then(() => callback(null)); // Null response
        }
      });
      restoreTabState();
      expect(window.scrollTo).not.toHaveBeenCalled();

      chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        if (message.type === "getState") {
          Promise.resolve().then(() => callback({ success: true, state: null })); // Null state
        }
      });
      restoreTabState();
      expect(window.scrollTo).not.toHaveBeenCalled();
    });
    
    test('should not scroll if response.state.scroll is not a number', () => {
      document.readyState = 'complete';
      chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        if (message.type === "getState") {
          Promise.resolve().then(() => callback({ success: true, state: { scroll: 'not-a-number' } }));
        }
      });
      restoreTabState();
      expect(window.scrollTo).not.toHaveBeenCalled();
    });
    
    test('should not scroll if response.success is false', () => {
      document.readyState = 'complete';
      chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        if (message.type === "getState") {
          Promise.resolve().then(() => callback({ success: false, state: { scroll: 300 } }));
        }
      });
      restoreTabState();
      expect(window.scrollTo).not.toHaveBeenCalled();
    });
  });

  describe('trackActivity() and debounce', () => {
    const DEBOUNCE_DELAY = 300; // Should match the delay in content.js

    beforeEach(() => {
      // Reset addEventListener mocks
      window.addEventListener.mockClear();
      chrome.runtime.sendMessage.mockClear(); // Ensure sendMessage is clean for these tests
    });

    test('should add event listeners for specified activity events', () => {
      trackActivity();
      expect(window.addEventListener).toHaveBeenCalledWith('mousedown', expect.any(Function), true);
      expect(window.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function), true);
      expect(window.addEventListener).toHaveBeenCalledWith('scroll', expect.any(Function), true);
      expect(window.addEventListener).toHaveBeenCalledWith('touchstart', expect.any(Function), true);
    });

    test('should call sendMessage with { type: "userActivity" } after debounce delay on event', () => {
      trackActivity();
      const scrollCallback = window.addEventListener.mock.calls.find(call => call[0] === 'scroll')[1];
      
      scrollCallback(); // Simulate scroll event
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled(); // Should not call immediately

      jest.advanceTimersByTime(DEBOUNCE_DELAY);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "userActivity" });
    });

    test('should only call sendMessage once for multiple rapid events', () => {
      trackActivity();
      const mousedownCallback = window.addEventListener.mock.calls.find(call => call[0] === 'mousedown')[1];

      mousedownCallback(); // Event 1
      jest.advanceTimersByTime(DEBOUNCE_DELAY / 2);
      mousedownCallback(); // Event 2 (within delay)
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();

      jest.advanceTimersByTime(DEBOUNCE_DELAY / 2); // Original timer for Event 1 would be here
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled(); // Should still not be called, as Event 2 reset timer

      jest.advanceTimersByTime(DEBOUNCE_DELAY / 2); // Complete the timer for Event 2
      expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "userActivity" });
    });
    
    test('should call sendMessage again if events are spaced longer than debounce delay', () => {
      trackActivity();
      const keydownCallback = window.addEventListener.mock.calls.find(call => call[0] === 'keydown')[1];

      keydownCallback(); // Event 1
      jest.advanceTimersByTime(DEBOUNCE_DELAY);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "userActivity" });
      
      chrome.runtime.sendMessage.mockClear(); // Clear previous call for next check

      keydownCallback(); // Event 2 (after first debounce completed)
      jest.advanceTimersByTime(DEBOUNCE_DELAY);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "userActivity" });
    });
  });

  describe('Message Listener (chrome.runtime.onMessage)', () => {
    let mockSaveTabState; // To spy on saveTabState

    beforeEach(() => {
      // Spy on saveTabState from the imported module
      // This assumes saveTabState is exported from content.js
      // If content.js is structured to not export (e.g. IIFE), this needs adjustment.
      // For this test, we assume `const { saveTabState } = require('./content');` works.
      mockSaveTabState = jest.spyOn(require('./content'), 'saveTabState');
    });

    afterEach(() => {
      if (mockSaveTabState) mockSaveTabState.mockRestore();
    });

    test('should call saveTabState and sendResponse on "saveState" message', () => {
      const mockSender = { id: 'extensionId123' };
      const mockSendResponse = jest.fn();
      const mockCapturedState = { url: 'http://current.com', scroll: 10, timestamp: Date.now() };
      mockSaveTabState.mockReturnValue(mockCapturedState); // Ensure saveTabState returns a defined state

      const result = simulateRuntimeMessage({ type: 'saveState' }, mockSender, mockSendResponse);

      expect(mockSaveTabState).toHaveBeenCalledTimes(1);
      expect(mockSendResponse).toHaveBeenCalledWith({ success: true, state: mockCapturedState });
      expect(result).toBe(true); // Should return true for async response
    });
    
    test('should do nothing for other message types', () => {
      const mockSender = { id: 'extensionId456' };
      const mockSendResponse = jest.fn();

      const result = simulateRuntimeMessage({ type: 'unknownMessageType' }, mockSender, mockSendResponse);

      expect(mockSaveTabState).not.toHaveBeenCalled();
      expect(mockSendResponse).not.toHaveBeenCalled();
      // The default behavior of the listener might be to return undefined/false if message not handled
      // Adjust based on actual content.js listener structure
      expect(result).toBe(false); // Or undefined, depending on listener's explicit return for unhandled
    });
  });
});

// Helper to simulate message arrival for the main listener in content.js
// This requires that the listener was captured or that content.js is structured
// in a way that we can invoke its message handling logic.
const simulateRuntimeMessage = (message, sender, sendResponse) => {
  const listener = chrome.runtime.onMessage.addListener.mock.calls.find(
    call => typeof call[0] === 'function'
  );
  if (listener && listener[0]) {
    return listener[0](message, sender, sendResponse);
  }
  // console.warn("chrome.runtime.onMessage.addListener was not called or listener not captured.");
  return false; // Indicate listener was not found/called
};
