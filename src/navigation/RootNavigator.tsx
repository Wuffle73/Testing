import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { RootStackParamList } from './types';
import { colors } from '../theme/theme';
import { DashboardScreen } from '../screens/DashboardScreen';
import { PropertyFormScreen } from '../screens/PropertyFormScreen';
import { PropertyDetailScreen } from '../screens/PropertyDetailScreen';
import { RoomsScreen } from '../screens/RoomsScreen';
import { FloorMapScreen } from '../screens/FloorMapScreen';
import { RecordScreen } from '../screens/RecordScreen';
import { PlaybackScreen } from '../screens/PlaybackScreen';
import { AnalysisScreen } from '../screens/AnalysisScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: 'Tenant Auditor' }}
      />
      <Stack.Screen
        name="PropertyForm"
        component={PropertyFormScreen}
        options={{ presentation: 'modal', title: 'Property' }}
      />
      <Stack.Screen
        name="PropertyDetail"
        component={PropertyDetailScreen}
        options={{ title: 'Property' }}
      />
      <Stack.Screen name="Rooms" component={RoomsScreen} options={{ title: 'Rooms' }} />
      <Stack.Screen name="FloorMap" component={FloorMapScreen} options={{ title: 'Floor map' }} />
      <Stack.Screen name="Record" component={RecordScreen} options={{ title: 'Record' }} />
      <Stack.Screen
        name="Playback"
        component={PlaybackScreen}
        options={{ presentation: 'modal', title: 'Playback' }}
      />
      <Stack.Screen name="Analysis" component={AnalysisScreen} options={{ title: 'AI analysis' }} />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ presentation: 'modal', title: 'AI settings' }}
      />
    </Stack.Navigator>
  );
}
