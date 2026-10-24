import { describe, expect, it } from 'vitest'
import { MAX_SVG_CHARS, SIZE_STEPS, fitSvg, pixelsToSvg, svgDataUrl } from './photoSvg'

function solid(w: number, h: number, rgb: [number, number, number]) {
  const px = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) px.set([...rgb, 255], i * 4)
  return px
}

function noise(w: number, h: number) {
  const px = new Uint8ClampedArray(w * h * 4)
  let s = 12345
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
  for (let i = 0; i < w * h; i++) px.set([rnd() * 256, rnd() * 256, rnd() * 256, 255], i * 4)
  return px
}

const fills = (svg: string) => new Set([...svg.matchAll(/fill="(#[0-9a-f]{6})"/g)].map((m) => m[1]))

describe('pixelsToSvg', () => {
  it('emits a valid single-line svg whose viewBox matches', () => {
    const svg = pixelsToSvg(noise(30, 40), 30, 40)
    expect(svg.startsWith('<svg ')).toBe(true)
    expect(svg).not.toMatch(/\n/)
    expect(svg).toContain('viewBox="0 0 30 40"')
    expect(svg.endsWith('</svg>')).toBe(true)
  })

  it('uses at most 16 distinct fills', () => {
    expect(fills(pixelsToSvg(noise(120, 160), 120, 160)).size).toBeLessThanOrEqual(16)
    expect(fills(pixelsToSvg(noise(60, 80), 60, 80, 8)).size).toBeLessThanOrEqual(8)
  })

  it('renders a solid image as exactly one path', () => {
    const svg = pixelsToSvg(solid(20, 30, [250, 100, 20]), 20, 30)
    expect(svg.match(/<path /g)).toHaveLength(1)
    expect(svg).toContain('d="M0 0h20v30h-20z"')
  })
})

describe('fitSvg', () => {
  it('steps down until noisy images fit the budget', () => {
    const tried: number[] = []
    const out = fitSvg((w, h) => {
      tried.push(w)
      return noise(w, h)
    })
    expect(out.svg.length).toBeLessThanOrEqual(MAX_SVG_CHARS)
    expect(out.svg.startsWith('<svg ')).toBe(true)
    expect(out.svg).not.toMatch(/\n/)
    expect(out.svg).toContain(`viewBox="0 0 ${out.w} ${out.h}"`)
    expect(tried[0]).toBe(SIZE_STEPS[0][0])
    expect(out.w / out.h).toBeCloseTo(0.75)
  })

  it('keeps full size when it already fits', () => {
    expect(fitSvg((w, h) => solid(w, h, [0, 0, 0])).w).toBe(120)
  })

  it('throws when nothing fits', () => {
    expect(() => fitSvg((w, h) => noise(w, h), 100)).toThrow('too-large')
  })
})

describe('svgDataUrl', () => {
  it('encodes as an svg data url', () => {
    const url = svgDataUrl('<svg a="1"></svg>')
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true)
    expect(url).not.toContain('<')
  })
})
