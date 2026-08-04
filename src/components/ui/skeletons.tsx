import { cn } from "../common/cn";

interface SkeletonBlockProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonBlockProps) {
  return <div className={cn("animate-pulse-soft rounded-[var(--radius-lg)] bg-white/10", className)} />;
}

export function CardSkeleton() {
  return (
    <div className="surface-panel animate-fade-in p-6 shadow-[var(--shadow-soft)]">
      <div className="space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}

export function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="surface-panel flex items-center gap-3 p-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
