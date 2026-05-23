"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fixCiHandler = fixCiHandler;
const utils_1 = require("../utils");
function fixCiHandler(args) {
    return (0, utils_1.executeNxCloudCommand)('fix-ci', args.verbose);
}
