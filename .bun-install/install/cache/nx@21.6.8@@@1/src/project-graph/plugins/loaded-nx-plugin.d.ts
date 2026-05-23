import type { ProjectGraph } from '../../config/project-graph';
import { type PluginConfiguration } from '../../config/nx-json';
import type { RawProjectGraphDependency } from '../project-graph-builder';
import type { CreateDependenciesContext, CreateMetadataContext, CreateNodesContextV2, CreateNodesResult, NxPluginV2, PostTasksExecutionContext, PreTasksExecutionContext, ProjectsMetadata } from './public-api';
export declare class LoadedNxPlugin {
    index?: number;
    readonly name: string;
    readonly createNodes?: [
        filePattern: string,
        fn: (matchedFiles: string[], context: CreateNodesContextV2) => Promise<Array<readonly [plugin: string, file: string, result: CreateNodesResult]>>
    ];
    readonly createDependencies?: (context: CreateDependenciesContext) => Promise<RawProjectGraphDependency[]>;
    readonly createMetadata?: (graph: ProjectGraph, context: CreateMetadataContext) => Promise<ProjectsMetadata>;
    readonly preTasksExecution?: (context: PreTasksExecutionContext) => Promise<NodeJS.ProcessEnv>;
    readonly postTasksExecution?: (context: PostTasksExecutionContext) => Promise<void>;
    readonly options?: unknown;
    readonly include?: string[];
    readonly exclude?: string[];
    constructor(plugin: NxPluginV2, pluginDefinition: PluginConfiguration);
}
//# sourceMappingURL=loaded-nx-plugin.d.ts.map