import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

interface PackageJson {
    contributes?: {
        commands?: Array<{ command: string; title: string; icon?: string }>;
        menus?: Record<string, Array<{ command: string; when?: string; group?: string }>>;
    };
}

suite('Package Contributions', () => {
    function readPackageJson(): PackageJson {
        return JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')) as PackageJson;
    }

    test('contributes guided feedback commands to editor title and command palette', () => {
        const packageJson = readPackageJson();
        const commands = packageJson.contributes?.commands ?? [];
        const commandIds = new Set(commands.map(command => command.command));

        assert.ok(commandIds.has('vscode-mcp-server.feedback.add'), 'Add Feedback command is missing');
        assert.ok(commandIds.has('vscode-mcp-server.feedback.finish'), 'Finish Feedback command is missing');
        assert.ok(commandIds.has('vscode-mcp-server.feedback.cancel'), 'Cancel Feedback command is missing');
        assert.ok(commands.find(command => command.command === 'vscode-mcp-server.feedback.add')?.icon, 'Add Feedback should have a codicon');
        assert.ok(commands.find(command => command.command === 'vscode-mcp-server.feedback.finish')?.icon, 'Finish Feedback should have a codicon');
        assert.ok(commands.find(command => command.command === 'vscode-mcp-server.feedback.cancel')?.icon, 'Cancel Feedback should have a codicon');

        const editorTitle = packageJson.contributes?.menus?.['editor/title'] ?? [];
        const addFeedback = editorTitle.find(item => item.command === 'vscode-mcp-server.feedback.add');
        const finishFeedback = editorTitle.find(item => item.command === 'vscode-mcp-server.feedback.finish');
        const cancelFeedback = editorTitle.find(item => item.command === 'vscode-mcp-server.feedback.cancel');

        assert.ok(addFeedback, 'Add Feedback is missing from the editor title toolbar');
        assert.ok(addFeedback.when?.includes('editorTextFocus'), 'Add Feedback should be scoped to active text editors');
        assert.ok(finishFeedback?.when?.includes('vscodeMcpServer.feedbackActive'), 'Finish Feedback should only show during an active session');
        assert.ok(cancelFeedback?.when?.includes('vscodeMcpServer.feedbackActive'), 'Cancel Feedback should only show during an active session');

        const commandPalette = packageJson.contributes?.menus?.commandPalette ?? [];
        assert.ok(commandPalette.some(item => item.command === 'vscode-mcp-server.feedback.add'), 'Add Feedback is missing from the command palette');
        assert.ok(commandPalette.some(item => item.command === 'vscode-mcp-server.feedback.finish'), 'Finish Feedback is missing from the command palette');
        assert.ok(commandPalette.some(item => item.command === 'vscode-mcp-server.feedback.cancel'), 'Cancel Feedback is missing from the command palette');
    });
});
