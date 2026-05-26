"use client";

import React from "react";
import { Home, AlertTriangle } from "lucide-react";
import { Button } from "@/vly/components/ui/button";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-background bg-purple-50 font-sans">
      {/* Background Image */}
      <div className="fixed inset-0 z-0">
        <img
          src="/sunset_bg.png"
          alt="Background"
          className="h-full w-full object-cover opacity-10"
        />
      </div>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center bg-transparent p-4">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-white/20 bg-white/40 p-8 text-center shadow-lg">
            {/* Error Icon */}
            <div className="mb-4 flex justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
                <AlertTriangle className="h-6 w-6 text-purple-500" />
              </div>
            </div>

            {/* Main Heading */}
            <h1 className="mb-2 text-xl font-semibold text-gray-900">
              404 - Page Not Found
            </h1>

            {/* Error Message */}
            <p className="mb-6 text-sm text-gray-600">
              The page you're looking for doesn't exist.
              <br />
              Do you want to return home?
            </p>

            {/* Home Button */}
            <Link href="/web">
              <Button>
                <Home className="mr-2 h-4 w-4" />
                <span className="text-sm">Return Home</span>
              </Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
