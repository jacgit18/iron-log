// Smooth scrolling and other movement only when the user hasn't asked to reduce motion.
export const motionOK = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
