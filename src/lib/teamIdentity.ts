/**
 * Deterministic visual identity for a team from its name only (no logos,
 * no licensed imagery): two colours, initials and a crest pattern.
 */
export interface TeamIdentity {
  initials: string;
  primary: string;
  secondary: string;
  hue: number;
  pattern: 'solid' | 'stripes' | 'sash' | 'halves';
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const STOP = new Set(['fc', 'cf', 'sc', 'ac', 'afc', 'ks', 'cd', 'sv', 'vfl', 'fk', 'sk', 'the', 'de', 'club', 'real']);

export function teamInitials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s.-]/gu, ' ').split(/[\s.-]+/).filter(Boolean);
  const meaningful = words.filter((w) => !STOP.has(w.toLowerCase()));
  const pool = meaningful.length ? meaningful : words;
  if (pool.length === 1) return pool[0].slice(0, 3).toUpperCase();
  return pool.slice(0, 3).map((w) => w[0]).join('').toUpperCase();
}

const PATTERNS: TeamIdentity['pattern'][] = ['solid', 'stripes', 'sash', 'halves'];

export function teamIdentity(name: string, avoidHue?: number): TeamIdentity {
  const h = hash(name.trim().toLowerCase());
  let hue = h % 360;
  // keep rivals visually distinct
  if (avoidHue !== undefined) {
    const d = Math.abs(((hue - avoidHue + 540) % 360) - 180);
    if (d < 110) hue = (avoidHue + 150 + (h % 60)) % 360;
  }
  const sat = 62 + (h >> 9) % 20;
  return {
    initials: teamInitials(name),
    primary: `hsl(${hue} ${sat}% 48%)`,
    secondary: `hsl(${(hue + 30 + ((h >> 4) % 40)) % 360} ${sat - 10}% 22%)`,
    hue,
    pattern: PATTERNS[(h >> 13) % PATTERNS.length],
  };
}

export function rivalIdentities(home: string, away: string): [TeamIdentity, TeamIdentity] {
  const a = teamIdentity(home);
  return [a, teamIdentity(away, a.hue)];
}
