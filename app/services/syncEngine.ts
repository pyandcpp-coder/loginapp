import { supabase } from './supabaseClient';
import { Realm } from '@realm/react';
import { Post, Like, Comment } from '../models'; 
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';

// Exponential Backoff Retry Logic
const RetryEngine = {
  maxRetries: 5,
  baseDelay: 2000, // 2 seconds
  
  async executeWithBackoff<T>(
    operation: () => Promise<T>,
    operationName: string = 'Operation'
  ): Promise<T | null> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`[Retry] ${operationName} - Attempt ${attempt + 1}/${this.maxRetries + 1}`);
        const result = await operation();
        if (attempt > 0) {
          console.log(`✅ ${operationName} succeeded after ${attempt} retries`);
        }
        return result;
      } catch (error) {
        lastError = error;
        
        if (attempt < this.maxRetries) {
          const delay = this.baseDelay * Math.pow(2, attempt);
          console.warn(`⚠️ ${operationName} failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    console.error(`❌ ${operationName} failed after ${this.maxRetries + 1} attempts:`, lastError);
    return null;
  },
};

// Conflict Resolution Strategies
const ConflictResolver = {
  // Strategy 1: Last Write Wins (LWW) - Server timestamp takes precedence
  lastWriteWins: (local: any, remote: any): any => {
    const localTime = local.timestamp?.getTime?.() || 0;
    const remoteTime = new Date(remote.updated_at).getTime();
    
    if (remoteTime > localTime) {
      console.log(`[LWW] Remote version is newer, using server data for ${remote.id}`);
      return remote;
    }
    console.log(`[LWW] Local version is newer, keeping local data for ${remote.id}`);
    return local;
  },

  // Strategy 2: Field-Level Merging - Smart merge of changed fields
  fieldLevelMerge: (local: any, remote: any, lastSyncVersion?: any): any => {
    console.log(`[Merge] Performing field-level merge for ${remote.id}`);
    
    const merged = { ...local };
    
    // If no previous sync version, use remote as baseline
    if (!lastSyncVersion) {
      return remote;
    }

    // Detect which fields changed locally vs remotely
    const localChanges: string[] = [];
    const remoteChanges: string[] = [];

    const fieldsToCheck = ['text', 'image_url'];
    
    fieldsToCheck.forEach(field => {
      const localVal = local[field];
      const remoteVal = remote[field];
      const prevVal = lastSyncVersion[field];

      if (localVal !== prevVal) {
        localChanges.push(field);
      }
      if (remoteVal !== prevVal) {
        remoteChanges.push(field);
      }
    });

    console.log(`  Local changes: ${localChanges.join(', ')}`, `Remote changes: ${remoteChanges.join(', ')}`);

    // If both changed the same field → conflict! Use Last Write Wins for that field
    fieldsToCheck.forEach(field => {
      if (localChanges.includes(field) && remoteChanges.includes(field)) {
        const localTime = local.timestamp?.getTime?.() || 0;
        const remoteTime = new Date(remote.updated_at).getTime();
        merged[field] = remoteTime > localTime ? remote[field] : local[field];
        console.log(`  CONFLICT on ${field}: Using ${remoteTime > localTime ? 'remote' : 'local'}`);
      } else if (remoteChanges.includes(field)) {
        // Remote changed, local didn't → take remote
        merged[field] = remote[field];
      }
      // If only local changed, keep local value (already in merged)
    });

    return merged;
  },
};

export const SyncEngine = {
  pushChanges: async (realm: Realm) => {
    // 1. SYNC POSTS (Batch Operation)
    const unsyncedPosts = realm.objects<Post>('Post').filtered('isSynced == false');
    
    if (unsyncedPosts.length > 0) {
      console.log(`Pushing ${unsyncedPosts.length} posts...`);
      
      // First, handle image uploads for posts with local URIs
      for (const post of unsyncedPosts) {
        if (post.localUri && !post.remoteUrl) {
          try {
            const fileInfo = await FileSystem.getInfoAsync(post.localUri);
            if (fileInfo.exists) {
              const fileName = `${post._id.toHexString()}.jpg`;
              
              // Read file as base64
              const base64 = await FileSystem.readAsStringAsync(post.localUri, {
                encoding: FileSystem.EncodingType.Base64,
              });
              
              // Convert base64 to ArrayBuffer
              const arrayBuffer = decode(base64);
              
              // Upload using Supabase SDK
              const { data: uploadData, error: uploadError } = await supabase.storage
                .from('media')
                .upload(fileName, arrayBuffer, {
                  contentType: 'image/jpeg',
                  upsert: true,
                });

              if (uploadError) {
                console.error(`❌ Upload error for post ${post._id.toHexString()}:`, uploadError);
              } else {
                const { data } = supabase.storage.from('media').getPublicUrl(fileName);
                realm.write(() => { post.remoteUrl = data.publicUrl; });
                console.log(`✅ Uploaded image for post ${post._id.toHexString()}`);
              }
            }
          } catch (e) { 
            console.error(`Error uploading image for post ${post._id.toHexString()}:`, e); 
          }
        }
      }
      
      // Batch insert all posts in one network call with exponential backoff
      const postsPayload = unsyncedPosts.map(p => {
        const payload: any = {
          id: p._id.toHexString(),
          text: p.text,
          image_url: p.remoteUrl,
          timestamp: p.timestamp.toISOString(),
          user_email: p.userEmail,
        };
        
        // Only include deleted_at if it exists
        if (p.deletedAt) {
          payload.deleted_at = p.deletedAt.toISOString();
        }
        
        return payload;
      });
      
      const result = await RetryEngine.executeWithBackoff(
        async () => {
          const { error } = await supabase.from('posts').upsert(postsPayload);
          if (error) {
            console.error('Supabase upsert error:', error);
            throw error;
          }
          return true;
        },
        `Push ${unsyncedPosts.length} posts`
      );
      
      if (result) {
        realm.write(() => {
          unsyncedPosts.forEach(p => { p.isSynced = true; });
        });
      }
    }

    // 2. SYNC LIKES (Batch Operations - Soft Deletes with Exponential Backoff)
    const unsyncedLikes = realm.objects<Like>('Like').filtered('isSynced == false');
    
    if (unsyncedLikes.length > 0) {
      const likesToDelete = unsyncedLikes.filtered('deletedAt != null');
      const likesToInsert = unsyncedLikes.filtered('deletedAt == null');
      
      // Batch upsert soft-deleted likes (send deletedAt to server)
      if (likesToDelete.length > 0) {
        const deletePayload = likesToDelete.map(l => ({
          id: l._id.toHexString(),
          post_id: l.postId,
          user_email: l.userEmail,
          deleted_at: l.deletedAt?.toISOString(),
        }));
        
        const result = await RetryEngine.executeWithBackoff(
          async () => {
            const { error } = await supabase.from('likes').upsert(deletePayload);
            if (error) throw error;
            return true;
          },
          `Delete ${likesToDelete.length} likes`
        );
        
        if (result) {
          realm.write(() => {
            likesToDelete.forEach(l => { l.isSynced = true; });
          });
        }
      }
      
      // Batch insert new likes
      if (likesToInsert.length > 0) {
        const insertPayload = likesToInsert.map(l => ({
          id: l._id.toHexString(),
          post_id: l.postId,
          user_email: l.userEmail,
        }));
        
        const result = await RetryEngine.executeWithBackoff(
          async () => {
            const { error } = await supabase.from('likes').upsert(insertPayload);
            if (error) throw error;
            return true;
          },
          `Insert ${likesToInsert.length} likes`
        );
        
        if (result) {
          realm.write(() => {
            likesToInsert.forEach(l => { l.isSynced = true; });
          });
        }
      }
    }

    // 3. SYNC COMMENTS (Batch Operations - Soft Deletes with Exponential Backoff)
    const unsyncedComments = realm.objects<Comment>('Comment').filtered('isSynced == false');
    
    if (unsyncedComments.length > 0) {
      const commentsToDelete = unsyncedComments.filtered('deletedAt != null');
      const commentsToInsert = unsyncedComments.filtered('deletedAt == null');
      
      // Batch upsert soft-deleted comments
      if (commentsToDelete.length > 0) {
        const deletePayload = commentsToDelete.map(c => ({
          id: c._id.toHexString(),
          post_id: c.postId,
          user_email: c.userEmail,
          text: c.text,
          created_at: c.timestamp.toISOString(),
          deleted_at: c.deletedAt?.toISOString(),
        }));
        
        const result = await RetryEngine.executeWithBackoff(
          async () => {
            const { error } = await supabase.from('comments').upsert(deletePayload);
            if (error) throw error;
            return true;
          },
          `Delete ${commentsToDelete.length} comments`
        );
        
        if (result) {
          realm.write(() => {
            commentsToDelete.forEach(c => { c.isSynced = true; });
          });
        }
      }
      
      // Batch insert new comments
      if (commentsToInsert.length > 0) {
        const insertPayload = commentsToInsert.map(c => ({
          id: c._id.toHexString(),
          post_id: c.postId,
          user_email: c.userEmail,
          text: c.text,
          created_at: c.timestamp.toISOString(),
        }));
        
        const result = await RetryEngine.executeWithBackoff(
          async () => {
            const { error } = await supabase.from('comments').upsert(insertPayload);
            if (error) throw error;
            return true;
          },
          `Insert ${commentsToInsert.length} comments`
        );
        
        if (result) {
          realm.write(() => {
            commentsToInsert.forEach(c => { c.isSynced = true; });
          });
        }
      }
    }
  },

  pullChanges: async (realm: Realm) => {
    // Ensure SystemSettings exists
    let systemSettings = realm.objects('SystemSettings')[0] as any;
    if (!systemSettings) {
      realm.write(() => {
        systemSettings = realm.create('SystemSettings', {
          _id: new Realm.BSON.ObjectId(),
          lastSyncTime: new Date(0),
        });
      });
    }
    
    const lastSyncTime: Date = systemSettings?.lastSyncTime || new Date(0);

    // 1. PULL POSTS (only updated since last sync)
    const { data: posts } = await supabase
      .from('posts')
      .select('*')
      .gt('updated_at', lastSyncTime.toISOString())
      .limit(100);
    
    if (posts) {
      realm.write(() => {
        posts.forEach((remotePost) => {
          const existingPost = realm.objectForPrimaryKey<Post>('Post', Realm.BSON.ObjectId.createFromHexString(remotePost.id));
          
          if (existingPost) {
            // CONFLICT DETECTION: Post exists locally
            console.log(`[CONFLICT] Post ${remotePost.id} exists both locally and remotely`);
            
            // Check if local has unsynced changes
            if (!existingPost.isSynced) {
              console.log(`  Local post has unsync changes, attempting merge...`);
              // Use field-level merging for unsync changes
              const merged = ConflictResolver.fieldLevelMerge(
                {
                  text: existingPost.text,
                  image_url: existingPost.remoteUrl,
                  timestamp: existingPost.timestamp,
                  updated_at: existingPost.timestamp.toISOString(),
                },
                remotePost
              );
              
              existingPost.text = merged.text;
              existingPost.remoteUrl = merged.image_url;
              existingPost.isSynced = true; // Mark as synced after merge
              console.log(`  Merged successfully`);
            } else {
              // No local changes, use Last Write Wins
              const resolved = ConflictResolver.lastWriteWins(existingPost, remotePost);
              if (resolved === remotePost) {
                existingPost.text = remotePost.text;
                existingPost.remoteUrl = remotePost.image_url;
                existingPost.timestamp = new Date(remotePost.timestamp);
              }
            }
          } else {
            // No conflict, create new post
            realm.create('Post', {
              _id: Realm.BSON.ObjectId.createFromHexString(remotePost.id),
              text: remotePost.text,
              timestamp: new Date(remotePost.timestamp),
              remoteUrl: remotePost.image_url,
              userEmail: remotePost.user_email || 'anon',
              isSynced: true,
            });
          }
        });
      });
    }

    // 2. PULL LIKES (only updated since last sync)
    const { data: likes } = await supabase
      .from('likes')
      .select('*')
      .gt('updated_at', lastSyncTime.toISOString())
      .limit(100);
    
    if (likes) {
      realm.write(() => {
        likes.forEach((l) => {
          const exists = realm.objectForPrimaryKey<Like>('Like', Realm.BSON.ObjectId.createFromHexString(l.id));
          if (!exists) {
            realm.create('Like', {
              _id: Realm.BSON.ObjectId.createFromHexString(l.id),
              postId: l.post_id,
              userEmail: l.user_email,
              isSynced: true,
            });
          }
        });
      });
    }

    // 3. PULL COMMENTS (only updated since last sync)
    const { data: comments } = await supabase
      .from('comments')
      .select('*')
      .gt('updated_at', lastSyncTime.toISOString())
      .limit(100);
    
    if (comments) {
      realm.write(() => {
        comments.forEach((remoteComment) => {
          const exists = realm.objectForPrimaryKey<Comment>('Comment', Realm.BSON.ObjectId.createFromHexString(remoteComment.id));
          
          if (exists && !exists.isSynced) {
            // Conflict: Both local and remote have changes to comment
            console.log(`[CONFLICT] Comment ${remoteComment.id} has local unsync changes`);
            const merged = ConflictResolver.fieldLevelMerge(
              {
                text: exists.text,
                timestamp: exists.timestamp,
                updated_at: exists.timestamp.toISOString(),
              },
              remoteComment
            );
            
            exists.text = merged.text;
            exists.isSynced = true;
            console.log(`  Comment merged successfully`);
          } else if (!exists) {
            realm.create('Comment', {
              _id: Realm.BSON.ObjectId.createFromHexString(remoteComment.id),
              postId: remoteComment.post_id,
              userEmail: remoteComment.user_email,
              text: remoteComment.text,
              timestamp: new Date(remoteComment.created_at),
              isSynced: true,
            });
          }
        });
      });
    }

    // Update last sync timestamp
    realm.write(() => {
      const settings = realm.objects('SystemSettings')[0] as any;
      if (settings) {
        settings.lastSyncTime = new Date();
      }
    });
  },

  pruneData: async (realm: Realm) => {
    const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;
    const maxPosts = 1000;
    const now = new Date();
    const tenDaysAgo = new Date(now.getTime() - TEN_DAYS_MS);

    realm.write(() => {
      // 1. Actually delete soft-deleted items that have been synced (older than 10 days)
      const deletedPosts = realm.objects<Post>('Post').filtered('deletedAt < $0 AND isSynced == true', tenDaysAgo);
      if (deletedPosts.length > 0) {
        console.log(`🗑️ Permanently deleting ${deletedPosts.length} soft-deleted posts (older than 10 days)...`);
        realm.delete(deletedPosts);
      }

      const deletedComments = realm.objects<Comment>('Comment').filtered('deletedAt < $0 AND isSynced == true', tenDaysAgo);
      if (deletedComments.length > 0) {
        console.log(`🗑️ Permanently deleting ${deletedComments.length} soft-deleted comments (older than 10 days)...`);
        realm.delete(deletedComments);
      }

      const deletedLikes = realm.objects<Like>('Like').filtered('deletedAt < $0 AND isSynced == true', tenDaysAgo);
      if (deletedLikes.length > 0) {
        console.log(`🗑️ Permanently deleting ${deletedLikes.length} soft-deleted likes (older than 10 days)...`);
        realm.delete(deletedLikes);
      }

      // 2. Delete old synced posts to stay under limit (but NOT soft-deleted items)
      const activePosts = realm.objects<Post>('Post').filtered('deletedAt == null AND isSynced == true');
      if (activePosts.length > maxPosts) {
        const excessCount = activePosts.length - maxPosts;
        const sortedPosts = Array.from(activePosts).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        const postsToDelete = sortedPosts.slice(0, excessCount);
        console.log(`📊 Deleting ${postsToDelete.length} oldest posts to stay under ${maxPosts} limit...`);
        realm.delete(postsToDelete);
      }

      // 3. Delete associated comments from deleted posts
      const existingPostIds = new Set(realm.objects<Post>('Post').map(p => p._id.toHexString()));
      const orphanedComments = realm.objects<Comment>('Comment').filtered('deletedAt == null AND isSynced == true');
      const commentsToDelete = orphanedComments.filter(c => !existingPostIds.has(c.postId));
      if (commentsToDelete.length > 0) {
        console.log(`🔗 Deleting ${commentsToDelete.length} orphaned comments (post was deleted)...`);
        realm.delete(commentsToDelete);
      }

      // 4. Delete associated likes from deleted posts
      const orphanedLikes = realm.objects<Like>('Like').filtered('deletedAt == null AND isSynced == true');
      const likesToDelete = orphanedLikes.filter(l => !existingPostIds.has(l.postId));
      if (likesToDelete.length > 0) {
        console.log(`🔗 Deleting ${likesToDelete.length} orphaned likes (post was deleted)...`);
        realm.delete(likesToDelete);
      }
    });
  }
};

export default SyncEngine;