export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
export const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase();
