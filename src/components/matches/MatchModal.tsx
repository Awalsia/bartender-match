import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  visible: boolean;
  matchedName: string;
  matchedPhotoUrl: string | null;
  onKeepBrowsing: () => void;
  onViewMatches: () => void;
};

export default function MatchModal({
  visible,
  matchedName,
  matchedPhotoUrl,
  onKeepBrowsing,
  onViewMatches,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onKeepBrowsing}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.celebration}>🎉</Text>

          <Text style={styles.title}>It&apos;s a match!</Text>

          <Text style={styles.subtitle}>
            You and {matchedName} liked each other.
          </Text>

          <View style={styles.profilesRow}>
            <View style={styles.profileCircle}>
              <Text style={styles.youText}>You</Text>
            </View>

            <View style={styles.heartContainer}>
              <Text style={styles.heart}>♥</Text>
            </View>

            {matchedPhotoUrl ? (
              <Image
                source={{ uri: matchedPhotoUrl }}
                style={styles.profileImage}
              />
            ) : (
              <View style={styles.profileCircle}>
                <Text style={styles.placeholderIcon}>👤</Text>
              </View>
            )}
          </View>

          <Text style={styles.matchedName}>{matchedName}</Text>

          <Text style={styles.description}>
            You can now find this connection in your matches.
          </Text>

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={onViewMatches}
          >
            <Text style={styles.primaryButtonText}>View matches</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={onKeepBrowsing}
          >
            <Text style={styles.secondaryButtonText}>Keep browsing</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.62)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFFFFF",
    borderRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 22,
    alignItems: "center",
  },
  celebration: {
    fontSize: 42,
  },
  title: {
    marginTop: 8,
    fontSize: 34,
    fontWeight: "900",
    color: "#2C2C2C",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 10,
    fontSize: 17,
    lineHeight: 24,
    color: "#666666",
    textAlign: "center",
  },
  profilesRow: {
    marginTop: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  profileCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#F1EDE7",
    borderWidth: 4,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  profileImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#E5E0D8",
    borderWidth: 4,
    borderColor: "#FFFFFF",
  },
  youText: {
    color: "#2C2C2C",
    fontSize: 18,
    fontWeight: "800",
  },
  placeholderIcon: {
    fontSize: 38,
  },
  heartContainer: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#2C2C2C",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: -8,
    zIndex: 2,
  },
  heart: {
    color: "#FFFFFF",
    fontSize: 27,
  },
  matchedName: {
    marginTop: 18,
    color: "#2C2C2C",
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  description: {
    marginTop: 8,
    marginBottom: 24,
    color: "#777777",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  primaryButton: {
    width: "100%",
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: "#2C2C2C",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  secondaryButton: {
    width: "100%",
    minHeight: 52,
    marginTop: 10,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: "#2C2C2C",
    fontSize: 16,
    fontWeight: "700",
  },
  buttonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
});
