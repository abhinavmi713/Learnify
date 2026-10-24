// Learnify wordmark drawn in SVG + text so it follows the active theme
// (the old PNG logo was a fixed light-on-dark image).
export default function Logo({ className = "", size = 30 }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="9" fill="rgb(var(--yellow-50))" />
        <path
          d="M9 9v11.5c0 1.4 1.1 2.5 2.5 2.5H23"
          fill="none"
          stroke="rgb(var(--richblack-900))"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="21.5" cy="10.5" r="2.6" fill="rgb(var(--richblue-300))" />
      </svg>
      <span className="font-display text-xl font-extrabold tracking-tight text-richblack-5">
        Learnify
      </span>
    </span>
  )
}
