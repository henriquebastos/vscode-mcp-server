import * as vscode from 'vscode';
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod';
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { assertWorkspacePath, getSingleWorkspaceRoot, isUriInsideWorkspace, uriToWorkspacePath, workspacePathToUri } from '../workspace/workspace-boundary';

/**
 * Get diagnostics for the entire workspace or a specific file
 * @param filePath Optional file path to check
 * @returns Array of [Uri, Diagnostic[]] tuples
 */
function getDiagnostics(filePath?: string): [vscode.Uri, vscode.Diagnostic[]][] {
    console.log(`[getDiagnostics] Starting with filePath: ${filePath || 'all files'}`);
    
    // If filePath is provided, get diagnostics for that file only
    if (filePath) {
        if (!vscode.workspace.workspaceFolders) {
            throw new Error('No workspace folder is open');
        }

        const fileUri = workspacePathToUri(assertWorkspacePath(filePath));
        console.log(`[getDiagnostics] Getting diagnostics for file: ${fileUri.fsPath}`);
        
        const diagnostics = vscode.languages.getDiagnostics(fileUri);
        return diagnostics.length > 0 ? [[fileUri, diagnostics]] : [];
    }
    
    // Otherwise, get diagnostics for all files
    getSingleWorkspaceRoot();
    console.log('[getDiagnostics] Getting diagnostics for all files');
    return vscode.languages.getDiagnostics();
}

/**
 * Get severity name from DiagnosticSeverity enum
 * @param severity The diagnostic severity level
 * @returns String representation of the severity
 */
function getSeverityName(severity: vscode.DiagnosticSeverity): string {
    switch (severity) {
        case vscode.DiagnosticSeverity.Error:
            return 'Error';
        case vscode.DiagnosticSeverity.Warning:
            return 'Warning';
        case vscode.DiagnosticSeverity.Information:
            return 'Information';
        case vscode.DiagnosticSeverity.Hint:
            return 'Hint';
        default:
            return 'Unknown';
    }
}

/**
 * Format diagnostics for output
 * @param diagnostics Array of diagnostics to format
 * @param severities Array of severity levels to include
 * @param format Format of the output (text or json)
 * @param includeSource Whether to include the diagnostic source
 * @returns Formatted diagnostics as string or object
 */
interface FormattedIssue {
    file: string;
    line: number;
    column: number;
    severity: string;
    message: string;
    source?: string;
}

function collectIssues(
    diagnostics: [vscode.Uri, vscode.Diagnostic[]][],
    severities: vscode.DiagnosticSeverity[],
    includeSource: boolean,
): FormattedIssue[] {
    const result: FormattedIssue[] = [];

    for (const [uri, fileDiagnostics] of diagnostics) {
        if (!isUriInsideWorkspace(uri)) {
            continue;
        }
        const filePath = uriToWorkspacePath(uri);

        for (const diagnostic of fileDiagnostics) {
            if (!severities.includes(diagnostic.severity)) {
                continue;
            }
            const issue: FormattedIssue = {
                file: filePath,
                line: diagnostic.range.start.line + 1,
                column: diagnostic.range.start.character + 1,
                severity: getSeverityName(diagnostic.severity),
                message: diagnostic.message,
            };
            if (includeSource && diagnostic.source) {
                issue.source = diagnostic.source;
            }
            result.push(issue);
        }
    }

    return result;
}

function renderIssuesAsText(issues: FormattedIssue[], includeSource: boolean): string {
    if (issues.length === 0) {
        return 'No issues found.';
    }

    let output = `Found ${issues.length} issue(s):\n\n`;
    for (const issue of issues) {
        output += `${issue.severity}: ${issue.file}:${issue.line}:${issue.column}\n`;
        output += `  ${issue.message}\n`;
        if (includeSource && issue.source) {
            output += `  Source: ${issue.source}\n`;
        }
        output += '\n';
    }
    return output;
}

function formatDiagnostics(
    diagnostics: [vscode.Uri, vscode.Diagnostic[]][],
    severities: vscode.DiagnosticSeverity[],
    format: 'text' | 'json' = 'text',
    includeSource: boolean = true
): string | object {
    console.log(`[formatDiagnostics] Format: ${format}, Include source: ${includeSource}`);
    const issues = collectIssues(diagnostics, severities, includeSource);
    return format === 'json' ? issues : renderIssuesAsText(issues, includeSource);
}

/**
 * Registers MCP diagnostics-related tools with the server
 * @param server MCP server instance
 */
export function registerDiagnosticsTools(server: McpServer): void {
    // Add get_diagnostics tool
    server.tool(
        'get_diagnostics_code',
        `CRITICAL: Run this after EVERY series of code changes to check for errors before completing tasks.

        Analyzes code for warnings and errors using VS Code's integrated linters.

        WHEN TO USE: After edits, before task completion, debugging build issues.
        Scope: Single file (faster) or entire workspace (comprehensive).
        Severities: 0=Error, 1=Warning, 2=Info, 3=Hint. Defaults to errors and warnings only.`,
        {
            path: z.string().optional().default('').describe('Optional file path to check. If not provided, checks the entire workspace. The file path must be a file, not a directory.'),
            severities: z.array(z.number()).optional().default([0, 1]).describe('Array of severity levels to include (0=Error, 1=Warning, 2=Information, 3=Hint)'),
            format: z.enum(['text', 'json']).optional().default('text').describe('Output format'),
            includeSource: z.boolean().optional().default(true).describe('Whether to include the diagnostic source to identify which linter/extension flagged each issue')
        },
        async ({ path, severities = [0, 1], format = 'text', includeSource = true }): Promise<CallToolResult> => {
            console.log(`[get_diagnostics] Tool called with path=${path || 'all'}, severities=${severities.join(',')}, format=${format}`);
            
            try {
                console.log('[get_diagnostics] Getting diagnostics');
                const diagnostics = getDiagnostics(path);
                
                console.log(`[get_diagnostics] Found diagnostics for ${diagnostics.length} files`);
                const formattedResult = formatDiagnostics(diagnostics, severities, format, includeSource);
                
                const result: CallToolResult = {
                    content: [
                        {
                            type: 'text',
                            text: format === 'json' 
                                ? JSON.stringify(formattedResult, null, 2) 
                                : formattedResult as string
                        }
                    ]
                };
                console.log('[get_diagnostics] Successfully completed');
                return result;
            } catch (error) {
                console.error('[get_diagnostics] Error in tool:', error);
                throw error;
            }
        }
    );
}