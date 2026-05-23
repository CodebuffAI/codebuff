import { h } from 'preact';
import { TipTapDoc } from '../../../../posthog-conversations-types';
interface RichContentProps {
    /** Rich content in TipTap JSON format (preferred) */
    richContent?: TipTapDoc;
    /** Plain text fallback if rich_content is missing or invalid */
    content: string;
    /** Whether message is from customer (affects styling) */
    isCustomer: boolean;
    /** Primary color for links */
    primaryColor: string;
}
/**
 * RichContent component - renders TipTap JSON content with plain text fallback
 *
 * Rendering logic:
 * 1. If richContent is present and valid, render as TipTap tree
 * 2. If richContent is missing or invalid, fall back to plain text content
 * 3. Wrap TipTap rendering in try/catch for safety
 */
export declare function RichContent({ richContent, content, isCustomer, primaryColor }: RichContentProps): h.JSX.Element;
export {};
