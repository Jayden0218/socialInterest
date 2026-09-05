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
import { SessionData } from './session';

export interface AppData {
  client: DataClient;
  session: SessionData;
  interests: InterestsData;
  posts: PostsData;
  feed: FeedData;
  engagement: EngagementData;
  safety: SafetyData;
  notifications: NotificationsData;
}

export function createAppData(opts: DataClientOptions): AppData {
  const client = new DataClient(opts);
  return {
    client,
    session: new SessionData(client),
    interests: new InterestsData(client),
    posts: new PostsData(client),
    feed: new FeedData(client),
    engagement: new EngagementData(client),
    safety: new SafetyData(client),
    notifications: new NotificationsData(client),
  };
}

export { DataClient, MemoryTokenStore, SessionData, InterestsData, PostsData, FeedData, EngagementData, SafetyData, NotificationsData };
export type { DataClientOptions, TokenStore };
export * from './errors';
export { PersistentTokenStore, browserKeyValueStore } from './token-store';
export type { KeyValueStore } from './token-store';
export type { UploadTarget } from './posts';
export type { PostPage } from './interests';
export type { CommentPage } from './engagement';
export type { ReportReason } from './safety';
export type { MyProfile } from './session';
