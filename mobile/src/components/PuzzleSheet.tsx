import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { PuzzleStop } from "../data";
import { colors, ease, fonts } from "../theme";
import { Ring } from "./Ring";

export type PuzzleState = "idle" | "submitting" | "correct" | "wrong";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", "go"];

export function PuzzleSheet({
  puzzle,
  line,
  accessory,
  state,
  onSubmit,
  bottomInset,
}: {
  puzzle: PuzzleStop;
  line: string | null;
  accessory: ReactNode;
  state: PuzzleState;
  onSubmit: (answer: string) => void;
  bottomInset: number;
}) {
  const [value, setValue] = useState("");
  const appear = useRef(new Animated.Value(0)).current;
  const keyboard = useRef(new Animated.Value(0)).current;
  const [keyboardUp, setKeyboardUp] = useState(false);
  const idle = state === "idle";
  const answered = state === "correct" || state === "wrong";

  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: 620, delay: 200, easing: ease.out, useNativeDriver: true }).start();
  }, [appear]);

  useEffect(() => {
    const move = (height: number, duration: number) => {
      setKeyboardUp(height > 0);
      Animated.timing(keyboard, { toValue: -height, duration: duration || 250, easing: ease.out, useNativeDriver: true }).start();
    };
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, (e) => move(e.endCoordinates.height, e.duration));
    const hide = Keyboard.addListener(hideEvent, (e) => move(0, e.duration));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [keyboard]);

  const submit = (answer: string) => {
    if (!idle || answer.trim() === "") return;
    Keyboard.dismiss();
    onSubmit(answer.trim());
  };

  const press = (key: string) => {
    if (!idle) return;
    Haptics.selectionAsync();
    if (key === "go") return submit(value);
    setValue((v) => (key === "del" ? v.slice(0, -1) : v.length < 6 ? v + key : v));
  };

  return (
    <Animated.View
      style={[
        styles.sheet,
        {
          paddingBottom: (keyboardUp ? 0 : bottomInset) + 20,
          opacity: appear,
          transform: [{ translateY: Animated.add(appear.interpolate({ inputRange: [0, 1], outputRange: [48, 0] }), keyboard) }],
        },
      ]}
    >
      <BlurView intensity={48} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass }]} />
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          {line !== null && line !== puzzle.question && <Text style={styles.line}>{line}</Text>}
          <Text style={styles.question}>{puzzle.question}</Text>
        </View>
        {!answered && accessory}
      </View>

      {answered ? (
        <View style={styles.result}>
          <Text style={styles.resultText}>{state === "correct" ? "That\u2019s it." : "Not quite. The night goes on."}</Text>
          <Ring size={20} delay={900} />
        </View>
      ) : (
        <View style={{ opacity: idle ? 1 : 0.5 }}>
          {puzzle.answerType === "pick" &&
            (puzzle.choices ?? []).map((choice) => (
              <Pressable
                key={choice}
                accessibilityRole="button"
                disabled={!idle}
                onPress={() => {
                  Haptics.selectionAsync();
                  setValue(choice);
                  submit(choice);
                }}
                style={({ pressed }) => [styles.pick, (pressed || value === choice) && styles.pickActive]}
              >
                <Text style={styles.pickText}>{choice}</Text>
              </Pressable>
            ))}

          {puzzle.answerType === "number" && (
            <>
              <View style={styles.display}>
                <Text style={[styles.digits, value === "" && { color: colors.faint }]}>{value === "" ? "\u2013 \u2013 \u2013" : value}</Text>
              </View>
              <View style={styles.pad}>
                {KEYS.map((key) => (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityLabel={key === "del" ? "Delete" : key === "go" ? "Enter" : key}
                    disabled={!idle || (key === "go" && value === "")}
                    onPress={() => press(key)}
                    style={({ pressed }) => [styles.key, key === "go" && value !== "" && styles.keyGo, pressed && styles.keyPressed]}
                  >
                    <Text style={[styles.keyText, key.length > 1 && styles.keyWord, key === "go" && value !== "" && { color: colors.bg }, key === "go" && value === "" && { color: colors.faint }]}>
                      {key === "del" ? "Delete" : key === "go" ? "Enter" : key}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {puzzle.answerType === "text" && (
            <View style={styles.textRow}>
              <TextInput
                value={value}
                onChangeText={setValue}
                editable={idle}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                keyboardAppearance="dark"
                returnKeyType="done"
                maxLength={40}
                placeholder="Your answer"
                placeholderTextColor={colors.faint}
                selectionColor={colors.text}
                onSubmitEditing={() => submit(value)}
                style={styles.input}
              />
              <Pressable
                accessibilityRole="button"
                disabled={!idle || value.trim() === ""}
                onPress={() => submit(value)}
                style={({ pressed }) => [styles.send, value.trim() === "" && { opacity: 0.35 }, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.sendText}>Answer</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 28,
    paddingHorizontal: 24,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: "hidden",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 14, marginBottom: 22 },
  line: { fontFamily: fonts.ui, fontWeight: "500", fontSize: 15, lineHeight: 21, color: colors.dim, marginBottom: 8 },
  question: { fontFamily: fonts.display, fontSize: 25, lineHeight: 33, color: colors.text },
  result: { height: 76, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  resultText: { fontFamily: fonts.ui, fontWeight: "500", fontSize: 18, color: colors.text },
  pick: {
    height: 56,
    borderRadius: 18,
    justifyContent: "center",
    paddingHorizontal: 20,
    marginBottom: 10,
    backgroundColor: colors.wash,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  pickActive: { backgroundColor: "rgba(244,241,234,0.2)", borderColor: colors.dim },
  pickText: { fontFamily: fonts.ui, fontWeight: "500", fontSize: 17, color: colors.text },
  display: { height: 62, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  digits: { fontFamily: fonts.display, fontSize: 42, letterSpacing: 10, color: colors.text },
  pad: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8 },
  key: { width: "31.5%", height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.wash },
  keyGo: { backgroundColor: colors.text },
  keyPressed: { backgroundColor: "rgba(244,241,234,0.24)" },
  keyText: { fontFamily: fonts.ui, fontWeight: "500", fontSize: 23, color: colors.text },
  keyWord: { fontSize: 14, fontWeight: "600", letterSpacing: 1.2, textTransform: "uppercase", color: colors.dim },
  textRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 6 },
  input: {
    flex: 1,
    height: 54,
    borderRadius: 18,
    paddingHorizontal: 18,
    backgroundColor: colors.wash,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    fontFamily: fonts.ui,
    fontWeight: "500",
    fontSize: 18,
    color: colors.text,
  },
  send: { height: 54, borderRadius: 27, paddingHorizontal: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.text },
  sendText: { fontFamily: fonts.ui, fontWeight: "600", fontSize: 16, color: colors.bg },
});
