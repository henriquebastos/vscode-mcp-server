import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

interface PackageJson {
    contributes?: {
        commands?: Array<{ command: string; title: string; icon?: string }>;
        menus?: Record<string, Array<{ command: string; when?: string; group?: string }>>;
        configuration?: {
            properties?: Record<string, { enum?: string[]; default?: unknown; properties?: Record<string, unknown>; additionalProperties?: boolean }>;
        };
    };
}

suite('Package Contributions', () => {
    function readPackageJson(): PackageJson {
        return JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')) as PackageJson;
    }

    function readReadme(): string {
        return fs.readFileSync(path.join(__dirname, '..', '..', 'README.md'), 'utf8');
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

    test('exposes only local runtime configuration surface', () => {
        const packageJson = readPackageJson();
        const commandIds = new Set((packageJson.contributes?.commands ?? []).map(command => command.command));
        const properties = packageJson.contributes?.configuration?.properties ?? {};
        const enabledToolProperties = properties['vscode-mcp-server.enabledTools']?.properties ?? {};

        assert.strictEqual(commandIds.has('vscode-mcp-server.helloWorld'), false, 'helloWorld command should not be contributed');
        assert.strictEqual(Object.prototype.hasOwnProperty.call(enabledToolProperties, 'shell'), false, 'shell tool category should not be configurable');
        assert.strictEqual(properties['vscode-mcp-server.enabledTools']?.additionalProperties, false, 'unknown tool categories should be rejected by the settings schema');
        assert.deepStrictEqual(properties['vscode-mcp-server.host']?.enum, ['127.0.0.1', 'localhost', '::1']);
    });

    test('README documents loopback-only unauthenticated local access', () => {
        const readme = readReadme();

        assert.match(readme, /loopback-only/i, 'README should describe loopback-only host support');
        assert.match(readme, /does not implement authentication/i, 'README should warn that authentication is not implemented');
        assert.match(readme, /127\.0\.0\.1, localhost, or ::1/, 'README should list allowed loopback host values');
        assert.strictEqual(readme.includes('http://[your-host]:3000/mcp'), false, 'README should not advertise arbitrary custom hosts');
        assert.strictEqual(readme.includes('execute_shell_command_code'), false, 'README should not document the removed shell tool');
    });

    test('production surface does not contain the removed shell tool', () => {
        const root = path.join(__dirname, '..', '..');
        const productionSurfaceFiles = [
            'package.json',
            'README.md',
            path.join('src', 'server.ts'),
            path.join('src', 'extension.ts')
        ];

        assert.strictEqual(fs.existsSync(path.join(root, 'src', 'tools', 'shell-tools.ts')), false, 'shell tool implementation should be deleted');
        for (const relativePath of productionSurfaceFiles) {
            const content = fs.readFileSync(path.join(root, relativePath), 'utf8');
            assert.strictEqual(content.includes('execute_shell_command_code'), false, `${relativePath} should not expose shell execution`);
        }
    });
});
