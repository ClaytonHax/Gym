/**
 * Photo → tiny vector mosaic. Firestore on the free plan has no file storage,
 * so a proof photo is turned into a single-line SVG of horizontal pixel runs
 * (a posterised ≤16-colour image) small enough to live inside a document.
 *
 * Render the result ONLY via <img src={svgDataUrl(svg)}> — an <img> never runs
 * scripts, so nothing inside the string can execute.
 */

/** Firestore rules cap the field at 60000 chars; stay well under. */
export const MAX_SVG_CHARS = 55000
/** Portrait 3:4 grid sizes, tried largest first until the SVG fits. */
export const SIZE_STEPS: Array<[number, number]> = [
  [120, 160],
  [108, 144],
  [96, 128],
  [84, 112],
  [72, 96],
  [60, 80],
]
export const MAX_COLOURS = 16

export interface PhotoSvg {
  svg: string
  w: number
  h: number
}

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/* -------------------------------------------------------------------------- */
/* Pure core                                                                   */
/* -------------------------------------------------------------------------- */

interface Bin {
  key: number
  count: number
  r: number
  g: number
  b: number
}
interface Box {
  bins: Bin[]
  total: number
}

const hex2 = (n: number) => n.toString(16).padStart(2, '0')

/** Median-cut palette over a 5-bit-per-channel histogram. */
function buildPalette(rgba: Uint8ClampedArray, colours: number): Array<[number, number, number]> {
  const hist = new Map<number, Bin>()
  for (let i = 0; i < rgba.length; i += 4) {
    const key = ((rgba[i] >> 3) << 10) | ((rgba[i + 1] >> 3) << 5) | (rgba[i + 2] >> 3)
    const bin = hist.get(key)
    if (bin) {
      bin.count++
      bin.r += rgba[i]
      bin.g += rgba[i + 1]
      bin.b += rgba[i + 2]
    } else hist.set(key, { key, count: 1, r: rgba[i], g: rgba[i + 1], b: rgba[i + 2] })
  }
  const all = [...hist.values()]
  const boxes: Box[] = [{ bins: all, total: all.reduce((s, b) => s + b.count, 0) }]

  while (boxes.length < colours) {
    // Split the most populated box that still has more than one colour in it.
    let pick = -1
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].bins.length > 1 && (pick < 0 || boxes[i].total > boxes[pick].total)) pick = i
    }
    if (pick < 0) break
    const box = boxes[pick]
    let lo = [255, 255, 255]
    let hi = [0, 0, 0]
    for (const b of box.bins) {
      const avg = [b.r / b.count, b.g / b.count, b.b / b.count]
      for (let c = 0; c < 3; c++) {
        if (avg[c] < lo[c]) lo[c] = avg[c]
        if (avg[c] > hi[c]) hi[c] = avg[c]
      }
    }
    const range = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]]
    const ch = range[0] >= range[1] && range[0] >= range[2] ? 0 : range[1] >= range[2] ? 1 : 2
    const sorted = [...box.bins].sort((a, b) => {
      const av = ch === 0 ? a.r : ch === 1 ? a.g : a.b
      const bv = ch === 0 ? b.r : ch === 1 ? b.g : b.b
      return av / a.count - bv / b.count
    })
    // Cut where half the pixels (not half the colours) are on each side.
    let acc = 0
    let cut = 1
    for (let i = 0; i < sorted.length - 1; i++) {
      acc += sorted[i].count
      cut = i + 1
      if (acc >= box.total / 2) break
    }
    const left = sorted.slice(0, cut)
    const right = sorted.slice(cut)
    const sum = (bins: Bin[]) => bins.reduce((s, b) => s + b.count, 0)
    boxes.splice(pick, 1, { bins: left, total: sum(left) }, { bins: right, total: sum(right) })
  }

  return boxes.map((box) => {
    let r = 0
    let g = 0
    let b = 0
    for (const bin of box.bins) {
      r += bin.r
      g += bin.g
      b += bin.b
    }
    const n = Math.max(1, box.total)
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)] as [number, number, number]
  })
}

/**
 * Posterise `rgba` (w×h) to at most `colours` colours and emit it as a
 * single-line SVG: one <path> per colour, each a set of merged rectangles.
 */
export function pixelsToSvg(rgba: Uint8ClampedArray, w: number, h: number, colours = MAX_COLOURS): string {
  const palette = buildPalette(rgba, Math.max(1, Math.min(MAX_COLOURS, colours)))

  const nearestCache = new Map<number, number>()
  const nearest = (r: number, g: number, b: number): number => {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
    const hit = nearestCache.get(key)
    if (hit !== undefined) return hit
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < palette.length; i++) {
      const dr = palette[i][0] - r
      const dg = palette[i][1] - g
      const db = palette[i][2] - b
      const d = dr * dr * 2 + dg * dg * 4 + db * db * 3
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    nearestCache.set(key, best)
    return best
  }

  const index = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) index[i] = nearest(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2])

  // Per colour: rectangles [x, y, width, height]. A run that repeats exactly
  // (same x and width) on the next row extends the rectangle instead.
  const rects: Array<Array<[number, number, number, number]>> = palette.map(() => [])
  const open: Array<Map<string, [number, number, number, number]>> = palette.map(() => new Map())
  for (let y = 0; y < h; y++) {
    let x = 0
    while (x < w) {
      const c = index[y * w + x]
      let n = 1
      while (x + n < w && index[y * w + x + n] === c) n++
      const k = `${x},${n}`
      const prev = open[c].get(k)
      if (prev && prev[1] + prev[3] === y) prev[3]++
      else {
        const rect: [number, number, number, number] = [x, y, n, 1]
        rects[c].push(rect)
        open[c].set(k, rect)
      }
      x += n
    }
  }

  let paths = ''
  palette.forEach((rgb, c) => {
    if (rects[c].length === 0) return
    let d = ''
    let px = 0
    let py = 0
    for (const [x, y, n, k] of rects[c]) {
      d += d === '' ? `M${x} ${y}` : `m${x - px} ${y - py}`
      d += `h${n}v${k}h-${n}z`
      px = x
      py = y
    }
    paths += `<path fill="#${hex2(rgb[0])}${hex2(rgb[1])}${hex2(rgb[2])}" d="${d}"/>`
  })

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" ` +
    `preserveAspectRatio="xMidYMid slice">${paths}</svg>`
  )
}

/**
 * Walk SIZE_STEPS (then a last 8-colour pass) until the SVG fits the budget.
 * `getPixels` supplies RGBA for a given grid size; kept separate so the loop
 * is testable without a canvas.
 */
export function fitSvg(
  getPixels: (w: number, h: number) => Uint8ClampedArray,
  maxChars = MAX_SVG_CHARS
): PhotoSvg {
  const attempts: Array<[number, number, number]> = [
    ...SIZE_STEPS.map(([w, h]) => [w, h, MAX_COLOURS] as [number, number, number]),
    [60, 80, 8],
  ]
  for (const [w, h, colours] of attempts) {
    const svg = pixelsToSvg(getPixels(w, h), w, h, colours)
    if (svg.length <= maxChars) return { svg, w, h }
  }
  throw new Error('too-large')
}

/* -------------------------------------------------------------------------- */
/* DOM decoding                                                                */
/* -------------------------------------------------------------------------- */

interface Decoded {
  source: CanvasImageSource
  width: number
  height: number
  close: () => void
}

async function decode(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file)
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() }
    } catch {
      // fall through to <img>
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) }
  } catch (err) {
    URL.revokeObjectURL(url)
    throw err
  }
}

/** Centre-crop to 3:4 portrait, downscale, posterise and vectorise. */
export async function photoToSvg(file: Blob): Promise<PhotoSvg> {
  const img = await decode(file)
  try {
    if (!img.width || !img.height) throw new Error('empty-image')
    // Largest 3:4 window centred in the source.
    let sw = img.width
    let sh = (sw * 4) / 3
    if (sh > img.height) {
      sh = img.height
      sw = (sh * 3) / 4
    }
    const sx = (img.width - sw) / 2
    const sy = (img.height - sh) / 2
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('no-canvas')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    return fitSvg((w, h) => {
      canvas.width = w
      canvas.height = h
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img.source, sx, sy, sw, sh, 0, 0, w, h)
      return ctx.getImageData(0, 0, w, h).data
    })
  } finally {
    img.close()
  }
}
