import { cn } from "../utils";
import { ACCENT_HEX, type Accent } from "./accent";

const ACCENTS: Accent[] = ["blue", "teal", "green", "amber", "purple", "coral"];

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** Deterministic accent from a name so each person keeps a stable color. */
function accentFor(name: string): Accent {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

export function Avatar({
  name,
  size = 36,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const a = ACCENT_HEX[accentFor(name)];
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-heading font-semibold",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: a.tile,
        color: a.text,
        fontSize: size * 0.4,
      }}
      aria-hidden
    >
      {initials(name) || "?"}
    </div>
  );
}
