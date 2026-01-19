// ==UserScript==
// @name         Content De-Duplicator
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Hides content you have already seen based on text content.
// @author       Antigravity
// @match        *://twitter.com/*
// @match        *://x.com/*
// @match        *://www.reddit.com/*
// @match        *://*.reddit.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    // --- Configuration & Constants ---
    const CONFIG = {
        storageKey: 'antigravity_content_seen',
        defaultRetentionMs: 24 * 60 * 60 * 1000, // 24 hours
        checkInterval: 1000,
        scope: 'site', // 'site' or 'global'
        similarityMode: 'low', // 'off', 'low', 'high'
    };

    const THRESHOLDS = {
        'off': -1,  // Disabled
        'low': 0,   // Strict Fuzzy: Identity after NLP + SimHash (Dist 0). Handles case, punctuation, order, stemming.
        'high': 4   // Aggressive: Matches significant typos or variations.
    };

    // --- Polyfills for Development/Testing without TM ---
    const GM = {
        getValue: (typeof GM_getValue !== 'undefined') ? GM_getValue : (msg, def) => {
            const val = localStorage.getItem(msg);
            return val ? JSON.parse(val) : def;
        },
        setValue: (typeof GM_setValue !== 'undefined') ? GM_setValue : (key, val) => {
            localStorage.setItem(key, JSON.stringify(val));
        },
        addStyle: (typeof GM_addStyle !== 'undefined') ? GM_addStyle : (css) => {
            const style = document.createElement('style');
            style.textContent = css;
            document.head.appendChild(style);
        }
    };

    // --- Styles ---
    GM.addStyle(`
        .ag-hidden-content {
            background-color: #f0f0f0;
            border: 1px dashed #ccc;
            padding: 10px;
            color: #888;
            font-size: 0.9em;
            cursor: pointer;
            text-align: center;
            margin: 5px 0;
            border-radius: 4px;
        }
        .ag-hidden-content:hover {
            background-color: #e0e0e0;
            color: #555;
        }
        .ag-overlay-btn {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999;
            background: #333;
            color: #fff;
            padding: 8px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-family: sans-serif;
            font-size: 12px;
            opacity: 0.5;
            transition: opacity 0.2s;
        }
        .ag-overlay-btn:hover { opacity: 1; }
        .ag-settings-panel {
            position: fixed;
            bottom: 60px;
            right: 20px;
            z-index: 9999;
            background: white;
            border: 1px solid #ccc;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-family: sans-serif;
            display: none;
            width: 250px;
            color: #333;
        }
        .ag-settings-panel h3 { margin: 0 0 10px 0; font-size: 16px; }
        .ag-settings-row { margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
        .ag-settings-row label { font-size: 13px; }
    `);

    // --- Logic: Hashing ---
    // --- Logic: Hashing ---
    // Simple FNV-1a hash for exact matching
    function hashString(str) {
        let hash = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }
        return (hash >>> 0).toString(16);
    }

    // --- NLP Helpers ---
    const STOPWORDS = new Set([
        'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren', 'as', 'at',
        'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
        'can', 'cannot', 'could', 'couldn', 'did', 'didn', 'do', 'does', 'doesn', 'doing', 'don', 'down', 'during',
        'each', 'few', 'for', 'from', 'further',
        'had', 'hadn', 'has', 'hasn', 'have', 'haven', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
        'i', 'if', 'in', 'into', 'is', 'isn', 'it', 'its', 'itself',
        'let', 'll', 'me', 'more', 'most', 'mustn', 'my', 'myself',
        'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
        're', 'same', 'shan', 'she', 'should', 'shouldn', 'so', 'some', 'such',
        'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too',
        'under', 'until', 'up', 'very', 've',
        'was', 'wasn', 'we', 'were', 'weren', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'won', 'would', 'wouldn',
        'you', 'your', 'yours', 'yourself', 'yourselves'
    ]);

    // specific porter stemmer step 1abc
    function basicStem(w) {
        if (w.length < 3) return w;
        // Step 1a
        if (w.endsWith('sses')) w = w.slice(0, -2);
        else if (w.endsWith('ies')) w = w.slice(0, -2);
        else if (w.endsWith('ss')) w = w; // strict
        else if (w.endsWith('s')) w = w.slice(0, -1);

        // Step 1b
        let suffix = '';
        if (w.endsWith('eed')) {
            if (w.length > 4) w = w.slice(0, -1); // simplifiction of measure > 0
        } else if ((w.endsWith('ed') && (suffix = 'ed')) || (w.endsWith('ing') && (suffix = 'ing'))) {
            const stem = w.slice(0, -suffix.length);
            if (/[aeiou]/.test(stem)) { // stem contains vowel
                w = stem;
                if (w.endsWith('at') || w.endsWith('bl') || w.endsWith('iz')) w += 'e';
                else if (w.match(/([^aeiou])\1$/) && !w.match(/[^aeiou][lzsz]$/)) w = w.slice(0, -1); // double char
                else if (w.length > 2 && w.match(/^[^aeiou]+[aeiou][^aeiouwxy]$/)) w += 'e'; // short word check (pseudo)
            }
        }
        // Step 1c - simplified 'y'
        if (w.endsWith('y') && /[aeiou]/.test(w.slice(0, -1))) {
            w = w.slice(0, -1) + 'i';
        }

        return w;
    }

    // SimHash for fuzzy matching (32-bit)
    function simHash(str) {
        let tokens = str.toLowerCase().match(/[a-z']+/g) || [];

        // NLP Pre-processing
        tokens = tokens.filter(t => !STOPWORDS.has(t));
        tokens = tokens.map(t => basicStem(t));

        if (tokens.length === 0) return 0; // Fallback if everything is filtered

        const v = new Int32Array(32);

        for (const token of tokens) {
            // Hash token (using FNV-1a variant for speed)
            let hash = 0x811c9dc5;
            for (let i = 0; i < token.length; i++) {
                hash ^= token.charCodeAt(i);
                hash = Math.imul(hash, 0x01000193);
            }

            // Vector add
            for (let i = 0; i < 32; i++) {
                if ((hash >>> i) & 1) {
                    v[i]++;
                } else {
                    v[i]--;
                }
            }
        }

        let fingerprint = 0;
        for (let i = 0; i < 32; i++) {
            if (v[i] > 0) {
                fingerprint |= (1 << i);
            }
        }
        return fingerprint >>> 0; // Unsigned 32-bit integer
    }

    function hammingDistance(a, b) {
        let x = a ^ b;
        let dist = 0;
        while (x > 0) {
            dist += x & 1;
            x >>>= 1;
        }
        return dist;
    }

    // --- Logic: Storage ---
    class StorageManager {
        constructor() {
            this.db = GM.getValue(CONFIG.storageKey, {});
            this.prune();
        }

        save() {
            GM.setValue(CONFIG.storageKey, this.db);
        }

        prune() {
            const now = Date.now();
            let changed = false;
            for (const scope in this.db) {
                for (const h in this.db[scope]) {
                    const entry = this.db[scope][h];
                    // Handle legacy data (number) vs new (object)
                    const ts = (typeof entry === 'number') ? entry : entry.ts;

                    if (now - ts > CONFIG.defaultRetentionMs) {
                        delete this.db[scope][h];
                        changed = true;
                    }
                }
            }
            if (changed) this.save();
        }

        /**
         * Checks if content is a duplicate.
         * Returns:
         *  - 'seen_duplicate': Content is a duplicate of something seen elsewhere/earlier.
         *  - 'original_seen': This IS the original content we saw before (e.g. reload). Keep visible.
         *  - 'new': Never seen.
         */
        check(text, currentId, scopeOverride) {
            const h = hashString(text.trim());
            const sim = (CONFIG.similarityMode !== 'off') ? simHash(text) : null;
            const scope = scopeOverride || CONFIG.scope;

            // Helper to check a specific scope
            const checkScope = (s) => {
                if (!this.db[s]) return null;

                let isKnownSelf = false;

                // 1. Exact Hash Match (O(1))
                if (this.db[s][h]) {
                    const entry = this.db[s][h];
                    const entryData = (typeof entry === 'number') ? { ts: entry, origin: null } : entry;

                    if (currentId && entryData.origin === currentId) {
                        isKnownSelf = true;
                        // Continue to check fuzzy in case we need to hide "self" due to *other* fuzzy matches
                        // (e.g. Threshold increased, or re-evaluating)
                    } else {
                        return 'seen_duplicate';
                    }
                }

                // 2. Fuzzy Match
                const threshold = THRESHOLDS[CONFIG.similarityMode];

                // If Mode is OFF (-1) or invalid, strictly skip fuzzy loop
                // Note: threshold 0 is valid for 'low' (Exact SimHash)
                if (threshold >= 0 && sim !== null) {
                    for (const key in this.db[s]) {
                        // Skip self (Exact Hash)
                        if (key === h) continue;

                        const candidate = this.db[s][key];
                        // Skip if legacy or no sim
                        if (typeof candidate === 'number' || !candidate.sim) continue;

                        // Skip self (Origin ID)
                        if (currentId && candidate.origin === currentId) continue;

                        const dist = hammingDistance(sim, candidate.sim);
                        if (dist <= threshold) {
                            // Found a DIFFERENT item that is similar
                            return 'seen_duplicate';
                        }
                    }
                }

                return isKnownSelf ? 'original_seen' : null;
            };

            let result = null;
            if (CONFIG.scope === 'global') result = checkScope('global');
            if (!result) result = checkScope(window.location.hostname);

            return result || 'new';
        }

        markSeen(text, currentId) {
            const h = hashString(text.trim());
            const sim = simHash(text);
            const scope = CONFIG.scope === 'global' ? 'global' : window.location.hostname;

            if (!this.db[scope]) this.db[scope] = {};
            this.db[scope][h] = {
                ts: Date.now(),
                origin: currentId, // Can be null
                sim: sim // Store SimHash
            };
            this.save();
        }

        reset() {
            this.db = {};
            this.save();
        }
    }

    const storage = new StorageManager();

    // --- Logic: Site Adapters ---
    const adapters = {
        'twitter': {
            selector: 'article[data-testid="tweet"]',
            getData: (el) => {
                const textEl = el.querySelector('div[data-testid="tweetText"]');
                // Extract ID from links like /username/status/12345
                const linkEl = el.querySelector('a[href*="/status/"]');
                const id = linkEl ? linkEl.getAttribute('href').split('/status/')[1].split('/')[0] : null;
                return {
                    text: textEl ? textEl.innerText : null,
                    id: id
                };
            }
        },
        'reddit': {
            // Targeting standard "shreddit-post" and comments
            selector: 'shreddit-post, shreddit-comment',
            getData: (el) => {
                const isComment = el.tagName.toLowerCase() === 'shreddit-comment';
                // Priority: thingid (comments/posts) -> id attribute -> id property
                // shreddit-comment often has empty .id property but valid thingid attribute
                const id = el.getAttribute('thingid') || el.id || el.getAttribute('id');

                let fullText = '';

                if (isComment) {
                    // Comment extraction
                    const commentSlot = el.querySelector('[slot="comment"]');
                    fullText = commentSlot ? commentSlot.innerText : el.innerText;
                } else {
                    // Post extraction
                    const titleEl = el.querySelector('[slot="title"]') || el.querySelector('h1, h2, h3');
                    const bodyEl = el.querySelector('[slot="text-body"]');
                    const titleText = titleEl ? titleEl.innerText : '';
                    const bodyText = bodyEl ? bodyEl.innerText : '';
                    fullText = titleText + "\n" + bodyText;
                }

                if (!fullText.trim()) {
                    fullText = el.innerText;
                }

                return {
                    text: fullText,
                    id: id
                };
            }
        },
        'generic': { // Fallback/Test
            selector: '.content-item',
            getData: (el) => ({
                text: el.innerText,
                id: el.id || el.getAttribute('data-id') || null
            })
        }
    };

    function getAdapter() {
        const h = window.location.hostname;
        if (h.includes('twitter') || h.includes('x.com')) return adapters.twitter;
        if (h.includes('reddit')) return adapters.reddit;
        return adapters.generic;
    }

    // --- Main Processor ---
    function processContent() {
        const adapter = getAdapter();
        const items = document.querySelectorAll(adapter.selector);

        items.forEach(item => {
            if (item.dataset.agProcessed) return;

            // Visual Debug: Show we touched this element
            // item.style.border = "2px solid rgba(255, 0, 0, 0.2)"; // Disabled for production

            const data = adapter.getData(item);
            const text = data.text;
            const currentId = data.id;

            if (!text || text.length < 10) return; // Ignore very short content

            const status = storage.check(text, currentId);

            if (status === 'seen_duplicate') {
                hideItem(item, text);
            } else if (status === 'new') {
                storage.markSeen(text, currentId);
                item.dataset.agProcessed = "true";
            } else if (status === 'original_seen') {
                // It's the original, just mark processed so we don't re-check constanty
                // Optional: Add visual indicator "You've seen this"
                // item.style.border = "1px solid green"; // DEBUG
                item.dataset.agProcessed = "true";
            }
        });
    }

    function hideItem(item, text) {
        // Create placeholder
        const placeholder = document.createElement('div');
        placeholder.className = 'ag-hidden-content';
        placeholder.innerText = 'Hidden (Seen) - Click to Reveal';
        placeholder.title = text.substring(0, 50) + '...';

        // Helper to reveal
        const reveal = () => {
            item.style.display = item.dataset.originalDisplay || '';
            placeholder.remove();
        };

        placeholder.onclick = reveal;
        placeholder.reveal = reveal; // Attach method for "Unhide All"

        // Hide original
        item.dataset.originalDisplay = item.style.display;
        item.style.display = 'none';
        item.parentNode.insertBefore(placeholder, item);

        item.dataset.agProcessed = "true";
    }

    // --- UI ---
    function createUI() {
        if (document.getElementById('ag-ui')) return;

        const btn = document.createElement('div');
        btn.id = 'ag-ui';
        btn.className = 'ag-overlay-btn';
        btn.innerText = 'Filter Settings';

        const panel = document.createElement('div');
        panel.className = 'ag-settings-panel';
        panel.innerHTML = `
            <h3>Content Dedup Settings</h3>
            <div class="ag-settings-row">
                <label>Mode</label>
                <select id="ag-mode-select">
                    <option value="site">Site Specific</option>
                    <option value="global">Global</option>
                </select>
            </div>
            <div class="ag-settings-row">
                <label>Retention</label>
                <select id="ag-retention-select">
                    <option value="3600000">1 Hour</option>
                    <option value="86400000" selected>24 Hours</option>
                    <option value="604800000">7 Days</option>
                </select>
            </div>
            <div class="ag-settings-row">
                <label title="Fuzzy Match Logic">Fuzzy Sensitivity</label>
                <select id="ag-sim-select">
                    <option value="off">Off (Exact String)</option>
                    <option value="low">Standard (Smart)</option>
                    <option value="high">High (Aggressive)</option>
                </select>
            </div>
            <div class="ag-settings-row">
                <button id="ag-unhide-all" style="width:100%; margin-top:10px; background:#4CAF50; color:white; border:none; padding:5px; border-radius:4px;">Unhide All on Page</button>
            </div>
            <div class="ag-settings-row">
                <button id="ag-clear-data" style="width:100%; margin-top:5px; background:#f44336; color:white; border:none; padding:5px; border-radius:4px;">Clear Data</button>
            </div>
        `;

        btn.onclick = () => {
            // Sync UI
            document.getElementById('ag-mode-select').value = CONFIG.scope;
            document.getElementById('ag-retention-select').value = CONFIG.defaultRetentionMs;
            document.getElementById('ag-sim-select').value = CONFIG.similarityMode;

            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        };

        document.body.appendChild(btn);
        document.body.appendChild(panel);

        // Bind events
        document.getElementById('ag-mode-select').onchange = (e) => {
            CONFIG.scope = e.target.value;
            // Reset processed flags to re-evaluate with new scope
            document.querySelectorAll('[data-ag-processed]').forEach(el => {
                delete el.dataset.agProcessed;
                delete el.dataset.originalDisplay;
                el.style.display = '';
                // Remove any existing placeholders
                if (el.previousSibling && el.previousSibling.className === 'ag-hidden-content') {
                    el.previousSibling.remove();
                }
            });
        };

        document.getElementById('ag-retention-select').onchange = (e) => {
            CONFIG.defaultRetentionMs = parseInt(e.target.value);
        };

        const simSelect = document.getElementById('ag-sim-select');
        simSelect.onchange = (e) => {
            CONFIG.similarityMode = e.target.value;

            // Debounced reset
            if (this.resetTimeout) clearTimeout(this.resetTimeout);
            this.resetTimeout = setTimeout(() => {
                document.querySelectorAll('[data-ag-processed]').forEach(el => {
                    delete el.dataset.agProcessed;
                    delete el.dataset.originalDisplay;
                    el.style.display = '';
                    if (el.previousSibling && el.previousSibling.className === 'ag-hidden-content') {
                        el.previousSibling.remove();
                    }
                });
            }, 300);
        };

        document.getElementById('ag-unhide-all').onclick = () => {
            document.querySelectorAll('.ag-hidden-content').forEach(el => {
                if (el.reveal) el.reveal();
            });
        };

        document.getElementById('ag-clear-data').onclick = () => {
            storage.reset();
            alert('Cleared seen history!');
            location.reload();
        };
    }

    // --- Init ---
    console.log('[Antigravity] Script Loaded. Scope:', CONFIG.scope);

    setInterval(() => {
        // Debug selector counts
        const adapter = getAdapter();
        const count = document.querySelectorAll(adapter.selector).length;
        if (count > 0 && Math.random() < 0.05) { // Log occasionally to avoid spam
            console.log(`[Antigravity] Processing ${count} items on ${window.location.hostname}`);
        }
        processContent();
    }, 1000);

    setTimeout(createUI, 2000); // Wait for DOM

})();
