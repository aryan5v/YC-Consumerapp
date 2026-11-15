import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import { colors, ease, motion } from "../theme";

export function Ring({ size = 22, color = colors.text, delay = 0 }: { size?: number; color?: string; delay?: number }) {
  const spin = useRef(new Animated.Value(0)).current;
  const appear = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: motion.spin, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    Animated.timing(appear, { toValue: 1, duration: motion.settle, delay, easing: ease.out, useNativeDriver: true }).start();
    return () => loop.stop();
  }, [spin, appear, delay]);

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: colors.hairline,
        borderTopColor: color,
        opacity: appear,
        transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }],
      }}
    />
  );
}
