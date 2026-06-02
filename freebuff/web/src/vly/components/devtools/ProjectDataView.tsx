import React from "react";
import { ProjectMetaInfo } from "./ProjectMetaInfo";
import { ProjectMessagesTable } from "./ProjectMessagesTable";
import { WorkflowTraceInfo } from "./WorkflowTraceInfo";

export const ProjectDataView = ({
  projectInspectorData,
  workflowTrace,
}: {
  projectInspectorData: any;
  workflowTrace: any;
}) => {
  if (projectInspectorData === undefined) {
    return <div className="text-sm text-gray-500">Loading project...</div>;
  }
  if (projectInspectorData?.error) {
    return (
      <div className="text-sm text-red-500">{projectInspectorData.error}</div>
    );
  }
  return (
    <div className="mt-4">
      {projectInspectorData.projectData && (
        <div className="mb-4 rounded border bg-muted p-4">
          <ProjectMetaInfo
            projectData={projectInspectorData.projectData}
            entryPoints={projectInspectorData.entryPoints}
          />
          <ProjectMessagesTable messages={projectInspectorData.messages} />
        </div>
      )}
      <WorkflowTraceInfo workflowTrace={workflowTrace} />
    </div>
  );
};
