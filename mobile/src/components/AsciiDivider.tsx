import { StyleSheet, Text } from "react-native";
import { ascii, fonts } from "../theme";

export function AsciiDivider() {
  return (
    <Text accessible={false} importantForAccessibility="no" numberOfLines={1} style={styles.text}>
      {ascii.ornament}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { fontFamily: fonts.mono, fontSize: ascii.ornamentSize, letterSpacing: ascii.ornamentTracking, color: ascii.ornamentColor },
});
