"use client";

import React from "react";

const codingAgents = [
  {
    name: "vly agent 2.0",
    icon: "/favicon.svg",
  },
  {
    name: "Claude Code",
    icon: "https://upload.wikimedia.org/wikipedia/commons/b/b0/Claude_AI_symbol.svg",
  },
  {
    name: "OpenAI Codex",
    icon: "https://www.svgrepo.com/show/306500/openai.svg",
  },
  {
    name: "Gemini CLI",
    icon: "https://google.gallerycdn.vsassets.io/extensions/google/gemini-cli-vscode-ide-companion/0.20.0/1765572429008/Microsoft.VisualStudio.Services.Icons.Default",
  },
];

const infrastructureLogos = [
  {
    name: "Convex",
    icon: "https://www.convex.dev/_next/static/media/logoColor.172b29ec.svg",
    showName: false,
    isLarger: true,
  },
  {
    name: "shadcn",
    icon: "/landing/shadcn_logo.png",
    showName: false,
    isLarger: false,
  },
  {
    name: "React",
    icon: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/React-icon.svg/3840px-React-icon.svg.png",
    showName: true,
    isLarger: false,
  },
  {
    name: "Daytona",
    icon: "/landing/daytona_logo.png",
    showName: false,
    isLarger: false,
  },
];

export const CodingAgentsSection: React.FC = () => {
  return (
    <div className="relative z-10 mx-auto mt-16 max-w-[800px] px-4">
      {/* Coding Agents Section */}
      <h3 className="mb-8 text-center text-xl font-semibold text-gray-900">
        Run the world&apos;s best coding agents
      </h3>

      {/* Coding Agents Grid */}
      <div className="mb-12 flex flex-wrap items-center justify-center gap-6 md:gap-10">
        {codingAgents.map((agent) => (
          <div
            key={agent.name}
            className="flex flex-col items-center gap-2 rounded-xl bg-white/60 px-6 py-4 shadow-sm transition-all hover:bg-white hover:shadow-md"
          >
            <div className="relative h-12 w-12 flex-shrink-0">
              <img
                src={agent.icon}
                alt={agent.name}
                className="h-12 w-12 object-contain"
              />
            </div>
            <span className="text-sm font-medium text-gray-700">
              {agent.name}
            </span>
          </div>
        ))}
      </div>

      {/* Infrastructure Section */}
      <h4 className="mb-6 text-center text-base font-medium text-gray-600">
        Built on unbeatable infrastructure
      </h4>

      {/* Infrastructure Logos */}
      <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
        {infrastructureLogos.map((logo) => (
          <div key={logo.name} className="flex items-center gap-2">
            <div
              className={`relative w-auto flex-shrink-0 ${logo.isLarger ? "h-10" : "h-8"}`}
            >
              <img
                src={logo.icon}
                alt={logo.name}
                className={`${logo.isLarger ? "h-10" : "h-8"} w-auto object-contain`}
              />
            </div>
            {logo.showName && (
              <span className="text-sm font-medium text-gray-700">
                {logo.name}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CodingAgentsSection;
