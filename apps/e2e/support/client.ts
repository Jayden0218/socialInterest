import { createAppData, MemoryTokenStore, type AppData } from '@sih/mobile/data';
import { baseUrl } from './base-url';
import { mintPerson, type TestPerson } from './identity';
import { createProfile } from './people';

/**
 * T026. Drives THE MOBILE APP'S OWN DATA LAYER against the running API.
 *
 * Not the generated client directly. The client and the API's contract tests are
 * both generated from one OpenAPI document, so they agree with each other by
 * construction - a suite driving the client would be green while the app was
 * broken, which is exactly the state feature 001 shipped in. Going through
 * apps/mobile/src/data means a defect in the app's own request construction fails
 * here.
 */
export interface Actor extends TestPerson {
  handle: string;
  data: AppData;
}

export async function actor(prefix = 'e2e', opts?: { isOperator?: boolean }): Promise<Actor> {
  const person = mintPerson(prefix, opts);
  const handle = await createProfile(person.userId, prefix);
  const tokens = new MemoryTokenStore();
  tokens.set(person.token);
  const data = createAppData({ baseUrl: `${baseUrl()}/v1`, tokens });
  return { ...person, handle, data };
}

/** A signed-out actor - the app with no token, as a first-time visitor has it. */
export function anonymous(): AppData {
  return createAppData({ baseUrl: `${baseUrl()}/v1`, tokens: new MemoryTokenStore() });
}
