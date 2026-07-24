import type { NativeStackScreenProps } from '@react-navigation/native-stack';

/**
 * Route + param definitions for the root stack. Later build steps add
 * recording, results and comparison routes here.
 */
export type RootStackParamList = {
  Dashboard: undefined;
  /** Create a property when no propertyId is passed; edit otherwise. */
  PropertyForm: { propertyId?: string } | undefined;
  PropertyDetail: { propertyId: string };
};

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

declare global {
  // Gives useNavigation() full type inference app-wide.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
