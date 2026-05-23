import { h } from 'preact';
import { ProductTour, ProductTourStep, ProductTourDismissReason, ProductTourStepButton } from '../../../posthog-product-tours-types';
export interface ProductTourTooltipProps {
    tour: ProductTour;
    step: ProductTourStep;
    stepIndex: number;
    totalSteps: number;
    targetElement: HTMLElement | null;
    onNext: () => void;
    onPrevious: () => void;
    onDismiss: (reason: ProductTourDismissReason) => void;
    onSurveySubmit?: (response: string | number | null) => void;
    onButtonClick?: (button: ProductTourStepButton) => void;
}
export declare function ProductTourTooltip({ tour, step, stepIndex, totalSteps, targetElement, onNext, onPrevious, onDismiss, onSurveySubmit, onButtonClick, }: ProductTourTooltipProps): h.JSX.Element;
