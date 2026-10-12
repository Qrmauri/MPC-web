// Pruebas en un navegador real, sin dependencias de test ni cambios al estado final.
const frame = document.querySelector<HTMLIFrameElement>('iframe')!
const output = document.querySelector<HTMLPreElement>('#results')!
const results: string[] = []
const timings: number[] = []
const errors: string[] = []

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

async function run() {
  const win = frame.contentWindow!
  const doc = frame.contentDocument!
  win.addEventListener('error', (event) => errors.push(event.message))
  win.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)))
  for (let attempt = 0; !doc.querySelector('.pad') && attempt < 60; attempt++) {
    await new Promise<void>((resolve) => win.requestAnimationFrame(() => resolve()))
  }

  function button(label: string): HTMLButtonElement {
    const element = [...doc.querySelectorAll<HTMLButtonElement>('button')]
      .find((item) => item.getAttribute('aria-label') === label || item.textContent?.trim() === label)
    assert(Boolean(element), `No se encontró ${label}`)
    return element!
  }

  function pad(id: number): HTMLButtonElement {
    return [...doc.querySelectorAll<HTMLButtonElement>('.pad')]
      .find((item) => Number(item.querySelector('.pad-number')!.textContent) === id)!
  }

  function key(code: string, type: 'keydown' | 'keyup', repeat = false) {
    // Los eventos se envían al mismo documento que escucha useKeyboardPads.
    doc.body.dispatchEvent(new KeyboardEvent(type, { code, key: code.replace(/^(Key|Digit)/, ''), repeat, bubbles: true, cancelable: true }))
  }

  function active(id: number) { return pad(id).dataset.active === 'true' }
  async function until(predicate: () => boolean, message: string) {
    for (let attempt = 0; !predicate() && attempt < 60; attempt++) {
      await new Promise<void>((resolve) => win.requestAnimationFrame(() => resolve()))
    }
    assert(predicate(), message)
  }

  async function mode(id: number, code: string, value: string) {
    output.textContent = `Configurando pad ${id}: ${value}`
    key(code, 'keydown'); key(code, 'keyup')
    await until(() => doc.querySelector('.mode-selector legend')!.textContent!.includes(`PAD ${String(id).padStart(2, '0')}`), `Selección pendiente de pad ${id} (${code}); LCD: ${doc.querySelector('.lcd')!.textContent}`)
    button(value).click()
    await until(() => pad(id).getAttribute('aria-label')!.includes(`modo ${value}`), `No se aplicó el modo ${value}`)
  }

  try {
    const codes = ['Digit1','Digit2','Digit3','Digit4','KeyQ','KeyW','KeyE','KeyR','KeyA','KeyS','KeyD','KeyF','KeyZ','KeyX','KeyC','KeyV']
    const ids = [13,14,15,16,9,10,11,12,5,6,7,8,1,2,3,4]
    assert(doc.querySelectorAll('.pad').length === 16, 'Deben existir 16 pads visibles')
    // El DOM puede existir antes de que React instale los efectos de teclado.
    for (let attempt = 0; button('One-Shot').matches(':disabled') && attempt < 60; attempt++) {
      key('Digit1', 'keydown'); key('Digit1', 'keyup')
      await new Promise<void>((resolve) => win.requestAnimationFrame(() => resolve()))
    }
    assert(!button('One-Shot').matches(':disabled'), 'El hook de teclado debe estar listo')

    for (let i = 0; i < codes.length; i++) {
      await mode(ids[i], codes[i], 'Gate')
      const start = performance.now()
      key(codes[i], 'keydown')
      assert(active(ids[i]), `La tecla ${codes[i]} no activa su pad`) 
      const style = win.getComputedStyle(pad(ids[i]))
      assert(style.transform.includes('0.96'), 'Debe aplicarse el relieve pulsado')
      timings.push(performance.now() - start)
      key(codes[i], 'keyup')
      assert(!active(ids[i]), `Gate ${ids[i]} no se liberó`)
    }
    results.push('PASS: las 16 teclas activan su pad y Gate se libera al soltar.')

    key('Digit1', 'keydown'); key('Digit2', 'keydown')
    assert(active(13) && active(14), 'Las teclas simultáneas deben mantener ambos pads')
    key('Digit1', 'keyup')
    assert(!active(13) && active(14), 'Soltar una tecla no debe apagar otra')
    key('Digit2', 'keyup')
    results.push('PASS: entradas simultáneas y liberación independiente.')

    await mode(13, 'Digit1', 'Loop')
    key('Digit1', 'keydown'); key('Digit1', 'keydown', true); key('Digit1', 'keyup')
    assert(active(13), 'Loop debe seguir activo e ignorar autorepeat')
    button('PAD BANK B').click()
    await new Promise<void>((resolve) => win.requestAnimationFrame(() => resolve()))
    assert(pad(13).getAttribute('aria-label')!.includes('Banco B'), 'El banco B debe tener slots propios')
    assert(pad(13).getAttribute('aria-label')!.includes('One-Shot'), 'El modo de B debe ser independiente')
    assert(doc.querySelector('.lcd')!.textContent!.includes('64 SLOTS'), 'LCD debe actualizar selección al cambiar banco')
    button('PAD BANK A').click()
    await new Promise<void>((resolve) => win.requestAnimationFrame(() => resolve()))
    assert(active(13), 'Loop del banco A debe conservar su estado')
    key('Digit1', 'keydown'); key('Digit1', 'keyup')
    assert(!active(13), 'La siguiente pulsación debe apagar Loop')
    results.push('PASS: Loop, autorepeat, LCD y modos independientes por banco.')

    key('Digit2', 'keydown')
    win.dispatchEvent(new Event('blur'))
    assert(!active(14), 'Blur debe liberar Gate')
    results.push('PASS: pérdida de foco sin pads atascados.')
    assert(errors.length === 0, errors.join('\n'))
    const maximum = Math.max(...timings)
    assert(maximum < 20, `Respuesta visual tardía: ${maximum.toFixed(2)} ms`)
    results.push(`PASS: feedback DOM + estilo calculado en ${maximum.toFixed(2)} ms máximo (16 teclas).`)
    results.push('PASS: sin errores de ejecución en las pruebas.')
    results.push('Nota: esta medición no mide el refresco físico de la pantalla ni sustituye la prueba multitouch en un móvil.')
  } catch (error) {
    results.push(`FAIL: ${String(error)}`)
  }
  output.textContent = results.join('\n')
}

// Se escucha load antes de navegar; el documento inicial about:blank no es la app.
function onLoad() {
  if (!frame.contentDocument?.querySelector('#root')) return
  frame.removeEventListener('load', onLoad)
  void run()
}
frame.addEventListener('load', onLoad)
frame.src = '/'
