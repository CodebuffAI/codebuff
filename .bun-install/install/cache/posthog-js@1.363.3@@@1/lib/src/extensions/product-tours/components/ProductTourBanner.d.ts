import { h } from 'preact';
import { ProductTourDisplayFrequency, ProductTourStep } from '../../../posthog-product-tours-types';
export interface ProductTourBannerProps {
    step: ProductTourStep;
    onDismiss: () => void;
    onActionClick?: () => void;
    displayFrequency?: ProductTourDisplayFrequency;
}
export declare function ProductTourBanner(props: ProductTourBannerProps): h.JSX.Element;
