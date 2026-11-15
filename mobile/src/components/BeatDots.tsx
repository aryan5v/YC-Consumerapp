import { StyleSheet, View } from "react-native";
import { colors } from "../theme";

export function BeatDots({ index, total }: { index: number; total: number }) {
  return (
    <View style={styles.row} accessible accessibilityRole="progressbar" accessibilityLabel={`Beat ${Math.min(index + 1, total)} of ${total}`}>
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
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.inactive },
  past: { backgroundColor: colors.passed },
  current: { width: 18, backgroundColor: colors.text },
});
