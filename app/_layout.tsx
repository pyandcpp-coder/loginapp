import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import { useAuthStore } from "./store/authStore";
import { RealmProvider, useRealm } from "./models"; 
import { SyncEngine } from "./services/syncEngine"; 
import NetInfo from '@react-native-community/netinfo'; 
function AppLogic() {
  const { isAuthenticated, checkSession, isLoading } = useAuthStore();
  const router = useRouter();
  const realm = useRealm(); 

  useEffect(() => {
    checkSession();
  }, []);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/home');
    }
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected) {
        console.log(" Online! Starting Sync...");
        SyncEngine.pushChanges(realm);
        SyncEngine.pullChanges(realm);
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