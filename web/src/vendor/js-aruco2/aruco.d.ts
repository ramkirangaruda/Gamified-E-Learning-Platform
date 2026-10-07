// Hand-written declaration for the vendored aruco.js (a plain JS port, no types of its
// own) -- covers only the surface this app actually calls (AR.Detector's constructor
// and detect()), not js-aruco2's full API.
export interface ArMarker {
  id: number;
  corners: { x: number; y: number }[];
  hammingDistance: number;
}

export interface ArDetectorConfig {
  dictionaryName?: string;
  maxHammingDistance?: number;
}

export interface ArDetectorInstance {
  detect(image: { width: number; height: number; data: Uint8ClampedArray | number[] }): ArMarker[];
}

export interface ArDictionaryDef {
  nBits: number;
  tau: number | null;
  codeList: (number | string | number[])[];
}

export interface ArNamespace {
  Detector: new (config?: ArDetectorConfig) => ArDetectorInstance;
  DICTIONARIES: Record<string, ArDictionaryDef>;
}

export declare const AR: ArNamespace;
