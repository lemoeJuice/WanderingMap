import type { Connection } from './connection'

export function connectionConnects(
  connection: Connection,
  fromPlaceId: string,
  toPlaceId: string,
): boolean {
  if (
    connection.fromPlaceId === fromPlaceId &&
    connection.toPlaceId === toPlaceId
  )
    return true
  return (
    connection.direction === 'bidirectional' &&
    connection.fromPlaceId === toPlaceId &&
    connection.toPlaceId === fromPlaceId
  )
}

export function reachableFrom(
  connection: Connection,
  placeId: string,
): string | undefined {
  if (connection.fromPlaceId === placeId) return connection.toPlaceId
  if (
    connection.direction === 'bidirectional' &&
    connection.toPlaceId === placeId
  )
    return connection.fromPlaceId
  return undefined
}
