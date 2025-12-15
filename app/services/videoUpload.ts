import * as FileSystem from 'expo-file-system';
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

  // 2. Upload Video - Using Direct Supabase REST API
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

      // Convert base64 to Uint8Array for upload
      const arrayBuffer = decode(fileData);
      console.log('✅ Base64 decoded, buffer size:', arrayBuffer.byteLength);

      // Get the anon key from environment
      const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      const projectId = process.env.EXPO_PUBLIC_SUPABASE_PROJECT_ID;

      if (!anonKey || !projectId) {
        throw new Error('Missing Supabase credentials in environment');
      }

      // Direct REST API upload (bypass JS SDK issues)
      const uploadUrl = `https://${projectId}.supabase.co/storage/v1/object/${bucket}/${remotePath}`;
      
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${anonKey}`,
          'Content-Type': 'video/mp4',
        },
        body: arrayBuffer,
      });

      console.log('📤 Upload response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Upload failed:', response.status, errorText);
        throw new Error(`Upload failed: ${response.status} ${errorText}`);
      }

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
