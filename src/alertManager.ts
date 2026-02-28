import * as vscode from 'vscode';
import { StatsCollector, ContainerStats } from './statsCollector';

interface AlertState {
    cpuHighSince: number | null;
    memoryHighSince: number | null;
    lastCpuAlert: number;
    lastMemoryAlert: number;
}

export class AlertManager {
    private states: Map<string, AlertState> = new Map();
    private outputChannel: vscode.OutputChannel;
    private disposables: vscode.Disposable[] = [];
    private statsListener: ((stats: ContainerStats) => void) | null = null;

    constructor(private statsCollector: StatsCollector) {
        this.outputChannel = vscode.window.createOutputChannel('Docker Alerts');
    }

    start(): void {
        this.statsListener = (stats: ContainerStats) => this.checkAlerts(stats);
        this.statsCollector.on('stats', this.statsListener);
    }

    stop(): void {
        if (this.statsListener) {
            this.statsCollector.removeListener('stats', this.statsListener);
            this.statsListener = null;
        }
        this.states.clear();
    }

    private getConfig() {
        const config = vscode.workspace.getConfiguration('dockerQuickActions.alerts');
        return {
            enabled: config.get<boolean>('enabled', true),
            cpuThreshold: config.get<number>('cpuThreshold', 80),
            memoryThreshold: config.get<number>('memoryThreshold', 90),
            cpuDuration: 30000, // 30 seconds
            memoryDuration: 10000, // 10 seconds
            alertCooldown: 60000, // 1 minute between repeated alerts
        };
    }

    private checkAlerts(stats: ContainerStats): void {
        const config = this.getConfig();
        if (!config.enabled) { return; }

        const now = Date.now();
        let state = this.states.get(stats.containerId);
        if (!state) {
            state = { cpuHighSince: null, memoryHighSince: null, lastCpuAlert: 0, lastMemoryAlert: 0 };
            this.states.set(stats.containerId, state);
        }

        // CPU alert
        if (stats.cpuPercent > config.cpuThreshold) {
            if (!state.cpuHighSince) {
                state.cpuHighSince = now;
            } else if (
                now - state.cpuHighSince >= config.cpuDuration &&
                now - state.lastCpuAlert >= config.alertCooldown
            ) {
                state.lastCpuAlert = now;
                const msg = `Container "${stats.containerName}" CPU at ${stats.cpuPercent.toFixed(1)}% for over 30s`;
                vscode.window.showWarningMessage(msg, 'View Monitor').then(action => {
                    if (action === 'View Monitor') {
                        vscode.commands.executeCommand('docker-quick-actions.showResourcesMonitor');
                    }
                });
                this.log('WARNING', msg);
            }
        } else {
            state.cpuHighSince = null;
        }

        // Memory alert
        if (stats.memoryPercent > config.memoryThreshold) {
            if (!state.memoryHighSince) {
                state.memoryHighSince = now;
            } else if (
                now - state.memoryHighSince >= config.memoryDuration &&
                now - state.lastMemoryAlert >= config.alertCooldown
            ) {
                state.lastMemoryAlert = now;
                const msg = `Container "${stats.containerName}" memory at ${stats.memoryPercent.toFixed(1)}% for over 10s`;
                vscode.window.showErrorMessage(msg, 'View Monitor').then(action => {
                    if (action === 'View Monitor') {
                        vscode.commands.executeCommand('docker-quick-actions.showResourcesMonitor');
                    }
                });
                this.log('CRITICAL', msg);
            }
        } else {
            state.memoryHighSince = null;
        }
    }

    private log(level: string, message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] [${level}] ${message}`);
    }

    dispose(): void {
        this.stop();
        this.outputChannel.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
