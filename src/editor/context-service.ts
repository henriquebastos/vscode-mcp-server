import * as vscode from 'vscode';
import type { DiffEntryMatch } from './diff-service';
import { getEditorDiffService } from './diff-service';
import type { SerializedRange } from './location-utils';
import { isUriInsideWorkspace, uriToWorkspacePath, vsCodeRangeToSerializedRange } from './location-utils';
import { truncateText } from '../utils/text-utils';

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

export interface SerializedDiffMetadata {
    diffId: string;
    entryIndex: number;
    label?: string;
    side: 'left' | 'right';
}

export interface SerializedEditorContext {
    path?: string;
    uri: string;
    languageId: string;
    lineCount: number;
    isDirty: boolean;
    selection: SerializedSelection;
    selections: SerializedSelection[];
    visibleRanges: SerializedRange[];
    diff?: SerializedDiffMetadata;
}

export interface EditorContext {
    activeEditor?: SerializedEditorContext;
    visibleEditors?: SerializedEditorContext[];
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

function shouldSerializeEditor(editor: vscode.TextEditor): boolean {
    const uri = editor.document.uri;
    if (uri.scheme === 'file') {
        return isUriInsideWorkspace(uri);
    }
    if (getEditorDiffService().findEntryForUri(uri)) {
        return true;
    }
    return uri.scheme === 'git' && isUriInsideWorkspace(uri);
}

function serializeDiffMetadata(match: DiffEntryMatch | undefined): SerializedDiffMetadata | undefined {
    if (!match) {
        return undefined;
    }

    const metadata: SerializedDiffMetadata = {
        diffId: match.diffId,
        entryIndex: match.entryIndex,
        side: match.side
    };
    if (match.label !== undefined) {
        metadata.label = match.label;
    }
    return metadata;
}

function serializeEditor(
    editor: vscode.TextEditor,
    options: Required<Pick<EditorContextOptions, 'includeSelectedText' | 'maxSelectedTextCharacters'>>
): SerializedEditorContext {
    const context: SerializedEditorContext = {
        uri: editor.document.uri.toString(),
        languageId: editor.document.languageId,
        lineCount: editor.document.lineCount,
        isDirty: editor.document.isDirty,
        selection: serializeSelection(editor.document, editor.selection, options),
        selections: editor.selections.map(selection => serializeSelection(editor.document, selection, options)),
        visibleRanges: editor.visibleRanges.map(vsCodeRangeToSerializedRange)
    };
    if (isUriInsideWorkspace(editor.document.uri)) {
        context.path = uriToWorkspacePath(editor.document.uri);
    }

    const diff = serializeDiffMetadata(getEditorDiffService().findEntryForUri(editor.document.uri));
    if (diff) {
        context.diff = diff;
    }

    return context;
}

export async function getEditorContext(options: EditorContextOptions = {}): Promise<EditorContext> {
    const serializationOptions = {
        includeSelectedText: options.includeSelectedText ?? false,
        maxSelectedTextCharacters: options.maxSelectedTextCharacters ?? DEFAULT_MAX_SELECTED_TEXT_CHARACTERS
    };

    const activeEditor = vscode.window.activeTextEditor;
    const context: EditorContext = {};

    if (activeEditor && shouldSerializeEditor(activeEditor)) {
        context.activeEditor = serializeEditor(activeEditor, serializationOptions);
    }

    if (options.includeVisibleEditors) {
        context.visibleEditors = vscode.window.visibleTextEditors
            .filter(shouldSerializeEditor)
            .map(editor => serializeEditor(editor, serializationOptions));
    }

    return context;
}
