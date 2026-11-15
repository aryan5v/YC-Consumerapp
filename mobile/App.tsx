import { StatusBar } from "expo-status-bar";
import { useCallback, useRef, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { story } from "./src/data";
import { Home } from "./src/screens/Home";
import { Player } from "./src/screens/Player";
import { colors, ease } from "./src/theme";

function Shell() {
  const home = story.useHome();
  const [runId, setRunId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [playing, setPlaying] = useState(false);
  const cover = useRef(new Animated.Value(0)).current;

  const play = async () => {
    if (!home || starting) return;
    setStarting(true);
    try {
      const resume = home.run && (home.run.status === "active" || !story.canReplay);
      setRunId(resume && home.run ? home.run.id : await story.startToday());
    } catch {
      setStarting(false);
    }
  };

  const started = useCallback(() => {
    setPlaying(true);
    Animated.timing(cover, { toValue: 1, duration: 700, easing: ease.out, useNativeDriver: true }).start();
  }, [cover]);

  const exit = useCallback(() => {
    setPlaying(false);
    Animated.timing(cover, { toValue: 0, duration: 520, easing: ease.out, useNativeDriver: true }).start(() => {
      setRunId(null);
      setStarting(false);
    });
  }, [cover]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" hidden={playing} animated />
      <Home starting={starting} onPlay={play} />
      {runId && home && (
        <Animated.View pointerEvents={playing ? "auto" : "none"} style={[StyleSheet.absoluteFill, { opacity: cover }]}>
          <Player runId={runId} streak={home.streak} episodeTitle={home.episode.title} onStarted={started} onExit={exit} />
        </Animated.View>
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <story.Root>
        <Shell />
      </story.Root>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
