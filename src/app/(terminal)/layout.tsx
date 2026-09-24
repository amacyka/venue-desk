import { Suspense } from "react";
import { Shell } from "@/components/terminal/shell";
import { CardSkeleton } from "@/components/terminal/widgets";

export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-background p-6">
          <CardSkeleton />
        </div>
      }
    >
      <Shell>{children}</Shell>
    </Suspense>
  );
}
