import mergeOptions from 'merge-options';

import { Storage } from './storage';
import {
  IndefiniteModelData,
  ModelData,
  ModelReference,
  StorageReadRequest,
  ModelSchema,
  RelationshipItem,
  TerminalStore,
  CacheStore,
  AllocatingStore,
} from '../dataTypes';

function saneNumber(i) {
  return (
    typeof i === 'number' && !isNaN(i) && i !== Infinity && i !== -Infinity
  );
}

// declare function parseInt(n: string | number, radix: number): number;

export abstract class KeyValueStore extends Storage
  implements TerminalStore, CacheStore, AllocatingStore {
  maxKeys: { [type: string]: number } = {};

  abstract _keys(type: string): Promise<string[]>;
  abstract _get(k: string): Promise<ModelData | null>;
  abstract _set(k: string, v: ModelData): Promise<ModelData>;
  abstract _del(k: string): Promise<ModelData>;

  allocateId(type: string) {
    this.maxKeys[type] = this.maxKeys[type] + 1;
    return Promise.resolve(this.maxKeys[type]);
  }

  writeAttributes(inputValue: IndefiniteModelData) {
    const value = this.validateInput(inputValue);
    delete value.relationships;
    // trim out relationships for a direct write.
    return Promise.resolve()
      .then(() => {
        const idAttribute = this.getSchema(inputValue.type).idAttribute;
        if (value.id === undefined || value.id === null) {
          if (!this.terminal) {
            throw new Error(
              'Cannot create new content in a non-terminal store',
            );
          }
          return this.allocateId(value.type).then(n => {
            return mergeOptions({}, value, {
              id: n,
              relationships: {},
              attributes: { [idAttribute]: n },
            }) as ModelData; // if new.
          });
        } else {
          // if not new, get current (including relationships) and merge
          const thisId =
            typeof value.id === 'string' ? parseInt(value.id, 10) : value.id;
          if (saneNumber(thisId) && thisId > this.maxKeys[value.type]) {
            this.maxKeys[value.type] = thisId;
          }
          return this._get(this.keyString(value as ModelReference)).then(
            current => {
              if (current) {
                return mergeOptions({}, current, value);
              } else {
                return mergeOptions(
                  { relationships: {}, attributes: {} },
                  value,
                );
              }
            },
          );
        }
      })
      .then((toSave: ModelData) => {
        return this._set(this.keyString(toSave), toSave).then(() => {
          this.fireWriteUpdate(
            Object.assign({}, toSave, { invalidate: ['attributes'] }),
          );
          return toSave;
        });
      });
  }

  readAttributes(req: StorageReadRequest): Promise<ModelData> {
    return this._get(this.keyString(req.item)).then(d => {
      if (d && d.attributes && Object.keys(d.attributes).length > 0) {
        return d;
      } else {
        return null;
      }
    });
  }

  cache(value: ModelData) {
    if (value.id === undefined || value.id === null) {
      return Promise.reject(
        'Cannot cache data without an id - write it to a terminal first',
      );
    } else {
      return this._get(this.keyString(value)).then(current => {
        const newVal = mergeOptions(current || {}, value);
        return this._set(this.keyString(value), newVal);
      });
    }
  }

  cacheAttributes(value: ModelData) {
    if (value.id === undefined || value.id === null) {
      return Promise.reject(
        'Cannot cache data without an id - write it to a terminal first',
      );
    } else {
      return this._get(this.keyString(value)).then(current => {
        return this._set(this.keyString(value), {
          type: value.type,
          id: value.id,
          attributes: value.attributes,
          relationships: current.relationships || {},
        });
      });
    }
  }

  cacheRelationship(value: ModelData) {
    if (value.id === undefined || value.id === null) {
      return Promise.reject(
        'Cannot cache data without an id - write it to a terminal first',
      );
    } else {
      return this._get(this.keyString(value)).then(current => {
        return this._set(this.keyString(value), {
          type: value.type,
          id: value.id,
          attributes: current.attributes || {},
          relationships: value.relationships,
        });
      });
    }
  }

  readRelationship(req: StorageReadRequest): Promise<ModelData> {
    return this._get(this.keyString(req.item)).then(v => {
      const retVal = Object.assign({}, v);
      if (!v) {
        if (this.terminal) {
          return {
            type: req.item.type,
            id: req.item.id,
            relationships: { [req.rel]: [] },
          };
        } else {
          return null;
        }
      } else if (!v.relationships && this.terminal) {
        retVal.relationships = { [req.rel]: [] };
      } else if (!retVal.relationships[req.rel] && this.terminal) {
        retVal.relationships[req.rel] = [];
      }
      return retVal;
    });
  }

  delete(value: ModelReference) {
    return this._del(this.keyString(value)).then(() => {
      if (this.terminal) {
        this.fireWriteUpdate({
          id: value.id,
          type: value.type,
          invalidate: ['attributes', 'relationships'],
        });
      }
    });
  }

  wipe(value: ModelReference, field: string) {
    const ks = this.keyString(value);
    return this._get(ks).then(val => {
      if (val === null) {
        return null;
      }
      const newVal = Object.assign({}, val);
      if (field === 'attributes') {
        delete newVal.attributes;
      } else if (field === 'relationships') {
        delete newVal.relationships;
      } else if (field.indexOf('relationships.') === 0) {
        delete newVal.relationships[field.split('.')[1]];
        if (Object.keys(newVal.relationships).length === 0) {
          delete newVal.relationships;
        }
      } else {
        throw new Error(`Cannot delete field ${field} - unknown format`);
      }
      return this._set(ks, newVal);
    });
  }

  writeRelationshipItem(
    value: ModelReference,
    relName: string,
    child: RelationshipItem,
  ) {
    const schema = this.getSchema(value.type);
    const relSchema = schema.relationships[relName].type;
    const otherRelType = relSchema.sides[relName].otherType;
    const otherRelName = relSchema.sides[relName].otherName;
    const thisKeyString = this.keyString(value);
    const otherKeyString = this.keyString({ type: otherRelType, id: child.id });
    return Promise.all([
      this._get(thisKeyString),
      this._get(otherKeyString),
    ]).then(([thisItemResolved, otherItemResolved]) => {
      let thisItem = thisItemResolved;
      if (!thisItem) {
        thisItem = {
          id: child.id,
          type: otherRelType,
          attributes: {},
          relationships: {},
        };
      }
      let otherItem = otherItemResolved;
      if (!otherItem) {
        otherItem = {
          id: child.id,
          type: otherRelType,
          attributes: {},
          relationships: {},
        };
      }
      const newChild: RelationshipItem = { id: child.id, type: otherRelType };
      const newParent: RelationshipItem = { id: value.id, type: value.type };
      if (!thisItem.relationships) {
        thisItem.relationships = {};
      }
      if (!thisItem.relationships[relName]) {
        thisItem.relationships[relName] = [];
      }
      if (!otherItem.relationships) {
        otherItem.relationships = {};
      }
      if (!otherItem.relationships[otherRelName]) {
        otherItem.relationships[otherRelName] = [];
      }
      if (relSchema.extras && child.meta) {
        newParent.meta = {};
        newChild.meta = {};
        for (const extra in child.meta) {
          if (extra in relSchema.extras) {
            newChild.meta[extra] = child.meta[extra];
            newParent.meta[extra] = child.meta[extra];
          }
        }
      }

      const thisIdx = thisItem.relationships[relName].findIndex(
        item => item.id === child.id,
      );
      const otherIdx = otherItem.relationships[otherRelName].findIndex(
        item => item.id === value.id,
      );
      if (thisIdx < 0) {
        thisItem.relationships[relName].push(newChild);
      } else {
        thisItem.relationships[relName][thisIdx] = newChild;
      }
      if (otherIdx < 0) {
        otherItem.relationships[otherRelName].push(newParent);
      } else {
        otherItem.relationships[otherRelName][otherIdx] = newParent;
      }

      return Promise.all([
        this._set(this.keyString(thisItem), thisItem),
        this._set(this.keyString(otherItem), otherItem),
      ])
        .then(() => {
          this.fireWriteUpdate(
            Object.assign(thisItem, {
              invalidate: [`relationships.${relName}`],
            }),
          );
          this.fireWriteUpdate(
            Object.assign(otherItem, {
              invalidate: [`relationships.${otherRelName}`],
            }),
          );
        })
        .then(() => thisItem);
    });
  }

  deleteRelationshipItem(
    value: ModelReference,
    relName: string,
    child: RelationshipItem,
  ) {
    const schema = this.getSchema(value.type);
    const relSchema = schema.relationships[relName].type;
    const otherRelType = relSchema.sides[relName].otherType;
    const otherRelName = relSchema.sides[relName].otherName;
    const thisKeyString = this.keyString(value);
    const otherKeyString = this.keyString({ type: otherRelType, id: child.id });
    return Promise.all([
      this._get(thisKeyString),
      this._get(otherKeyString),
    ]).then(([thisItem, otherItem]) => {
      if (!thisItem.relationships[relName]) {
        thisItem.relationships[relName] = [];
      }
      if (!otherItem.relationships[otherRelName]) {
        otherItem.relationships[otherRelName] = [];
      }
      const thisIdx = thisItem.relationships[relName].findIndex(
        item => item.id === child.id,
      );
      const otherIdx = otherItem.relationships[otherRelName].findIndex(
        item => item.id === value.id,
      );
      if (thisIdx >= 0) {
        thisItem.relationships[relName].splice(thisIdx, 1);
      }
      if (otherIdx >= 0) {
        otherItem.relationships[otherRelName].splice(otherIdx, 1);
      }

      return Promise.all([
        this._set(this.keyString(thisItem), thisItem),
        this._set(this.keyString(otherItem), otherItem),
      ])
        .then(() => {
          this.fireWriteUpdate(
            Object.assign(thisItem, {
              invalidate: [`relationships.${relName}`],
            }),
          );
          this.fireWriteUpdate(
            Object.assign(otherItem, {
              invalidate: [`relationships.${otherRelName}`],
            }),
          );
        })
        .then(() => thisItem);
    });
  }

  query(t: string, q?: any): Promise<ModelReference[]> {
    return this._keys(t).then(keys => {
      return keys
        .map(k => {
          return {
            type: t,
            id: parseInt(k.split(':')[1], 10),
          };
        })
        .filter(v => !isNaN(v.id));
    });
  }

  addSchema(t: { type: string; schema: ModelSchema }) {
    return super.addSchema(t).then(() => {
      this.maxKeys[t.type] = 0;
    });
  }

  keyString(value: ModelReference) {
    return `${value.type}:${value.id}`;
  }
}
