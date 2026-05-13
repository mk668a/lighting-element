export function lightning(element: HTMLElement, x: number, y: number) {
  // if canvas element is already present, remove it
  const canvas = element.nextSibling
  if (canvas && canvas.nodeName === 'CANVAS') {
    element.parentNode!.removeChild(canvas)
  }

  const w = element.clientWidth,
    h = element.clientHeight

  // get parent node of element
  const parentNode = element.parentNode
  // create new div element
  const div = document.createElement('div')

  // created div is inserted as the next sibling of element
  parentNode!.insertBefore(div, element.nextSibling)

  // create new canvas element
  const canvasElem = document.createElement('canvas')
  // if element position is not absolute, set div position to relative
  div.style.position = element.style.position
  if (div.style.position !== 'absolute') {
    div.style.position = 'relative'
  }
  div.style.width = `${w}px`
  div.style.height = `${h}px`

  // create canvas element as a child of div
  div.appendChild(element)
  div.appendChild(canvasElem)

  // canvasElem style
  canvasElem.style.position = 'absolute'
  canvasElem.style.top = '0'
  canvasElem.style.left = '0'
  canvasElem.style.pointerEvents = 'none'

  // element style
  element.style.position = 'absolute'
  element.style.top = '0'
  element.style.left = '0'

  // set canvas width and height
  canvasElem.width = w
  canvasElem.height = h
  // get 2D drawing context of canvas
  const rawCtx = canvasElem.getContext('2d')
  if (!rawCtx) return
  const ctx = rawCtx

  // set center of lightning
  const rect = element.getBoundingClientRect()
  const center = {
    x: x - rect.left,
    y: y - rect.top
  }

  // set constants related to lightning drawing
  const minSegmentHeight = 5
  const groundHeight = h - 20
  const color = 'hsl(180, 80%, 80%)'
  const roughness = 2
  const maxDifference = h // or w

  // set globalCompositeOperation of context to 'lighter'
  ctx.globalCompositeOperation = 'lighter'

  // set strokeStyle, shadowColor, fillStyle of context
  ctx.strokeStyle = color
  ctx.shadowColor = color

  // ctx.fillStyle = color;
  // ctx.fillRect(0, 0, w, h);

  // define a function to create lightning path
  type Point = { x: number; y: number }
  function createLightning(): Point[] {
    let segmentHeight = groundHeight - center.y

    let lightning: Point[] = []

    lightning.push({
      x: center.x,
      y: center.y
    })

    lightning.push({
      x: Math.random() * (w - 100) + 50,
      y: groundHeight + (Math.random() - 0.9) * 50
    })

    let currDiff = maxDifference

    // if current segment height is greater than minSegmentHeight, create new segments
    while (segmentHeight > minSegmentHeight) {
      const newSegments: Point[] = []

      // insert new points between points of previous segment
      for (let i = 0; i < lightning.length - 1; i++) {
        const start = lightning[i]
        const end = lightning[i + 1]
        const midX = (start.x + end.x) / 2
        const newX = midX + (Math.random() * 2 - 1) * currDiff

        newSegments.push(start, {
          x: newX,
          y: (start.y + end.y) / 2
        })
      }

      const last = lightning.pop()
      if (last) newSegments.push(last)
      lightning = newSegments

      currDiff /= roughness
      segmentHeight /= 2
    }

    return lightning
  }

  // define a function to render lightning on canvas
  function render() {
    ctx.shadowBlur = 0
    ctx.globalCompositeOperation = 'source-over'
    // ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter'
    ctx.shadowBlur = 15
    // get lightning path
    const lightning = createLightning()
    ctx.beginPath()
    // draw lightning using lightning path
    for (let i = 0; i < lightning.length; i++) {
      ctx.lineTo(lightning[i].x, lightning[i].y)
    }
    ctx.stroke()

    // request next animation frame
    // requestAnimationFrame(render);
  }

  // draw lightning 3 times from the point where the user clicked
  for (let i = 0; i < 3; i++) {
    requestAnimationFrame(render)
  }
}
