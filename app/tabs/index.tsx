import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, SafeAreaView } from 'react-native';
import { useRouter, Link } from 'expo-router';
import { Realm } from '@realm/react';
import { useRealm, useQuery, Post, Like, Comment } from '../models';
import { FlashList } from "@shopify/flash-list";
import Animated, { FadeInDown, Layout } from 'react-native-reanimated';
import NetInfo from '@react-native-community/netinfo';
import { SyncEngine } from '../services/syncEngine';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuthStore } from '../store/authStore';


const PostItem = ({ item }: { item: Post }) => {
  const realm = useRealm();
  const { user } = useAuthStore();
  const [commentText, setCommentText] = useState('');
  const [showComments, setShowComments] = useState(false);

  // Live Queries for THIS post
  // FIX: Only count likes that are NOT deleted (deletedAt == null)
  const likes = useQuery(Like).filtered('postId == $0 AND deletedAt == null', item._id.toHexString());
  const comments = useQuery(Comment).filtered('postId == $0 AND deletedAt == null', item._id.toHexString()).sorted('timestamp');
  
  const myLike = likes.find(l => l.userEmail === user?.email);
  const isLiked = !!myLike;

  const toggleLike = () => {
    realm.write(() => {
      if (myLike) {
        // Soft delete: set deletedAt instead of removing
        myLike.deletedAt = new Date();
        myLike.isSynced = false;
      } else {
        // Check if we have a "soft-deleted" like we can resurrect (optimization)
        const deletedLike = realm.objects<Like>('Like').filtered('postId == $0 AND userEmail == $1 AND deletedAt != null', item._id.toHexString(), user?.email)[0];
        
        if (deletedLike) {
          deletedLike.deletedAt = undefined;
          deletedLike.isSynced = false;
        } else {
          realm.create('Like', {
            _id: new Realm.BSON.ObjectId(),
            postId: item._id.toHexString(),
            userEmail: user?.email || 'anon',
            isSynced: false,
          });
        }
      }
    });
    // Trigger sync silently
    SyncEngine.pushChanges(realm);
  };

  const addComment = () => {
    if (!commentText) return;
    realm.write(() => {
      realm.create('Comment', {
        _id: new Realm.BSON.ObjectId(),
        postId: item._id.toHexString(),
        userEmail: user?.email || 'anon',
        text: commentText,
        timestamp: new Date(),
        isSynced: false,
      });
    });
    setCommentText('');
    SyncEngine.pushChanges(realm);
  };

  return (
    <Animated.View 
      style={styles.postCard}
    >
      {(item.localUri || item.remoteUrl) && (
        <Image 
          source={{ uri: item.localUri || item.remoteUrl }} 
          style={styles.postImage}
          contentFit="cover"
        />
      )}
      <Text style={styles.postText}>{item.text}</Text>
      
      {/* Action Bar */}
      <View style={styles.actionBar}>
        <TouchableOpacity onPress={toggleLike} style={styles.actionButton}>
          <Text style={{fontSize: 18}}>{isLiked ? "❤️" : "🤍"}</Text>
          <Text style={styles.actionText}>{likes.length} Likes</Text>
        </TouchableOpacity>
        
        <TouchableOpacity onPress={() => setShowComments(!showComments)} style={styles.actionButton}>
          <Text style={{fontSize: 18}}>💬</Text>
          <Text style={styles.actionText}>{comments.length} Comments</Text>
        </TouchableOpacity>
      </View>

      {/* Comments Section */}
      {showComments && (
        <View style={styles.commentSection}>
          {Array.from(comments).map((c) => (
            <View key={c._id.toHexString()} style={styles.commentRow}>
              <Text style={styles.commentUser}>{c.userEmail.split('@')[0]}: </Text>
              <Text style={styles.commentText}>{c.text}</Text>
            </View>
          ))}
          <View style={styles.commentInputRow}>
            <TextInput 
              style={styles.commentInput} 
              placeholder="Add a comment..."
              value={commentText}
              onChangeText={setCommentText}
              placeholderTextColor="#999"
            />
            <TouchableOpacity style={styles.sendButton} onPress={addComment}>
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      
      <Text style={styles.postDate}>
        {item.timestamp.toLocaleTimeString()} • {item.isSynced ? "✅" : "⏳"}
      </Text>
    </Animated.View>
  );
};

// --- MAIN SCREEN ---
export default function HomeScreen() {
  const router = useRouter();
  const [newPostText, setNewPostText] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null); 
  
  // 1. Live Query from Realm (Sorted by newest)
  const posts = useQuery(Post).sorted('timestamp', true);
  const realm = useRealm();

  // 2. Pick Image Function
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5, // Compress for faster sync
    });

    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    }
  };

  // 3. Handle New Post (Offline First)
  const handleAddPost = async () => {
    if (!newPostText && !imageUri) return; // Don't post empty stuff

    // Copy image to permanent location if present
    let permanentUri = imageUri;
    if (imageUri) {
      const filename = imageUri.split('/').pop() || `${Date.now()}.jpg`;
      const newPath = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.copyAsync({
        from: imageUri,
        to: newPath,
      });
      permanentUri = newPath;
    }

    // Write to Local DB immediately
    realm.write(() => {
      realm.create('Post', {
        _id: new Realm.BSON.ObjectId(),
        text: newPostText,
        timestamp: new Date(),
        localUri: permanentUri ?? undefined, // Store permanent local path
        isSynced: false,
      });
    });

    // Reset Inputs UI
    setNewPostText('');
    setImageUri(null);

    // Check Network & Trigger Background Sync
    const state = await NetInfo.fetch();
    if (state.isConnected) {

      console.log("⚡️ Online! Triggering immediate sync...");
      SyncEngine.pushChanges(realm); 
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Link href="/profile" asChild>
          <TouchableOpacity style={styles.profileButton}>
            <Text style={styles.profileEmoji}>👤</Text>
          </TouchableOpacity>
        </Link>
        <Text style={styles.title}>Social Feed</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={() => router.replace('/login')}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.inputWrapper}>
        <View style={styles.inputContainer}>
          <TouchableOpacity onPress={pickImage} style={styles.imagePickerButton}>
            <Text style={{fontSize: 22}}>📷</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder="What's on your mind?"
            value={newPostText}
            onChangeText={setNewPostText}
            multiline
            placeholderTextColor="#999"
          />
          
          <TouchableOpacity style={styles.postButton} onPress={handleAddPost}>
            <Text style={styles.postButtonText}>Post</Text>
          </TouchableOpacity>
        </View>

        {imageUri && (
          <View style={styles.previewContainer}>
            <Image source={{ uri: imageUri }} style={styles.previewImage} />
            <TouchableOpacity onPress={() => setImageUri(null)} style={styles.removeButton}>
              <Text style={styles.removeText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.listContainer}>
        <FlashList
          data={Array.from(posts)}
          renderItem={({ item }) => <PostItem item={item} />}
          keyExtractor={(item) => item._id.toHexString()}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9ff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileEmoji: {
    fontSize: 22,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1a1a1a',
    flex: 1,
    textAlign: 'center',
  },
  logoutButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#ff3b30',
    borderRadius: 8,
  },
  logoutText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  inputWrapper: {
    backgroundColor: '#fff',
    padding: 12,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    elevation: 2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  imagePickerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1a1a1a',
    maxHeight: 100,
  },
  postButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
  },
  postButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  previewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingLeft: 12,
  },
  previewImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
  },
  removeButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: 8,
  },
  postCard: {
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  postImage: {
    width: '100%',
    height: 240,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: '#f0f0f0',
  },
  postText: {
    fontSize: 16,
    marginBottom: 12,
    color: '#1a1a1a',
    lineHeight: 24,
    fontWeight: '500',
  },
  postDate: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
    marginTop: 8,
  },
  actionBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    marginTop: 12,
    paddingTop: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 24,
  },
  actionText: {
    marginLeft: 6,
    color: '#555',
    fontWeight: '600',
    fontSize: 13,
  },
  commentSection: {
    marginTop: 12,
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 12,
  },
  commentRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  commentUser: {
    fontWeight: '700',
    color: '#1a1a1a',
    marginRight: 4,
  },
  commentText: {
    color: '#333',
    fontSize: 14,
    flex: 1,
  },
  commentInputRow: {
    flexDirection: 'row',
    marginTop: 12,
    alignItems: 'center',
    gap: 8,
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 16,
    paddingHorizontal: 12,
    height: 36,
    backgroundColor: '#fff',
    fontSize: 13,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});
