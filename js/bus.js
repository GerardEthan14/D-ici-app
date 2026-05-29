/**
 * Tiny render bus: each feature registers its render function under its key.
 * Firebase helpers use it to trigger re-renders in local mode without
 * importing feature modules (avoids circular deps).
 */
export const render = {};
