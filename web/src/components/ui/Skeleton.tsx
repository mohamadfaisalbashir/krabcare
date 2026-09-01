import clsx from "clsx";

/** Placeholder berdenyut untuk data yang belum tiba. `animate-pulse` bawaan Tailwind. */
export default function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={clsx("animate-pulse rounded-md bg-border/60", className)}
    />
  );
}
