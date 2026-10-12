import { YouTubePanel } from './YouTubePanel'
import { LCDDisplay } from './LCDDisplay'
import { PadGrid } from './PadGrid'
import { Transport } from './Transport'
import { BANKS, useMPCStore } from '../store/useMPCStore'
import { useKeyboardPads } from '../hooks/useKeyboardPads'
import { PadModeSelector } from './PadModeSelector'
import { PadAudioControls } from './PadAudioControls'
import { useAudioEngine } from '../hooks/useAudioEngine'
import { useSequencer } from '../hooks/useSequencer'
import { StepSequencer } from './StepSequencer'
import { ProjectPanel } from './ProjectPanel'
import { TempoControl } from './TempoControl'
import { MIDIPanel } from './MIDIPanel'
import { useProjectStore } from '../store/useProjectStore'

export function MPCShell() {
  const bank = useMPCStore((state) => state.bank)
  const setBank = useMPCStore((state) => state.setBank)
  const audioStatus = useMPCStore((state) => state.audioStatus)
  const audioError = useMPCStore((state) => state.audioError)
  const { loadSample } = useAudioEngine()
  const sequencer = useSequencer()
  const busy = useProjectStore((state) => state.busy)
  useKeyboardPads()

  return (
    <main className="studio">
      <a className="skip-link" href="#mpc-workspace">Ir al instrumento</a>
      <header className="page-heading">
        <span className="eyebrow"><i /> VIRTUAL BEAT MACHINE</span>
        <h1>El ritmo empieza aquí.</h1>
        <p>Dieciséis pads. Cuatro bancos. Tu próximo beat.</p>
      </header>
      <section className="mpc-shell" aria-label="MPC Studio">
        <span className="screw screw-tl" aria-hidden="true" />
        <span className="screw screw-tr" aria-hidden="true" />
        <span className="screw screw-bl" aria-hidden="true" />
        <span className="screw screw-br" aria-hidden="true" />
        <header className="device-header">
          <div className="brand">MPC<span>STUDIO</span></div>
          <span className="device-caption">MUSIC PRODUCTION CONTROLLER</span>
          <span className="power"><i /> POWER</span>
        </header>
        <details className="project-drawer"><summary>Proyectos · Guardar / cargar</summary><ProjectPanel /></details>
        <div id="mpc-workspace" tabIndex={-1} inert={busy}>
        <div className="device-body">
          <section className="pad-section" aria-label="Pads y bancos">
            <div className="section-line"><span className="silkscreen">PAD BANK</span><span className="silkscreen muted">16 VELOCITY PADS</span></div>
            <div className="bank-row">
              {BANKS.map((item) => (
                <button type="button" key={item} aria-label={`PAD BANK ${item}`} aria-pressed={bank === item}
                  className={`bank-button${bank === item ? ' bank-button--active' : ''}`}
                  onClick={() => setBank(item)}>
                  <span className="bank-led" />{item}
                </button>
              ))}
            </div>
            <PadGrid onLoadSample={loadSample} />
            <div className="pad-footer"><span>1234 / QWER / ASDF / ZXCV</span><span className="amber">BANK {bank} · 16/64</span></div>
            <p className="drop-hint">Arrastra un .wav sobre cualquier pad para cargarlo.</p>
          </section>
          <div className="control-section">
            <div className="section-line"><span className="silkscreen">MAIN DISPLAY</span><span className="silkscreen muted">LCD</span></div>
            <LCDDisplay />
            <TempoControl />
            <div className="display-caption"><span className="status-led" /> {audioStatus === 'running' ? 'AUDIO LISTO' : 'TOCA PARA ACTIVAR AUDIO'}<span>FASE 06</span></div>
            {audioError && <p className="sample-error" role="alert">{audioError}</p>}
            <PadModeSelector />
            <PadAudioControls onLoadSample={loadSample} />
            <div className="divider" />
            <div className="section-line"><span className="silkscreen">TRANSPORT</span><span className="silkscreen muted">SEQUENCE CONTROL</span></div>
            <Transport {...sequencer} />
            <div className="phase-note"><span className="phase-number">06</span><div><strong>Tu próxima sesión.</strong><p>Guarda tu beat.<br />Llévalo contigo en un JSON.</p></div></div>
          </div>
        </div>
        <MIDIPanel />
        <StepSequencer {...sequencer} />
        <YouTubePanel />
        </div>
        <footer className="device-footer"><span>MPC / WEB EDITION</span><span>DESIGNED FOR YOUR NEXT IDEA</span></footer>
      </section>
      <footer className="page-footer"><span className="footer-line" /> SAMPLES + LIVE CHOPS <span className="footer-line" /></footer>
    </main>
  )
}
