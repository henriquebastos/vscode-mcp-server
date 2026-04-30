export function truncateText(text: string, maxCharacters: number): { text: string; truncated: boolean } {
    if (text.length <= maxCharacters) {
        return { text, truncated: false };
    }

    return { text: text.slice(0, maxCharacters), truncated: true };
}
