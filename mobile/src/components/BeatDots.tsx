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
  row: { flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.inactive },
  past: { backgroundColor: colors.passed },
  current: { width: 11, height: 11, borderRadius: 5.5, borderWidth: 2, borderColor: colors.white, backgroundColor: colors.white },
});
