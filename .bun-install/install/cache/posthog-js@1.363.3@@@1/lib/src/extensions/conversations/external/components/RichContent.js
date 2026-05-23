"use strict";
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RichContent = RichContent;
var jsx_runtime_1 = require("preact/jsx-runtime");
// eslint-disable-next-line @typescript-eslint/no-unused-vars
var preact_1 = require("preact");
var hooks_1 = require("preact/hooks");
var core_1 = require("@posthog/core");
/**
 * Sanitize URL to prevent javascript: and other dangerous protocols.
 * Only allows http:, https:, mailto:, tel:, and relative URLs.
 *
 * Security measures:
 * - Removes ASCII control characters (0x00-0x1F, 0x7F) that could obfuscate protocols
 * - Removes Unicode whitespace and zero-width characters
 * - Collapses whitespace when checking protocols to prevent "java script:" bypasses
 * - Blocks javascript:, vbscript:, data:, and file: protocols
 * - Blocks protocol-relative URLs (//example.com)
 */
function sanitizeUrl(url) {
    if (!url || typeof url !== 'string') {
        return undefined;
    }
    // Remove ASCII control characters (0x00-0x1F, 0x7F DEL) that could obfuscate protocols
    // Also remove zero-width characters (U+200B-U+200D, U+FEFF) that could be used for obfuscation
    // eslint-disable-next-line no-control-regex
    var cleanedUrl = url.replace(/[\x00-\x1f\x7f\u200b-\u200d\ufeff]/g, '');
    var trimmedUrl = cleanedUrl.trim();
    if (!trimmedUrl) {
        return undefined;
    }
    // Collapse all whitespace (including Unicode whitespace) when checking protocol
    // This prevents bypasses like "java script:" or "java\u00A0script:" (non-breaking space)
    var normalizedForCheck = trimmedUrl.replace(/\s+/g, '').toLowerCase();
    // Block dangerous protocols
    if (normalizedForCheck.startsWith('javascript:') ||
        normalizedForCheck.startsWith('vbscript:') ||
        normalizedForCheck.startsWith('data:') ||
        normalizedForCheck.startsWith('file:')) {
        return undefined;
    }
    // Allow relative URLs (check against trimmed URL, not normalized)
    // Note: We explicitly check for '//' first to block protocol-relative URLs (e.g., //evil.com)
    // which could be used to load content from attacker-controlled domains
    if (trimmedUrl.startsWith('//')) {
        return undefined;
    }
    if (trimmedUrl.startsWith('/') ||
        trimmedUrl.startsWith('./') ||
        trimmedUrl.startsWith('../') ||
        trimmedUrl.startsWith('#')) {
        return trimmedUrl;
    }
    // Allow safe absolute URLs
    var lowerUrl = trimmedUrl.toLowerCase();
    if (lowerUrl.startsWith('http://') ||
        lowerUrl.startsWith('https://') ||
        lowerUrl.startsWith('mailto:') ||
        lowerUrl.startsWith('tel:')) {
        return trimmedUrl;
    }
    return undefined;
}
/** Maximum recursion depth to prevent stack overflow */
var MAX_DEPTH = 20;
function getStyles(isCustomer, primaryColor) {
    return {
        code: {
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
            fontSize: '0.9em',
            padding: '2px 4px',
            borderRadius: '3px',
            background: isCustomer ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.06)',
        },
        codeBlock: {
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
            fontSize: '0.85em',
            padding: '8px 10px',
            borderRadius: '6px',
            background: isCustomer ? 'rgba(255, 255, 255, 0.15)' : '#f4f4f5',
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            wordBreak: 'break-word',
            margin: '8px 0',
            display: 'block',
            lineHeight: 1.5,
            border: isCustomer ? 'none' : '1px solid #e4e4e7',
        },
        link: {
            color: isCustomer ? 'white' : primaryColor,
            textDecoration: 'underline',
        },
        image: {
            maxWidth: '100%',
            borderRadius: '4px',
            marginTop: '4px',
            marginBottom: '4px',
            display: 'block',
        },
    };
}
/**
 * Render a text node with its marks (bold, italic, underline, etc.)
 * Marks are applied by wrapping the content in nested elements.
 */
function renderTextWithMarks(text, marks, styles, key) {
    var e_1, _a;
    var _b;
    if (!marks || marks.length === 0) {
        return (0, jsx_runtime_1.jsx)("span", { children: text }, key);
    }
    // Build the element by wrapping with marks from inside out
    var element = (0, jsx_runtime_1.jsx)(jsx_runtime_1.Fragment, { children: text });
    try {
        for (var marks_1 = __values(marks), marks_1_1 = marks_1.next(); !marks_1_1.done; marks_1_1 = marks_1.next()) {
            var mark = marks_1_1.value;
            switch (mark.type) {
                case 'bold':
                    element = (0, jsx_runtime_1.jsx)("strong", { style: { fontWeight: 700 }, children: element });
                    break;
                case 'italic':
                    element = (0, jsx_runtime_1.jsx)("em", { style: { fontStyle: 'italic' }, children: element });
                    break;
                case 'underline':
                    element = (0, jsx_runtime_1.jsx)("u", { style: { textDecoration: 'underline' }, children: element });
                    break;
                case 'strike':
                    element = (0, jsx_runtime_1.jsx)("s", { style: { textDecoration: 'line-through' }, children: element });
                    break;
                case 'code':
                    element = (0, jsx_runtime_1.jsx)("code", { style: styles.code, children: element });
                    break;
                case 'link': {
                    var href = (_b = mark.attrs) === null || _b === void 0 ? void 0 : _b.href;
                    var safeUrl = typeof href === 'string' ? sanitizeUrl(href) : undefined;
                    if (safeUrl) {
                        element = ((0, jsx_runtime_1.jsx)("a", { href: safeUrl, target: "_blank", rel: "noopener noreferrer", referrerPolicy: "no-referrer", style: styles.link, children: element }));
                    }
                    break;
                }
                // Ignore unknown mark types for safety
            }
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (marks_1_1 && !marks_1_1.done && (_a = marks_1.return)) _a.call(marks_1);
        }
        finally { if (e_1) throw e_1.error; }
    }
    return (0, jsx_runtime_1.jsx)("span", { children: element }, key);
}
/**
 * Recursively render a TipTap node and its children
 */
function renderNode(node, styles, depth, key) {
    var _a, _b, _c, _d, _e, _f;
    // Safety: prevent infinite recursion
    if (depth > MAX_DEPTH) {
        return null;
    }
    // Text node with optional marks
    if (node.type === 'text' && !(0, core_1.isUndefined)(node.text)) {
        return renderTextWithMarks(node.text, node.marks, styles, key);
    }
    // Render children recursively
    var children = ((_a = node.content) === null || _a === void 0 ? void 0 : _a.map(function (child, index) { return renderNode(child, styles, depth + 1, "".concat(key, "-").concat(index)); })) || [];
    switch (node.type) {
        case 'doc':
            return (0, jsx_runtime_1.jsx)(jsx_runtime_1.Fragment, { children: children });
        case 'paragraph':
            return ((0, jsx_runtime_1.jsx)("p", { style: { margin: '0 0 8px 0' }, children: children.length > 0 ? children : (0, jsx_runtime_1.jsx)("br", {}) }, key));
        case 'hardBreak':
            return (0, jsx_runtime_1.jsx)("br", {}, key);
        case 'codeBlock': {
            // Code blocks store text in content[0].text
            var codeText = ((_c = (_b = node.content) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.text) || '';
            return ((0, jsx_runtime_1.jsx)("pre", { style: styles.codeBlock, children: (0, jsx_runtime_1.jsx)("code", { children: codeText }) }, key));
        }
        case 'image': {
            var src = (_d = node.attrs) === null || _d === void 0 ? void 0 : _d.src;
            var alt = (_e = node.attrs) === null || _e === void 0 ? void 0 : _e.alt;
            var safeUrl = typeof src === 'string' ? sanitizeUrl(src) : undefined;
            if (!safeUrl) {
                return null;
            }
            return ((0, jsx_runtime_1.jsx)("img", { src: safeUrl, alt: typeof alt === 'string' ? alt : '', style: styles.image, onError: function (e) {
                    ;
                    e.target.style.display = 'none';
                } }, key));
        }
        case 'bulletList':
            return ((0, jsx_runtime_1.jsx)("ul", { style: { margin: '8px 0', paddingLeft: '24px' }, children: children }, key));
        case 'orderedList':
            return ((0, jsx_runtime_1.jsx)("ol", { style: { margin: '8px 0', paddingLeft: '24px' }, children: children }, key));
        case 'listItem':
            return ((0, jsx_runtime_1.jsx)("li", { style: { margin: '4px 0' }, children: children }, key));
        case 'blockquote':
            return ((0, jsx_runtime_1.jsx)("blockquote", { style: {
                    margin: '8px 0',
                    paddingLeft: '12px',
                    borderLeft: '3px solid #e4e4e7',
                    color: '#71717a',
                }, children: children }, key));
        case 'heading': {
            var rawLevel = (_f = node.attrs) === null || _f === void 0 ? void 0 : _f.level;
            var level = (0, core_1.isNumber)(rawLevel) ? rawLevel : 1;
            var HeadingTag = "h".concat(Math.min(Math.max(level, 1), 6));
            return ((0, jsx_runtime_1.jsx)(HeadingTag, { style: { margin: '12px 0 8px 0' }, children: children }, key));
        }
        case 'horizontalRule':
            return (0, jsx_runtime_1.jsx)("hr", { style: { margin: '12px 0', border: 'none', borderTop: '1px solid #e4e4e7' } }, key);
        default:
            // Unknown node types: render children if any, otherwise ignore
            if (children.length > 0) {
                return (0, jsx_runtime_1.jsx)("span", { children: children }, key);
            }
            return null;
    }
}
/**
 * Validate that the content looks like a valid TipTap document
 */
function isValidTipTapDoc(doc) {
    if (!doc || typeof doc !== 'object') {
        return false;
    }
    var d = doc;
    return d.type === 'doc' && ((0, core_1.isUndefined)(d.content) || (0, core_1.isArray)(d.content));
}
/**
 * Render plain text with line breaks preserved
 */
function renderPlainText(text) {
    if (!text) {
        return (0, jsx_runtime_1.jsx)(jsx_runtime_1.Fragment, {});
    }
    var lines = text.split('\n');
    return ((0, jsx_runtime_1.jsx)(jsx_runtime_1.Fragment, { children: lines.map(function (line, index) { return ((0, jsx_runtime_1.jsxs)(preact_1.Fragment, { children: [line, index < lines.length - 1 && (0, jsx_runtime_1.jsx)("br", {})] }, index)); }) }));
}
/**
 * RichContent component - renders TipTap JSON content with plain text fallback
 *
 * Rendering logic:
 * 1. If richContent is present and valid, render as TipTap tree
 * 2. If richContent is missing or invalid, fall back to plain text content
 * 3. Wrap TipTap rendering in try/catch for safety
 */
function RichContent(_a) {
    var richContent = _a.richContent, content = _a.content, isCustomer = _a.isCustomer, primaryColor = _a.primaryColor;
    var styles = (0, hooks_1.useMemo)(function () { return getStyles(isCustomer, primaryColor); }, [isCustomer, primaryColor]);
    // Try to render rich content if available
    if (richContent) {
        try {
            if (isValidTipTapDoc(richContent)) {
                var rendered = renderNode(richContent, styles, 0, 'root');
                if (rendered) {
                    return rendered;
                }
            }
        }
        catch (_b) {
            // Fall through to plain text on any error
        }
    }
    // Fallback: render plain text content
    return renderPlainText(content);
}
//# sourceMappingURL=RichContent.js.map