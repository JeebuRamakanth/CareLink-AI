import type { ReactNode } from "react";
import { Button } from "./Button";
import { Card } from "./Card";
import { cn } from "../common/cn";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, icon, className }: EmptyStateProps) {
  return (
    <Card className={cn("text-center", className)}>
      <div className="flex flex-col items-center gap-4">
        {icon ? <div className="flex size-14 items-center justify-center rounded-full border border-white/10 bg-white/10 text-2xl">{icon}</div> : null}
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          {description ? <p className="max-w-md text-sm text-ink-300">{description}</p> : null}
        </div>
        {action ? <div className="pt-2">{action}</div> : null}
      </div>
    </Card>
  );
}

interface ErrorStateProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function ErrorState({ title = "Something went wrong", description = "We could not load this view. Please try again in a moment.", action, className }: ErrorStateProps) {
  return (
    <Card className={cn("text-center", className)}>
      <div className="flex flex-col items-center gap-4">
        <div className="flex size-14 items-center justify-center rounded-full border border-rose-400/20 bg-rose-500/15 text-2xl text-rose-200">!</div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="max-w-md text-sm text-ink-300">{description}</p>
        </div>
        {action ? <div className="pt-2">{action}</div> : null}
      </div>
    </Card>
  );
}

export function RetryState({ title, description, onRetry }: { title?: string; description?: string; onRetry?: () => void }) {
  return (
    <ErrorState
      title={title}
      description={description}
      action={onRetry ? <Button variant="secondary" onClick={onRetry}>Try again</Button> : undefined}
    />
  );
}
