import { ProjectGraph, ProjectGraphExternalNode, ProjectGraphProjectNode } from '../../../config/project-graph';
import { PackageJson } from '../../../utils/package-json';
import { ProjectGraphBuilder } from '../../../project-graph/project-graph-builder';
/**
 * Prune project graph's external nodes and their dependencies
 * based on the pruned package.json
 */
export declare function pruneProjectGraph(graph: ProjectGraph, prunedPackageJson: PackageJson): ProjectGraph;
export declare function findNodeMatchingVersion(graph: ProjectGraph, packageName: string, versionExpr: string): ProjectGraphExternalNode;
export declare function addNodesAndDependencies(graph: ProjectGraph, packageJsonDeps: Record<string, string>, workspacePackages: Map<string, ProjectGraphProjectNode>, builder: ProjectGraphBuilder): void;
export declare function rehoistNodes(graph: ProjectGraph, packageJsonDeps: Record<string, string>, builder: ProjectGraphBuilder): void;
//# sourceMappingURL=project-graph-pruning.d.ts.map