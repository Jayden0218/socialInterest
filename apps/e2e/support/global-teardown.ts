import { stopApi } from './api-process';

export default async function globalTeardown(): Promise<void> {
  await stopApi();
}
