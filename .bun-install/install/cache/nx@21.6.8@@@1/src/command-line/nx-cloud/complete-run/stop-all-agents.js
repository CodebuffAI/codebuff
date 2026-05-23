"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stopAllAgentsHandler = stopAllAgentsHandler;
const utils_1 = require("../utils");
function stopAllAgentsHandler(args) {
    return (0, utils_1.executeNxCloudCommand)('stop-all-agents', args.verbose);
}
