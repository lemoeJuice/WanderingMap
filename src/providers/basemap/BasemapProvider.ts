export interface BasemapProvider {
  readonly id: string
  readonly name: string
  getStyleUrl(): string
}

export class OpenFreeMapProvider implements BasemapProvider {
  readonly id = 'openfreemap'
  readonly name = 'OpenFreeMap'

  getStyleUrl(): string {
    return 'https://tiles.openfreemap.org/styles/liberty'
  }
}

export class CustomStyleProvider implements BasemapProvider {
  readonly id = 'custom'
  readonly name = 'Custom style'

  constructor(private readonly styleUrl: string) {
    let parsedUrl: URL
    try {
      parsedUrl = new URL(styleUrl)
    } catch {
      throw new Error('Basemap style must be an http(s) URL')
    }
    if (!/^https?:$/.test(parsedUrl.protocol)) {
      throw new Error('Basemap style must be an http(s) URL')
    }
  }

  getStyleUrl(): string {
    return this.styleUrl
  }
}
