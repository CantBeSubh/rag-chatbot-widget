function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace("#", "")
  if (clean.length !== 6) return null
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ]
}

function toHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0"))
      .join("")
  )
}

function blend(hex1: string, hex2: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(hex1) ?? [255, 255, 255]
  const [r2, g2, b2] = hexToRgb(hex2) ?? [0, 0, 0]
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t)
}

function relativeLuminance(r: number, g: number, b: number): number {
  const linear = (c: number) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

function contrastForeground(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return "#0a0a0a"
  // WCAG threshold: luminance > 0.179 means black text achieves 4.5:1 contrast
  return relativeLuminance(...rgb) > 0.179 ? "#0a0a0a" : "#fafafa"
}

/**
 * Derives a full CSS variable set from one primary + one background hex.
 * - Primary vars: --primary, --primary-foreground, --ring
 * - Background vars (when provided): --background, --card, --foreground,
 *   --muted, --muted-foreground, --border, --input
 * Tailwind's color-mix() handles opacity variants (bg-primary/10 etc.) from these.
 */
export function widgetPalette(
  primaryHex: string,
  backgroundHex?: string,
): Record<string, string> {
  const vars: Record<string, string> = {}

  const primaryRgb = hexToRgb(primaryHex)
  if (primaryRgb) {
    vars["--primary"] = primaryHex
    vars["--primary-foreground"] = contrastForeground(primaryHex)
    vars["--ring"] = primaryHex
  }

  const bgRgb = hexToRgb(backgroundHex ?? "")
  if (bgRgb && backgroundHex) {
    const fg = contrastForeground(backgroundHex)
    vars["--background"] = backgroundHex
    vars["--card"] = backgroundHex
    vars["--foreground"] = fg
    vars["--muted"] = blend(backgroundHex, fg, 0.08)         // subtle surface tint
    vars["--muted-foreground"] = blend(fg, backgroundHex, 0.4) // secondary text
    vars["--border"] = blend(backgroundHex, fg, 0.12)
    vars["--input"] = blend(backgroundHex, fg, 0.06)
  }

  return vars
}
