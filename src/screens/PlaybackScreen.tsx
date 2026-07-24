import React, { useLayoutEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

import type { RootStackScreenProps } from '../navigation/types';
import { colors } from '../theme/theme';

/** Full-screen single-clip player with native transport controls. */
export function PlaybackScreen({ route, navigation }: RootStackScreenProps<'Playback'>) {
  const { uri, title } = route.params;

  useLayoutEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });

  return (
    <View style={styles.container}>
      <VideoView player={player} style={styles.video} nativeControls contentFit="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  video: { flex: 1, width: '100%' },
});
