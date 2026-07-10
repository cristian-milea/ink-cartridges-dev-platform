import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react'
import { navigate, usePath } from '../lib/router'

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string
  children: ReactNode
}

/**
 * Renders a real <a href> so cmd/middle-click open a new tab as usual;
 * a plain left-click is intercepted and routed client-side. Sets
 * aria-current="page" when `to` is the active path.
 */
export function Link({ to, children, onClick, ...rest }: LinkProps) {
  const path = usePath()

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e)
    if (e.defaultPrevented) return
    // Let the browser handle modified clicks (new tab/window) and non-left clicks.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(to)
  }

  return (
    <a href={to} onClick={handleClick} aria-current={path === to ? 'page' : undefined} {...rest}>
      {children}
    </a>
  )
}
