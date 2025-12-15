import { Tabs } from 'expo-router';
import { Text } from 'react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { 
          backgroundColor: 'black', 
          borderTopColor: '#333',
          height: 60,
          paddingBottom: 10
        },
        tabBarActiveTintColor: 'white',
        tabBarInactiveTintColor: '#888',
      }}
    >
      <Tabs.Screen 
        name="index" 
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Text style={{color, fontSize: 20}}>🏠</Text>,
        }} 
      />
      <Tabs.Screen 
        name="reels" 
        options={{
          title: 'Reels',
          tabBarIcon: ({ color }) => <Text style={{color, fontSize: 20}}>🎬</Text>,
        }} 
      />
    </Tabs>
  );
}