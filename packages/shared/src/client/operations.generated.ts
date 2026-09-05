// GENERATED from specs/001-interest-media-sharing/contracts/openapi.yaml
// Do not edit by hand. Run: pnpm --filter @sih/shared generate:client
//
// 33 operations across 23 paths.

export const operations = {
  getMe: { method: 'GET', path: '/me', auth: true }, // Current person's profile and preferences
  patchMe: { method: 'PATCH', path: '/me', auth: true }, // Update display name, avatar, bio, or notification preferences
  deleteMe: { method: 'DELETE', path: '/me', auth: true }, // Delete the current account
  getPeopleByHandle: { method: 'GET', path: '/people/{handle}', auth: true }, // A person's public profile
  getPeopleByHandlePosts: { method: 'GET', path: '/people/{handle}/posts', auth: true }, // A person's posts, newest first
  putPeopleByHandleFollow: { method: 'PUT', path: '/people/{handle}/follow', auth: true }, // Follow a person
  deletePeopleByHandleFollow: { method: 'DELETE', path: '/people/{handle}/follow', auth: true }, // Unfollow a person
  getInterests: { method: 'GET', path: '/interests', auth: false }, // Browse or search interests
  postInterests: { method: 'POST', path: '/interests', auth: true }, // Create a sub-interest
  getInterestsSimilar: { method: 'GET', path: '/interests/similar', auth: true }, // Near-duplicate check before creating a sub-interest
  getInterestsByInterestId: { method: 'GET', path: '/interests/{interestId}', auth: false }, // An interest, with its sub-interests when top-level
  getInterestsByInterestIdPosts: { method: 'GET', path: '/interests/{interestId}/posts', auth: false }, // Posts in an interest, newest first
  putInterestsByInterestIdFollow: { method: 'PUT', path: '/interests/{interestId}/follow', auth: true }, // Follow an interest
  deleteInterestsByInterestIdFollow: { method: 'DELETE', path: '/interests/{interestId}/follow', auth: true }, // Unfollow an interest
  getInterestsSuggested: { method: 'GET', path: '/interests/suggested', auth: true }, // Interests the caller may want to follow
  postMediaUploads: { method: 'POST', path: '/media/uploads', auth: true }, // Request a presigned upload target
  postPosts: { method: 'POST', path: '/posts', auth: true }, // Publish a post
  getPostsByPostId: { method: 'GET', path: '/posts/{postId}', auth: false }, // A single post
  patchPostsByPostId: { method: 'PATCH', path: '/posts/{postId}', auth: true }, // Edit caption, interests, or visibility
  deletePostsByPostId: { method: 'DELETE', path: '/posts/{postId}', auth: true }, // Delete a post
  getFeedHome: { method: 'GET', path: '/feed/home', auth: true }, // The caller's home feed
  putPostsByPostIdReaction: { method: 'PUT', path: '/posts/{postId}/reaction', auth: true }, // React to a post
  deletePostsByPostIdReaction: { method: 'DELETE', path: '/posts/{postId}/reaction', auth: true }, // Remove a reaction
  getPostsByPostIdComments: { method: 'GET', path: '/posts/{postId}/comments', auth: false }, // Comments on a post
  postPostsByPostIdComments: { method: 'POST', path: '/posts/{postId}/comments', auth: true }, // Comment on a post
  postPostsByPostIdShareLink: { method: 'POST', path: '/posts/{postId}/share-link', auth: true }, // Generate a shareable link
  postReports: { method: 'POST', path: '/reports', auth: true }, // Report a post, comment, or interest name
  putBlocksByHandle: { method: 'PUT', path: '/blocks/{handle}', auth: true }, // Block a person
  deleteBlocksByHandle: { method: 'DELETE', path: '/blocks/{handle}', auth: true }, // Unblock a person
  getNotifications: { method: 'GET', path: '/notifications', auth: true }, // The caller's notifications
  getModerationReports: { method: 'GET', path: '/moderation/reports', auth: true }, // The moderation queue, oldest first
  patchModerationReportsByReportId: { method: 'PATCH', path: '/moderation/reports/{reportId}', auth: true }, // Record a moderation decision
  patchModerationInterestsByInterestId: { method: 'PATCH', path: '/moderation/interests/{interestId}', auth: true }, // Re-parent, merge, or retire an interest
} as const;

export type OperationName = keyof typeof operations;
export type Operation = (typeof operations)[OperationName];
