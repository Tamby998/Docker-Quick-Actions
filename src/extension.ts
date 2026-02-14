import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    try {
        const { DockerManager } = require('./dockerManager');
        const { ContainerTreeProvider } = require('./treeView');
        const { registerCommands } = require('./commands');

        const dockerManager = new DockerManager();
        const treeProvider = new ContainerTreeProvider(dockerManager);

        const treeView = vscode.window.createTreeView('dockerContainers', {
            treeDataProvider: treeProvider,
            showCollapseAll: false
        });

        registerCommands(context, dockerManager, treeProvider);

        const refreshInterval = setInterval(() => {
            treeProvider.refresh();
        }, 5000);

        context.subscriptions.push(treeView);
        context.subscriptions.push({ dispose: () => clearInterval(refreshInterval) });

        vscode.window.showInformationMessage('Docker Quick Actions activated!');
    } catch (error: any) {
        vscode.window.showErrorMessage(`Docker Quick Actions failed to activate: ${error.message}`);
        console.error('Docker Quick Actions activation error:', error);
    }
}

export function deactivate() {}
