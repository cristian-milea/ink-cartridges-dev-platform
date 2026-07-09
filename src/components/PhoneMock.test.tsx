import { render, screen, fireEvent } from '@testing-library/react'
import { PhoneMock, type UiAction } from './PhoneMock'

const dc = { location: {}, secrets: {}, permissions: {} }
const noop = () => {}

test('state_text formats published binding with default fallback', () => {
  const ui = { type: 'column', children: [
    { type: 'state_text', binding: 'bank', format: 'Bank: ${}' },
    { type: 'state_text', binding: 'missing', default: 'n/a' },
  ]}
  render(<PhoneMock ui={ui} published={{ bank: 90 }} dc={dc} onAction={noop} />)
  expect(screen.getByText('Bank: $90')).toBeTruthy()
  expect(screen.getByText('n/a')).toBeTruthy()
})

test('button push resolves templates against local state', () => {
  const actions: UiAction[] = []
  const ui = { type: 'column', children: [
    { type: 'select', local: 'bet', default: '10', options: [
      { value: '5', label: '$5' }, { value: '10', label: '$10' }] },
    { type: 'button', label: 'Deal', action: { type: 'push', payload: { action: 'deal', bet: '{{local.bet}}' } } },
  ]}
  render(<PhoneMock ui={ui} published={{}} dc={dc} onAction={(a) => actions.push(a)} />)
  fireEvent.click(screen.getByText('Deal'))
  expect(actions).toEqual([{ type: 'push', payload: { action: 'deal', bet: '10' } }])
})

test('when re-evaluates on local change (switch)', () => {
  const ui = { type: 'column', children: [
    { type: 'switch', local: 'on', label: 'Chips', default: false },
    { type: 'when', if: { '==': [{ var: 'local.on' }, true] },
      then: [{ type: 'text', value: 'BETTING' }],
      else: [{ type: 'text', value: 'CASUAL' }] },
  ]}
  render(<PhoneMock ui={ui} published={{}} dc={dc} onAction={noop} />)
  expect(screen.getByText('CASUAL')).toBeTruthy()
  fireEvent.click(screen.getByRole('checkbox'))
  expect(screen.getByText('BETTING')).toBeTruthy()
})

test('unknown widget type renders placeholder, does not crash', () => {
  render(<PhoneMock ui={{ type: 'hologram' }} published={{}} dc={dc} onAction={noop} />)
  expect(screen.getByText(/unsupported widget/i)).toBeTruthy()
})
