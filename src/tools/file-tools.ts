import * as vscode from 'vscode';
import * as path from 'path';
import type { WorkspacePath } from '../workspace/workspace-boundary';
import { assertWorkspacePath, workspacePathToUri } from '../workspace/workspace-boundary';
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod';
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Type for file listing results
export type FileListingResult = Array<{path: string, type: 'file' | 'directory'}>;

// Type for the file listing callback function
export type FileListingCallback = (path: string, recursive: boolean) => Promise<FileListingResult>;

// Default maximum character count
const DEFAULT_MAX_CHARACTERS = 100000;
const MAX_RECURSIVE_LIST_ENTRIES = 1000;
const MAX_READ_CHARACTERS = DEFAULT_MAX_CHARACTERS;

type SupportedReadEncoding = 'utf-8' | 'latin1' | 'base64';

/**
 * Lists files and directories in the VS Code workspace
 * @param workspacePath The path within the workspace to list files from
 * @param recursive Whether to list files recursively
 * @returns Array of file and directory entries
 */
export async function listWorkspaceFiles(workspacePath: string, recursive: boolean = false): Promise<FileListingResult> {
    console.log(`[listWorkspaceFiles] Starting with path: ${workspacePath}, recursive: ${recursive}`);

    const normalizedPath = assertWorkspacePath(workspacePath);
    if (recursive && normalizedPath === '.') {
        throw new Error('Recursive root listing is not allowed; choose a specific subdirectory.');
    }

    const targetUri = workspacePathToUri(normalizedPath);
    console.log(`[listWorkspaceFiles] Target URI: ${targetUri.fsPath}`);

    const result: FileListingResult = [];

    async function processDirectory(dirUri: vscode.Uri, currentPath: string = ''): Promise<void> {
        const entries = await vscode.workspace.fs.readDirectory(dirUri);

        for (const [name, type] of entries) {
            const entryPath = currentPath ? `${currentPath}/${name}` : name;
            const itemType: 'file' | 'directory' = (type & vscode.FileType.Directory) ? 'directory' : 'file';

            result.push({ path: entryPath, type: itemType });

            if (recursive && result.length > MAX_RECURSIVE_LIST_ENTRIES) {
                throw new Error(`Recursive listing exceeds the maximum of ${MAX_RECURSIVE_LIST_ENTRIES} entries; choose a narrower path.`);
            }

            if (recursive && itemType === 'directory') {
                const subDirUri = vscode.Uri.joinPath(dirUri, name);
                await processDirectory(subDirUri, entryPath);
            }
        }
    }

    try {
        await processDirectory(targetUri);
        console.log(`[listWorkspaceFiles] Found ${result.length} entries`);
        return result;
    } catch (error) {
        console.error('[listWorkspaceFiles] Error:', error);
        throw error;
    }
}

/**
 * Reads a file from the VS Code workspace with character limit check
 * @param workspacePath The path within the workspace to the file
 * @param encoding Encoding to convert the file content to a string. Use 'base64' for base64-encoded string
 * @param maxCharacters Maximum character count (default: 100,000)
 * @param startLine The start line number (0-based, inclusive). Use -1 to read from the beginning.
 * @param endLine The end line number (0-based, inclusive). Use -1 to read to the end.
 * @returns File content as string (either text-encoded or base64)
 */
function resolveWorkspacePathUri(rawPath: string): { workspacePath: WorkspacePath; uri: vscode.Uri } {
    const workspacePath = assertWorkspacePath(rawPath);
    return { workspacePath, uri: workspacePathToUri(workspacePath) };
}

function assertRenameBasename(newName: string): string {
    if (newName.trim().length === 0 || newName === '.' || newName.includes('..') || newName.includes('/') || newName.includes('\\')) {
        throw new Error('newName must be a basename without path separators or traversal.');
    }

    return newName;
}

function siblingWorkspacePath(filePath: WorkspacePath, newName: string): WorkspacePath {
    const directoryPath = path.posix.dirname(filePath);
    const newFilePath = directoryPath === '.' ? newName : `${directoryPath}/${newName}`;
    return assertWorkspacePath(newFilePath);
}

function normalizeReadEncoding(encoding: string): SupportedReadEncoding {
    const normalizedEncoding = encoding.toLowerCase();
    if (normalizedEncoding === 'utf8' || normalizedEncoding === 'utf-8') {
        return 'utf-8';
    }
    if (normalizedEncoding === 'latin1' || normalizedEncoding === 'base64') {
        return normalizedEncoding;
    }

    throw new Error(`Unsupported encoding: ${encoding}. Supported encodings: utf-8, latin1, base64.`);
}

function assertMaxCharacters(maxCharacters: number): void {
    if (!Number.isInteger(maxCharacters) || maxCharacters <= 0) {
        throw new Error('maxCharacters must be a positive integer.');
    }
    if (maxCharacters > MAX_READ_CHARACTERS) {
        throw new Error(`maxCharacters cannot exceed ${MAX_READ_CHARACTERS}.`);
    }
}

function assertLineRangeBounds(startLine: number, endLine: number): void {
    if (!Number.isInteger(startLine) || !Number.isInteger(endLine)) {
        throw new Error('Line ranges must use integer line numbers.');
    }
    if (startLine < -1 || endLine < -1) {
        throw new Error('Line ranges must be -1 or non-negative line numbers.');
    }
    if (startLine >= 0 && endLine >= 0 && endLine < startLine) {
        throw new Error(`End line ${endLine + 1} is less than start line ${startLine + 1}`);
    }
}

function assertReadBounds(maxCharacters: number, startLine: number, endLine: number): void {
    assertMaxCharacters(maxCharacters);
    assertLineRangeBounds(startLine, endLine);
}

function hasLineRange(startLine: number, endLine: number): boolean {
    return startLine >= 0 || endLine >= 0;
}

function base64EncodedLength(byteLength: number): number {
    return Math.ceil(byteLength / 3) * 4;
}

function assertSafeReadSize(byteLength: number, encoding: SupportedReadEncoding, maxCharacters: number): void {
    if (encoding === 'base64') {
        const encodedLength = base64EncodedLength(byteLength);
        if (encodedLength > maxCharacters) {
            throw new Error(`Base64 content exceeds the maximum character limit (${encodedLength} vs ${maxCharacters} allowed)`);
        }
        return;
    }

    const byteLimit = maxCharacters * 4;
    if (byteLength > byteLimit) {
        throw new Error(`File size ${byteLength} bytes exceeds the safe decode limit of ${byteLimit} bytes for maxCharacters=${maxCharacters}.`);
    }
}

function toolLineNumberToZeroBased(lineNumber: number, name: string): number {
    if (!Number.isInteger(lineNumber)) {
        throw new Error(`${name} must be -1 or a positive integer.`);
    }
    if (lineNumber === -1) {
        return -1;
    }
    if (lineNumber < 1) {
        throw new Error(`${name} must be -1 or a positive integer.`);
    }

    return lineNumber - 1;
}

function extractLineSlice(textContent: string, startLine: number, endLine: number, maxCharacters: number): string {
    const lines = textContent.split('\n');
    const effectiveStartLine = startLine >= 0 ? startLine : 0;
    const effectiveEndLine = endLine >= 0 ? endLine : lines.length - 1;

    if (effectiveStartLine >= lines.length) {
        throw new Error(`Start line ${effectiveStartLine + 1} is out of range (1-${lines.length})`);
    }
    if (effectiveEndLine >= lines.length) {
        throw new Error(`End line ${effectiveEndLine + 1} is out of range (1-${lines.length})`);
    }
    if (effectiveEndLine < effectiveStartLine) {
        throw new Error(`End line ${effectiveEndLine + 1} is less than start line ${effectiveStartLine + 1}`);
    }

    const partialContent = lines.slice(effectiveStartLine, effectiveEndLine + 1).join('\n');
    if (partialContent.length > maxCharacters) {
        throw new Error(`File content exceeds the maximum character limit (${partialContent.length} vs ${maxCharacters} allowed)`);
    }
    console.log(`[readWorkspaceFile] Returning lines ${effectiveStartLine + 1}-${effectiveEndLine + 1}, length: ${partialContent.length} characters`);
    return partialContent;
}

function decodeFileContent(
    fileContent: Uint8Array,
    encoding: SupportedReadEncoding,
    maxCharacters: number,
    startLine: number,
    endLine: number,
): string {
    if (encoding === 'base64') {
        return Buffer.from(fileContent).toString('base64');
    }

    const textContent = new TextDecoder(encoding).decode(fileContent);

    if (hasLineRange(startLine, endLine)) {
        return extractLineSlice(textContent, startLine, endLine, maxCharacters);
    }

    if (textContent.length > maxCharacters) {
        throw new Error(`File content exceeds the maximum character limit (${textContent.length} vs ${maxCharacters} allowed)`);
    }
    return textContent;
}

export async function readWorkspaceFile(
    workspacePath: string,
    encoding: string = 'utf-8',
    maxCharacters: number = DEFAULT_MAX_CHARACTERS,
    startLine: number = -1,
    endLine: number = -1
): Promise<string> {
    console.log(`[readWorkspaceFile] Starting with path: ${workspacePath}, encoding: ${encoding}, maxCharacters: ${maxCharacters}, startLine: ${startLine}, endLine: ${endLine}`);

    const normalizedEncoding = normalizeReadEncoding(encoding);
    assertReadBounds(maxCharacters, startLine, endLine);
    if (normalizedEncoding === 'base64' && hasLineRange(startLine, endLine)) {
        throw new Error('Line ranges are only supported for text encodings.');
    }

    const { uri: fileUri } = resolveWorkspacePathUri(workspacePath);
    console.log(`[readWorkspaceFile] File URI: ${fileUri.fsPath}`);

    try {
        const fileContent = await vscode.workspace.fs.readFile(fileUri);
        console.log(`[readWorkspaceFile] File read successfully, size: ${fileContent.byteLength} bytes`);
        assertSafeReadSize(fileContent.byteLength, normalizedEncoding, maxCharacters);
        return decodeFileContent(fileContent, normalizedEncoding, maxCharacters, startLine, endLine);
    } catch (error) {
        console.error('[readWorkspaceFile] Error:', error);
        throw error;
    }
}

/**
 * Registers MCP file-related tools with the server
 * @param server MCP server instance
 * @param fileListingCallback Callback function for file listing operations
 */
export function registerFileTools(
    server: McpServer,
    fileListingCallback: FileListingCallback
): void {
    // Add list_files tool
    server.tool(
        'list_files_code',
        `Explores directory structure in VS Code workspace.

        WHEN TO USE: Understanding project structure, finding files before read/modify operations.

        CRITICAL: NEVER set recursive=true on root directory (.) - output too large. Use recursive only on specific subdirectories.

        Returns files and directories at specified path. Start with path='.' to explore root, then dive into specific subdirectories with recursive=true.`,
        {
            path: z.string().describe('The path to list files from'),
            recursive: z.boolean().optional().default(false).describe('Whether to list files recursively')
        },
        async ({ path, recursive = false }): Promise<CallToolResult> => {
            console.log(`[list_files] Tool called with path=${path}, recursive=${recursive}`);

            if (!fileListingCallback) {
                console.error('[list_files] File listing callback not set');
                throw new Error('File listing callback not set');
            }

            try {
                console.log('[list_files] Calling file listing callback');
                const files = await fileListingCallback(path, recursive);
                console.log(`[list_files] Callback returned ${files.length} items`);

                const result: CallToolResult = {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(files, null, 2)
                        }
                    ]
                };
                console.log('[list_files] Successfully completed');
                return result;
            } catch (error) {
                console.error('[list_files] Error in tool:', error);
                throw error;
            }
        }
    );

    // Update read_file tool with line number parameters
    server.tool(
        'read_file_code',
        `Retrieves file contents with size limits and partial reading support.

        WHEN TO USE: Reading code, config files, analyzing implementations. Files >100k chars will fail.

        Encoding: Supported text encodings are 'utf-8'/'utf8' and 'latin1'; use 'base64' for a base64-encoded string.
        Line numbers: Use startLine/endLine (1-based) for large files to read specific sections only.

        If file too large: Use startLine/endLine to read relevant sections only.`,
        {
            path: z.string().describe('The path to the file to read'),
            encoding: z.string().optional().default('utf-8').describe('Encoding to convert the file content to a string. Supported values: "utf-8", "utf8", "latin1", "base64"'),
            maxCharacters: z.number().optional().default(DEFAULT_MAX_CHARACTERS).describe('Maximum character count (default: 100,000)'),
            startLine: z.number().optional().default(-1).describe('The start line number (1-based, inclusive). Default: read from beginning, denoted by -1'),
            endLine: z.number().optional().default(-1).describe('The end line number (1-based, inclusive). Default: read to end, denoted by -1')
        },
        async ({ path, encoding = 'utf-8', maxCharacters = DEFAULT_MAX_CHARACTERS, startLine = -1, endLine = -1 }): Promise<CallToolResult> => {
            console.log(`[read_file] Tool called with path=${path}, encoding=${encoding}, maxCharacters=${maxCharacters}, startLine=${startLine}, endLine=${endLine}`);

            try {
                // Convert 1-based input to 0-based for VS Code API
                const zeroBasedStartLine = toolLineNumberToZeroBased(startLine, 'startLine');
                const zeroBasedEndLine = toolLineNumberToZeroBased(endLine, 'endLine');
                console.log('[read_file] Reading file');
                const content = await readWorkspaceFile(path, encoding, maxCharacters, zeroBasedStartLine, zeroBasedEndLine);

                const result: CallToolResult = {
                    content: [
                        {
                            type: 'text',
                            text: content
                        }
                    ]
                };
                console.log(`[read_file] File read successfully, length: ${content.length} characters`);
                return result;
            } catch (error) {
                console.error('[read_file] Error in tool:', error);
                throw error;
            }
        }
    );

    // Add move_file tool
    server.tool(
        'move_file_code',
        `Moves a file or directory to a new location using VS Code's WorkspaceEdit API.

        WHEN TO USE: Reorganizing project structure, moving files between directories.

        This operation uses VS Code's refactoring capabilities to ensure imports and references are updated correctly.

        IMPORTANT: This will update all references to the moved file in the workspace.`,
        {
            sourcePath: z.string().describe('The current path of the file or directory to move'),
            targetPath: z.string().describe('The new path where the file or directory should be moved to'),
            overwrite: z.boolean().optional().default(false).describe('Whether to overwrite if target already exists')
        },
        async ({ sourcePath, targetPath, overwrite = false }): Promise<CallToolResult> => {
            console.log(`[move_file] Tool called with sourcePath=${sourcePath}, targetPath=${targetPath}, overwrite=${overwrite}`);

            const { workspacePath: normalizedSourcePath, uri: sourceUri } = resolveWorkspacePathUri(sourcePath);
            const { workspacePath: normalizedTargetPath, uri: targetUri } = resolveWorkspacePathUri(targetPath);

            try {
                console.log(`[move_file] Moving from ${sourceUri.fsPath} to ${targetUri.fsPath}`);

                // Use WorkspaceEdit for proper refactoring support
                const edit = new vscode.WorkspaceEdit();
                edit.renameFile(sourceUri, targetUri, { overwrite });

                const success = await vscode.workspace.applyEdit(edit);

                if (!success) {
                    throw new Error('Failed to apply file move operation; check if target and source are valid');
                }

                console.log('[move_file] File move completed successfully');

                const result: CallToolResult = {
                    content: [
                        {
                            type: 'text',
                            text: `Successfully moved ${normalizedSourcePath} to ${normalizedTargetPath}`
                        }
                    ]
                };
                return result;
            } catch (error) {
                console.error('[move_file] Error in tool:', error);
                throw error;
            }
        }
    );

    // Add rename_file tool
    server.tool(
        'rename_file_code',
        `Renames a file or directory using VS Code's WorkspaceEdit API.

        WHEN TO USE: Renaming files to follow naming conventions, refactoring code.

        This operation uses VS Code's refactoring capabilities to ensure imports and references are updated correctly.

        IMPORTANT: This will update all references to the renamed file in the workspace.`,
        {
            filePath: z.string().describe('The current path of the file or directory to rename'),
            newName: z.string().describe('The new name for the file or directory'),
            overwrite: z.boolean().optional().default(false).describe('Whether to overwrite if a file with the new name already exists')
        },
        async ({ filePath, newName, overwrite = false }): Promise<CallToolResult> => {
            console.log(`[rename_file] Tool called with filePath=${filePath}, newName=${newName}, overwrite=${overwrite}`);

            const safeNewName = assertRenameBasename(newName);
            const { workspacePath: normalizedFilePath, uri: fileUri } = resolveWorkspacePathUri(filePath);
            const newFilePath = siblingWorkspacePath(normalizedFilePath, safeNewName);
            const newFileUri = workspacePathToUri(newFilePath);

            try {
                console.log(`[rename_file] Renaming ${fileUri.fsPath} to ${newFileUri.fsPath}`);

                // Use WorkspaceEdit for proper refactoring support
                const edit = new vscode.WorkspaceEdit();
                edit.renameFile(fileUri, newFileUri, { overwrite });

                const success = await vscode.workspace.applyEdit(edit);

                if (!success) {
                    throw new Error('Failed to apply file rename operation; check if target and source are valid');
                }

                console.log('[rename_file] File rename completed successfully');

                const result: CallToolResult = {
                    content: [
                        {
                            type: 'text',
                            text: `Successfully renamed ${normalizedFilePath} to ${safeNewName}`
                        }
                    ]
                };
                return result;
            } catch (error) {
                console.error('[rename_file] Error in tool:', error);
                throw error;
            }
        }
    );

    // Add copy_file tool
    server.tool(
        'copy_file_code',
        `Copies a file to a new location.

        WHEN TO USE: Creating backups, duplicating files for testing, creating template files.

        LIMITATION: Only works for files, not directories.`,
        {
            sourcePath: z.string().describe('The path of the file to copy'),
            targetPath: z.string().describe('The path where the copy should be created'),
            overwrite: z.boolean().optional().default(false).describe('Whether to overwrite if target already exists')
        },
        async ({ sourcePath, targetPath, overwrite = false }): Promise<CallToolResult> => {
            console.log(`[copy_file] Tool called with sourcePath=${sourcePath}, targetPath=${targetPath}, overwrite=${overwrite}`);

            const { workspacePath: normalizedSourcePath, uri: sourceUri } = resolveWorkspacePathUri(sourcePath);
            const { workspacePath: normalizedTargetPath, uri: targetUri } = resolveWorkspacePathUri(targetPath);

            try {
                console.log(`[copy_file] Copying from ${sourceUri.fsPath} to ${targetUri.fsPath}`);

                // Check if target already exists
                let targetExists = false;
                try {
                    await vscode.workspace.fs.stat(targetUri);
                    targetExists = true;
                } catch (error) {
                    // Only ignore FileNotFound errors - rethrow others (permissions, network, etc.)
                    if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
                        // Target doesn't exist, which is fine - continue with copy
                        targetExists = false;
                    } else {
                        // Rethrow unexpected errors (permissions, network issues, etc.)
                        throw error;
                    }
                }

                if (targetExists && !overwrite) {
                    throw new Error(`Target file ${normalizedTargetPath} already exists. Use overwrite=true to overwrite.`);
                }

                // Read the source file
                const fileContent = await vscode.workspace.fs.readFile(sourceUri);

                // Write to target file
                await vscode.workspace.fs.writeFile(targetUri, fileContent);

                console.log('[copy_file] File copy completed successfully');

                const result: CallToolResult = {
                    content: [
                        {
                            type: 'text',
                            text: `Successfully copied ${normalizedSourcePath} to ${normalizedTargetPath}`
                        }
                    ]
                };
                return result;
            } catch (error) {
                console.error('[copy_file] Error in tool:', error);
                throw error;
            }
        }
    );
}