import { ProductTourAppearance, ProductTourSelectorError, ProductTourStep, ProductTourWaitPeriod } from '../../posthog-product-tours-types';
export declare function getProductTourStylesheet(): HTMLStyleElement | null;
export interface ElementFindResult {
    element: HTMLElement | null;
    error: ProductTourSelectorError | null;
    matchCount: number;
}
export declare function hasElementTarget(step: ProductTourStep): boolean;
export declare function findElementBySelector(selector: string): ElementFindResult;
/**
 * Find element for a step based on its lookup mode.
 * Default: use inference. If useManualSelector is true: use CSS selector.
 */
export declare function findStepElement(step: ProductTourStep): ElementFindResult;
export declare function isElementVisible(element: HTMLElement): boolean;
export declare function getElementMetadata(element: HTMLElement): {
    tag: string;
    id: string | undefined;
    classes: string | undefined;
    text: string | undefined;
};
export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';
export interface PositionResult {
    position: TooltipPosition;
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
    arrowOffset: number;
}
export interface TooltipDimensions {
    width: number;
    height: number;
}
export declare function calculateTooltipPosition(targetRect: DOMRect, tooltipDimensions: TooltipDimensions): PositionResult;
export declare function getSpotlightStyle(targetRect: DOMRect, padding?: number): Record<string, string>;
export declare function addProductTourCSSVariablesToElement(element: HTMLElement, appearance?: ProductTourAppearance): void;
export declare function renderTipTapContent(content: any): string;
export declare function normalizeUrl(url: string): string;
export declare function resolveStepTranslation(step: ProductTourStep, lang: string | null): ProductTourStep;
export declare function getStepImageUrls(step: ProductTourStep): string[];
export declare function getStepHtml(step: ProductTourStep): string;
export declare function hasTourWaitPeriodPassed(seenTourWaitPeriod?: ProductTourWaitPeriod): boolean;
