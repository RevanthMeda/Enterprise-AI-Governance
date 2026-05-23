export function BrandMark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M5.2 6.2h13.6M5.2 12h13.6M5.2 17.8h13.6M6.2 5.2v13.6M12 5.2v13.6M17.8 5.2v13.6"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M12 3.4 20.4 8.2v7.6L12 20.6l-8.4-4.8V8.2L12 3.4Z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.15" stroke="currentColor" strokeWidth="1.45" opacity="0.95" />
      <circle cx="12" cy="12" r="1.15" fill="currentColor" opacity="0.92" />
      <circle cx="17.8" cy="6.2" r="1.45" fill="currentColor" opacity="0.72" />
      <circle cx="6.2" cy="17.8" r="1.15" fill="currentColor" opacity="0.58" />
    </svg>
  );
}
