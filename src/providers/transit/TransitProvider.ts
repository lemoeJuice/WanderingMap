import type { Coordinate } from '../../domain/shared'
import type { TransitService } from '../../domain/transit/transit'

export interface TransitProvider {
  getNearbyServices?(coordinate: Coordinate): Promise<TransitService[]>
  getService?(serviceId: string): Promise<TransitService | undefined>
}

export class ManualTransitProvider implements TransitProvider {
  constructor(private readonly services: readonly TransitService[] = []) {}

  async getNearbyServices(): Promise<TransitService[]> {
    return [...this.services]
  }

  async getService(serviceId: string): Promise<TransitService | undefined> {
    return this.services.find((service) => service.id === serviceId)
  }
}
