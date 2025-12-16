import { Comment, Like, Post, useQuery, useRealm } from '@/src/models';
import { SyncEngine } from '@/src/services/syncEngine';
import { useAuthStore } from '@/src/store/authStore';
import { Ionicons } from '@expo/vector-icons';
import { Realm } from '@realm/react';
import { FlashList, ViewToken } from "@shopify/flash-list";
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import React, { useCallback, useRef, useState } from 'react';
import {
  Dimensions,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

const { width, height: WINDOW_HEIGHT } = Dimensions.get('window');
// Calculate height to fit strictly within tab bar constraints if needed, 
// or use WINDOW_HEIGHT for full immersive feel.
const SCREEN_HEIGHT = Platform.OS === 'ios' ? WINDOW_HEIGHT - 80 : WINDOW_HEIGHT - 50;

// --- 1. HEADER COMPONENT ---
const FeedHeader = () => (
  <View style={styles.headerContainer}>
    <Text style={styles.headerTitle}>Reels</Text>
    <TouchableOpacity>
      <Ionicons name="camera-outline" size={28} color="white" />
    </TouchableOpacity>
  </View>
);

// --- 2. SIDEBAR COMPONENT (Likes, Comments, etc) ---
const FeedSideBar = ({ item }: { item: Post }) => {
  const realm = useRealm();
  const { user } = useAuthStore();
  const likes = useQuery(Like).filtered('postId == $0 AND deletedAt == null', item._id.toHexString());
  const comments = useQuery(Comment).filtered('postId == $0 AND deletedAt == null', item._id.toHexString());
  
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

  return (
    <View style={styles.sidebarContainer}>
      <TouchableOpacity style={styles.iconWrapper} onPress={toggleLike}>
        <Ionicons name={isLiked ? "heart" : "heart-outline"} size={30} color={isLiked ? "#ff3b30" : "white"} />
        <Text style={styles.iconText}>{likes.length}</Text>
      </TouchableOpacity>
      
      <View style={styles.iconWrapper}>
        <Ionicons name="chatbubble-outline" size={28} color="white" />
        <Text style={styles.iconText}>{comments.length}</Text>
      </View>

      <View style={styles.iconWrapper}>
        <Ionicons name="paper-plane-outline" size={28} color="white" />
        <Text style={styles.iconText}>Share</Text>
      </View>

      <TouchableOpacity style={styles.menuButton}>
        <Ionicons name="ellipsis-horizontal" size={24} color="white" />
      </TouchableOpacity>

      <View style={styles.rotatingDisc}>
        <Image 
          source={{ uri: item.thumbnailUrl || 'https://via.placeholder.com/50' }} 
          style={styles.discImage} 
        />
      </View>
    </View>
  );
};

// --- 3. FOOTER COMPONENT (User Info, Description) ---
const FeedFooter = ({ item }: { item: Post }) => {
  return (
    <View style={styles.footerContainer}>
      <View style={styles.userRow}>
        <Image 
          source={{ uri: 'https://via.placeholder.com/40' }} // Placeholder for user avatar
          style={styles.userAvatar} 
        />
        <Text style={styles.userName}>@{item.userEmail.split('@')[0]}</Text>
        
        <TouchableOpacity style={styles.followButton}>
          <Text style={styles.followText}>Follow</Text>
        </TouchableOpacity>
      </View>

      <Text numberOfLines={2} style={styles.description}>
        {item.text}
      </Text>

      <View style={styles.audioRow}>
        <Ionicons name="musical-notes" size={14} color="white" />
        <Text style={styles.audioText}>Original Audio - {item.userEmail.split('@')[0]}</Text>
      </View>
    </View>
  );
};

// --- 4. VIDEO COMPONENT (The Core Logic) ---
const VideoComponent = React.memo(({ item, isVisible }: { item: Post, isVisible: boolean }) => {
  // 1. BUILD PATH
  // Remember Lesson 1? Re-build the path if it's local!
  const sourceUri = item.localUri 
    ? `${FileSystem.documentDirectory}${item.localUri}` 
    : item.remoteUrl;

  // 2. NEW PLAYER HOOK
  const player = useVideoPlayer(sourceUri || '', (player) => {
    player.loop = true;
  });

  // 3. CONTROL PLAYBACK BASED ON VISIBILITY
  React.useEffect(() => {
    if (isVisible) {
      player.play();
    } else {
      player.pause();
    }
  }, [isVisible, player]);

  return (
    <View style={[styles.videoContainer, { height: SCREEN_HEIGHT }]}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="cover"
        nativeControls={false}
      />
      
      {/* Gradient Overlay for better text visibility */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.9)']}
        style={styles.gradient}
      />
    </View>
  );
}, (prev, next) => prev.isVisible === next.isVisible && prev.item._id.equals(next.item._id));


// --- 5. MAIN FEED ROW ---
const FeedRow = React.memo(({ item, index, visibleIndex }: { item: Post, index: number, visibleIndex: number | null }) => {
  const isVisible = visibleIndex === index;

  return (
    <View style={{ height: SCREEN_HEIGHT, width: width, backgroundColor: 'black' }}>
      <VideoComponent item={item} isVisible={isVisible} />
      <FeedHeader /> 
      <FeedSideBar item={item} />
      <FeedFooter item={item} />
    </View>
  );
});

// --- MAIN SCREEN ---
export default function ReelsScreen() {
  const reels = useQuery(Post).filtered("mediaType == 'video'").sorted('timestamp', true);
  const [currentInfo, setCurrentInfo] = useState<number | null>(0);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken<Post>[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index !== null) {
      setCurrentInfo(viewableItems[0].index);
    }
  }, []);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 80 
  }).current;

  // Stop everything when leaving the tab
  useFocusEffect(
    useCallback(() => {
      // Screen focused
      return () => setCurrentInfo(null); // Screen unfocused -> pause all
    }, [])
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <FlashList
        data={Array.from(reels)}
        renderItem={({ item, index }) => (
          <FeedRow item={item} index={index} visibleIndex={currentInfo} />
        )}
        pagingEnabled
        decelerationRate="fast"
        keyExtractor={(item) => item._id.toHexString()}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        showsVerticalScrollIndicator={false}
        drawDistance={WINDOW_HEIGHT} // Load minimal items offscreen
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  videoContainer: {
    width: width,
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 0,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 300, 
    zIndex: 1,
  },
  // Header
  headerContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  headerTitle: {
    color: 'white',
    fontSize: 22,
    fontWeight: '700',
  },
  // Sidebar
  sidebarContainer: {
    position: 'absolute',
    bottom: 40,
    right: 10,
    alignItems: 'center',
    zIndex: 10,
    gap: 20,
  },
  iconWrapper: {
    alignItems: 'center',
    gap: 5,
  },
  iconText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
  },
  menuButton: {
    marginTop: 10,
  },
  rotatingDisc: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    overflow: 'hidden',
  },
  discImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  // Footer
  footerContainer: {
    position: 'absolute',
    bottom: 20,
    left: 15,
    width: width * 0.75, // Leave room for sidebar
    zIndex: 10,
    paddingBottom: 20,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'white',
    marginRight: 10,
  },
  userName: {
    color: 'white',
    fontWeight: '700',
    fontSize: 16,
    marginRight: 10,
  },
  followButton: {
    borderWidth: 1,
    borderColor: 'white',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  followText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  description: {
    color: 'white',
    fontSize: 14,
    marginBottom: 10,
    lineHeight: 20,
  },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  audioText: {
    color: 'white',
    fontSize: 13,
  },
});