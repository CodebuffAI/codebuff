"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRatingBucketForResponseValue = getRatingBucketForResponseValue;
exports.getNextSurveyStep = getNextSurveyStep;
var posthog_surveys_types_1 = require("../posthog-surveys-types");
var logger_1 = require("./logger");
var logger = (0, logger_1.createLogger)('[Surveys]');
/**
 * Get the rating bucket (detractors/passives/promoters or negative/neutral/positive)
 * based on the response value and scale.
 */
function getRatingBucketForResponseValue(responseValue, scale) {
    if (scale === 2) {
        if (responseValue < 1 || responseValue > 2) {
            throw new Error('The response must be in range 1-2');
        }
        return responseValue === 1 ? 'positive' : 'negative';
    }
    else if (scale === 3) {
        if (responseValue < 1 || responseValue > 3) {
            throw new Error('The response must be in range 1-3');
        }
        return responseValue === 1 ? 'negative' : responseValue === 2 ? 'neutral' : 'positive';
    }
    else if (scale === 5) {
        if (responseValue < 1 || responseValue > 5) {
            throw new Error('The response must be in range 1-5');
        }
        return responseValue <= 2 ? 'negative' : responseValue === 3 ? 'neutral' : 'positive';
    }
    else if (scale === 7) {
        if (responseValue < 1 || responseValue > 7) {
            throw new Error('The response must be in range 1-7');
        }
        return responseValue <= 3 ? 'negative' : responseValue === 4 ? 'neutral' : 'positive';
    }
    else if (scale === 10) {
        if (responseValue < 0 || responseValue > 10) {
            throw new Error('The response must be in range 0-10');
        }
        return responseValue <= 6 ? 'detractors' : responseValue <= 8 ? 'passives' : 'promoters';
    }
    throw new Error('The scale must be one of: 2, 3, 5, 7, 10');
}
/**
 * Determine the next survey step based on branching configuration.
 * Returns the next question index, or SurveyQuestionBranchingType.End if the survey should end.
 */
function getNextSurveyStep(survey, currentQuestionIndex, response) {
    var _a, _b, _c, _d, _e;
    var question = survey.questions[currentQuestionIndex];
    var nextQuestionIndex = currentQuestionIndex + 1;
    if (!((_a = question.branching) === null || _a === void 0 ? void 0 : _a.type)) {
        if (currentQuestionIndex === survey.questions.length - 1) {
            return posthog_surveys_types_1.SurveyQuestionBranchingType.End;
        }
        return nextQuestionIndex;
    }
    if (question.branching.type === posthog_surveys_types_1.SurveyQuestionBranchingType.End) {
        return posthog_surveys_types_1.SurveyQuestionBranchingType.End;
    }
    else if (question.branching.type === posthog_surveys_types_1.SurveyQuestionBranchingType.SpecificQuestion) {
        if (Number.isInteger(question.branching.index)) {
            return question.branching.index;
        }
    }
    else if (question.branching.type === posthog_surveys_types_1.SurveyQuestionBranchingType.ResponseBased) {
        // Single choice
        if (question.type === posthog_surveys_types_1.SurveyQuestionType.SingleChoice) {
            // KLUDGE: for now, look up the choiceIndex based on the response
            // TODO: once QuestionTypes.MultipleChoiceQuestion is refactored, pass the selected choiceIndex into this method
            var selectedChoiceIndex = question.choices.indexOf("".concat(response));
            if (selectedChoiceIndex === -1 && question.hasOpenChoice) {
                // if the response is not found in the choices, it must be the open choice,
                // which is always the last choice
                selectedChoiceIndex = question.choices.length - 1;
            }
            if ((_c = (_b = question.branching) === null || _b === void 0 ? void 0 : _b.responseValues) === null || _c === void 0 ? void 0 : _c.hasOwnProperty(selectedChoiceIndex)) {
                var nextStep = question.branching.responseValues[selectedChoiceIndex];
                // Specific question
                if (Number.isInteger(nextStep)) {
                    return nextStep;
                }
                if (nextStep === posthog_surveys_types_1.SurveyQuestionBranchingType.End) {
                    return posthog_surveys_types_1.SurveyQuestionBranchingType.End;
                }
                return nextQuestionIndex;
            }
        }
        else if (question.type === posthog_surveys_types_1.SurveyQuestionType.Rating) {
            if (typeof response !== 'number' || !Number.isInteger(response)) {
                throw new Error('The response type must be an integer');
            }
            var ratingBucket = getRatingBucketForResponseValue(response, question.scale);
            if ((_e = (_d = question.branching) === null || _d === void 0 ? void 0 : _d.responseValues) === null || _e === void 0 ? void 0 : _e.hasOwnProperty(ratingBucket)) {
                var nextStep = question.branching.responseValues[ratingBucket];
                // Specific question
                if (Number.isInteger(nextStep)) {
                    return nextStep;
                }
                if (nextStep === posthog_surveys_types_1.SurveyQuestionBranchingType.End) {
                    return posthog_surveys_types_1.SurveyQuestionBranchingType.End;
                }
                return nextQuestionIndex;
            }
        }
        return nextQuestionIndex;
    }
    logger.warn('Falling back to next question index due to unexpected branching type');
    return nextQuestionIndex;
}
//# sourceMappingURL=survey-branching.js.map