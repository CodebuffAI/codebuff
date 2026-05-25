import { Suspense } from "react";
import EarnAdminPanel from "@/components/earn/EarnAdminPanel";

export default function EarnAdminPage() {
  return (
    <Suspense fallback={null}>
      <EarnAdminPanel />
    </Suspense>
  );
}
