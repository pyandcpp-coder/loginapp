import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { initDB, registerUser, loginUser } from './database';

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();

  useEffect(() => {
    initDB()
      .then(() => console.log("Database initialized"))
      .catch(err => console.log("DB Error:", err));
  }, []);

  const handleLogin = async () => {
    if (!email || !password) return Alert.alert("Error", "Please enter fields");

    try {
      const user = await loginUser(email, password);
      console.log("Login Success:", user);
      Alert.alert("Success", "Login successful!");
      router.replace('/home');
    } catch (error) {
      console.log(error);
      Alert.alert("Login Failed", "Invalid email or password (did you create an account?)");
    }
  };

  const handleRegister = async () => {
    if (!email || !password) return Alert.alert("Error", "Please enter fields");

    try {
      // Add user to DB
      await registerUser(email, password);
      Alert.alert("Success", "Account created! You can now login.");
    } catch (error) {
      // SQLite error 19 means "Constraint failed" (duplicate email)
      Alert.alert("Error", "That email might already be taken.");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>System Login</Text>

      <TextInput
        style={styles.input}
        placeholder="Enter your email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <TextInput
        style={styles.input}
        placeholder="Enter your password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry={true}
      />


      <TouchableOpacity style={styles.button} onPress={handleLogin}>
        <Text style={styles.buttonText}>Login</Text>
      </TouchableOpacity>


      <TouchableOpacity 
        style={[styles.button, { backgroundColor: '#28a745', marginTop: 10 }]} 
        onPress={handleRegister}
      >
        <Text style={styles.buttonText}>Create Account</Text>
      </TouchableOpacity>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 30, color: '#333' },
  input: {
    width: '100%', height: 50, backgroundColor: '#fff',
    borderRadius: 8, paddingHorizontal: 15, marginBottom: 15,
    borderWidth: 1, borderColor: '#ddd',
  },
  button: {
    width: '100%', height: 50, backgroundColor: '#007AFF',
    justifyContent: 'center', alignItems: 'center', borderRadius: 8,
  },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});

export default LoginScreen;