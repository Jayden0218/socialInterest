import { startApi } from './api-process';
import { resetStore } from './reset';

/**
 * One store reset and one API process for the whole suite. Per-file boots would
 * cost several seconds each and, sharing one table, would race. jest runs this
 * suite with --runInBand for the same reason.
 */
export default async function globalSetup(): Promise<void> {
  resetStore();
  process.env['E2E_BASE_URL'] = await startApi(Number(process.env['E2E_API_PORT'] ?? 3111));
}
