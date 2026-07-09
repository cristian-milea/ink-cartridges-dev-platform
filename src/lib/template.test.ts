import { resolveString, resolveJson, type TemplateCtx } from './template'

const ctx: TemplateCtx = {
  state: { count: 42, msg: 'hi' },
  local: { bet: '10' },
  secret: { worldtides: 'KEY' },
  location: { lat: '50.82', lon: '-0.14', label: 'Brighton' },
}

test('resolves all four scopes', () => {
  expect(resolveString('{{state.msg}} {{local.bet}} {{secret.worldtides}} {{location.lat}}', ctx))
    .toBe('hi 10 KEY 50.82')
})
test('numbers render as literal text', () => {
  expect(resolveString('n={{state.count}}', ctx)).toBe('n=42')
})
test('missing key or unknown scope -> empty string', () => {
  expect(resolveString('[{{state.nope}}][{{bogus.x}}][{{noDot}}]', ctx)).toBe('[][][]')
})
test('whitespace inside braces tolerated', () => {
  expect(resolveString('{{ state.msg }}', ctx)).toBe('hi')
})
test('resolveJson resolves only string leaves, keys untouched', () => {
  const payload = { action: 'deal', bet: '{{local.bet}}', n: 7, deep: ['{{state.msg}}', true] }
  expect(resolveJson(payload, ctx)).toEqual({ action: 'deal', bet: '10', n: 7, deep: ['hi', true] })
})
