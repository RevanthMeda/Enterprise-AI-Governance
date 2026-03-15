export function BrandMark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M12 2.8 19.2 6.9v8.2L12 19.2l-7.2-4.1V6.9L12 2.8Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="11" r="3.2" stroke="currentColor" strokeWidth="1.5" opacity="0.9" />
      <path d="M12 7.7v6.6M8.7 11h6.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.95" />
      <circle cx="17.7" cy="6.3" r="1.6" fill="currentColor" opacity="0.7" />
    </svg>
  );
}
