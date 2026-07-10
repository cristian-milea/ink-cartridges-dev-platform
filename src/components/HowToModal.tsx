import { useEffect, useRef } from 'react'

export function HowToModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    else if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="studio-modal"
      onClose={onClose}
      onCancel={onClose}
    >
      <h2 className="studio-modal-title">How to use the studio</h2>

      <section className="studio-modal-section">
        <span className="ink-section-header">The three columns</span>
        <p>
          Left: the e-ink screen (exactly what the Pi renders) with the
          developer console below it. Middle: the phone UI built from ui.json,
          with a SECRETS tab. Right: cartridge info, validation, submit, sync
          and device context.
        </p>
      </section>

      <section className="studio-modal-section">
        <span className="ink-section-header">E-ink screen &amp; pixel grid</span>
        <p>
          The screen is capped at 500px. Toggle "PX GRID" to overlay a per-pixel
          grid and hover it to read the x,y coordinate under the cursor (in
          250×122 screen space) for positioning.
        </p>
      </section>

      <section className="studio-modal-section">
        <span className="ink-section-header">Console</span>
        <p>
          Shows your cartridge's print() output ([app]), system events ([sys])
          and errors ([err]). Flip "verbose" on to also see every screen repaint
          ([dbg]), including timed refreshes. Clear wipes it.
        </p>
      </section>

      <section className="studio-modal-section">
        <span className="ink-section-header">Phone UI &amp; the d-pad</span>
        <p>
          The middle column is your ui.json rendered live. Buttons and sliders
          push data into the cartridge's on_data and it re-renders. Swipe or
          click the d-pad for directional input.
        </p>
      </section>

      <section className="studio-modal-section">
        <span className="ink-section-header">Secrets</span>
        <p>
          The SECRETS tab holds any values the manifest asks for. They stay in
          memory for this browser session only unless you tick "save in
          localStorage".
        </p>
      </section>

      <section className="studio-modal-section">
        <span className="ink-section-header">Sync &amp; data sources</span>
        <p>
          If the cartridge declares a data_source, use the Sync card to fetch
          live data. Some public APIs allow browser requests (e.g. Open-Meteo);
          others block CORS or need a key, and the Sync button tells you when it
          can't run.
        </p>
      </section>

      <section className="studio-modal-section">
        <span className="ink-section-header">Validate &amp; submit</span>
        <p>
          Validate runs the real catalog checker. Once it passes, Submit gives
          you copy-paste steps to open a pull request.
        </p>
      </section>

      <section className="studio-modal-section">
        <span className="ink-section-header">Local editing</span>
        <p>
          "Open local folder" watches your files and reloads on save, so you can
          edit in your own IDE. Drag-and-drop (in browsers without folder
          access) loads once — re-drop to refresh.
        </p>
      </section>

      <button
        className="ink-btn ink-btn--ghost studio-modal-close"
        onClick={onClose}
      >
        Close
      </button>
    </dialog>
  )
}
