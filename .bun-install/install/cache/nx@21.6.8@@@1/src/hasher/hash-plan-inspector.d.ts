import { NxJsonConfiguration } from '../config/nx-json';
import { ProjectGraph } from '../config/project-graph';
import type { Target } from '../command-line/run/run';
import { TargetDependencies } from '../config/nx-json';
import { TargetDependencyConfig } from '../config/workspace-json-project-json';
export declare class HashPlanInspector {
    private projectGraph;
    private readonly workspaceRootPath;
    private readonly projectGraphRef;
    private planner;
    private inspector;
    private readonly nxJson;
    constructor(projectGraph: ProjectGraph, workspaceRootPath?: string, nxJson?: NxJsonConfiguration);
    init(): Promise<void>;
    /**
     * This is a lower level method which will inspect the hash plan for a set of tasks.
     */
    inspectHashPlan(projectNames: string[], targets: string[], configuration?: string, overrides?: Object, extraTargetDependencies?: TargetDependencies, excludeTaskDependencies?: boolean): Record<string, string[]>;
    /**
     * This inspects tasks involved in the execution of a task, including its dependencies by default.
     */
    inspectTask({ project, target, configuration }: Target, parsedArgs?: {
        [k: string]: any;
    }, extraTargetDependencies?: Record<string, (TargetDependencyConfig | string)[]>, excludeTaskDependencies?: boolean): Record<string, string[]>;
}
//# sourceMappingURL=hash-plan-inspector.d.ts.map