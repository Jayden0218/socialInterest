// GENERATED from specs/001-interest-media-sharing/contracts/openapi.yaml
// Do not edit by hand. Run: pnpm --filter @sih/shared generate:client
//
// 84 operations across 62 paths.

export const operations = {
  getMe: { method: 'GET', path: '/me', auth: true }, // Current person's profile and preferences
  patchMe: { method: 'PATCH', path: '/me', auth: true }, // Update display name, avatar, bio, or notification preferences
  deleteMe: { method: 'DELETE', path: '/me', auth: true }, // Delete the current account
  getMeFollowRequests: { method: 'GET', path: '/me/follow-requests', auth: true }, // Follow requests waiting on me
  putMeFollowRequestsByHandle: { method: 'PUT', path: '/me/follow-requests/{handle}', auth: true }, // Approve a follow request
  deleteMeFollowRequestsByHandle: { method: 'DELETE', path: '/me/follow-requests/{handle}', auth: true }, // Decline a follow request
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
  getFeedHome: { method: 'GET', path: '/feed/home', auth: true }, // The caller's ranked home feed
  getFeedFollowing: { method: 'GET', path: '/feed/following', auth: true }, // Posts by the people you follow, newest first
  postSignals: { method: 'POST', path: '/signals', auth: true }, // Record what the caller did with posts they were shown
  getMeFeedSignals: { method: 'GET', path: '/me/feed-signals', auth: true }, // What the caller's feed is built from
  deleteMeFeedSignals: { method: 'DELETE', path: '/me/feed-signals', auth: true }, // Clear everything the feed has learned about the caller
  postMeSeedInterests: { method: 'POST', path: '/me/seed-interests', auth: true }, // The one-time cold-start picks
  putPostsByPostIdReaction: { method: 'PUT', path: '/posts/{postId}/reaction', auth: true }, // React to a post
  deletePostsByPostIdReaction: { method: 'DELETE', path: '/posts/{postId}/reaction', auth: true }, // Remove a reaction
  getMeDrafts: { method: 'GET', path: '/me/drafts', auth: true }, // Your unfinished posts
  postMeDrafts: { method: 'POST', path: '/me/drafts', auth: true }, // Save an unfinished post
  getMeDraftsByDraftId: { method: 'GET', path: '/me/drafts/{draftId}', auth: true }, // Restore an unfinished post
  deleteMeDraftsByDraftId: { method: 'DELETE', path: '/me/drafts/{draftId}', auth: true }, // Discard an unfinished post
  putPeopleByHandleMute: { method: 'PUT', path: '/people/{handle}/mute', auth: true }, // Mute a person
  deletePeopleByHandleMute: { method: 'DELETE', path: '/people/{handle}/mute', auth: true }, // Unmute a person
  putPostsByPostIdDismiss: { method: 'PUT', path: '/posts/{postId}/dismiss', auth: true }, // Stop showing me this post
  getPostsByPostIdComments: { method: 'GET', path: '/posts/{postId}/comments', auth: false }, // Comments on a post
  postPostsByPostIdComments: { method: 'POST', path: '/posts/{postId}/comments', auth: true }, // Comment on a post
  patchPostsByPostIdCommentsByCommentId: { method: 'PATCH', path: '/posts/{postId}/comments/{commentId}', auth: true }, // Correct your own comment
  deletePostsByPostIdCommentsByCommentId: { method: 'DELETE', path: '/posts/{postId}/comments/{commentId}', auth: true }, // Withdraw your own comment
  postPostsByPostIdShareLink: { method: 'POST', path: '/posts/{postId}/share-link', auth: true }, // Generate a shareable link
  postReports: { method: 'POST', path: '/reports', auth: true }, // Report a post, comment, or interest name
  putBlocksByHandle: { method: 'PUT', path: '/blocks/{handle}', auth: true }, // Block a person
  deleteBlocksByHandle: { method: 'DELETE', path: '/blocks/{handle}', auth: true }, // Unblock a person
  getNotifications: { method: 'GET', path: '/notifications', auth: true }, // The caller's notifications
  putNotificationsRead: { method: 'PUT', path: '/notifications/read', auth: true }, // Mark every notification read
  getSearchPosts: { method: 'GET', path: '/search/posts', auth: true }, // Find a post by words in its caption
  getModerationReports: { method: 'GET', path: '/moderation/reports', auth: true }, // The moderation queue, oldest first
  patchModerationReportsByReportId: { method: 'PATCH', path: '/moderation/reports/{reportId}', auth: true }, // Record a moderation decision
  getMeModerationNotices: { method: 'GET', path: '/me/moderation-notices', auth: true }, // What was removed of mine, and why
  postAppeals: { method: 'POST', path: '/appeals', auth: true }, // Appeal a moderation decision
  getAppealsByAppealId: { method: 'GET', path: '/appeals/{appealId}', auth: true }, // One appeal
  getMeAppeals: { method: 'GET', path: '/me/appeals', auth: true }, // My appeals and their outcomes
  getModerationAppeals: { method: 'GET', path: '/moderation/appeals', auth: true }, // The appeal queue, oldest first
  patchModerationAppealsByAppealId: { method: 'PATCH', path: '/moderation/appeals/{appealId}', auth: true }, // Decide an appeal
  patchModerationInterestsByInterestId: { method: 'PATCH', path: '/moderation/interests/{interestId}', auth: true }, // Re-parent, merge, or retire an interest
  getConversations: { method: 'GET', path: '/conversations', auth: true }, // The signed-in person's inbox
  putConversationsWithByHandle: { method: 'PUT', path: '/conversations/with/{handle}', auth: true }, // Open (or fetch) the conversation with a person
  getConversationsByConversationId: { method: 'GET', path: '/conversations/{conversationId}', auth: true }, // One conversation's state
  getConversationsByConversationIdMessages: { method: 'GET', path: '/conversations/{conversationId}/messages', auth: true }, // Messages, with optional long-poll
  postConversationsByConversationIdMessages: { method: 'POST', path: '/conversations/{conversationId}/messages', auth: true }, // Send a message
  postConversationsByConversationIdAccept: { method: 'POST', path: '/conversations/{conversationId}/accept', auth: true }, // Accept a message request
  postConversationsByConversationIdDecline: { method: 'POST', path: '/conversations/{conversationId}/decline', auth: true }, // Decline a message request
  putConversationsByConversationIdRead: { method: 'PUT', path: '/conversations/{conversationId}/read', auth: true }, // Mark read up to a message
  getPlaces: { method: 'GET', path: '/places', auth: false }, // Search places by name
  postPlaces: { method: 'POST', path: '/places', auth: true }, // Create a place
  getPlacesByPlaceId: { method: 'GET', path: '/places/{placeId}', auth: false }, // A place
  patchPlacesByPlaceId: { method: 'PATCH', path: '/places/{placeId}', auth: true }, // Rename, merge, or retire a place
  getPlacesByPlaceIdPosts: { method: 'GET', path: '/places/{placeId}/posts', auth: false }, // Posts attached to a place
  putPlacesByPlaceIdFollow: { method: 'PUT', path: '/places/{placeId}/follow', auth: true }, // Follow a place
  deletePlacesByPlaceIdFollow: { method: 'DELETE', path: '/places/{placeId}/follow', auth: true }, // Unfollow a place
  putInterestsByInterestIdDescription: { method: 'PUT', path: '/interests/{interestId}/description', auth: true }, // Set an interest's description
  getPeople: { method: 'GET', path: '/people', auth: true }, // Search people by handle or display name
  putPostsByPostIdSave: { method: 'PUT', path: '/posts/{postId}/save', auth: true }, // Save a post
  deletePostsByPostIdSave: { method: 'DELETE', path: '/posts/{postId}/save', auth: true }, // Unsave a post
  getMeSaved: { method: 'GET', path: '/me/saved', auth: true }, // The signed-in person's saved posts
  putPlacesByPlaceIdRating: { method: 'PUT', path: '/places/{placeId}/rating', auth: true }, // Rate a place, or replace your existing rating
  deletePlacesByPlaceIdRating: { method: 'DELETE', path: '/places/{placeId}/rating', auth: true }, // Withdraw your rating
  getPlacesByPlaceIdReviews: { method: 'GET', path: '/places/{placeId}/reviews', auth: false }, // A place's reviews
  postConversationsGroups: { method: 'POST', path: '/conversations/groups', auth: true }, // Start a group conversation
  postConversationsByConversationIdParticipants: { method: 'POST', path: '/conversations/{conversationId}/participants', auth: true }, // Add somebody to a group
  postConversationsByConversationIdLeave: { method: 'POST', path: '/conversations/{conversationId}/leave', auth: true }, // Leave a group
} as const;

export type OperationName = keyof typeof operations;
export type Operation = (typeof operations)[OperationName];
