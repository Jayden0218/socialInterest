/**
 * Seeds a place for 004/US2's device journeys, and prints what the flows need.
 *
 * The flow TAPS THE EXISTING MATCH rather than creating one, because FR-014's
 * requirement is that the match is offered BEFORE the create action - and a
 * flow that created its own place would never exercise that ordering.
 *
 * Usage: npx tsx apps/e2e/scripts/seed-place-fixture.ts <device-token>
 * Prints PLACE_NAME=, PLACE_LOCALITY= and PLACE_ID=.
 */
import { createAppData, MemoryTokenStore } from '@sih/mobile/data';
import { baseUrl } from '../support/base-url';

const argToken = process.argv[2];
if (!argToken) {
  process.stderr.write('usage: seed-place-fixture.ts <device-token>\n');
  process.exit(2);
}
const token: string = argToken;

async function main(): Promise<void> {
  const tokens = new MemoryTokenStore();
  tokens.set(token);
  const device = createAppData({ baseUrl: `${baseUrl()}/v1`, tokens });

  const name = 'Tiong Bahru Bakery';
  // Unique per run: two runs against one datastore would otherwise collide on
  // the (locality, slug) uniqueness rule and the second would fail as a 409 -
  // twenty minutes in, looking like a broken app.
  const locality = `Device-${Date.now().toString(36)}`;

  const place = await device.places.create({ name, category: 'cafe', locality });

  // Assert the fixture produced what the flow will look for, BEFORE the flow
  // depends on it. The search is what the picker calls, so this is the same
  // question the device will ask.
  const found = await device.places.search(name, { locality, limit: 5 });
  if (!found.items.some((p) => p.placeId === place.placeId)) {
    throw new Error('fixture: the seeded place is not returned by the search the picker uses');
  }

  process.stdout.write(`PLACE_NAME=${name}\n`);
  process.stdout.write(`PLACE_LOCALITY=${locality}\n`);
  process.stdout.write(`PLACE_ID=${place.placeId}\n`);
}

main().catch((e: unknown) => {
  process.stderr.write(`${String(e)}\n`);
  process.exit(1);
});
