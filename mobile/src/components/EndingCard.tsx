import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import type { Ending } from "../data";
import { colors, ease, fonts } from "../theme";

export function EndingCard({
  ending,
  streak,
  onShare,
  onDone,
  bottomInset,
}: {
  ending: Ending;
  streak: number;
  onShare: () => void;
  onDone: () => void;
  bottomInset: number;
}) {
  const steps = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.stagger(
      140,
      steps.map((v) => Animated.timing(v, { toValue: 1, duration: 760, easing: ease.out, useNativeDriver: true })),
    ).start();
  }, [steps]);

  const rise = (v: Animated.Value) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
  });

  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={["rgba(7,7,10,0.15)", "rgba(7,7,10,0.78)", "rgba(7,7,10,0.96)"]}
        locations={[0, 0.42, 0.8]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.body, { paddingBottom: bottomInset + 18 }]}>
        <Animated.View style={rise(steps[0])}>
          <Text style={styles.kicker}>Your ending</Text>
          <Text style={styles.title}>{ending.title}</Text>
          <Text style={styles.summary}>{ending.summary}</Text>
        </Animated.View>

        <Animated.View style={[styles.path, rise(steps[1])]}>
          {ending.path.map((step, i) => (
            <View key={i} style={styles.step}>
              <View style={styles.rail}>
                <View style={[styles.line, i === 0 && { opacity: 0 }]} />
                <View style={styles.node} />
                <View style={[styles.line, i === ending.path.length - 1 && { opacity: 0 }]} />
              </View>
              <Text numberOfLines={1} style={styles.stepText}>
                {step}
              </Text>
            </View>
          ))}
        </Animated.View>

        <Animated.View style={[styles.streak, rise(steps[2])]}>
          <Text style={styles.streakNumber}>{streak}</Text>
          <Text style={styles.streakLabel}>day streak{"\n"}A new story tomorrow</Text>
        </Animated.View>

        <Animated.View style={rise(steps[3])}>
          <Pressable accessibilityRole="button" onPress={onShare} style={({ pressed }) => [styles.share, pressed && { opacity: 0.8 }]}>
            <Text style={styles.shareText}>Share your path</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onDone} hitSlop={8} style={({ pressed }) => [styles.done, pressed && { opacity: 0.6 }]}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: "flex-end", paddingHorizontal: 26 },
  kicker: { fontFamily: fonts.ui, fontWeight: "600", fontSize: 12, letterSpacing: 2.6, textTransform: "uppercase", color: colors.dim, marginBottom: 10 },
  title: { fontFamily: fonts.display, fontSize: 46, lineHeight: 52, color: colors.text },
  summary: { fontFamily: fonts.ui, fontWeight: "400", fontSize: 17, lineHeight: 24, color: colors.dim, marginTop: 10 },
  path: { marginTop: 26 },
  step: { flexDirection: "row", alignItems: "center", height: 30 },
  rail: { width: 22, alignItems: "center", alignSelf: "stretch" },
  line: { flex: 1, width: StyleSheet.hairlineWidth * 2, backgroundColor: colors.faint },
  node: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.text },
  stepText: { flex: 1, marginLeft: 10, fontFamily: fonts.ui, fontWeight: "500", fontSize: 15, color: colors.text },
  streak: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  streakNumber: { fontFamily: fonts.display, fontSize: 48, lineHeight: 54, color: colors.text },
  streakLabel: { fontFamily: fonts.ui, fontWeight: "500", fontSize: 14, lineHeight: 20, color: colors.dim },
  share: { height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", backgroundColor: colors.text, marginTop: 26 },
  shareText: { fontFamily: fonts.ui, fontWeight: "600", fontSize: 17, color: colors.bg },
  done: { height: 48, alignItems: "center", justifyContent: "center", marginTop: 4 },
  doneText: { fontFamily: fonts.ui, fontWeight: "500", fontSize: 16, color: colors.dim },
});
