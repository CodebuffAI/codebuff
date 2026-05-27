"use client";

import React from "react";
import { Check, X } from "lucide-react";

const vlyFeatures = [
  "Beautiful Frontend",
  "Fully-managed Backend",
  "Powerful Database",
  "Version Control",
  "Custom Domains",
  "One-click publishing",
  "Realtime Queries",
  "1000+ Integrations",
  "End-to-end Type Safety",
  "Starts at $3",
  "Advanced Coding Agents",
  "AI-first architecture",
  "Production-ready environments",
];

// Features with their competitor comparison
const competitorFeatures = [
  { feature: "Basic AI Designs", hasFeature: true },
  { feature: "Basic backend", hasFeature: true },
  { feature: "Simple Database", hasFeature: true },
  { feature: "Version Control", hasFeature: true },
  { feature: "Custom Domains", hasFeature: true },
  { feature: "One-click Publishing", hasFeature: true },
  { feature: "REST Queries", hasFeature: false },
  { feature: "Few Integrations", hasFeature: false },
  { feature: "No type safety", hasFeature: false },
  { feature: "Starts at $25", hasFeature: false },
  { feature: "Basic Code Generation", hasFeature: false },
  { feature: "AI-last architecture", hasFeature: false },
  { feature: "Basic Dysfunctional Prototypes", hasFeature: false },
];

export const FeatureComparison: React.FC = () => {
  return (
    <div className="relative z-10 mx-auto mt-16 max-w-[800px] px-4">
      <h3 className="mb-8 text-center text-xl font-semibold text-gray-900">
        Why builders choose Freebuff Web
      </h3>

      {/* Table Container with outer border */}
      <div className="overflow-hidden rounded-lg border border-gray-300">
        {/* Header Row */}
        <div className="grid grid-cols-2 border-b-2 border-gray-300 bg-gray-50">
          <div className="flex items-center gap-2 border-r border-gray-300 px-4 py-3">
            <img src="/freebuff-logo.svg" alt="Freebuff Web" className="h-5 w-5" />
            <span className="text-base font-semibold text-gray-900">
              Freebuff Web
            </span>
          </div>
          <div className="flex items-center gap-2 px-4 py-3">
            <span className="text-base font-semibold text-gray-500">
              Others
            </span>
          </div>
        </div>

        {/* Feature Rows */}
        {vlyFeatures.map((feature, index) => (
          <div
            key={index}
            className={`grid grid-cols-2 ${index < vlyFeatures.length - 1 ? "border-b border-gray-300" : ""}`}
          >
            {/* Freebuff Web Feature */}
            <div className="flex items-center gap-3 border-r border-gray-300 px-4 py-3 text-left">
              <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-green-500">
                <Check className="h-3 w-3 text-white" strokeWidth={3} />
              </div>
              <span className="text-sm text-gray-700">{feature}</span>
            </div>

            {/* Competitor Feature */}
            <div className="flex items-center gap-3 px-4 py-3 text-left">
              {competitorFeatures[index]?.hasFeature ? (
                <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-green-500">
                  <Check className="h-3 w-3 text-white" strokeWidth={3} />
                </div>
              ) : (
                <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-red-400">
                  <X className="h-3 w-3 text-white" strokeWidth={3} />
                </div>
              )}
              <span
                className={`text-sm ${competitorFeatures[index]?.hasFeature ? "text-gray-600" : "text-gray-400 line-through"}`}
              >
                {competitorFeatures[index]?.feature}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FeatureComparison;
