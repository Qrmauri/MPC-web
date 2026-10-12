# MPC Web — Proyecto completo (Fase 6)

React + Vite + TypeScript, Zustand, Web Audio API e IFrame Player API de YouTube. Sin dependencias nuevas.

## Ejecutar

Necesitas Node.js 20.19+ o 22.12+ y npm, según los requisitos de Vite. [Guía oficial](https://vite.dev/guide/).

```powershell
cd "C:\Users\mauri\Documents\Codex\2026-10-10\vamos-a-construir-paso-a-paso\outputs\mpc-web"
npm install
npm run dev
```

Abre la URL que indique Vite.

En PowerShell, si la política de ejecución bloquea `npm.ps1`, usa `npm.cmd install` y `npm.cmd run dev`. Para generar la versión de producción: `npm run build`; para verla localmente: `npm run preview`.

## Guardar, cargar, exportar e importar

Abre **Proyectos · Guardar / cargar** para mostrar el panel. Está plegado al entrar para dejar accesible el instrumento en móvil.

1. Carga samples, asigna cues y crea un patrón. Escribe un nombre y pulsa **Guardar proyecto**. El JSON se almacena en localStorage con ese nombre; guardar otra vez actualiza el mismo proyecto.
2. Recarga la página. Selecciona el proyecto en **Proyectos guardados** y pulsa **Cargar proyecto**. Se restauran los 64 slots, sus modos y parámetros, banco/pad seleccionado, patrón, BPM, swing, cuantización, metrónomo, video, volumen/velocidad y cues por video. Los samples se vuelven a decodificar antes de sustituir la sesión.
3. **Exportar JSON** descarga el proyecto con los archivos de audio originales codificados en base64. **Importar proyecto JSON** abre el selector de archivos y restaura ese archivo. Después pulsa Guardar si quieres conservar la importación en el navegador.
4. La carga empieza detenida: no restaura voces, teclas retenidas, grabación, historial UNDO ni playback activo. Pulsa PLAY para reproducir. Un JSON incompatible o un sample que no se pueda decodificar deja intacta la sesión actual y muestra un error accesible.
5. El límite de archivo es 32 MB. La cuota real de localStorage depende del navegador y puede ser menor: si se agota, el guardado previo se conserva y puedes exportar un archivo. Los datos pertenecen al origen (host y puerto); otro puerto/navegador no ve los mismos proyectos. Borrar los datos del sitio elimina los guardados. No hay servidor ni guardado automático de la sesión completa.

Prueba rápida: guarda un beat con un WAV y pasos activos, cambia de banco/tempo, cárgalo, exporta, recarga e importa. Comprueba que el pad vuelve a sonar y el patrón mantiene sus ajustes.

## Probar el secuenciador

1. Arrastra un WAV sobre un pad sin cue de YouTube. Selecciónalo y activa los pasos 1, 5, 9 y 13 en **SEQUENCE 01**. La grilla muestra la pista del pad seleccionado; el contador de cada paso incluye los demás pads/bancos.
2. Pulsa **PLAY** en el transporte o **Play** en el secuenciador. Se repite un compás de 16 semicorcheas. Ajusta **BPM** entre 40 y 240; la LCD sigue el tempo. Activa **Metrónomo** para oír cuatro negras con acento en el primer tiempo.
3. Ajusta la perilla **Swing** entre 0 y 60 %. Retrasa los pasos alternos sin cambiar la duración del compás.
4. Para grabar desde cero, pulsa **REC** y luego **PLAY**. Toca los pads con mouse, multitouch o teclado. REC borra el patrón al comenzar la toma y conserva los golpes al repetir el loop; al desarmar REC puedes escuchar la toma sin añadir más notas. Si activas REC durante playback, inicia la toma nueva en ese momento.
5. **Cuantización** usa la posición más cercana: 1/16 permite todos los pasos; 1/8 coloca golpes en los pasos 1, 3, 5…15. La cuantización respeta el swing. En Gate también se graba la duración hasta soltar la última entrada, de 1 a 16 pasos.
6. Pulsa **OVERDUB** para sumar otros pads o bancos al patrón, conservando las capas existentes. REC y OVERDUB son mutuamente excluyentes. Una pista admite un golpe por pad en cada paso.
7. **STOP** cancela las fuentes y clicks programados, libera las entradas del secuenciador, detiene sus cues y desarma grabación. **ERASE** borra el patrón completo; **UNDO** recupera el estado anterior a la toma o edición. PLAY comienza siempre desde el paso 1.
8. Para secuenciar YouTube, asigna un cue a un pad como se explica abajo, sal del modo asignación y activa sus pasos. Puedes combinar pads locales y cues en el mismo patrón. El video sigue teniendo una sola voz: el último cue del paso toma el control. Entrar en asignación detiene el secuenciador.

Los modos siguen activos: One-Shot reproduce el sample completo o la duración del cue; Loop alterna inicio/parada por cada golpe programado; Gate usa la duración grabada (un paso para notas añadidas con la grilla). Guarda el proyecto para conservar el patrón y sus ajustes tras recargar.

### Reloj y precisión

El tempo se ajusta junto a la LCD con el campo BPM (permite escribir y borrar sin saltar a 40), el deslizador de 40–240 con precisión de 0,1 BPM o los botones +/−. Acepta coma o punto decimal. Enter o salir del campo confirma y limita un valor fuera de rango; un campo vacío conserva el tempo anterior. El tempo controla los pasos del patrón: no hace time-stretch automático de samples ni sincroniza la velocidad de YouTube.

El hook comparte el único AudioContext con los pads. Un temporizador recursivo despierta cada 25 ms y llena una ventana de 100 ms, programando `source.start(tiempo)` y los clicks en `audioContext.currentTime`. El tempo avanza mediante tiempos acumulados del reloj de audio, sin depender de la puntualidad del temporizador. BPM, swing y ediciones se aplican al rellenar la siguiente ventana; lo ya programado puede tardar hasta 100 ms en reflejar el cambio. [Técnica de scheduling de MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques).

YouTube no acepta tiempos futuros de AudioContext: sus comandos se envían cuando vence el paso, con una resolución de despacho de aproximadamente 25 ms, más el buffering y seek propios del reproductor. Los samples locales y el metrónomo usan programación precisa de Web Audio. Si el navegador bloquea la pestaña más allá de la ventana, se omiten pasos vencidos al recuperar el reloj para evitar ráfagas; un AudioContext suspendido congela la secuencia.

## Probar ocho cues de YouTube

1. La demo oficial de YouTube ya está cargada. También puedes pegar un enlace watch, youtu.be, shorts, live o embed y pulsar **Cargar video**.
2. Pulsa **ASIGNAR CUES**. Reproduce o busca una posición con el video o la línea de tiempo inferior.
3. Selecciona un pad con mouse, touch o teclado y pulsa **SET CUE**. Se guarda el tiempo actual, aparece en el pad y la LCD, y se añade un marcador bajo el video.
4. Repite en ocho pads. Ajusta **Duración del chop** para cada cue; sin cue seleccionado define la duración para las próximas asignaciones.
5. Desactiva asignación. Toca `1234 / QWER` para disparar los ocho pads superiores como chops. **One-Shot** reproduce la duración indicada, **Loop** repite el fragmento y se apaga al volver a pulsar, **Gate** continúa hasta soltar la última tecla/dedo o finalizar el video.
6. Ajusta **Velocidad** y **Volumen** del video. La duración está expresada en segundos de video; cambiar la velocidad cambia su duración real.
7. Recarga: los cues de los cuatro bancos se restauran desde localStorage por video ID. Carga otro video y regresa al anterior para comprobar que sus cues son independientes. Los marcadores seleccionan el banco/pad y buscan su posición.
8. **Borrar cue** elimina la asignación. Si ese pad tenía un sample local, vuelve a dispararlo. Mientras tiene cue, el pad controla YouTube y conserva su buffer local sin dispararlo a la vez. Entrar en asignación detiene los loops/chops y los pads solo seleccionan, con feedback visual.

YouTube tiene una sola voz: el último cue toma el control del video. El motor usa `seekTo`, `playVideo` y `pauseVideo`; no descarga audio, no hace scraping y no conecta el audio de YouTube a Web Audio. Los samples locales siguen siendo independientes.

**Limitación conocida: el audio de YouTube no es accesible vía Web Audio API.** Por eso Volume, Pitch, Filter y envelope del pad solo procesan samples locales. Los controles del panel de YouTube actúan sobre el reproductor embebido. El JSON conserva video ID y cues, no el audio ni el video de YouTube.

La precisión y respuesta de los cortes de YouTube dependen de buffering, red y keyframes. No equivale a un sampler de audio con precisión de muestras. Si el navegador bloquea autoplay, pulsa Play dentro del video. Los videos que no permitan reproducción embebida muestran un mensaje para elegir otro. [Referencia oficial de la API](https://developers.google.com/youtube/iframe_api_reference).

El indicador bajo el video muestra el estado de carga y la fracción precargada que informa YouTube. No indica que un cue concreto ya esté en caché ni garantiza que cada seek sea instantáneo. El botón Video puede iniciar la reproducción aunque todavía no se conozca la duración; la línea de tiempo espera a tenerla. Una carga del iframe demasiado larga permite Reintentar. Los samples locales se decodifican una vez y no dependen del buffer de YouTube; para tocar con la menor latencia usa WAV locales. En móvil, One-Shot sigue sonando al soltar; Gate se corta al soltar por diseño y Loop se apaga al pulsar de nuevo.

## Probar el audio

1. Arrastra un archivo `.wav` desde tu equipo sobre un pad, o selecciona el pad y usa **Cargar sample** (también disponible con teclado y en móvil). Aparece el nombre al finalizar `decodeAudioData`.
2. Golpea el pad con mouse, touch o su tecla. El buffer ya está precargado y cada disparo crea una fuente nueva, sin volver a leer ni decodificar el archivo.
3. Selecciona el modo debajo de la LCD:
   - **One-Shot**: reproduce completo, aunque sueltes antes. Los golpes repetidos pueden superponerse.
   - **Loop**: repite el buffer hasta la siguiente pulsación. Cambiar de banco conserva los loops activos.
   - **Gate**: reproduce hasta soltar la última entrada o hasta finalizar el sample. Cambiar banco o perder foco libera los Gate.
4. Arrastra hacia arriba/abajo las perillas **Volume**, **Pitch** y **Filter**. Usa Shift para afinar el arrastre. También funcionan Tab, flechas, Home y End.
5. Volume va de 0 a 100 %. Pitch va de −24 a +24 semitonos, mediante playbackRate: cambia tanto el tono como la velocidad/duración del sample.
6. Elige **Lowpass** o **Highpass** y ajusta Filter entre 20 Hz y 20 kHz. Cambiar tipo restablece el corte a 20 kHz para lowpass o 20 Hz para highpass.
7. Ajusta **Attack** (0–500 ms) y **Release** (0–2000 ms). El attack se aplica al próximo disparo; release suaviza el final del sample y la liberación de Loop/Gate. Si el sample es muy corto, el envelope se acorta para caber en su duración.
8. Prueba otro banco: buffers y ajustes pertenecen a cada uno de los 64 slots. Los pads cargados indican el nombre y la LCD muestra el sample y su reproducción.
9. Suelta un archivo inválido: debe mostrarse un mensaje controlado y conservarse el último sample válido del pad.

El motor usa un único AudioContext con `latencyHint: 'interactive'`, creado/reanudado mediante un gesto del usuario. El primer gesto puede ser un pad, una perilla o una tecla. Si tu navegador no considera el drop un gesto de activación, golpea un pad después de cargarlo.

Los archivos y buffers permanecen en memoria durante la sesión; recargar la página los elimina hasta cargar/importar un proyecto guardado. Se aceptan formatos que el navegador pueda decodificar; WAV PCM es la opción recomendada para probar entre navegadores.

## Teclado y touch

`1234` → pads 13–16; `QWER` → 9–12; `ASDF` → 5–8; `ZXCV` → 1–4. Autorepeat ignorado, múltiples teclas/dedos simultáneos, captura de puntero y limpieza de Gate al perder foco. Los atajos respetan los campos editables.

| Fila visible | Teclas | Pads del banco activo |
| --- | --- | --- |
| Superior | 1 2 3 4 | 13 14 15 16 |
| Segunda | Q W E R | 9 10 11 12 |
| Tercera | A S D F | 5 6 7 8 |
| Inferior | Z X C V | 1 2 3 4 |

Tab/Shift+Tab recorren los controles con foco visible. Enter/Espacio disparan un pad enfocado y activan botones; las perillas aceptan flechas, Home y End. Cada pad anuncia banco, número, modo, tecla, sample y cue. Hay un enlace **Ir al instrumento**, labels en los campos, estado de carga y errores anunciados sin mover el foco. La LCD no recibe foco automáticamente. Durante operaciones de proyecto los controles de edición se desactivan para conservar una captura consistente.

## Compatibilidad y revisión

Se usan Pointer Events con captura por dedo, inputs de archivo nativos, `playsinline` en YouTube y un único AudioContext reanudado en gestos de inicio/fin de touch, click y teclado. Al volver de una interrupción del audio, toca un pad o PLAY para reanudarlo. No se garantiza ejecución en segundo plano: el sistema móvil puede suspender la pestaña. [Prácticas de Web Audio](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices).

La automatización detecta `cancelAndHoldAtTime` y usa una rampa calculada cuando falta; este método no está disponible en todos los navegadores. [Compatibilidad de AudioParam](https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/cancelAndHoldAtTime). No se añadieron dependencias para este ajuste.

| Entorno | Verificación |
| --- | --- |
| Chromium del navegador integrado | Audio real, proyectos, teclado, importación/exportación, consola y diseño responsive comprobados |
| Chrome | APIs revisadas; comparte motor Chromium; pendiente ejecución en Chrome independiente |
| Firefox | Fallback de envelope probado con nodos reales en Chromium; pendiente ejecución en Firefox |
| Safari móvil | Gestos, carga de archivos, layout e iframe inline revisados; pendiente prueba en un iPhone/iPad real |

Para cerrar la comprobación en cada dispositivo: carga un WAV desde Archivos, toca dos pads Gate simultáneos, prueba Loop/One-Shot, ajusta perillas, guarda/carga y exporta/importa JSON, activa PLAY/REC, cambia de aplicación y vuelve a reanudar; prueba los cues tras pulsar Play en el video. Comprueba la consola del navegador. La simulación de ancho móvil no sustituye Safari real. El volumen/velocidad de YouTube dependen de lo admitido por ese reproductor y dispositivo.

Para abrir Vite en un móvil de la misma red: `npm run dev -- --host 0.0.0.0` y visita `http://IP-DE-TU-EQUIPO:PUERTO` usando el puerto que muestre Vite.

## Validación

### Medir rendimiento móvil

Con `npm run dev`, abre `/tests/performance.html` en el navegador, activa un ancho de 390 × 844 y pulsa **Medir rendimiento**. Mantén visible la pestaña. La prueba usa la app real y React Profiler: primero cuatro segundos con reloj de video, después cuatro segundos con 50 golpes. YouTube está simulado para repetir la misma carga sin variaciones de red; no modifica proyectos ni cues guardados.

Muestra commits de React, tiempo de render acumulado, percentil 95 de render e intervalos entre frames, tareas largas y respuesta visual de los pads. Las métricas corresponden al modo desarrollo. El ancho móvil en una computadora no reproduce la CPU de un teléfono ni mide latencia acústica, buffering real, GPU del dispositivo o Safari. Para medir un teléfono real, sirve Vite en la misma red con `npm run dev -- --host 0.0.0.0`, abre esa ruta y ejecuta el test con la pestaña visible; compara ejecuciones en el mismo equipo/navegador.

El reloj visual de YouTube se publica como máximo cada 200 ms; el control de chops sigue revisando el reproductor cada 50 ms. Play, pausa, buffering y cambios de disponibilidad se publican inmediatamente. Reloj, posición, buffer y marcadores tienen sus propias suscripciones; las perillas, URL y controles no se redibujan por cada avance del tiempo. La posición exacta de SET CUE se consulta al reproductor, no al reloj visual.

```powershell
npm run build
node --experimental-strip-types --test tests/store.test.ts tests/youtube.test.ts tests/sequencer.test.ts tests/projects.test.ts
```

- `/tests/browser.html`: prueba regresión de las 16 teclas, bancos, modos y feedback visual.
- `tests/youtube.test.ts`: URLs, persistencia validada por video, ocho chops, posiciones antiguas durante seek, buffering, Gate multitouch, Loop, asignación y cambios de video/volumen/velocidad; reproductor simulado, sin conexión externa.
- `tests/sequencer.test.ts`: 100 compases sin deriva con despertares irregulares a 40/120/240 BPM y swing 0/60 %, REC/OVERDUB, cuantización, duración Gate, despacho YouTube al vencer el paso, tempo, suspensión y STOP.
- `/tests/audio.html`: pulsa **Ejecutar pruebas de audio**, con la pestaña visible. Genera un WAV, lo suelta mediante el mismo manejador de carga del pad, decodifica y verifica señal real con AnalyserNode, un solo contexto, buffers reutilizados, nodos de volumen/pitch/filtro, modos, release, bancos y errores de carga. Se escucharán tonos breves.
  También verifica 32 fuentes programadas anticipadamente con swing en el AudioContext real, STOP, REC/OVERDUB y reproducción de la toma sin regrabarse.
- `tests/projects.test.ts`: validación de esquema/versiones, 64 slots, base64, cuota de almacenamiento, actualizaciones y restauración atómica sin disparar notas. Para ejecutar estos tests usa Node.js 22.18+ con soporte de eliminación de tipos.
- `/tests/audio.html` también restaura un proyecto con WAV real, conserva los bytes y verifica Gate sin `cancelAndHoldAtTime`.

La medición evento → source.start verifica programación inmediata, no la latencia física de los parlantes, el sistema operativo o Bluetooth. La comprobación final de sensación al tocar y multitouch físico se realiza en tu equipo.

## Componentes

- `src/hooks/useAudioEngine.ts`: instancia compartida, primer gesto y limpieza al desmontar/recargar código.
- `src/audio/LocalAudioEngine.ts`: buffers decodificados, voces, filtros y envelopes.
- `src/components/Knob.tsx`: perilla accesible con arrastre vertical y teclado.
- `src/components/PadAudioControls.tsx`: ajustes del slot seleccionado.
- `src/store/useMPCStore.ts`: 64 slots, modos, entradas y parámetros tipados.
- `src/components/YouTubePanel.tsx`: video, asignación, timeline y controles.
- `src/hooks/useYouTubePlayer.ts`: carga de la API, instancia y limpieza del iframe.
- `src/youtube/YouTubeChopController.ts`: disparos, duración por reloj de video, Loop y Gate.
- `src/store/useYouTubeStore.ts` y `src/youtube/cues.ts`: estado, URLs y persistencia por video.
- `src/hooks/useSequencer.ts` y `src/sequencer/Sequencer.ts`: transporte, lookahead, cuantización y grabación.
- `src/components/StepSequencer.tsx` y `src/store/useSequencerStore.ts`: grilla, tempo, swing, metrónomo y patrón de 16 pasos.
- `src/components/ProjectPanel.tsx`, `src/projects/project.ts` y `src/projects/session.ts`: panel, JSON validado, almacenamiento y restauración con samples incluidos.
# Editor de sonido en la LCD

Selecciona un pad con un sample local y pulsa **Editor de sonido** en la pantalla MPC.
La forma de onda muestra todos los canales. Ajusta **Inicio** y **Fin** con los sliders
(touch o flechas del teclado), pulsa **Escuchar selección** y luego **Recortar pad**.
La escucha previa reproduce el audio sin los efectos del pad; el pad mantiene su volumen,
pitch, filtro y modo. **Detener escucha** interrumpe la prueba.

La selección de Inicio y Fin se conserva por pad al cambiar de pad, cambiar de banco
o cerrar y volver a abrir el editor durante la sesión. Cargar un archivo nuevo o restaurar
el original reinicia los límites. Mover los sliders prepara la selección; **Recortar pad**
aplica el corte al sonido. Para conservarlo después de recargar la página, aplica el recorte
y guarda o exporta el proyecto; la selección pendiente de aplicar no se incluye en el JSON.

El recorte reemplaza el sample del pad y se guarda en los proyectos como WAV PCM de 16 bits.
**Restaurar original** recupera el archivo cargado durante la sesión, incluso después de varios
recortes. Al cargar un proyecto, su sample guardado se convierte en el nuevo original;
el archivo anterior al recorte no se incluye en el JSON. Conserva ese archivo aparte si lo necesitas.
La edición solo se aplica a archivos locales; YouTube conserva sus controles de cue y duración.

Prueba con `npm run dev`: carga un WAV, abre el editor, recorta una selección, toca el pad,
restaura el original y exporta/importa un proyecto para comprobar el recorte guardado.
## Controladores físicos MIDI

Abre **Controlador MIDI · Conectar / asignar notas**, pulsa **Conectar MIDI** y acepta
el permiso del navegador. Selecciona tu entrada. El mapeo inicial es notas 36–51 → pads 1–16
del banco activo, en todos los canales MIDI. Para otro mapeo, selecciona un pad en la MPC,
pulsa **Aprender nota del pad seleccionado** y golpea el pad físico. El aprendizaje no toca audio.
Las asignaciones duran durante la sesión y no forman parte del JSON del proyecto.
No se envían mensajes MIDI, no se pide SysEx y la velocidad recibida se utiliza para distinguir
Note On de Note Off, sin modificar el volumen configurado del pad.

La API requiere HTTPS o localhost y permiso explícito. Chrome y Edge son compatibles;
Safari no ofrece Web MIDI. En móvil el dispositivo y su conexión USB también deben ser compatibles.
Referencia: [Web MIDI API, MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API).

Los pads de pantalla disparan desde `pointerdown`; el motor escucha el store de forma síncrona,
sin esperar a un render o efecto de React. MIDI y teclado usan la misma ruta, incluidos Gate,
Loop y grabación. Al desconectar MIDI o perder el foco se liberan sus notas sostenidas.

Prueba con `npm run dev`: carga un WAV, conecta el controlador, aprende una nota y toca en
One-Shot, Loop y Gate. Cambia de banco y prueba REC/OVERDUB. `/tests/midi.html` verifica la
integración mediante una API simulada; la prueba con hardware físico debe hacerse aparte.
## Chop de samples locales

En **Editor de sonido**, ajusta Inicio y Fin y abre **CHOP · Repartir entre pads**.
Elige 2, 4, 8 o 16 partes iguales, banco destino y primer pad. La lista muestra cada destino
y duración; el botón ▶ permite escuchar el corte antes de crearlo. Pulsa **Crear chops**
con el secuenciador detenido, cambia al banco destino y toca los nuevos pads.

El pad original no se reemplaza: los destinos deben excluirlo. Los pads se llenan en orden
numérico ascendente (1–4 en la fila inferior, 13–16 arriba). Si un destino tiene un sample o
cue del video actual, activa la casilla **Reemplazar** para sustituirlo. Ese reemplazo no tiene
deshacer; guarda tu proyecto primero si deseas conservar el contenido de esos destinos.
Los cues de otros videos conservan sus asignaciones cuando vuelvas a esos videos.

Cada chop queda en One-Shot con los parámetros de audio del pad de origen, canales y frecuencia
de muestreo conservados. Se incluye como WAV PCM de 16 bits al guardar/exportar el proyecto.
Esta versión divide en partes iguales; no detecta transitorios ni extrae audio de YouTube.
Prueba con `npm run dev`: crea ocho chops en otro banco, toca sus ocho pads y guarda/carga el JSON.
