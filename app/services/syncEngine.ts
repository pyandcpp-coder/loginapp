import { supabase } from './supabaseClient';
import { Realm } from '@realm/react';
import { Post } from '../models'; 
import * as FileSystem from 'expo-file-system/legacy';
import { decode as base64ToArrayBuffer } from 'base64-arraybuffer';

export const SyncEngine = {
  //Send local offline posts to the cloud
  pushChanges: async (realm: Realm) => {
    const unsyncedPosts = realm.objects<Post>('Post').filtered('isSynced == false');

    if (unsyncedPosts.length === 0) return; // Nothing to do

    console.log(`Pushing ${unsyncedPosts.length} posts to cloud...`);

    for (const post of unsyncedPosts) {
      let publicUrl = post.remoteUrl; 

      if (post.localUri && !post.remoteUrl) {
        console.log(" Uploading image...");
        try {
          // Check if file exists first
          const fileInfo = await FileSystem.getInfoAsync(post.localUri);
          if (!fileInfo.exists) {
            console.warn("File no longer exists, marking as synced without image:", post.localUri);
            realm.write(() => {
              post.localUri = undefined; // Clear the bad path
              post.isSynced = true; // Mark as synced so we don't retry
            });
            continue;
          }

          // Use legacy FileSystem API
          const base64 = await FileSystem.readAsStringAsync(post.localUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          
          const fileName = `${post._id.toHexString()}.jpg`;
          

          // Convert base64 string to ArrayBuffer
          const arrayBuffer = base64ToArrayBuffer(base64);

          const { data, error: uploadError } = await supabase.storage
            .from('media') // The bucket we created
            .upload(fileName, arrayBuffer, {
              contentType: 'image/jpeg',
              upsert: true
            });

          if (uploadError) throw uploadError;
          const { data: urlData } = supabase.storage.from('media').getPublicUrl(fileName);
          publicUrl = urlData.publicUrl;
          realm.write(() => {
            post.remoteUrl = publicUrl;
          });
        } catch (e) {
          console.error("Image upload failed", e);
          continue; // Skip this post, try again next sync
        }
      }

      // 2. Upload the Post Data (Text + Image URL)
      const { error } = await supabase.from('posts').insert({
        id: post._id.toHexString(),
        text: post.text,
        image_url: publicUrl, // Send the Supabase URL
        timestamp: post.timestamp.toISOString(),
      });

      if (!error || (error && error.code === '23505')) {
        // If upload success, or duplicate key (already exists), mark as synced locally!
        realm.write(() => {
          post.isSynced = true;
        });
        if (error && error.code === '23505') {
          console.warn('Post already exists in cloud, marking as synced:', post._id.toHexString());
        }
      } else {
        console.error("Post upload failed", error);
      }
    }
  },
  // 2. PULL: new posts from the cloud
  pullChanges: async (realm: Realm) => {
    console.log("⬇️ Pulling data from cloud...");
    
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(50); // Get last 50 posts

    if (error || !data) return;

    realm.write(() => {
      data.forEach((serverPost) => {
        const exists = realm.objectForPrimaryKey('Post', Realm.BSON.ObjectId.createFromHexString(serverPost.id));
        if (!exists) {
          realm.create('Post', {
            _id: Realm.BSON.ObjectId.createFromHexString(serverPost.id),
            text: serverPost.text,
            timestamp: new Date(serverPost.timestamp),
            remoteUrl: serverPost.image_url, // <--- Map this!
            isSynced: true,
          });
        }
      });
    });
  }
};