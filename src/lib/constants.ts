export const RAW_BASE =
  'https://raw.githubusercontent.com/cristian-milea/ink-cartridges/main/'
export const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/'
export const SCREEN_W = 250
export const SCREEN_H = 122
export const TASKBAR_W = 16
export const ICON_H = 16

/**
 * Cartridge OS waitlist collector endpoint. Empty until a collector exists —
 * the sign-up form on /cartridge-os stays disabled while this is ''. Set it to
 * a POST endpoint accepting `{ email }` JSON to enable the form.
 */
export const WAITLIST_ENDPOINT = ''
