"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NxKeyNotInstalledError = void 0;
exports.createNxKeyLicenseeInformation = createNxKeyLicenseeInformation;
exports.printNxKey = printNxKey;
exports.getNxKeyInformation = getNxKeyInformation;
const logger_1 = require("./logger");
const package_manager_1 = require("./package-manager");
const workspace_root_1 = require("./workspace-root");
function createNxKeyLicenseeInformation(nxKey) {
    if ('isPowerpack' in nxKey && nxKey.isPowerpack) {
        return `Licensed to ${nxKey.organizationName} for ${nxKey.seatCount} user${nxKey.seatCount > 1 ? 's' : ''} in ${nxKey.workspaceCount === 9999
            ? 'an unlimited number of'
            : nxKey.workspaceCount} workspace${nxKey.workspaceCount > 1 ? 's' : ''}.`;
    }
    else {
        return `Licensed to ${nxKey.organizationName}.`;
    }
}
async function printNxKey() {
    try {
        const key = await getNxKeyInformation();
        if (key) {
            logger_1.logger.log(createNxKeyLicenseeInformation(key));
        }
    }
    catch { }
}
async function getNxKeyInformation() {
    try {
        const { getPowerpackLicenseInformation, getPowerpackLicenseInformationAsync, } = (await Promise.resolve().then(() => require('@nx/powerpack-license')));
        return (getPowerpackLicenseInformationAsync ?? getPowerpackLicenseInformation)(workspace_root_1.workspaceRoot);
    }
    catch (e) {
        try {
            const { getNxKeyInformationAsync } = (await Promise.resolve().then(() => require('@nx/key')));
            return getNxKeyInformationAsync(workspace_root_1.workspaceRoot);
        }
        catch (e) {
            if ('code' in e && e.code === 'MODULE_NOT_FOUND') {
                throw new NxKeyNotInstalledError(e);
            }
            throw e;
        }
    }
}
class NxKeyNotInstalledError extends Error {
    constructor(e) {
        super(`The "@nx/key" package is needed to use Nx key enabled features. Please install it with ${(0, package_manager_1.getPackageManagerCommand)().addDev} @nx/key`, { cause: e });
    }
}
exports.NxKeyNotInstalledError = NxKeyNotInstalledError;
