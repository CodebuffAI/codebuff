"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateHashForCreateNodes = calculateHashForCreateNodes;
exports.calculateHashesForCreateNodes = calculateHashesForCreateNodes;
const path_1 = require("path");
const devkit_exports_1 = require("nx/src/devkit-exports");
const devkit_internals_1 = require("nx/src/devkit-internals");
async function calculateHashForCreateNodes(projectRoot, options, context, additionalGlobs = []) {
    return (0, devkit_exports_1.hashArray)([
        await (0, devkit_internals_1.hashWithWorkspaceContext)(context.workspaceRoot, [
            (0, path_1.join)(projectRoot, '**/*'),
            ...additionalGlobs,
        ]),
        (0, devkit_internals_1.hashObject)(options),
    ]);
}
async function calculateHashesForCreateNodes(projectRoots, options, context, additionalGlobs = []) {
    if (additionalGlobs.length &&
        additionalGlobs.length !== projectRoots.length) {
        throw new Error('If additionalGlobs is provided, it must be the same length as projectRoots');
    }
    return (0, devkit_internals_1.hashMultiGlobWithWorkspaceContext)(context.workspaceRoot, projectRoots.map((projectRoot, idx) => [
        (0, path_1.join)(projectRoot, '**/*'),
        ...(additionalGlobs.length ? additionalGlobs[idx] : []),
    ])).then((hashes) => {
        return hashes.map((hash) => (0, devkit_exports_1.hashArray)([hash, (0, devkit_internals_1.hashObject)(options)]));
    });
}
