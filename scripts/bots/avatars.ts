/**
 * Generates the original bot avatars `public/avatars/bots/<id>.svg` (and `coach.svg`) – simple flat portraits made from
 * circles and paths, no external artwork (DESIGN §5.3: own SVG illustrations, no chess.com images).
 * Run: `npx tsx scripts/bots/avatars.ts` (idempotent; the SVGs are committed).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Hair = 'spiky' | 'pigtails' | 'short' | 'bun' | 'cap' | 'bob' | 'curly' | 'long' | 'quiff' | 'ponytail' | 'side-part' | 'bald' | 'undercut';
type Extra = 'freckles' | 'bow' | 'earrings' | 'glasses-round' | 'glasses-square' | 'beard' | 'bow-tie' | 'headband' | 'whistle' | 'streak';
type Mouth = 'grin' | 'smile' | 'small' | 'open' | 'smirk' | 'calm';

/** Avatar description. */
export interface AvatarSpec {
  id: string;
  bg: string;
  skin: string;
  hair: Hair;
  hairColor: string;
  shirt: string;
  mouth: Mouth;
  extras?: Extra[];
  /** Accent colour for accessories (bow, cap, headband, streak). */
  accent?: string;
  wink?: boolean;
  brows?: 'flat' | 'raised' | 'determined';
}

const INK = '#2B2024';
const LIP = '#8A3B3B';

function hairBack(s: AvatarSpec): string {
  const c = s.hairColor;
  switch (s.hair) {
    case 'long':
      return `<path d="M25 44c0-17 10-26 23-26s23 9 23 26v28c-7 4-14 5-23 5s-16-1-23-5z" fill="${c}"/>`;
    case 'bob':
    case 'undercut':
      return `<path d="M25 44c0-17 10-26 23-26s23 9 23 26v14c-4 3-8 4-12 4H37c-4 0-8-1-12-4z" fill="${c}"/>`;
    case 'pigtails':
      return `<circle cx="24" cy="48" r="9" fill="${c}"/><circle cx="72" cy="48" r="9" fill="${c}"/>`;
    case 'ponytail':
      return `<path d="M64 30c12 4 14 18 8 30-2-9-6-15-12-18z" fill="${c}"/>`;
    case 'bun':
      return `<circle cx="48" cy="17" r="8.5" fill="${c}"/>`;
    default:
      return '';
  }
}

function hairFront(s: AvatarSpec): string {
  const c = s.hairColor;
  switch (s.hair) {
    case 'spiky':
      return `<path d="M27 40l2-15 6 6 3-11 6 8 5-10 4 9 6-7 2 10 6-3-3 13c-5-6-12-9-20-9s-13 3-17 9z" fill="${c}"/>`;
    case 'curly':
      return [26, 33, 40, 48, 56, 63, 70]
        .map((x, i) => `<circle cx="${x}" cy="${i % 2 ? 22 : 27}" r="${i % 2 ? 7.5 : 7}" fill="${c}"/>`)
        .join('')
        .concat(`<path d="M27 38c2-10 10-15 21-15s19 5 21 15c-6-5-13-7-21-7s-15 2-21 7z" fill="${c}"/>`);
    case 'quiff':
      return `<path d="M28 40c-1-12 6-20 16-22 6-4 16-3 21 2 4 4 4 10 3 18-5-7-12-9-20-9s-15 4-20 11z" fill="${c}"/>`;
    case 'side-part':
      return `<path d="M27 41c0-14 9-22 21-22s21 8 21 22c-3-6-7-9-13-10-6 4-17 5-29 10z" fill="${c}"/>`;
    case 'bald':
      return `<path d="M27 46c-1-6 1-11 4-13l2 13zM69 46c1-6-1-11-4-13l-2 13z" fill="${c}"/>`;
    case 'cap': {
      const cap = s.accent ?? '#2A9D8F';
      return `<path d="M27 37c0-12 9-19 21-19s21 7 21 19z" fill="${cap}"/><path d="M45 36h30c2 0 2 4 0 4H45z" fill="${cap}"/><circle cx="48" cy="18.5" r="2.5" fill="${cap}"/><path d="M28 37h40v3H28z" fill="${c}" opacity=".9"/>`;
    }
    case 'undercut':
      return `<path d="M27 40c0-14 9-22 21-22s21 8 21 22c-8-3-14-8-17-14-5 7-14 11-25 14z" fill="${c}"/>`;
    case 'bob':
    case 'long':
    case 'ponytail':
    case 'pigtails':
    case 'bun':
      return `<path d="M27 41c0-14 9-22 21-22s21 8 21 22c-6-5-13-8-21-8s-15 3-21 8z" fill="${c}"/>`;
    default:
      return `<path d="M27 40c0-14 9-21 21-21s21 7 21 21c-5-6-12-8-21-8s-16 2-21 8z" fill="${c}"/>`;
  }
}

function eyes(s: AvatarSpec): string {
  const left = `<circle cx="40" cy="44" r="2.7" fill="${INK}"/>`;
  const right = s.wink
    ? `<path d="M53 44.5q3-2.5 6 0" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
    : `<circle cx="56" cy="44" r="2.7" fill="${INK}"/>`;
  const brows =
    s.brows === 'determined'
      ? `<path d="M35 37l9 2.5M61 37l-9 2.5" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`
      : s.brows === 'raised'
        ? `<path d="M35 37q5-3 9 0M52 37q5-3 9 0" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/>`
        : `<path d="M36 38h7M53 38h7" stroke="${INK}" stroke-width="2" stroke-linecap="round" opacity=".8"/>`;
  return left + right + brows;
}

function mouth(s: AvatarSpec): string {
  switch (s.mouth) {
    case 'grin':
      return `<path d="M39 53q9 9 18 0z" fill="${LIP}"/><path d="M41 54h14" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`;
    case 'open':
      return `<ellipse cx="48" cy="55" rx="5" ry="4" fill="${LIP}"/>`;
    case 'smirk':
      return `<path d="M42 55q7 2 13-3" stroke="${LIP}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    case 'small':
      return `<path d="M44 54q4 3 8 0" stroke="${LIP}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    case 'calm':
      return `<path d="M43 55h10" stroke="${LIP}" stroke-width="2.4" stroke-linecap="round"/>`;
    default:
      return `<path d="M41 53q7 6 14 0" stroke="${LIP}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  }
}

function extras(s: AvatarSpec): string {
  const a = s.accent ?? '#E63946';
  return (s.extras ?? [])
    .map((e) => {
      switch (e) {
        case 'freckles':
          return `<g fill="#B5651D" opacity=".55"><circle cx="35" cy="50" r="1"/><circle cx="38" cy="52" r="1"/><circle cx="34" cy="53" r="1"/><circle cx="61" cy="50" r="1"/><circle cx="58" cy="52" r="1"/><circle cx="62" cy="53" r="1"/></g>`;
        case 'bow':
          return `<path d="M60 22l8-5v10zM60 22l-8-5v10z" fill="${a}"/><circle cx="60" cy="22" r="2.4" fill="${a}"/>`;
        case 'earrings':
          return `<circle cx="27.5" cy="52" r="2.2" fill="${a}"/><circle cx="68.5" cy="52" r="2.2" fill="${a}"/>`;
        case 'glasses-round':
          return `<g stroke="${INK}" stroke-width="1.8" fill="none"><circle cx="40" cy="44" r="6"/><circle cx="56" cy="44" r="6"/><path d="M46 44h4M34 43l-6-2M62 43l6-2"/></g>`;
        case 'glasses-square':
          return `<g stroke="${INK}" stroke-width="1.8" fill="none"><rect x="33.5" y="39" width="13" height="10" rx="2"/><rect x="49.5" y="39" width="13" height="10" rx="2"/><path d="M46.5 43h3M33.5 42l-5-1M62.5 42l5-1"/></g>`;
        case 'beard':
          return `<path d="M30 48c1 14 8 20 18 20s17-6 18-20c-3 5-6 7-9 7-3-3-6-3-9-3s-6 0-9 3c-3 0-6-2-9-7z" fill="${s.hairColor}"/>`;
        case 'bow-tie':
          return `<path d="M48 72l-9-5v10zM48 72l9-5v10z" fill="${a}"/><circle cx="48" cy="72" r="2.4" fill="${a}"/>`;
        case 'headband':
          return `<path d="M27.5 33c5-5 12-7 20.5-7s15.5 2 20.5 7l-1 4c-5-4-11-6-19.5-6s-14.5 2-19.5 6z" fill="${a}"/>`;
        case 'whistle':
          return `<path d="M44 70l4 8 4-8" stroke="#F4F1DE" stroke-width="1.6" fill="none"/><rect x="45" y="77" width="9" height="6" rx="3" fill="#C0C7CF"/>`;
        case 'streak':
          return `<path d="M50 20c4 5 9 9 16 12l2 6c-8-3-14-8-18-14z" fill="${a}"/>`;
        default:
          return '';
      }
    })
    .join('');
}

/** Builds one avatar SVG. */
export function avatarSvg(s: AvatarSpec): string {
  const shade = `<rect x="41" y="58" width="14" height="13" rx="4" fill="${s.skin}"/><rect x="41" y="58" width="14" height="13" rx="4" fill="#000" opacity=".12"/>`;
  const extrasOver = extras(s);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">`,
    `<clipPath id="c"><circle cx="48" cy="48" r="48"/></clipPath><g clip-path="url(#c)">`,
    `<circle cx="48" cy="48" r="48" fill="${s.bg}"/>`,
    hairBack(s),
    `<path d="M14 96c2-17 16-27 34-27s32 10 34 27z" fill="${s.shirt}"/>`,
    shade,
    `<ellipse cx="27.5" cy="46" rx="3.5" ry="5" fill="${s.skin}"/><ellipse cx="68.5" cy="46" rx="3.5" ry="5" fill="${s.skin}"/>`,
    `<ellipse cx="48" cy="44" rx="20" ry="22" fill="${s.skin}"/>`,
    `<circle cx="36" cy="51" r="3.2" fill="#E5737A" opacity=".25"/><circle cx="60" cy="51" r="3.2" fill="#E5737A" opacity=".25"/>`,
    hairFront(s),
    eyes(s),
    mouth(s),
    extrasOver,
    `</g></svg>`,
  ].join('');
}

/** The avatars of the roster plus the coach. */
export const AVATARS: AvatarSpec[] = [
  { id: 'pip', bg: '#F2B84B', skin: '#F5CBA7', hair: 'spiky', hairColor: '#8D5524', shirt: '#3A86FF', mouth: 'grin', extras: ['freckles'], brows: 'raised' },
  { id: 'lotte', bg: '#8FC1E3', skin: '#F1C27D', hair: 'pigtails', hairColor: '#D9A441', shirt: '#E76F51', mouth: 'small', extras: ['bow'], accent: '#E63946', brows: 'raised' },
  { id: 'emil', bg: '#E85D5D', skin: '#E0AC69', hair: 'short', hairColor: '#2E1B10', shirt: '#264653', mouth: 'grin', brows: 'determined' },
  { id: 'greta', bg: '#7DBE8A', skin: '#FFDBAC', hair: 'bun', hairColor: '#5A3825', shirt: '#6D597A', mouth: 'smile', extras: ['earrings'], accent: '#F4D35E' },
  { id: 'kalle', bg: '#F4A259', skin: '#C68642', hair: 'cap', hairColor: '#1B1B1B', shirt: '#E9C46A', mouth: 'smirk', accent: '#2A9D8F', wink: true },
  { id: 'nina', bg: '#B8A1E3', skin: '#8D5524', hair: 'bob', hairColor: '#1B1B1B', shirt: '#2A9D8F', mouth: 'calm', extras: ['earrings'], accent: '#F4F1DE' },
  { id: 'theo', bg: '#F7D154', skin: '#F1C27D', hair: 'curly', hairColor: '#B5651D', shirt: '#D62828', mouth: 'open', extras: ['freckles'], brows: 'raised' },
  { id: 'frieda', bg: '#9CC5A1', skin: '#EAC086', hair: 'long', hairColor: '#6B4226', shirt: '#1D3557', mouth: 'smile', extras: ['glasses-round'] },
  { id: 'jonte', bg: '#E76F51', skin: '#FFDBAC', hair: 'quiff', hairColor: '#3B2A20', shirt: '#22333B', mouth: 'smirk', extras: ['headband'], accent: '#F4D35E', brows: 'determined' },
  { id: 'ida', bg: '#6CA6C1', skin: '#C68642', hair: 'ponytail', hairColor: '#2B1B0E', shirt: '#F4A261', mouth: 'smile' },
  { id: 'oskar', bg: '#9B8AC4', skin: '#E0AC69', hair: 'side-part', hairColor: '#4A3728', shirt: '#3D405B', mouth: 'smirk', extras: ['glasses-square'] },
  { id: 'henrike', bg: '#5FA8A0', skin: '#FFE0BD', hair: 'bun', hairColor: '#9A9A9A', shirt: '#8E3B46', mouth: 'calm', extras: ['glasses-round', 'earrings'], accent: '#E9C46A' },
  { id: 'professor-kraus', bg: '#C9A66B', skin: '#F1C27D', hair: 'bald', hairColor: '#ECECEC', shirt: '#4A4E69', mouth: 'calm', extras: ['beard', 'glasses-round', 'bow-tie'], accent: '#8E1C1C', brows: 'raised' },
  { id: 'zora', bg: '#3D5A80', skin: '#8D5524', hair: 'undercut', hairColor: '#111111', shirt: '#E63946', mouth: 'smirk', extras: ['streak'], accent: '#E63946', brows: 'determined' },
  { id: 'coach', bg: '#2A9D8F', skin: '#E0AC69', hair: 'cap', hairColor: '#4A3728', shirt: '#264653', mouth: 'smile', extras: ['whistle'], accent: '#F4F1DE' },
];

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'avatars', 'bots');
  mkdirSync(out, { recursive: true });
  for (const spec of AVATARS) {
    writeFileSync(join(out, `${spec.id}.svg`), `${avatarSvg(spec)}\n`);
    console.log(`public/avatars/bots/${spec.id}.svg`);
  }
}
