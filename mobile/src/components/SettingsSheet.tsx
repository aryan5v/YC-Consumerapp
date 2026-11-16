import { getRecordingPermissionsAsync } from "expo-audio";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Animated, AppState, Linking, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { convexStory } from "../data";
import { useReduceMotion } from "../a11y";
import { Glass } from "./Glass";
import { setSetting, useSettings } from "../settings";
import { colors, ease, fonts, motion, radius, type } from "../theme";

export function SettingsGlyph() {
  return (
    <View style={styles.glyph}>
      <View style={styles.glyphLine}>
        <View style={[styles.glyphKnob, { left: 3 }]} />
      </View>
      <View style={styles.glyphLine}>
        <View style={[styles.glyphKnob, { right: 3 }]} />
      </View>
    </View>
  );
}

const DISMISS_DRAG = 56;

function Divider() {
  return <View style={styles.divider} />;
}

function Switch({ label, detail, value, onChange }: { label: string; detail: string; value: boolean; onChange: (value: boolean) => void }) {
  const knob = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(knob, { toValue: value ? 1 : 0, duration: motion.quick, easing: ease.out, useNativeDriver: true }).start();
  }, [value, knob]);

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={detail}
      accessibilityState={{ checked: value }}
      onPress={() => {
        Haptics.selectionAsync();
        onChange(!value);
      }}
      style={styles.row}
    >
      <View style={{ flex: 1 }} accessible={false}>
        <Text maxFontSizeMultiplier={1.4} style={styles.label}>{label}</Text>
        <Text maxFontSizeMultiplier={1.4} style={styles.detail}>{detail}</Text>
      </View>
      <View style={styles.track} accessible={false}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.trackOn, { opacity: knob }]} />
        <Animated.View
          style={[
            styles.knob,
            {
              backgroundColor: value ? colors.accentInk : colors.text,
              transform: [{ translateX: knob.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) }],
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

export function SettingsSheet({ onClose, bottomInset }: { onClose: () => void; bottomInset: number }) {
  const settings = useSettings();
  const reduceMotion = useReduceMotion();
  const appear = useRef(new Animated.Value(0)).current;
  const drag = useRef(new Animated.Value(0)).current;
  const [micBlocked, setMicBlocked] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = () =>
      getRecordingPermissionsAsync()
        .then((p) => alive && setMicBlocked(!p.granted && !p.canAskAgain))
        .catch(() => {});
    check();
    const sub = AppState.addEventListener("change", (state) => state === "active" && check());
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: motion.settle, easing: ease.out, useNativeDriver: true }).start();
  }, [appear]);

  const close = () => Animated.timing(appear, { toValue: 0, duration: motion.quick, easing: ease.out, useNativeDriver: true }).start(onClose);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && g.dy > Math.abs(g.dx),
      onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > DISMISS_DRAG || g.vy > 0.8) {
          Animated.timing(appear, { toValue: 0, duration: motion.quick, easing: ease.out, useNativeDriver: true }).start(onClose);
          return;
        }
        Animated.timing(drag, { toValue: 0, duration: motion.quick, easing: ease.out, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: () => Animated.timing(drag, { toValue: 0, duration: motion.quick, easing: ease.out, useNativeDriver: true }).start(),
    }),
  ).current;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 20 }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: appear }]} />
      <Pressable accessibilityRole="button" accessibilityLabel="Close settings" style={StyleSheet.absoluteFill} onPress={close} />
      <Animated.View
        {...pan.panHandlers}
        style={[
          styles.sheetWrap,
          {
            opacity: appear,
            transform: [{ translateY: Animated.add(appear.interpolate({ inputRange: [0, 1], outputRange: [reduceMotion ? 0 : 40, 0] }), drag) }],
          },
        ]}
      >
        <Glass style={[styles.sheet, { paddingBottom: bottomInset + 18 }]}>
        <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.grabber} />
        <View style={styles.header}>
          <Text maxFontSizeMultiplier={1.4} style={[styles.kicker, { marginBottom: 0 }]}>Sound</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Done" hitSlop={8} onPress={close} style={styles.done}>
            <Text maxFontSizeMultiplier={1.4} style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
        <Switch
          label="Character voice"
          detail="Hear characters say their lines. Captions always stay."
          value={settings.voice}
          onChange={(value) => setSetting("voice", value)}
        />
        <Divider />
        <Switch
          label="Microphone"
          detail="Hold the mic at a stop to answer out loud. Tapping always works."
          value={settings.microphone}
          onChange={(value) => setSetting("microphone", value)}
        />
        {micBlocked && (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>Microphone access is off in iOS Settings</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Open iOS Settings" hitSlop={10} onPress={() => Linking.openSettings()}>
              <Text maxFontSizeMultiplier={1.4} style={styles.noticeAction}>Open Settings</Text>
            </Pressable>
          </View>
        )}
        {convexStory && (
          <>
            <Text maxFontSizeMultiplier={1.4} style={[styles.kicker, styles.group]}>Story</Text>
            <Switch
            label="Demo story"
            detail={"Play the built-in offline episode instead of today\u2019s live one."}
            value={settings.demo}
            onChange={(value) => setSetting("demo", value)}
          />
          </>
        )}
        </Glass>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  glyph: { width: 20, gap: 6 },
  glyphLine: { height: 1.5, borderRadius: 1, backgroundColor: colors.text, justifyContent: "center" },
  glyphKnob: { position: "absolute", width: 5.5, height: 5.5, borderRadius: 3, backgroundColor: colors.text },
  sheetWrap: { position: "absolute", left: 0, right: 0, bottom: 0 },
  sheet: {
    paddingTop: 26,
    paddingHorizontal: 24,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  kicker: { fontFamily: fonts.uiSemibold, fontSize: type.micro, letterSpacing: type.labelTracking, textTransform: "uppercase", color: colors.dim, marginBottom: 6 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline },
  grabber: { position: "absolute", top: 8, alignSelf: "center", width: 36, height: 5, borderRadius: radius.round, backgroundColor: colors.faint },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  done: { minHeight: 44, minWidth: 44, alignItems: "flex-end", justifyContent: "center" },
  doneText: { fontFamily: fonts.uiMedium, fontSize: type.control, color: colors.dim },
  group: { marginTop: 22 },
  notice: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 18, paddingBottom: 14 },
  noticeText: { flex: 1, fontFamily: fonts.ui, fontSize: type.small, lineHeight: 19, color: colors.faint },
  noticeAction: { minHeight: 44, textAlignVertical: "center", lineHeight: 44, fontFamily: fonts.uiSemibold, fontSize: type.small, color: colors.text },
  row: { flexDirection: "row", alignItems: "center", gap: 18, paddingVertical: 14 },
  label: { fontFamily: fonts.uiMedium, fontSize: type.lead, color: colors.text },
  detail: { fontFamily: fonts.ui, fontSize: type.small, lineHeight: 19, color: colors.dim, marginTop: 3 },
  track: {
    width: 52,
    height: 32,
    borderRadius: radius.key,
    padding: 4,
    backgroundColor: colors.wash,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    overflow: "hidden",
  },
  trackOn: { backgroundColor: colors.accent },
  knob: { width: 23, height: 23, borderRadius: 12 },
});
