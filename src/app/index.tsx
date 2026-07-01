import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.logo}>🍸</Text>

        <Text style={styles.title}>Bartender Match</Text>

        <Text style={styles.subtitle}>
          Find the right bartender or the right bar.
        </Text>

        <Text style={styles.question}>I am a:</Text>

        <Pressable
          style={styles.primaryButton}
          onPress={() => router.push("/register-bartender")}
        >
          <Text style={styles.primaryButtonText}>Bartender</Text>
        </Pressable>

        <Pressable
          style={styles.secondaryButton}
          onPress={() => router.push("/register-employer")}
        >
          <Text style={styles.secondaryButtonText}>Employer / Bar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F4EF",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    padding: 28,
    alignItems: "center",
  },
  logo: {
    fontSize: 52,
    marginBottom: 12,
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    color: "#1F2933",
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 32,
  },
  question: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2933",
    marginBottom: 16,
  },
  primaryButton: {
    width: "100%",
    backgroundColor: "#1F2933",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    width: "100%",
    backgroundColor: "#EFE7DA",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#1F2933",
    fontSize: 16,
    fontWeight: "700",
  },
});
