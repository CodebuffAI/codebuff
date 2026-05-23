import type { ProjectGraph } from '../../../config/project-graph';
import type { PluginConfiguration } from '../../../config/nx-json';
import type { CreateDependenciesContext, CreateMetadataContext, CreateNodesContextV2, PreTasksExecutionContext, PostTasksExecutionContext } from '../public-api';
import type { LoadedNxPlugin } from '../loaded-nx-plugin';
import type { Serializable } from 'child_process';
import type { Socket } from 'net';
export interface PluginWorkerLoadMessage {
    type: 'load';
    payload: {
        plugin: PluginConfiguration;
        root: string;
        name: string;
        pluginPath: string;
        shouldRegisterTSTranspiler: boolean;
    };
}
export interface PluginWorkerLoadResult {
    type: 'load-result';
    payload: {
        name: string;
        include?: string[];
        exclude?: string[];
        createNodesPattern: string;
        hasCreateDependencies: boolean;
        hasProcessProjectGraph: boolean;
        hasCreateMetadata: boolean;
        hasPreTasksExecution: boolean;
        hasPostTasksExecution: boolean;
        success: true;
    } | {
        success: false;
        error: Error;
    };
}
export interface PluginWorkerCreateNodesMessage {
    type: 'createNodes';
    payload: {
        configFiles: string[];
        context: CreateNodesContextV2;
        tx: string;
    };
}
export interface PluginWorkerCreateNodesResult {
    type: 'createNodesResult';
    payload: {
        success: true;
        result: Awaited<ReturnType<LoadedNxPlugin['createNodes'][1]>>;
        tx: string;
    } | {
        success: false;
        error: Error;
        tx: string;
    };
}
export interface PluginCreateDependenciesMessage {
    type: 'createDependencies';
    payload: {
        context: CreateDependenciesContext;
        tx: string;
    };
}
export interface PluginCreateMetadataMessage {
    type: 'createMetadata';
    payload: {
        graph: ProjectGraph;
        context: CreateMetadataContext;
        tx: string;
    };
}
export interface PluginCreateDependenciesResult {
    type: 'createDependenciesResult';
    payload: {
        dependencies: Awaited<ReturnType<LoadedNxPlugin['createDependencies']>>;
        success: true;
        tx: string;
    } | {
        success: false;
        error: Error;
        tx: string;
    };
}
export interface PluginCreateMetadataResult {
    type: 'createMetadataResult';
    payload: {
        metadata: Awaited<ReturnType<LoadedNxPlugin['createMetadata']>>;
        success: true;
        tx: string;
    } | {
        success: false;
        error: Error;
        tx: string;
    };
}
export interface PluginWorkerPreTasksExecutionMessage {
    type: 'preTasksExecution';
    payload: {
        tx: string;
        context: PreTasksExecutionContext;
    };
}
export interface PluginWorkerPreTasksExecutionMessageResult {
    type: 'preTasksExecutionResult';
    payload: {
        tx: string;
        success: true;
        mutations: NodeJS.ProcessEnv;
    } | {
        success: false;
        error: Error;
        tx: string;
    };
}
export interface PluginWorkerPostTasksExecutionMessage {
    type: 'postTasksExecution';
    payload: {
        tx: string;
        context: PostTasksExecutionContext;
    };
}
export interface PluginWorkerPostTasksExecutionMessageResult {
    type: 'postTasksExecutionResult';
    payload: {
        tx: string;
        success: true;
    } | {
        success: false;
        error: Error;
        tx: string;
    };
}
export type PluginWorkerMessage = PluginWorkerLoadMessage | PluginWorkerCreateNodesMessage | PluginCreateDependenciesMessage | PluginCreateMetadataMessage | PluginWorkerPreTasksExecutionMessage | PluginWorkerPostTasksExecutionMessage;
export type PluginWorkerResult = PluginWorkerLoadResult | PluginWorkerCreateNodesResult | PluginCreateDependenciesResult | PluginCreateMetadataResult | PluginWorkerPreTasksExecutionMessageResult | PluginWorkerPostTasksExecutionMessageResult;
export declare function isPluginWorkerMessage(message: Serializable): message is PluginWorkerMessage;
export declare function isPluginWorkerResult(message: Serializable): message is PluginWorkerResult;
type MaybePromise<T> = T | Promise<T>;
type MessageHandlerReturn<T extends PluginWorkerMessage | PluginWorkerResult> = T extends PluginWorkerResult ? MaybePromise<PluginWorkerMessage | void> : MaybePromise<PluginWorkerResult | void>;
export declare function consumeMessage<T extends PluginWorkerMessage | PluginWorkerResult>(socket: Socket, raw: T, handlers: {
    [K in T['type']]: (payload: Extract<T, {
        type: K;
    }>['payload']) => MessageHandlerReturn<T>;
}): Promise<void>;
export declare function sendMessageOverSocket(socket: Socket, message: PluginWorkerMessage | PluginWorkerResult): void;
export {};
//# sourceMappingURL=messaging.d.ts.map