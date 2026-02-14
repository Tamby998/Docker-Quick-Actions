import * as vscode from 'vscode';
import { DockerManager } from './dockerManager';
import { ContainerTreeProvider, ContainerTreeItem } from './treeView';
import { LogsPanel } from './logsPanel';

export function registerCommands(
    context: vscode.ExtensionContext,
    dockerManager: DockerManager,
    treeProvider: ContainerTreeProvider
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('docker-quick-actions.refreshContainers', () => {
            treeProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('docker-quick-actions.startContainer', async (item?: ContainerTreeItem) => {
            const container = item?.container || await pickContainer(dockerManager, 'exited');
            if (!container) { return; }

            try {
                await vscode.window.withProgress(
                    { location: vscode.ProgressLocation.Notification, title: `Starting ${container.name}...` },
                    async () => { await dockerManager.startContainer(container.id); }
                );
                vscode.window.showInformationMessage(`Container ${container.name} started.`);
                treeProvider.refresh();
            } catch (error: any) {
                vscode.window.showErrorMessage(error.message);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('docker-quick-actions.stopContainer', async (item?: ContainerTreeItem) => {
            const container = item?.container || await pickContainer(dockerManager, 'running');
            if (!container) { return; }

            try {
                await vscode.window.withProgress(
                    { location: vscode.ProgressLocation.Notification, title: `Stopping ${container.name}...` },
                    async () => { await dockerManager.stopContainer(container.id); }
                );
                vscode.window.showInformationMessage(`Container ${container.name} stopped.`);
                treeProvider.refresh();
            } catch (error: any) {
                vscode.window.showErrorMessage(error.message);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('docker-quick-actions.restartContainer', async (item?: ContainerTreeItem) => {
            const container = item?.container || await pickContainer(dockerManager, 'running');
            if (!container) { return; }

            try {
                await vscode.window.withProgress(
                    { location: vscode.ProgressLocation.Notification, title: `Restarting ${container.name}...` },
                    async () => { await dockerManager.restartContainer(container.id); }
                );
                vscode.window.showInformationMessage(`Container ${container.name} restarted.`);
                treeProvider.refresh();
            } catch (error: any) {
                vscode.window.showErrorMessage(error.message);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('docker-quick-actions.removeContainer', async (item?: ContainerTreeItem) => {
            const container = item?.container || await pickContainer(dockerManager, 'exited');
            if (!container) { return; }

            const confirm = await vscode.window.showWarningMessage(
                `Remove container "${container.name}"?`,
                { modal: true },
                'Remove'
            );
            if (confirm !== 'Remove') { return; }

            try {
                await dockerManager.removeContainer(container.id);
                vscode.window.showInformationMessage(`Container ${container.name} removed.`);
                treeProvider.refresh();
            } catch (error: any) {
                vscode.window.showErrorMessage(error.message);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('docker-quick-actions.viewLogs', async (item?: ContainerTreeItem) => {
            const container = item?.container || await pickContainer(dockerManager);
            if (!container) { return; }

            LogsPanel.show(container.id, container.name, dockerManager);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('docker-quick-actions.execBash', async (item?: ContainerTreeItem) => {
            const container = item?.container || await pickContainer(dockerManager, 'running');
            if (!container) { return; }

            const terminal = vscode.window.createTerminal({
                name: `Docker: ${container.name}`,
                shellPath: 'docker',
                shellArgs: ['exec', '-it', container.id, '/bin/sh']
            });
            terminal.show();
        })
    );
}

async function pickContainer(dockerManager: DockerManager, stateFilter?: string) {
    try {
        let containers = await dockerManager.listContainers();
        if (stateFilter) {
            containers = containers.filter(c => c.state === stateFilter);
        }

        if (containers.length === 0) {
            vscode.window.showInformationMessage('No containers found.');
            return undefined;
        }

        const picked = await vscode.window.showQuickPick(
            containers.map(c => ({
                label: c.name,
                description: `${c.image} (${c.state})`,
                container: c
            })),
            { placeHolder: 'Select a container' }
        );

        return picked?.container;
    } catch (error: any) {
        vscode.window.showErrorMessage(error.message);
        return undefined;
    }
}
