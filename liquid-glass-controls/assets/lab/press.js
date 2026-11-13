let pointerPress
let keyboardPress

function findPressTarget(event) {
  const target = event.target.closest('[data-press]')
  const control = target?.querySelector('input') ?? target
  return control && !control.disabled ? target : null
}

function setPressState(element, pressed) {
  if (element.hasAttribute('data-pressed') === pressed) return
  element.toggleAttribute('data-pressed', pressed)
  element.dispatchEvent(new Event('glasspress', { bubbles: true }))
}

function releasePointer(event) {
  if (!pointerPress || (event && pointerPress.id !== event.pointerId)) return
  const { element } = pointerPress
  pointerPress = undefined
  if (keyboardPress?.element !== element) setPressState(element, false)
}

function releaseKey(event) {
  if (!keyboardPress || (event?.type === 'keyup' && event.key !== keyboardPress.key)) return
  const { element } = keyboardPress
  keyboardPress = undefined
  delete element.dataset.keyPress
  if (pointerPress?.element !== element) setPressState(element, false)
}

document.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return
  releasePointer()
  const element = findPressTarget(event)
  if (!element) return
  pointerPress = { element, id: event.pointerId }
  setPressState(element, true)
}, { passive: true })

for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  window.addEventListener(type, releasePointer, true)
}

document.addEventListener('keydown', event => {
  if (event.repeat || (event.key !== ' ' && event.key !== 'Enter')) return
  const element = findPressTarget(event)
  if (!element) return
  releaseKey()
  keyboardPress = { element, key: event.key }
  element.dataset.keyPress = ''
  setPressState(element, true)
})

window.addEventListener('keyup', releaseKey, true)
document.addEventListener('focusout', event => {
  if (keyboardPress?.element.contains(event.target)) releaseKey()
})
window.addEventListener('blur', () => {
  releasePointer()
  releaseKey()
})
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    releasePointer()
    releaseKey()
  }
})
