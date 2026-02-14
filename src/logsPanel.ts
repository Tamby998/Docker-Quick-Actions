import * as vscode from 'vscode';
import { DockerManager } from './dockerManager';

export class LogsPanel {
    private static panels: Map<string, LogsPanel> = new Map();
    private panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private stream: NodeJS.ReadableStream | null = null;

    private constructor(
        panel: vscode.WebviewPanel,
        private containerId: string,
        private containerName: string,
        private dockerManager: DockerManager
    ) {
        this.panel = panel;
        this.panel.webview.html = this.getHtml();

        this.panel.webview.onDidReceiveMessage(
            message => {
                if (message.command === 'clear') {
                    this.panel.webview.postMessage({ command: 'cleared' });
                }
            },
            null,
            this.disposables
        );

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.startStreaming();
    }

    static show(containerId: string, containerName: string, dockerManager: DockerManager) {
        const existing = LogsPanel.panels.get(containerId);
        if (existing) {
            existing.panel.reveal();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'dockerLogs',
            `Logs: ${containerName}`,
            vscode.ViewColumn.Two,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        const logsPanel = new LogsPanel(panel, containerId, containerName, dockerManager);
        LogsPanel.panels.set(containerId, logsPanel);
    }

    private async startStreaming() {
        try {
            this.stream = await this.dockerManager.getContainerLogs(this.containerId, true);

            this.stream.on('data', (chunk: Buffer) => {
                let text = chunk.toString('utf8');
                text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
                if (text.trim()) {
                    this.panel.webview.postMessage({ command: 'log', text });
                }
            });

            this.stream.on('error', (err: Error) => {
                this.panel.webview.postMessage({
                    command: 'log',
                    text: `\n--- Stream error: ${err.message} ---\n`
                });
            });

            this.stream.on('end', () => {
                this.panel.webview.postMessage({
                    command: 'log',
                    text: '\n--- Log stream ended ---\n'
                });
            });
        } catch (error: any) {
            this.panel.webview.postMessage({
                command: 'log',
                text: `Error: ${error.message}`
            });
        }
    }

    private getHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Docker Logs</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-editor-font-family, 'Courier New', monospace);
            font-size: var(--vscode-editor-font-size, 13px);
        }
        .toolbar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            padding: 6px 12px;
            background: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            z-index: 10;
        }
        .toolbar .title { font-weight: bold; font-size: 13px; }
        .toolbar button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px 12px;
            cursor: pointer;
            border-radius: 2px;
            font-size: 12px;
        }
        .toolbar button:hover { background: var(--vscode-button-hoverBackground); }
        #logs {
            margin-top: 40px;
            padding: 8px 12px;
            white-space: pre-wrap;
            word-wrap: break-word;
            line-height: 1.5;
        }
        .scroll-indicator {
            position: fixed;
            bottom: 10px;
            right: 10px;
            padding: 4px 8px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 3px;
            font-size: 11px;
            cursor: pointer;
            display: none;
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <span class="title">${this.containerName}</span>
        <div>
            <button id="autoScrollBtn" onclick="toggleAutoScroll()">Auto-scroll: ON</button>
            <button onclick="clearLogs()">Clear</button>
        </div>
    </div>
    <div id="logs"></div>
    <div class="scroll-indicator" id="scrollIndicator" onclick="scrollToBottom()">New logs</div>
    <script>
        const vscode = acquireVsCodeApi();
        const logsEl = document.getElementById('logs');
        const scrollIndicator = document.getElementById('scrollIndicator');
        const autoScrollBtn = document.getElementById('autoScrollBtn');
        let autoScroll = true;

        function toggleAutoScroll() {
            autoScroll = !autoScroll;
            autoScrollBtn.textContent = 'Auto-scroll: ' + (autoScroll ? 'ON' : 'OFF');
            if (autoScroll) scrollToBottom();
        }

        function scrollToBottom() {
            window.scrollTo(0, document.body.scrollHeight);
            scrollIndicator.style.display = 'none';
        }

        function clearLogs() {
            logsEl.textContent = '';
            vscode.postMessage({ command: 'clear' });
        }

        window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.command === 'log') {
                logsEl.textContent += msg.text;
                if (autoScroll) {
                    scrollToBottom();
                } else {
                    scrollIndicator.style.display = 'block';
                }
            } else if (msg.command === 'cleared') {
                logsEl.textContent = '';
            }
        });

        window.addEventListener('scroll', () => {
            const atBottom = (window.innerHeight + window.scrollY) >= document.body.scrollHeight - 50;
            if (atBottom) scrollIndicator.style.display = 'none';
        });
    </script>
</body>
</html>`;
    }

    private dispose() {
        LogsPanel.panels.delete(this.containerId);
        if (this.stream) {
            (this.stream as any).destroy?.();
            this.stream = null;
        }
        this.panel.dispose();
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
