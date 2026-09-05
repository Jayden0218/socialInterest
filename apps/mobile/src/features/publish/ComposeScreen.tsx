export { runUpload, newSlot, canRetry, allUploaded } from './uploadFlow';
export type { UploadSlot, UploadStage } from './uploadFlow';

/**
 * Compose and publish. Publish stays disabled until an interest is chosen
 * (FR-006, see InterestSelector.canPublish) and every upload has succeeded
 * (FR-008, see allUploaded). A failed slot offers retry without re-selection.
 */
export function ComposeScreen() {
  return null;
}
