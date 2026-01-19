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
    // Simple FNV-1a hash
    function hashString(str) {
        let hash = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }
        return (hash >>> 0).toString(16);
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
                    if (now - this.db[scope][h] > CONFIG.defaultRetentionMs) {
                        delete this.db[scope][h];
                        changed = true;
                    }
                }
            }
            if (changed) this.save();
        }

        hasSeen(text, scopeOverride) {
            const h = hashString(text.trim());
            const scope = scopeOverride || CONFIG.scope;

            // Check global
            if (CONFIG.scope === 'global' && this.db['global'] && this.db['global'][h]) return true;
            // Check specific site
            const site = window.location.hostname;
            if (this.db[site] && this.db[site][h]) return true;

            return false;
        }

        markSeen(text) {
            const h = hashString(text.trim());
            const scope = CONFIG.scope === 'global' ? 'global' : window.location.hostname;

            if (!this.db[scope]) this.db[scope] = {};
            this.db[scope][h] = Date.now();
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
            getText: (el) => {
                const textEl = el.querySelector('div[data-testid="tweetText"]');
                return textEl ? textEl.innerText : null;
            }
        },
        'reddit': {
            // Reddit is tricky with its diverse layouts (old/new/shreddit). 
            // Targeting standard "shreddit-post" or classic things.
            selector: 'shreddit-post, div.thing',
            getText: (el) => {
                // Try getting title or body
                return el.innerText;
            }
        },
        'generic': { // Fallback/Test
            selector: '.content-item',
            getText: (el) => el.innerText
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

            const text = adapter.getText(item);
            if (!text || text.length < 10) return; // Ignore very short content

            if (storage.hasSeen(text)) {
                hideItem(item, text);
            } else {
                storage.markSeen(text);
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

        placeholder.onclick = () => {
            item.style.display = item.dataset.originalDisplay || '';
            placeholder.remove();
        };

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
                <button id="ag-clear-data" style="width:100%; margin-top:10px;">Clear Data</button>
            </div>
        `;

        btn.onclick = () => {
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        };

        document.body.appendChild(btn);
        document.body.appendChild(panel);

        // Bind events
        document.getElementById('ag-mode-select').onchange = (e) => {
            CONFIG.scope = e.target.value;
            // Optionally re-process or just effect new items
        };

        document.getElementById('ag-retention-select').onchange = (e) => {
            CONFIG.defaultRetentionMs = parseInt(e.target.value);
        };

        document.getElementById('ag-clear-data').onclick = () => {
            storage.reset();
            alert('Cleared seen history!');
            location.reload();
        };
    }

    // --- Init ---
    setInterval(processContent, 1000); // Polling for now, safer than MutationObserver for beginners/performance initially
    setTimeout(createUI, 2000); // Wait for DOM

})();
