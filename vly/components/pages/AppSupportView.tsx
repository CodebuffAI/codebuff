"use client";

import { useState } from "react";
import { Id } from "@/convex/_generated/dataModel";
import TicketDetailDialog from "@/components/TicketDetailDialog";
import { IntegrationApprovalDialog } from "@/components/IntegrationApprovalDialog";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { AdminNavbar } from "@/components/AdminNavbar";
import { TicketsView } from "./TicketsView";
import { AdminIntegrationsView } from "./AdminIntegrationsView";

export default function AppAndSupportViewDashboard() {
  const [activeTab, setActiveTab] = useState<string>("tickets");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [integrationStatusFilter, setIntegrationStatusFilter] =
    useState<string>("pending");
  const [selectedTicketId, setSelectedTicketId] =
    useState<Id<"tickets"> | null>(null);
  const [selectedIntegration, setSelectedIntegration] = useState<any | null>(
    null,
  );

  return (
    <div className="min-h-screen bg-background">
      <AdminNavbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        hideAdminManager={true}
      />
      <main className="mx-auto max-w-7xl px-8 py-12">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsContent value="tickets">
            <TicketsView
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              setSelectedTicketId={setSelectedTicketId}
            />
          </TabsContent>

          <TabsContent value="integrations">
            <AdminIntegrationsView
              integrationStatusFilter={integrationStatusFilter}
              setIntegrationStatusFilter={setIntegrationStatusFilter}
              setSelectedIntegration={setSelectedIntegration}
            />
          </TabsContent>
        </Tabs>
      </main>
      <TicketDetailDialog
        ticketId={selectedTicketId}
        open={selectedTicketId !== null}
        onOpenChange={(open) => !open && setSelectedTicketId(null)}
      />
      <IntegrationApprovalDialog
        integration={selectedIntegration}
        open={selectedIntegration !== null}
        onOpenChange={(open) => !open && setSelectedIntegration(null)}
        onUpdate={() => {
          // Refresh the integration list
          setSelectedIntegration(null);
        }}
      />
    </div>
  );
}
