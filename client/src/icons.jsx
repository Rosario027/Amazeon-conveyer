// Line-icon set — one consistent stroke weight, currentColor, no emoji.
// Sized in em so an icon always matches the text it sits next to.
import React from 'react';

const Ic = ({ children, size = '1em', stroke = 1.7, className = '', style, viewBox = '0 0 24 24' }) => (
  <svg
    className={`ic ${className}`}
    style={style}
    width={size}
    height={size}
    viewBox={viewBox}
    fill="none"
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);

export const IconPhone = (p) => (
  <Ic {...p}><rect x="7" y="2.5" width="10" height="19" rx="2.2" /><path d="M10.8 5.4h2.4" /><path d="M10.5 18.6h3" /></Ic>
);
export const IconMonitor = (p) => (
  <Ic {...p}><rect x="2.5" y="4" width="19" height="12.5" rx="2" /><path d="M9 20.5h6" /><path d="M12 16.5v4" /></Ic>
);
export const IconMenu = (p) => (
  <Ic {...p}><path d="M3.5 7h17" /><path d="M3.5 12h17" /><path d="M3.5 17h17" /></Ic>
);
export const IconUser = (p) => (
  <Ic {...p}><circle cx="12" cy="8" r="3.6" /><path d="M4.8 20a7.4 7.4 0 0 1 14.4 0" /></Ic>
);
export const IconDownload = (p) => (
  <Ic {...p}><path d="M12 3.5v11" /><path d="M7.5 10.5 12 15l4.5-4.5" /><path d="M4.5 19.5h15" /></Ic>
);
export const IconPaperclip = (p) => (
  <Ic {...p}><path d="M20 11.5 12.4 19a4.6 4.6 0 0 1-6.5-6.5l7.8-7.8a3.1 3.1 0 0 1 4.4 4.4l-7.7 7.7a1.6 1.6 0 0 1-2.2-2.2l7.1-7.1" /></Ic>
);
export const IconLock = (p) => (
  <Ic {...p}><rect x="4.5" y="10.5" width="15" height="10" rx="2.2" /><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" /></Ic>
);
export const IconFolder = (p) => (
  <Ic {...p}><path d="M3 6.5a2 2 0 0 1 2-2h3.6l2 2.2H19a2 2 0 0 1 2 2v8.8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></Ic>
);
export const IconNote = (p) => (
  <Ic {...p}><path d="M5 3.5h9.5L19 8v12.5H5Z" /><path d="M14 3.5V8h5" /><path d="M8.5 12.5h7" /><path d="M8.5 16h4.5" /></Ic>
);
export const IconAlert = (p) => (
  <Ic {...p}><path d="M12 3.8 21 19.5H3Z" /><path d="M12 10v4" /><path d="M12 16.8h.01" /></Ic>
);
export const IconChevronDown = (p) => (
  <Ic {...p}><path d="M6 9.5 12 15.5l6-6" /></Ic>
);
export const IconChevronRight = (p) => (
  <Ic {...p}><path d="M9.5 5.5 15.5 12l-6 6.5" /></Ic>
);
export const IconCheck = (p) => (
  <Ic {...p}><path d="M4.5 12.5 9.5 17.5 19.5 6.5" /></Ic>
);
export const IconClose = (p) => (
  <Ic {...p}><path d="M6 6l12 12" /><path d="M18 6 6 18" /></Ic>
);
export const IconPlus = (p) => (
  <Ic {...p}><path d="M12 5v14" /><path d="M5 12h14" /></Ic>
);
export const IconPrint = (p) => (
  <Ic {...p}><path d="M7 9V3.5h10V9" /><rect x="3.5" y="9" width="17" height="7.5" rx="2" /><path d="M7 14h10v6.5H7Z" /></Ic>
);
export const IconEdit = (p) => (
  <Ic {...p}><path d="M4 20h4.2L19 9.2a2.1 2.1 0 0 0-3-3L5 17.1Z" /><path d="M14.5 6.8l2.7 2.7" /></Ic>
);
export const IconTrash = (p) => (
  <Ic {...p}><path d="M4.5 7h15" /><path d="M9.5 7V4.8h5V7" /><path d="M6.5 7l1 13h9l1-13" /></Ic>
);
export const IconSearch = (p) => (
  <Ic {...p}><circle cx="11" cy="11" r="6.5" /><path d="M15.8 15.8 20.5 20.5" /></Ic>
);

export default Ic;
