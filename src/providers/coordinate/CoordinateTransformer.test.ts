import { describe, expect, it } from 'vitest'
import {
  AMapCoordinateTransformer,
  gcj02ToWgs84,
  wgs84ToGcj02,
} from './CoordinateTransformer'

describe('provider coordinate boundary', () => {
  it('round-trips mainland WGS84 through GCJ-02 without leaking it into canonical data', () => {
    const canonical = { longitude: 118.7969, latitude: 32.0603 }
    const provider = wgs84ToGcj02(canonical)
    const roundTrip = gcj02ToWgs84(provider)
    expect(provider.longitude).not.toBe(canonical.longitude)
    expect(roundTrip.longitude).toBeCloseTo(canonical.longitude, 5)
    expect(roundTrip.latitude).toBeCloseTo(canonical.latitude, 5)
    expect(new AMapCoordinateTransformer().toCanonical(provider)).toEqual(
      roundTrip,
    )
  })

  it('leaves coordinates outside the GCJ-02 region unchanged', () => {
    const tokyo = { longitude: 139.6917, latitude: 35.6895 }
    expect(wgs84ToGcj02(tokyo)).toEqual(tokyo)
    expect(gcj02ToWgs84(tokyo)).toEqual(tokyo)
  })
})
