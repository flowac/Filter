# Content De-Duplicator - Chrome Extension

A smart content filtering extension that hides duplicate or similar posts you've already seen on Reddit and Twitter using intelligent fuzzy matching with NLP.

## Features

- **Smart Duplicate Detection**: Uses hash-based exact matching combined with fuzzy SimHash matching
- **NLP-Powered**: Stopword removal and Porter stemming for semantic similarity
- **Configurable Sensitivity**: Off, Standard (Smart), or High (Aggressive) matching modes
- **Site-Specific or Global**: Track content per-site or across all sites
- **Privacy-First**: All data stored locally in your browser
- **Clean UI**: Minimal, non-intrusive settings panel
- **Reversible**: Click any hidden item to reveal it, or "Unhide All" button

## Installation

### Method 1: Unpacked Extension (Development/Testing)

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `content-deduplicator-extension` folder
6. The extension is now active!

### Method 2: Chrome Web Store (Coming Soon)

Install from the Chrome Web Store once published.

## Usage

1. Visit Reddit or Twitter
2. The extension automatically tracks and hides duplicate content
3. Hidden items show as gray placeholders: "Hidden (Seen) - Click to Reveal"
4. Click the "Filter Settings" button (bottom-right) to configure:
   - **Mode**: Site-specific or global tracking
   - **Retention**: How long to remember content (1 hour to 7 days)
   - **Fuzzy Sensitivity**: Matching strictness
5. Use "Unhide All on Page" to reveal everything temporarily
6. Use "Clear Data" to reset all memory

## Permissions

- `storage`: Local data storage for tracking seen content
- `*://*.reddit.com/*`, `*://twitter.com/*`, `*://x.com/*`: Access to filter content on these sites

## Privacy

- **All data stays in your browser** - nothing is sent to external servers
- **No analytics or tracking**
- **No account required**
- Data is automatically pruned based on retention settings

## Development

### Project Structure

```
content-deduplicator-extension/
├── manifest.json          Extension metadata
├── content.js            Main filtering logic
├── icon*.png             Extension icons
└── README.md            This file
```

### Local Testing

1. Make changes to `content.js` or `manifest.json`
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension card
4. Reload the target website to see changes

## Technical Details

- **Hashing**: FNV-1a for exact matching
- **Fuzzy Matching**: 32-bit SimHash with Hamming distance
- **NLP**: Stopword filtering + Porter stemmer (simplified)
- **Storage**: Chrome local storage (no GM_ polyfills needed)

## License

MIT License - Feel free to fork and modify!

## Support

Found a bug or have a feature request? Open an issue on GitHub!
