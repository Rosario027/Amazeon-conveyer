// Amazeon brand — the ONE real logo (client/public/amazeon-logo.png:
// the original artwork with only its white BACKGROUND removed, elements
// untouched). Used everywhere as-is; only the container may be styled.
import React from 'react';

export const LOGO_SRC = '/amazeon-logo.png';

export function Logo({ className = '', style }) {
  return <img className={`amz-logo ${className}`} style={style} src={LOGO_SRC} alt="Amazeon Shopping — OE Belts & Conveyors" />;
}

export default Logo;
