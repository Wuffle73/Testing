import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SessionType } from '../types/models';

/**
 * Route + param definitions for the root stack. Later build steps add
 * results and comparison routes here.
 */
export type RootStackParamList = {
  Dashboard: undefined;
  /** Create a property when no propertyId is passed; edit otherwise. */
  PropertyForm: { propertyId?: string } | undefined;
  PropertyDetail: { propertyId: string };
  Rooms: { propertyId: string };
  FloorMap: { propertyId: string };
  /** Guided per-room recording flow, reused for baseline and inspection. */
  Record: { propertyId: string; sessionType: SessionType };
  Playback: { uri: string; title: string };
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
