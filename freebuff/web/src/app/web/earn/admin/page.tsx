import { Suspense } from "react";
import EarnAdminPanel from "@/vly/components/earn/EarnAdminPanel";

export default function EarnAdminPage() {
  return (
    <Suspense fallback={null}>
      <EarnAdminPanel />
    </Suspense>
  );
}
