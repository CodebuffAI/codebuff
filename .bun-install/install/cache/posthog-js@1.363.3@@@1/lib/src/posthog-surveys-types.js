"use strict";
/**
 * Having Survey types in types.ts was confusing tsc
 * and generating an invalid module.d.ts
 * See https://github.com/PostHog/posthog-js/issues/698
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DisplaySurveyType = exports.SurveyEventProperties = exports.SurveyEventName = exports.SurveySchedule = exports.SurveyQuestionBranchingType = exports.SurveyQuestionType = exports.SurveyType = exports.SurveyTabPosition = exports.SurveyPosition = exports.SurveyWidgetType = exports.SurveyEventType = void 0;
/**
 * Surveys related enums and constants.
 * We use const objects instead of TypeScript enums to allow for easier tree-shaking and to avoid issues with enum imports in JavaScript.
 */
exports.SurveyEventType = {
    Activation: 'events',
    Cancellation: 'cancelEvents',
};
exports.SurveyWidgetType = {
    Button: 'button',
    Tab: 'tab',
    Selector: 'selector',
};
exports.SurveyPosition = {
    TopLeft: 'top_left',
    TopRight: 'top_right',
    TopCenter: 'top_center',
    MiddleLeft: 'middle_left',
    MiddleRight: 'middle_right',
    MiddleCenter: 'middle_center',
    Left: 'left',
    Center: 'center',
    Right: 'right',
    NextToTrigger: 'next_to_trigger',
};
exports.SurveyTabPosition = {
    Top: 'top',
    Left: 'left',
    Right: 'right',
    Bottom: 'bottom',
};
exports.SurveyType = {
    Popover: 'popover',
    API: 'api',
    Widget: 'widget',
    ExternalSurvey: 'external_survey',
};
exports.SurveyQuestionType = {
    Open: 'open',
    MultipleChoice: 'multiple_choice',
    SingleChoice: 'single_choice',
    Rating: 'rating',
    Link: 'link',
};
exports.SurveyQuestionBranchingType = {
    NextQuestion: 'next_question',
    End: 'end',
    ResponseBased: 'response_based',
    SpecificQuestion: 'specific_question',
};
exports.SurveySchedule = {
    Once: 'once',
    Recurring: 'recurring',
    Always: 'always',
};
exports.SurveyEventName = {
    SHOWN: 'survey shown',
    DISMISSED: 'survey dismissed',
    SENT: 'survey sent',
    ABANDONED: 'survey abandoned',
};
exports.SurveyEventProperties = {
    SURVEY_ID: '$survey_id',
    SURVEY_NAME: '$survey_name',
    SURVEY_RESPONSE: '$survey_response',
    SURVEY_ITERATION: '$survey_iteration',
    SURVEY_ITERATION_START_DATE: '$survey_iteration_start_date',
    SURVEY_PARTIALLY_COMPLETED: '$survey_partially_completed',
    SURVEY_SUBMISSION_ID: '$survey_submission_id',
    SURVEY_QUESTIONS: '$survey_questions',
    SURVEY_COMPLETED: '$survey_completed',
    PRODUCT_TOUR_ID: '$product_tour_id',
    SURVEY_LAST_SEEN_DATE: '$survey_last_seen_date',
};
exports.DisplaySurveyType = {
    Popover: 'popover',
    Inline: 'inline',
};
//# sourceMappingURL=posthog-surveys-types.js.map