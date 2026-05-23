"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var rrweb_record_1 = require("@posthog/rrweb-record");
var rrweb_plugin_console_record_1 = require("@posthog/rrweb-plugin-console-record");
var globals_1 = require("../utils/globals");
var network_plugin_1 = require("../extensions/replay/external/network-plugin");
var lazy_loaded_session_recorder_1 = require("../extensions/replay/external/lazy-loaded-session-recorder");
globals_1.assignableWindow.__PosthogExtensions__ = globals_1.assignableWindow.__PosthogExtensions__ || {};
globals_1.assignableWindow.__PosthogExtensions__.rrwebPlugins = { getRecordConsolePlugin: rrweb_plugin_console_record_1.getRecordConsolePlugin, getRecordNetworkPlugin: network_plugin_1.getRecordNetworkPlugin };
globals_1.assignableWindow.__PosthogExtensions__.rrweb = {
    record: rrweb_record_1.record,
    version: 'v2',
    wasMaxDepthReached: rrweb_record_1.wasMaxDepthReached,
    resetMaxDepthState: rrweb_record_1.resetMaxDepthState,
};
globals_1.assignableWindow.__PosthogExtensions__.initSessionRecording = function (ph) { return new lazy_loaded_session_recorder_1.LazyLoadedSessionRecording(ph); };
exports.default = rrweb_record_1.record;
//# sourceMappingURL=posthog-recorder.js.map