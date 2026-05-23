"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIgnoreObject = getIgnoreObject;
const ignore_1 = require("ignore");
const fileutils_1 = require("./fileutils");
const workspace_root_1 = require("./workspace-root");
function getIgnoreObject(root = workspace_root_1.workspaceRoot) {
    const ig = (0, ignore_1.default)();
    ig.add((0, fileutils_1.readFileIfExisting)(`${root}/.gitignore`));
    ig.add((0, fileutils_1.readFileIfExisting)(`${root}/.nxignore`));
    return ig;
}
