import { evalWhen } from './whenLogic'
import type { TemplateCtx } from './template'

const ctx: TemplateCtx = { state: { bank: 90 }, local: { bets_on: true }, secret: {}, location: {} }

test('var over local/state scopes', () => {
  expect(evalWhen({ '==': [{ var: 'local.bets_on' }, true] }, ctx)).toBe(true)
  expect(evalWhen({ '>': [{ var: 'state.bank' }, 100] }, ctx)).toBe(false)
})
test('fail-closed on garbage', () => {
  expect(evalWhen({ frobnicate: [1] }, ctx)).toBe(false)
  expect(evalWhen(undefined, ctx)).toBe(false)
  expect(evalWhen('garbage', ctx)).toBe(false)
  expect(evalWhen({}, ctx)).toBe(false)
})
