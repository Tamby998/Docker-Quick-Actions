import * as vscode from 'vscode';
import { DockerManager, ContainerInfo } from './dockerManager';

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
    constructor(public readonly container: ContainerInfo) {
        super(container.name, vscode.TreeItemCollapsibleState.Collapsed);

        this.description = container.ports || container.status;
        this.tooltip = `${container.name}\n${container.image}\n${container.status}${container.ports ? '\nPorts: ' + container.ports : ''}`;
        this.contextValue = container.state === 'running' ? 'running' : 'stopped';

        if (container.state === 'running') {
            this.iconPath = new vscode.ThemeIcon('play-circle', new vscode.ThemeColor('charts.green'));
        } else if (container.state === 'exited') {
            this.iconPath = new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.red'));
        } else if (container.state === 'paused') {
            this.iconPath = new vscode.ThemeIcon('debug-pause', new vscode.ThemeColor('charts.yellow'));
        } else {
            this.iconPath = new vscode.ThemeIcon('circle-outline');
        }
    }
}

type TreeItem = ContainerTreeItem | DetailTreeItem;

export class ContainerTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private dockerManager: DockerManager) {}

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
            return containers.map(c => new ContainerTreeItem(c));
        } catch (error: any) {
            vscode.window.showErrorMessage(`Docker error: ${error.message}`);
            return [];
        }
    }
}
