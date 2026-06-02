"use client";

import React from "react";

export function MessageSkeleton() {
  return (
    <div className="mb-4 flex justify-start">
      <div className="max-w-[80%]">
        <div className="mb-2 flex items-center gap-2">
          <div className="h-6 w-6 animate-pulse rounded-full bg-gray-200" />
          <div className="h-3 w-16 animate-pulse rounded bg-gray-200" />
          <div className="h-3 w-12 animate-pulse rounded bg-gray-200" />
        </div>
        <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-3">
          <div className="h-4 w-full animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-gray-200" />
        </div>
      </div>
    </div>
  );
}
