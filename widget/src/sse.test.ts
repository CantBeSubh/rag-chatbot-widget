import { test, expect } from 'bun:test'
import { parseSseChunk } from './sse'

test('parses a single complete event in one chunk', () => {
  const { events, remainder } = parseSseChunk('', 'data: {"type":"token","content":"hi"}\n\n')
  expect(events).toEqual([{ type: 'token', content: 'hi' }])
  expect(remainder).toBe('')
})

test('parses multiple complete events in one chunk', () => {
  const chunk = 'data: {"type":"token","content":"a"}\n\ndata: {"type":"token","content":"b"}\n\n'
  const { events, remainder } = parseSseChunk('', chunk)
  expect(events).toEqual([
    { type: 'token', content: 'a' },
    { type: 'token', content: 'b' },
  ])
  expect(remainder).toBe('')
})

test('buffers a line split across two chunks', () => {
  const first = parseSseChunk('', 'data: {"type":"tok')
  expect(first.events).toEqual([])
  expect(first.remainder).toBe('data: {"type":"tok')

  const second = parseSseChunk(first.remainder, 'en","content":"x"}\n\n')
  expect(second.events).toEqual([{ type: 'token', content: 'x' }])
  expect(second.remainder).toBe('')
})

test('ignores SSE comment/keepalive lines', () => {
  const { events, remainder } = parseSseChunk('', ': ping - 123\n\ndata: {"type":"done"}\n\n')
  expect(events).toEqual([{ type: 'done' }])
  expect(remainder).toBe('')
})

test('ignores non-data lines and blank lines', () => {
  const { events, remainder } = parseSseChunk('', 'event: message\ndata: {"type":"done"}\n\n')
  expect(events).toEqual([{ type: 'done' }])
  expect(remainder).toBe('')
})
