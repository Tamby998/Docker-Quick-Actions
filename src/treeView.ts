import * as vscode from 'vscode';
import { DockerManager, ContainerInfo } from './dockerManager';
import { StatsCollector, ContainerStats } from './statsCollector';
import {
    formatInlineStats,
    formatDetailedStats,
    createStatsHistory,
    pushToHistory,
    StatsHistory,
    getThemeColorForUsage
} from './statsFormatter';

export class DetailTreeItem extends vscode.TreeItem {
    constructor(
        label: string,
        description: string,
        icon: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = description;
        this.iconPath = new vscode.ThemeIcon(icon);
        this.contextValue = 'detail';
    }
}

export class ContainerTreeItem extends vscode.TreeItem {
    constructor(
        public readonly container: ContainerInfo,
        stats?: ContainerStats,
        showStats?: boolean
    ) {
        super(container.name, vscode.TreeItemCollapsibleState.Collapsed);

        const baseDescription = container.ports || container.status;
        if (showStats && stats && container.state === 'running') {
            this.description = `${baseDescription}  ${formatInlineStats(stats.cpuPercent, stats.memoryUsage, stats.memoryLimit)}`;
        } else {
            this.description = baseDescription;
        }

        this.contextValue = container.state === 'running' ? 'running' : 'stopped';

        if (container.state === 'running') {
            if (stats && (stats.cpuPercent > 80 || stats.memoryPercent > 80)) {
                this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow'));
            } else {
                this.iconPath = new vscode.ThemeIcon('play-circle', new vscode.ThemeColor('charts.green'));
            }
        } else if (container.state === 'exited') {
            this.iconPath = new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.red'));
        } else if (container.state === 'paused') {
            this.iconPath = new vscode.ThemeIcon('debug-pause', new vscode.ThemeColor('charts.yellow'));
        } else {
            this.iconPath = new vscode.ThemeIcon('circle-outline');
        }

        // Tooltip with stats
        const tooltipLines = [container.name, container.image, container.status];
        if (container.ports) { tooltipLines.push(`Ports: ${container.ports}`); }
        this.tooltip = tooltipLines.join('\n');
    }
}

type TreeItem = ContainerTreeItem | DetailTreeItem;

export class ContainerTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private statsCollector: StatsCollector | null = null;
    private statsHistories: Map<string, StatsHistory> = new Map();
    private statsEnabled: boolean = true;
    private debounceTimer: NodeJS.Timeout | null = null;

    constructor(private dockerManager: DockerManager) {}

    setStatsCollector(collector: StatsCollector): void {
        this.statsCollector = collector;
        collector.on('stats', (stats: ContainerStats) => {
            // Update history
            let history = this.statsHistories.get(stats.containerId);
            if (!history) {
                history = createStatsHistory(30);
                this.statsHistories.set(stats.containerId, history);
            }
            pushToHistory(history, stats.cpuPercent, stats.memoryPercent);

            // Debounced refresh (max 1x per 2s)
            if (!this.debounceTimer) {
                this.debounceTimer = setTimeout(() => {
                    this.debounceTimer = null;
                    this._onDidChangeTreeData.fire();
                }, 2000);
            }
        });
    }

    toggleStats(): boolean {
        this.statsEnabled = !this.statsEnabled;
        this._onDidChangeTreeData.fire();
        return this.statsEnabled;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeItem): Promise<TreeItem[]> {
        if (element instanceof ContainerTreeItem) {
            const c = element.container;
            const details: DetailTreeItem[] = [];

            if (c.ports) {
                details.push(new DetailTreeItem('Ports', c.ports, 'plug'));
            }
            details.push(new DetailTreeItem('Image', c.image, 'package'));
            details.push(new DetailTreeItem('Status', c.status, 'info'));
            details.push(new DetailTreeItem('ID', c.id.substring(0, 12), 'key'));

            // Add stats details if available
            if (this.statsEnabled && this.statsCollector && c.state === 'running') {
                const stats = this.statsCollector.getStats(c.id);
                if (stats) {
                    const history = this.statsHistories.get(c.id);
                    details.push(new DetailTreeItem('CPU', `${stats.cpuPercent.toFixed(1)}%`, 'pulse'));
                    details.push(new DetailTreeItem(
                        'Memory',
                        `${this.formatBytesShort(stats.memoryUsage)} / ${this.formatBytesShort(stats.memoryLimit)} (${stats.memoryPercent.toFixed(1)}%)`,
                        'database'
                    ));
                    details.push(new DetailTreeItem(
                        'Network',
                        `RX: ${this.formatBytesShort(stats.networkRx)} / TX: ${this.formatBytesShort(stats.networkTx)}`,
                        'cloud'
                    ));
                    details.push(new DetailTreeItem(
                        'Disk I/O',
                        `R: ${this.formatBytesShort(stats.blockRead)} / W: ${this.formatBytesShort(stats.blockWrite)}`,
                        'file'
                    ));
                }
            }

            return details;
        }

        if (element instanceof DetailTreeItem) {
            return [];
        }

        try {
            const isRunning = await this.dockerManager.isDockerRunning();
            if (!isRunning) {
                vscode.window.showWarningMessage('Docker is not running. Please start Docker Desktop.');
                return [];
            }

            const containers = await this.dockerManager.listContainers();
            const showStats = this.statsEnabled && this.statsCollector !== null;
            return containers.map(c => {
                const stats = showStats ? this.statsCollector!.getStats(c.id) : undefined;
                return new ContainerTreeItem(c, stats, showStats);
            });
        } catch (error: any) {
            vscode.window.showErrorMessage(`Docker error: ${error.message}`);
            return [];
        }
    }

    private formatBytesShort(bytes: number): string {
        if (bytes === 0) { return '0 B'; }
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        const value = bytes / Math.pow(1024, i);
        return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
    }
}
