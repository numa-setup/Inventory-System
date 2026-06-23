"use client";

import { useEffect } from "react";
import { logError } from "@hamza/shared/log";

// Last-resort boundary if the root layout itself throws. Must render <html>/<body>.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { logError(error, { digest: error.digest, where: "global" }); }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h2 style={{ margin: 0 }}>Something went wrong</h2>
          <p style={{ color: "#667085", fontSize: 14 }}>Please reload the app.</p>
          <button onClick={reset} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 8, border: "none", background: "#1863D5", color: "#fff", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
