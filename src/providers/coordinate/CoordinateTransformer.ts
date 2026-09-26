import type { Coordinate } from '../../domain/shared'

export interface CoordinateTransformer<ProviderCoordinate = Coordinate> {
  fromCanonical(coordinate: Coordinate): ProviderCoordinate
  toCanonical(coordinate: ProviderCoordinate): Coordinate
}

export class Wgs84Transformer implements CoordinateTransformer<Coordinate> {
  fromCanonical(coordinate: Coordinate): Coordinate {
    return { ...coordinate }
  }

  toCanonical(coordinate: Coordinate): Coordinate {
    return { ...coordinate }
  }
}

const PI = Math.PI
const AXIS = 6_378_245.0
const ECCENTRICITY_SQUARED = 0.006693421622965943

function outsideMainland(coordinate: Coordinate): boolean {
  return (
    coordinate.longitude < 72.004 ||
    coordinate.longitude > 137.8347 ||
    coordinate.latitude < 0.8293 ||
    coordinate.latitude > 55.8271
  )
}

function transformLatitude(longitude: number, latitude: number): number {
  let value = -100 + 2 * longitude + 3 * latitude + 0.2 * latitude * latitude
  value += 0.1 * longitude * latitude + 0.2 * Math.sqrt(Math.abs(longitude))
  value +=
    ((20 * Math.sin(6 * longitude * PI) + 20 * Math.sin(2 * longitude * PI)) *
      2) /
    3
  value +=
    ((20 * Math.sin(latitude * PI) + 40 * Math.sin((latitude / 3) * PI)) * 2) /
    3
  value +=
    ((160 * Math.sin((latitude / 12) * PI) +
      320 * Math.sin((latitude * PI) / 30)) *
      2) /
    3
  return value
}

function transformLongitude(longitude: number, latitude: number): number {
  let value = 300 + longitude + 2 * latitude + 0.1 * longitude * longitude
  value += 0.1 * longitude * latitude + 0.1 * Math.sqrt(Math.abs(longitude))
  value +=
    ((20 * Math.sin(6 * longitude * PI) + 20 * Math.sin(2 * longitude * PI)) *
      2) /
    3
  value +=
    ((20 * Math.sin(longitude * PI) + 40 * Math.sin((longitude / 3) * PI)) *
      2) /
    3
  value +=
    ((150 * Math.sin((longitude / 12) * PI) +
      300 * Math.sin((longitude / 30) * PI)) *
      2) /
    3
  return value
}

export function wgs84ToGcj02(coordinate: Coordinate): Coordinate {
  if (outsideMainland(coordinate)) return { ...coordinate }
  const { longitude, latitude } = coordinate
  let latitudeDelta = transformLatitude(longitude - 105, latitude - 35)
  let longitudeDelta = transformLongitude(longitude - 105, latitude - 35)
  const latitudeRadians = (latitude / 180) * PI
  let magic = Math.sin(latitudeRadians)
  magic = 1 - ECCENTRICITY_SQUARED * magic * magic
  const rootMagic = Math.sqrt(magic)
  latitudeDelta =
    (latitudeDelta * 180) /
    (((AXIS * (1 - ECCENTRICITY_SQUARED)) / (magic * rootMagic)) * PI)
  longitudeDelta =
    (longitudeDelta * 180) /
    ((AXIS / rootMagic) * Math.cos(latitudeRadians) * PI)
  return {
    longitude: longitude + longitudeDelta,
    latitude: latitude + latitudeDelta,
  }
}

export function gcj02ToWgs84(coordinate: Coordinate): Coordinate {
  if (outsideMainland(coordinate)) return { ...coordinate }
  let estimate = { ...coordinate }
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const projected = wgs84ToGcj02(estimate)
    const longitudeError = projected.longitude - coordinate.longitude
    const latitudeError = projected.latitude - coordinate.latitude
    estimate = {
      longitude: estimate.longitude - longitudeError,
      latitude: estimate.latitude - latitudeError,
    }
    if (Math.abs(longitudeError) < 1e-7 && Math.abs(latitudeError) < 1e-7) break
  }
  return estimate
}

export class AMapCoordinateTransformer implements CoordinateTransformer<Coordinate> {
  fromCanonical(coordinate: Coordinate): Coordinate {
    return wgs84ToGcj02(coordinate)
  }

  toCanonical(coordinate: Coordinate): Coordinate {
    return gcj02ToWgs84(coordinate)
  }
}
