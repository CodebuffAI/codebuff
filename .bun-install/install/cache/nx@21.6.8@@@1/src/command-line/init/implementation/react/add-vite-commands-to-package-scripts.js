"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addViteCommandsToPackageScripts = addViteCommandsToPackageScripts;
const fileutils_1 = require("../../../../utils/fileutils");
function addViteCommandsToPackageScripts(appName, isStandalone) {
    const packageJsonPath = isStandalone
        ? 'package.json'
        : `apps/${appName}/package.json`;
    const packageJson = (0, fileutils_1.readJsonFile)(packageJsonPath);
    packageJson.scripts = {
        ...packageJson.scripts,
        // These should be replaced by the vite init generator later.
        start: 'vite',
        test: 'vitest',
        dev: 'vite',
        build: 'vite build',
        eject: undefined,
    };
    (0, fileutils_1.writeJsonFile)(packageJsonPath, packageJson, { spaces: 2 });
}
