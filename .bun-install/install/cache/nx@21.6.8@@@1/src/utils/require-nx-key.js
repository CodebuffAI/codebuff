"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireNxKey = requireNxKey;
const child_process_1 = require("child_process");
const package_manager_1 = require("./package-manager");
async function requireNxKey() {
    // @ts-ignore
    return Promise.resolve().then(() => require('@nx/key')).catch(async (e) => {
        if ('code' in e && e.code === 'MODULE_NOT_FOUND') {
            try {
                (0, child_process_1.execSync)(`${(0, package_manager_1.getPackageManagerCommand)().addDev} @nx/key@latest`, {
                    windowsHide: false,
                });
                // @ts-ignore
                return await Promise.resolve().then(() => require('@nx/key'));
            }
            catch (e) {
                throw new Error('Failed to install @nx/key. Please install @nx/key and try again.');
            }
        }
    });
}
