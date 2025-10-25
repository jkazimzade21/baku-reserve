export type FloorOverlayType =
  | 'table'
  | 'booth'
  | 'bar'
  | 'dj'
  | 'kitchen'
  | 'entry'
  | 'lounge'
  | 'terrace'
  | 'stage'
  | 'service';

export type FloorOverlay = {
  id: string;
  type: FloorOverlayType;
  title: string;
  subtitle?: string;
  description?: string;
  position: { x: number; y: number }; // percentages (0-100)
  size?: { width: number; height: number }; // percentages (0-100)
  shape?: 'circle' | 'rect';
  rotation?: number;
  occupancy?: {
    total: number;
    available: number;
    onHold?: number;
  };
};

export type FloorPlanDefinition = {
  id: string;
  label?: string;
  variant: 'planA' | 'planB' | 'planC' | 'planD' | 'planE';
  accent: string;
  image: any;
  imageSize: { width: number; height: number };
  overlays: FloorOverlay[];
  quickFacts?: Array<{ label: string; value: string }>;
  legend?: Partial<Record<FloorOverlayType, string>>;
};
