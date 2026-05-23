import { h } from 'preact';
import { ProductTourStep, ProductTourAppearance, ProductTourStepButton } from '../../../posthog-product-tours-types';
export interface ProductTourTooltipInnerProps {
    step: ProductTourStep;
    appearance?: ProductTourAppearance;
    stepIndex: number;
    totalSteps: number;
    onNext?: () => void;
    onPrevious?: () => void;
    onDismiss?: () => void;
    onButtonClick?: (button: ProductTourStepButton) => void;
}
export declare function ProductTourTooltipInner({ step, appearance, stepIndex, totalSteps, onNext, onPrevious, onDismiss, onButtonClick, }: ProductTourTooltipInnerProps): h.JSX.Element;
