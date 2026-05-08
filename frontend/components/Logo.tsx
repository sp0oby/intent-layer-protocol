/**
 * Brand mark for Intent Layer Protocol. Three offset parallelograms
 * stacked to read as "layers"; the middle one fills cyan to draw the
 * eye. Drawn at viewBox 28x28, scales cleanly to anywhere from 16px
 * (favicon) to 64px (header). Pure SVG — picks up theme via fill var.
 */
export function Logo({className, size = 28}: {className?: string; size?: number}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      className={className}
      role="img"
      aria-label="Intent Layer"
    >
      {/* Top layer — recessed, foreground/40 */}
      <path
        d="M 6 6 L 22 6 L 18 10 L 2 10 Z"
        fill="currentColor"
        opacity="0.35"
      />
      {/* Middle layer — primary cyan, the focal slab */}
      <path
        d="M 8 12 L 24 12 L 20 16 L 4 16 Z"
        fill="var(--color-primary)"
      />
      {/* Bottom layer — recessed, foreground/40 */}
      <path
        d="M 10 18 L 26 18 L 22 22 L 6 22 Z"
        fill="currentColor"
        opacity="0.35"
      />
    </svg>
  );
}
