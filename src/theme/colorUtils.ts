type RGBA = [r: number, g: number, b: number, a: number]

export function parseColor(value: string): RGBA | null {
  value = value.trim()

  // #RGB or #RRGGBB or #RRGGBBAA
  if (value.startsWith('#')) {
    const hex = value.slice(1)
    if (hex.length === 3) {
      return [
        parseInt(hex[0]! + hex[0]!, 16),
        parseInt(hex[1]! + hex[1]!, 16),
        parseInt(hex[2]! + hex[2]!, 16),
        1,
      ]
    }
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
        1,
      ]
    }
    if (hex.length === 8) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
        parseInt(hex.slice(6, 8), 16) / 255,
      ]
    }
    return null
  }

  // rgb(...) or rgba(...)
  const m = value.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/,
  )
  if (m) {
    return [
      Number(m[1]),
      Number(m[2]),
      Number(m[3]),
      m[4] !== undefined ? Number(m[4]) : 1,
    ]
  }

  return null
}

export function toRgba(rgba: RGBA): string {
  const [r, g, b, a] = rgba
  if (a === 1)
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`
}

function rgbToHsl(
  r: number,
  g: number,
  b: number,
): [h: number, s: number, l: number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [h * 360, s * 100, l * 100]
}

function hslToRgb(
  h: number,
  s: number,
  l: number,
): [r: number, g: number, b: number] {
  h = ((h % 360) + 360) % 360
  s = Math.max(0, Math.min(100, s)) / 100
  l = Math.max(0, Math.min(100, l)) / 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0,
    g = 0,
    b = 0
  if (h < 60) {
    r = c
    g = x
  } else if (h < 120) {
    r = x
    g = c
  } else if (h < 180) {
    g = c
    b = x
  } else if (h < 240) {
    g = x
    b = c
  } else if (h < 300) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

function withHsl(
  color: string,
  fn: (h: number, s: number, l: number) => [number, number, number],
): string {
  const rgba = parseColor(color)
  if (!rgba) return color
  const [h, s, l] = rgbToHsl(rgba[0], rgba[1], rgba[2])
  const [nh, ns, nl] = fn(h, s, l)
  const [r, g, b] = hslToRgb(nh, ns, nl)
  return toRgba([r, g, b, rgba[3]])
}

export function darken(color: string, amount: number): string {
  return withHsl(color, (h, s, l) => [h, s, l - amount])
}

export function lighten(color: string, amount: number): string {
  return withHsl(color, (h, s, l) => [h, s, l + amount])
}

export function alpha(color: string, amount: number): string {
  const rgba = parseColor(color)
  if (!rgba) return color
  return toRgba([rgba[0], rgba[1], rgba[2], amount])
}

export function hue(color: string, rotate: number): string {
  return withHsl(color, (h, s, l) => [h + rotate, s, l])
}

export function saturate(color: string, amount: number): string {
  return withHsl(color, (h, s, l) => [h, s + amount, l])
}
