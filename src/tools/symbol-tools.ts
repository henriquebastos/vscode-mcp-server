import * as vscode from 'vscode';
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod';
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { assertWorkspacePath, getSingleWorkspaceRoot, isUriInsideWorkspace, uriToWorkspacePath, workspacePathToUri } from '../workspace/workspace-boundary';
import { logger } from '../utils/logger';

/**
 * Convert a symbol kind to a string representation
 * @param kind The symbol kind enum value
 * @returns String representation of the symbol kind
 */
const SYMBOL_KIND_NAMES: Readonly<Record<vscode.SymbolKind, string>> = {
    [vscode.SymbolKind.File]: 'File',
    [vscode.SymbolKind.Module]: 'Module',
    [vscode.SymbolKind.Namespace]: 'Namespace',
    [vscode.SymbolKind.Package]: 'Package',
    [vscode.SymbolKind.Class]: 'Class',
    [vscode.SymbolKind.Method]: 'Method',
    [vscode.SymbolKind.Property]: 'Property',
    [vscode.SymbolKind.Field]: 'Field',
    [vscode.SymbolKind.Constructor]: 'Constructor',
    [vscode.SymbolKind.Enum]: 'Enum',
    [vscode.SymbolKind.Interface]: 'Interface',
    [vscode.SymbolKind.Function]: 'Function',
    [vscode.SymbolKind.Variable]: 'Variable',
    [vscode.SymbolKind.Constant]: 'Constant',
    [vscode.SymbolKind.String]: 'String',
    [vscode.SymbolKind.Number]: 'Number',
    [vscode.SymbolKind.Boolean]: 'Boolean',
    [vscode.SymbolKind.Array]: 'Array',
    [vscode.SymbolKind.Object]: 'Object',
    [vscode.SymbolKind.Key]: 'Key',
    [vscode.SymbolKind.Null]: 'Null',
    [vscode.SymbolKind.EnumMember]: 'EnumMember',
    [vscode.SymbolKind.Struct]: 'Struct',
    [vscode.SymbolKind.Event]: 'Event',
    [vscode.SymbolKind.Operator]: 'Operator',
    [vscode.SymbolKind.TypeParameter]: 'TypeParameter',
};

function symbolKindToString(kind: vscode.SymbolKind): string {
    return SYMBOL_KIND_NAMES[kind] ?? 'Unknown';
}

function serializeOneBasedRange(range: vscode.Range): { start: { line: number; character: number }; end: { line: number; character: number } } {
    return {
        start: { line: range.start.line + 1, character: range.start.character },
        end: { line: range.end.line + 1, character: range.end.character },
    };
}

function findOpenDocument(uri: vscode.Uri): vscode.TextDocument | undefined {
    const uriString = uri.toString();
    return vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uriString);
}

async function readLineFromDisk(uri: vscode.Uri, line: number): Promise<string | undefined> {
    try {
        const content = await vscode.workspace.fs.readFile(uri);
        const text = Buffer.from(content).toString('utf8');
        const lines = text.split(/\r?\n/);
        if (line < 0 || line >= lines.length) {
            return undefined;
        }
        return lines[line]?.trim();
    } catch (error) {
        logger.warn(`[getPreview] Could not read file: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
    }
}

/**
 * Get a preview of the code at a specific line
 * @param uri The URI of the document
 * @param line The line number (0-based)
 * @returns The line content as a string or undefined if not available
 */
async function getPreview(uri: vscode.Uri, line?: number): Promise<string | undefined> {
    if (line === undefined) {
        return undefined;
    }

    try {
        const document = findOpenDocument(uri);
        if (document) {
            if (line < 0 || line >= document.lineCount) {
                return undefined;
            }
            return document.lineAt(line).text.trim();
        }
        return await readLineFromDisk(uri, line);
    } catch (error) {
        logger.warn(`[getPreview] Error getting preview: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
    }
}

/**
 * Get the text content of a specific line in a file
 * @param uri The URI of the document
 * @param line The line number (0-based)
 * @returns The text content of the line or undefined if line doesn't exist
 */
async function getLineText(uri: vscode.Uri, line: number): Promise<string | undefined> {
    try {
        // Open the document using VS Code's API
        const document = await vscode.workspace.openTextDocument(uri);

        // Check if the line exists
        if (line >= 0 && line < document.lineCount) {
            return document.lineAt(line).text;
        }
        return undefined;
    } catch (error) {
        logger.warn(`[getLineText] Error getting line text: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
    }
}

/**
 * Find the first occurrence of a symbol in a line of text
 * @param lineText The text content of the line
 * @param symbolName The exact symbol name to search for
 * @returns The character position (index) where the symbol starts, or -1 if not found
 */
function findSymbolInLine(lineText: string, symbolName: string): number {
    return lineText.indexOf(symbolName);
}

/**
 * Process hover content to extract string value
 * @param content The hover content item
 * @returns String representation of the content
 */
function hasValueProperty(content: unknown): content is { value: unknown } {
    return typeof content === 'object' && content !== null && 'value' in content;
}

function processHoverContent(content: unknown): string {
    if (typeof content === 'string') {
        return content;
    }
    if (hasValueProperty(content)) {
        return typeof content.value === 'string' ? content.value : String(content.value);
    }
    return String(content);
}

/**
 * Get hover information for a symbol at a specific position in a document
 * @param uri The URI of the text document
 * @param position The position of the symbol
 * @returns Hover information for the symbol
 */
export async function getSymbolHoverInfo(
    uri: vscode.Uri,
    position: vscode.Position
): Promise<{
    hovers: Array<{
        contents: string[];
        range?: {
            start: { line: number; character: number };
            end: { line: number; character: number };
        } | undefined;
        preview?: string | undefined;
    }>;
}> {
    logger.info(`[getSymbolHoverInfo] Getting hover info for ${uri.toString()} at position (${position.line},${position.character})`);

    try {
        // Execute the hover provider
        const commandResult = await vscode.commands.executeCommand<vscode.Hover[]>(
            'vscode.executeHoverProvider',
            uri,
            position
        ) || [];

        logger.info(`[getSymbolHoverInfo] Found ${commandResult.length} hover results`);

        // Map the hover results to a more friendly format
        const hovers = await Promise.all(commandResult.map(async hover => {
            // Process the contents
            let contents: string[] = [];

            if (Array.isArray(hover.contents)) {
                contents = hover.contents.map(processHoverContent);
            } else if (hover.contents) {
                contents = [processHoverContent(hover.contents)];
            }

            // Format the range if available
            const range = hover.range ? {
                start: {
                    line: hover.range.start.line,
                    character: hover.range.start.character
                },
                end: {
                    line: hover.range.end.line,
                    character: hover.range.end.character
                }
            } : undefined;

            // Get a preview of the code if range is available
            const preview = await getPreview(uri, hover.range?.start.line);

            return { contents, range, preview };
        }));

        return { hovers };
    } catch (error) {
        logger.error(`[getSymbolHoverInfo] Error: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}

/**
 * Search for symbols across the workspace
 * @param query The search query
 * @param maxResults Maximum number of results to return
 * @returns Array of formatted symbol information objects
 */
async function searchWorkspaceSymbols(query: string, maxResults: number = 10): Promise<{
    symbols: Array<{
        name: string;
        kind: string;
        location: string;
        containerName?: string;
        range?: {
            start: { line: number; character: number };
            end: { line: number; character: number };
        };
    }>;
    total: number;
}> {
    logger.info(`[searchWorkspaceSymbols] Starting with query: "${query}", maxResults: ${maxResults}`);

    try {
        getSingleWorkspaceRoot();

        // Execute the workspace symbol provider
        const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
            'vscode.executeWorkspaceSymbolProvider',
            query
        ) || [];

        logger.info(`[searchWorkspaceSymbols] Found ${symbols.length} symbols`);

        const workspaceSymbols = symbols.filter(symbol => isUriInsideWorkspace(symbol.location.uri));

        // Get total count before limiting
        const totalCount = workspaceSymbols.length;

        // Apply limit
        const limitedSymbols = workspaceSymbols.slice(0, maxResults);

        // Format the results
        const result = {
            symbols: limitedSymbols.map(symbol => {
                const formatted = {
                    name: symbol.name,
                    kind: symbolKindToString(symbol.kind),
                    location: `${uriToWorkspacePath(symbol.location.uri)}:${symbol.location.range.start.line + 1}:${symbol.location.range.start.character}`,
                    range: {
                        start: {
                            line: symbol.location.range.start.line + 1,
                            character: symbol.location.range.start.character
                        },
                        end: {
                            line: symbol.location.range.end.line + 1,
                            character: symbol.location.range.end.character
                        }
                    }
                };

                // Add container name if available
                if (symbol.containerName) {
                    Object.assign(formatted, { containerName: symbol.containerName });
                }

                return formatted;
            }),
            total: totalCount
        };

        return result;
    } catch (error) {
        logger.error(`[searchWorkspaceSymbols] Error: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}

/**
 * Get all document symbols from a file in hierarchical format
 * @param uri The URI of the document
 * @param maxDepth Maximum nesting depth to display (optional)
 * @returns Formatted symbol information with hierarchy
 */
interface SerializedPosition {
    line: number;
    character: number;
}

interface SerializedRange {
    start: SerializedPosition;
    end: SerializedPosition;
}

interface SerializedDocumentSymbol {
    name: string;
    detail?: string;
    kind: string;
    range: SerializedRange;
    selectionRange: SerializedRange;
    depth: number;
    children?: number;
}

async function getDocumentSymbols(
    uri: vscode.Uri,
    maxDepth?: number
): Promise<{
    symbols: SerializedDocumentSymbol[];
    total: number;
    totalByKind: Record<string, number>;
}> {
    logger.info(`[getDocumentSymbols] Getting symbols for ${uri.toString()}, maxDepth: ${maxDepth}`);

    try {
        // Execute the document symbol provider
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            uri
        ) || [];

        logger.info(`[getDocumentSymbols] Found ${symbols.length} top-level symbols`);

        const flatSymbols: SerializedDocumentSymbol[] = [];
        const kindCounts: Record<string, number> = {};

        function visitSymbol(symbol: vscode.DocumentSymbol, depth: number) {
            const kindString = symbolKindToString(symbol.kind);
            kindCounts[kindString] = (kindCounts[kindString] || 0) + 1;

            const processedSymbol: SerializedDocumentSymbol = {
                name: symbol.name,
                kind: kindString,
                range: serializeOneBasedRange(symbol.range),
                selectionRange: serializeOneBasedRange(symbol.selectionRange),
                depth
            };
            if (symbol.detail) {
                processedSymbol.detail = symbol.detail;
            }
            if (symbol.children && symbol.children.length > 0) {
                processedSymbol.children = symbol.children.length;
            }
            flatSymbols.push(processedSymbol);
        }

        function processSymbols(symbols: vscode.DocumentSymbol[], depth: number = 0) {
            if (maxDepth !== undefined && depth > maxDepth) {
                return;
            }
            for (const symbol of symbols) {
                visitSymbol(symbol, depth);
                if (symbol.children && symbol.children.length > 0) {
                    processSymbols(symbol.children, depth + 1);
                }
            }
        }

        processSymbols(symbols);

        return {
            symbols: flatSymbols,
            total: flatSymbols.length,
            totalByKind: kindCounts
        };
    } catch (error) {
        logger.error(`[getDocumentSymbols] Error: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}

/**
 * Registers MCP symbol-related tools with the server
 * @param server MCP server instance
 */
function formatHoverEntry(hover: { preview?: string | undefined; contents: string[]; range?: { start: { line: number; character: number }; end: { line: number; character: number } } | undefined }): string {
    let text = '';
    if (hover.preview) {
        text += `Code context: \`${hover.preview}\`\n\n`;
    }
    for (const content of hover.contents) {
        text += `${content}\n\n`;
    }
    if (hover.range) {
        text += `Symbol range: [${hover.range.start.line}:${hover.range.start.character}] to [${hover.range.end.line}:${hover.range.end.character}]\n\n`;
    }
    return text;
}

async function locateSymbolPosition(
    uri: vscode.Uri,
    line: number,
    symbol: string,
    rawPath: string,
): Promise<{ position: vscode.Position; character: number } | { notFoundMessage: string }> {
    const zeroBasedLine = line - 1;
    try {
        await vscode.workspace.fs.stat(uri);
    } catch {
        throw new Error(`File not found: ${rawPath}`);
    }

    const lineText = await getLineText(uri, zeroBasedLine);
    if (!lineText) {
        throw new Error(`Line ${line} not found in file: ${rawPath}`);
    }

    const character = findSymbolInLine(lineText, symbol);
    if (character === -1) {
        return { notFoundMessage: `Symbol "${symbol}" not found on line ${line} in file: ${rawPath}` };
    }

    return { position: new vscode.Position(zeroBasedLine, character), character };
}

async function getSymbolDefinitionText(rawPath: string, line: number, symbol: string): Promise<string> {
    const workspacePath = assertWorkspacePath(rawPath);
    const uri = workspacePathToUri(workspacePath);
    const located = await locateSymbolPosition(uri, line, symbol, rawPath);
    if ('notFoundMessage' in located) {
        return located.notFoundMessage;
    }

    const { position, character } = located;
    const hoverResult = await getSymbolHoverInfo(uri, position);
    if (hoverResult.hovers.length === 0) {
        return `No definition information found for symbol "${symbol}" at ${workspacePath}:${line}:${character}.`;
    }

    let resultText = `Definition information for symbol "${symbol}" at ${workspacePath}:${line}:${character}:\n\n`;
    for (const hover of hoverResult.hovers) {
        resultText += formatHoverEntry(hover);
    }
    return resultText;
}

export function registerSymbolTools(server: McpServer): void {
    // Add search_symbols_code tool
    server.tool(
        'search_symbols_code',
        `Searches for symbols (functions, classes, variables) across workspace using fuzzy matching.

        WHEN TO USE: Finding function/class definitions, exploring project structure, locating specific elements.

        Search: Supports partial terms (e.g., 'createW' matches 'createWorkspaceFile'). Returns location and container info.
        Limit results to avoid overwhelming output - increase maxResults only if needed.`,
        {
            query: z.string().describe('The search query for symbol names'),
            maxResults: z.number().optional().default(10).describe('Maximum number of results to return (default: 10)')
        },
        async ({ query, maxResults = 10 }): Promise<CallToolResult> => {
            logger.info(`[search_symbols_code] Tool called with query="${query}", maxResults=${maxResults}`);

            try {
                logger.info('[search_symbols_code] Searching workspace symbols');
                const result = await searchWorkspaceSymbols(query, maxResults);

                let resultText: string;

                if (result.symbols.length === 0) {
                    resultText = `No symbols found matching query "${query}".`;
                } else {
                    resultText = `Found ${result.total} symbols matching query "${query}"`;

                    if (result.total > maxResults) {
                        resultText += ` (showing first ${maxResults})`;
                    }

                    resultText += ":\n\n";

                    for (const symbol of result.symbols) {
                        resultText += `${symbol.name} (${symbol.kind})`;
                        if (symbol.containerName) {
                            resultText += ` in ${symbol.containerName}`;
                        }
                        resultText += `\nLocation: ${symbol.location}\n\n`;
                    }
                }

                const callResult: CallToolResult = {
                    content: [
                        {
                            type: 'text',
                            text: resultText
                        }
                    ]
                };
                logger.info('[search_symbols_code] Successfully completed');
                return callResult;
            } catch (error) {
                logger.error(`[search_symbols_code] Error in tool: ${error instanceof Error ? error.message : String(error)}`);
                throw error;
            }
        }
    );

    // Add get_symbol_definition_code tool with updated parameters
    server.tool(
        'get_symbol_definition_code',
        `Gets definition information for a symbol using hover data (type, docs, source).

        WHEN TO USE: Understanding what a symbol represents, checking function signatures, quick API reference.
        USE search_symbols_code instead for: finding symbols by name across the project.

        Requires exact symbol name and line number. If symbol not found on line, returns clear message.`,
        {
            path: z.string().describe('The path to the file containing the symbol'),
            line: z.number().describe('The line number of the symbol (1-based)'),
            symbol: z.string().describe('The symbol name to look for on the specified line')
        },
        async ({ path, line, symbol }): Promise<CallToolResult> => {
            logger.info(`[get_symbol_definition_code] Tool called with path="${path}", line=${line}, symbol="${symbol}"`);
            try {
                const result = await getSymbolDefinitionText(path, line, symbol);
                logger.info('[get_symbol_definition_code] Successfully completed');
                return { content: [{ type: 'text', text: result }] };
            } catch (error) {
                logger.error(`[get_symbol_definition_code] Error in tool: ${error instanceof Error ? error.message : String(error)}`);
                throw error;
            }
        }
    );

    // Add get_document_symbols_code tool
    server.tool(
        'get_document_symbols_code',
        `Gets complete symbol outline for a file showing hierarchical structure and line numbers.

        WHEN TO USE: Understanding file structure, getting overview of all symbols, finding symbol positions. This tool should be be preferred over reading the file using read_file_code when only an overview of the file is needed.
        USE search_symbols_code instead for: finding specific symbols by name across the project.

        Shows classes, functions, methods, variables with line ranges. Use maxDepth for large files to avoid deep nesting.`,
        {
            path: z.string().describe('The path to the file to analyze (relative to workspace)'),
            maxDepth: z.number().optional().describe('Maximum nesting depth to display (optional)')
        },
        async ({ path, maxDepth }): Promise<CallToolResult> => {
            logger.info(`[get_document_symbols_code] Tool called with path="${path}", maxDepth=${maxDepth}`);

            try {
                const workspacePath = assertWorkspacePath(path);
                const uri = workspacePathToUri(workspacePath);

                // Check if file exists
                try {
                    await vscode.workspace.fs.stat(uri);
                } catch (error) {
                    throw new Error(`File not found: ${path}`);
                }

                logger.info('[get_document_symbols_code] Getting document symbols');
                const result = await getDocumentSymbols(uri, maxDepth);

                let resultText: string;

                if (result.symbols.length === 0) {
                    resultText = `No symbols found in file: ${workspacePath}`;
                } else {
                    resultText = `Document symbols for ${workspacePath} (${result.total} total symbols):\n\n`;

                    // Add summary by kind
                    const kindSummary = Object.entries(result.totalByKind)
                        .map(([kind, count]) => `${count} ${kind}${count !== 1 ? 's' : ''}`)
                        .join(', ');
                    resultText += `Summary: ${kindSummary}\n\n`;

                    // Add hierarchical symbol listing
                    for (const symbol of result.symbols) {
                        const indent = '  '.repeat(symbol.depth);
                        resultText += `${indent}${symbol.name} (${symbol.kind})`;

                        if (symbol.detail) {
                            resultText += ` - ${symbol.detail}`;
                        }

                        resultText += `\n${indent}  Range: ${symbol.range.start.line}:${symbol.range.start.character}-${symbol.range.end.line}:${symbol.range.end.character}`;

                        if (symbol.children !== undefined) {
                            resultText += ` | Children: ${symbol.children}`;
                        }

                        resultText += '\n\n';
                    }
                }

                const callResult: CallToolResult = {
                    content: [
                        {
                            type: 'text',
                            text: resultText
                        }
                    ]
                };
                logger.info('[get_document_symbols_code] Successfully completed');
                return callResult;
            } catch (error) {
                logger.error(`[get_document_symbols_code] Error in tool: ${error instanceof Error ? error.message : String(error)}`);
                throw error;
            }
        }
    );
}