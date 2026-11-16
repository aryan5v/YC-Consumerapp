import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useReduceMotion } from "../a11y";
import type { CaseInfo } from "../data";
import { colors, ease, fonts, motion, radius, type } from "../theme";
import { Glass } from "./Glass";

export function CaseHud({
  info,
  top,
  showQuestion,
  canSolve,
  onSolve,
  onTalk,
}: {
  info: CaseInfo;
  top: number;
  showQuestion: boolean;
  canSolve: boolean;
  onSolve: () => void;
  onTalk?: () => void;
}) {
  const used = info.movesTotal - info.movesLeft;
  return (
    <View pointerEvents="box-none" style={[styles.hud, { top }]}>
      <View pointerEvents="box-none" style={styles.row}>
        <Text accessibilityLabel={`${info.movesLeft} moves left of ${info.movesTotal}`} style={styles.moves}>
          MOVES {info.movesLeft}/{info.movesTotal}
        </Text>
        {onTalk && (
          <Glass interactive style={styles.solve}>
            <Pressable accessibilityRole="button" accessibilityLabel="Talk to the master" onPress={onTalk} style={styles.solveHit}>
              <Text maxFontSizeMultiplier={1.3} style={styles.solveText}>Ask</Text>
            </Pressable>
          </Glass>
        )}
        {canSolve && (
          <Glass interactive style={styles.solve}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Solve the case"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onSolve();
              }}
              style={styles.solveHit}
            >
              <Text maxFontSizeMultiplier={1.3} style={styles.solveText}>Solve</Text>
            </Pressable>
          </Glass>
        )}
      </View>
      {showQuestion && used === 0 && (
        <Glass style={styles.question}>
          <Text style={styles.kicker}>THE CASE</Text>
          <Text maxFontSizeMultiplier={1.3} style={styles.questionText}>{info.question}</Text>
        </Glass>
      )}
    </View>
  );
}

export function SolveSheet({
  info,
  open,
  bottomInset,
  busy,
  onPick,
  onClose,
}: {
  info: CaseInfo;
  open: boolean;
  bottomInset: number;
  busy: boolean;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const reduce = useReduceMotion();
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(rise, { toValue: open ? 1 : 0, duration: reduce ? motion.instant : motion.sheet, easing: ease.out, useNativeDriver: true }).start();
  }, [open, reduce, rise]);
  if (!info.solveChoices) return null;
  return (
    <View pointerEvents={open ? "auto" : "none"} style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: rise }]}>
        <Pressable accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[styles.sheetWrap, { bottom: bottomInset + 8, opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) }] }]}
      >
        <Glass style={styles.sheet}>
          <Text style={styles.kicker}>ONE ANSWER · NO SECOND TRY</Text>
          <Text maxFontSizeMultiplier={1.3} style={styles.sheetQuestion}>{info.question}</Text>
          {info.solveChoices.map((c) => (
            <Glass key={c.id} interactive style={styles.choice}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={c.label}
                disabled={busy}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                  onPick(c.id);
                }}
                style={styles.choiceHit}
              >
                <Text maxFontSizeMultiplier={1.3} style={styles.choiceText}>{c.label}</Text>
              </Pressable>
            </Glass>
          ))}
          <Pressable accessibilityRole="button" disabled={busy} onPress={onClose} style={styles.notYet}>
            <Text style={styles.notYetText}>Keep investigating</Text>
          </Pressable>
        </Glass>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  hud: { position: "absolute", left: 24, right: 24, alignItems: "center", gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  moves: { fontFamily: fonts.mono, fontSize: type.micro, letterSpacing: type.labelTracking, color: colors.text, textShadowColor: colors.textShadow, textShadowRadius: 6 },
  solve: { height: 36, minWidth: 72, borderRadius: radius.round },
  solveHit: { flex: 1, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", minHeight: 44, marginVertical: -4 },
  solveText: { fontFamily: fonts.uiMedium, fontSize: type.small, letterSpacing: 1, color: colors.text },
  question: { alignSelf: "stretch", borderRadius: radius.card, paddingHorizontal: 16, paddingVertical: 10, gap: 4 },
  kicker: { fontFamily: fonts.mono, fontSize: type.micro, letterSpacing: type.labelTracking, color: colors.dim },
  questionText: { fontFamily: fonts.ui, fontSize: type.small, lineHeight: 20, color: colors.text },
  sheetWrap: { position: "absolute", left: 8, right: 8 },
  sheet: { borderRadius: radius.sheet, padding: 22, gap: 12 },
  sheetQuestion: { fontFamily: fonts.title, fontSize: type.question, lineHeight: 30, color: colors.text, marginBottom: 6 },
  choice: { borderRadius: radius.button },
  choiceHit: { minHeight: 52, paddingHorizontal: 18, justifyContent: "center" },
  choiceText: { fontFamily: fonts.uiMedium, fontSize: type.control, color: colors.text },
  notYet: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  notYetText: { fontFamily: fonts.ui, fontSize: type.small, color: colors.dim },
});
