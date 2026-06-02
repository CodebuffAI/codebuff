import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";
import { WorkflowInspector } from "./WorkflowInspector";
import { FeatureFlagsManager } from "./FeatureFlagsManager";

const tabs = [
  { key: "workflow", label: "Workflow Inspector" },
  { key: "flags", label: "Feature Flags" },
];

const Devtools: React.FC = () => {
  const [tab, setTab] = useState("workflow");
  return (
    <div className="p-8">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Devtools</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-2 flex gap-4">
            {tabs.map((t) => (
              <button
                key={t.key}
                className={`rounded border-b-2 px-4 py-2 font-semibold transition-colors duration-150 ${
                  tab === t.key
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-transparent text-gray-600 hover:bg-muted"
                }`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
      {tab === "workflow" && <WorkflowInspector />}
      {tab === "flags" && <FeatureFlagsManager />}
    </div>
  );
};

export default Devtools;
export { WorkflowInspector, FeatureFlagsManager };
