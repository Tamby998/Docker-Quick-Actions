import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Docker Quick Actions Extension', () => {
    test('Extension should be present', () => {
        const ext = vscode.extensions.getExtension('tamby.docker-quick-actions');
        assert.ok(ext);
    });

    test('Commands should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        const dockerCommands = commands.filter(c => c.startsWith('docker-quick-actions.'));

        assert.ok(dockerCommands.includes('docker-quick-actions.refreshContainers'));
        assert.ok(dockerCommands.includes('docker-quick-actions.startContainer'));
        assert.ok(dockerCommands.includes('docker-quick-actions.stopContainer'));
        assert.ok(dockerCommands.includes('docker-quick-actions.restartContainer'));
        assert.ok(dockerCommands.includes('docker-quick-actions.removeContainer'));
        assert.ok(dockerCommands.includes('docker-quick-actions.viewLogs'));
        assert.ok(dockerCommands.includes('docker-quick-actions.execBash'));
    });
});
