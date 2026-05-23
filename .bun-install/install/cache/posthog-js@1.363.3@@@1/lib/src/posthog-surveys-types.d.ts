/**
 * Having Survey types in types.ts was confusing tsc
 * and generating an invalid module.d.ts
 * See https://github.com/PostHog/posthog-js/issues/698
 */
import type { Properties, PropertyMatchType } from './types';
import type { SurveyAppearance as CoreSurveyAppearance, SurveyValidationRule } from '@posthog/core';
export type PropertyOperator = PropertyMatchType | 'gt' | 'lt';
export type PropertyFilters = {
    [propertyName: string]: {
        values: string[];
        operator: PropertyOperator;
    };
};
export interface SurveyEventWithFilters {
    name: string;
    propertyFilters?: PropertyFilters;
}
export interface SurveyAppearance extends Omit<CoreSurveyAppearance, 'position' | 'widgetType'> {
    /** @deprecated - not currently used */
    descriptionTextColor?: string;
    ratingButtonHoverColor?: string;
    whiteLabel?: boolean;
    tabPosition?: SurveyTabPosition;
    fontFamily?: string;
    maxWidth?: string;
    zIndex?: string;
    disabledButtonOpacity?: string;
    boxPadding?: string;
    /** @deprecated Use inputBackground instead (inherited from core) */
    inputBackgroundColor?: string;
    hideCancelButton?: boolean;
    position?: SurveyPosition;
    widgetType?: SurveyWidgetType;
}
export type SurveyQuestion = BasicSurveyQuestion | LinkSurveyQuestion | RatingSurveyQuestion | MultipleSurveyQuestion;
export type SurveyQuestionDescriptionContentType = 'html' | 'text';
interface SurveyQuestionBase {
    question: string;
    id?: string;
    description?: string | null;
    descriptionContentType?: SurveyQuestionDescriptionContentType;
    optional?: boolean;
    buttonText?: string;
    branching?: NextQuestionBranching | EndBranching | ResponseBasedBranching | SpecificQuestionBranching;
    validation?: SurveyValidationRule[];
}
export interface BasicSurveyQuestion extends SurveyQuestionBase {
    type: typeof SurveyQuestionType.Open;
}
export interface LinkSurveyQuestion extends SurveyQuestionBase {
    type: typeof SurveyQuestionType.Link;
    link?: string | null;
}
export interface RatingSurveyQuestion extends SurveyQuestionBase {
    type: typeof SurveyQuestionType.Rating;
    display: 'number' | 'emoji';
    scale: 2 | 3 | 5 | 7 | 10;
    lowerBoundLabel: string;
    upperBoundLabel: string;
    skipSubmitButton?: boolean;
}
export interface MultipleSurveyQuestion extends SurveyQuestionBase {
    type: typeof SurveyQuestionType.SingleChoice | typeof SurveyQuestionType.MultipleChoice;
    choices: string[];
    hasOpenChoice?: boolean;
    shuffleOptions?: boolean;
    skipSubmitButton?: boolean;
}
interface NextQuestionBranching {
    type: typeof SurveyQuestionBranchingType.NextQuestion;
}
interface EndBranching {
    type: typeof SurveyQuestionBranchingType.End;
}
interface ResponseBasedBranching {
    type: typeof SurveyQuestionBranchingType.ResponseBased;
    responseValues: Record<string, any>;
}
interface SpecificQuestionBranching {
    type: typeof SurveyQuestionBranchingType.SpecificQuestion;
    index: number;
}
export type SurveyCallback = (surveys: Survey[], context?: {
    isLoaded: boolean;
    error?: string;
}) => void;
export interface SurveyElement {
    text?: string;
    $el_text?: string;
    tag_name?: string;
    href?: string;
    attr_id?: string;
    attr_class?: string[];
    nth_child?: number;
    nth_of_type?: number;
    attributes?: Record<string, any>;
    event_id?: number;
    order?: number;
    group_id?: number;
}
export type { SurveyRenderReason } from '@posthog/types';
export interface Survey {
    id: string;
    name: string;
    description: string;
    type: SurveyType;
    feature_flag_keys: {
        key: string;
        value?: string;
    }[] | null;
    linked_flag_key: string | null;
    targeting_flag_key: string | null;
    internal_targeting_flag_key: string | null;
    questions: SurveyQuestion[];
    appearance: SurveyAppearance | null;
    conditions: {
        url?: string;
        selector?: string;
        seenSurveyWaitPeriodInDays?: number;
        urlMatchType?: PropertyMatchType;
        /** events that trigger surveys */
        events: {
            repeatedActivation?: boolean;
            values: SurveyEventWithFilters[];
        } | null;
        /** events that cancel "pending" (time-delayed) surveys */
        cancelEvents: {
            values: SurveyEventWithFilters[];
        } | null;
        actions: {
            values: SurveyActionType[];
        } | null;
        deviceTypes?: string[];
        deviceTypesMatchType?: PropertyMatchType;
        linkedFlagVariant?: string;
    } | null;
    start_date: string | null;
    end_date: string | null;
    current_iteration: number | null;
    current_iteration_start_date: string | null;
    schedule?: SurveySchedule | null;
    enable_partial_responses?: boolean | null;
}
export type SurveyWithTypeAndAppearance = Pick<Survey, 'id' | 'type' | 'appearance'>;
export interface SurveyActionType {
    id: number;
    name: string | null;
    steps?: ActionStepType[];
}
/** Sync with plugin-server/src/types.ts */
export type ActionStepStringMatching = 'contains' | 'exact' | 'regex';
export interface ActionStepType {
    event?: string | null;
    selector?: string | null;
    /** pre-compiled regex pattern for matching selector against $elements_chain */
    selector_regex?: string | null;
    /** @deprecated Only `selector` should be used now. */
    tag_name?: string;
    text?: string | null;
    /** @default StringMatching.Exact */
    text_matching?: ActionStepStringMatching | null;
    href?: string | null;
    /** @default ActionStepStringMatching.Exact */
    href_matching?: ActionStepStringMatching | null;
    url?: string | null;
    /** @default StringMatching.Contains */
    url_matching?: ActionStepStringMatching | null;
    /** Property filters for action step matching */
    properties?: {
        key: string;
        value?: string | number | boolean | (string | number | boolean)[] | null;
        operator?: PropertyMatchType;
        type?: string;
    }[];
}
interface DisplaySurveyOptionsBase {
    ignoreConditions: boolean;
    ignoreDelay: boolean;
    displayType: DisplaySurveyType;
    /** Additional properties to include in all survey events (shown, sent, dismissed) */
    properties?: Properties;
    /** Pre-filled responses by question index (0-based) */
    initialResponses?: Record<number, SurveyResponseValue>;
}
export interface DisplaySurveyPopoverOptions extends DisplaySurveyOptionsBase {
    displayType: typeof DisplaySurveyType.Popover;
    /** Override the survey's configured position */
    position?: SurveyPosition;
    /** CSS selector for the element to position the survey next to (when position is NextToTrigger) */
    selector?: string;
    /** When true, `survey shown` events will not be emitted automatically */
    skipShownEvent?: boolean;
}
interface DisplaySurveyInlineOptions extends DisplaySurveyOptionsBase {
    displayType: typeof DisplaySurveyType.Inline;
    selector: string;
}
export type DisplaySurveyOptions = DisplaySurveyPopoverOptions | DisplaySurveyInlineOptions;
export interface SurveyConfig {
    prefillFromUrl?: boolean;
    /**
     * @deprecated No longer used. Surveys will automatically advance past
     * prefilled questions with skipSubmitButton enabled. If partial response
     * collection is enabled, partial responses for pre-filled questions will
     * be submitted automatically on page load.
     */
    autoSubmitIfComplete?: boolean;
    /**
     * @deprecated No longer used. Pre-filled responses are now sent
     * immediately when partial responses are enabled, or all required
     * quesions have been pre-filled.
     */
    autoSubmitDelay?: number;
}
export type SurveyResponseValue = string | number | string[] | null;
/**
 * Surveys related enums and constants.
 * We use const objects instead of TypeScript enums to allow for easier tree-shaking and to avoid issues with enum imports in JavaScript.
 */
export declare const SurveyEventType: {
    readonly Activation: "events";
    readonly Cancellation: "cancelEvents";
};
export type SurveyEventType = (typeof SurveyEventType)[keyof typeof SurveyEventType];
export declare const SurveyWidgetType: {
    readonly Button: "button";
    readonly Tab: "tab";
    readonly Selector: "selector";
};
export type SurveyWidgetType = (typeof SurveyWidgetType)[keyof typeof SurveyWidgetType];
export declare const SurveyPosition: {
    readonly TopLeft: "top_left";
    readonly TopRight: "top_right";
    readonly TopCenter: "top_center";
    readonly MiddleLeft: "middle_left";
    readonly MiddleRight: "middle_right";
    readonly MiddleCenter: "middle_center";
    readonly Left: "left";
    readonly Center: "center";
    readonly Right: "right";
    readonly NextToTrigger: "next_to_trigger";
};
export type SurveyPosition = (typeof SurveyPosition)[keyof typeof SurveyPosition];
export declare const SurveyTabPosition: {
    readonly Top: "top";
    readonly Left: "left";
    readonly Right: "right";
    readonly Bottom: "bottom";
};
export type SurveyTabPosition = (typeof SurveyTabPosition)[keyof typeof SurveyTabPosition];
export declare const SurveyType: {
    readonly Popover: "popover";
    readonly API: "api";
    readonly Widget: "widget";
    readonly ExternalSurvey: "external_survey";
};
export type SurveyType = (typeof SurveyType)[keyof typeof SurveyType];
export declare const SurveyQuestionType: {
    readonly Open: "open";
    readonly MultipleChoice: "multiple_choice";
    readonly SingleChoice: "single_choice";
    readonly Rating: "rating";
    readonly Link: "link";
};
export type SurveyQuestionType = (typeof SurveyQuestionType)[keyof typeof SurveyQuestionType];
export declare const SurveyQuestionBranchingType: {
    readonly NextQuestion: "next_question";
    readonly End: "end";
    readonly ResponseBased: "response_based";
    readonly SpecificQuestion: "specific_question";
};
export type SurveyQuestionBranchingType = (typeof SurveyQuestionBranchingType)[keyof typeof SurveyQuestionBranchingType];
export declare const SurveySchedule: {
    readonly Once: "once";
    readonly Recurring: "recurring";
    readonly Always: "always";
};
export type SurveySchedule = (typeof SurveySchedule)[keyof typeof SurveySchedule];
export declare const SurveyEventName: {
    readonly SHOWN: "survey shown";
    readonly DISMISSED: "survey dismissed";
    readonly SENT: "survey sent";
    readonly ABANDONED: "survey abandoned";
};
export type SurveyEventName = (typeof SurveyEventName)[keyof typeof SurveyEventName];
export declare const SurveyEventProperties: {
    readonly SURVEY_ID: "$survey_id";
    readonly SURVEY_NAME: "$survey_name";
    readonly SURVEY_RESPONSE: "$survey_response";
    readonly SURVEY_ITERATION: "$survey_iteration";
    readonly SURVEY_ITERATION_START_DATE: "$survey_iteration_start_date";
    readonly SURVEY_PARTIALLY_COMPLETED: "$survey_partially_completed";
    readonly SURVEY_SUBMISSION_ID: "$survey_submission_id";
    readonly SURVEY_QUESTIONS: "$survey_questions";
    readonly SURVEY_COMPLETED: "$survey_completed";
    readonly PRODUCT_TOUR_ID: "$product_tour_id";
    readonly SURVEY_LAST_SEEN_DATE: "$survey_last_seen_date";
};
export type SurveyEventProperties = (typeof SurveyEventProperties)[keyof typeof SurveyEventProperties];
export declare const DisplaySurveyType: {
    readonly Popover: "popover";
    readonly Inline: "inline";
};
export type DisplaySurveyType = (typeof DisplaySurveyType)[keyof typeof DisplaySurveyType];
