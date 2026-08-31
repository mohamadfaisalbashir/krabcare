export default function Logo({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <svg
        width="30"
        height="30"
        viewBox="0 0 30 30"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="15" cy="15" r="15" fill="#0E6E5C" />
        <path
          d="M6 13c1.6 1.8 3.2 1.8 4.8 0s3.2-1.8 4.8 0 3.2 1.8 4.8 0 3.2-1.8 4.8 0"
          stroke="#E6F3EF"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M6 18c1.6 1.8 3.2 1.8 4.8 0s3.2-1.8 4.8 0 3.2 1.8 4.8 0 3.2-1.8 4.8 0"
          stroke="#C1873A"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.9"
        />
      </svg>
      <span className="font-display text-lg font-semibold tracking-tight text-ink">
        sismon<span className="text-brand-500">_kepiting</span>
      </span>
    </div>
  );
}
