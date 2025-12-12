import React, { useState } from 'react';
import { View, Text, StyleSheet, Button, TextInput, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Realm } from '@realm/react';
import { useRealm, useQuery, Post } from './models';
import { FlashList } from "@shopify/flash-list";
import Animated, { FadeInDown, Layout } from 'react-native-reanimated';
import NetInfo from '@react-native-community/netinfo';
import { SyncEngine } from './services/syncEngine';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy'; 

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

  // 4. Render Individual Post Item
  const renderItem = ({ item }: { item: Post }) => (
    <Animated.View 
      entering={FadeInDown.delay(100).duration(500)} 
      layout={Layout.springify()} 
      style={styles.postCard}
    >
      {/* Show Image: Prefer Local, fallback to Remote */}
      {(item.localUri || item.remoteUrl) && (
        <Image 
          source={{ uri: item.localUri || item.remoteUrl }} 
          style={styles.postImage}
          contentFit="cover"
          transition={500}
        />
      )}
      
      <Text style={styles.postText}>{item.text}</Text>
      <Text style={styles.postDate}>
        {item.timestamp.toLocaleTimeString()} • {item.isSynced ? "✅ Synced" : "⏳ Offline"}
      </Text>
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Social Feed 📸</Text>
        <Button title="Logout" onPress={() => router.replace('/login')} />
      </View>
      <View style={styles.inputWrapper}>
        <View style={styles.inputContainer}>
          <TouchableOpacity onPress={pickImage} style={styles.iconButton}>
            <Text style={{fontSize: 24}}>📷</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder="What's on your mind?"
            value={newPostText}
            onChangeText={setNewPostText}
            multiline
          />
          
          <Button title="Post" onPress={handleAddPost} />
        </View>

        {/* Small Preview if image is selected */}
        {imageUri && (
          <View style={styles.previewContainer}>
            <Image source={{ uri: imageUri }} style={styles.previewImage} />
            <TouchableOpacity onPress={() => setImageUri(null)}>
              <Text style={{color: 'red', marginLeft: 10}}>❌ Remove</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* High Performance List */}
      <View style={styles.listContainer}>
        <FlashList
          data={posts}
          renderItem={renderItem}
          estimatedItemSize={150}
          keyExtractor={(item) => item._id.toHexString()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5', paddingTop: 50 },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    paddingHorizontal: 20, 
    paddingBottom: 10,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  title: { fontSize: 22, fontWeight: '800', color: '#1a1a1a' },
  
  inputWrapper: { backgroundColor: '#fff', padding: 10, marginBottom: 10, elevation: 2 },
  inputContainer: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { marginRight: 10, padding: 5 },
  input: { 
    flex: 1, 
    backgroundColor: '#f9f9f9', 
    borderRadius: 20, 
    paddingHorizontal: 15, 
    paddingVertical: 8, 
    marginRight: 10, 
    fontSize: 16 
  },
  
  previewContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingLeft: 10 },
  previewImage: { width: 60, height: 60, borderRadius: 8 },

  listContainer: { flex: 1, paddingHorizontal: 10 },
  postCard: { 
    backgroundColor: '#fff', 
    padding: 15, 
    marginBottom: 15, 
    borderRadius: 15, 
    shadowColor: "#000", 
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, 
    shadowRadius: 4, 
    elevation: 3 
  },
  postImage: { width: '100%', height: 250, borderRadius: 10, marginBottom: 10 },
  postText: { fontSize: 16, marginBottom: 8, color: '#333', lineHeight: 22 },
  postDate: { fontSize: 12, color: '#888', fontWeight: '500' }
});