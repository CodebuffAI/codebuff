"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTsConfigsToJs = updateTsConfigsToJs;
const devkit_exports_1 = require("nx/src/devkit-exports");
function updateTsConfigsToJs(tree, options) {
    let updateConfigPath = null;
    const paths = {
        tsConfig: `${options.projectRoot}/tsconfig.json`,
        tsConfigLib: `${options.projectRoot}/tsconfig.lib.json`,
        tsConfigApp: `${options.projectRoot}/tsconfig.app.json`,
    };
    (0, devkit_exports_1.updateJson)(tree, paths.tsConfig, (json) => {
        if (json.compilerOptions) {
            json.compilerOptions.allowJs = true;
        }
        else {
            json.compilerOptions = { allowJs: true };
        }
        return json;
    });
    if (tree.exists(paths.tsConfigLib)) {
        updateConfigPath = paths.tsConfigLib;
    }
    if (tree.exists(paths.tsConfigApp)) {
        updateConfigPath = paths.tsConfigApp;
    }
    if (updateConfigPath) {
        (0, devkit_exports_1.updateJson)(tree, updateConfigPath, (json) => {
            json.include = uniq([...(json.include ?? []), 'src/**/*.js']);
            json.exclude = uniq([
                ...(json.exclude ?? []),
                'src/**/*.spec.js',
                'src/**/*.test.js',
            ]);
            return json;
        });
    }
    else {
        throw new Error(`project is missing tsconfig.lib.json or tsconfig.app.json`);
    }
}
const uniq = (value) => [...new Set(value)];
