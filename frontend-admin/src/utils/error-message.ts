export function getErrorMessage(error: unknown, fallback = ''): string {
  const usableMessage = (value: unknown) => {
    if (typeof value !== 'string') return ''
    const message = value.trim()
    return message && message !== '{}' && message !== '[object Object]' ? message : ''
  }

  if (typeof error === 'string') return usableMessage(error) || fallback

  if (error instanceof Error) {
    const message = usableMessage(error.message)
    if (message) return message

    const cause = (error as Error & { cause?: unknown }).cause
    if (cause && cause !== error) return getErrorMessage(cause, fallback)
    return fallback
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    for (const key of ['message', 'error_description', 'details', 'hint']) {
      const value = record[key]
      const message = usableMessage(value)
      if (message) return message
    }

    try {
      const serialized = JSON.stringify(error)
      const message = usableMessage(serialized)
      if (message) return message
    } catch {
      // Ignore circular error objects and use the fallback below.
    }
  }

  return usableMessage(String(error ?? '')) || fallback
}
