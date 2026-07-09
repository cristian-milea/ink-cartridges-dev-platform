import { useEffect, useRef, useState } from 'react'
import { Emulator } from './lib/emulator'
import { EinkCanvas } from './components/EinkCanvas'

const TEST_CARTRIDGE = `
class HelloApp:
    name = "hello"
    icon = "H"
    version = "0.0.1"

    def render(self, draw, w, h):
        draw.text((4, 4), "IT WORKS", fill=0)
`

function App() {
  const [png, setPng] = useState<Uint8Array | null>(null)
  const [log, setLog] = useState<string[]>([])
  const emulatorRef = useRef<Emulator | null>(null)

  useEffect(() => {
    // React 19 StrictMode double-invokes effects in dev; the `cancelled` flag
    // discards the throwaway first Emulator. Intentional — do not "fix".
    let cancelled = false
    const appendLog = (line: string) => setLog((prev) => [...prev, line])

    Emulator.create(appendLog)
      .then(async (emulator) => {
        if (cancelled) return
        emulatorRef.current = emulator
        emulator.onFrame = (frame) => setPng(frame)
        appendLog('pyodide ready')
        const meta = await emulator.load({ py: TEST_CARTRIDGE, stem: 'hello' })
        appendLog(`loaded ${meta.name}`)
      })
      // Surface init failures (CDN load, loadPackage, font/host_alias fetch,
      // or load()) in the log pane instead of an unhandled rejection.
      .catch((err) => appendLog(String(err)))

    return () => {
      cancelled = true
      emulatorRef.current?.stopInterval()
    }
  }, [])

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui' }}>
      <h1>Ink Cartridge Studio</h1>
      <EinkCanvas png={png} />
      <pre>{log.join('\n')}</pre>
    </div>
  )
}

export default App
