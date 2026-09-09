/**
 * The app's data layer. Everything that talks to the API goes through here.
 *
 * Two rules keep this useful:
 *
 *  1. No react-native imports, anywhere below this file. apps/e2e drives these
 *     exact modules in Node against a running API, which is the only reason the
 *     journeys prove anything about the app rather than about a generated client.
 *  2. Screens consume this, never `fetch` or the generated client directly.
 */
import { DataClient, MemoryTokenStore, type DataClientOptions, type TokenStore } from './client';
import { InterestsData } from './interests';
import { PostsData } from './posts';
import { FeedData } from './feed';
import { EngagementData } from './engagement';
import { SafetyData } from './safety';
import { NotificationsData } from './notifications';
import { SearchData } from './search';
import { DraftsData } from './drafts';
import { SessionData } from './session';
import { PeopleData } from './people';
import { ConversationsData } from './conversations';
import { PlacesData } from './places';
import { SavedData } from './saved';
import { SignalsData } from './signals';

export interface AppData {
  client: DataClient;
  session: SessionData;
  people: PeopleData;
  interests: InterestsData;
  posts: PostsData;
  feed: FeedData;
  engagement: EngagementData;
  safety: SafetyData;
  notifications: NotificationsData;
  search: SearchData;
  drafts: DraftsData;
  conversations: ConversationsData;
  places: PlacesData;
  saved: SavedData;
  signals: SignalsData;
}

export function createAppData(opts: DataClientOptions): AppData {
  const client = new DataClient(opts);
  return {
    client,
    session: new SessionData(client),
    people: new PeopleData(client),
    interests: new InterestsData(client),
    posts: new PostsData(client),
    feed: new FeedData(client),
    engagement: new EngagementData(client),
    safety: new SafetyData(client),
    notifications: new NotificationsData(client),
    search: new SearchData(client),
    drafts: new DraftsData(client),
    conversations: new ConversationsData(client),
    places: new PlacesData(client),
    saved: new SavedData(client),
    signals: new SignalsData(client),
  };
}

export { SignalsData } from './signals';
export type { Signal, SignalKind, SignalReceipt, FeedSignalDisclosure } from './signals';
export { DataClient, MemoryTokenStore, SessionData, PeopleData, InterestsData, PostsData, FeedData, EngagementData, SafetyData, NotificationsData };
export type { DataClientOptions, TokenStore };
export * from './errors';
export { PersistentTokenStore, browserKeyValueStore } from './token-store';
export type { KeyValueStore } from './token-store';
export type { UploadTarget } from './posts';
export type { PostPage } from './interests';
export type { CommentPage } from './engagement';
export type { ReportReason, ModerationNotice, Appeal } from './safety';
export type { MyProfile } from './session';
