function setupGlassSamples(paintBackdrop, palettes, controls) {
  const stage = document.querySelector('.sample-stage')
  const art = document.querySelector('#sample-art')
  const status = document.querySelector('#sample-status')
  const mode = document.querySelector('#sample-mode')
  const materialReadout = document.querySelector('#sample-material')
  const range = document.querySelector('#sample-range')
  const rangeValue = document.querySelector('#sample-range-value')
  const rangeShell = range.closest('.glass-range')
  const visibility = document.querySelector('#sample-switch')
  const rangeTrack = rangeShell.querySelector('.glass-range-track')
  const switchTrack = visibility.nextElementSibling
  const thumbTexture = document.createElement('canvas')
  thumbTexture.width = 128
  thumbTexture.height = 64
  const thumbPaint = thumbTexture.getContext('2d')
  const reduceTransparency = matchMedia('(prefers-reduced-transparency: reduce), (prefers-contrast: more)')
  let palette = 0
  let tinted = false
  let rippling = false
  let inputFrame
  let refraction = 0
  let blurRadius = glassBlurRadius(0)
  let showGlass = true

  function positionInStage() {
    const stageRect = stage.getBoundingClientRect()
    const rect = this.element.getBoundingClientRect()
    return {
      x: rect.left - stageRect.left + rect.width / 2,
      y: rect.top - stageRect.top + rect.height / 2
    }
  }

  // The gallery uses native buttons for input and the library for its shader passes.
  class SampleButton extends Button {
    init() {
      super.createElement()
      const nativeButton = document.createElement('button')
      nativeButton.type = 'button'
      nativeButton.className = 'glass-container sample-surface sample-button'
      nativeButton.dataset.shape = this.type
      nativeButton.dataset.press = ''
      nativeButton.append(this.canvas)
      this.element = nativeButton
    }

    createTextElement() {
      this.textElement = document.createElement('span')
      this.textElement.textContent = this.text
      this.element.append(this.textElement)
    }

    setSizeFromText() {}
    startRenderLoop() {}
    startNestedRenderLoop() {}
  }

  class SampleSurface extends Container {
    init() {
      super.createElement()
      this.element.classList.add('sample-surface')
    }

    // ResizeObserver sizes the parent and both child passes together.
    updateSizeFromDOM() {}
    startRenderLoop() {}
  }

  function toggle(control, description, action) {
    const active = control.element.getAttribute('aria-pressed') === 'true'
    control.element.setAttribute('aria-pressed', String(!active))
    action(!active)
    status.textContent = `${description} · ${active ? '关闭' : '开启'}`
    renderSamples()
  }

  const background = new SampleButton({
    text: '换背景 ↗', type: 'rounded', tintOpacity: .09,
    onClick: () => controls.setPalette((palette + 1) % palettes.length)
  })
  const favorite = new SampleButton({
    text: '♡', type: 'circle', tintOpacity: .09,
    onClick: () => toggle(favorite, '收藏材质', active => {
      favorite.textElement.textContent = active ? '♥' : '♡'
    })
  })
  const warp = new SampleButton({
    text: '中心扭曲', type: 'pill', tintOpacity: .09,
    onClick: () => toggle(warp, '中心扭曲', active => { warp.warp = active })
  })
  const tint = new SampleButton({
    text: '染色', type: 'pill', tintOpacity: .12,
    onClick: () => toggle(tint, '玻璃染色', active => { tinted = active })
  })
  const ripple = new SampleButton({
    text: '≈', type: 'circle', tintOpacity: .12,
    onClick: () => toggle(ripple, '表面波纹', active => { rippling = active })
  })
  for (const control of [favorite, warp, tint, ripple]) {
    control.element.setAttribute('aria-pressed', 'false')
  }
  favorite.element.setAttribute('aria-label', '收藏材质')
  ripple.element.setAttribute('aria-label', '表面波纹')
  document.querySelector('#shape-buttons').append(background.element, favorite.element, warp.element)

  const dock = new SampleSurface({ borderRadius: 23, tintOpacity: .12 })
  dock.element.classList.add('sample-dock')
  dock.element.setAttribute('role', 'group')
  dock.element.setAttribute('aria-label', '嵌套玻璃工具栏')
  const dockLabel = document.createElement('span')
  dockLabel.className = 'sample-dock-label'
  dockLabel.textContent = 'DOCK'
  dock.element.append(dockLabel)
  dock.addChild(tint)
  dock.addChild(ripple)
  document.querySelector('#sample-dock').append(dock.element)

  const minus = new SampleButton({
    text: '−', type: 'circle', tintOpacity: .12,
    onClick: () => controls.setBlur(Math.max(0, Number(range.value) - 5))
  })
  const plus = new SampleButton({
    text: '+', type: 'circle', tintOpacity: .12,
    onClick: () => controls.setBlur(Math.min(100, Number(range.value) + 5))
  })
  minus.element.setAttribute('aria-label', '模糊减少 5 个百分点')
  plus.element.setAttribute('aria-label', '模糊增加 5 个百分点')
  document.querySelector('#blur-minus').append(minus.element)
  document.querySelector('#blur-plus').append(plus.element)

  const rangeThumb = new SampleSurface({ type: 'rounded', tintOpacity: .17 })
  const switchThumb = new SampleSurface({ type: 'circle', tintOpacity: .23 })
  for (const thumb of [rangeThumb, switchThumb]) {
    thumb.element.classList.add('glass-thumb')
    thumb.element.setAttribute('aria-hidden', 'true')
  }
  range.before(rangeThumb.element)
  visibility.closest('.glass-switch').append(switchThumb.element)

  range.addEventListener('input', () => controls.setBlur(range.value))
  visibility.addEventListener('change', () => controls.setVisibility(visibility.checked))
  const segments = Array.from(document.querySelectorAll('[name="sample-scene"]'))
  for (const segment of segments) {
    segment.addEventListener('change', () => controls.setPalette(Number(segment.value)))
  }

  const segmentGlass = new SampleSurface({ type: 'pill', tintOpacity: .14 })
  segmentGlass.element.classList.add('segment-glass')
  segmentGlass.element.setAttribute('aria-hidden', 'true')
  segments[palette].parentElement.append(segmentGlass.element)

  const surfaces = [background, favorite, warp, dock, tint, ripple, minus, plus, rangeThumb, switchThumb, segmentGlass]
  for (const surface of surfaces) {
    surface.getPosition = positionInStage
    surface.canvas.setAttribute('aria-hidden', 'true')
    surface.canvas.addEventListener('webglcontextlost', renderSamples)
  }

  function resizeSurface(surface) {
    surface.width = surface.element.offsetWidth
    surface.height = surface.element.offsetHeight
    surface.borderRadius = surface.type === 'rounded'
      ? parseFloat(getComputedStyle(surface.element).borderTopLeftRadius)
      : surface.height / 2
    if (surface.canvas.width !== surface.width || surface.canvas.height !== surface.height) {
      surface.canvas.width = surface.width
      surface.canvas.height = surface.height
    }
  }

  function uploadTexture(refs, source) {
    const { gl, texture, textureSizeLoc } = refs
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    gl.uniform2f(textureSizeLoc, source.width, source.height)
  }

  // Paint the track underneath each thumb into the texture it actually refracts.
  function sampleThumbTrack(surface, x, y) {
    const offsetX = thumbTexture.width / 2 - x
    const offsetY = thumbTexture.height / 2 - y
    thumbPaint.clearRect(0, 0, thumbTexture.width, thumbTexture.height)
    thumbPaint.drawImage(art, offsetX, offsetY, stage.clientWidth, stage.clientHeight)
    thumbPaint.fillStyle = getComputedStyle(surface.element.closest('.input-item')).backgroundColor
    thumbPaint.fillRect(0, 0, thumbTexture.width, thumbTexture.height)

    const track = surface === rangeThumb ? rangeTrack : switchTrack
    const rect = track.getBoundingClientRect()
    const bounds = stage.getBoundingClientRect()
    const left = rect.left - bounds.left + offsetX
    const top = rect.top - bounds.top + offsetY
    thumbPaint.beginPath()
    thumbPaint.roundRect(left, top, rect.width, rect.height, rect.height / 2)
    thumbPaint.fillStyle = getComputedStyle(track).backgroundColor
    thumbPaint.fill()
    if (track === rangeTrack && Number(range.value) > 0) {
      thumbPaint.beginPath()
      thumbPaint.roundRect(left, top, rect.width * Number(range.value) / 100, rect.height, rect.height / 2)
      thumbPaint.fillStyle = getComputedStyle(track, '::before').backgroundColor
      thumbPaint.fill()
    }
    uploadTexture(surface.gl_refs, thumbTexture)
  }

  function renderSurface(surface) {
    const { gl_refs: refs, parent } = surface
    const { gl } = refs
    const available = showGlass && gl && !gl.isContextLost() && (!parent || parent.element.hasAttribute('data-webgl'))
    surface.element.toggleAttribute('data-webgl', Boolean(available))
    if (!available) return

    const { x, y } = surface.getPosition()
    const pressed = Boolean(surface.element.closest('[data-pressed]'))
    const isThumb = surface === rangeThumb || surface === switchThumb
    gl.viewport(0, 0, surface.width, surface.height)
    gl.uniform2f(refs.resolutionLoc, surface.width, surface.height)
    gl.uniform1f(refs.borderRadiusLoc, surface.borderRadius)
    gl.uniform1f(refs.edgeIntensityLoc, refraction * (pressed ? .14 : parent ? .11 : .055))
    gl.uniform1f(refs.rimIntensityLoc, refraction * (pressed ? .16 : .085))
    gl.uniform1f(refs.blurRadiusLoc, blurRadius * (pressed || parent ? .82 : 1))
    gl.uniform1f(refs.cornerBoostLoc, refraction * .019)
    gl.uniform1f(refs.rippleEffectLoc, surface === dock && rippling ? refraction * .30 : 0)
    gl.uniform1f(refs.baseIntensityLoc, refraction * .065)
    gl.uniform1f(refs.warpLoc, surface.warp ? 1 : 0)
    gl.uniform1f(refs.tintOpacityLoc, surface === dock && tinted ? .42 : pressed ? .075 : surface.tintOpacity)

    if (parent) {
      const parentPosition = parent.getPosition()
      uploadTexture(refs, parent.canvas)
      gl.uniform2f(refs.buttonPositionLoc, x, y)
      gl.uniform2f(refs.containerPositionLoc, parentPosition.x, parentPosition.y)
      gl.uniform2f(refs.containerSizeLoc, parent.width, parent.height)
    } else if (isThumb && thumbPaint) {
      sampleThumbTrack(surface, x, y)
      gl.uniform2f(refs.containerPositionLoc, thumbTexture.width / 2, thumbTexture.height / 2)
    } else {
      gl.uniform2f(refs.containerPositionLoc, x, y)
    }
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  function renderSamples() {
    surfaces.forEach(renderSurface)
    warp.element.disabled = !warp.element.hasAttribute('data-webgl')
    tint.element.disabled = !dock.element.hasAttribute('data-webgl')
    ripple.element.disabled = tint.element.disabled
    const ready = surfaces.filter(surface => surface.element.hasAttribute('data-webgl')).length
    mode.textContent = !showGlass ? '玻璃已关闭' : ready === surfaces.length ? 'WEBGL 折射' : ready ? '部分磨砂预览' : '磨砂预览'
  }

  function refreshArtwork() {
    paintBackdrop(art, palette)
    for (const surface of surfaces) {
      resizeSurface(surface)
      const usesStageTexture = !surface.parent && (!thumbPaint || (surface !== rangeThumb && surface !== switchThumb))
      if (usesStageTexture && surface.gl_refs.gl && !surface.gl.isContextLost()) {
        uploadTexture(surface.gl_refs, art)
      }
    }
    renderSamples()
  }

  paintBackdrop(art, palette)
  if (!reduceTransparency.matches && art.getContext('2d')) {
    for (const surface of surfaces) {
      resizeSurface(surface)
      if (surface.parent && !surface.parent.gl_refs.gl) continue
      surface.setupCanvas()
      if (!surface.gl) continue
      if (surface.parent) surface.setupDynamicNestedShader()
      else surface.setupShader(art)
    }
  }
  renderSamples()
  new ResizeObserver(refreshArtwork).observe(stage)

  function queueRender() {
    if (inputFrame) return
    inputFrame = requestAnimationFrame(() => {
      inputFrame = undefined
      renderSamples()
    })
  }

  stage.addEventListener('glasspress', event => {
    const button = surfaces.find(surface => surface.element === event.target)
    if (button) renderSurface(button)
    else if (event.target === rangeShell) renderSurface(rangeThumb)
    else if (event.target === visibility.closest('label')) renderSurface(switchThumb)
    else if (event.target === segmentGlass.element.parentElement) renderSurface(segmentGlass)
  })

  return {
    hasRefraction() {
      return surfaces.some(surface => surface.gl_refs.gl && !surface.gl.isContextLost())
    },
    setPalette(index) {
      palette = index
      segments[index].checked = true
      segments[index].parentElement.append(segmentGlass.element)
      status.textContent = `当前背景 · ${palettes[index].name}`
      refreshArtwork()
    },
    setControls(refractionValue, blurValue, isVisible) {
      refraction = Number(refractionValue) / 100
      blurRadius = glassBlurRadius(blurValue)
      showGlass = isVisible
      stage.toggleAttribute('data-glass-off', !isVisible)
      stage.style.setProperty('--sample-frost', `${Number(blurValue) * .16}px`)
      materialReadout.textContent = `折射 ${refractionValue}% · 模糊 ${blurValue}%`
      range.value = blurValue
      rangeValue.value = `${blurValue}%`
      rangeShell.style.setProperty('--progress', Number(blurValue) / 100)
      visibility.checked = isVisible
      range.disabled = !isVisible
      minus.element.disabled = !isVisible || Number(blurValue) === 0
      plus.element.disabled = !isVisible || Number(blurValue) === 100

      queueRender()
    }
  }
}
