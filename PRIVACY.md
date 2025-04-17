# Privacy Policy for TabHibernate Chrome Extension

**Last Updated:** 2025-04-17

Thank you for using TabHibernate! This policy explains how the extension handles information. Our core principle is that **your browsing data stays local on your computer.**

## Information We Collect (Locally Only)

TabHibernate needs to save some data directly on your computer using the browser's secure local storage (`chrome.storage.local`) to provide its features. This data includes:

*   **Your Settings:** Configuration options you set, such as the inactivity timeout (e.g., 10 minutes), whether to exclude pinned tabs, the list of websites you choose to exclude, and whether adaptive mode is enabled.
*   **Usage Patterns:** To improve hibernation decisions (especially in adaptive mode), the extension locally records general usage patterns. This includes:
    *   Which website domains (e.g., `example.com`) you visit (derived from tab URLs).
    *   How often tabs for specific domains are opened.
    *   How often you interact with tabs from specific domains.
    *   An estimate of how long tabs from specific domains remain active.
    *   An "importance" score calculated from these patterns.
*   **Temporary Tab State:** Immediately before a tab is hibernated, its current state is temporarily saved locally. This includes:
    *   The specific URL of the tab.
    *   Your vertical scroll position on the page (`window.scrollY`).

**Important:** This data is stored **only** on your local computer within the Chrome browser's storage area for this extension. **It is never transmitted to any external server, database, or third party.** We do not collect any personally identifiable information beyond what is necessary for the extension's function (like URLs you visit, which are inherent to tab management).

## How We Use Information

The locally collected information is used solely for the following purposes:

*   To save and apply your chosen settings.
*   To identify tabs that have been inactive longer than your set threshold.
*   To determine if a tab should be skipped from hibernation based on your settings (pinned, excluded domain, importance score in adaptive mode).
*   To save your scroll position so it can be restored when you revisit a hibernated tab.
*   To analyze usage patterns over time to make adaptive hibernation more effective (if enabled).
*   To potentially suggest frequently used domains for the exclusion list (if the analysis feature determines high importance).

## Data Storage and Retention

*   All data is stored locally using `chrome.storage.local`.
*   Settings are retained until you change them or uninstall the extension.
*   Usage patterns are continuously updated and retained locally.
*   Temporary tab state (URL, scroll position) is stored when a tab is hibernated and **automatically deleted** from local storage when that specific hibernated tab is permanently closed by you.
*   You can clear all locally stored data by uninstalling the extension or by clearing the extension's storage via Chrome's developer tools.

## Permissions Justification

TabHibernate requires the following Chrome permissions to function:

*   `tabs`: To monitor tab activity (activation, updates), get tab URLs for usage analysis and state saving, and to discard inactive tabs.
*   `storage`: To save all your settings, the learned usage patterns, and the temporary tab state locally on your computer.
*   `alarms`: To schedule periodic checks for inactive tabs and usage pattern analysis without needing the extension to run constantly in the background.

## Your Control and Choices

You can control the extension's behavior via its Options page. You can disable the extension entirely, change settings, clear the excluded domains list, or uninstall the extension at any time. Uninstalling the extension will remove all associated data stored locally by it.

## Changes to This Policy

We may update this Privacy Policy from time to time. We encourage you to review this policy periodically. We will indicate the "Last Updated" date at the top. Significant changes might be noted in the extension's description on the Chrome Web Store.

## Contact Us

If you have any questions or concerns about this Privacy Policy, please contact us at https://github.com/sivaratrisrinivas/tabHibernate/issues. 