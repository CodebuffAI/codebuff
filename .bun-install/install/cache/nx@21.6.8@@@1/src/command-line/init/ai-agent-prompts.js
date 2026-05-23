"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.determineAiAgents = determineAiAgents;
const enquirer_1 = require("enquirer");
const is_ci_1 = require("../../utils/is-ci");
const utils_1 = require("../../ai/utils");
async function determineAiAgents(aiAgents, interactive) {
    if (interactive === false || (0, is_ci_1.isCI)()) {
        return aiAgents ?? [];
    }
    if (aiAgents) {
        return aiAgents;
    }
    return await aiAgentsPrompt();
}
async function aiAgentsPrompt() {
    return (await (0, enquirer_1.prompt)([
        {
            name: 'agents',
            message: 'Which AI agents would you like to set up? (space to select, enter to confirm)',
            type: 'multiselect',
            choices: utils_1.supportedAgents.map((a) => ({
                name: a,
                message: utils_1.agentDisplayMap[a],
            })),
        },
    ])).agents;
}
