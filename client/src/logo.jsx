// Amazeon brand — ONE unified logo (conveyor infographic + lettering in a
// single SVG, matching the company logo: blue "Amaz", orange "eon", gray
// "Shopping", rule, "OE BELTS & CONVEYORS").
// variant="dark"  → for light backgrounds (blue/gray text)
// variant="light" → for dark backgrounds (white text, orange kept)
import React from 'react';

export function Logo({ height = 48, variant = 'dark' }) {
  const blue = variant === 'light' ? '#ffffff' : '#1e5aa8';
  const gray = variant === 'light' ? '#c9d7ea' : '#5a6472';
  const beltStroke = variant === 'light' ? '#ffffff' : '#1e5aa8';
  const orange = '#ef8722';
  return (
    <svg
      height={height}
      viewBox="0 0 640 190"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Amazeon Shopping — OE Belts & Conveyors"
      style={{ display: 'block' }}
    >
      {/* ── Conveyor infographic (left) ── */}
      <g fill="none" stroke={beltStroke} strokeWidth="9" strokeLinecap="round">
        {/* curved belt loop */}
        <path d="M28 78 C18 108 30 138 62 146 L96 152" />
        <path d="M40 64 C34 92 46 118 72 126 L100 131" />
        {/* straight belt run */}
        <path d="M104 152 H196" />
        <path d="M108 131 H200" />
      </g>
      {/* rollers */}
      <g fill="none" stroke={beltStroke} strokeWidth="6">
        <circle cx="120" cy="141" r="9" />
        <circle cx="152" cy="141" r="9" />
        <circle cx="184" cy="141" r="9" />
        <circle cx="58" cy="118" r="9" />
      </g>
      {/* boxes on the belts */}
      <rect x="118" y="102" width="30" height="24" rx="4" fill={orange} />
      <rect x="156" y="106" width="24" height="20" rx="4" fill={beltStroke} />
      <rect x="30" y="42" width="24" height="20" rx="4" fill={orange} />
      {/* orange swoosh arrow through the belt, up-right */}
      <path d="M52 140 C60 92 108 48 168 40" fill="none" stroke={orange} strokeWidth="12" strokeLinecap="round" />
      <path d="M152 20 L192 36 L156 58 Z" fill={orange} />

      {/* ── Lettering (right) ── */}
      <text x="228" y="86" fontFamily="'Segoe UI', system-ui, sans-serif" fontWeight="800" fontSize="72">
        <tspan fill={blue}>Amaz</tspan>
        <tspan fill={orange}>eon</tspan>
      </text>
      <text x="230" y="136" fontFamily="'Segoe UI', system-ui, sans-serif" fontWeight="600" fontSize="46" fill={gray}>
        Shopping
      </text>
      <line x1="230" y1="152" x2="620" y2="152" stroke={gray} strokeWidth="3" />
      <text x="230" y="180" fontFamily="'Segoe UI', system-ui, sans-serif" fontWeight="700" fontSize="23" letterSpacing="2.5" fill={gray}>
        OE BELTS &amp; CONVEYORS
      </text>
    </svg>
  );
}

// Compact mark (infographic only) — used as the built-in fallback on the
// invoice sheet, where the company name is printed as text next to it.
export function LogoMark({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" className="lg-belt">
        <path d="M18 78 H102" />
        <path d="M24 96 H96" />
      </g>
      <g fill="none" stroke="currentColor" strokeWidth="5" className="lg-belt">
        <circle cx="30" cy="87" r="8" />
        <circle cx="60" cy="87" r="8" />
        <circle cx="90" cy="87" r="8" />
      </g>
      <rect x="30" y="52" width="24" height="20" rx="3" fill="#ef8722" />
      <rect x="62" y="56" width="18" height="16" rx="3" fill="currentColor" className="lg-belt" />
      <path d="M34 44 C46 18 78 14 96 30" fill="none" stroke="#ef8722" strokeWidth="8" strokeLinecap="round" />
      <path d="M88 16 L100 32 L80 36 Z" fill="#ef8722" />
    </svg>
  );
}

export default Logo;
