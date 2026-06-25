export interface SseEvent {
  type: string
  [key: string]: unknown
}

export function parseSseChunk(
  buffer: string,
  chunk: string,
): { events: SseEvent[]; remainder: string } {
  const combined = buffer + chunk
  const lines = combined.split('\n')
  const remainder = lines.pop() ?? ''

  const events: SseEvent[] = []
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue
    events.push(JSON.parse(line.slice(6)) as SseEvent)
  }

  return { events, remainder }
}
