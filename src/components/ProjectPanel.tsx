import { useState } from 'react'
import { useProjectStore } from '../store/useProjectStore'
import { audioEngine } from '../hooks/useAudioEngine'
import { sequencer } from '../hooks/useSequencer'
import { captureProject, restoreProject } from '../projects/session'
import { listProjects, MAX_PROJECT_BYTES, parseProject, readProject, saveProject } from '../projects/project'

export function ProjectPanel() {
  const name = useProjectStore((state) => state.name)
  const busy = useProjectStore((state) => state.busy)
  const [names, setNames] = useState(listProjects)
  const [selected, setSelected] = useState('')
  const [message, setMessage] = useState('Guarda tu sesión o llévala contigo en un JSON.')
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<void>) {
    if (useProjectStore.getState().busy) return
    useProjectStore.setState({ busy: true }); setError(null); setMessage('Procesando proyecto…')
    try { await action() }
    catch (error) { setError(error instanceof Error ? error.message : 'No se pudo completar la operación.'); setMessage('La operación no se completó.') }
    finally { useProjectStore.setState({ busy: false }) }
  }

  return <section className="project-panel" aria-label="Proyectos" aria-busy={busy}>
    <div className="section-line"><span className="silkscreen">PROJECT / JSON</span><span className="silkscreen muted">FASE 06</span></div>
    <fieldset className="project-fields" disabled={busy}>
      <legend className="sr-only">Guardar, cargar e importar proyectos</legend>
      <label>Nombre del proyecto<input type="text" aria-label="Nombre del proyecto" maxLength={80} value={name} onChange={(event) => useProjectStore.setState({ name: event.target.value })} /></label>
      <button type="button" className="mode-button" disabled={!name.trim()} onClick={() => { void run(async () => {
        const project = await captureProject(name, audioEngine)
        saveProject(project); setNames(listProjects()); setSelected(project.name); setMessage(`Proyecto «${project.name}» guardado en este navegador.`)
      }) }}>Guardar proyecto</button>
      <button type="button" className="mode-button" disabled={!name.trim()} onClick={() => { void run(async () => {
        const project = await captureProject(name, audioEngine)
        const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
        if (blob.size > MAX_PROJECT_BYTES) throw new Error('El JSON supera 32 MB. Reduce el tamaño de los samples.')
        const url = URL.createObjectURL(blob), link = document.createElement('a')
        link.href = url; link.download = `${project.name.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 80) || 'mpc-project'}.json`
        document.body.append(link); link.click(); link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        setMessage('Archivo JSON exportado con tus samples locales.')
      }) }}>Exportar JSON</button>
      <label>Proyectos guardados<select aria-label="Proyectos guardados" value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Selecciona un proyecto</option>{names.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
      <button type="button" className="mode-button" disabled={!selected} onClick={() => { void run(async () => {
        const project = readProject(selected)
        await restoreProject(project, audioEngine, sequencer.stop); setMessage(`Proyecto «${project.name}» cargado. Pulsa PLAY para comenzar.`)
      }) }}>Cargar proyecto</button>
      <label className="project-import">Importar proyecto JSON<input type="file" aria-label="Importar proyecto JSON" accept=".json,application/json" onChange={(event) => {
        const input = event.currentTarget, file = input.files?.[0]
        if (!file) return
        void run(async () => {
          if (file.size > MAX_PROJECT_BYTES) throw new Error('El archivo supera 32 MB.')
          const project = parseProject(await file.text())
          await restoreProject(project, audioEngine, sequencer.stop)
          setMessage(`Proyecto «${project.name}» importado. Pulsa Guardar proyecto para conservarlo en este navegador.`)
        }).finally(() => { input.value = '' })
      }} /></label>
    </fieldset>
    <p className="project-status" role="status">{message}</p>
    {error && <p className="sample-error" role="alert">{error}</p>}
    <p className="project-note">El JSON incluye los archivos de audio. Guardar con el mismo nombre actualiza ese proyecto.</p>
  </section>
}
