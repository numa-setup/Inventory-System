import { cn } from "@/lib/utils";

export type PillTone =
  | "green"
  | "amber"
  | "coral"
  | "blue"
  | "teal"
  | "purple"
  | "neutral";

const tones: Record<PillTone, string> = {
  green: "bg-green-tile text-green-text",
  amber: "bg-amber-tile text-amber-text",
  coral: "bg-coral-tile text-coral-text",
  blue: "bg-blue-tile text-blue-text",
  teal: "bg-teal-tile text-teal-text",
  purple: "bg-purple-tile text-purple-text",
  neutral: "bg-surface-2 text-text-secondary",
};

/** Maps common domain statuses to a tone so pills stay consistent app-wide. */
export const STATUS_TONE: Record<string, PillTone> = {
  // orders / shipments
  delivered: "green",
  paid: "green",
  confirmed: "green",
  completed: "green",
  processing: "amber",
  pending: "amber",
  packed: "amber",
  waiting: "amber",
  in_transit: "blue",
  shipped: "blue",
  cancelled: "coral",
  rto: "coral",
  returned: "coral",
  failed: "coral",
  draft: "neutral",
  // stock
  in_stock: "green",
  low_stock: "amber",
  out_of_stock: "coral",
};

export function StatusPill({
  children,
  tone,
  status,
  className,
}: {
  children?: React.ReactNode;
  tone?: PillTone;
  status?: string;
  className?: string;
}) {
  const resolved: PillTone =
    tone ?? (status ? (STATUS_TONE[status.toLowerCase()] ?? "neutral") : "neutral");
  const label =
    children ?? (status ? status.replace(/_/g, " ") : "");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize",
        tones[resolved],
        className,
      )}
    >
      {label}
    </span>
  );
}
