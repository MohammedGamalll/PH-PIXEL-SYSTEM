import type { ReactNode } from "react";

export function DataCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={"rounded-lg p-4 md:p-6 " + className}
      style={{
        backgroundColor: "#f8fafc",
        border: "1px solid #d1d5db",
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06)",
      }}
    >
      {children}
    </div>
  );
}
