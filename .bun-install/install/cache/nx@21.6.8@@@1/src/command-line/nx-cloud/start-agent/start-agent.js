"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startAgentHandler = startAgentHandler;
const utils_1 = require("../utils");
function startAgentHandler(args) {
    return (0, utils_1.executeNxCloudCommand)('start-agent', args.verbose);
}
