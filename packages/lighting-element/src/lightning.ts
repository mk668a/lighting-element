type Point = { x: number; y: number }
type Polyline = { points: Point[]; cum: number[]; total: number }
// `trunkAt` (in 0..1) is the position along the trunk where this branch
// sprouts — it gates when the branch starts to grow.
// `slow` branches (edge-walkers) animate on a slower timeline and use a
// separate alpha envelope so they stay bright while the trunk fades.
type Branch = Polyline & { trunkAt: number; slow: boolean }
type Bolt = { trunk: Polyline; branches: Branch[] }
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

type Side = 'top' | 'right' | 'bottom' | 'left'

function rayToEdge(
  origin: Point,
  angle: number,
  w: number,
  h: number
): { distance: number; side: Side } {
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  const eps = 1e-6
  const tRight = dx > eps ? (w - origin.x) / dx : Infinity
  const tLeft = dx < -eps ? -origin.x / dx : Infinity
  const tBottom = dy > eps ? (h - origin.y) / dy : Infinity
  const tTop = dy < -eps ? -origin.y / dy : Infinity
  let distance = tRight
  let side: Side = 'right'
  if (tLeft < distance) {
    distance = tLeft
    side = 'left'
  }
  if (tBottom < distance) {
    distance = tBottom
    side = 'bottom'
  }
  if (tTop < distance) {
    distance = tTop
    side = 'top'
  }
  return { distance, side }
}

function toPolyline(points: Point[]): Polyline {
  const cum = [0]
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x
    const dy = points[i].y - points[i - 1].y
    cum.push(cum[i - 1] + Math.hypot(dx, dy))
  }
  return { points, cum, total: cum[cum.length - 1] || 0 }
}

function buildBolt(
  origin: Point,
  angle: number,
  distance: number,
  edgeWalk?: { side: Side; w: number; h: number }
): Bolt {
  const end: Point = {
    x: origin.x + Math.cos(angle) * distance,
    y: origin.y + Math.sin(angle) * distance
  }
  const trunk = toPolyline(jagged(origin, end, 6, distance * 0.18))
  const trunkLen = trunk.total || 1

  const branches: Branch[] = []
  const branchCount = Math.random() < 0.7 ? 1 + Math.floor(Math.random() * 2) : 0
  for (let b = 0; b < branchCount; b++) {
    const idx = Math.floor(trunk.points.length * (0.3 + Math.random() * 0.6))
    const base = trunk.points[idx]
    const branchAngle = angle + (Math.random() - 0.5) * (Math.PI * 0.8)
    const branchLen = distance * (0.2 + Math.random() * 0.4)
    const branchEnd: Point = {
      x: base.x + Math.cos(branchAngle) * branchLen,
      y: base.y + Math.sin(branchAngle) * branchLen
    }
    branches.push({
      ...toPolyline(jagged(base, branchEnd, 4, branchLen * 0.25)),
      trunkAt: trunk.cum[idx] / trunkLen,
      slow: false
    })
  }

  // Runners that travel along the hit edge in both directions so the
  // lightning visibly "spreads" along the component's perimeter once the
  // trunk reaches the edge. These animate slowly on their own timeline.
  if (edgeWalk) {
    const horizontal = edgeWalk.side === 'top' || edgeWalk.side === 'bottom'
    const edgeLen = horizontal ? edgeWalk.w : edgeWalk.h
    for (const dir of [-1, 1]) {
      if (Math.random() < 0.35) continue
      const len = edgeLen * (0.22 + Math.random() * 0.4)
      const target: Point = horizontal
        ? { x: end.x + dir * len, y: end.y }
        : { x: end.x, y: end.y + dir * len }
      branches.push({
        ...toPolyline(jagged(end, target, 5, len * 0.08, 0.5)),
        trunkAt: 1,
        slow: true
      })
    }
  }

  return { trunk, branches }
}

function drawPartial(
  ctx: CanvasRenderingContext2D,
  line: Polyline,
  width: number,
  alpha: number,
  progress: number
) {
  if (progress <= 0 || line.points.length < 2) return
  ctx.lineWidth = width
  ctx.strokeStyle = `hsla(190, 100%, 85%, ${alpha})`
  ctx.beginPath()
  const pts = line.points
  ctx.moveTo(pts[0].x, pts[0].y)
  if (progress >= 1) {
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.stroke()
    return
  }
  const target = line.total * progress
  for (let i = 1; i < pts.length; i++) {
    if (line.cum[i] <= target) {
      ctx.lineTo(pts[i].x, pts[i].y)
      continue
    }
    const segLen = line.cum[i] - line.cum[i - 1]
    const f = segLen > 0 ? (target - line.cum[i - 1]) / segLen : 0
    ctx.lineTo(
      pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f,
      pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f
    )
    break
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
    // Phases (all in fraction-of-duration):
    //   [0, growEnd]        trunk + inner forks grow outward fast
    //   [growEnd, walkerEnd] edge runners grow slowly along the perimeter
    //   anywhere after growEnd the trunk fades; walkers fade after walkerEnd
    const growEnd = 0.3
    const walkerEnd = 0.85
    const trunkProgress = Math.min(1, t / growEnd)
    let trunkEnv: number
    if (t < growEnd) {
      trunkEnv = Math.sqrt(trunkProgress)
    } else {
      trunkEnv = Math.pow(1 - (t - growEnd) / (1 - growEnd), 1.4)
    }
    let walkerEnv: number
    if (t < growEnd) {
      walkerEnv = 0
    } else if (t < walkerEnd) {
      walkerEnv = 1
    } else {
      walkerEnv = Math.pow(1 - (t - walkerEnd) / (1 - walkerEnd), 1.4)
    }
    const flicker = 0.7 + Math.random() * 0.3
    const trunkAlpha = Math.max(0, Math.min(1, trunkEnv * flicker))
    const walkerAlpha = Math.max(0, Math.min(1, walkerEnv * flicker))

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
      drawPartial(ctx, bolt.trunk, 2, trunkAlpha, trunkProgress)
      for (const br of bolt.branches) {
        let bp: number
        let a: number
        if (br.slow) {
          // edge runner: starts at growEnd, finishes at walkerEnd
          if (t <= growEnd) continue
          bp = Math.min(1, (t - growEnd) / Math.max(0.01, walkerEnd - growEnd))
          a = walkerAlpha
        } else {
          // inner fork: starts when trunk's front passes its base
          const startT = br.trunkAt * growEnd
          if (t <= startT) continue
          bp = Math.min(1, (t - startT) / Math.max(0.01, growEnd - startT))
          a = trunkAlpha
        }
        drawPartial(ctx, br, 1, a * 0.75, bp)
      }
    }

    if (t < growEnd) {
      const ft = t / growEnd
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
  const w = rect.width
  const h = rect.height

  const bolts: Bolt[] = []
  const boltCount = 14
  for (let i = 0; i < boltCount; i++) {
    const angle =
      (i / boltCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.35
    const hit = rayToEdge(origin, angle, w, h)
    bolts.push(buildBolt(origin, angle, hit.distance, { side: hit.side, w, h }))
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
