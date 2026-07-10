import { Link } from '../components/Link'
import { CopyButton } from '../components/CopyButton'

const SSH_USB = 'ssh pi@10.0.0.2'
const SSH_LAN = 'ssh pi@pwnagotchi.local'

const INSTALL_ONE_LINER = `scp pwnagotchi-plugin/ink-cartridge.py pi@pwnagotchi.local:/tmp/
ssh pi@pwnagotchi.local '
  sudo mv /tmp/ink-cartridge.py /usr/local/share/pwnagotchi/custom-plugins/ &&
  printf "\\n[main.plugins.ink-cartridge]\\nenabled = true\\n" | sudo tee -a /etc/pwnagotchi/config.toml &&
  sudo systemctl restart pwnagotchi
'`

const CONFIG_TOML_BLOCK = `[main.plugins.ink-cartridge]
enabled = true`

const MANUAL_APT = 'sudo apt install python3-dbus python3-gi'

// A real, paste-ready config block with the stock defaults (not a "a | b | c"
// menu) so the Copy button gives something you can drop straight into config.toml.
const CONFIG_FULL = `[main.plugins.ink-cartridge]
enabled = true
transport = "both"
apps_dir = "/usr/local/share/pwnagotchi/ink-cartridge"`

export function PluginInstallPage() {
  return (
    <div className="page">
      <h1 className="page-title">Install the Ink Cartridge plugin</h1>
      <p className="page-lead">
        Install one host plugin once. After that every cartridge in the catalog
        installs from the phone over Bluetooth — no more SSH. The pwnagotchi
        keeps hunting the whole time; "Deactivate" hands the screen back to the
        normal face.
      </p>

      <section className="ink-panel">
        <span className="ink-section-header">What you need</span>
        <ul className="page-points">
          <li>A running pwnagotchi on a recent jayofelony image.</li>
          <li>
            The Ink Cartridge companion app (
            <a
              href="https://apps.apple.com/us/app/ink-cartridge/id6774989679"
              target="_blank"
              rel="noreferrer"
            >
              App Store
            </a>{' '}
            /{' '}
            <a
              href="https://play.google.com/store/apps/details?id=io.github.cristianmilea.inkcartridgeapp"
              target="_blank"
              rel="noreferrer"
            >
              Google Play
            </a>
            ).
          </li>
          <li>Five minutes.</li>
        </ul>
      </section>

      <section className="ink-panel">
        <span className="ink-section-header">Step 1 — Get the plugin file</span>
        <p>
          Grab{' '}
          <a
            href="https://github.com/cristian-milea/ink-cartridges/blob/main/pwnagotchi-plugin/ink-cartridge.py"
            target="_blank"
            rel="noreferrer"
          >
            ink-cartridge.py
          </a>{' '}
          — it's a single readable Python file.
        </p>
      </section>

      <section className="ink-panel">
        <span className="ink-section-header">Step 2 — Reach your device over SSH</span>
        <p>Two options:</p>
        <p>Over a USB cable:</p>
        <div className="page-code-row">
          <pre className="console-pane">{SSH_USB}</pre>
          <CopyButton text={SSH_USB} className="ink-btn ink-btn--ghost" />
        </div>
        <p>
          On the same network (replace <code>pwnagotchi</code> with the device's
          pet name):
        </p>
        <div className="page-code-row">
          <pre className="console-pane">{SSH_LAN}</pre>
          <CopyButton text={SSH_LAN} className="ink-btn ink-btn--ghost" />
        </div>
      </section>

      <section className="ink-panel">
        <span className="ink-section-header">Step 3 — Install it</span>
        <div className="page-code-row">
          <pre className="console-pane">{INSTALL_ONE_LINER}</pre>
          <CopyButton text={INSTALL_ONE_LINER} className="ink-btn ink-btn--ghost" />
        </div>
        <p>Give it ~15 seconds to restart. That's the whole device side.</p>
      </section>

      <details className="ink-panel">
        <summary>Prefer to do it by hand? (or the one-liner failed)</summary>
        <ol className="page-list">
          <li>
            Copy <code>ink-cartridge.py</code> into{' '}
            <code>/usr/local/share/pwnagotchi/custom-plugins/</code>.
          </li>
          <li>
            Append this block to <code>/etc/pwnagotchi/config.toml</code>:
            <div className="page-code-row">
              <pre className="console-pane">{CONFIG_TOML_BLOCK}</pre>
              <CopyButton text={CONFIG_TOML_BLOCK} className="ink-btn ink-btn--ghost" />
            </div>
          </li>
          <li>
            Restart: <code>sudo systemctl restart pwnagotchi</code>.
          </li>
          <li>
            Prerequisites: the Bluetooth link uses BlueZ via python3-dbus +
            python3-gi (recent images include them). If the log shows a dbus/gi
            import error, run{' '}
            <code>sudo apt install python3-dbus python3-gi</code> and restart.
            <div className="page-code-row">
              <pre className="console-pane">{MANUAL_APT}</pre>
              <CopyButton text={MANUAL_APT} className="ink-btn ink-btn--ghost" />
            </div>
          </li>
        </ol>
      </details>

      <section className="ink-panel">
        <span className="ink-section-header">
          Step 4 — Connect the app over Bluetooth
        </span>
        <ul className="page-points">
          <li>
            <strong>iOS / iPadOS:</strong> automatic — just open the app (BLE, no
            pairing).
          </li>
          <li>
            <strong>Android:</strong> pair the pwnagotchi once in the phone's
            Bluetooth settings (Bluetooth Classic), then open the app → Settings →
            choose your device → Connect.
          </li>
        </ul>
        <p>The link never touches the Pi's Wi-Fi radio, so it keeps hunting.</p>
      </section>

      <section className="ink-panel">
        <span className="ink-section-header">Step 5 — Browse and install</span>
        <p>
          Apps tab → Switch app → the catalog. Tap Install (downloads over
          Bluetooth), Activate to show it on the e-ink, Stop to hand the screen
          back to pwnagotchi.
        </p>
      </section>

      <section className="ink-panel">
        <span className="ink-section-header">Config options (optional)</span>
        <p>
          All optional — the defaults already match a stock image. To tweak them,
          use the full block instead of the two-line one above:
        </p>
        <div className="page-code-row">
          <pre className="console-pane">{CONFIG_FULL}</pre>
          <CopyButton text={CONFIG_FULL} className="ink-btn ink-btn--ghost" />
        </div>
        <ul className="page-list">
          <li>
            <code>transport</code> — <code>"rfcomm"</code> (Android),{' '}
            <code>"ble"</code> (iOS), or <code>"both"</code> (default).
          </li>
          <li>
            <code>apps_dir</code> — where downloaded cartridges are stored.
          </li>
        </ul>
      </section>

      <section className="ink-panel">
        <span className="ink-section-header">It's your device — read the code first</span>
        <p>
          The plugin is a single readable Python file, and the build is
          reproducible: <code>python3 build.py</code> regenerates it, and{' '}
          <code>git diff --exit-code ink-cartridge.py</code> producing no diff
          means the shipped file matches its source. The plugin is GPLv3; the
          cartridge catalog is MIT.{' '}
          <a
            href="https://github.com/cristian-milea/ink-cartridges/blob/main/pwnagotchi-plugin/README.md"
            target="_blank"
            rel="noreferrer"
          >
            Read the plugin README.
          </a>
        </p>
      </section>

      <div className="page-cross-links">
        <Link to="/">Browse the catalog</Link>
        <Link to="/cartridge-os">Cartridge OS →</Link>
      </div>
    </div>
  )
}
