"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatRelativeTime = formatRelativeTime;
exports.truncateText = truncateText;
exports.stripMarkdown = stripMarkdown;
/**
 * Format a timestamp to a relative time string
 */
function formatRelativeTime(isoString) {
    if (!isoString) {
        return '';
    }
    var date = new Date(isoString);
    var now = new Date();
    var diffMs = now.getTime() - date.getTime();
    var diffMins = Math.floor(diffMs / 60000);
    var diffHours = Math.floor(diffMins / 60);
    var diffDays = Math.floor(diffHours / 24);
    if (diffMins < 1) {
        return 'Just now';
    }
    else if (diffMins < 60) {
        return "".concat(diffMins, "m ago");
    }
    else if (diffHours < 24) {
        return "".concat(diffHours, "h ago");
    }
    else if (diffDays === 1) {
        return 'Yesterday';
    }
    else if (diffDays < 7) {
        return "".concat(diffDays, "d ago");
    }
    else {
        return date.toLocaleDateString();
    }
}
/**
 * Truncate text to a maximum length with ellipsis
 */
function truncateText(text, maxLength) {
    if (!text) {
        return 'No messages yet';
    }
    if (text.length <= maxLength) {
        return text;
    }
    return text.substring(0, maxLength - 3) + '...';
}
/**
 * Strip markdown formatting from text for plain text display
 * Lightweight regex-based approach without external dependencies
 */
function stripMarkdown(text) {
    if (!text) {
        return '';
    }
    return (text
        // Remove code blocks first (before other processing)
        .replace(/```[\s\S]*?```/g, '')
        // Remove inline code
        .replace(/`([^`]+)`/g, '$1')
        // Remove images
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
        // Convert links to just text
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        // Remove headers
        .replace(/^#{1,6}\s+/gm, '')
        // Remove blockquotes
        .replace(/^>\s*/gm, '')
        // Remove horizontal rules (must be before list markers to avoid conflicts)
        .replace(/^[-*_]{3,}\s*$/gm, '')
        // Remove list markers (must be before bold/italic to avoid conflicts with *)
        .replace(/^[\s]*[-*+]\s+/gm, '')
        .replace(/^[\s]*\d+\.\s+/gm, '')
        // Remove bold/italic (order matters: ** before *)
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        // Remove strikethrough
        .replace(/~~([^~]+)~~/g, '$1')
        // Remove HTML tags entirely, then strip any remaining angle brackets for security
        .replace(/<[^>]*>/g, '')
        .replace(/[<>]/g, '')
        // Collapse multiple newlines
        .replace(/\n{2,}/g, '\n')
        // Trim whitespace
        .trim());
}
//# sourceMappingURL=utils.js.map