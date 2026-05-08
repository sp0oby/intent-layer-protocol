'use client';

import {motion} from 'framer-motion';

/**
 * Signature hero visual. Two parallel intent rails representing the
 * Eth↔Base corridor; a dot rides each rail in opposite directions. When
 * both dots cross the central match zone the zone pulses cyan and a
 * connector flashes between them — the visual statement of "P2P-first,
 * cross-chain settled." Loops with a 5.6s period; quiet, no jitter.
 *
 * Pure SVG so it scales cleanly, picks up theme tokens via CSS vars,
 * and ships without an asset pipeline. The grid backdrop is rendered
 * via a <pattern> rather than CSS so the whole composition is a single
 * paintable artefact.
 */
export function HeroVisual() {
  return (
    <div className="relative aspect-[5/3] w-full">
      {/* Soft cyan halo behind the canvas — sits in the navy bg and gives
          the SVG a sense of being lit from within. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-12 -z-10 rounded-[40%] bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,color-mix(in_oklch,var(--color-primary)_22%,transparent),transparent_70%)] blur-2xl"
      />
      <svg
        viewBox="0 0 720 432"
        className="h-full w-full"
        role="img"
        aria-label="Cross-chain intents matching between Ethereum and Base"
      >
        <defs>
          {/* Faint dot grid for depth — only visible because the navy bg
              lets the 6% alpha foreground read. */}
          <pattern id="ilp-grid" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="currentColor" opacity="0.06" />
          </pattern>

          {/* Gradient for the rails — fades in/out at the edges so the
              rail looks like it emerges from and dissolves into the bg. */}
          <linearGradient id="ilp-rail" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
            <stop offset="15%" stopColor="currentColor" stopOpacity="0.18" />
            <stop offset="50%" stopColor="currentColor" stopOpacity="0.32" />
            <stop offset="85%" stopColor="currentColor" stopOpacity="0.18" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>

          {/* Cyan glow filter for the moving dots + match flash. */}
          <filter id="ilp-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect x="0" y="0" width="720" height="432" fill="url(#ilp-grid)" className="text-foreground" />

        {/* Rails — faint, asymmetric in y so the composition doesn't read
            as a sandwich. */}
        <line x1="0" y1="156" x2="720" y2="156" stroke="url(#ilp-rail)" strokeWidth="1" className="text-foreground" />
        <line x1="0" y1="288" x2="720" y2="288" stroke="url(#ilp-rail)" strokeWidth="1" className="text-foreground" />

        {/* Match zone — vertical column at x=360, very faint outline,
            pulses when the two dots are inside it. */}
        <MatchZone />

        {/* Top rail: Eth → Base */}
        <ChainBadge x={48} y={156} kind="eth" />
        <ChainBadge x={672} y={156} kind="base" />
        <RailDot rail="top" />

        {/* Bottom rail: Base → Eth */}
        <ChainBadge x={48} y={288} kind="base" />
        <ChainBadge x={672} y={288} kind="eth" />
        <RailDot rail="bottom" />

        {/* Connector line that flashes between the two dots when they're
            both at centre — the visual "match." */}
        <MatchConnector />

        {/* Static rail labels — anchored under each badge. */}
        <RailLabel x={48} y={156} text="Ethereum" align="start" />
        <RailLabel x={672} y={156} text="Base" align="end" />
        <RailLabel x={48} y={288} text="Base" align="start" />
        <RailLabel x={672} y={288} text="Ethereum" align="end" />

        {/* Direction caret on each rail — quiet, foreground/30. */}
        <Arrowhead x={696} y={156} direction="right" />
        <Arrowhead x={24} y={288} direction="left" />
      </svg>
    </div>
  );
}

const LOOP_DURATION = 5.6;

/** A single travelling intent dot. Top rail goes left→right (48 → 672),
 *  bottom rail right→left (672 → 48). Both reach x=360 at the same
 *  fractional time so the match zone pulses on cue. */
function RailDot({rail}: {rail: 'top' | 'bottom'}) {
  const y = rail === 'top' ? 156 : 288;
  const xStart = rail === 'top' ? 80 : 640;
  const xEnd = rail === 'top' ? 640 : 80;
  return (
    <motion.g
      initial={{opacity: 0}}
      animate={{
        opacity: [0, 1, 1, 1, 0],
        // Position keyframes drive the x via attrX on the inner circle.
      }}
      transition={{
        duration: LOOP_DURATION,
        repeat: Infinity,
        ease: 'linear',
        times: [0, 0.08, 0.5, 0.85, 1],
      }}
    >
      <motion.circle
        r="6"
        cy={y}
        fill="var(--color-primary)"
        filter="url(#ilp-glow)"
        animate={{cx: [xStart, xEnd]}}
        transition={{duration: LOOP_DURATION, repeat: Infinity, ease: 'easeInOut'}}
      />
    </motion.g>
  );
}

/** Vertical bar at the centre of the canvas. When the two dots are both
 *  inside it (occurs at t≈0.5 of the loop) it pulses; a faint outline
 *  reads at all other times. */
function MatchZone() {
  return (
    <g>
      <rect
        x="340"
        y="120"
        width="40"
        height="204"
        rx="20"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.08"
        className="text-foreground"
      />
      <motion.rect
        x="340"
        y="120"
        width="40"
        height="204"
        rx="20"
        fill="var(--color-primary)"
        animate={{opacity: [0, 0, 0.16, 0, 0]}}
        transition={{duration: LOOP_DURATION, repeat: Infinity, times: [0, 0.42, 0.5, 0.58, 1]}}
      />
      <motion.text
        x="360"
        y="232"
        textAnchor="middle"
        fontSize="9"
        fontWeight="600"
        letterSpacing="0.18em"
        fill="var(--color-primary)"
        animate={{opacity: [0, 0, 1, 0, 0]}}
        transition={{duration: LOOP_DURATION, repeat: Infinity, times: [0, 0.42, 0.5, 0.58, 1]}}
      >
        MATCH
      </motion.text>
    </g>
  );
}

/** Vertical line connecting top dot (y=156) to bottom dot (y=288) at the
 *  match instant. Only visible during the brief overlap. */
function MatchConnector() {
  return (
    <motion.line
      x1="360"
      y1="156"
      x2="360"
      y2="288"
      stroke="var(--color-primary)"
      strokeWidth="1.5"
      strokeDasharray="3 4"
      filter="url(#ilp-glow)"
      animate={{opacity: [0, 0, 0.9, 0, 0]}}
      transition={{duration: LOOP_DURATION, repeat: Infinity, times: [0, 0.45, 0.5, 0.55, 1]}}
    />
  );
}

/** Compact monogram chain marks. Custom-drawn — not lifted from a logo
 *  pack — so they read as protocol-level identity, not real branding. */
function ChainBadge({x, y, kind}: {x: number; y: number; kind: 'eth' | 'base'}) {
  if (kind === 'eth') {
    return (
      <g transform={`translate(${x}, ${y})`}>
        <circle r="20" fill="var(--color-card)" stroke="currentColor" strokeOpacity="0.18" className="text-foreground" />
        {/* Stylised Eth diamond — two triangles forming a kite, drawn as one path. */}
        <path d="M 0 -10 L 7 0 L 0 4 L -7 0 Z M 0 6 L 7 1.5 L 0 11 L -7 1.5 Z" fill="oklch(0.78 0.14 280)" />
      </g>
    );
  }
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle r="20" fill="var(--color-card)" stroke="currentColor" strokeOpacity="0.18" className="text-foreground" />
      {/* Base wordmark dot — single bold filled circle with a notch. */}
      <circle r="9" fill="oklch(0.62 0.18 250)" />
      <rect x="-2" y="-9" width="4" height="18" fill="var(--color-card)" />
    </g>
  );
}

function RailLabel({x, y, text, align}: {x: number; y: number; text: string; align: 'start' | 'end'}) {
  const dx = align === 'start' ? 32 : -32;
  return (
    <text
      x={x + dx}
      y={y + 4}
      textAnchor={align}
      fontSize="11"
      fontWeight="500"
      letterSpacing="0.04em"
      fill="currentColor"
      className="fill-muted-foreground"
    >
      {text}
    </text>
  );
}

function Arrowhead({x, y, direction}: {x: number; y: number; direction: 'left' | 'right'}) {
  const points = direction === 'right' ? `${x - 6},${y - 4} ${x},${y} ${x - 6},${y + 4}` : `${x + 6},${y - 4} ${x},${y} ${x + 6},${y + 4}`;
  return <polyline points={points} fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-foreground" />;
}
