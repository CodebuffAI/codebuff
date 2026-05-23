import { Survey, SurveyQuestionBranchingType } from '../posthog-surveys-types';
/**
 * Get the rating bucket (detractors/passives/promoters or negative/neutral/positive)
 * based on the response value and scale.
 */
export declare function getRatingBucketForResponseValue(responseValue: number, scale: number): string;
/**
 * Determine the next survey step based on branching configuration.
 * Returns the next question index, or SurveyQuestionBranchingType.End if the survey should end.
 */
export declare function getNextSurveyStep(survey: Survey, currentQuestionIndex: number, response: string | string[] | number | null): number | typeof SurveyQuestionBranchingType.End;
