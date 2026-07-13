// Amazeon brand — inline SVG logomark (conveyor + swoosh arrow) and wordmark.
// The real logo image can be uploaded in Invoice Settings; it then replaces
// this mark on printed invoices. This component brands the app shell.
import React from 'react';

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

export function Wordmark({ compact = false }) {
  return (
    <div className={`wordmark ${compact ? 'wm-compact' : ''}`}>
      <div className="wm-name">
        <span className="wm-blue">Amaz</span>
        <span className="wm-orange">eon</span>
        <span className="wm-gray"> Shopping</span>
      </div>
      {!compact && <div className="wm-tag">OE BELTS &amp; CONVEYORS</div>}
    </div>
  );
}

export default LogoMark;
