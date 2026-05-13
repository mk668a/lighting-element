type Point = { x: number; y: number }
type Bolt = { points: Point[]; branches: Point[][] }
type Effect = {
  element: HTMLElement
  origin: Point
  bolts: Bolt[]
  start: number
  duration: number
}

const CANVAS_FLAG = 'data-lightning-canvas'
const activeEffects: Effect[] = []
let canvasEl: HTMLCanvasElement | null = null
let canvasCtx: CanvasRenderingContext2D | null = null
let animating = false

function syncCanvasSize() {
  if (!canvasEl || !canvasCtx) return
  const dpr = window.devicePixelRatio || 1
  const vw = window.innerWidth
  const vh = window.innerHeight
  canvasEl.width = vw * dpr
  canvasEl.height = vh * dpr
  canvasEl.style.width = `${vw}px`
  canvasEl.style.height = `${vh}px`
  canvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function ensureCanvas(): CanvasRenderingContext2D | null {
  if (canvasEl && canvasCtx) return canvasCtx
  const existing = document.querySelector(
    `canvas[${CANVAS_FLAG}]`
  ) as HTMLCanvasElement | null
  canvasEl = existing ?? document.createElement('canvas')
  if (!existing) {
    canvasEl.setAttribute(CANVAS_FLAG, 'true')
    canvasEl.style.cssText =
      'position:fixed;top:0;left:0;pointer-events:none;z-index:2147483647;'
    document.body.appendChild(canvasEl)
    window.addEventListener('resize', syncCanvasSize)
  }
  canvasCtx = canvasEl.getContext('2d')
  if (canvasCtx) syncCanvasSize()
  return canvasCtx
}

function jagged(
  start: Point,
  end: Point,
  iterations: number,
  displacement: number,
  decay = 0.5
): Point[] {
  let points: Point[] = [start, end]
  let disp = displacement
  for (let iter = 0; iter < iterations; iter++) {
    const next: Point[] = []
    for (let i = 0; i < points.length - 1; i++) {
      const s = points[i]
      const e = points[i + 1]
      const dx = e.x - s.x
      const dy = e.y - s.y
      const len = Math.hypot(dx, dy) || 1
      const nx = -dy / len
      const ny = dx / len
      const off = (Math.random() * 2 - 1) * disp
      next.push(s, {
        x: (s.x + e.x) / 2 + nx * off,
        y: (s.y + e.y) / 2 + ny * off
      })
    }
    next.push(points[points.length - 1])
    points = next
    disp *= decay
  }
  return points
}

function buildBolt(origin: Point, angle: number, distance: number): Bolt {
  const end: Point = {
    x: origin.x + Math.cos(angle) * distance,
    y: origin.y + Math.sin(angle) * distance
  }
  const points = jagged(origin, end, 6, distance * 0.25)

  const branches: Point[][] = []
  const branchCount = Math.random() < 0.7 ? 1 + Math.floor(Math.random() * 2) : 0
  for (let b = 0; b < branchCount; b++) {
    const idx = Math.floor(points.length * (0.3 + Math.random() * 0.6))
    const base = points[idx]
    const branchAngle = angle + (Math.random() - 0.5) * (Math.PI * 0.8)
    const branchLen = distance * (0.2 + Math.random() * 0.4)
    const branchEnd: Point = {
      x: base.x + Math.cos(branchAngle) * branchLen,
      y: base.y + Math.sin(branchAngle) * branchLen
    }
    branches.push(jagged(base, branchEnd, 4, branchLen * 0.25))
  }

  return { points, branches }
}

function drawPath(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  width: number,
  alpha: number
) {
  ctx.lineWidth = width
  ctx.strokeStyle = `hsla(190, 100%, 85%, ${alpha})`
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y)
  }
  ctx.stroke()
}

function tick(now: number) {
  if (!canvasEl || !canvasCtx) {
    animating = false
    return
  }
  const ctx = canvasCtx
  const vw = window.innerWidth
  const vh = window.innerHeight
  ctx.clearRect(0, 0, vw, vh)

  ctx.globalCompositeOperation = 'lighter'
  ctx.shadowBlur = 18
  ctx.shadowColor = 'hsl(190, 100%, 80%)'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  for (let i = activeEffects.length - 1; i >= 0; i--) {
    const eff = activeEffects[i]
    const t = (now - eff.start) / eff.duration
    if (t >= 1) {
      activeEffects.splice(i, 1)
      continue
    }
    const envelope = Math.pow(1 - t, 1.4)
    const flicker = 0.7 + Math.random() * 0.3
    const alpha = Math.max(0, Math.min(1, envelope * flicker))

    // Translate to current element position so lightning follows scroll/layout
    // and clip to the element's box (respecting border-radius) so it doesn't spill outside
    const rect = eff.element.getBoundingClientRect()
    const cs = getComputedStyle(eff.element)
    const radii: [number, number, number, number] = [
      parseFloat(cs.borderTopLeftRadius) || 0,
      parseFloat(cs.borderTopRightRadius) || 0,
      parseFloat(cs.borderBottomRightRadius) || 0,
      parseFloat(cs.borderBottomLeftRadius) || 0
    ]
    ctx.save()
    ctx.beginPath()
    if (typeof ctx.roundRect === 'function' && radii.some((r) => r > 0)) {
      ctx.roundRect(rect.left, rect.top, rect.width, rect.height, radii)
    } else {
      ctx.rect(rect.left, rect.top, rect.width, rect.height)
    }
    ctx.clip()
    ctx.translate(rect.left, rect.top)

    for (const bolt of eff.bolts) {
      drawPath(ctx, bolt.points, 2, alpha)
      for (const br of bolt.branches) {
        drawPath(ctx, br, 1, alpha * 0.75)
      }
    }

    if (t < 0.35) {
      const ft = t / 0.35
      const radius = 8 + (1 - ft) * 40
      const grad = ctx.createRadialGradient(
        eff.origin.x,
        eff.origin.y,
        0,
        eff.origin.x,
        eff.origin.y,
        radius
      )
      grad.addColorStop(0, `rgba(255,255,255,${(1 - ft) * 0.9})`)
      grad.addColorStop(0.4, `rgba(200,240,255,${(1 - ft) * 0.4})`)
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, rect.width, rect.height)
    }

    ctx.restore()
  }

  if (activeEffects.length > 0) {
    requestAnimationFrame(tick)
  } else {
    animating = false
    ctx.clearRect(0, 0, vw, vh)
  }
}

export function lightning(element: HTMLElement, x: number, y: number) {
  const ctx = ensureCanvas()
  if (!ctx) return

  const rect = element.getBoundingClientRect()
  // Origin and bolts are stored in element-local coordinates so the effect
  // follows the element if it moves/scrolls during the animation.
  const origin: Point = { x: x - rect.left, y: y - rect.top }
  const reach = Math.hypot(rect.width, rect.height)

  const bolts: Bolt[] = []
  const boltCount = 14
  for (let i = 0; i < boltCount; i++) {
    const angle =
      (i / boltCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.35
    const distance = reach * (0.45 + Math.random() * 0.55)
    bolts.push(buildBolt(origin, angle, distance))
  }

  activeEffects.push({
    element,
    origin,
    bolts,
    start: performance.now(),
    duration: 520
  })

  if (!animating) {
    animating = true
    requestAnimationFrame(tick)
  }
}
