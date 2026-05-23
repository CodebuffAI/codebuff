/**
 * Format a timestamp to a relative time string
 */
export declare function formatRelativeTime(isoString: string | undefined): string;
/**
 * Truncate text to a maximum length with ellipsis
 */
export declare function truncateText(text: string | undefined, maxLength: number): string;
/**
 * Strip markdown formatting from text for plain text display
 * Lightweight regex-based approach without external dependencies
 */
export declare function stripMarkdown(text: string | undefined): string;
