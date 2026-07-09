import jsonLogic from 'json-logic-js'
import { type TemplateCtx } from './template'

export function evalWhen(rule: unknown, ctx: TemplateCtx): boolean {
  if (rule === null || typeof rule !== 'object' || Array.isArray(rule)) return false
  const keys = Object.keys(rule as object)
  if (keys.length !== 1) return false
  try {
    return Boolean(
      jsonLogic.apply(rule as Parameters<typeof jsonLogic.apply>[0], {
        state: ctx.state, local: ctx.local, secret: ctx.secret, location: ctx.location,
      }),
    )
  } catch {
    return false
  }
}
