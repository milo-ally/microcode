export function textFromArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args)
  if (entries.length === 0) return ''
  return entries
    .slice(0, 4)
    .map(([key, value]) => {
      const raw = typeof value === 'string' ? value : JSON.stringify(value)
      return `${key}=${raw.length > 72 ? `${raw.slice(0, 72)}...` : raw}`
    })
    .join('  ')
}
