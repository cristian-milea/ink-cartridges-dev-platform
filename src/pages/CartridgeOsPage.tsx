import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from '../components/Link'
import { WAITLIST_ENDPOINT } from '../lib/constants'

type Status =
  | { kind: 'idle' }
  | { kind: 'ok'; message: string }
  | { kind: 'error'; message: string }

export function CartridgeOsPage() {
  const enabled = WAITLIST_ENDPOINT !== ''
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!enabled) return

    if (!email.includes('@') || !email.includes('.')) {
      setStatus({ kind: 'error', message: 'Please enter a valid email address.' })
      return
    }

    try {
      const res = await fetch(WAITLIST_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setStatus({ kind: 'ok', message: "Thanks — we'll email you when it's ready." })
      setEmail('')
    } catch {
      setStatus({
        kind: 'error',
        message: 'Something went wrong. Please try again.',
      })
    }
  }

  return (
    <div className="page">
      <span className="ink-badge ink-badge--yellow">Coming soon</span>
      <h1 className="page-title">Cartridge OS</h1>
      <p className="page-lead">Flash it. Slot a cartridge. Done.</p>

      <p className="page-lead">
        Cartridge OS is a standalone installer for the Raspberry Pi that turns a
        Pi and an e-ink screen into a dedicated cartridge machine. One image to
        flash, nothing to configure — it boots straight into the cartridge host,
        pairs with your phone, and puts the entire catalog one tap away.
      </p>

      <ul className="page-points">
        <li>
          <strong>ONE IMAGE, ZERO FIDDLING.</strong> Flash the SD card, power on,
          done — no terminal, no packages, no config files.
        </li>
        <li>
          <strong>THE WHOLE CATALOG, ONE TAP AWAY.</strong> Games, weather,
          clocks — everything installs from your phone over Bluetooth and lands
          on the e-ink in seconds.
        </li>
        <li>
          <strong>E-INK FIRST.</strong> Crisp 1-bit rendering, always-on
          glanceability, battery sips instead of gulps.
        </li>
      </ul>

      <p className="page-lead">
        We're building it right now, and it's going to be the easiest way to put
        a cartridge on a screen — full stop.
      </p>

      <section className="ink-panel waitlist">
        <span className="ink-section-header">Want to know the moment it ships?</span>
        <form className="waitlist-form" onSubmit={(e) => void onSubmit(e)}>
          <input
            type="email"
            className="ink-field"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!enabled}
            aria-label="Email address"
          />
          <button type="submit" className="ink-btn" disabled={!enabled}>
            Notify me
          </button>
        </form>
        {!enabled && <p className="waitlist-note">Sign-ups open soon.</p>}
        {status.kind === 'ok' && <p className="status">{status.message}</p>}
        {status.kind === 'error' && (
          <p className="status status-error">{status.message}</p>
        )}
      </section>

      <div className="page-cross-links">
        <Link to="/" className="ink-btn ink-btn--ghost">
          Browse the catalog while you wait
        </Link>
      </div>
    </div>
  )
}
