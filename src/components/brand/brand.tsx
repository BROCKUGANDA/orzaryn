// ORZARYN — brand components (Stage 5). Emblem, wordmark, lockups.
export function Emblem({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      role="img"
      aria-label="ORZARYN emblem"
    >
      <path
        d="M16 4.8 24.9 9.9v10.2L16 25.2 7.1 20.1V9.9L16 4.8Z"
        stroke="var(--orz-accent)"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M11.2 16a4.8 4.8 0 0 1 7.9-3.66"
        stroke="var(--orz-accent)"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.75"
      />
      <circle cx="16" cy="16" r="2.1" fill="var(--orz-accent)" />
    </svg>
  );
}

export function Wordmark({ className, size = 16 }: { className?: string; size?: number }) {
  return (
    <span
      className={`font-semibold tracking-[0.08em] text-foreground ${className ?? ""}`}
      style={{ fontSize: size, fontFamily: "var(--font-space-grotesk)" }}
    >
      ORZARYN
    </span>
  );
}

export function LogoHorizontal({ size = 22 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Emblem size={size} />
      <Wordmark size={Math.round(size * 0.72)} />
    </span>
  );
}
