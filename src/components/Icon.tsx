import type { SVGProps } from 'react'

/**
 * Lucide-derived 24×24 stroke icons, inlined to keep the bundle small and the
 * set visually consistent. Decorative by default; pass a `title` when an icon
 * is the only label for a control.
 */
export type IconName =
  | 'dumbbell'
  | 'home'
  | 'history'
  | 'trending'
  | 'scale'
  | 'settings'
  | 'plus'
  | 'minus'
  | 'check'
  | 'x'
  | 'chevron-right'
  | 'chevron-left'
  | 'chevron-down'
  | 'search'
  | 'trash'
  | 'clock'
  | 'flame'
  | 'trophy'
  | 'layers'
  | 'play'
  | 'pause'
  | 'rotate'
  | 'download'
  | 'google'
  | 'eye'
  | 'eye-off'
  | 'logout'
  | 'note'
  | 'target'
  | 'wifi-off'
  | 'arrow-up'
  | 'arrow-down'
  | 'more'
  | 'copy'
  | 'calendar'
  | 'calculator'
  | 'link'
  | 'bookmark'
  | 'moon'
  | 'skip-forward'
  | 'pencil'
  | 'star'
  | 'grip'
  | 'arrow-right'
  | 'check-circle'
  | 'users'
  | 'user-plus'
  | 'bell'
  | 'share'
  | 'send'
  | 'zap'
  | 'crown'
  | 'swords'
  | 'at'
  | 'hand'
  | 'medal'

const PATHS: Record<IconName, string> = {
  dumbbell: 'M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11',
  home: 'M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H4a1 1 0 0 1-1-1z',
  history:
    'M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 8v4l3 2',
  trending: 'M3 17l6-6 4 4 8-8M21 7h-5M21 7v5',
  scale:
    'M4 21h16M6 21V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v13M12 6V3M9.5 12.5 12 9l2.5 3.5z',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.35.4.65.73.85.3.18.64.27.98.26H21a2 2 0 1 1 0 4h-.09c-.68.01-1.29.42-1.51 1.05z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  'chevron-right': 'M9 18l6-6-6-6',
  'chevron-left': 'M15 18l-6-6 6-6',
  'chevron-down': 'M6 9l6 6 6-6',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
  trash: 'M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6M10 11v6M14 11v6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  flame:
    'M12 22c4.42 0 8-3.13 8-7 0-4.5-4-6.5-4-11 0 0-1.5 2.5-3.5 4C10 9.5 8 11.5 8 15c0 1.6.8 3 2 3.9',
  trophy:
    'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H5a2 2 0 0 0 2 4M17 6h2a2 2 0 0 1-2 4',
  layers: 'M12 2 2 7l10 5 10-5zM2 12l10 5 10-5M2 17l10 5 10-5',
  play: 'M6 4l14 8-14 8z',
  pause: 'M8 5v14M16 5v14',
  rotate: 'M21 12a9 9 0 1 1-3-6.7M21 4v4h-4',
  download: 'M12 3v12M7 11l5 5 5-5M4 20h16',
  google:
    'M21.35 11.1H12v3.2h5.35c-.25 1.35-1.85 3.95-5.35 3.95A6.25 6.25 0 1 1 16.3 7.6l2.45-2.35A9.75 9.75 0 1 0 12 21.75c5.6 0 9.4-3.95 9.4-9.5 0-.4-.02-.75-.05-1.15z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  'eye-off':
    'M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M6.5 6.7C4 8.3 2 12 2 12s3.5 7 10 7c2 0 3.7-.65 5.1-1.6M21.4 14.2c.4-.8.6-1.4.6-1.4s-3.5-7-10-7',
  logout: 'M15 17l5-5-5-5M20 12H9M13 3H5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h8',
  note: 'M5 3h9l5 5v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M8 13h8M8 17h5',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  'wifi-off':
    'M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 3-1.8M2 8.8A15 15 0 0 1 6 6.4M22 8.8a15 15 0 0 0-8.5-2.7M19 12.9a10 10 0 0 0-2-1.4M12 20h.01',
  'arrow-up': 'M12 20V5M5 12l7-7 7 7',
  'arrow-down': 'M12 4v15M19 12l-7 7-7-7',
  more: 'M12 6h.01M12 12h.01M12 18h.01',
  copy: 'M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  calendar:
    'M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM8 3v4M16 3v4M4 11h16',
  calculator:
    'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01',
  link: 'M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5',
  bookmark: 'M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  'skip-forward': 'M5 4l10 8-10 8zM19 5v14',
  pencil: 'M17 3l4 4L7.5 20.5 3 21l.5-4.5zM15 5l4 4',
  star: 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  'arrow-right': 'M4 12h16M13 5l7 7-7 7',
  'check-circle': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.5l3 3 5-6',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  'user-plus':
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
  share: 'M4 12v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8M16 6l-4-4-4 4M12 2v13',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  zap: 'M13 2 3 14h9l-1 8 10-12h-9z',
  crown: 'M2 18h20M3 7l4.5 4L12 4l4.5 7L21 7l-2 11H5z',
  swords:
    'M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M9.5 6.5 13 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2',
  at: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8',
  hand:
    'M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15',
  medal:
    'M7.2 2h9.6l-2.4 6.4M9.6 8.4 7.2 2M12 22a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 18v-4l-1 1',
}

const FILLED: IconName[] = ['play', 'google']

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  /** Accessible name. Omit for purely decorative icons. */
  title?: string
  size?: number
}

export function Icon({ name, title, size = 20, className, ...rest }: IconProps) {
  const filled = FILLED.includes(name)
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      <path d={PATHS[name]} />
    </svg>
  )
}
