import { supabase } from "@/lib/supabase";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function EmployerHomeScreen() {
  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/(auth)/login");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Employer Home</Text>

      <Text style={styles.subtitle}>
        Welcome! Here you will create your bar profile and find bartenders.
      </Text>

      <Pressable style={styles.button} onPress={handleLogout}>
        <Text style={styles.buttonText}>Logout</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F7F4",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 12,
    color: "#1F2933",
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 32,
    color: "#555",
  },
  button: {
    backgroundColor: "#1F2933",
    padding: 16,
    borderRadius: 16,
  },
  buttonText: {
    color: "#FFFFFF",
    textAlign: "center",
    fontWeight: "700",
  },
});
