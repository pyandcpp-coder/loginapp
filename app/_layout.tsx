import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { useAuthStore } from "./store/authStore";
import { RealmProvider, useRealm } from "./models"; 
import { SyncEngine } from "./services/syncEngine"; 
import NetInfo from '@react-native-community/netinfo'; 

function AppLogic() {
  const { isAuthenticated, checkSession, isLoading } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();
  const realm = useRealm(); 
  const [isNavigationReady, setIsNavigationReady] = useState(false);

  useEffect(() => {
    checkSession();
  }, []);

  // Wait for navigation to be ready
  useEffect(() => {
    if (segments) {
      setIsNavigationReady(true);
    }
  }, [segments]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && isNavigationReady) {
      // Small delay to ensure router is mounted
      setTimeout(() => {
        router.replace('/tabs');
      }, 100);
    }
  }, [isAuthenticated, isLoading, isNavigationReady]);

  useEffect(() => {
    if (!isAuthenticated || !realm || realm.isClosed) return;
    
    const unsubscribe = NetInfo.addEventListener(state => {
      // Check if realm is still valid before accessing
      if (!realm || realm.isClosed) return;
      
      if (state.isConnected) {
        console.log(" Online! Starting Sync...");
        SyncEngine.pushChanges(realm).catch(err => {
          console.error("Push sync failed:", err);
        });
        SyncEngine.pullChanges(realm).catch(err => {
          console.error("Pull sync failed:", err);
        });
      } else {
        console.log("Hz Offline mode active.");
      }
    });

    return () => unsubscribe();
  }, [isAuthenticated, realm]);

  return <Stack />;
}

export default function RootLayout() {
  return (
    <RealmProvider> 
      <AppLogic /> 
    </RealmProvider>
  );
}