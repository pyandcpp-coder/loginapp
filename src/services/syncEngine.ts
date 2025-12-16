import { Realm } from '@realm/react';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import { Comment, Like, Post, SystemSettings } from '../models';
import { supabase } from './supabaseClient';
import { VideoUtils } from './videoUpload';

// Helper to build correct file paths
const FilePathHelper = {
  getFullPath(localUri: string): string {
    if (!localUri) return '';
    
    // Already a full path
    if (localUri.startsWith('file://')) {
      return localUri.replace('file://', '');
    }
    if (localUri.startsWith('/')) {
      return localUri;
    }
    
    // Just a filename - prepend document directory
    return `${FileSystem.documentDirectory}${localUri}`.replace('file://', '');
  },

  async exists(path: string): Promise<boolean> {
    try {
      const fullPath = this.getFullPath(path);
      const info = await FileSystem.getInfoAsync(fullPath);
      return info.exists;
    } catch {
      return false;
    }
  }
};

// Exponential Backoff Retry Logic
const RetryEngine = {
  maxRetries: 3, // Reduced from 5
  baseDelay: 2000,
  
  async executeWithBackoff<T>(
    operation: () => Promise<T>,
    operationName: string = 'Operation'
  ): Promise<T | null> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await operation();
        if (attempt > 0) {
          console.log(`✅ ${operationName} succeeded after ${attempt} retries`);
        }
        return result;
      } catch (error) {
        lastError = error;
        
        if (attempt < this.maxRetries) {
          const delay = this.baseDelay * Math.pow(2, attempt);
          console.warn(`⚠️ ${operationName} failed (attempt ${attempt + 1}), retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    console.error(`❌ ${operationName} failed after ${this.maxRetries + 1} attempts:`, lastError);
    return null;
  },
};

export const SyncEngine = {
  private: {
    lastPushTime: 0,
    PUSH_COOLDOWN: 3000, // 3 seconds
    isSyncing: false,
  },

  // 1. PUSH (Uploads)
  pushChanges: async (realm: Realm) => {
    // Check if realm is valid
    if (!realm || realm.isClosed) {
      console.warn("⚠️ Realm is closed, skipping push");
      return;
    }

    // Prevent concurrent syncs
    if (SyncEngine.private.isSyncing) {
      console.log("⏸️ Sync already in progress");
      return;
    }

    // Rate limiting
    const now = Date.now();
    if (now - SyncEngine.private.lastPushTime < SyncEngine.private.PUSH_COOLDOWN) {
      console.log(`⏸️ Skipping push (cooldown: ${SyncEngine.private.PUSH_COOLDOWN}ms)`);
      return;
    }

    SyncEngine.private.isSyncing = true;
    SyncEngine.private.lastPushTime = now;

    try {
      // A. SYNC POSTS
      const unsyncedPosts = realm.objects<Post>('Post').filtered('isSynced == false');
      
      if (unsyncedPosts.length > 0) {
        console.log(`📤 Pushing ${unsyncedPosts.length} posts...`);
        
        for (const post of unsyncedPosts) {
          try {
            let publicUrl = post.remoteUrl;

            // Handle VIDEO Upload
            if (post.mediaType === 'video' && post.localUri && !post.remoteUrl) {
              const fullPath = FilePathHelper.getFullPath(post.localUri);
              
              // Verify file exists
              const exists = await FilePathHelper.exists(fullPath);
              if (!exists) {
                console.error(`❌ Video file not found: ${fullPath}`);
                continue;
              }

              console.log(`📹 Uploading video: ${post._id.toHexString()}`);
              console.log(`📂 Path: ${fullPath}`);
              
              publicUrl = await VideoUtils.uploadVideo(fullPath, post._id.toHexString());
              
              if (publicUrl) {
                realm.write(() => { 
                  post.remoteUrl = publicUrl; 
                });
                console.log(`✅ Video uploaded: ${publicUrl}`);
              }
            }
            // Handle IMAGE Upload
            else if (post.mediaType === 'image' && post.localUri && !post.remoteUrl) {
              const fullPath = FilePathHelper.getFullPath(post.localUri);
              
              const exists = await FilePathHelper.exists(fullPath);
              if (!exists) {
                console.error(`❌ Image file not found: ${fullPath}`);
                continue;
              }

              const fileName = `${post._id.toHexString()}.jpg`;
              
              // Read file as base64
              const base64 = await FileSystem.readAsStringAsync(fullPath, {
                encoding: FileSystem.EncodingType.Base64,
              });
              
              const arrayBuffer = decode(base64);
              
              const { data: uploadData, error: uploadError } = await supabase.storage
                .from('media')
                .upload(fileName, arrayBuffer, {
                  contentType: 'image/jpeg',
                  upsert: true,
                });

              if (uploadError) {
                console.error(`❌ Image upload error:`, uploadError);
                continue;
              }

              const { data } = supabase.storage.from('media').getPublicUrl(fileName);
              publicUrl = data.publicUrl;
              
              realm.write(() => { 
                post.remoteUrl = publicUrl; 
              });
              console.log(`✅ Image uploaded: ${publicUrl}`);
            }

            // Sync Metadata to DB
            const postsPayload: any = {
              id: post._id.toHexString(),
              text: post.text,
              image_url: post.mediaType === 'image' ? publicUrl : null,
              video_url: post.mediaType === 'video' ? publicUrl : null,
              media_type: post.mediaType,
              thumbnail_url: post.thumbnailUrl,
              timestamp: post.timestamp.toISOString(),
              user_email: post.userEmail || 'anon',
            };

            if (post.deletedAt) {
              postsPayload.deleted_at = post.deletedAt.toISOString();
            }

            const result = await RetryEngine.executeWithBackoff(
              async () => {
                const { error } = await supabase.from('posts').upsert([postsPayload]);
                if (error) throw error;
                return true;
              },
              `Push post ${post._id.toHexString()}`
            );

            if (result) {
              realm.write(() => {
                post.isSynced = true;
              });
            }
          } catch (e) {
            console.error(`❌ Failed to sync post ${post._id.toHexString()}:`, e);
          }
        }
      }

      // B. SYNC LIKES (Batch Operations)
      // Only sync likes for posts that are already synced
      const syncedPostIds = new Set(
        realm.objects<Post>('Post').filtered('isSynced == true').map(p => p._id.toHexString())
      );
      const unsyncedLikes = realm.objects<Like>('Like').filtered('isSynced == false');
      
      if (unsyncedLikes.length > 0) {
        // Filter to only likes for synced posts
        const likesForSyncedPosts = Array.from(unsyncedLikes).filter(l => syncedPostIds.has(l.postId));
        
        if (likesForSyncedPosts.length === 0) {
          console.log(`⏭️ Skipping ${unsyncedLikes.length} likes (parent posts not synced yet)`);
        } else {
          console.log(`💗 Syncing ${likesForSyncedPosts.length} likes (${unsyncedLikes.length - likesForSyncedPosts.length} skipped)...`);
        
          const likesToDelete = likesForSyncedPosts.filter(l => l.deletedAt != null);
          const likesToInsert = likesForSyncedPosts.filter(l => l.deletedAt == null);
        
          // Batch delete soft-deleted likes
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
      }

      // C. SYNC COMMENTS (Batch Operations)
      // Only sync comments for posts that are already synced
      const unsyncedComments = realm.objects<Comment>('Comment').filtered('isSynced == false');
      
      if (unsyncedComments.length > 0) {
        // Filter to only comments for synced posts
        const commentsForSyncedPosts = Array.from(unsyncedComments).filter(c => syncedPostIds.has(c.postId));
        
        if (commentsForSyncedPosts.length === 0) {
          console.log(`⏭️ Skipping ${unsyncedComments.length} comments (parent posts not synced yet)`);
        } else {
          console.log(`💬 Syncing ${commentsForSyncedPosts.length} comments (${unsyncedComments.length - commentsForSyncedPosts.length} skipped)...`);
        
          const commentsToDelete = commentsForSyncedPosts.filter(c => c.deletedAt != null);
          const commentsToInsert = commentsForSyncedPosts.filter(c => c.deletedAt == null);
        
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
      }
    } finally {
      SyncEngine.private.isSyncing = false;
    }
  },

  // 2. PULL (Downloads & Prefetching)
  pullChanges: async (realm: Realm) => {
    if (!realm || realm.isClosed) {
      console.warn("⚠️ Realm is closed, skipping pull");
      return;
    }
    
    // Get Last Sync Time
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

    // Fetch New Metadata Only (limit to prevent overwhelming)
    const { data: posts } = await supabase.from('posts')
      .select('*')
      .gt('timestamp', lastSync.toISOString())
      .order('timestamp', { ascending: false })
      .limit(20); // Reduced from 50

    if (posts && posts.length > 0) {
      console.log(`📥 Pulling ${posts.length} new posts...`);
      
      realm.write(() => {
        posts.forEach((p: any) => {
          const exists = realm.objectForPrimaryKey('Post', Realm.BSON.ObjectId.createFromHexString(p.id));
          if (!exists) {
            realm.create('Post', {
              _id: Realm.BSON.ObjectId.createFromHexString(p.id),
              text: p.text || '',
              timestamp: new Date(p.timestamp),
              remoteUrl: p.video_url || p.image_url,
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

    // Prefetch videos (optional, can be disabled for performance)
    // await SyncEngine.prefetchVideos(realm);
  },

  prefetchVideos: async (realm: Realm) => {
    // Only prefetch top 3 videos (reduced from 5)
    const videosToDownload = realm.objects<Post>('Post')
      .filtered("mediaType == 'video' AND localUri == null AND remoteUrl != null")
      .sorted('timestamp', true)
      .slice(0, 3);

    if (videosToDownload.length === 0) return;

    console.log(`📥 Prefetching ${videosToDownload.length} videos...`);

    for (const video of videosToDownload) {
      try {
        const fileDir = FileSystem.documentDirectory + 'videos/';
        await FileSystem.makeDirectoryAsync(fileDir, { intermediates: true });
        
        const fileName = `${video._id.toHexString()}.mp4`;
        const localPath = fileDir + fileName;

        const { uri } = await FileSystem.downloadAsync(video.remoteUrl!, localPath);
        
        realm.write(() => {
          video.localUri = uri;
        });
        console.log(`✅ Prefetched: ${fileName}`);
      } catch (e) {
        console.warn(`⚠️ Prefetch failed for ${video._id.toHexString()}:`, e);
      }
    }
  },

  pruneData: async (realm: Realm) => {
    const RETENTION_DAYS = 30; // Increased from 10
    const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const MAX_POSTS = 500; // Reduced from 1000
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - RETENTION_MS);

    realm.write(() => {
      // 1. Delete old soft-deleted items
      const deletedPosts = realm.objects<Post>('Post')
        .filtered('deletedAt < $0 AND isSynced == true', cutoffDate);
      if (deletedPosts.length > 0) {
        console.log(`🗑️ Pruning ${deletedPosts.length} old deleted posts...`);
        realm.delete(deletedPosts);
      }

      const deletedComments = realm.objects<Comment>('Comment')
        .filtered('deletedAt < $0 AND isSynced == true', cutoffDate);
      if (deletedComments.length > 0) {
        console.log(`🗑️ Pruning ${deletedComments.length} old deleted comments...`);
        realm.delete(deletedComments);
      }

      const deletedLikes = realm.objects<Like>('Like')
        .filtered('deletedAt < $0 AND isSynced == true', cutoffDate);
      if (deletedLikes.length > 0) {
        console.log(`🗑️ Pruning ${deletedLikes.length} old deleted likes...`);
        realm.delete(deletedLikes);
      }

      // 2. Limit total posts
      const activePosts = realm.objects<Post>('Post')
        .filtered('deletedAt == null AND isSynced == true');
      
      if (activePosts.length > MAX_POSTS) {
        const excessCount = activePosts.length - MAX_POSTS;
        const sortedPosts = Array.from(activePosts)
          .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        const postsToDelete = sortedPosts.slice(0, excessCount);
        
        console.log(`📊 Pruning ${postsToDelete.length} old posts (limit: ${MAX_POSTS})...`);
        realm.delete(postsToDelete);
      }

      // 3. Clean orphaned comments and likes
      const existingPostIds = new Set(
        realm.objects<Post>('Post').map(p => p._id.toHexString())
      );
      
      const orphanedComments = Array.from(realm.objects<Comment>('Comment'))
        .filter(c => !existingPostIds.has(c.postId));
      
      const orphanedLikes = Array.from(realm.objects<Like>('Like'))
        .filter(l => !existingPostIds.has(l.postId));
      
      if (orphanedComments.length > 0) {
        console.log(`🧹 Pruning ${orphanedComments.length} orphaned comments...`);
        realm.delete(orphanedComments);
      }
      
      if (orphanedLikes.length > 0) {
        console.log(`🧹 Pruning ${orphanedLikes.length} orphaned likes...`);
        realm.delete(orphanedLikes);
      }
    });
  }
};

export default SyncEngine;