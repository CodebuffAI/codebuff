"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startCiRunHandler = startCiRunHandler;
const utils_1 = require("../utils");
function startCiRunHandler(args) {
    return (0, utils_1.executeNxCloudCommand)('start-ci-run', args.verbose);
}
