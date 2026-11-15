import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Animated, Keyboard, Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { story, type Ending } from "../data";
import { colors, ease, fonts } from "../theme";
import { Ring } from "./Ring";

let phoneAnswered: "saved" | "skipped" | null = null;

function normalize(input: string) {
  const digits = input.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return input.trim().startsWith("+") ? `+${digits}` : digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

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
  const steps = useRef([0, 1, 2, 3, 4].map(() => new Animated.Value(0))).current;
  const keyboard = useRef(new Animated.Value(0)).current;
  const [phone, setPhone] = useState("");
  const [phoneState, setPhoneState] = useState<"ask" | "saving" | "saved" | "skipped">(phoneAnswered ?? "ask");
  const text = ending.text ?? null;
  const valid = normalize(phone);

  useEffect(() => {
    Animated.stagger(
      140,
      steps.map((v) => Animated.timing(v, { toValue: 1, duration: 760, easing: ease.out, useNativeDriver: true })),
    ).start();
  }, [steps]);

  useEffect(() => {
    const move = (height: number, duration: number) =>
      Animated.timing(keyboard, {
        toValue: height === 0 ? 0 : -Math.max(0, height - bottomInset - 142),
        duration: duration || 250,
        easing: ease.out,
        useNativeDriver: true,
      }).start();
    const show = Keyboard.addListener("keyboardWillShow", (e) => move(e.endCoordinates.height, e.duration));
    const hide = Keyboard.addListener("keyboardWillHide", (e) => move(0, e.duration));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [keyboard, bottomInset]);

  const rise = (v: Animated.Value) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
  });

  const save = async () => {
    if (!valid || phoneState !== "ask") return;
    Keyboard.dismiss();
    setPhoneState("saving");
    try {
      await story.setPhone(valid);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      phoneAnswered = "saved";
      setPhoneState("saved");
    } catch {
      setPhoneState("ask");
    }
  };

  const skip = () => {
    Keyboard.dismiss();
    phoneAnswered = "skipped";
    setPhoneState("skipped");
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={["rgba(7,7,10,0.15)", "rgba(7,7,10,0.8)", "rgba(7,7,10,0.97)"]}
        locations={[0, 0.34, 0.72]}
        style={StyleSheet.absoluteFill}
      />
      <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={Keyboard.dismiss} />
      <Animated.View pointerEvents="box-none" style={[styles.body, { paddingBottom: bottomInset + 14, transform: [{ translateY: keyboard }] }]}>
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

        {text && phoneState !== "skipped" && (
          <Animated.View style={[styles.text, rise(steps[3])]}>
            {phoneState === "saved" ? (
              <>
                <Text style={styles.teaser}>{text.character} has your number.</Text>
                {text.number ? (
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => Linking.openURL(`sms:${text.number}&body=${encodeURIComponent(text.prompt)}`).catch(() => {})}
                    style={({ pressed }) => [styles.textFirst, pressed && { opacity: 0.6 }]}
                  >
                    <Text style={styles.textFirstLabel}>Text first</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.hint}>Keep your phone close.</Text>
                )}
              </>
            ) : (
              <>
                <Text style={styles.teaser}>{text.character} isn{"\u2019"}t finished with you.</Text>
                <Text style={styles.hint}>Someone from the story may text you. What you say shapes tomorrow.</Text>
                <View style={styles.phoneRow}>
                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    editable={phoneState === "ask"}
                    keyboardType="phone-pad"
                    textContentType="telephoneNumber"
                    autoComplete="tel"
                    keyboardAppearance="dark"
                    maxLength={20}
                    placeholder="Your phone number"
                    placeholderTextColor={colors.faint}
                    selectionColor={colors.text}
                    style={styles.phone}
                  />
                  {valid || phoneState === "saving" ? (
                    <Pressable accessibilityRole="button" accessibilityLabel="Save number" onPress={save} style={({ pressed }) => [styles.save, pressed && { opacity: 0.8 }]}>
                      {phoneState === "saving" ? <Ring size={18} color={colors.bg} /> : <Text style={styles.saveText}>Save</Text>}
                    </Pressable>
                  ) : (
                    <Pressable accessibilityRole="button" accessibilityLabel="Not now" hitSlop={8} onPress={skip} style={({ pressed }) => [styles.skip, pressed && { opacity: 0.6 }]}>
                      <Text style={styles.skipText}>Not now</Text>
                    </Pressable>
                  )}
                </View>
              </>
            )}
          </Animated.View>
        )}

        <Animated.View style={rise(steps[4])}>
          <Pressable accessibilityRole="button" onPress={onShare} style={({ pressed }) => [styles.share, pressed && { opacity: 0.8 }]}>
            <Text style={styles.shareText}>Share your path</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onDone} hitSlop={8} style={({ pressed }) => [styles.done, pressed && { opacity: 0.6 }]}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: "flex-end", paddingHorizontal: 26 },
  kicker: { fontFamily: fonts.ui, fontWeight: "600", fontSize: 12, letterSpacing: 2.6, textTransform: "uppercase", color: colors.dim, marginBottom: 10 },
  title: { fontFamily: fonts.display, fontSize: 44, lineHeight: 50, color: colors.text },
  summary: { fontFamily: fonts.ui, fontWeight: "400", fontSize: 17, lineHeight: 24, color: colors.dim, marginTop: 8 },
  path: { marginTop: 20 },
  step: { flexDirection: "row", alignItems: "center", height: 28 },
  rail: { width: 22, alignItems: "center", alignSelf: "stretch" },
  line: { flex: 1, width: StyleSheet.hairlineWidth * 2, backgroundColor: colors.faint },
  node: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.text },
  stepText: { flex: 1, marginLeft: 10, fontFamily: fonts.ui, fontWeight: "500", fontSize: 15, color: colors.text },
  streak: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  streakNumber: { fontFamily: fonts.display, fontSize: 42, lineHeight: 48, color: colors.text },
  streakLabel: { fontFamily: fonts.ui, fontWeight: "500", fontSize: 14, lineHeight: 20, color: colors.dim },
  text: { marginTop: 16, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline },
  teaser: { fontFamily: fonts.display, fontSize: 21, lineHeight: 27, color: colors.text },
  hint: { fontFamily: fonts.ui, fontWeight: "400", fontSize: 14, lineHeight: 20, color: colors.dim, marginTop: 4 },
  phoneRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  phone: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    paddingHorizontal: 16,
    backgroundColor: colors.wash,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    fontFamily: fonts.ui,
    fontWeight: "500",
    fontSize: 17,
    color: colors.text,
  },
  save: { height: 50, minWidth: 84, borderRadius: 25, paddingHorizontal: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.text },
  saveText: { fontFamily: fonts.ui, fontWeight: "600", fontSize: 15, color: colors.bg },
  skip: { height: 50, minWidth: 84, alignItems: "center", justifyContent: "center" },
  skipText: { fontFamily: fonts.ui, fontWeight: "500", fontSize: 15, color: colors.dim },
  textFirst: { alignSelf: "flex-start", marginTop: 8, paddingBottom: 2, borderBottomWidth: 1, borderColor: colors.dim },
  textFirstLabel: { fontFamily: fonts.ui, fontWeight: "600", fontSize: 15, color: colors.text },
  share: { height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: colors.text, marginTop: 20 },
  shareText: { fontFamily: fonts.ui, fontWeight: "600", fontSize: 17, color: colors.bg },
  done: { height: 44, alignItems: "center", justifyContent: "center", marginTop: 2 },
  doneText: { fontFamily: fonts.ui, fontWeight: "500", fontSize: 16, color: colors.dim },
});
