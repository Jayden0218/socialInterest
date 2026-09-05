export interface PickedMedia {
  uri: string;
  kind: 'image' | 'video';
  contentType: string;
  sizeBytes: number;
  durationMs?: number;
}

export function MediaPickerScreen() {
  return null;
}
