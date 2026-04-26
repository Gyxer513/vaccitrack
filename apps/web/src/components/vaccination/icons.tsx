import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

const base = (size = 16): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
})

export function IconSyringe({ size, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="m18 2 4 4" />
      <path d="m17 7 3-3" />
      <path d="M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5" />
      <path d="m9 11 4 4" />
      <path d="m5 19-3 3" />
      <path d="m14 4 6 6" />
    </svg>
  )
}

export function IconShieldAlert({ size, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  )
}

export function IconChevronRight({ size, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

export function IconCheck({ size, strokeWidth = 2.5, ...p }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} {...p}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

export function IconAlertCircle({ size, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  )
}

export function IconFileText({ size, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  )
}

export function IconClock({ size, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

export function IconActivity({ size, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.5.5 0 0 1-.96 0L9.24 2.18a.5.5 0 0 0-.96 0L5.93 10.54A2 2 0 0 1 4 12H2" />
    </svg>
  )
}

export function IconSparkles({ size, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M9.94 13.06 8 17l-1.94-3.94L2 11l4.06-1.94L8 5l1.94 4.06L14 11z" />
      <path d="M18 3 17 6l-3 1 3 1 1 3 1-3 3-1-3-1z" />
      <path d="M20 14l-1 2-2 1 2 1 1 2 1-2 2-1-2-1z" />
    </svg>
  )
}

export function IconTrendingUp({ size, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  )
}

export function IconArrowLeft({ size, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  )
}

export function IconSettings({ size, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}
