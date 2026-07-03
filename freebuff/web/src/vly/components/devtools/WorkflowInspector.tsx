import React from "react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";

// Helper to extract semantic identifier from input (plain or URL)
function extractSemanticIdentifier(input: string): string {
  // TODO: should extract from subdomains as well
  // Try to match the last part of the URL, or just return the input
  const match = input.match(/([a-z0-9-]+)$/i);
  return match ? match[1] : input;
}

export const WorkflowInspector: React.FC = () => {
  // Fetch all projects for the user
  const projects = useQuery(api.project.getUserProjects, {});

  const [projectIdInput, setProjectIdInput] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);

  // Fetch project inspector data
  const _projectInspectorData = useQuery(
    api.project.getProjectInspectorData,
    projectId ? { semanticIdentifier: projectId } : "skip",
  );
  // // Fetch workflow trace NO LONGER WORKS
  // const workflowTrace = useQuery(
  //   api.workflow_agent.workflow.getWorkflowTraceForProjectBySemanticId,
  //   projectId ? { semanticIdentifier: projectId } : "skip",
  // );

  return (
    <div className="p-8">
      <h1 className="mb-4 text-2xl font-bold">Workflow Inspector</h1>

      <div className="flex gap-8">
        {/* Left Column: Controls */}
        <div className="flex w-1/3 flex-col gap-6">
          {/* Project Inspector by Semantic Identifier */}
          <div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setProjectId(extractSemanticIdentifier(projectIdInput.trim()));
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                placeholder="Enter project semantic identifier..."
                value={projectIdInput}
                onChange={(e) => setProjectIdInput(e.target.value)}
                className="w-full rounded border px-2 py-1 text-sm"
              />
              <button
                type="submit"
                className="rounded bg-blue-600 px-3 py-1 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Inspect
              </button>
              {projectId && (
                <button
                  type="button"
                  className="ml-2 rounded bg-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-300"
                  onClick={() => {
                    setProjectId(null);
                    setProjectIdInput("");
                  }}
                >
                  Clear
                </button>
              )}
            </form>
          </div>

          {/* Project List */}
          <Card>
            <CardHeader>
              <CardTitle>Projects</CardTitle>
            </CardHeader>
            <CardContent>
              <ul>
                {projects?.map((project: any) => (
                  <li
                    key={project._id}
                    className={`cursor-pointer rounded p-2 hover:bg-muted/50 ${
                      projectId === project.semantic_identifier
                        ? "bg-muted"
                        : ""
                    }`}
                    onClick={() => {
                      const semanticId = project.semantic_identifier;
                      setProjectId(semanticId);
                      setProjectIdInput(semanticId);
                    }}
                  >
                    {project.name || project.semantic_identifier}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Data View */}
        {/* <div className="flex-1">
          {projectId && (
            <ProjectDataView
              projectInspectorData={projectInspectorData}
              workflowTrace={workflowTrace}
            />
          )}
        </div> */}
      </div>
    </div>
  );
};

export default WorkflowInspector;
