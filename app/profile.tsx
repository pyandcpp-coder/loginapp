import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useRealm, useQuery, Post } from './models';
import { useAuthStore } from './store/authStore';
import { FlashList } from "@shopify/flash-list";
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const router = useRouter();
  
  // 1. Filter Posts by Current User Email
  const myPosts = useQuery(Post)
    .filtered('userEmail == $0', user?.email)
    .sorted('timestamp', true);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View entering={FadeInDown.duration(500)} style={styles.header}>
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.email?.[0].toUpperCase()}</Text>
          </View>
          <Text style={styles.email}>{user?.email}</Text>
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{myPosts.length}</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </Animated.View>

      <View style={styles.divider} />

      {myPosts.length > 0 ? (
        <View style={styles.listContainer}>
          <Text style={styles.postsTitle}>Your Posts</Text>
          <FlashList
            data={Array.from(myPosts)}
            keyExtractor={(item) => item._id.toHexString()}
            renderItem={({ item }) => (
              <Animated.View entering={FadeInDown.delay(100)} style={styles.postItem}>
                {/* Show image if exists */}
                {(item.localUri || item.remoteUrl) && (
                  <Image source={{ uri: item.localUri || item.remoteUrl }} style={styles.thumbnail} />
                )}
                <View style={styles.postContent}>
                  <Text style={styles.postText} numberOfLines={2}>{item.text}</Text>
                  <Text style={styles.date}>{item.timestamp.toLocaleDateString()}</Text>
                  <View style={styles.syncBadge}>
                    <Text style={styles.syncText}>{item.isSynced ? '✅ Synced' : '⏳ Pending'}</Text>
                  </View>
                </View>
              </Animated.View>
            )}
          />
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📝</Text>
          <Text style={styles.emptyTitle}>No Posts Yet</Text>
          <Text style={styles.emptyDescription}>Start sharing your thoughts and moments!</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9ff',
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 48,
    color: '#fff',
    fontWeight: '800',
  },
  email: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: '#007AFF',
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
    marginTop: 4,
  },
  logoutButton: {
    backgroundColor: '#ff3b30',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    width: '100%',
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: 12,
  },
  postsTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1a1a1a',
    marginTop: 20,
    marginBottom: 12,
    marginLeft: 8,
  },
  postItem: {
    flexDirection: 'row',
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  thumbnail: {
    width: 70,
    height: 70,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#f0f0f0',
  },
  postContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  postText: {
    fontSize: 15,
    marginBottom: 4,
    color: '#1a1a1a',
    fontWeight: '600',
  },
  date: {
    fontSize: 12,
    color: '#999',
    marginBottom: 6,
  },
  syncBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
  },
  syncText: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 60,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});