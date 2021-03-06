import mergeOptions from 'merge-options';
import * as deepEqual from 'deep-equal';
import { Observable, Subscription, Observer, Subject, Scheduler } from 'rxjs';

import {
  ModelData,
  ModelDelta,
  ModelSchema,
  DirtyValues,
  DirtyModel,
  UntypedRelationshipItem,
  TypedRelationshipItem,
  RelationshipDelta,
  ReadRequest,
  StorageReadRequest,
  CacheStore,
  StringIndexed,
  TerminalStore,
  Attributed,
} from './dataTypes';

import { Plump, pathExists } from './plump';
import { PlumpError, NotFoundError } from './errors';

// TODO: figure out where error events originate (storage or model)
// and who keeps a roll-backable delta

function condMerge(arg: any[]) {
  const args = arg.filter(v => !!v);
  if (args[0] && args[0].empty && args.length > 1) {
    delete args[0].empty;
  }
  return mergeOptions(...args);
}

export class Model<MD extends ModelData> {
  id: string | number;
  static type = 'BASE';
  static schema: ModelSchema = {
    idAttribute: 'id',
    name: 'BASE',
    attributes: {},
    relationships: {},
  };

  error: PlumpError;

  _write$: Subject<MD> = new Subject<MD>();
  dirty: DirtyValues;
  _dirty$ = new Subject<boolean>();
  dirty$ = this._dirty$.asObservable().startWith(false);

  observableCache: {
    [k: string]: Observable<MD>;
  } = {};

  get type() {
    return this.constructor['type'];
  }

  get schema() {
    return this.constructor['schema'];
  }

  static empty(id: number | string, error?: string) {
    const retVal = {
      id: id,
      type: this.type,
      empty: true,
      error: error,
      attributes: {},
      relationships: {},
    };
    Object.keys(this.schema.attributes).forEach(key => {
      if (this.schema.attributes[key].type === 'number') {
        retVal.attributes[key] = this.schema.attributes[key].default || 0;
      } else if (this.schema.attributes[key].type === 'date') {
        retVal.attributes[key] = new Date(
          (this.schema.attributes[key].default as any) || Date.now(),
        );
      } else if (this.schema.attributes[key].type === 'string') {
        retVal.attributes[key] = this.schema.attributes[key].default || '';
      } else if (this.schema.attributes[key].type === 'object') {
        retVal.attributes[key] = Object.assign(
          {},
          this.schema.attributes[key].default,
        );
      } else if (this.schema.attributes[key].type === 'array') {
        retVal.attributes[key] = (
          (this.schema.attributes[key].default as any[]) || []
        ).concat();
      }
    });
    Object.keys(this.schema.relationships).forEach(key => {
      retVal.relationships[key] = [];
    });
    return retVal;
  }

  empty(id: number | string, error?: string): MD {
    return this.constructor['empty'](id, error);
  }

  dirtyFields() {
    return Object.keys(this.dirty.attributes)
      .filter(k => k !== this.schema.idAttribute)
      .concat(Object.keys(this.dirty.relationships));
  }

  constructor(opts: Attributed, public plump: Plump) {
    this.error = null;
    if (this.type === 'BASE') {
      throw new TypeError(
        'Cannot instantiate base plump Models, please subclass with a schema and valid type',
      );
    }
    let initialValue = opts;
    if (opts.id && !opts.attributes) {
      initialValue = { attributes: { [this.schema.idAttribute]: opts.id } };
    }
    this.dirty = {
      attributes: {}, // Simple key-value
      relationships: {}, // relName: Delta[]
    };
    this.$$copyValuesFrom(initialValue);
    // this.$$fireUpdate(opts);
  }

  $$copyValuesFrom(opts: Attributed = {}): void {
    // const idField = this.constructor.$id in opts ? this.constructor.$id : 'id';
    // this[this.constructor.$id] = opts[idField] || this.id;
    if (
      this.id === undefined &&
      (opts.id || (opts.attributes && opts.attributes[this.schema.idAttribute]))
    ) {
      if (opts.id) {
        this.id = opts.id;
        if (!opts.attributes) {
          opts.attributes = {};
        }
        if (!opts.attributes[this.schema.idAttribute]) {
          opts.attributes[this.schema.idAttribute] = this.id;
        }
      } else if (opts.attributes && opts.attributes[this.schema.idAttribute]) {
        this.id =
          this.schema.attributes[this.schema.idAttribute].type === 'number'
            ? parseInt(opts.attributes[this.schema.idAttribute], 10)
            : opts.attributes[this.schema.idAttribute];
      }
    }
    const sanitized = Object.keys(opts.attributes || {})
      .filter(k => k in this.schema.attributes)
      .map(k => {
        return { [k]: opts.attributes[k] };
      })
      .reduce((acc, curr) => mergeOptions(acc, curr), {});
    this.dirty = mergeOptions(this.dirty, { attributes: sanitized });
  }

  $$resetDirty(): void {
    this.dirty = {
      attributes: {}, // Simple key-value
      relationships: {}, // relName: Delta[]
    };
    this.$$fireUpdate();
  }

  $$fireUpdate(force: boolean = false) {
    if (!this.id || force) {
      this._write$.next({
        attributes: this.dirty.attributes,
        type: this.type,
      } as MD);
    }
    this._dirty$.next(this.dirtyFields().length !== 0);
  }

  get<T extends ModelData>(req: ReadRequest): Promise<T> {
    // If opts is falsy (i.e., undefined), get attributes
    // Otherwise, get what was requested,
    // wrapping the request in a Array if it wasn't already one
    return this.plump
      .get(
        mergeOptions({}, req, {
          item: { id: this.id, type: this.type },
        }),
      )
      .catch((e: PlumpError) => {
        this.error = e;
        return null;
      })
      .then<T>(self => {
        if (!self && this.dirtyFields().length === 0) {
          if (this.id) {
            this.error = new NotFoundError();
          }
          return null;
        } else if (this.dirtyFields().length === 0) {
          return self;
        } else {
          const resolved = Model.resolveAndOverlay(
            this.dirty,
            self || undefined,
          );
          return mergeOptions(
            {},
            self || { id: this.id, type: this.type },
            resolved,
          );
        }
      });
  }

  // TODO: Should $save ultimately return this.get()?

  create(): Promise<MD> {
    return this.save({ stripId: false });
  }

  save(opts: any = { stripId: true }): Promise<MD> {
    const update: DirtyModel = mergeOptions(
      { id: this.id, type: this.type },
      this.dirty,
    );
    if (
      Object.keys(this.dirty.attributes).length +
        Object.keys(this.dirty.relationships).length >
      0
    ) {
      return this.plump
        .save(update, opts)
        .then<MD>((updated: MD) => {
          this.$$resetDirty();
          if (updated.id) {
            this.id = updated.id;
          }
          return this.get({ fields: ['attributes', 'relationships'] });
        })
        .catch(err => {
          throw err;
        });
    } else {
      return Promise.resolve<MD>(null);
    }
  }

  set(update): this {
    const wide = update.attributes || update;
    this.$$copyValuesFrom({ attributes: wide });
    this.$$fireUpdate();
    return this;
  }

  parseOpts(opts: ReadRequest | string | string[]): StorageReadRequest {
    if (Array.isArray(opts) || typeof opts === 'string') {
      let fields = Array.isArray(opts) ? opts.concat() : [opts];
      if (fields.indexOf('relationships') >= 0) {
        fields.splice(fields.indexOf('relationships'), 1);
        fields = fields.concat(
          Object.keys(this.schema.relationships).map(k => `relationships.${k}`),
        );
      }
      return {
        fields: fields,
        item: {
          id: this.id,
          type: this.type,
        },
        view: 'default',
      };
    } else {
      return Object.assign({}, opts, {
        item: {
          id: this.id,
          type: this.type,
        },
      });
    }
  }

  stringifyRequest(opts: ReadRequest) {
    return [opts.view || 'default']
      .concat(opts.fields.sort((a, b) => a.localeCompare(b)))
      .join(':');
  }

  asObservable(opts?: ReadRequest | string | string[]): Observable<MD> {
    const readReq = this.parseOpts(
      opts || { fields: ['attributes', 'relationships'] },
    );
    const reqKey = this.stringifyRequest(readReq);
    if (!this.observableCache[reqKey]) {
      const colds = this.plump.caches.filter(s => !s.hot(this));

      // THIS IS A MEMORY LEAK - temporarily here for perf testing

      if (!this.plump.readCache[`${this.type}:${this.id}`]) {
        this.plump.readCache[
          `${this.type}:${this.id}`
        ] = this.plump.terminal.write$
          .filter((v: ModelDelta) => {
            return (
              v.type === this.type && v.id === this.id // && v.invalidate.some(i => fields.indexOf(i) >= 0)
            );
          })
          // .startWith({
          //   id: this.id,
          //   type: this.type,
          //   invalidate: ['attributes', 'relationships'],
          // })
          .flatMap(v =>
            Observable.fromPromise(
              this.get({
                fields: v.invalidate,
              }).then(v => {
                if (v) {
                  return v;
                } else {
                  this.error = this.error || new NotFoundError();
                  return this.empty(this.id, 'not found');
                }
              }),
            ),
          )
          .publishReplay(1)
          .refCount();
      }
      // don't want to fetch extra stuff if we don't want it
      const firstRead$ = Observable.fromPromise(
        this.get(readReq).then(v => {
          if (v) {
            return v;
          } else {
            this.error = this.error || new NotFoundError();
            return this.empty(this.id, 'not found');
          }
        }),
      );

      const read$ = Observable.merge(
        firstRead$,
        this.plump.readCache[`${this.type}:${this.id}`],
      );

      const cold$: Observable<ModelData> = Observable.fromPromise(
        Promise.all(colds.map(h => h.read(readReq))).then(results =>
          condMerge(results),
        ),
      ).takeUntil(read$);

      this.observableCache[reqKey] = Observable.merge(
        read$,
        cold$,
        this._write$.asObservable(),
      )
        .scan((acc, curr) => {
          const rv = condMerge([acc, curr]);
          rv.relationships = Model.resolveRelationships(
            this.dirty.relationships,
            rv.relationships,
          );
          return rv;
        }, this.empty(this.id))
        .catch(err => Observable.of(this.empty(this.id, err)))
        .distinctUntilChanged(deepEqual)
        .publishReplay(1)
        .refCount() as Observable<MD>;
    }
    return this.observableCache[reqKey];
  }

  delete() {
    return this.plump.delete(this);
  }

  add(key: string, item: UntypedRelationshipItem): this {
    const toAdd: TypedRelationshipItem = Object.assign(
      {},
      { type: this.schema.relationships[key].type.sides[key].otherType },
      item,
    );
    if (key in this.schema.relationships) {
      if (item.id >= 1) {
        if (this.dirty.relationships[key] === undefined) {
          this.dirty.relationships[key] = [];
        }

        this.dirty.relationships[key].push({
          op: 'add',
          data: toAdd,
        });
        this.$$fireUpdate(true);
        return this;
      } else {
        throw new Error('Invalid item added to hasMany');
      }
    } else {
      throw new Error('Cannot $add except to hasMany field');
    }
  }

  modifyRelationship(key: string, item: UntypedRelationshipItem): this {
    const toAdd: TypedRelationshipItem = Object.assign(
      {},
      { type: this.schema.relationships[key].type.sides[key].otherType },
      item,
    );
    if (key in this.schema.relationships) {
      if (item.id >= 1) {
        this.dirty.relationships[key] = this.dirty.relationships[key] || [];
        this.dirty.relationships[key].push({
          op: 'modify',
          data: toAdd,
        });
        this.$$fireUpdate(true);
        return this;
      } else {
        throw new Error('Invalid item added to hasMany');
      }
    } else {
      throw new Error('Cannot $add except to hasMany field');
    }
  }

  remove(key: string, item: UntypedRelationshipItem): this {
    const toAdd: TypedRelationshipItem = Object.assign(
      {},
      { type: this.schema.relationships[key].type.sides[key].otherType },
      item,
    );
    if (key in this.schema.relationships) {
      if (item.id >= 1) {
        if (!(key in this.dirty.relationships)) {
          this.dirty.relationships[key] = [];
        }
        this.dirty.relationships[key].push({
          op: 'remove',
          data: toAdd,
        });
        this.$$fireUpdate(true);
        return this;
      } else {
        throw new Error('Invalid item $removed from hasMany');
      }
    } else {
      throw new Error('Cannot $remove except from hasMany field');
    }
  }

  static applyDelta(current, delta) {
    if (delta.op === 'add' || delta.op === 'modify') {
      const retVal = mergeOptions({}, current, delta.data);
      return retVal;
    } else if (delta.op === 'remove') {
      return undefined;
    } else {
      return current;
    }
  }

  static resolveAndOverlay(
    update,
    base: { attributes?: any; relationships?: any } = {
      attributes: {},
      relationships: {},
    },
  ) {
    const attributes = mergeOptions({}, base.attributes, update.attributes);
    const resolvedRelationships = this.resolveRelationships(
      update.relationships,
      base.relationships,
    );
    return { attributes, relationships: resolvedRelationships };
  }

  static resolveRelationships(
    deltas: StringIndexed<RelationshipDelta[]>,
    base: StringIndexed<TypedRelationshipItem[]> = {},
  ) {
    const updates = Object.keys(deltas)
      .map(relName => {
        const resolved = this.resolveRelationship(
          deltas[relName],
          base[relName],
        );
        return { [relName]: resolved };
      })
      .reduce((acc, curr) => mergeOptions(acc, curr), {});
    return mergeOptions({}, base, updates);
  }

  static resolveRelationship(
    deltas: RelationshipDelta[],
    base: TypedRelationshipItem[] = [],
  ) {
    const retVal = base.concat();
    deltas.forEach(delta => {
      if (delta.op === 'add' || delta.op === 'modify') {
        const currentIndex = retVal.findIndex(v => v.id === delta.data.id);
        if (currentIndex >= 0) {
          retVal[currentIndex] = delta.data;
        } else {
          retVal.push(delta.data);
        }
      } else if (delta.op === 'remove') {
        const currentIndex = retVal.findIndex(v => v.id === delta.data.id);
        if (currentIndex >= 0) {
          retVal.splice(currentIndex, 1);
        }
      }
    });
    return retVal;
  }
}
