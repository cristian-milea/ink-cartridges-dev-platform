import { render, screen, fireEvent } from '@testing-library/react'
import type { DeviceContext } from '../lib/deviceContext'
import { SecretsPanel } from './SecretsPanel'

const emptyDc = (): DeviceContext => ({ location: {}, secrets: {}, permissions: {} })
const manifest = { requires: { secrets: [{ key: 'API_KEY', label: 'API key' }] } }
const noop = () => {}

test('renders label + password input; typing merges secret into dc', () => {
  const changes: DeviceContext[] = []
  render(
    <SecretsPanel
      dc={emptyDc()}
      manifest={manifest}
      persistSecrets={false}
      onChange={(dc) => changes.push(dc)}
      onPersistChange={noop}
    />
  )
  expect(screen.getByText('API key')).toBeTruthy()
  const input = screen.getByPlaceholderText('Enter value...') as HTMLInputElement
  expect(input.type).toBe('password')
  fireEvent.change(input, { target: { value: 'sekret' } })
  expect(changes).toEqual([{ location: {}, secrets: { API_KEY: 'sekret' }, permissions: {} }])
})

test('required-and-unset secret shows a needed badge', () => {
  render(
    <SecretsPanel dc={emptyDc()} manifest={manifest} persistSecrets={false} onChange={noop} onPersistChange={noop} />
  )
  expect(screen.getByText('needed')).toBeTruthy()
})

test('note reflects session-only wording when not persisting', () => {
  render(
    <SecretsPanel dc={emptyDc()} manifest={manifest} persistSecrets={false} onChange={noop} onPersistChange={noop} />
  )
  expect(screen.getByText(/in memory for this browser session only/i)).toBeTruthy()
})

test('note reflects localStorage wording when persisting', () => {
  render(
    <SecretsPanel dc={emptyDc()} manifest={manifest} persistSecrets={true} onChange={noop} onPersistChange={noop} />
  )
  expect(screen.getByText(/Saved in this browser's localStorage/i)).toBeTruthy()
})

test('toggling the checkbox calls onPersistChange', () => {
  const calls: boolean[] = []
  render(
    <SecretsPanel
      dc={emptyDc()}
      manifest={manifest}
      persistSecrets={false}
      onChange={noop}
      onPersistChange={(p) => calls.push(p)}
    />
  )
  fireEvent.click(screen.getByRole('checkbox'))
  expect(calls).toEqual([true])
})
