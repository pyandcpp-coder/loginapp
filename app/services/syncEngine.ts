import { supabase } from './supabaseClient';
import { Realm } from '@realm/react';
import { Post, Like, Comment, SystemSettings } from '../models'; 
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { VideoUtils } from './videoUpload';

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
  // 1. PUSH (Uploads)
  pushChanges: async (realm: Realm) => {
    // Check if realm is valid
    if (!realm || realm.isClosed) {
      console.warn("⚠️ Realm is closed, skipping push");
      return;
    }
    
    // A. SYNC POSTS
    const unsyncedPosts = realm.objects<Post>('Post').filtered('isSynced == false');
    
    if (unsyncedPosts.length > 0) {
      console.log(`Pushing ${unsyncedPosts.length} posts...`);
      
      for (const post of unsyncedPosts) {
        let publicUrl = post.remoteUrl;

        // Handle VIDEO Upload
        if (post.mediaType === 'video' && post.localUri && !post.remoteUrl) {
          try {
            console.log(`📹 Uploading video for post ${post._id.toHexString()}`);
            console.log(`📁 Local URI: ${post.localUri}`);
            publicUrl = await VideoUtils.uploadVideo(post.localUri, post._id.toHexString());
            realm.write(() => { post.remoteUrl = publicUrl; });
            console.log(`✅ Uploaded video for post ${post._id.toHexString()}`);
            console.log(`🔗 Remote URL: ${publicUrl}`);
          } catch (e) { 
            console.error("❌ Video Upload Failed:", e); 
            console.error("Stack:", (e as any).stack);
            continue; 
          }
        }
        // Handle IMAGE Upload (Legacy Logic)
        else if (post.mediaType === 'image' && post.localUri && !post.remoteUrl) {
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

        // Sync Metadata to DB
        const postsPayload = [{
          id: post._id.toHexString(),
          text: post.text,
          image_url: publicUrl,
          media_type: post.mediaType,
          thumbnail_url: post.thumbnailUrl,
          timestamp: post.timestamp.toISOString(),
          user_email: post.userEmail,
        }];

        if (post.deletedAt) {
          (postsPayload[0] as any).deleted_at = post.deletedAt.toISOString();
        }

        const result = await RetryEngine.executeWithBackoff(
          async () => {
            const { error } = await supabase.from('posts').upsert(postsPayload);
            if (error) {
              console.error('Supabase upsert error:', error);
              throw error;
            }
            return true;
          },
          `Push post ${post._id.toHexString()}`
        );

        if (result) {
          realm.write(() => {
            post.isSynced = true;
          });
        }
      }
    }

    // B. SYNC LIKES (Batch Operations - Soft Deletes with Exponential Backoff)
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

    // C. SYNC COMMENTS (Batch Operations - Soft Deletes with Exponential Backoff)
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

  // 2. PULL (Downloads & Prefetching)
  pullChanges: async (realm: Realm) => {
    // Check if realm is valid
    if (!realm || realm.isClosed) {
      console.warn("⚠️ Realm is closed, skipping pull");
      return;
    }
    
    // A. Get Last Sync Time
    let settings = realm.objects<SystemSettings>('SystemSettings')[0];
    if (!settings) {
      realm.write(() => { 
        settings = realm.create('SystemSettings', { 
          _id: new Realm.BSON.ObjectId(), 
          lastSyncTime: new Date(0) 
        }) as any; 
      });
    }
    const lastSync = settings!.lastSyncTime;

    // B. Fetch New Metadata Only
    const { data: posts } = await supabase.from('posts')
      .select('*')
      .gt('timestamp', lastSync.toISOString())
      .limit(50);

    if (posts && posts.length > 0) {
      realm.write(() => {
        posts.forEach((p: any) => {
          const exists = realm.objectForPrimaryKey('Post', Realm.BSON.ObjectId.createFromHexString(p.id));
          if (!exists) {
            realm.create('Post', {
              _id: Realm.BSON.ObjectId.createFromHexString(p.id),
              text: p.text,
              timestamp: new Date(p.timestamp),
              remoteUrl: p.image_url || p.video_url,
              mediaType: p.media_type || 'image',
              thumbnailUrl: p.thumbnail_url,
              userEmail: p.user_email || 'anon',
              isSynced: true,
            });
          }
        });
        settings!.lastSyncTime = new Date();
      });
    }

    // C. "NEXT 5" PREFETCH STRATEGY (The Magic)
    await SyncEngine.prefetchVideos(realm);
  },

  prefetchVideos: async (realm: Realm) => {
    // Find top 5 videos that have a remote URL but NO local URI
    const videosToDownload = realm.objects<Post>('Post')
      .filtered("mediaType == 'video' AND localUri == null AND remoteUrl != null")
      .sorted('timestamp', true) // Newest first
      .slice(0, 5);

    for (const video of videosToDownload) {
      try {
        const fileDir = FileSystem.documentDirectory + 'videos/';
        await FileSystem.makeDirectoryAsync(fileDir, { intermediates: true });
        
        const fileName = `${video._id.toHexString()}.mp4`;
        const localLoc = fileDir + fileName;

        // Download in background
        const { uri } = await FileSystem.downloadAsync(video.remoteUrl!, localLoc);
        
        realm.write(() => {
          video.localUri = uri;
        });
        console.log(`Prefetched video: ${fileName}`);
      } catch (e) {
        console.error("Prefetch failed", e);
      }
    }
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
      const allComments = Array.from(realm.objects<Comment>('Comment'));
      const orphanedComments = allComments.filter((comment: Comment) => {
        return !existingPostIds.has(comment.postId);
      });
      if (orphanedComments.length > 0) {
        console.log(`🧹 Deleting ${orphanedComments.length} orphaned comments...`);
        realm.delete(orphanedComments);
      }
    });
  }
};

export default SyncEngine;
