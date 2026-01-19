# Content De-Duplicator Userscript

A Tampermonkey/Violentmonkey userscript that hides content you've already seen on sites like Twitter (X) and Reddit. It effectively brings the "r9k" or "unique content only" experience to your social media feeds.

## Features

- **Content Hiding**: Automatically collapses posts, tweets, or comments that you have already seen.
- **Cross-Session Memory**: Remembers what you've seen even after you close the tab or restart the browser.
- **Global Deduplication**: Optionally share your "seen" history across different sites. If you see a specific text block on Reddit, it can be hidden if it appears on Twitter.
- **Adjustable Retention**: Configure how long to remember content (e.g., 1 hour, 24 hours, 7 days).
- **Control Panel**: On-screen overlay to toggle settings, switch modes, or clear your history and unhide everything.

## Installation

1. Install a userscript manager like **Tampermonkey** or **Violentmonkey** for your browser (Chrome, Firefox, Edge, etc.).
2. Click on the extension icon and choose "Create a new script".
3. Copy the contents of [`content_filter.user.js`](./content_filter.user.js) into the editor.
4. Save the script (File > Save or Ctrl+S).
5. Visit Twitter or Reddit to see it in action.

## Usage

- **Browsing**: As you scroll, the script tracks the text content of posts.
- **Hiding**: If a post is a duplicate of something you've seen recently, it will be replaced by a small bar saying "Hidden (Seen) - Click to Reveal".
- **Unhiding**: Simply click the hidden bar to temporarily view the content.
- **Settings**: Look for the "Filter Settings" button (usually bottom-right) to:
    - Change retention time.
    - Switch between "Site Specific" (default) and "Global" memory.
    - Clear all stored data.

## Development

The repository includes a `test_page.html` file. You can open this file in your browser to test the script's logic without needing to visit a live social media site.

1. Allow Tampermonkey to run on file URLs (Chrome Extensions > Tampermonkey > Details > Allow access to file URLs).
2. Open `test_page.html`.
3. Verify that duplicates are hidden and the inputs working correctly.

## Supported Sites

- Twitter / X.com
- Reddit (New & Old)
- Generic fallback for other sites (looks for `.content-item` classes)

## License

Unlicense (Public Domain)
