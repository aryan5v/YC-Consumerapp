import { StyleSheet, View } from "react-native";
import { colors } from "../theme";

export function BeatDots({ index, total }: { index: number; total: number }) {
  return (
    <View style={styles.row}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[styles.dot, i < index && styles.past, i === index && styles.current]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: "rgba(244,241,234,0.28)" },
  past: { backgroundColor: "rgba(244,241,234,0.7)" },
  current: { width: 18, backgroundColor: colors.text },
});
