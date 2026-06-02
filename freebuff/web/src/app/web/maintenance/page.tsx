import { Wrench } from "lucide-react";

export default function MaintenancePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="px-6 py-12 text-center">
        <div className="mb-8">
          <Wrench className="mx-auto h-24 w-24 text-slate-400" />
        </div>
        <h1 className="mb-4 text-4xl font-bold text-slate-900">
          Down for Maintenance
        </h1>
        <p className="mx-auto mb-8 max-w-md text-lg text-slate-600">
          We're currently performing scheduled maintenance to improve your
          experience. We'll be back online shortly.
        </p>
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Expected to be back online soon
          </p>
          <div className="flex justify-center space-x-3">
            <div
              className="h-2 w-2 animate-bounce rounded-full bg-slate-400"
              style={{ animationDelay: "0ms" }}
            ></div>
            <div
              className="h-2 w-2 animate-bounce rounded-full bg-slate-400"
              style={{ animationDelay: "150ms" }}
            ></div>
            <div
              className="h-2 w-2 animate-bounce rounded-full bg-slate-400"
              style={{ animationDelay: "300ms" }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
}
