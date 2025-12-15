import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { SyncEngine } from './syncEngine';
import Realm from 'realm';
import { Post, Like, Comment } from '../models';

const BACKGROUND_SYNC_TASK = 'BACKGROUND_SYNC_TASK';

// Realm config for background task
const realmConfig: Realm.Configuration = {
  schema: [Post, Like, Comment],
  schemaVersion: 5,
};

TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    const realm = await Realm.open(realmConfig);
    console.log('Background sync started');
    
    // Perform Sync
    await SyncEngine.pushChanges(realm);
    await SyncEngine.pullChanges(realm);
    await SyncEngine.pruneData(realm);
    
    realm.close();
    console.log('Background sync completed');
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error('Background sync error:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundSync() {
  return BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
    minimumInterval: 60 * 15, // 15 minutes (OS might wait longer)
    stopOnTerminate: false,   // Continue even if user kills app (Android mostly)
    startOnBoot: true,        // Restart on phone reboot (Android)
  });
}