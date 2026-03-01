import * as vscode from 'vscode';
import { LogEntry, ExportFormat, ExportOptions } from './logTypes';
import { MultiLogsManager } from './multiLogsManager';
import { LogsExporter } from './logsExporter';
import { LogFilterEngine } from './logFilter';

export class MultiLogsPanel {
    private static instance: MultiLogsPanel | undefined;

    private readonly panel: vscode.WebviewPanel;
    private readonly disposables: vscode.Disposable[] = [];

    // -------------------------------------------------------------------------
    // Static entry point
    // -------------------------------------------------------------------------

    static show(
        manager: MultiLogsManager,
        exporter: LogsExporter,
        filterEngine: LogFilterEngine,
        context: vscode.ExtensionContext
    ): void {
        if (MultiLogsPanel.instance) {
            MultiLogsPanel.instance.panel.reveal();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'dockerMultiLogs',
            'Multi-Container Logs',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        MultiLogsPanel.instance = new MultiLogsPanel(panel, manager, exporter, filterEngine);
        context.subscriptions.push(MultiLogsPanel.instance.panel);
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    private constructor(
        panel: vscode.WebviewPanel,
        private readonly manager: MultiLogsManager,
        private readonly exporter: LogsExporter,
        private readonly filterEngine: LogFilterEngine
    ) {
        this.panel = panel;
        this.panel.webview.html = this.getHtml();

        // ---- Listen to manager events and forward them to the webview ----

        const onNewEntries = (entries: LogEntry[]) => {
            this.postMessage({
                command: 'newEntries',
                entries: this.serializeEntries(entries),
            });
        };

        const onContainerAdded = (data: { containerId: string; containerName: string; color: string }) => {
            this.postMessage({
                command: 'containerAdded',
                containerId: data.containerId,
                containerName: data.containerName,
                color: data.color,
            });
        };

        const onContainerRemoved = (containerId: string) => {
            this.postMessage({ command: 'containerRemoved', containerId });
        };

        const onContainerDisconnected = (containerId: string) => {
            this.postMessage({ command: 'containerDisconnected', containerId });
        };

        this.manager.on('newEntries', onNewEntries);
        this.manager.on('containerAdded', onContainerAdded);
        this.manager.on('containerRemoved', onContainerRemoved);
        this.manager.on('containerDisconnected', onContainerDisconnected);

        // ---- Receive messages from the webview ----

        this.disposables.push(
            this.panel.webview.onDidReceiveMessage(async (message) => {
                await this.handleWebviewMessage(message);
            })
        );

        // ---- Cleanup when the panel is closed ----

        this.panel.onDidDispose(
            () => {
                this.manager.off('newEntries', onNewEntries);
                this.manager.off('containerAdded', onContainerAdded);
                this.manager.off('containerRemoved', onContainerRemoved);
                this.manager.off('containerDisconnected', onContainerDisconnected);

                this.disposables.forEach((d) => d.dispose());
                MultiLogsPanel.instance = undefined;
            },
            null,
            this.disposables
        );
    }

    // -------------------------------------------------------------------------
    // Message handling
    // -------------------------------------------------------------------------

    private async handleWebviewMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'ready': {
                const containers = this.manager.getActiveContainers();
                const entries = this.manager.getEntries();
                this.postMessage({
                    command: 'init',
                    entries: this.serializeEntries(entries),
                    containers: containers,
                });
                break;
            }

            case 'export': {
                const format = this.parseExportFormat(message.format);
                const entries = this.manager.getEntries();
                const options: ExportOptions = {
                    format,
                    includeMetadata: true,
                };
                const content = this.exporter.export(entries, options);
                const ext = format === ExportFormat.TXT ? 'txt'
                    : format === ExportFormat.JSON ? 'json'
                    : format === ExportFormat.CSV ? 'csv'
                    : 'html';
                const uri = await vscode.window.showSaveDialog({
                    defaultUri: vscode.Uri.file(`docker-logs.${ext}`),
                    filters: { [`${ext.toUpperCase()} files`]: [ext] },
                });
                if (uri) {
                    const encoder = new TextEncoder();
                    await vscode.workspace.fs.writeFile(uri, encoder.encode(content));
                    vscode.window.showInformationMessage(`Logs exported to ${uri.fsPath}`);
                }
                break;
            }

            case 'clearAll': {
                this.manager.clearLogs();
                this.postMessage({ command: 'cleared' });
                break;
            }

            case 'clearContainer': {
                this.manager.clearLogs(message.containerId);
                this.postMessage({ command: 'clearedContainer', containerId: message.containerId });
                break;
            }

            case 'pauseContainer': {
                this.manager.pauseStream(message.containerId);
                break;
            }

            case 'resumeContainer': {
                this.manager.resumeStream(message.containerId);
                break;
            }
        }
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private postMessage(message: object): void {
        this.panel.webview.postMessage(message);
    }

    private serializeEntries(entries: LogEntry[]): object[] {
        return entries.map((e) => ({
            id: e.id,
            containerId: e.containerId,
            containerName: e.containerName,
            timestamp: e.timestamp.getTime(),
            message: e.message,
            stream: e.stream,
            level: e.level,
            raw: e.raw,
        }));
    }

    private parseExportFormat(format: string): ExportFormat {
        switch (format) {
            case 'json': return ExportFormat.JSON;
            case 'csv': return ExportFormat.CSV;
            case 'html': return ExportFormat.HTML;
            default: return ExportFormat.TXT;
        }
    }

    // -------------------------------------------------------------------------
    // HTML
    // -------------------------------------------------------------------------

    private getHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Multi-Container Logs</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    html, body {
      height: 100%;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-editor-font-family, 'Courier New', monospace);
      font-size: var(--vscode-editor-font-size, 13px);
      overflow: hidden;
    }

    /* ---- Toolbar ---- */
    .toolbar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 42px;
      background: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-panel-border);
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 10px;
      z-index: 100;
      flex-shrink: 0;
    }

    .toolbar input[type="text"] {
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 2px;
      padding: 3px 8px;
      font-size: 12px;
      font-family: inherit;
      width: 180px;
      outline: none;
    }
    .toolbar input[type="text"]:focus {
      border-color: var(--vscode-focusBorder);
    }
    .toolbar input[type="text"]::placeholder {
      color: var(--vscode-input-placeholderForeground);
    }

    .toolbar select {
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border, transparent);
      border-radius: 2px;
      padding: 3px 6px;
      font-size: 12px;
      font-family: inherit;
      cursor: pointer;
      outline: none;
    }
    .toolbar select:focus {
      border-color: var(--vscode-focusBorder);
    }

    .toolbar-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 2px;
      padding: 4px 10px;
      font-size: 12px;
      font-family: inherit;
      cursor: pointer;
      white-space: nowrap;
    }
    .toolbar-btn:hover { background: var(--vscode-button-hoverBackground); }

    .toolbar-btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .toolbar-btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }

    .toolbar-toggle {
      background: transparent;
      color: var(--vscode-editor-foreground);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 2px;
      padding: 3px 8px;
      font-size: 11px;
      font-family: inherit;
      cursor: pointer;
      opacity: 0.7;
    }
    .toolbar-toggle:hover { opacity: 1; }
    .toolbar-toggle.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      opacity: 1;
      border-color: transparent;
    }

    .toolbar-separator {
      width: 1px;
      height: 22px;
      background: var(--vscode-panel-border);
      flex-shrink: 0;
    }

    .toolbar-spacer { flex: 1; }

    /* Export dropdown */
    .dropdown-wrapper {
      position: relative;
      display: inline-flex;
    }
    .dropdown-menu {
      display: none;
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      background: var(--vscode-menu-background, var(--vscode-dropdown-background));
      color: var(--vscode-menu-foreground, var(--vscode-dropdown-foreground));
      border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border));
      border-radius: 2px;
      z-index: 200;
      min-width: 130px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .dropdown-menu.open { display: block; }
    .dropdown-item {
      padding: 6px 12px;
      cursor: pointer;
      font-size: 12px;
      white-space: nowrap;
    }
    .dropdown-item:hover {
      background: var(--vscode-menu-selectionBackground, var(--vscode-list-activeSelectionBackground));
      color: var(--vscode-menu-selectionForeground, var(--vscode-list-activeSelectionForeground));
    }

    /* Clear dropdown */
    .clear-dropdown-menu {
      right: 0;
      left: auto;
    }

    /* ---- Main layout ---- */
    .main {
      position: fixed;
      top: 42px;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      overflow: hidden;
    }

    /* ---- Sidebar ---- */
    .sidebar {
      width: 200px;
      min-width: 200px;
      background: var(--vscode-sideBar-background, var(--vscode-editor-background));
      border-right: 1px solid var(--vscode-panel-border);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .sidebar-header {
      padding: 8px 10px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--vscode-sideBarTitle-foreground, var(--vscode-editor-foreground));
      border-bottom: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
      opacity: 0.7;
    }
    #container-list {
      overflow-y: auto;
      flex: 1;
      padding: 4px 0;
    }
    .container-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 8px;
      cursor: default;
      user-select: none;
    }
    .container-item:hover { background: var(--vscode-list-hoverBackground); }
    .container-item.disconnected { opacity: 0.5; }

    .container-checkbox {
      flex-shrink: 0;
      cursor: pointer;
      accent-color: var(--vscode-button-background);
    }
    .container-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .container-name {
      flex: 1;
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .container-status {
      font-size: 10px;
      opacity: 0.6;
    }
    .container-actions {
      display: flex;
      gap: 2px;
      flex-shrink: 0;
    }
    .container-action-btn {
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 1px 3px;
      font-size: 11px;
      color: var(--vscode-editor-foreground);
      opacity: 0.5;
      border-radius: 2px;
      line-height: 1;
    }
    .container-action-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }

    /* ---- Logs area ---- */
    .logs-area {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 4px 0;
      position: relative;
    }

    #empty-state {
      display: none;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      opacity: 0.4;
      font-size: 13px;
      padding: 20px;
      pointer-events: none;
    }
    #empty-state.visible { display: block; }

    #log-entries {
      padding: 0 4px;
    }

    .log-entry {
      display: flex;
      align-items: baseline;
      gap: 6px;
      padding: 1px 8px 1px 6px;
      border-left: 3px solid transparent;
      line-height: 1.55;
      font-size: var(--vscode-editor-font-size, 13px);
      font-family: var(--vscode-editor-font-family, 'Courier New', monospace);
      word-break: break-all;
      white-space: pre-wrap;
    }
    .log-entry:hover { background: var(--vscode-list-hoverBackground); }

    .ts {
      color: var(--vscode-debugConsole-infoForeground, #6b7280);
      font-size: 11px;
      white-space: nowrap;
      flex-shrink: 0;
      opacity: 0.7;
    }

    .container-badge {
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .level-badge {
      font-size: 10px;
      font-weight: 700;
      padding: 0 5px;
      border-radius: 3px;
      white-space: nowrap;
      flex-shrink: 0;
      text-transform: uppercase;
    }
    .level-error  { background: rgba(239,68,68,0.2);  color: #ef4444; }
    .level-warn   { background: rgba(245,158,11,0.2); color: #f59e0b; }
    .level-info   { background: rgba(59,130,246,0.2); color: #3b82f6; }
    .level-debug  { background: rgba(107,114,128,0.15); color: #9ca3af; }
    .level-unknown { background: rgba(156,163,175,0.1); color: #9ca3af; }

    .msg {
      flex: 1;
      overflow-wrap: break-word;
      white-space: pre-wrap;
    }

    mark {
      background: rgba(255, 213, 0, 0.35);
      color: inherit;
      border-radius: 2px;
      padding: 0 1px;
    }

    /* Auto-scroll anchor */
    #scroll-anchor { height: 1px; }

    /* New-logs indicator */
    #new-logs-indicator {
      display: none;
      position: fixed;
      bottom: 14px;
      right: 14px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 10px;
      padding: 4px 12px;
      font-size: 11px;
      cursor: pointer;
      z-index: 50;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    #new-logs-indicator.visible { display: block; }
  </style>
</head>
<body>

  <!-- =============================== TOOLBAR =============================== -->
  <div class="toolbar">
    <input
      type="text"
      id="search-input"
      placeholder="Search logs..."
      autocomplete="off"
      spellcheck="false"
    />

    <select id="level-filter" title="Filter by level">
      <option value="">All levels</option>
      <option value="error">Error</option>
      <option value="warn">Warn</option>
      <option value="info">Info</option>
      <option value="debug">Debug</option>
      <option value="unknown">Unknown</option>
    </select>

    <select id="stream-filter" title="Filter by stream">
      <option value="">All streams</option>
      <option value="stdout">stdout</option>
      <option value="stderr">stderr</option>
    </select>

    <div class="toolbar-separator"></div>

    <!-- Export dropdown -->
    <div class="dropdown-wrapper" id="export-wrapper">
      <button class="toolbar-btn" id="export-btn" title="Export logs">Export</button>
      <div class="dropdown-menu" id="export-menu">
        <div class="dropdown-item" data-format="txt">Plain Text (.txt)</div>
        <div class="dropdown-item" data-format="json">JSON (.json)</div>
        <div class="dropdown-item" data-format="csv">CSV (.csv)</div>
        <div class="dropdown-item" data-format="html">HTML (.html)</div>
      </div>
    </div>

    <!-- Clear dropdown -->
    <div class="dropdown-wrapper" id="clear-wrapper">
      <button class="toolbar-btn toolbar-btn-secondary" id="clear-btn" title="Clear logs">Clear</button>
      <div class="dropdown-menu clear-dropdown-menu" id="clear-menu">
        <div class="dropdown-item" id="clear-all-item">Clear All</div>
        <div id="clear-container-items"></div>
      </div>
    </div>

    <div class="toolbar-spacer"></div>

    <button class="toolbar-toggle active" id="autoscroll-btn" title="Toggle auto-scroll">Auto-scroll</button>
    <button class="toolbar-toggle" id="reltime-btn" title="Toggle relative/absolute timestamps">Relative time</button>
  </div>

  <!-- =============================== MAIN ================================== -->
  <div class="main">
    <div class="sidebar">
      <div class="sidebar-header">Containers</div>
      <div id="container-list"></div>
    </div>
    <div class="logs-area" id="logs-area">
      <div id="empty-state">No containers added.<br>Right-click a container in the sidebar to add.</div>
      <div id="log-entries"></div>
      <div id="scroll-anchor"></div>
    </div>
  </div>

  <div id="new-logs-indicator">New logs &darr;</div>

  <!-- =============================== SCRIPT ================================ -->
  <script>
    'use strict';

    const vscode = acquireVsCodeApi();

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    const MAX_ENTRIES = 5000;

    /** @type {Array<{id:number,containerId:string,containerName:string,timestamp:number,message:string,stream:string,level:string}>} */
    let allEntries = [];

    /**
     * @type {Object.<string, {name:string, color:string, visible:boolean, active:boolean, paused:boolean}>}
     */
    let containers = {};

    let filter = {
      levels: [],       // string[]  - empty means all
      stream: '',       // '' | 'stdout' | 'stderr'
    };
    let searchText = '';
    let autoScroll = true;
    let relativeTime = false;

    // debounce timer for search
    let searchDebounceTimer = null;

    // incremental render: track last rendered count of filtered entries
    // when new entries arrive we can append only the newly visible ones
    let lastRenderedFilteredCount = 0;

    // -------------------------------------------------------------------------
    // DOM refs
    // -------------------------------------------------------------------------

    const logEntriesEl   = document.getElementById('log-entries');
    const containerList  = document.getElementById('container-list');
    const emptyState     = document.getElementById('empty-state');
    const logsArea       = document.getElementById('logs-area');
    const newLogsInd     = document.getElementById('new-logs-indicator');
    const searchInput    = document.getElementById('search-input');
    const levelFilter    = document.getElementById('level-filter');
    const streamFilter   = document.getElementById('stream-filter');
    const autoscrollBtn  = document.getElementById('autoscroll-btn');
    const reltimeBtn     = document.getElementById('reltime-btn');
    const exportBtn      = document.getElementById('export-btn');
    const exportMenu     = document.getElementById('export-menu');
    const exportWrapper  = document.getElementById('export-wrapper');
    const clearBtn       = document.getElementById('clear-btn');
    const clearMenu      = document.getElementById('clear-menu');
    const clearWrapper   = document.getElementById('clear-wrapper');
    const clearAllItem   = document.getElementById('clear-all-item');
    const clearContItems = document.getElementById('clear-container-items');
    const scrollAnchor   = document.getElementById('scroll-anchor');

    // -------------------------------------------------------------------------
    // Filtering
    // -------------------------------------------------------------------------

    /** Returns the subset of allEntries that pass the current filters. */
    function getFilteredEntries() {
      return allEntries.filter(function(e) {
        // Container visibility
        const c = containers[e.containerId];
        if (c && !c.visible) { return false; }

        // Level filter
        if (filter.levels.length > 0 && !filter.levels.includes(e.level)) { return false; }

        // Stream filter
        if (filter.stream && e.stream !== filter.stream) { return false; }

        // Search text
        if (searchText) {
          if (e.message.toLowerCase().indexOf(searchText.toLowerCase()) === -1) { return false; }
        }

        return true;
      });
    }

    // -------------------------------------------------------------------------
    // Rendering
    // -------------------------------------------------------------------------

    /** Full re-render of the log entries area. */
    function renderEntries() {
      const filtered = getFilteredEntries();
      logEntriesEl.innerHTML = '';
      lastRenderedFilteredCount = 0;

      if (filtered.length === 0) {
        maybeShowEmptyState();
        return;
      }
      maybeShowEmptyState();

      const frag = document.createDocumentFragment();
      for (var i = 0; i < filtered.length; i++) {
        frag.appendChild(buildEntryEl(filtered[i]));
      }
      logEntriesEl.appendChild(frag);
      lastRenderedFilteredCount = filtered.length;

      if (autoScroll) { scrollToBottom(); }
    }

    /**
     * Incremental append: called when new entries arrive.
     * Only appends entries that weren't rendered yet and pass the filter.
     */
    function appendNewEntries(newEntries) {
      // Filter only the new batch
      const visible = newEntries.filter(function(e) {
        const c = containers[e.containerId];
        if (c && !c.visible) { return false; }
        if (filter.levels.length > 0 && !filter.levels.includes(e.level)) { return false; }
        if (filter.stream && e.stream !== filter.stream) { return false; }
        if (searchText) {
          if (e.message.toLowerCase().indexOf(searchText.toLowerCase()) === -1) { return false; }
        }
        return true;
      });

      if (visible.length === 0) { return; }

      maybeShowEmptyState();

      const frag = document.createDocumentFragment();
      for (var i = 0; i < visible.length; i++) {
        frag.appendChild(buildEntryEl(visible[i]));
      }
      logEntriesEl.appendChild(frag);
      lastRenderedFilteredCount += visible.length;

      if (autoScroll) {
        scrollToBottom();
      } else {
        newLogsInd.classList.add('visible');
      }
    }

    /** Build a single log entry DOM element. */
    function buildEntryEl(entry) {
      const c = containers[entry.containerId];
      const color = c ? c.color : '#9ca3af';
      const name  = c ? c.name  : entry.containerName;

      const div = document.createElement('div');
      div.className = 'log-entry';
      div.style.borderLeftColor = color;

      const tsSpan = document.createElement('span');
      tsSpan.className = 'ts';
      tsSpan.textContent = formatTimestamp(entry.timestamp);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'container-badge';
      nameSpan.style.color = color;
      nameSpan.textContent = name;

      const levelSpan = document.createElement('span');
      levelSpan.className = 'level-badge level-' + entry.level;
      levelSpan.textContent = entry.level;

      const msgSpan = document.createElement('span');
      msgSpan.className = 'msg';
      if (searchText) {
        msgSpan.innerHTML = highlightSearch(escapeHtml(entry.message), searchText);
      } else {
        msgSpan.textContent = entry.message;
      }

      div.appendChild(tsSpan);
      div.appendChild(nameSpan);
      div.appendChild(levelSpan);
      div.appendChild(msgSpan);

      return div;
    }

    // -------------------------------------------------------------------------
    // Utilities
    // -------------------------------------------------------------------------

    function escapeHtml(text) {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    /** Wrap all occurrences of the search term in <mark> tags. */
    function highlightSearch(escapedText, term) {
      if (!term) { return escapedText; }
      const escapedTerm = escapeRegExp(escapeHtml(term));
      const re = new RegExp('(' + escapedTerm + ')', 'gi');
      return escapedText.replace(re, '<mark>$1</mark>');
    }

    function escapeRegExp(str) {
      return str.replace(/[.*+?^{}()|[\\\\\]\\\\$]/g, '\\\\$&');
    }

    /**
     * Format a timestamp (ms since epoch) as either absolute (HH:mm:ss.ms)
     * or relative ("2s ago", "1m ago", etc.).
     */
    function formatTimestamp(ts) {
      if (relativeTime) {
        const diff = Date.now() - ts;
        if (diff < 1000)       { return 'just now'; }
        if (diff < 60000)      { return Math.floor(diff / 1000) + 's ago'; }
        if (diff < 3600000)    { return Math.floor(diff / 60000) + 'm ago'; }
        if (diff < 86400000)   { return Math.floor(diff / 3600000) + 'h ago'; }
        return Math.floor(diff / 86400000) + 'd ago';
      }
      const d = new Date(ts);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      const ms = String(d.getMilliseconds()).padStart(3, '0');
      return hh + ':' + mm + ':' + ss + '.' + ms;
    }

    function scrollToBottom() {
      scrollAnchor.scrollIntoView({ block: 'end' });
      newLogsInd.classList.remove('visible');
    }

    function maybeShowEmptyState() {
      const hasContainers = Object.keys(containers).length > 0;
      const hasVisible = allEntries.some(function(e) {
        const c = containers[e.containerId];
        return !c || c.visible;
      });
      if (!hasContainers || (hasContainers && allEntries.length === 0)) {
        emptyState.classList.add('visible');
      } else {
        emptyState.classList.remove('visible');
      }
    }

    // -------------------------------------------------------------------------
    // Sidebar: container list
    // -------------------------------------------------------------------------

    function renderContainerList() {
      containerList.innerHTML = '';
      clearContItems.innerHTML = '';

      const ids = Object.keys(containers);
      if (ids.length === 0) {
        emptyState.classList.add('visible');
        return;
      }
      emptyState.classList.remove('visible');

      ids.forEach(function(cid) {
        const c = containers[cid];

        // --- Sidebar item ---
        const item = document.createElement('div');
        item.className = 'container-item' + (c.active ? '' : ' disconnected');
        item.id = 'cont-item-' + cid;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'container-checkbox';
        checkbox.checked = c.visible;
        checkbox.title = 'Toggle visibility';
        checkbox.addEventListener('change', function() {
          c.visible = checkbox.checked;
          renderEntries();
        });

        const dot = document.createElement('span');
        dot.className = 'container-dot';
        dot.style.background = c.color;

        const nameEl = document.createElement('span');
        nameEl.className = 'container-name';
        nameEl.textContent = c.name;
        nameEl.title = c.name + ' (' + cid.slice(0, 12) + ')';

        const actions = document.createElement('div');
        actions.className = 'container-actions';

        const pauseBtn = document.createElement('button');
        pauseBtn.className = 'container-action-btn';
        pauseBtn.title = c.paused ? 'Resume stream' : 'Pause stream';
        pauseBtn.textContent = c.paused ? '\\u25B6' : '\\u23F8';
        pauseBtn.addEventListener('click', function() {
          if (c.paused) {
            vscode.postMessage({ command: 'resumeContainer', containerId: cid });
            c.paused = false;
          } else {
            vscode.postMessage({ command: 'pauseContainer', containerId: cid });
            c.paused = true;
          }
          // Re-render sidebar to update button icon
          renderContainerList();
        });

        actions.appendChild(pauseBtn);

        item.appendChild(checkbox);
        item.appendChild(dot);
        item.appendChild(nameEl);
        item.appendChild(actions);
        containerList.appendChild(item);

        // --- Clear menu item ---
        const clearItem = document.createElement('div');
        clearItem.className = 'dropdown-item';
        clearItem.textContent = 'Clear ' + c.name;
        clearItem.addEventListener('click', function() {
          vscode.postMessage({ command: 'clearContainer', containerId: cid });
          hideClearMenu();
        });
        clearContItems.appendChild(clearItem);
      });
    }

    // -------------------------------------------------------------------------
    // Toolbar controls
    // -------------------------------------------------------------------------

    // Search (debounced 300 ms)
    searchInput.addEventListener('input', function() {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(function() {
        searchText = searchInput.value.trim();
        renderEntries();
      }, 300);
    });

    // Level filter
    levelFilter.addEventListener('change', function() {
      const val = levelFilter.value;
      filter.levels = val ? [val] : [];
      renderEntries();
    });

    // Stream filter
    streamFilter.addEventListener('change', function() {
      filter.stream = streamFilter.value;
      renderEntries();
    });

    // Auto-scroll toggle
    autoscrollBtn.addEventListener('click', function() {
      autoScroll = !autoScroll;
      autoscrollBtn.classList.toggle('active', autoScroll);
      if (autoScroll) { scrollToBottom(); }
    });

    // Relative time toggle
    reltimeBtn.addEventListener('click', function() {
      relativeTime = !relativeTime;
      reltimeBtn.classList.toggle('active', relativeTime);
      renderEntries();
    });

    // Refresh relative timestamps every 10 s when that mode is active
    setInterval(function() {
      if (relativeTime) { renderEntries(); }
    }, 10000);

    // Export dropdown
    exportBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      exportMenu.classList.toggle('open');
      clearMenu.classList.remove('open');
    });

    exportMenu.querySelectorAll('.dropdown-item').forEach(function(item) {
      item.addEventListener('click', function() {
        const fmt = item.getAttribute('data-format');
        vscode.postMessage({ command: 'export', format: fmt });
        exportMenu.classList.remove('open');
      });
    });

    // Clear dropdown
    clearBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      clearMenu.classList.toggle('open');
      exportMenu.classList.remove('open');
    });

    clearAllItem.addEventListener('click', function() {
      vscode.postMessage({ command: 'clearAll' });
      hideClearMenu();
    });

    function hideClearMenu() {
      clearMenu.classList.remove('open');
    }

    // Close dropdowns when clicking outside
    document.addEventListener('click', function(e) {
      if (!exportWrapper.contains(e.target)) { exportMenu.classList.remove('open'); }
      if (!clearWrapper.contains(e.target))  { clearMenu.classList.remove('open'); }
    });

    // New-logs indicator
    newLogsInd.addEventListener('click', function() {
      autoScroll = true;
      autoscrollBtn.classList.add('active');
      scrollToBottom();
    });

    // Detect manual scroll away from bottom → disable auto-scroll
    logsArea.addEventListener('scroll', function() {
      const atBottom = logsArea.scrollTop + logsArea.clientHeight >= logsArea.scrollHeight - 60;
      if (atBottom) {
        newLogsInd.classList.remove('visible');
      }
    });

    // -------------------------------------------------------------------------
    // Message handling
    // -------------------------------------------------------------------------

    window.addEventListener('message', function(event) {
      const msg = event.data;

      switch (msg.command) {

        case 'init': {
          allEntries = (msg.entries || []).slice(-MAX_ENTRIES);

          // Rebuild containers map from the provided list
          containers = {};
          (msg.containers || []).forEach(function(c) {
            containers[c.containerId] = {
              name: c.containerName,
              color: c.color,
              visible: true,
              active: c.active,
              paused: c.paused,
            };
          });

          renderContainerList();
          renderEntries();
          break;
        }

        case 'newEntries': {
          const incoming = msg.entries || [];
          allEntries.push.apply(allEntries, incoming);
          // Cap at MAX_ENTRIES (trim oldest)
          if (allEntries.length > MAX_ENTRIES) {
            allEntries = allEntries.slice(allEntries.length - MAX_ENTRIES);
            // After capping we must do a full re-render to remove orphaned DOM nodes
            renderEntries();
          } else {
            appendNewEntries(incoming);
          }
          break;
        }

        case 'containerAdded': {
          containers[msg.containerId] = {
            name: msg.containerName,
            color: msg.color,
            visible: true,
            active: true,
            paused: false,
          };
          renderContainerList();
          maybeShowEmptyState();
          break;
        }

        case 'containerRemoved': {
          delete containers[msg.containerId];
          renderContainerList();
          renderEntries();
          break;
        }

        case 'containerDisconnected': {
          if (containers[msg.containerId]) {
            containers[msg.containerId].active = false;
            const item = document.getElementById('cont-item-' + msg.containerId);
            if (item) { item.classList.add('disconnected'); }
          }
          break;
        }

        case 'cleared': {
          allEntries = [];
          logEntriesEl.innerHTML = '';
          lastRenderedFilteredCount = 0;
          maybeShowEmptyState();
          break;
        }

        case 'clearedContainer': {
          allEntries = allEntries.filter(function(e) {
            return e.containerId !== msg.containerId;
          });
          renderEntries();
          break;
        }
      }
    });

    // -------------------------------------------------------------------------
    // Boot
    // -------------------------------------------------------------------------

    maybeShowEmptyState();
    vscode.postMessage({ command: 'ready' });
  </script>
</body>
</html>`;
    }
}
