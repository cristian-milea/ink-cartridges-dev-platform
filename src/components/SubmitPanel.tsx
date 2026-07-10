import { useState } from 'react'
import type { ReactNode } from 'react'
import type { ValidationResult } from './ValidationPanel'

export interface SubmitPanelProps {
  /** Last result from the ValidationPanel above — reused, not re-run. Null before the first check. */
  validation: ValidationResult | null
  name: string
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="ink-panel submit-panel">
      <span className="submit-panel-title">Submit to the catalog</span>
      {children}
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API can be unavailable (permissions, insecure context); silently ignore.
    }
  }

  return (
    <button className="ink-btn ink-btn--ghost submit-panel-copy" onClick={() => void copy()}>
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

export function SubmitPanel({ validation, name }: SubmitPanelProps) {
  if (!validation || validation.status === 'idle' || validation.status === 'checking') {
    return (
      <Panel>
        <p className="submit-panel-hint">Run the CI validator above first.</p>
      </Panel>
    )
  }

  if (validation.status === 'invalid') {
    return (
      <Panel>
        <p className="submit-panel-hint">Fix these validator errors before submitting:</p>
        <ul className="validation-panel-errors">
          {validation.errors.map((e, i) => (
            <li key={i}>✗ {e}</li>
          ))}
        </ul>
      </Panel>
    )
  }

  if (validation.status === 'error') {
    return (
      <Panel>
        <p className="submit-panel-hint">Validator error — can't submit: {validation.message}</p>
      </Panel>
    )
  }

  const forkUrl = 'https://github.com/cristian-milea/ink-cartridges/fork'
  const prUrl = `https://github.com/cristian-milea/ink-cartridges/compare/main...<your-user>:add-${name}?expand=1`
  const cloneScript = [
    'git clone https://github.com/<your-user>/ink-cartridges',
    `mkdir ink-cartridges/apps/${name}`,
    `# copy ${name}.py, ${name}.manifest.json, ${name}.ui.json into it`,
    `cd ink-cartridges && python3 validate_cartridges.py apps/${name}`,
    `git checkout -b add-${name} && git add apps/${name} && git commit -m "apps: add ${name}" && git push -u origin add-${name}`,
  ].join('\n')

  return (
    <Panel>
      <p><span className="ink-badge ink-badge--ink">validated</span> ready to submit</p>

      <ol className="submit-panel-steps">
        <li>
          <p>Fork the catalog repo:</p>
          <a href={forkUrl} target="_blank" rel="noreferrer">
            {forkUrl}
          </a>
        </li>
        <li>
          <div className="submit-panel-code-row">
            <p>Clone your fork, add the files, and push a branch:</p>
            <CopyButton text={cloneScript} />
          </div>
          <pre className="console-pane">{cloneScript}</pre>
        </li>
        <li>
          <p>Open a pull request:</p>
          <a href={prUrl} target="_blank" rel="noreferrer">
            {prUrl}
          </a>
        </li>
      </ol>
    </Panel>
  )
}
