// Project workflow stages — mirrored from server/routes/projects.js so the
// picker and badges render without an extra round-trip.
export const STAGES = [
  { key: 'created', label: 'Project created' },
  { key: 'quote-given', label: 'Quote given' },
  { key: 'order-placed', label: 'Order placed' },
  { key: 'advance-received', label: 'Advance received' },
  { key: 'in-progress', label: 'Work in progress' },
  { key: 'delivered', label: 'Delivered / installed' },
  { key: 'invoiced', label: 'Invoiced' },
  { key: 'payment-received', label: 'Payment received' },
  { key: 'completed', label: 'Completed (closed)' },
];

export const stageLabel = (key) => (STAGES.find((s) => s.key === key) || {}).label || key || '—';
export const stageIndex = (key) => STAGES.findIndex((s) => s.key === key);

export default STAGES;
