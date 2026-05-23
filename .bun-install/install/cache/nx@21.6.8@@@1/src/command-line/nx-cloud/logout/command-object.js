"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.yargsLogoutCommand = void 0;
const shared_options_1 = require("../../yargs-utils/shared-options");
exports.yargsLogoutCommand = {
    command: 'logout',
    describe: 'Logout from Nx Cloud. This command is an alias for `nx-cloud logout`.',
    builder: (yargs) => (0, shared_options_1.withVerbose)(yargs)
        .help(false)
        .showHelpOnFail(false)
        .option('help', { describe: 'Show help.', type: 'boolean' }),
    handler: async (args) => {
        process.exit(await (await Promise.resolve().then(() => require('./logout'))).logoutHandler(args));
    },
};
