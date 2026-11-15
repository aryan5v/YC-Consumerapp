import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, StyleSheet } from "react-native";
import { ease } from "../theme";

export function Presence({ show, duration = 240, children }: { show: boolean; duration?: number; children: ReactNode }) {
  const last = useRef(children);
  if (show) last.current = children;
  const [mounted, setMounted] = useState(show);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (show) setMounted(true);
    Animated.timing(opacity, { toValue: show ? 1 : 0, duration, easing: ease.out, useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished && !show) setMounted(false);
      },
    );
  }, [show, duration, opacity]);

  if (!mounted && !show) return null;
  return (
    <Animated.View pointerEvents={show ? "box-none" : "none"} style={[StyleSheet.absoluteFill, { opacity }]}>
      {last.current}
    </Animated.View>
  );
}
