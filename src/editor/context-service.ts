import * as vscode from 'vscode';
import { SerializedRange, isUriInsideWorkspace, uriToWorkspacePath, vsCodeRangeToSerializedRange } from './location-utils';

const DEFAULT_MAX_SELECTED_TEXT_CHARACTERS = 4000;

export interface EditorContextOptions {
    includeSelectedText?: boolean;
    includeVisibleEditors?: boolean;
    maxSelectedTextCharacters?: number;
}

export interface SerializedSelection extends SerializedRange {
    isEmpty: boolean;
    selectedText?: string;
    selectedTextTruncated?: boolean;
}

export interface SerializedEditorContext {
    path: string;
    uri: string;
    languageId: string;
    lineCount: number;
    isDirty: boolean;
    selection: SerializedSelection;
    selections: SerializedSelection[];
    visibleRanges: SerializedRange[];
}

export interface EditorContext {
    activeEditor?: SerializedEditorContext;
    visibleEditors?: SerializedEditorContext[];
}

function truncateText(text: string, maxCharacters: number): { text: string; truncated: boolean } {
    if (text.length <= maxCharacters) {
        return { text, truncated: false };
    }

    return { text: text.slice(0, maxCharacters), truncated: true };
}

function serializeSelection(
    document: vscode.TextDocument,
    selection: vscode.Selection,
    options: Required<Pick<EditorContextOptions, 'includeSelectedText' | 'maxSelectedTextCharacters'>>
): SerializedSelection {
    const serialized: SerializedSelection = {
        ...vsCodeRangeToSerializedRange(selection),
        isEmpty: selection.isEmpty
    };

    if (options.includeSelectedText) {
        const selectedText = document.getText(selection);
        const truncated = truncateText(selectedText, options.maxSelectedTextCharacters);
        serialized.selectedText = truncated.text;
        if (truncated.truncated) {
            serialized.selectedTextTruncated = true;
        }
    }

    return serialized;
}

function serializeEditor(
    editor: vscode.TextEditor,
    options: Required<Pick<EditorContextOptions, 'includeSelectedText' | 'maxSelectedTextCharacters'>>
): SerializedEditorContext {
    return {
        path: uriToWorkspacePath(editor.document.uri),
        uri: editor.document.uri.toString(),
        languageId: editor.document.languageId,
        lineCount: editor.document.lineCount,
        isDirty: editor.document.isDirty,
        selection: serializeSelection(editor.document, editor.selection, options),
        selections: editor.selections.map(selection => serializeSelection(editor.document, selection, options)),
        visibleRanges: editor.visibleRanges.map(vsCodeRangeToSerializedRange)
    };
}

export async function getEditorContext(options: EditorContextOptions = {}): Promise<EditorContext> {
    const serializationOptions = {
        includeSelectedText: options.includeSelectedText ?? false,
        maxSelectedTextCharacters: options.maxSelectedTextCharacters ?? DEFAULT_MAX_SELECTED_TEXT_CHARACTERS
    };

    const activeEditor = vscode.window.activeTextEditor;
    const context: EditorContext = {};

    if (activeEditor && isUriInsideWorkspace(activeEditor.document.uri)) {
        context.activeEditor = serializeEditor(activeEditor, serializationOptions);
    }

    if (options.includeVisibleEditors) {
        context.visibleEditors = vscode.window.visibleTextEditors
            .filter(editor => isUriInsideWorkspace(editor.document.uri))
            .map(editor => serializeEditor(editor, serializationOptions));
    }

    return context;
}
