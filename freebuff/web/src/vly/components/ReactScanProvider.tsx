"use client";

import { useEffect } from "react";

export function ReactScanProvider() {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      const urlParams = new URLSearchParams(window.location.search);
      const enableScan = urlParams.get("scan") === "true";

      if (enableScan) {
        import("react-scan")
          .then(({ scan }) => {
            scan({
              enabled: true,
              showToolbar: true,
            });
            console.log("🔍 React Scan enabled for performance monitoring");
          })
          .catch((error) => {
            console.error("Failed to initialize React Scan:", error);
          });
      }
    }
  }, []);

  return null;
}
