/**
 * @fileoverview The climbing log's data: the protobuf messages of
 * proto/climb/climb.proto, as the app uses them. Nothing here is shared with
 * the dashboard.
 */

import {create} from '@bufbuild/protobuf';
import * as pb from '../../gen/climb/climb_pb';

export {GradeSystem, PlaceKind} from '../../gen/climb/climb_pb';
export type {
  Climb,
  ClimbData,
  Colour,
  Place,
  Session,
  Settings,
} from '../../gen/climb/climb_pb';

export function emptyData(): pb.ClimbData {
  return create(pb.ClimbDataSchema, {settings: create(pb.SettingsSchema)});
}

/** `data` with what the app relies on being there (the settings). */
export function withDefaults(data: pb.ClimbData): pb.ClimbData {
  return data.settings ? data : {...data, settings: create(pb.SettingsSchema)};
}

/** The settings, which withDefaults makes sure exist. */
export function settingsOf(data: pb.ClimbData): pb.Settings {
  return data.settings ?? create(pb.SettingsSchema);
}

/** A new id for a place, colour, session or climb. */
export function newId(): string {
  return crypto.randomUUID();
}
