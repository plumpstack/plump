/* eslint no-unused-vars: 0 */

import mergeOptions from 'merge-options';
// import { validateInput } from '../util';
import { Subject, Observable } from 'rxjs';
import { PlumpError, NotFoundError } from '../errors';
import {
  IndefiniteModelData,
  ModelData,
  ModelDelta,
  ModelSchema,
  ModelReference,
  BaseStore,
  StorageReadRequest,
  StorageOptions,
  // RelationshipItem,
} from '../dataTypes';

// type: an object that defines the type. typically this will be
// part of the Model class hierarchy, but Storage objects call no methods
// on the type object. We only are interested in Type.$name, Type.$id and Type.$schema.
// Note that Type.$id is the *name of the id field* on instances
//    and NOT the actual id field (e.g., in most cases, Type.$id === 'id').
// id: unique id. Often an integer, but not necessary (could be an oid)

// hasMany relationships are treated like id arrays. So, add / remove / has
// just stores and removes integers.

export abstract class Storage implements BaseStore {
  terminal: boolean;
  inProgress: {
    [key: string]: Promise<ModelData>;
  } = {};
  types: { [type: string]: ModelSchema } = {};
  readSubject = new Subject<ModelData>();
  writeSubject = new Subject<ModelDelta>();
  read$ = this.readSubject.asObservable();
  write$ = this.writeSubject.asObservable();
  // public types: Model[]; TODO: figure this out

  constructor(opts: StorageOptions = {}) {
    // a "terminal" storage facility is the end of the storage chain.
    // usually sql on the server side and rest on the client side, it *must*
    // receive the writes, and is the final authoritative answer on whether
    // something is 404.

    // terminal facilities are also the only ones that can authoritatively answer
    // authorization questions, but the design may allow for authorization to be
    // cached.
    this.terminal = opts.terminal || false;
  }

  abstract readAttributes(value: StorageReadRequest): Promise<ModelData>;
  abstract readRelationship(value: StorageReadRequest): Promise<ModelData>;

  readRelationships(req: StorageReadRequest, relationships: string[]) {
    return Promise.all(
      relationships.map(r =>
        this.readRelationship(Object.assign({}, req, { rel: r }))
      )
    ).then(rA =>
      rA.reduce((a, r) => mergeOptions(a, r || {}), {
        type: req.item.type,
        id: req.item.id,
        attributes: {},
        relationships: {},
      })
    );
  }

  // debounces reads so multiple requests for the same thing return the same promise.
  read(req: StorageReadRequest): Promise<ModelData> {
    const reqKey = `${req.item.type}:${req.item.id} - ${req.fields.join(';')}`;
    if (req.force) {
      return this._read(req);
    } else {
      if (
        this.inProgress[reqKey] === undefined ||
        this.inProgress[reqKey] === null
      ) {
        this.inProgress[reqKey] = this._read(req).then(result => {
          delete this.inProgress[reqKey];
          return result;
        });
      }
      return this.inProgress[reqKey];
    }
  }

  // does the actual read
  _read(req: StorageReadRequest): Promise<ModelData> {
    const schema = this.getSchema(req.item.type);
    return this.readAttributes(req)
      .then(attributes => {
        if (!attributes) {
          return null;
          // throw new NotFoundError();
        } else {
          if (
            attributes.id &&
            attributes.attributes &&
            !attributes.attributes[schema.idAttribute]
          ) {
            attributes.attributes[schema.idAttribute] = attributes.id; // eslint-disable-line no-param-reassign
          }

          // load in default values
          if (attributes.attributes) {
            for (const attrName in schema.attributes) {
              if (
                !attributes.attributes[attrName] &&
                schema.attributes[attrName].default !== undefined
              ) {
                if (Array.isArray(schema.attributes[attrName].default)) {
                  attributes.attributes[attrName] = (schema.attributes[attrName]
                    .default as any[]).concat();
                } else if (
                  typeof schema.attributes[attrName].default === 'object'
                ) {
                  attributes.attributes[attrName] = Object.assign(
                    {},
                    schema.attributes[attrName].default
                  );
                } else {
                  attributes.attributes[attrName] =
                    schema.attributes[attrName].default;
                }
              }
            }
          }

          const relsWanted =
            req.fields.indexOf('relationships') >= 0
              ? Object.keys(schema.relationships)
              : req.fields
                  .map(k => k.split('.'))
                  .filter(ka => ka[0] === 'relationships')
                  .map(ka => ka[1]);
          const relsToFetch = relsWanted.filter(
            relName => !attributes.relationships[relName]
          );
          // readAttributes can return relationship data, so don't fetch those
          if (relsToFetch.length > 0) {
            return this.readRelationships(req, relsToFetch).then(rels => {
              return mergeOptions(attributes, rels);
            });
          } else {
            return attributes;
          }
        }
      })
      .then(result => {
        if (result) {
          Object.keys(result.relationships).forEach(relName => {
            result.relationships[relName].forEach(relItem => {
              relItem.type = this.getSchema(result.type).relationships[
                relName
              ].type.sides[relName].otherType;
            });
          });
          this.fireReadUpdate(result);
        }
        return result;
      });
  }

  hot(item: ModelReference): boolean {
    // t: type, id: id (integer).
    // if hot, then consider this value authoritative, no need to go down
    // the datastore chain. Consider a memorystorage used as a top-level cache.
    // if the memstore has the value, it's hot and up-to-date. OTOH, a
    // localstorage cache may be an out-of-date value (updated since last seen)

    // this design lets hot be set by type and id. In particular, the goal for the
    // front-end is to have profile objects be hot-cached in the memstore, but nothing
    // else (in order to not run the browser out of memory)
    return false;
  }

  validateInput(value: ModelData | IndefiniteModelData): typeof value {
    const schema = this.getSchema(value.type);
    const retVal = {
      type: value.type,
      id: value.id,
      attributes: {},
      relationships: {},
    };
    const typeAttrs = Object.keys(schema.attributes || {});
    const valAttrs = Object.keys(value.attributes || {});
    const typeRels = Object.keys(schema.relationships || {});
    const valRels = Object.keys(value.relationships || {});
    const idAttribute = schema.idAttribute;

    const invalidAttrs = valAttrs.filter(item => typeAttrs.indexOf(item) < 0);
    const invalidRels = valRels.filter(item => typeRels.indexOf(item) < 0);

    if (invalidAttrs.length > 0) {
      throw new Error(
        `Invalid attributes on value object: ${JSON.stringify(invalidAttrs)}`
      );
    }

    if (invalidRels.length > 0) {
      throw new Error(
        `Invalid relationships on value object: ${JSON.stringify(invalidRels)}`
      );
    }

    if (value.attributes[idAttribute] && !retVal.id) {
      retVal.id = value.attributes[idAttribute];
    }

    for (const relName in schema.relationships) {
      if (
        value.relationships &&
        value.relationships[relName] &&
        !Array.isArray(value.relationships[relName])
      ) {
        throw new Error(`relation ${relName} is not an array`);
      }
    }
    return mergeOptions({}, value, retVal);
  }

  // store type info data on the store itself

  getSchema(t: { schema: ModelSchema } | ModelSchema | string): ModelSchema {
    if (typeof t === 'string') {
      return this.types[t];
    } else if (t['schema']) {
      return (t as { schema: ModelSchema }).schema;
    } else {
      return t as ModelSchema;
    }
  }

  addSchema(t: { type: string; schema: ModelSchema }) {
    this.types[t.type] = t.schema;
    return Promise.resolve();
  }

  addSchemas(a: { type: string; schema: ModelSchema }[]): Promise<void> {
    return Promise.all(a.map(t => this.addSchema(t))).then(() => {
      /* noop */
    });
  }

  fireWriteUpdate(val: ModelDelta) {
    this.writeSubject.next(val);
    return Promise.resolve(val);
  }

  fireReadUpdate(val: ModelData) {
    this.readSubject.next(val);
    return Promise.resolve(val);
  }
}
