# TabHibernate

**Tired of your browser eating up all your memory?** TabHibernate is a Chrome extension designed to automatically unload (hibernate) inactive tabs, freeing up system resources while cleverly preserving the state of those tabs so you can jump right back in later.

## How it Works

TabHibernate monitors your browser tabs and tracks when you last interacted with them. If a tab remains inactive for a specific period (you can configure this!), the extension will automatically unload it.

**Key Features:**

*   **Automatic Tab Unloading:** Frees up memory by unloading tabs you haven't used recently.
*   **Adaptive Threshold:** (Optional) Intelligently adjusts the inactivity time based on your system's available memory and your browsing habits. It learns which sites you use often and avoids unloading them too quickly.
*   **Usage Pattern Analysis:** Learns your habits over time to make smarter decisions about which tabs to keep active.
*   **Exclude Pinned Tabs:** Option to keep your pinned tabs always loaded.
*   **Exclude Specific Websites:** Add domains to a list that you never want to be unloaded automatically.
*   **Manual Unload:** Option to manually trigger unloading of inactive tabs via the popup.
*   **State Preservation:** Before unloading, it tries to save the tab's state (like scroll position or form data) so it can be restored when you revisit the tab. *(Note: State preservation relies on content scripts and might not be perfect for all websites.)*
*   **Customizable Settings:** Control the inactivity threshold, enable/disable adaptive mode, manage excluded sites, and more through the options page.

## Components

*   `background.js`: The core logic for monitoring tabs, handling settings, analyzing usage, and unloading inactive tabs.
*   `content.js`: Injected into web pages to detect user activity (like scrolling or typing) and potentially save tab state before unloading.
*   `popup.html`/`js`/`css`: The extension's popup interface, likely allowing manual unloading and quick access to settings.
*   `options.html`/`js`/`css`: The settings page where users can configure the extension's behavior.
*   `manifest.json`: Defines the extension's permissions, components, and metadata.
*   `icons/`: Contains the extension's icons.

## Getting Started

1.  Clone this repository.
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Enable "Developer mode" in the top right corner.
4.  Click "Load unpacked" and select the cloned repository folder.
5.  Configure the settings by clicking the extension icon and choosing "Options".

Let TabHibernate keep your browser running smoothly!