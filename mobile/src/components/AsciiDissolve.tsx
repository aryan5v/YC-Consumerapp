import { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useReduceMotion } from "../a11y";
import { ascii, colors, ease, fonts, motion } from "../theme";

const GLYPHS = " .:-=+*#%@";
const COLS = 46;

function field(cols: number, rows: number, density: number, seed: number) {
  let s = seed;
  const next = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const lines: string[] = [];
  for (let y = 0; y < rows; y++) {
    let line = "";
    for (let x = 0; x < cols; x++) line += next() < density ? GLYPHS[1 + Math.floor(next() * (GLYPHS.length - 1))] : " ";
    lines.push(line);
  }
  return lines.join("\n");
}

export function AsciiDissolve({ show }: { show: boolean }) {
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const fontSize = width / (COLS * ascii.advance);
  const rows = Math.ceil(height / fontSize) + 1;
  const layers = useMemo(() => ascii.dissolve.layers.map((l) => field(COLS, rows, l.density, l.seed)), [rows]);
  const presence = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(ascii.dissolve.layers.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.timing(presence, {
      toValue: show ? 1 : 0,
      duration: reduceMotion ? motion.fade : show ? ascii.dissolve.inMs : ascii.dissolve.outMs,
      easing: ease.out,
      useNativeDriver: true,
    }).start();
  }, [show, reduceMotion, presence]);

  useEffect(() => {
    if (!show || reduceMotion) {
      shimmer.forEach((v) => v.setValue(0.7));
      return;
    }
    const loops = shimmer.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: ascii.dissolve.layers[i].period / 2, easing: ease.inOut, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.15, duration: ascii.dissolve.layers[i].period / 2, easing: ease.inOut, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [show, reduceMotion, shimmer]);

  const textStyle = { fontFamily: fonts.mono, fontSize, lineHeight: fontSize, includeFontPadding: false } as const;
  return (
    <Animated.View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { opacity: presence }]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, opacity: ascii.dissolve.veil }]} />
      {layers.map((t, i) => (
        <Animated.Text
          key={i}
          allowFontScaling={false}
          style={[textStyle, styles.layer, { color: ascii.dissolve.layers[i].color, opacity: Animated.multiply(shimmer[i], ascii.dissolve.layers[i].opacity) }]}
        >
          {t}
        </Animated.Text>
      ))}
      <View style={styles.caption}>
        <Text allowFontScaling={false} style={[styles.captionText]}>{ascii.dissolve.caption}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { position: "absolute", left: 0, top: 0 },
  caption: { position: "absolute", left: 0, right: 0, top: "48%", alignItems: "center" },
  captionText: { fontFamily: fonts.mono, fontSize: 12, letterSpacing: ascii.monoTracking, color: ascii.ornamentColor },
});
