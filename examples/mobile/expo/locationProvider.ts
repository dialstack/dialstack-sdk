/**
 * Reference `locationProvider` for the Expo example, backed by expo-location.
 *
 * `@dialstack/sdk-native` takes no geolocation dependency — the host supplies a
 * function that returns an `EmergencyAddressInput` for the E911 form's
 * "Use my current location" action. This one requests the OS location
 * permission, reads the current position, reverse-geocodes it, and maps the
 * result to the SDK's address shape. Any geolocation library works
 * (expo-location here; a bare app would use @react-native-community/geolocation).
 *
 * Throws on denied permission or an unresolvable location; the softphone surfaces
 * the message inline and the user can still type the address by hand.
 */
import * as Location from 'expo-location';
import type { EmergencyAddressInput } from '@dialstack/sdk-native';

export async function getCurrentEmergencyAddress(): Promise<EmergencyAddressInput> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== Location.PermissionStatus.GRANTED) {
    throw new Error('Location permission denied — enter your address manually.');
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  const [place] = await Location.reverseGeocodeAsync({
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  });
  if (!place) {
    throw new Error("Couldn't determine your address — enter it manually.");
  }

  // expo-location splits the house number into `streetNumber` and the road into
  // `street`; the SDK wants them as `address_number` + `street`.
  return {
    address_number: place.streetNumber ?? '',
    street: place.street ?? '',
    city: place.city ?? place.subregion ?? '',
    state: place.region ?? '',
    postal_code: place.postalCode ?? '',
  };
}
