"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registeredProjectGraphListenerSockets = void 0;
exports.removeRegisteredProjectGraphListenerSocket = removeRegisteredProjectGraphListenerSocket;
exports.hasRegisteredProjectGraphListenerSockets = hasRegisteredProjectGraphListenerSockets;
exports.notifyProjectGraphListenerSockets = notifyProjectGraphListenerSockets;
const server_1 = require("./server");
exports.registeredProjectGraphListenerSockets = [];
function removeRegisteredProjectGraphListenerSocket(socket) {
    exports.registeredProjectGraphListenerSockets =
        exports.registeredProjectGraphListenerSockets.filter((s) => s !== socket);
}
function hasRegisteredProjectGraphListenerSockets() {
    return exports.registeredProjectGraphListenerSockets.length > 0;
}
async function notifyProjectGraphListenerSockets(projectGraph, sourceMaps) {
    if (!hasRegisteredProjectGraphListenerSockets()) {
        return;
    }
    await Promise.all(exports.registeredProjectGraphListenerSockets.map((socket) => (0, server_1.handleResult)(socket, 'PROJECT_GRAPH_UPDATED', () => Promise.resolve({
        description: 'Project graph updated',
        response: JSON.stringify({ projectGraph, sourceMaps }),
    }))));
}
