const scene = document.querySelector('.scene')
const artwork = document.querySelector('#scene-art')
const lens = document.querySelector('#lens')
const mode = document.querySelector('#render-mode')
const refraction = document.querySelector('#refraction')
const blur = document.querySelector('#blur')
const visible = document.querySelector('#show-glass')
const palettes = [
  { name: '极光', base: '#110b2a', glow: '#5226ab', colors: [254, 195, 292] },
  { name: '余烬', base: '#210d19', glow: '#a62e45', colors: [346, 35, 9] },
  { name: '深海', base: '#071f2c', glow: '#176277', colors: [202, 154, 179] }
]

let paletteIndex = 0
let position = { x: .52, y: .51 }
let drag
let glass
let frame
let samples

// Paint the backdrop once for both the visible scene and the upstream shader.
function paintScene(canvas, index) {
  const paint = canvas.getContext('2d')
  if (!paint) return
  const { width, height } = canvas.getBoundingClientRect()
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const palette = palettes[index]
  const gradient = paint.createRadialGradient(width * .35, height * .2, 0, width * .35, height * .2, width * .76)
  gradient.addColorStop(0, palette.glow)
  gradient.addColorStop(1, palette.base)
  paint.fillStyle = gradient
  paint.fillRect(0, 0, width, height)

  const ribbons = [
    { hue: palette.colors[0], center: .25, width: .40, phase: 0, tilt: -.42 },
    { hue: palette.colors[1], center: .50, width: .28, phase: .7, tilt: -.50 },
    { hue: palette.colors[2], center: .74, width: .43, phase: 1.25, tilt: -.50 }
  ]
  for (const ribbon of ribbons) {
    for (let strand = 0; strand < 104; strand++) {
      const t = strand / 103
      const light = Math.sin(Math.PI * t)
      const shimmer = .72 + .28 * Math.sin(t * 35 + ribbon.phase)
      paint.lineWidth = 1
      paint.strokeStyle = `hsla(${ribbon.hue + t * 35}, 95%, ${34 + 44 * light}%, ${.06 + .58 * light * shimmer})`
      paint.beginPath()
      for (let step = 0; step <= 110; step++) {
        const x = step / 110
        const fold = Math.sin(x * 7 - ribbon.phase) * (.17 + t * .13)
        const ripple = Math.sin(x * 14 + t * 3 + ribbon.phase) * .07
        const y = ribbon.center + (t - .5) * ribbon.width + fold + ripple + (x - .5) * ribbon.tilt
        if (step === 0) paint.moveTo(x * width, y * height)
        else paint.lineTo(x * width, y * height)
      }
      paint.stroke()
    }
  }

  const shade = paint.createLinearGradient(0, 0, width, height)
  shade.addColorStop(0, '#06051622')
  shade.addColorStop(.5, '#06051600')
  shade.addColorStop(1, '#06051666')
  paint.fillStyle = shade
  paint.fillRect(0, 0, width, height)
}

function moveLens(x, y) {
  const width = scene.clientWidth
  const height = scene.clientHeight
  const margin = lens.offsetWidth / 2 + 5
  position = {
    x: Math.min(1 - margin / width, Math.max(margin / width, x)),
    y: Math.min(1 - margin / height, Math.max(margin / height, y))
  }
  lens.style.left = `${position.x * 100}%`
  lens.style.top = `${position.y * 100}%`
  requestRender()
}

function glassBlurRadius(value) {
  return .65 + Number(value) * .103
}

function syncControls() {
  document.querySelector('#refraction-value').value = `${refraction.value}%`
  document.querySelector('#blur-value').value = `${blur.value}%`
  for (const input of [refraction, blur]) {
    input.closest('.glass-range').style.setProperty('--progress', Number(input.value) / 100)
  }
  lens.style.setProperty('--frost', `${Number(blur.value) * .16}px`)
  lens.toggleAttribute('data-off', !visible.checked)
  const webgl = Boolean(glass?.gl_refs.gl && !glass.gl.isContextLost())
  lens.toggleAttribute('data-webgl', webgl)
  refraction.disabled = !visible.checked || !(webgl || samples?.hasRefraction())
  blur.disabled = !visible.checked
  mode.textContent = !visible.checked ? '原始画面' : webgl ? 'WEBGL 折射' : '磨砂预览'
  samples?.setControls(refraction.value, blur.value, visible.checked)
  requestRender()
}

function requestRender() {
  if (frame || !visible.checked || !glass?.gl_refs.gl || glass.gl.isContextLost()) return
  frame = requestAnimationFrame(() => {
    frame = undefined
    if (!visible.checked || glass.gl.isContextLost()) return
    const { gl, edgeIntensityLoc, rimIntensityLoc, blurRadiusLoc } = glass.gl_refs
    const strength = Number(refraction.value) / 100
    gl.uniform1f(edgeIntensityLoc, strength * .10)
    gl.uniform1f(rimIntensityLoc, strength * .09)
    gl.uniform1f(blurRadiusLoc, glassBlurRadius(blur.value))
    glass.render()
  })
}

function refreshScene() {
  paintScene(artwork, paletteIndex)
  moveLens(position.x, position.y)
  const refs = glass?.gl_refs
  if (!refs?.gl || refs.gl.isContextLost()) return
  const { gl, texture, textureSizeLoc, resolutionLoc, borderRadiusLoc } = refs
  const size = Math.round(lens.getBoundingClientRect().width)
  if (glass.canvas.width !== size || glass.canvas.height !== size) {
    glass.canvas.width = glass.canvas.height = size
    glass.canvas.style.width = glass.canvas.style.height = '100%'
    glass.canvas.style.borderRadius = '50%'
    gl.viewport(0, 0, size, size)
    gl.uniform2f(resolutionLoc, size, size)
    gl.uniform1f(borderRadiusLoc, size / 2)
  }
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, artwork)
  gl.uniform2f(textureSizeLoc, artwork.width, artwork.height)
  requestRender()
}

function setupGlass() {
  if (typeof Container !== 'function' || matchMedia('(prefers-reduced-transparency: reduce), (prefers-contrast: more)').matches) return
  // Bind the scene canvas directly as the library texture and draw on demand.
  class SceneGlass extends Container {
    init() {
      this.createElement()
      this.element.setAttribute('aria-hidden', 'true')
      lens.querySelector('.lens-face').after(this.element)
      this.canvas.addEventListener('webglcontextlost', syncControls)
      this.setupCanvas()
      if (!this.gl) return
      const size = Math.round(lens.getBoundingClientRect().width)
      this.canvas.width = this.canvas.height = size
      this.borderRadius = size / 2
      this.setupShader(artwork)
      const { gl, cornerBoostLoc, rippleEffectLoc } = this.gl_refs
      if (gl) {
        gl.uniform1f(cornerBoostLoc, 0)
        gl.uniform1f(rippleEffectLoc, 0)
      }
    }

    getPosition() {
      const bounds = scene.getBoundingClientRect()
      const surface = lens.getBoundingClientRect()
      return {
        x: surface.left + surface.width / 2 - bounds.left,
        y: surface.top + surface.height / 2 - bounds.top
      }
    }

    startRenderLoop() {
      this.render = () => {
        const { gl, containerPositionLoc } = this.gl_refs
        const { x, y } = this.getPosition()
        gl.uniform2f(containerPositionLoc, x, y)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
      }
    }
  }

  glass = new SceneGlass({ type: 'circle', tintOpacity: .065 })
}

lens.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return
  const rect = lens.getBoundingClientRect()
  drag = { id: event.pointerId, x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 }
  lens.setPointerCapture(event.pointerId)
  lens.dataset.dragging = ''
})
lens.addEventListener('pointermove', event => {
  if (drag?.id !== event.pointerId) return
  const bounds = scene.getBoundingClientRect()
  moveLens((event.clientX - bounds.left - drag.x) / bounds.width, (event.clientY - bounds.top - drag.y) / bounds.height)
})
lens.addEventListener('lostpointercapture', () => {
  drag = undefined
  delete lens.dataset.dragging
})
lens.addEventListener('keydown', event => {
  const offsets = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
  if (!Object.hasOwn(offsets, event.key)) return
  event.preventDefault()
  const [x, y] = offsets[event.key]
  const step = event.shiftKey ? 28 : 10
  moveLens(position.x + step * x / scene.clientWidth, position.y + step * y / scene.clientHeight)
})

for (const control of [refraction, blur, visible]) control.addEventListener('input', syncControls)
for (const radio of document.querySelectorAll('[name="scene"]')) {
  radio.addEventListener('change', () => selectPalette(Number(radio.value)))
}

function selectPalette(index) {
  paletteIndex = index
  document.querySelector('#scene-label').textContent = `0${index + 1} / ${palettes[index].name}`
  document.querySelector(`[name="scene"][value="${index}"]`).checked = true
  refreshScene()
  samples?.setPalette(index)
}

document.querySelector('#reset').addEventListener('click', () => {
  refraction.value = refraction.defaultValue
  blur.value = blur.defaultValue
  visible.checked = visible.defaultChecked
  moveLens(.52, .51)
  selectPalette(0)
  syncControls()
})

if (artwork.getContext('2d')) {
  paintScene(artwork, paletteIndex)
  setupGlass()
  new ResizeObserver(refreshScene).observe(scene)
}
if (typeof Button === 'function') {
  samples = setupGlassSamples(paintScene, palettes, {
    setPalette: selectPalette,
    setBlur(value) {
      blur.value = value
      syncControls()
    },
    setVisibility(value) {
      visible.checked = value
      syncControls()
    }
  })
}
syncControls()
