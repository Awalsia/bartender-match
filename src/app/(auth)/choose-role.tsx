import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function ChooseRoleScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Who are you?</Text>

      <Pressable
        style={styles.button}
        onPress={() => router.push("/register?role=bartender")}
      >
        <Text style={styles.buttonText}>Bartender</Text>
      </Pressable>

      <Pressable
        style={styles.buttonLight}
        onPress={() => router.push("/register?role=employer")}
      >
        <Text style={styles.buttonLightText}>Employer / Bar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#F8F7F4",
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    marginBottom: 32,
    textAlign: "center",
  },
  button: {
    backgroundColor: "#1F2933",
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  buttonText: { color: "#fff", textAlign: "center", fontWeight: "700" },
  buttonLight: { backgroundColor: "#E9D8A6", padding: 16, borderRadius: 16 },
  buttonLightText: { color: "#1F2933", textAlign: "center", fontWeight: "700" },
});
