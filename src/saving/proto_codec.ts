/**
 * @fileoverview Stored data as protobuf, for any app in this repository: the
 * binary the app reads and writes, and protobuf's JSON form as a read-only
 * copy for people. Each app passes its own schema, schema version and
 * migrations, so neither depends on the other's.
 */

import {
  create,
  fromBinary,
  fromJson,
  toBinary,
  toJson,
  type DescMessage,
  type MessageInitShape,
  type MessageShape,
} from '@bufbuild/protobuf';

/** Upgrades data of one schema version to the next. */
export type Migration<T> = (data: T) => T;

/**
 * `data`, saved with schema version `from`, upgraded step by step to version
 * `to`: `steps[n]` upgrades version `n` to `n + 1`. Throws if a step is
 * missing.
 */
export function migrate<T>(
  data: T,
  from: number,
  to: number,
  steps: Readonly<Record<number, Migration<T>>>,
): T {
  let out = data;
  for (let version = from; version < to; version++) {
    const step = steps[version];
    if (!step)
      throw new Error(
        `Data of schema version ${version} can’t be upgraded: no migration to version ${version + 1}.`,
      );
    out = step(out);
  }
  return out;
}

/** A message with the schema version in it, as every app's root message has. */
type Versioned<Desc extends DescMessage> = MessageShape<Desc> & {
  schemaVersion: number;
};

export interface ProtoCodec<T> {
  /** The schema version this version of the app writes. */
  readonly version: number;
  /** The data as stored: protobuf binary, stamped with the schema version. */
  encode(data: T): Uint8Array<ArrayBuffer>;
  /**
   * Reads stored data. Fields this version doesn't know are kept, and saved
   * again with the data. Data from a newer schema version is refused with a
   * message to update the app, so it's never misread or overwritten.
   */
  decode(bytes: Uint8Array): T;
  /** The read-only copy: the data as protobuf's JSON form, indented. */
  toReadableJson(data: T): string;
  /** Reads the JSON form back, e.g. an exported file chosen for import. */
  fromReadableJson(text: string): T;
}

/**
 * The codec for an app's root message. Data read is checked and upgraded to
 * `version` with `migrations`, and its schema version cleared: it only
 * exists in what's stored, so data read from storage and data made in the
 * app compare equal. `what` names the data in messages ("dashboard data").
 */
export function protoCodec<Desc extends DescMessage>(
  schema: Desc,
  options: {
    version: number;
    migrations: Readonly<Record<number, Migration<Versioned<Desc>>>>;
    what: string;
  },
): ProtoCodec<Versioned<Desc>> {
  const {version, migrations, what} = options;
  type T = Versioned<Desc>;
  const stamped = (data: T) =>
    create(schema, {
      ...data,
      schemaVersion: version,
    } as MessageInitShape<Desc>);

  const checked = (data: T): T => {
    const saved = data.schemaVersion;
    if (saved > version)
      throw new Error(
        'This data was saved by a newer version of the app. Update the app (reload it) to use it.',
      );
    if (saved < 1) throw new Error(`This isn’t ${what}.`);
    return {...migrate(data, saved, version, migrations), schemaVersion: 0};
  };

  return {
    version,
    encode: data => toBinary(schema, stamped(data)),
    decode: bytes => {
      let data: T;
      try {
        data = fromBinary(schema, bytes) as T;
      } catch (e) {
        throw new Error(`The data can’t be read: ${(e as Error).message}`, {
          cause: e,
        });
      }
      return checked(data);
    },
    toReadableJson: data =>
      `${JSON.stringify(toJson(schema, stamped(data)), null, 2)}\n`,
    fromReadableJson: text => {
      let data: T;
      try {
        data = fromJson(schema, JSON.parse(text)) as T;
      } catch (e) {
        throw new Error(
          `This isn’t ${what}, or it’s from a newer version of the app: ${(e as Error).message}`,
          {cause: e},
        );
      }
      return checked(data);
    },
  };
}
