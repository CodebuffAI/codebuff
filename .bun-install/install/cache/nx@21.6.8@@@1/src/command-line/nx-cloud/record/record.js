"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordHandler = recordHandler;
const utils_1 = require("../utils");
function recordHandler(args) {
    return (0, utils_1.executeNxCloudCommand)('record', args.verbose);
}
