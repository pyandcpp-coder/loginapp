import * as FileSystem from 'expo-file-system/legacy';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { supabase } from './supabaseClient';
import { decode } from 'base64-arraybuffer';

export const VideoUtils = {
  // 1. Generate Thumbnail
  generateThumbnail: async (videoUri: string) => {
    try {
      const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
        time: 1000, // Capture frame at 1 second
      });
      return uri;
    } catch (e) {
      console.warn("Thumbnail failed", e);
      return null;
    }
  },

  // 2. Upload Video - Using Supabase JS Client
  uploadVideo: async (localUri: string, postId: string) => {
    try {
      console.log('📹 Starting video upload from:', localUri);
      
      const remotePath = `${postId}.mp4`;
      const bucket = 'reels';

      // Read file as base64
      const fileData = await FileSystem.readAsStringAsync(localUri, {
        encoding: 'base64',
      } as any);

      console.log('✅ File read successfully, size:', fileData.length);

      // Convert base64 to ArrayBuffer for upload
      const arrayBuffer = decode(fileData);
      console.log('✅ Base64 decoded, buffer size:', arrayBuffer.byteLength);

      // Use Supabase client to upload with ArrayBuffer directly
      // Supabase JS SDK supports ArrayBuffer, Blob, File, or FormData
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(remotePath, arrayBuffer, {
          contentType: 'video/mp4',
          upsert: true, // Allow overwriting if file exists
        });

      if (error) {
        console.error('❌ Supabase upload error:', error);
        throw new Error(`Upload failed: ${error.message}`);
      }

      console.log('✅ Upload response data:', data);

      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(remotePath);

      console.log('✅ Video uploaded successfully:', publicUrlData.publicUrl);
      return publicUrlData.publicUrl;
    } catch (error) {
      console.error("❌ Video upload error:", error);
      throw error;
    }
  }
};
