"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addNxToCraRepo = addNxToCraRepo;
const child_process_1 = require("child_process");
const path_1 = require("path");
const fs_1 = require("fs");
const fileutils_1 = require("../../../../utils/fileutils");
const output_1 = require("../../../../utils/output");
const package_manager_1 = require("../../../../utils/package-manager");
const check_for_custom_webpack_setup_1 = require("./check-for-custom-webpack-setup");
const read_name_from_package_json_1 = require("./read-name-from-package-json");
const rename_js_to_jsx_1 = require("./rename-js-to-jsx");
const write_vite_config_1 = require("./write-vite-config");
const write_vite_index_html_1 = require("./write-vite-index-html");
async function addNxToCraRepo(_options) {
    if (!_options.force) {
        (0, check_for_custom_webpack_setup_1.checkForCustomWebpackSetup)();
    }
    const options = await normalizeOptions(_options);
    await addBundler(options);
    (0, fs_1.appendFileSync)(`.gitignore`, '\nnode_modules');
    (0, fs_1.appendFileSync)(`.gitignore`, '\ndist');
    installDependencies(options);
    // Vite expects index.html to be in the root as the main entry point.
    const indexPath = options.isStandalone
        ? 'index.html'
        : (0, path_1.join)('apps', options.reactAppName, 'index.html');
    const oldIndexPath = options.isStandalone
        ? (0, path_1.join)('public', 'index.html')
        : (0, path_1.join)('apps', options.reactAppName, 'public', 'index.html');
    output_1.output.note({
        title: `A new ${indexPath} has been created. Compare it to the previous ${oldIndexPath} file and make any changes needed, then delete the previous file.`,
    });
    if (_options.force) {
        output_1.output.note({
            title: `Using --force converts projects with custom Webpack setup. You will need to manually update your vite.config.js file to match the plugins used in your old Webpack configuration.`,
        });
    }
}
function installDependencies(options) {
    const dependencies = [
        '@rollup/plugin-replace',
        '@testing-library/jest-dom',
        '@vitejs/plugin-react',
        'eslint-config-react-app',
        'web-vitals',
        'jest-watch-typeahead',
        'vite',
        'vitest',
    ];
    (0, child_process_1.execSync)(`${options.pmc.addDev} ${dependencies.join(' ')}`, {
        stdio: [0, 1, 2],
        windowsHide: false,
    });
}
async function normalizeOptions(options) {
    const packageManager = (0, package_manager_1.detectPackageManager)();
    const pmc = (0, package_manager_1.getPackageManagerCommand)(packageManager);
    const appIsJs = !(0, fileutils_1.fileExists)(`tsconfig.json`);
    const reactAppName = (0, read_name_from_package_json_1.readNameFromPackageJson)();
    const isStandalone = !options.integrated;
    return {
        ...options,
        packageManager,
        pmc,
        appIsJs,
        reactAppName,
        isStandalone,
    };
}
async function addBundler(options) {
    const { addViteCommandsToPackageScripts } = await Promise.resolve().then(() => require('./add-vite-commands-to-package-scripts'));
    addViteCommandsToPackageScripts(options.reactAppName, options.isStandalone);
    (0, write_vite_config_1.writeViteConfig)(options.reactAppName, options.isStandalone, options.appIsJs);
    (0, write_vite_index_html_1.writeViteIndexHtml)(options.reactAppName, options.isStandalone, options.appIsJs);
    await (0, rename_js_to_jsx_1.renameJsToJsx)(options.reactAppName, options.isStandalone);
}
