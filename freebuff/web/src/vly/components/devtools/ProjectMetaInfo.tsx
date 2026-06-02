import React from "react";

export function ProjectMetaInfo({
  projectData,
  entryPoints,
}: {
  projectData: any;
  entryPoints: any[];
}) {
  return (
    <div className="mb-4">
      <div className="mb-2">
        <span className="font-semibold">Project:</span>{" "}
        {projectData?.name || projectData?.semantic_identifier}
      </div>
      <div className="mb-2">
        <span className="font-semibold">State:</span> {projectData?.state}
      </div>
      <div className="mb-2">
        <span className="font-semibold">Active Workflow ID:</span>{" "}
        {projectData?.active_workflow_id}
      </div>
      <div className="mb-2">
        <strong>Entry Points:</strong>
        <ul>
          {entryPoints?.map((ep: any) => (
            <li key={ep._id}>{ep.page?.page_title || ep._id}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
