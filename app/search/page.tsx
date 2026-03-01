import { Suspense } from "react";
import { SearchLanding } from "@/components/home/SearchLanding";
import { ANSMinimalFooter } from "@/components/home/ANSMinimalFooter";

export default function SearchPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1">
        <Suspense
          fallback={
            <div className="min-h-[60vh] flex items-center justify-center text-[var(--text-tertiary)]">
              Loading search...
            </div>
          }
        >
          <SearchLanding basePath="/search" />
        </Suspense>
      </div>
      <ANSMinimalFooter variant="dark" />
    </div>
  );
}
