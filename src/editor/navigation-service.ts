import * as vscode from 'vscode';
import {
    EditorTargetInput,
    McpPosition,
    McpRange,
    SerializedRange,
    mcpPositionToVsCodePosition,
    mcpRangeToVsCodeRange,
    resolveEditorTarget,
    uriToWorkspacePath,
    vsCodeRangeToSerializedRange
} from './location-utils';

export interface SerializedLocation {
    path: string;
    uri: string;
    range: SerializedRange;
}

export interface RevealRangeInput {
    path?: string | undefined;
    range: McpRange;
}

export interface GoToDefinitionInput {
    path?: string | undefined;
    position?: McpPosition | undefined;
    range?: McpRange | undefined;
}

function toSerializedLocation(uri: vscode.Uri, range: vscode.Range): SerializedLocation {
    return {
        path: uriToWorkspacePath(uri),
        uri: uri.toString(),
        range: vsCodeRangeToSerializedRange(range)
    };
}

async function getOrOpenEditor(uri: vscode.Uri, existingEditor?: vscode.TextEditor): Promise<vscode.TextEditor> {
    if (existingEditor) {
        return existingEditor;
    }

    const document = await vscode.workspace.openTextDocument(uri);
    return vscode.window.showTextDocument(document, {
        preview: false,
        preserveFocus: false
    });
}

export async function revealRange(input: RevealRangeInput): Promise<SerializedLocation> {
    const targetInput: EditorTargetInput = {};
    if (input.path !== undefined) {
        targetInput.path = input.path;
    }
    const target = await resolveEditorTarget(targetInput);
    const range = mcpRangeToVsCodeRange(input.range);
    const editor = await getOrOpenEditor(target.uri, target.editor);

    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);

    return toSerializedLocation(target.uri, range);
}

function definitionPosition(input: GoToDefinitionInput, targetEditor?: vscode.TextEditor): vscode.Position {
    if (input.position) {
        return mcpPositionToVsCodePosition(input.position);
    }

    if (input.range) {
        return mcpPositionToVsCodePosition(input.range.start);
    }

    if (targetEditor) {
        return targetEditor.selection.active;
    }

    throw new Error('A definition position or range is required when no active editor selection is available.');
}

function definitionLocation(definition: vscode.Location | vscode.LocationLink): { uri: vscode.Uri; range: vscode.Range } {
    if ('targetUri' in definition) {
        return {
            uri: definition.targetUri,
            range: definition.targetSelectionRange ?? definition.targetRange
        };
    }

    return {
        uri: definition.uri,
        range: definition.range
    };
}

export async function goToDefinition(input: GoToDefinitionInput): Promise<SerializedLocation> {
    const targetInput: EditorTargetInput = {};
    if (input.path !== undefined) {
        targetInput.path = input.path;
    }
    const target = await resolveEditorTarget(targetInput);
    const position = definitionPosition(input, target.editor);
    const definitions = await vscode.commands.executeCommand<Array<vscode.Location | vscode.LocationLink>>(
        'vscode.executeDefinitionProvider',
        target.uri,
        position
    ) ?? [];

    const [firstDefinition] = definitions;
    if (!firstDefinition) {
        throw new Error(`No definition found at ${target.path}:${position.line + 1}:${position.character}.`);
    }

    const destination = definitionLocation(firstDefinition);
    const document = await vscode.workspace.openTextDocument(destination.uri);
    const editor = await vscode.window.showTextDocument(document, {
        preview: false,
        selection: destination.range
    });
    editor.revealRange(destination.range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);

    return toSerializedLocation(destination.uri, destination.range);
}
