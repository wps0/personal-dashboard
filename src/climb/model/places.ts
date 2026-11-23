/**
 * @fileoverview Gyms and boards, their colour labels, and the settings:
 * pure edits that return new data.
 */

import {create} from '@bufbuild/protobuf';
import * as pb from '../../gen/climb/climb_pb';
import {CLIMB_BOARD_ANGLE} from '../../config';
import {
  newId,
  PlaceKind,
  settingsOf,
  type ClimbData,
  type Place,
  type Settings,
} from './data';

/** The places of a kind, in the order added; archived ones only if asked. */
export function placesOf(
  data: ClimbData,
  kind: PlaceKind,
  archived = false,
): Place[] {
  return data.places.filter(p => p.kind === kind && p.archived === archived);
}

export function placeById(data: ClimbData, id: string): Place | undefined {
  return data.places.find(p => p.id === id);
}

/** Adds a gym or a board, and returns the data and its id. */
export function addPlace(
  data: ClimbData,
  kind: PlaceKind,
  name: string,
): [ClimbData, string] {
  const place = create(pb.PlaceSchema, {
    id: newId(),
    kind,
    name: name.trim(),
    usualAngle: kind === PlaceKind.BOARD ? CLIMB_BOARD_ANGLE : undefined,
  });
  return [{...data, places: [...data.places, place]}, place.id];
}

function updatePlaceWith(
  data: ClimbData,
  id: string,
  change: (p: Place) => Place,
): ClimbData {
  return {
    ...data,
    places: data.places.map(p => (p.id === id ? change(p) : p)),
  };
}

export function updatePlace(
  data: ClimbData,
  id: string,
  patch: Partial<Pick<Place, 'name' | 'usualAngle' | 'archived'>>,
): ClimbData {
  return updatePlaceWith(data, id, p => ({...p, ...patch}));
}

/** Whether a place has sessions, so it can only be archived, not deleted. */
export function hasSessions(data: ClimbData, id: string): boolean {
  return data.sessions.some(s => s.placeId === id);
}

/** Deletes a place without sessions; one with sessions is left as it is. */
export function deletePlace(data: ClimbData, id: string): ClimbData {
  if (hasSessions(data, id)) return data;
  return {...data, places: data.places.filter(p => p.id !== id)};
}

/** Adds a colour label to a gym. */
export function addColour(
  data: ClimbData,
  placeId: string,
  name: string,
  hex: string,
): ClimbData {
  const colour = create(pb.ColourSchema, {id: newId(), name, hex});
  return updatePlaceWith(data, placeId, p => ({
    ...p,
    colours: [...p.colours, colour],
  }));
}

export function renameColour(
  data: ClimbData,
  placeId: string,
  colourId: string,
  name: string,
): ClimbData {
  return updatePlaceWith(data, placeId, p => ({
    ...p,
    colours: p.colours.map(c => (c.id === colourId ? {...c, name} : c)),
  }));
}

/** Removes a colour label, and takes it off the climbs that had it. */
export function removeColour(
  data: ClimbData,
  placeId: string,
  colourId: string,
): ClimbData {
  const out = updatePlaceWith(data, placeId, p => ({
    ...p,
    colours: p.colours.filter(c => c.id !== colourId),
  }));
  return {
    ...out,
    climbs: out.climbs.map(c =>
      c.colourId === colourId ? {...c, colourId: undefined} : c,
    ),
  };
}

export function updateSettings(
  data: ClimbData,
  patch: Partial<Omit<Settings, '$typeName' | '$unknown'>>,
): ClimbData {
  return {...data, settings: {...settingsOf(data), ...patch}};
}
