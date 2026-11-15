import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { setSetting, useSettings } from "../settings";
import { colors, ease, fonts } from "../theme";

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

function Switch({ label, detail, value, onChange }: { label: string; detail: string; value: boolean; onChange: (value: boolean) => void }) {
  const knob = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(knob, { toValue: value ? 1 : 0, duration: 240, easing: ease.out, useNativeDriver: true }).start();
  }, [value, knob]);

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => {
        Haptics.selectionAsync();
        onChange(!value);
      }}
      style={styles.row}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.trackOn, { opacity: knob }]} />
        <Animated.View
          style={[
            styles.knob,
            {
              backgroundColor: value ? colors.bg : colors.text,
              transform: [{ translateX: knob.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) }],
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

export function SettingsSheet({ showMicrophone, onClose, bottomInset }: { showMicrophone: boolean; onClose: () => void; bottomInset: number }) {
  const settings = useSettings();
  const appear = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: 460, easing: ease.out, useNativeDriver: true }).start();
  }, [appear]);

  const close = () => Animated.timing(appear, { toValue: 0, duration: 260, easing: ease.out, useNativeDriver: true }).start(onClose);

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 20 }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.4)", opacity: appear }]} />
      <Pressable accessibilityLabel="Close settings" style={StyleSheet.absoluteFill} onPress={close} />
      <Animated.View
        style={[
          styles.sheet,
          {
            paddingBottom: bottomInset + 18,
            opacity: appear,
            transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
          },
        ]}
      >
        <BlurView intensity={48} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass }]} />
        <Text style={styles.kicker}>Sound</Text>
        <Switch
          label="Character voice"
          detail="Hear characters say their lines. Captions always stay."
          value={settings.voice}
          onChange={(value) => setSetting("voice", value)}
        />
        {showMicrophone && (
          <Switch
            label="Microphone"
            detail="Hold the mic at a stop to answer out loud. Tapping always works."
            value={settings.microphone}
            onChange={(value) => setSetting("microphone", value)}
          />
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  glyph: { width: 20, gap: 6 },
  glyphLine: { height: 1.5, borderRadius: 1, backgroundColor: colors.text, justifyContent: "center" },
  glyphKnob: { position: "absolute", width: 5.5, height: 5.5, borderRadius: 3, backgroundColor: colors.text },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 26,
    paddingHorizontal: 24,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: "hidden",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  kicker: { fontFamily: fonts.ui, fontWeight: "600", fontSize: 12, letterSpacing: 2.6, textTransform: "uppercase", color: colors.dim, marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 18, paddingVertical: 14 },
  label: { fontFamily: fonts.ui, fontWeight: "500", fontSize: 18, color: colors.text },
  detail: { fontFamily: fonts.ui, fontWeight: "400", fontSize: 14, lineHeight: 19, color: colors.dim, marginTop: 3 },
  track: {
    width: 52,
    height: 32,
    borderRadius: 16,
    padding: 4,
    backgroundColor: colors.wash,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    overflow: "hidden",
  },
  trackOn: { backgroundColor: colors.text },
  knob: { width: 23, height: 23, borderRadius: 12 },
});
