import { supabase } from './supabaseClient';
import { Realm } from '@realm/react';
import { Post,Like,Comment } from '../models'; 
import * as FileSystem from 'expo-file-system/legacy';
import { decode as base64ToArrayBuffer } from 'base64-arraybuffer';

export const SyncEngine = {
  pushChanges: async (realm: Realm) => {
    // 1. SYNC POSTS
    const unsyncedPosts = realm.objects<Post>('Post').filtered('isSynced == false');
    
    if (unsyncedPosts.length > 0) {
      console.log(`Pushing ${unsyncedPosts.length} posts...`);
      for (const post of unsyncedPosts) {
        let publicUrl = post.remoteUrl;
        
        if (post.localUri && !post.remoteUrl) {
          try {
            const fileInfo = await FileSystem.getInfoAsync(post.localUri);
            if (fileInfo.exists) {
              const base64 = await FileSystem.readAsStringAsync(post.localUri, { encoding: FileSystem.EncodingType.Base64 });
              const fileName = `${post._id.toHexString()}.jpg`;
              await supabase.storage.from('media').upload(fileName, base64ToArrayBuffer(base64), { contentType: 'image/jpeg', upsert: true });
              const { data } = supabase.storage.from('media').getPublicUrl(fileName);
              publicUrl = data.publicUrl;
              realm.write(() => { post.remoteUrl = publicUrl; });
            }
          } catch (e) { 
            console.error(e); 
            continue; 
          }
        }

        const { error } = await supabase.from('posts').insert({
          id: post._id.toHexString(),
          text: post.text,
          image_url: publicUrl,
          timestamp: post.timestamp.toISOString(),
          user_email:post.userEmail,
        });
        if (!error || error.code === '23505') {
          realm.write(() => { post.isSynced = true; });
        }
      }
    }

    // 2. SYNC LIKES (Handle Deletions!)
    const unsyncedLikes = realm.objects<Like>('Like').filtered('isSynced == false');
    for (const like of unsyncedLikes) {
      if (like.isDeleted) {
        // DELETE FROM SERVER
        const { error } = await supabase.from('likes').delete().match({ id: like._id.toHexString() });
        if (!error) {
          realm.write(() => { realm.delete(like); }); // Actually delete locally now
        }
      } else {
        // INSERT TO SERVER
        const { error } = await supabase.from('likes').insert({
          id: like._id.toHexString(),
          post_id: like.postId,
          user_email: like.userEmail,
        });
        if (!error || error.code === '23505') {
          realm.write(() => { like.isSynced = true; });
        }
      }
    }
  },

  pullChanges: async (realm: Realm) => {
    // 1. PULL POSTS
    const { data: posts } = await supabase.from('posts').select('*').limit(50);
    if (posts) {
      realm.write(() => {
        posts.forEach((p) => {
          const exists = realm.objectForPrimaryKey('Post', Realm.BSON.ObjectId.createFromHexString(p.id));
          if (!exists) {
            realm.create('Post', {
              _id: Realm.BSON.ObjectId.createFromHexString(p.id),
              text: p.text,
              timestamp: new Date(p.timestamp),
              remoteUrl: p.image_url,
              userEmail: p.user_email|| 'anon',
              isSynced: true,
            });
          }
        });
      });
    }

    // 2. PULL LIKES (For the posts we have)
    const { data: likes } = await supabase.from('likes').select('*').limit(100);
    if (likes) {
      realm.write(() => {
        likes.forEach((l) => {
          const exists = realm.objectForPrimaryKey('Like', Realm.BSON.ObjectId.createFromHexString(l.id));
          if (!exists) {
            realm.create('Like', {
              _id: Realm.BSON.ObjectId.createFromHexString(l.id),
              postId: l.post_id,
              userEmail: l.user_email,
              isSynced: true,
              isDeleted: false,
            });
          }
        });
      });
    }

    // 3. PULL COMMENTS
    const { data: comments } = await supabase.from('comments').select('*').limit(100);
    if (comments) {
      realm.write(() => {
        comments.forEach((c) => {
          const exists = realm.objectForPrimaryKey('Comment', Realm.BSON.ObjectId.createFromHexString(c.id));
          if (!exists) {
            realm.create('Comment', {
              _id: Realm.BSON.ObjectId.createFromHexString(c.id),
              postId: c.post_id,
              userEmail: c.user_email,
              text: c.text,
              timestamp: new Date(c.created_at),
              isSynced: true,
            });
          }
        });
      });
    }
  }
};