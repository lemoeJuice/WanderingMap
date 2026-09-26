import { describe, expect, it } from 'vitest'
import { connectionConnects, reachableFrom } from './direction'
import type { Connection } from './connection'

const base: Connection = {
  id: 'c',
  fromPlaceId: 'a',
  toPlaceId: 'b',
  direction: 'one-way',
  mode: 'walk',
  source: 'manual',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('connection direction', () => {
  it('only permits reverse traversal for bidirectional connections', () => {
    expect(connectionConnects(base, 'a', 'b')).toBe(true)
    expect(connectionConnects(base, 'b', 'a')).toBe(false)
    expect(reachableFrom(base, 'b')).toBeUndefined()
    expect(
      connectionConnects({ ...base, direction: 'bidirectional' }, 'b', 'a'),
    ).toBe(true)
    expect(reachableFrom({ ...base, direction: 'bidirectional' }, 'b')).toBe(
      'a',
    )
  })
})
