import * as vscode from 'vscode';
import { StatsCollector, ContainerStats } from './statsCollector';
import { formatBytes, formatCpuPercent } from './statsFormatter';

export class StatsPanel {
    private static instance: StatsPanel | undefined;
    private panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private statsListener: ((stats: ContainerStats) => void) | null = null;

    private constructor(
        panel: vscode.WebviewPanel,
        private statsCollector: StatsCollector
    ) {
        this.panel = panel;
        this.panel.webview.html = this.getHtml();
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.startListening();
    }

    static show(statsCollector: StatsCollector): void {
        if (StatsPanel.instance) {
            StatsPanel.instance.panel.reveal();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'dockerStats',
            'Docker Resources Monitor',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        StatsPanel.instance = new StatsPanel(panel, statsCollector);
    }

    private startListening(): void {
        // Send initial stats
        const allStats = this.statsCollector.getAllStats();
        for (const [, stats] of allStats) {
            this.panel.webview.postMessage({ command: 'stats', data: stats });
        }

        this.statsListener = (stats: ContainerStats) => {
            this.panel.webview.postMessage({ command: 'stats', data: stats });
        };
        this.statsCollector.on('stats', this.statsListener);
    }

    private getHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Docker Resources Monitor</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, sans-serif);
            font-size: 13px;
            padding: 16px;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .header h1 { font-size: 16px; font-weight: 600; }
        .header button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px 12px;
            cursor: pointer;
            border-radius: 3px;
            font-size: 12px;
        }
        .header button:hover { background: var(--vscode-button-hoverBackground); }
        .charts-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            margin-bottom: 16px;
        }
        .chart-card {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 12px;
        }
        .chart-card h3 {
            font-size: 13px;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .chart-container { position: relative; height: 200px; }
        canvas { width: 100% !important; height: 100% !important; }
        .summary-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 16px;
        }
        .summary-table th, .summary-table td {
            text-align: left;
            padding: 8px 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            font-size: 12px;
        }
        .summary-table th {
            font-weight: 600;
            background: var(--vscode-editor-inactiveSelectionBackground);
            position: sticky;
            top: 0;
        }
        .badge {
            display: inline-block;
            padding: 1px 6px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: 500;
        }
        .badge-green { background: rgba(40, 167, 69, 0.2); color: #28a745; }
        .badge-yellow { background: rgba(255, 193, 7, 0.2); color: #ffc107; }
        .badge-red { background: rgba(220, 53, 69, 0.2); color: #dc3545; }
        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: var(--vscode-descriptionForeground);
        }
        .empty-state h2 { font-size: 18px; margin-bottom: 8px; }
        @media (max-width: 600px) {
            .charts-grid { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Docker Resources Monitor</h1>
        <div>
            <button onclick="exportPng()">Export PNG</button>
            <button onclick="clearData()">Clear</button>
        </div>
    </div>

    <div id="emptyState" class="empty-state">
        <h2>Waiting for container stats...</h2>
        <p>Start a Docker container to see resource metrics</p>
    </div>

    <div id="content" style="display:none;">
        <div class="charts-grid">
            <div class="chart-card">
                <h3>CPU Usage (%)</h3>
                <div class="chart-container"><canvas id="cpuChart"></canvas></div>
            </div>
            <div class="chart-card">
                <h3>Memory Usage (%)</h3>
                <div class="chart-container"><canvas id="memChart"></canvas></div>
            </div>
        </div>

        <h3 style="margin-bottom:8px;">All Containers</h3>
        <table class="summary-table">
            <thead>
                <tr>
                    <th>Container</th>
                    <th>CPU</th>
                    <th>Memory</th>
                    <th>Mem %</th>
                    <th>Net RX</th>
                    <th>Net TX</th>
                    <th>Block R</th>
                    <th>Block W</th>
                </tr>
            </thead>
            <tbody id="statsBody"></tbody>
        </table>
    </div>

    <script>
        const vscodeApi = acquireVsCodeApi();
        const MAX_POINTS = 60;
        const COLORS = [
            'rgba(59,130,246,1)', 'rgba(16,185,129,1)',
            'rgba(245,158,11,1)', 'rgba(239,68,68,1)',
            'rgba(139,92,246,1)', 'rgba(236,72,153,1)'
        ];
        const COLORS_BG = [
            'rgba(59,130,246,0.1)', 'rgba(16,185,129,0.1)',
            'rgba(245,158,11,0.1)', 'rgba(239,68,68,0.1)',
            'rgba(139,92,246,0.1)', 'rgba(236,72,153,0.1)'
        ];

        const containerData = {};
        let containerColors = {};
        let colorIndex = 0;
        let cpuChart = null, memChart = null;

        function getColor(containerId) {
            if (!containerColors[containerId]) {
                containerColors[containerId] = colorIndex % COLORS.length;
                colorIndex++;
            }
            return containerColors[containerId];
        }

        function formatBytes(bytes) {
            if (bytes === 0) return '0 B';
            const units = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
            return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
        }

        function getBadgeClass(percent) {
            if (percent < 50) return 'badge-green';
            if (percent < 80) return 'badge-yellow';
            return 'badge-red';
        }

        function initCharts() {
            const gridColor = 'rgba(128,128,128,0.15)';
            const textColor = getComputedStyle(document.body).color || '#ccc';
            const commonOpts = {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 300 },
                scales: {
                    x: { display: false },
                    y: { min: 0, max: 100, grid: { color: gridColor }, ticks: { color: textColor, callback: v => v + '%' } }
                },
                plugins: { legend: { position: 'bottom', labels: { color: textColor, boxWidth: 12, padding: 8 } } }
            };

            const cpuCtx = document.getElementById('cpuChart').getContext('2d');
            cpuChart = new Chart(cpuCtx, { type: 'line', data: { labels: [], datasets: [] }, options: { ...commonOpts } });

            const memCtx = document.getElementById('memChart').getContext('2d');
            memChart = new Chart(memCtx, { type: 'line', data: { labels: [], datasets: [] }, options: { ...commonOpts } });
        }

        function updateCharts() {
            const ids = Object.keys(containerData);
            const labels = Array.from({ length: MAX_POINTS }, (_, i) => '');

            for (const chart of [cpuChart, memChart]) {
                chart.data.labels = labels;
                chart.data.datasets = [];
            }

            for (const id of ids) {
                const d = containerData[id];
                const ci = getColor(id);

                cpuChart.data.datasets.push({
                    label: d.name,
                    data: d.cpuHistory.slice(-MAX_POINTS),
                    borderColor: COLORS[ci],
                    backgroundColor: COLORS_BG[ci],
                    fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2
                });

                memChart.data.datasets.push({
                    label: d.name,
                    data: d.memHistory.slice(-MAX_POINTS),
                    borderColor: COLORS[ci],
                    backgroundColor: COLORS_BG[ci],
                    fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2
                });
            }

            cpuChart.update('none');
            memChart.update('none');
        }

        function updateTable() {
            const body = document.getElementById('statsBody');
            body.innerHTML = '';
            for (const [id, d] of Object.entries(containerData)) {
                const s = d.latest;
                if (!s) continue;
                const tr = document.createElement('tr');
                tr.innerHTML =
                    '<td><strong>' + s.containerName + '</strong></td>' +
                    '<td><span class="badge ' + getBadgeClass(s.cpuPercent) + '">' + s.cpuPercent.toFixed(1) + '%</span></td>' +
                    '<td>' + formatBytes(s.memoryUsage) + ' / ' + formatBytes(s.memoryLimit) + '</td>' +
                    '<td><span class="badge ' + getBadgeClass(s.memoryPercent) + '">' + s.memoryPercent.toFixed(1) + '%</span></td>' +
                    '<td>' + formatBytes(s.networkRx) + '</td>' +
                    '<td>' + formatBytes(s.networkTx) + '</td>' +
                    '<td>' + formatBytes(s.blockRead) + '</td>' +
                    '<td>' + formatBytes(s.blockWrite) + '</td>';
                body.appendChild(tr);
            }
        }

        function clearData() {
            for (const id of Object.keys(containerData)) {
                containerData[id].cpuHistory = [];
                containerData[id].memHistory = [];
            }
            updateCharts();
        }

        function exportPng() {
            const link = document.createElement('a');
            link.download = 'docker-stats-cpu.png';
            link.href = cpuChart.toBase64Image();
            link.click();
            setTimeout(() => {
                link.download = 'docker-stats-memory.png';
                link.href = memChart.toBase64Image();
                link.click();
            }, 100);
        }

        // Load Chart.js from CDN
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js';
        script.onload = () => initCharts();
        document.head.appendChild(script);

        window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.command === 'stats') {
                const s = msg.data;
                document.getElementById('emptyState').style.display = 'none';
                document.getElementById('content').style.display = 'block';

                if (!containerData[s.containerId]) {
                    containerData[s.containerId] = { name: s.containerName, cpuHistory: [], memHistory: [], latest: null };
                }
                const d = containerData[s.containerId];
                d.latest = s;
                d.cpuHistory.push(s.cpuPercent);
                d.memHistory.push(s.memoryPercent);
                if (d.cpuHistory.length > MAX_POINTS) d.cpuHistory.shift();
                if (d.memHistory.length > MAX_POINTS) d.memHistory.shift();

                if (cpuChart) { updateCharts(); updateTable(); }
            }
        });
    </script>
</body>
</html>`;
    }

    private dispose(): void {
        if (this.statsListener) {
            this.statsCollector.removeListener('stats', this.statsListener);
            this.statsListener = null;
        }
        StatsPanel.instance = undefined;
        this.panel.dispose();
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
