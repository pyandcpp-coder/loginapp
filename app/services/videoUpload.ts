import * as FileSystem from 'expo-file-system';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { supabase } from './supabaseClient'; // Your existing client

export const VideoUtils = {
  // 1. Generate Thumbnail
  generateThumbnail: async (videoUri: string) => {
    try {
      const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
        time: 1000, // Capture frame at 1 second
      });
      return uri;
    } catch (e) {
      console.warn("Could not generate thumbnail", e);
      return null;
    }
  },

  // 2. Upload Video to Supabase Storage (Multipart)
  uploadVideo: async (localUri: string, postId: string) => {
    const fileName = `${postId}.mp4`;
    const supabaseUrl = 'https://trnvmbrtqtfngwigasyu.supabase.co'; // e.g. https://xyz.supabase.co
    
    // We use standard fetch/FileSystem upload instead of supabase.storage.upload
    // because Supabase JS client requires Blob/ArrayBuffer which is slow for videos in RN.
    const uploadUrl = `${supabaseUrl}/storage/v1/object/reels/${fileName}`;

    const response = await FileSystem.uploadAsync(uploadUrl, localUri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'file',
      mimeType: 'video/mp4',
      headers: {
        Authorization: `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`, // Or your auth token
      },
    });

    if (response.status === 200) {
      const { data } = supabase.storage.from('reels').getPublicUrl(fileName);
      return data.publicUrl;
    }
    throw new Error('Upload failed');
  }
};
