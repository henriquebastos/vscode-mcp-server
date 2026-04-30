import * as vscode from 'vscode';

export function escapeMarkdownText(text: string): string {
    return text.replace(/[\\`*_{}\[\]()#+\-.!|>]/g, character => `\\${character}`);
}

export function sanitizeGuidedMarkdown(markdown: string): string {
    return markdown
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, (_match, altText: string) => altText ? `[image omitted: ${escapeMarkdownText(altText)}]` : '[image omitted]')
        .replace(/\[([^\]]+)\]\(\s*(?:file|data|command|vscode|javascript):[^)]*\)/gi, (_match, linkText: string) => escapeMarkdownText(linkText));
}

export function createUntrustedMarkdown(value: string): vscode.MarkdownString {
    const markdown = new vscode.MarkdownString(value);
    markdown.isTrusted = false;
    markdown.supportHtml = false;
    return markdown;
}
