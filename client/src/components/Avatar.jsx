const VARIANTS = ['', 'alt-1', 'alt-2', 'alt-3', 'alt-4', 'alt-5'];

// Deterministic gradient so every member keeps the same colour everywhere.
export function Avatar({ name, className = '', title }) {
  const safe = name || '?';
  const seed = safe.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <span className={`avatar ${className} ${VARIANTS[seed % VARIANTS.length]}`.trim()} title={title}>
      {safe.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export default Avatar;
