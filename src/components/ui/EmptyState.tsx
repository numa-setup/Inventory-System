import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-12 text-center",
        className,
      )}
    >
      {Icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-text-tertiary">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <h3 className="font-heading text-base font-semibold text-text-primary">
        {title}
      </h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-text-tertiary">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
