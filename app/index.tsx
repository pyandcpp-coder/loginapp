import { Text, View } from "react-native";
import { Link } from "expo-router"; // Import the Link component

export default function Index() {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text>Click on the Login Page</Text>
      
      {/* Add this link */}
      <Link href="/login" style={{ marginTop: 20, color: 'blue', fontSize: 20 }}>
        Go to Login Page
      </Link>
      
    </View>
  );
}