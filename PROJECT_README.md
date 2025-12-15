# Social Feed App - Complete Documentation

A modern, offline-first social media application built with React Native, Expo, Realm, and Supabase. This app demonstrates advanced patterns including offline-first sync, real-time data synchronization, image uploads, and soft deletes.

## Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [Architecture](#architecture)
4. [Features](#features)
5. [Setup & Installation](#setup--installation)
6. [Project Structure](#project-structure)
7. [Core Components](#core-components)
8. [Data Models](#data-models)
9. [How Everything Works](#how-everything-works)
10. [Development Guide](#development-guide)

---

## Project Overview

This is a **full-stack social media application** that allows users to:
- Create and share posts with images
- Like and unlike posts
- Comment on posts
- View their profile and personal posts
- Sync data seamlessly between local and cloud storage

**Key Philosophy**: Offline-first - Users can interact with the app even without internet, and changes sync automatically when online.

---

## Tech Stack

### Frontend (Mobile App)

| Technology | Purpose | Version |
|-----------|---------|---------|
| **React Native** | Cross-platform mobile UI framework | Latest |
| **Expo** | React Native development platform & build system | Latest |
| **TypeScript** | Type-safe JavaScript for the app | Latest |
| **Expo Router** | File-based routing (like Next.js) | Latest |
| **React Native Reanimated** | High-performance animations | Latest |
| **FlashList** | High-performance list component (faster than FlatList) | Latest |
| **Expo Image** | Optimized image component with caching | Latest |
| **expo-image-picker** | Native image selection from device | Latest |
| **expo-file-system** | File system access for storing images locally | Latest |
| **react-native-community/netinfo** | Network connectivity detection | Latest |
| **base64-arraybuffer** | Convert base64 to ArrayBuffer for uploads | Latest |

### Backend & Data

| Technology | Purpose | Details |
|-----------|---------|---------|
| **Supabase** | Backend-as-a-Service (PostgreSQL + Auth) | Cloud database & storage |
| **Realm** | Local offline-first database | Mobile-optimized, encrypted local storage |
| **expo-secure-store** | Secure credential storage | Stores auth tokens & encryption keys |

### State Management

| Technology | Purpose |
|-----------|---------|
| **Zustand** | Lightweight state management for auth state |

### Development Tools

| Tool | Purpose |
|-----|---------|
| **ESLint** | Code quality & style checking |
| **TypeScript** | Static type checking |

---

## Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    React Native App                      │
│  ┌──────────────────────────────────────────────────┐   │
│  │         UI Layer (Home, Profile, Login)          │   │
│  └────────────────┬─────────────────────────────────┘   │
│                   │                                       │
│  ┌────────────────▼─────────────────────────────────┐   │
│  │      State Management (Zustand + Realm)          │   │
│  │  ┌────────────────────────────────────────────┐  │   │
│  │  │  Auth Store (Email, Session)               │  │   │
│  │  │  Realm DB (Posts, Likes, Comments)         │  │   │
│  │  └────────────────────────────────────────────┘  │   │
│  └────────────────┬─────────────────────────────────┘   │
│                   │                                       │
│  ┌────────────────▼─────────────────────────────────┐   │
│  │         Sync Engine (pushChanges/pullChanges)    │   │
│  │  • Detects network status                         │   │
│  │  • Uploads images to Supabase Storage             │   │
│  │  • Syncs data bidirectionally                     │   │
│  │  • Handles soft deletes (isDeleted flag)          │   │
│  └────────────────┬─────────────────────────────────┘   │
│                   │                                       │
└───────────────────┼───────────────────────────────────────┘
                    │
        ┌───────────┴────────────┬──────────────────┐
        │                        │                  │
   ┌────▼─────┐      ┌──────────▼──────┐    ┌──────▼────────┐
   │ Supabase │      │  Supabase        │    │  Supabase     │
   │ PostgreSQL       │  Storage         │    │  Auth         │
   │ (posts,likes,    │  (images)        │    │  (sessions)   │
   │  comments)       └──────────────────┘    └───────────────┘
   └──────────┘
```

### Data Flow

1. **User Creates Post** → Stored in Realm (local) immediately
2. **Online Detection** → Sync Engine triggers automatically
3. **Image Upload** → Converts to base64 → Uploads to Supabase Storage
4. **Data Sync** → Post metadata synced to Supabase PostgreSQL
5. **Pull Changes** → Fetches new posts/likes/comments from server
6. **Display Update** → Realm live queries automatically re-render UI

---

## Features

### ✅ Implemented Features

#### 1. **Authentication**
- Email-based login/logout
- Secure token storage with `expo-secure-store`
- Session persistence across app restarts

#### 2. **Posts Management**
- Create posts with optional images
- Images stored locally and uploaded to cloud
- Track ownership via `userEmail`
- Real-time sync status indicator (✅ Synced / ⏳ Offline)

#### 3. **Likes System**
- Toggle like/unlike on posts
- Soft delete implementation (doesn't remove from DB, marks as `isDeleted: true`)
- Only shows active likes (filtered by `isDeleted == false`)
- Can resurrect deleted likes instead of creating duplicates

#### 4. **Comments**
- Add comments to posts
- Display comments with usernames
- Auto-expand/collapse comments section
- Sync comments to server

#### 5. **Profile Screen**
- View user email & avatar
- Display user's own posts only
- Show post count
- Quick access from home screen

#### 6. **Offline-First Sync**
- Works without internet
- Detects network connectivity
- Auto-syncs when online
- Handles conflicts (duplicate key errors)

---

## Setup & Installation

### Prerequisites

```bash
- Node.js 16+ (recommend 18+)
- npm or yarn
- Xcode (for iOS) / Android Studio (for Android)
- Supabase account (free tier available)
- Expo CLI: npm install -g expo-cli
```

### Installation Steps

```bash
# 1. Clone the repository
git clone <repo-url>
cd my-app

# 2. Install dependencies
yarn install
# or
npm install

# 3. Configure Supabase (IMPORTANT!)
# Add your credentials to: app/services/supabaseClient.ts
# You need:
# - SUPABASE_URL: Your project URL
# - SUPABASE_ANON_KEY: Your anonymous public key

# 4. Start the development server
yarn start
# or
npm start

# 5. Select platform
# i - iOS simulator
# a - Android emulator
# w - Web (limited support for native features)
```

### Environment Configuration

Create a `.env.local` file in the root:

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

Or add directly to `app/services/supabaseClient.ts`:

```typescript
export const supabase = createClient(
  'YOUR_SUPABASE_URL',
  'YOUR_SUPABASE_ANON_KEY'
);
```

### Supabase Setup

Create these tables in your Supabase database:

#### Posts Table
```sql
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  image_url TEXT,
  user_email TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### Likes Table
```sql
CREATE TABLE likes (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id),
  user_email TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### Comments Table
```sql
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id),
  user_email TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL
);
```

#### Storage Bucket
```
Create a storage bucket named: media
Enable public access for images
```

---

## Project Structure

```
my-app/
├── app/
│   ├── _layout.tsx              # Root layout with RealmProvider & routing
│   ├── index.tsx                # Splash/initial screen
│   ├── login.tsx                # Login screen
│   ├── home.tsx                 # Main feed screen (PostItem component)
│   ├── profile.tsx              # User profile screen
│   ├── database.ts              # (Legacy/unused)
│   │
│   ├── models/
│   │   └── index.ts             # Realm schemas (Post, Like, Comment)
│   │
│   ├── services/
│   │   ├── supabaseClient.ts    # Supabase client initialization
│   │   └── syncEngine.ts        # Core sync logic (push/pull)
│   │
│   └── store/
│       └── authStore.ts         # Zustand auth state management
│
├── assets/
│   └── images/                  # App icons & splash screen
│
├── ios/                         # iOS native code (Xcode project)
├── android/                     # Android native code (Gradle)
│
├── package.json                 # Dependencies & scripts
├── tsconfig.json               # TypeScript configuration
├── app.json                    # Expo configuration
├── eslint.config.js            # Linting rules
└── PROJECT_README.md           # This file
```

---

## Core Components

### 1. **Home Screen** (`home.tsx`)

**Purpose**: Main feed where users create posts and interact with content

**Key Components**:
- **Header**: Profile button + Title + Logout button
- **Post Input**: Image picker + Text input + Post button
- **FlashList**: High-performance post list
- **PostItem**: Individual post component (sub-component)

**PostItem Features**:
- Displays post text and image
- Like toggle with count
- Comments section (expandable)
- Sync status indicator

```typescript
// Example: PostItem renders a single post
<PostItem item={post} />
// Shows likes/comments live-updated from Realm
```

### 2. **Profile Screen** (`profile.tsx`)

**Purpose**: Display user's posts and profile information

**Features**:
- User avatar (first letter of email)
- Email display
- Post count
- List of user's posts (filtered by userEmail)

### 3. **Login Screen** (`login.tsx`)

**Purpose**: User authentication

**Features**:
- Email input
- Session persistence
- Redirect to home on successful login

### 4. **Root Layout** (`_layout.tsx`)

**Purpose**: App initialization and network monitoring

**Key Responsibilities**:
- Initialize Realm database
- Check existing session on app start
- Monitor network connectivity
- Trigger sync when online
- Navigate based on auth state

```typescript
// Network listener triggers sync automatically
NetInfo.addEventListener(state => {
  if (state.isConnected) {
    SyncEngine.pushChanges(realm);
    SyncEngine.pullChanges(realm);
  }
});
```

---

## Data Models

### Post Model

```typescript
class Post extends Realm.Object<Post> {
  _id: ObjectId           // Primary key (unique ID)
  text: string            // Post content
  timestamp: Date         // Created time
  isSynced: boolean       // Sync status (default: false)
  localUri?: string       // Local image path (optional)
  remoteUrl?: string      // Cloud image URL (optional)
  userEmail: string       // Post owner email (default: 'anon')
}
```

**Indexes**: `_id` (primary), implicit index on `timestamp` for sorting

### Like Model

```typescript
class Like extends Realm.Object<Like> {
  _id: ObjectId           // Primary key
  postId: string          // Reference to post ID
  userEmail: string       // Who liked it
  isSynced: boolean       // Sync status
  isDeleted: boolean      // Soft delete flag (default: false)
}
```

**Query Example**: 
```typescript
// Get active likes for a post
const likes = useQuery(Like).filtered(
  'postId == $0 AND isDeleted == false', 
  postId
);
```

### Comment Model

```typescript
class Comment extends Realm.Object<Comment> {
  _id: ObjectId           // Primary key
  postId: string          // Reference to post
  userEmail: string       // Comment author
  text: string            // Comment content
  timestamp: Date         // Posted time
  isSynced: boolean       // Sync status
  isDeleted: boolean      // Soft delete flag (default: false)
}
```

---

## How Everything Works

### 1. **Authentication Flow**

```
User Opens App
    ↓
checkSession() runs
    ↓
[Session exists?] → YES → Load user from SecureStore → Go to Home
    ↓ NO
Go to Login Screen
    ↓
User enters email & taps Login
    ↓
Save email to SecureStore
    ↓
Set isAuthenticated = true
    ↓
Navigate to Home
```

**Code Location**: `app/store/authStore.ts`

### 2. **Creating a Post**

```
User taps "Post" button
    ↓
handleAddPost() executes:
  1. Copy image to permanent location (if selected)
  2. Create Post in Realm with:
     - _id: new ObjectId()
     - text: user input
     - timestamp: now
     - localUri: image path
     - isSynced: false
  3. Check network status
  4. If online → Trigger SyncEngine.pushChanges()
    ↓
Post appears immediately in feed (live query)
    ↓
[When syncing] Image uploaded to Supabase Storage
    ↓
Post metadata sent to Supabase PostgreSQL
    ↓
Mark isSynced = true
```

**Code Location**: `app/home.tsx` → `handleAddPost()`

### 3. **Sync Engine - Push (Upload)**

**Purpose**: Send local changes to server

```typescript
// What gets pushed:
const unsyncedPosts = realm.objects('Post').filtered('isSynced == false');
const unsyncedLikes = realm.objects('Like').filtered('isSynced == false');
const unsyncedComments = realm.objects('Comment').filtered('isSynced == false');

// Process Posts:
for (const post of unsyncedPosts) {
  // If has image:
  1. Read image file as base64
  2. Upload to Supabase Storage
  3. Get public URL
  4. Update post.remoteUrl
  
  // Insert post metadata:
  2. Insert into posts table with:
     - id, text, image_url, user_email, timestamp
  
  // Mark as synced:
  3. Set post.isSynced = true
}

// Process Likes:
for (const like of unsyncedLikes) {
  if (like.isDeleted) {
    // DELETE from server
    DELETE FROM likes WHERE id = like._id
    // Then delete from Realm
    realm.delete(like)
  } else {
    // INSERT to server
    INSERT INTO likes VALUES (...)
    // Mark as synced
    like.isSynced = true
  }
}

// Similar for comments...
```

**Code Location**: `app/services/syncEngine.ts` → `pushChanges()`

### 4. **Sync Engine - Pull (Download)**

**Purpose**: Fetch updates from server

```typescript
// Pull all posts from last 50 (limit)
const posts = await supabase.from('posts').select('*').limit(50);

// For each post:
for (const serverPost of posts) {
  // Check if we already have it locally
  const exists = realm.objectForPrimaryKey('Post', id);
  
  if (!exists) {
    // Create locally
    realm.create('Post', {
      _id: serverPost.id,
      text: serverPost.text,
      timestamp: new Date(serverPost.timestamp),
      remoteUrl: serverPost.image_url,
      userEmail: serverPost.user_email,
      isSynced: true  // Already synced (from server)
    });
  }
}

// Similar for likes and comments...
```

**Code Location**: `app/services/syncEngine.ts` → `pullChanges()`

### 5. **Like Toggle with Soft Delete**

```
User taps Like Heart
    ↓
[Already liked?]
    ↓ YES (myLike exists)
    └→ Mark myLike.isDeleted = true
       Set myLike.isSynced = false
       (NOT deleted from DB, just flagged)
    
    ↓ NO (myLike doesn't exist)
    └→ Check if deleted like exists:
       [Found resurrect-able like?]
       ├→ YES: Set isDeleted = false, isSynced = false
       └→ NO: Create new Like object
    
    ↓
Trigger SyncEngine.pushChanges()
    ↓
[During sync] If isDeleted == true:
  DELETE FROM likes WHERE id = ...
  realm.delete(like)  // Now actually remove it
    
    ↓
Like count updates (live query filtered by isDeleted == false)
```

**Code Location**: `app/home.tsx` → `PostItem` → `toggleLike()`

### 6. **Real-Time UI Updates via Live Queries**

```typescript
// This is "reactive" - updates UI whenever data changes
const likes = useQuery(Like).filtered('postId == $0 AND isDeleted == false', postId);

// When Realm data changes (via sync):
// 1. Query result updates automatically
// 2. Component re-renders
// 3. UI shows new like count without calling setState()

// Works for:
// - Creating posts
// - Liking/unliking
// - Commenting
// - Syncing (local → server → local display)
```

**React Native Reanimated Animation Flow**:
```typescript
<Animated.View 
  entering={FadeInDown.delay(100).duration(500)}  // Slide in animation
  layout={Layout.springify()}                       // Spring animation on reorder
  style={styles.postCard}
>
  {/* Post content */}
</Animated.View>
```

### 7. **Network Detection & Auto-Sync**

```typescript
// In _layout.tsx
NetInfo.addEventListener(state => {
  if (state.isConnected) {
    console.log("Online! Starting Sync...");
    
    // Push local changes
    SyncEngine.pushChanges(realm);
    
    // Pull remote changes
    SyncEngine.pullChanges(realm);
  } else {
    console.log("Offline mode active.");
    // App continues to work locally
  }
});
```

---

## Development Guide

### Adding a New Feature

#### Example: Add Delete Post Feature

1. **Update Model** (`models/index.ts`):
```typescript
export class Post extends Realm.Object<Post> {
  // ... existing properties
  isDeleted?: boolean;  // Add this

  static schema: Realm.ObjectSchema = {
    // ... existing properties
    isDeleted: { type: 'bool', default: false },
  };
}
```

2. **Update Schema Version**:
```typescript
schemaVersion: 6,  // Increment from 5
onMigration: (oldRealm, newRealm) => {
  console.log('Migration: Added isDeleted to Post');
}
```

3. **Add UI Button** (`home.tsx`):
```typescript
<TouchableOpacity onPress={() => deletePost(item._id)}>
  <Text>🗑️</Text>
</TouchableOpacity>
```

4. **Implement Deletion Logic**:
```typescript
const deletePost = () => {
  realm.write(() => {
    post.isDeleted = true;
    post.isSynced = false;
  });
  SyncEngine.pushChanges(realm);
};
```

5. **Update Sync Engine** (`syncEngine.ts`):
```typescript
// In pushChanges, add handling for deleted posts
const deletedPosts = realm.objects('Post').filtered('isDeleted == true');
for (const post of deletedPosts) {
  await supabase.from('posts').delete().match({ id: post._id });
  realm.delete(post);  // Actually remove
}
```

6. **Update Pull Logic**:
```typescript
// Only pull non-deleted posts
const posts = await supabase
  .from('posts')
  .select('*')
  .eq('is_deleted', false);
```

### Debugging Tips

#### Check Local Realm Data
```typescript
// Add to any component to inspect local DB
const realm = useRealm();
const allPosts = useQuery(Post);
console.log('Local posts:', Array.from(allPosts));
```

#### Monitor Sync
```typescript
// syncEngine.ts already logs:
console.log(`Pushing ${unsyncedPosts.length} posts...`);
console.log(`Pulling data from cloud...`);
```

#### Check Network
```typescript
const state = await NetInfo.fetch();
console.log('Connected:', state.isConnected);
console.log('Type:', state.type); // wifi, cellular, etc
```

#### View Realm Schema Version
```typescript
// In models/index.ts
console.log('Schema version:', 5);
```

### Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Migration error | Schema changed but version not incremented | Increment `schemaVersion` in models/index.ts |
| Images not uploading | File path invalid | Check `FileSystem.documentDirectory` exists |
| Likes not syncing | Network disconnected | Check NetInfo, verify internet connection |
| Duplicate posts | Pull not checking for existing records | Ensure `objectForPrimaryKey` check in pullChanges |
| UI not updating | Live query not reactive | Use `useQuery()` hook, not `realm.objects()` directly |

---

## Performance Optimizations

### 1. **Image Compression**
```typescript
// In home.tsx
quality: 0.5,  // 50% JPEG quality
// Reduces upload size & time
```

### 2. **FlashList instead of FlatList**
```typescript
// FlashList is 10x faster for large lists
<FlashList
  data={posts}
  renderItem={({item}) => <PostItem item={item} />}
/>
```

### 3. **Filtered Live Queries**
```typescript
// Only fetch likes that aren't deleted
const likes = useQuery(Like).filtered(
  'postId == $0 AND isDeleted == false',
  postId
);
// Realm handles filtering efficiently
```

### 4. **Batch Sync Operations**
```typescript
// Loop through unsyncedPosts once (not N times)
for (const post of unsyncedPosts) {
  // Process & sync all together
}
```

---

## Security Considerations

### ✅ Implemented

- **Secure Token Storage**: Uses `expo-secure-store` (encrypted)
- **Soft Deletes**: Data not permanently lost immediately
- **User Email Validation**: Tracks post ownership
- **HTTPS**: Supabase uses TLS encryption

### ⚠️ Future Improvements

- Add JWT token-based auth (currently email-only)
- Implement row-level security (RLS) policies in Supabase
- Add rate limiting for API calls
- Encrypt sensitive data at rest

---

## Deployment

### Build for Production

```bash
# iOS
eas build --platform ios --auto-submit

# Android
eas build --platform android

# Web
eas build --platform web
```

### Submit to App Stores

```bash
# App Store (iOS)
eas submit --platform ios

# Google Play (Android)
eas submit --platform android
```

---

## Testing Checklist

- [ ] Create post locally (offline)
- [ ] Go online → image uploads
- [ ] Like/unlike a post
- [ ] Add comment
- [ ] Visit profile → see personal posts only
- [ ] Logout → login as different user
- [ ] Pull new posts from server
- [ ] Verify sync status indicators
- [ ] Test network toggle (airplane mode)

---

## Resources & Links

- **React Native Docs**: https://reactnative.dev/
- **Expo Documentation**: https://docs.expo.dev/
- **Realm React**: https://www.mongodb.com/docs/realm/sdk/react-native/
- **Supabase Docs**: https://supabase.com/docs
- **Zustand**: https://github.com/pmndrs/zustand
- **React Native Reanimated**: https://docs.swmansion.com/react-native-reanimated/

---

## License

MIT License - See LICENSE file

---

## Support

For issues or questions:
1. Check the **Debugging Tips** section above
2. Review error logs in Expo dev console
3. Check Supabase logs for backend errors
4. Verify Realm schema versions match

---

**Last Updated**: December 2025
**App Version**: 1.0.0
**Schema Version**: 5
