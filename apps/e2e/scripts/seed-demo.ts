/**
 * Fills a fresh session with a product somebody can actually use.
 *
 * A session server comes up with an EMPTY datastore — since 013 there is not
 * even a catalogue, because the twelve curated interests are deleted and an
 * interest cannot exist without a post — so the first thing anyone sees after
 * signing in is a feed with no posts in it. That reads as a broken app and is not one, and
 * it is the same failure shape `capture-screens.ts` already guards against with
 * its "so no screen is captured empty and pretending to be the product" note.
 * This script is that note applied to the session server.
 *
 * What it builds: six people with names, bios and photographs, posts across
 * eleven interests THE PEOPLE THEMSELVES NAME, comments, reactions, follows in
 * both directions, two places with reviews, a saved collection, and two
 * conversations waiting in the device person's inbox.
 *
 * WHAT IT DELIBERATELY DOES NOT DO is declare the device person's interests.
 * `coldStartComplete` is `seeds.asked(userId)` and nothing else, so leaving the
 * seed-interests call unmade means the person signing in still meets the cold
 * start (007/FR-014) — a real product surface, and the one that puts the first
 * screen of the app in their hands rather than in a fixture's. The feed is
 * populated whatever they pick, because every interest this creates carries
 * posts BY CONSTRUCTION: 013 made that the only way one can come to exist.
 *
 * Usage: npx tsx apps/e2e/scripts/seed-demo.ts <device-token>
 * Prints a short summary on stderr; stdout stays empty so a caller can ignore it.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createAppData, MemoryTokenStore, type AppData } from '@sih/mobile/data';
import { baseUrl } from '../support/base-url';
import { publishReadyImage, publishReadyNamingInterest } from '../support/publish';

const execFileAsync = promisify(execFile);

/**
 * THE TOKEN IS OPTIONAL NOW, AND THAT IS WHAT MAKES THIS RUNNABLE AGAINST A
 * HOSTED BACKEND.
 *
 * It used to be required, and it had to be: every person was created by writing
 * a row with the API's OWN `PersonRepository` and then signing a JWT with
 * `LOCAL_JWT_SECRET`. Both of those are reachable only from the machine the
 * datastore is on, so this script could seed a laptop and nothing else — and
 * pointing it at a deployment would have meant handing it the production
 * secret, which is not a thing to ask anybody for.
 *
 * 011 made sign-up self-service, so the product now has a way to create a
 * person that needs no secret at all. Using it is strictly better than what was
 * here: no `pg`, no `jsonwebtoken`, no import reaching into `apps/api`, and the
 * people this creates come into existence down the same path a real one does.
 * A failure here is a failure a real sign-up would have had.
 *
 * Given a token, `me` is that account — the laptop flow, unchanged. Given none,
 * `me` is a demo account this script signs up. The ranked feed reads across the
 * catalogue rather than a follow graph (007), so posts by these people reach
 * ANY signed-in person's feed, including yours.
 */
const deviceToken: string | undefined = process.argv[2];

/**
 * The step being attempted, so a failure can name it.
 *
 * The last line printed already implies it, and that is exactly the sort of
 * "you could have worked it out" that costs somebody twenty minutes. An upload
 * failure and a datastore failure both arrive as `fetch failed`; which STEP was
 * running is what separates "object storage is misconfigured" from "the
 * database is unreachable".
 */
let currentStep = 'starting';
const say = (line: string): void => {
  currentStep = line.replace(/\.\.\.$/, '');
  process.stderr.write(`${line}\n`);
};

// ---------------------------------------------------------------------------
// People
//
// Written through the API's OWN repository, for the reason support/people.ts
// gives: the local profile has no signup endpoint, and a second copy of the key
// schema here would drift from data-model.md in silence.
//
// The handles are CLEAN — `mayaokonkwo`, not `demo3f8a2c11`. A demo whose
// people are named after their fixtures is a demo of the fixtures. Uniqueness
// is not free that way, so a taken handle takes a suffix rather than colliding:
// a fresh session (the case this exists for) gets the clean name every time,
// and a re-run against a local table that already holds one stays unambiguous.
// ---------------------------------------------------------------------------

/**
 * Structurally an `Actor` — `token` included — because `publishReadyImage`
 * takes one. Adding the field here is cheaper than widening a helper thirty
 * tests depend on, and it keeps this script's people the same kind of thing the
 * rest of the suite's people are.
 */
interface Person {
  userId: string;
  handle: string;
  displayName: string;
  token: string;
  data: AppData;
}

/**
 * SIGN-UP IS RATE LIMITED ON PURPOSE, AND THIS WAITS RATHER THAN ROUTING AROUND IT.
 *
 * `auth.controller.ts` allows 5 with a token back every 20 seconds, keyed on the
 * client IP, under a comment saying "creating accounts is not something a person
 * does in a burst". That is right, and a seeder is exactly the unusual caller it
 * describes — seven accounts from one address in under a second. Found by
 * running this against a local stack before ever pointing it at a deployment,
 * where it would have failed identically and less legibly.
 *
 * So: sequential, and on the refusal the server names, wait and try again. The
 * alternative — a flag that skips the limiter for seeding — is a hole in a
 * safety control that exists for a reason, kept open for a convenience.
 *
 * It costs about forty seconds for seven people, and says so, because a silent
 * forty-second pause reads as a hang.
 */
async function signUpRespectingTheLimit<T>(what: string, attempt: () => Promise<T>): Promise<T> {
  for (let tries = 0; ; tries += 1) {
    try {
      return await attempt();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const seconds = /Retry in (\d+)s/.exec(message)?.[1];
      if (seconds === undefined || tries >= 6) throw err;
      const wait = Number(seconds) + 1;
      say(`  ${what}: the sign-up limit says retry in ${seconds}s — waiting (this is the product working)`);
      await new Promise((resolve) => setTimeout(resolve, wait * 1000));
    }
  }
}

async function person(handle: string, displayName: string, bio: string): Promise<Person> {
  /**
   * A UNIQUE SUFFIX ON BOTH THE HANDLE AND THE ADDRESS, because this script is
   * expected to run more than once against the same backend.
   *
   * The old version read the handle back first and only suffixed a collision.
   * It cannot here: a handle lookup is not a public route, and asking would be
   * a round trip to learn what the conditional write already enforces —
   * `PersonRepository.create` claims the handle, so a clash is a 409 rather
   * than a silently-second holder. 011 found that defect and fixed it there;
   * this just stops racing it.
   */
  const suffix = randomUUID().slice(0, 6);
  const tokens = new MemoryTokenStore();
  const data = createAppData({ baseUrl: `${baseUrl()}/v1`, tokens });

  const profile = await signUpRespectingTheLimit(handle, () => data.session.signUp({
    email: `demo-${suffix}@example.invalid`,
    /**
     * Not a secret worth protecting and deliberately not a realistic one: these
     * accounts exist to be looked at. `.invalid` is the reserved TLD (RFC 2606)
     * so no address here can ever belong to a real person.
     */
    password: `demo-${suffix}-Aa1!`,
    handle: `${handle}${suffix}`,
    displayName,
  }));

  // The bio is a separate call because sign-up does not take one — it asks for
  // the four things it cannot proceed without, and nothing else.
  await data.session.updateProfile({ bio });

  const token = tokens.get();
  if (token === null) throw new Error(`sign-up for ${handle} returned no credential`);

  return { userId: profile.userId, handle: profile.handle, displayName, token, data };
}

// ---------------------------------------------------------------------------
// Photographs
//
// The suite's `jpegPlain()` is one black pixel — right for asserting a byte
// reached storage, useless for a feed anyone looks at. These are generated by
// the ffmpeg container for the reason `capture-screens.ts` gives: the host has
// no ffmpeg and `apt-get install ffmpeg` is blocked in this project's sandbox.
//
// TWO ARGUMENTS THIS HELPER MAY NOT CARRY, both found by running it:
//
//   - NO `-ss` SEEK. Seeking to 00:00:0N in a one-second source writes nothing
//     and the run dies with "Conversion failed!" — character for character the
//     defect CLAUDE.md records for the video poster frame.
//   - NO `duration` ON `mandelbrot`. `gradients` accepts `duration=1`; passing
//     the same argument to `mandelbrot` fails outright, and it is a one-frame
//     capture either way. That is the SECOND argument assumption to bite this
//     exact helper, so the sources carry their own full argument string rather
//     than sharing a template that has to be right for both.
//
// The gradients get grain and a slight blur so a card reads as a photograph at
// thumbnail size instead of as a colour swatch.
/**
 * The same `ffmpeg` the product runs — `FFMPEG_PATH`, else `PATH`. See the note
 * in `support/media.ts`: T026 moved the pipeline off `docker run` and left four
 * fixtures shelling out to it directly, which made every one of them need a
 * container runtime on a machine with a native ffmpeg.
 */
const FFMPEG = process.env['FFMPEG_PATH'] ?? 'ffmpeg';

/**
 * ASYNCHRONOUS, AND THAT IS THE WHOLE POINT OF THIS FUNCTION'S SHAPE.
 *
 * It was `execFileSync`, which BLOCKS THE EVENT LOOP for as long as ffmpeg
 * takes — and ffmpeg here is a CONTAINER START, so seconds rather than
 * milliseconds. Two separate failures came out of that, and the second is why
 * reordering was not the fix:
 *
 *   1. Called from inside `inBatches`'s concurrent mapper, one draft's render
 *      blocked while another draft's request was in flight. `DataError: fetch
 *      failed`, on the batched drafts only, every time.
 *   2. Rendering everything UP FRONT instead moved the failure to the FIRST
 *      publish: a forty-second block leaves the keep-alive sockets opened by
 *      the avatar step to go stale, and undici's next request on a dead socket
 *      fails rather than reopening.
 *
 * Both are the same defect — a synchronous subprocess beside a live HTTP
 * client — and only not blocking fixes both. The environment made it visible
 * rather than causing it: on a laptop with a native ffmpeg the block is short
 * enough to get away with, which is luck and not a difference in kind.
 */
async function render(source: string, filters: string | null): Promise<Buffer> {
  try {
    const { stdout } = await execFileAsync(
      FFMPEG,
      [
        '-f', 'lavfi', '-i', source,
        ...(filters ? ['-vf', filters] : []),
        '-frames:v', '1', '-f', 'mjpeg', '-',
      ],
      // stderr CAPTURED, not inherited. ffmpeg writes its banner and its whole
      // build configuration to stderr on every invocation - twenty-one lines,
      // twenty-two times - which buried the one line that mattered when this
      // run actually failed. Captured here and re-raised below, so a real
      // ffmpeg error is the only ffmpeg output anyone ever reads.
      { maxBuffer: 32 * 1024 * 1024, encoding: 'buffer' as const },
    );
    return stdout;
  } catch (err: unknown) {
    const stderr = (err as { stderr?: Buffer }).stderr?.toString() ?? '';
    throw new Error(`ffmpeg could not render ${source}\n${stderr.split('\n').slice(-12).join('\n')}`);
  }
}

/** A two-tone gradient, grained and softened. The angle varies with the seed. */
async function gradient(c0: string, c1: string, seed: number): Promise<Buffer> {
  const x0 = 60 + ((seed * 137) % 900);
  const y0 = 40 + ((seed * 89) % 700);
  return render(
    `gradients=size=1200x900:c0=${c0}:c1=${c1}:n=2:duration=1:rate=1:x0=${x0}:y0=${y0}:x1=${1200 - x0}:y1=${900 - y0}`,
    'noise=alls=16:allf=t+u,gblur=sigma=1.1',
  );
}

/** A fractal, for the two posts whose captions are about pattern. No duration. */
async function fractal(scale: number): Promise<Buffer> {
  return render(`mandelbrot=size=1200x900:rate=1:start_scale=${scale}:inner=period`, null);
}

/** A small square for an avatar. Same treatment, cheaper. */
async function avatar(c0: string, c1: string, seed: number): Promise<Buffer> {
  const x0 = 20 + ((seed * 53) % 300);
  return render(
    `gradients=size=400x400:c0=${c0}:c1=${c1}:n=2:duration=1:rate=1:x0=${x0}:y0=20:x1=${400 - x0}:y1=380`,
    'noise=alls=10:allf=t+u,gblur=sigma=0.8',
  );
}

// ---------------------------------------------------------------------------
// Bounded concurrency. Fourteen publishes each wait for the media pipeline, and
// a session bring-up that takes four minutes is a session nobody waits for.
// Three at a time, because the pipeline is one ffmpeg container per item.
// ---------------------------------------------------------------------------
async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

async function main(): Promise<void> {
  /**
   * With a token, `me` is that account. Without one, `me` is a demo account
   * signed up here — see the note on `deviceToken` above.
   */
  let me: AppData;
  let myProfile: { userId: string; handle: string; token: string };
  if (deviceToken === undefined) {
    const owner = await person('demoowner', 'Demo owner', 'Seeded so there is something to look at.');
    me = owner.data;
    myProfile = { userId: owner.userId, handle: owner.handle, token: owner.token };
    say(`no token given — signed up @${owner.handle} to own the demo data`);
  } else {
    const tokens = new MemoryTokenStore();
    tokens.set(deviceToken);
    me = createAppData({ baseUrl: `${baseUrl()}/v1`, tokens });
    myProfile = { ...(await me.session.me()), token: deviceToken };
  }

  /**
   * 013/FR-004. THE INTERESTS ARE NAMED INTO EXISTENCE, NOT LOOKED UP.
   *
   * This read `interests.listTop()` and resolved 'Birding', 'Photography' and
   * nine more against the curated twelve. There is no catalogue to resolve
   * against: 013 deleted it, and an interest now comes into existence only as
   * part of publishing into it. So the first post filed under each name CREATES
   * that interest, exactly as a person's would, and `interestId` below is
   * filled in as that happens.
   *
   * Which also means the demo is a demo of the product rather than of a
   * fixture: nothing here is privileged, and every interest it leaves behind is
   * one somebody typed.
   */
  const named = new Map<string, string>();
  const id = (name: string): string => {
    const found = named.get(name);
    if (!found) {
      throw new Error(
        `no interest named ${name} has been published into yet — since 013 an interest ` +
          'exists only once a post names it, so the publish step must run first',
      );
    }
    return found;
  };

  say('creating people...');
  // SEQUENTIAL, and that is the fix rather than a style preference: a burst of
  // seven sign-ups from one address is precisely what the limiter refuses.
  const roster: ReadonlyArray<readonly [string, string, string]> = [
    ['mayaokonkwo', 'Maya Okonkwo', 'Birds at dawn, mostly. Lagos, then Lisbon.'],
    ['tomasherrera', 'Tomás Herrera', 'Climbing anything with a view. Slowly getting faster.'],
    ['ingridsandvik', 'Ingrid Sandvik', 'Ceramics and small paintings. Bergen.'],
    ['rafaellim', 'Rafael Lim', 'Cooking whatever the garden gives me.'],
    ['noorhaddad', 'Noor Haddad', 'Long rides at short notice. Amman.'],
    ['jonasweber', 'Jonas Weber', 'Hand tools, old wood, loud records.'],
  ];
  const made: Person[] = [];
  for (const [handle, name, bio] of roster) made.push(await person(handle, name, bio));
  const [maya, tomas, ingrid, rafael, noor, jonas] = made;
  const cast = [maya, tomas, ingrid, rafael, noor, jonas] as Person[];

  /**
   * ORDERED SO EVERY STEP THAT NEEDS NO MEDIA RUNS FIRST.
   *
   * Not for tidiness. MinIO cannot be pulled in the sandbox this project is
   * developed in — quay.io is denied by egress and the Docker Hub mirror has
   * no cache of a repository that no longer exists upstream — so the only
   * free observation available here is a run against DynamoDB and a live API
   * with no object store behind it. In that order this script verifies nine
   * of its steps locally and stops at the first upload with a connection
   * refused, instead of stopping at the second step and verifying nothing.
   *
   * Prefer the free observation to the expensive guess: the alternative was a
   * twenty-minute dispatch per typo.
   */
  // ---- the device person. "Device pass" is a fixture's name, not a person's.
  await me.session.updateProfile({
    displayName: 'Demo account',
    bio: 'This is you. Change the name and picture from Edit profile.',
  });

  /**
   * 013/FR-004. FOLLOWING INTERESTS MOVED BELOW THE PUBLISH STEP, and it had to.
   *
   * It ran here, ninth of nine steps deliberately ordered so everything needing
   * no media came first. An interest cannot be followed before it exists and
   * cannot exist before a post names it, so this one step now genuinely depends
   * on an upload having succeeded. The ordering comment above still holds for
   * every other step.
   */

  // ---- follows, in both directions, so counts are real on every profile
  say('following people...');
  for (const who of cast) {
    await me.people.follow(who.handle);
    await who.data.people.follow(myProfile.handle);
  }
  await maya!.data.people.follow(tomas!.handle);
  await tomas!.data.people.follow(maya!.handle);
  await ingrid!.data.people.follow(rafael!.handle);
  await rafael!.data.people.follow(jonas!.handle);
  await noor!.data.people.follow(tomas!.handle);
  await jonas!.data.people.follow(ingrid!.handle);

  // ---- places, with reviews
  //
  // ATTACHED, NOT ONLY CREATED. `places.create` answers 409 for a name that
  // already exists in the locality, and the 409 CARRIES the existing place -
  // `places.ts` says so in as many words: "the dedupe is a response, not an
  // error". A fresh session never meets it; the second run against a local
  // table met it immediately and died at step four with every post unseeded.
  // Doing what the product prescribes is both the fix and cheaper than nonced
  // place names, which would leave a demo full of "Café do Rio 4f2a".
  say('creating places...');
  const locality = 'Lisbon';
  const placeNamed = async (
    who: Person,
    name: string,
    category: 'cafe' | 'venue',
  ): Promise<{ placeId: string }> => {
    try {
      return await who.data.places.create({ name, category, locality });
    } catch (err: unknown) {
      const problem = err as { status?: number; problem?: { placeId?: string } };
      const existing = problem.status === 409 ? problem.problem?.placeId : undefined;
      if (!existing) throw err;
      return { placeId: existing };
    }
  };
  const cafe = await placeNamed(maya!, 'Café do Rio', 'cafe');
  await maya!.data.places.rate(cafe.placeId, { score: 5, body: 'Open at six, which is the only thing I ask of a café.' });
  await rafael!.data.places.rate(cafe.placeId, { score: 4, body: 'Good coffee, slow service, nice light.' });
  const gym = await placeNamed(tomas!, 'Bloc Climbing', 'venue');
  await tomas!.data.places.rate(gym.placeId, { score: 5, body: 'Resets every fortnight and the setters are cruel in a good way.' });
  await noor!.data.places.rate(gym.placeId, { score: 4, body: 'Crowded after six but the coffee is decent.' });
  await me.places.follow(cafe.placeId);
  await me.places.follow(gym.placeId);

  // ---- two conversations waiting in the inbox
  say('opening conversations...');
  const fromMaya = await maya!.data.conversations.open(myProfile.handle);
  await maya!.data.conversations.send(fromMaya.conversationId, { body: 'Hello! Saw you followed me — are you shooting birds too?' });
  const fromTomas = await tomas!.data.conversations.open(myProfile.handle);
  await tomas!.data.conversations.send(fromTomas.conversationId, { body: 'Climbing Thursday if you fancy it.' });

  // ---- avatars, so the feed is faces rather than initials
  say('setting avatars...');
  const avatarColours: [string, string][] = [
    ['0x1F6B3F', '0xE8C44A'],
    ['0x2C4A5E', '0xE0A458'],
    ['0x6B3A5E', '0xE8B4C4'],
    ['0x8B3A2F', '0xE8C44A'],
    ['0x1B4E5E', '0x7FD4C1'],
    ['0x3E3A2F', '0xC9A227'],
  ];
  // Rendered before the batch, for the reason spelled out at the posts step
  // below: `render()` is synchronous, and blocking the event loop while another
  // draft's request is in flight is what makes that request fail. This step had
  // exactly the same shape and got away with it because an avatar is a cheaper
  // render — which is luck, not a difference in kind.
  const avatarBytes = await Promise.all(
    cast.map((_, i) => avatar(avatarColours[i]![0], avatarColours[i]![1], i + 1)),
  );
  await inBatches(cast, 3, async (who) => {
    const i = cast.indexOf(who);
    const bytes = avatarBytes[i]!;
    const target = await who.data.posts.createUploadTarget({
      kind: 'avatar',
      contentType: 'image/jpeg',
      sizeBytes: bytes.byteLength,
    });
    await who.data.posts.uploadBytes(target, bytes, 'image/jpeg');
    await who.data.session.updateProfile({ avatarUploadId: target.uploadId });
  });

  // ---- posts. Every catalogue interest carries at least one, so the feed is
  // populated whatever the cold start is answered with — including "nothing",
  // which is the case 007/FR-015 is about and the one that used to come up empty.
  say('publishing posts...');
  interface Draft {
    who: Person;
    interest: string;
    caption: string;
    bytes: () => Promise<Buffer>;
    /** 004/FR-015. Optional — most posts have no place, two of these do. */
    placeId?: string;
  }
  const drafts: Draft[] = [
    { who: maya!, interest: 'Birding', caption: 'Kingfisher, third morning of waiting. Worth every one of them.', bytes: () => gradient('0x1B4E5E', '0x7FD4C1', 1) },
    { who: maya!, interest: 'Photography', caption: 'Fog came in over the estuary and turned everything into a shape.', bytes: () => gradient('0x4A5568', '0xE2E8F0', 2) },
    { who: maya!, interest: 'Photography', caption: 'Same hide, forty minutes later. The light does all the work.', bytes: () => fractal(0.03) },
    { who: tomas!, interest: 'Climbing', caption: 'Finally sent the blue problem in the cave. Took eleven sessions.', bytes: () => gradient('0x8B3A2F', '0xE8C44A', 3), placeId: gym.placeId },
    { who: tomas!, interest: 'Running', caption: 'Ten miles before work. Cold enough that my hands stopped arguing.', bytes: () => gradient('0x1F3A5E', '0xF0A868', 4) },
    { who: ingrid!, interest: 'Ceramics', caption: 'Glaze test tiles. The one on the left is the accident I want to repeat.', bytes: () => gradient('0x6B3A5E', '0xE8B4C4', 5) },
    { who: ingrid!, interest: 'Painting', caption: 'Small study, twenty minutes, bad light. Keeping it anyway.', bytes: () => fractal(0.008) },
    { who: rafael!, interest: 'Cooking', caption: 'Tomatoes from the balcony, bread from Tuesday. Lunch solved.', bytes: () => gradient('0xA8322D', '0xF2C14E', 6), placeId: cafe.placeId },
    { who: rafael!, interest: 'Gardening', caption: 'The chillies finally turned. Six months of nothing, then all at once.', bytes: () => gradient('0x1F6B3F', '0xE8C44A', 7) },
    { who: noor!, interest: 'Cycling', caption: 'Ninety kilometres into a headwind. I would do it again tomorrow.', bytes: () => gradient('0x2C4A5E', '0xE0A458', 8) },
    { who: noor!, interest: 'Travel', caption: 'Slept on a roof in Wadi Rum. The sky is not the same colour there.', bytes: () => gradient('0x2A1B3D', '0xE8A87C', 9) },
    { who: jonas!, interest: 'Woodworking', caption: 'Dovetails, attempt four. Attempts one to three are firewood.', bytes: () => gradient('0x3E2F23', '0xD4A574', 10) },
    { who: jonas!, interest: 'Music', caption: 'Bench radio rebuilt. Sounds better than anything I own.', bytes: () => gradient('0x2E1F3E', '0xC9A227', 11) },
    { who: maya!, interest: 'Birding', caption: 'Heron, absolutely unbothered by me.', bytes: () => gradient('0x24413A', '0xA8C686', 12) },
  ];

  /**
   * 013. THE FIRST POST UNDER A NAME IS PUBLISHED ALONE, AND THAT IS THE
   * CONSTRAINT WORKING RATHER THAN A SLOW SEED.
   *
   * `inBatches(drafts, 3, ...)` ran three publishes at once. Two of these
   * drafts name `Photography` and sit next to each other, so both would have
   * raced to claim that name — and since 013 exactly one claim can win, the
   * loser's publish is REFUSED. That is the uniqueness constraint doing its
   * job; a seed that raced it would fail intermittently and look like a flake.
   *
   * So a draft whose interest nothing has named yet is published on its own and
   * its new interest recorded; every later draft quotes the id and batches as
   * before. Three of the fourteen are first-of-their-name, so the cost is three
   * serial publishes.
   */
  /**
   * EVERY IMAGE IS RENDERED BEFORE ANY REQUEST IS MADE, and that is a
   * correctness fix rather than a tidy-up.
   *
   * `render()` is asynchronous now — see its own note for the two failures that
   * forced that — and the renders still happen here rather than inside
   * `inBatches`'s mapper, so the publishing loop below reads a ready buffer and
   * the two concerns stay separable.
   */
  say('rendering images...');
  const rendered = await Promise.all(drafts.map((d) => d.bytes()));

  const postIds: string[] = new Array<string>(drafts.length);
  const pending: { index: number; draft: Draft }[] = [];
  for (const [index, d] of drafts.entries()) {
    if (named.has(d.interest)) {
      pending.push({ index, draft: d });
      continue;
    }
    say(`publishing ${index + 1}/${drafts.length} — ${d.interest}, naming it...`);
    const created = await publishReadyNamingInterest(d.who, d.interest, {
      caption: d.caption,
      bytes: rendered[index]!,
      ...(d.placeId ? { placeId: d.placeId } : {}),
    });
    named.set(d.interest, created.interestId);
    postIds[index] = created.postId;
  }
  const rest = await inBatches(pending, 3, (p) => {
    say(`publishing ${p.index + 1}/${drafts.length} — ${p.draft.interest}...`);
    return publishReadyImage(p.draft.who, [id(p.draft.interest)], {
      caption: p.draft.caption,
      bytes: rendered[p.index]!,
      ...(p.draft.placeId ? { placeId: p.draft.placeId } : {}),
    });
  });
  for (const [i, p] of pending.entries()) postIds[p.index] = rest[i]!;

  say(`published ${postIds.length} posts across ${named.size} interests people named`);

  // ---- interests each person cares about, so a profile means something. Runs
  // HERE because the interests exist only now (013/FR-004, note above).
  say('following interests...');
  const declared: [Person, string[]][] = [
    [maya!, ['Photography', 'Birding']],
    [tomas!, ['Climbing', 'Running']],
    [ingrid!, ['Ceramics', 'Painting']],
    [rafael!, ['Cooking', 'Gardening']],
    [noor!, ['Cycling', 'Travel']],
    [jonas!, ['Woodworking', 'Music']],
  ];
  for (const [who, names] of declared) {
    for (const name of names) await who.data.interests.follow(id(name));
  }

  // ---- the device person's own two posts, so their profile is not empty
  const mine = await publishReadyImage(
    { data: me, handle: myProfile.handle, userId: myProfile.userId, token: myProfile.token },
    [id('Photography')],
    {
      caption: 'First post from the phone.',
      // Awaited into a local first: an argument position is a place a render
      // can hide, which is how it ended up inside a concurrent mapper above.
      bytes: await gradient('0x1F6B3F', '0xF5E6C8', 13),
    },
  );

  // ---- comments and reactions, so a post detail screen has something below it
  say('adding comments and reactions...');
  const conversationsOnPosts: [Person, number, string][] = [
    [tomas!, 0, 'That is a ridiculous photograph. What lens?'],
    [rafael!, 0, 'Third morning is dedication.'],
    [maya!, 3, 'Eleven sessions and you make it sound routine.'],
    [noor!, 4, 'Which route do you take out of town?'],
    [rafael!, 5, 'The left one. Definitely the left one.'],
    [ingrid!, 7, 'Balcony tomatoes are the best tomatoes.'],
    [jonas!, 9, 'Headwind both ways, knowing you.'],
    [tomas!, 11, 'Attempt four looks like attempt forty. Well done.'],
    [maya!, 12, 'I want to hear it.'],
  ];
  for (const [who, index, body] of conversationsOnPosts) {
    const postId = postIds[index];
    if (postId) await who.data.engagement.comment(postId, body);
  }
  await ingrid!.data.engagement.comment(mine, 'Welcome!');

  for (const [i, postId] of postIds.entries()) {
    for (const who of cast.slice(0, (i % 4) + 1)) {
      if (who.handle !== drafts[i]!.who.handle) await who.data.engagement.react(postId);
    }
    if (i % 3 === 0) await me.engagement.react(postId);
  }

  // ---- saved, and a collection, so those tabs are not empty either
  say('saving posts...');
  const collection = await me.saved.createCollection('Worth another look');
  for (const postId of [postIds[0], postIds[5], postIds[10]]) {
    if (!postId) continue;
    await me.saved.save(postId);
    await me.saved.addToCollection(collection.collectionId, postId);
  }

  say('');
  say(`seeded: ${cast.length} people, ${postIds.length + 1} posts, 2 places, 2 conversations`);
  say(`you are @${myProfile.handle}`);
}

main().catch((err: unknown) => {
  /**
   * THE CAUSE, NOT ONLY THE ERROR. An upload to an object store that is not
   * running throws `TypeError: fetch failed` and nothing else - undici puts the
   * connection refused in `cause`, and `String(err)` drops it. That message
   * names no host, no port and no step, which is the "looked like evidence and
   * answered nothing" shape this project has paid for more than once.
   */
  const cause = (err as { cause?: unknown }).cause;
  process.stderr.write(`\nseed-demo failed while: ${currentStep}\n`);
  process.stderr.write(`  ${String(err)}\n`);
  if (cause) process.stderr.write(`  cause: ${String(cause)}\n`);

  /**
   * A NETWORK FAILURE HAS TWO CANDIDATE CAUSES AND THEY LOOK IDENTICAL.
   *
   * `DataError(0, ...)` means no HTTP response happened at all — the data layer
   * says so structurally rather than in prose. From the seed's point of view
   * that is either the API or object storage, and the step above is what tells
   * them apart. Saying so here beats leaving the reader to infer it from which
   * line stopped printing.
   */
  if ((err as { status?: number }).status === 0 || String(err).includes('fetch failed')) {
    process.stderr.write(
      '\n  Nothing answered. If it failed on avatars, posts or comments, the API is\n' +
        '  fine and OBJECT STORAGE is not: check S3_ENDPOINT, the keys, and that the\n' +
        '  bucket exists and is private. Earlier steps than that mean the API itself.\n',
    );
  }
  process.exit(1);
});
