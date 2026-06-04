"use client";
import React from "react";
import { useSignedInUser } from "@/vly/hooks/use-user";
import NotFound from "@/app/web/not-found";
import AdminDashboard from "@/vly/components/pages/AppSupportView";
import { Loader2 } from "lucide-react";

const AppAndSupportViewDashboard = () => {
  const user = useSignedInUser();
  if (user === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-lg text-muted-foreground">Loading ...</p>
        </div>
      </div>
    );
  }
  return user && user.role === "god" ? <AdminDashboard /> : <NotFound />;
};

export default AppAndSupportViewDashboard;
