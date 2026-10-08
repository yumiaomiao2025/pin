export interface ColorSet {
  paper: string;
  ink: string;
  title: string | null;
  accent: string;
  spine: string | null;
  shadow: string;
}

export interface ColorPreset extends ColorSet {
  id: string;
  name: string;
}

export interface ColorPreview {
  scope: 'default' | 'widget';
  widgetId?: string;
  colors: ColorSet;
}

export const COLOR_PRESETS: readonly ColorPreset[] = [
  {
    id: 'plain',
    name: '经典黄',
    paper: '#FFFFFF',
    ink: '#111111',
    title: '#FFE566',
    accent: '#FFE566',
    spine: null,
    shadow: '#111111',
  },
  {
    id: 'kraft',
    name: '牛皮纸',
    paper: '#FFF9D6',
    ink: '#3B3226',
    title: '#E5B64B',
    accent: '#E5B64B',
    spine: null,
    shadow: '#3B3226',
  },
  {
    id: 'blueprint',
    name: '蓝图',
    paper: '#E8F1FB',
    ink: '#1E2C38',
    title: '#5E82AA',
    accent: '#5E82AA',
    spine: null,
    shadow: '#1E2C38',
  },
  {
    id: 'grass',
    name: '草绿',
    paper: '#EDF6EF',
    ink: '#20321F',
    title: '#6E9C7B',
    accent: '#6E9C7B',
    spine: null,
    shadow: '#20321F',
  },
];

export function normalizeKitColors(colors: Pick<ColorSet, 'paper' | 'accent' | 'ink'>): ColorSet {
  const paper = colors.paper.toUpperCase();
  const accent = colors.accent.toUpperCase();
  const ink = colors.ink.toUpperCase();
  return { paper, accent, ink, title: accent, shadow: ink, spine: null };
}

export function colorSetEquals(left: ColorSet, right: ColorSet) {
  return (
    left.paper === right.paper &&
    left.ink === right.ink &&
    left.title === right.title &&
    left.accent === right.accent &&
    left.spine === right.spine &&
    left.shadow === right.shadow
  );
}

function parseHex(hex: string) {
  const normalized = hex.replace('#', '');
  return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16));
}

export function mixColor(left: string, right: string, amount: number) {
  const a = parseHex(left);
  const b = parseHex(right);
  return `#${a
    .map((channel, index) => Math.round(channel + (b[index] - channel) * amount).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();
}

export function luminance(hex: string) {
  const [red, green, blue] = parseHex(hex);
  return (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
}

export function deriveColorVars(colors: ColorSet) {
  const title = colors.title ?? colors.paper;
  const ink = colors.ink;
  const sub = mixColor(ink, colors.paper, 0.5);
  const soft = mixColor(colors.paper, ink, 0.06);
  return {
    paper: colors.paper,
    ink,
    title,
    accent: colors.accent,
    spine: colors.spine,
    shadow: colors.shadow,
    sub,
    soft,
  };
}
