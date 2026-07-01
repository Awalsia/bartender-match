import { StyleSheet, Text, View } from "react-native";

export default function RegisterBartenderScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bartender Registration</Text>
      <Text style={styles.subtitle}>
        Here you will create your bartender profile.
      </Text>
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
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#1F2933",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 12,
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
  },
});
