import { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useReduceMotion } from "../a11y";
import { homeScene } from "../ascii/homeScene";
import { ascii, ease, fonts } from "../theme";

function rainRows(cols: number, rows: number, density: number, seed: number) {
  let s = seed;
  const next = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const lines: string[] = [];
  for (let y = 0; y < rows; y++) {
    let line = "";
    for (let x = 0; x < cols; x++) line += next() < density ? ascii.rainGlyphs[Math.floor(next() * ascii.rainGlyphs.length)] : " ";
    lines.push(line);
  }
  return [...lines, ...lines].join("\n");
}

function loopBetween(value: Animated.Value, from: number, to: number, period: number, delay: number) {
  value.setValue(from);
  return Animated.loop(
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(value, { toValue: to, duration: period / 2, easing: ease.inOut, useNativeDriver: true }),
      Animated.timing(value, { toValue: from, duration: period / 2, easing: ease.inOut, useNativeDriver: true }),
    ]),
  );
}

export function AsciiScene() {
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const { cols, rowCount, rows, warm, glow } = homeScene;
  const fontSize = width / (cols * ascii.advance);
  const lineHeight = fontSize * ascii.lineHeight;
  const height = rowCount * lineHeight;

  const base = useMemo(() => rows.join("\n"), [rows]);
  const warmText = useMemo(() => warm.join("\n"), [warm]);
  const glowText = useMemo(() => glow.map((g) => g.join("\n")), [glow]);
  const rain = useMemo(() => ascii.rain.map((r) => rainRows(cols, rowCount, r.density, r.seed)), [cols, rowCount]);

  const glowValues = useRef(ascii.glow.map((g) => new Animated.Value(reduceMotion ? g.max : g.min))).current;
  const flicker = useRef(new Animated.Value(ascii.flicker.max)).current;
  const fall = useRef(ascii.rain.map(() => new Animated.Value(-height))).current;

  useEffect(() => {
    if (reduceMotion) {
      glowValues.forEach((v, i) => v.setValue(ascii.glow[i].max));
      flicker.setValue(ascii.flicker.max);
      return;
    }
    const loops = [
      ...glowValues.map((v, i) => loopBetween(v, ascii.glow[i].min, ascii.glow[i].max, ascii.glow[i].period, ascii.glow[i].delay)),
      loopBetween(flicker, ascii.flicker.max, ascii.flicker.min, ascii.flicker.period, 0),
      ...fall.map((v, i) => {
        v.setValue(-height);
        return Animated.loop(Animated.timing(v, { toValue: 0, duration: ascii.rain[i].duration, easing: (t) => t, useNativeDriver: true }));
      }),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [reduceMotion, glowValues, flicker, fall, height]);

  const textStyle = { fontFamily: fonts.mono, fontSize, lineHeight, includeFontPadding: false } as const;

  return (
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.root, { height, opacity: ascii.sceneOpacity }]}>
      <Text allowFontScaling={false} style={[textStyle, styles.layer, { color: ascii.silver, opacity: ascii.silverOpacity }]}>{base}</Text>
      <Animated.Text allowFontScaling={false} style={[textStyle, styles.layer, { color: ascii.amber, opacity: Animated.multiply(flicker, ascii.amberOpacity) }]}>{warmText}</Animated.Text>
      {glowText.map((t, i) => (
        <Animated.Text key={i} allowFontScaling={false} style={[textStyle, styles.layer, { color: ascii.highlight, opacity: glowValues[i] }]}>{t}</Animated.Text>
      ))}
      {!reduceMotion &&
        rain.map((t, i) => (
          <Animated.Text
            key={i}
            allowFontScaling={false}
            style={[textStyle, styles.layer, { height: height * 2, color: ascii.rain[i].color, opacity: ascii.rain[i].opacity, transform: [{ translateY: fall[i] }] }]}
          >
            {t}
          </Animated.Text>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: "absolute", left: 0, right: 0, overflow: "hidden" },
  layer: { position: "absolute", left: 0, top: 0 },
});
