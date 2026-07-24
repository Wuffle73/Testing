import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { RootStackParamList } from './types';
import { colors } from '../theme/theme';
import { DashboardScreen } from '../screens/DashboardScreen';
import { PropertyFormScreen } from '../screens/PropertyFormScreen';
import { PropertyDetailScreen } from '../screens/PropertyDetailScreen';

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
    </Stack.Navigator>
  );
}
