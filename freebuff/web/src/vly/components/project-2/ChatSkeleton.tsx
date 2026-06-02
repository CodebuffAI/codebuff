"use client";

import React from "react";

const UserMessageSkeleton: React.FC = () => (
  <div className="mb-2">
    <div className="flex justify-end">
      <div className="max-w-[280px] rounded-lg border border-gray-200 bg-white p-3">
        <div className="space-y-1.5">
          <div className="h-3 w-full animate-pulse rounded bg-gray-200" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-gray-200" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-gray-200" />
        </div>
      </div>
    </div>
  </div>
);

const AssistantMessageSkeleton: React.FC = () => (
  <div className="mb-2 flex w-full flex-col items-start">
    <div className="w-full space-y-2">
      <div className="h-2 w-14 animate-pulse rounded bg-gray-200" />
      <div className="w-full space-y-1.5">
        <div className="h-3 w-full animate-pulse rounded bg-gray-200" />
        <div className="h-3 w-[90%] animate-pulse rounded bg-gray-200" />
        <div className="h-3 w-[85%] animate-pulse rounded bg-gray-200" />
        <div className="h-3 w-[95%] animate-pulse rounded bg-gray-200" />
      </div>
    </div>
  </div>
);

const AssistantMessageWithCodeSkeleton: React.FC = () => (
  <div className="mb-2 flex w-full flex-col items-start">
    <div className="w-full space-y-2">
      <div className="h-2 w-14 animate-pulse rounded bg-gray-200" />
      <div className="w-full space-y-1.5">
        <div className="h-3 w-full animate-pulse rounded bg-gray-200" />
        <div className="h-3 w-[75%] animate-pulse rounded bg-gray-200" />
      </div>
      <div className="rounded-lg border border-gray-200 bg-slate-50/50 p-3">
        <div className="space-y-1.5">
          <div className="h-2.5 w-full animate-pulse rounded bg-gray-300" />
          <div className="h-2.5 w-[85%] animate-pulse rounded bg-gray-300" />
          <div className="h-2.5 w-[70%] animate-pulse rounded bg-gray-300" />
        </div>
      </div>
    </div>
  </div>
);

export function ChatSkeleton() {
  return (
    <div className="relative flex h-full w-[500px] flex-col overflow-hidden bg-slate-50/70 shadow-[0_0_20px_0_rgba(45,45,45,0.18)] dark:shadow-[0_0_24px_0_rgba(0,0,0,0.65)]">
      {/* Messages Container with realistic conversation flow */}
      <ul className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <li>
          <UserMessageSkeleton />
        </li>
        <li>
          <AssistantMessageSkeleton />
        </li>
        <li>
          <UserMessageSkeleton />
        </li>
        <li>
          <AssistantMessageWithCodeSkeleton />
        </li>
        <li>
          <UserMessageSkeleton />
        </li>
        <li>
          <AssistantMessageSkeleton />
        </li>
        <li>
          <UserMessageSkeleton />
        </li>
        <li>
          <AssistantMessageSkeleton />
        </li>
        <li>
          <UserMessageSkeleton />
        </li>
        <li>
          <AssistantMessageWithCodeSkeleton />
        </li>
        <li>
          <UserMessageSkeleton />
        </li>
        <li>
          <AssistantMessageSkeleton />
        </li>
        <li>
          <UserMessageSkeleton />
        </li>
        <li>
          <AssistantMessageSkeleton />
        </li>
        <li>
          <UserMessageSkeleton />
        </li>
        <li>
          <AssistantMessageWithCodeSkeleton />
        </li>
      </ul>
    </div>
  );
}
