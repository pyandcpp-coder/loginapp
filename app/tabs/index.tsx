import { Comment, Like, Post, useQuery, useRealm } from '@/src/models';
import { SyncEngine } from '@/src/services/syncEngine';
import { useAuthStore } from '@/src/store/authStore';
import NetInfo from '@react-native-community/netinfo';
import { Realm } from '@realm/react';
import { FlashList } from "@shopify/flash-list";
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Link, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const PostItem = ({ item }: { item: Post }) => {
  const realm = useRealm();
  const { user } = useAuthStore();
  const [commentText, setCommentText] = useState('');
  const [showComments, setShowComments] = useState(false);

  const likes = useQuery(Like).filtered('postId == $0 AND deletedAt == null', item._id.toHexString());
  const comments = useQuery(Comment).filtered('postId == $0 AND deletedAt == null', item._id.toHexString()).sorted('timestamp');
  
  const myLike = likes.find(l => l.userEmail === user?.email);
  const isLiked = !!myLike;

  const isVideo = item.mediaType === 'video' || 
                  item.localUri?.toLowerCase().endsWith('.mp4') || 
                  item.localUri?.toLowerCase().endsWith('.mov') ||
                  item.localUri?.toLowerCase().endsWith('.m4v') ||
                  item.remoteUrl?.toLowerCase().endsWith('.mp4') ||
                  item.remoteUrl?.toLowerCase().endsWith('.mov') ||
                  item.remoteUrl?.toLowerCase().endsWith('.m4v');

  const getSourceUri = () => {
    if (item.localUri) {
      // Check if it's already a full path
      if (item.localUri.startsWith('file://') || item.localUri.startsWith('/')) {
        return item.localUri;
      }
      // Otherwise, it's just a filename, prepend the folder
      return `${FileSystem.documentDirectory}${item.localUri}`;
    }
    return item.remoteUrl || null;
  };

  const fileUri = getSourceUri();

  const player = useVideoPlayer(isVideo && fileUri ? fileUri : null, player => {
    if (player) {
      player.loop = true;
      player.muted = true;
      player.play();
    }
  });

  const toggleLike = () => {
    realm.write(() => {
      if (myLike) {
        myLike.deletedAt = new Date();
        myLike.isSynced = false;
      } else {
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
    <Animated.View style={styles.postCard}>
      {fileUri && (
        isVideo ? (
          <View style={styles.postImage}>
            <VideoView 
              player={player} 
              style={{ width: '100%', height: '100%' }} 
              contentFit="cover"
              nativeControls={false}
            />
            <Text style={styles.videoIcon}>🎬</Text>
          </View>
        ) : (
          <Image 
            source={{ uri: fileUri }} 
            style={styles.postImage}
            contentFit="cover"
            transition={200}
          />
        )
      )}
      
      <Text style={styles.postText}>{item.text}</Text>
      
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

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [newPostText, setNewPostText] = useState('');
  const [media, setMedia] = useState<{uri: string, type: 'image'|'video'} | null>(null); 
  
  const realm = useRealm();
  const posts = useQuery(Post).sorted('timestamp', true);

  const pickMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'] as any,
      allowsEditing: true,
      quality: 0.5,
      videoMaxDuration: 60,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      const isVideo = asset.type === 'video' || 
                     asset.uri.endsWith('.mp4') || 
                     asset.uri.endsWith('.mov');
      setMedia({ uri: asset.uri, type: isVideo ? 'video' : 'image' });
    }
  };

  const handleAddPost = async () => {
    if (!newPostText && !media) return;

    let permanentUri = media?.uri;
    if (media?.uri) {
      const ext = media.type === 'video' ? 'mp4' : 'jpg';
      const filename = `${Date.now()}.${ext}`;
      const newPath = `${FileSystem.documentDirectory}${filename}`;
      
      await FileSystem.copyAsync({
        from: media.uri,
        to: newPath,
      });
      permanentUri = newPath;
    }
    
    const fileNameOnly = permanentUri?.split('/').pop();
    
    realm.write(() => {
      realm.create('Post', {
        _id: new Realm.BSON.ObjectId(),
        text: newPostText,
        timestamp: new Date(),
        localUri: fileNameOnly,
        mediaType: media?.type || 'image',
        userEmail: user?.email || 'anon',
        isSynced: false,
      });
    });

    setNewPostText('');
    setMedia(null);

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
          <TouchableOpacity onPress={pickMedia} style={styles.imagePickerButton}>
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

        {media && (
          <View style={styles.previewContainer}>
            {media.type === 'video' ? (
              <View style={[styles.previewImage, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }]}>
                <Text style={{ fontSize: 40 }}>🎬</Text>
                <Text style={{ fontSize: 10, color: '#fff', marginTop: 4 }}>Video</Text>
              </View>
            ) : (
              <Image source={{ uri: media.uri }} style={styles.previewImage} contentFit="cover" />
            )}
            
            <TouchableOpacity onPress={() => setMedia(null)} style={styles.removeButton}>
              <Text style={styles.removeText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.listContainer}>
        <FlashList
          data={realm.isClosed ? [] : Array.from(posts)}
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
  videoIcon: {
    position: 'absolute',
    top: 10,
    right: 10,
    fontSize: 20,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
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