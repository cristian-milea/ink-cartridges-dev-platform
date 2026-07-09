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
    let cancelled = false
    const appendLog = (line: string) => setLog((prev) => [...prev, line])

    Emulator.create(appendLog).then(async (emulator) => {
      if (cancelled) return
      emulatorRef.current = emulator
      emulator.onFrame = (frame) => setPng(frame)
      appendLog('pyodide ready')
      try {
        const meta = await emulator.load({ py: TEST_CARTRIDGE, stem: 'hello' })
        appendLog(`loaded ${meta.name}`)
      } catch (err) {
        appendLog(String(err))
      }
    })

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
