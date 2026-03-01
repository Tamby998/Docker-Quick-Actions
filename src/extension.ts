import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    try {
        const { DockerManager } = require('./dockerManager');
        const { ContainerTreeProvider } = require('./treeView');
        const { registerCommands } = require('./commands');
        const { StatsCollector } = require('./statsCollector');
        const { AlertManager } = require('./alertManager');
        const { MultiLogsManager } = require('./multiLogsManager');
        const { LogsExporter } = require('./logsExporter');
        const { LogFilterEngine } = require('./logFilter');

        const dockerManager = new DockerManager();
        const treeProvider = new ContainerTreeProvider(dockerManager);

        // Stats collector
        const statsCollector = new StatsCollector(
            vscode.workspace.getConfiguration('dockerQuickActions.stats').get<number>('refreshInterval', 2) * 1000
        );
        treeProvider.setStatsCollector(statsCollector);

        // Alert manager
        const alertManager = new AlertManager(statsCollector);

        // Multi-logs
        const multiLogsManager = new MultiLogsManager(dockerManager);
        const logsExporter = new LogsExporter();
        const filterEngine = new LogFilterEngine();

        const treeView = vscode.window.createTreeView('dockerContainers', {
            treeDataProvider: treeProvider,
            showCollapseAll: false
        });

        registerCommands(context, dockerManager, treeProvider, statsCollector, multiLogsManager, logsExporter, filterEngine);

        // Start stats collection if enabled
        const statsConfig = vscode.workspace.getConfiguration('dockerQuickActions.stats');
        if (statsConfig.get<boolean>('enabled', true)) {
            statsCollector.start();
            alertManager.start();
        }

        // Listen for config changes
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('dockerQuickActions.stats.enabled')) {
                    const enabled = vscode.workspace.getConfiguration('dockerQuickActions.stats').get<boolean>('enabled', true);
                    if (enabled) {
                        statsCollector.start();
                        alertManager.start();
                    } else {
                        statsCollector.stop();
                        alertManager.stop();
                    }
                }
            })
        );

        const refreshInterval = setInterval(() => {
            treeProvider.refresh();
        }, 5000);

        context.subscriptions.push(treeView);
        context.subscriptions.push({ dispose: () => clearInterval(refreshInterval) });
        context.subscriptions.push({ dispose: () => statsCollector.dispose() });
        context.subscriptions.push({ dispose: () => alertManager.dispose() });
        context.subscriptions.push({ dispose: () => multiLogsManager.dispose() });

        vscode.window.showInformationMessage('Docker Quick Actions activated!');
    } catch (error: any) {
        vscode.window.showErrorMessage(`Docker Quick Actions failed to activate: ${error.message}`);
        console.error('Docker Quick Actions activation error:', error);
    }
}

export function deactivate() {}
