import { PostHog } from '../../posthog-core';
import { ProductTourManager } from './product-tours';
export { ProductTourManager } from './product-tours';
export { findElementBySelector, getElementMetadata, getProductTourStylesheet } from './product-tours-utils';
export { findElement, getElementPath } from './element-inference';
export type { InferredSelector, AutoData, SelectorGroup } from './element-inference';
export declare function generateProductTours(posthog: PostHog, isEnabled: boolean): ProductTourManager | undefined;
