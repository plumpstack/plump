import { Observable } from 'rxjs';

export interface StringIndexed<T> {
  [index: string]: T;
}

export type Attribute =
  | number
  | string
  | boolean
  | Date
  | string[]
  | number[]
  | any;

export interface RelationshipSchema {
  sides: StringIndexed<{ otherType: string; otherName: string }>;
  extras?: StringIndexed<any>;
  storeData?: {
    sql?: {
      tableName?: string;
      readView?: string;
      writeView?: string;
      joinFields: StringIndexed<string>;
    };
  } & StringIndexed<any>;
}
//
// export interface RelationshipItem {
//   type: string;
//   id: number | string;
//   meta?: StringIndexed<number | string | boolean>;
// }

export interface ReadRequest {
  fields: string[];
  view?: string;
  force?: boolean;
  rel?: string;
}

export interface StorageReadRequest extends ReadRequest {
  item: ModelReference;
}

export interface UntypedRelationshipItem {
  id: number | string;
  type?: string;
  meta?: StringIndexed<number | string | boolean | Date>;
}
export interface TypedRelationshipItem extends UntypedRelationshipItem {
  type: string;
}

export type RelationshipItem = TypedRelationshipItem;

export interface RelationshipDelta {
  op: 'add' | 'modify' | 'remove';
  data: TypedRelationshipItem;
}

export interface StorageOptions {
  terminal?: boolean;
}

export interface BaseStore {
  terminal: boolean;
  read$: Observable<ModelData>;
  write$: Observable<ModelDelta>;
  types: { [type: string]: ModelSchema };
  readRelationship(req: StorageReadRequest): Promise<ModelData>;
  readAttributes(req: StorageReadRequest): Promise<ModelData>;
  getSchema(t: { schema: ModelSchema } | ModelSchema | string): ModelSchema;
  addSchema(t: { type: string; schema: ModelSchema }): Promise<void>;
  addSchemas(t: { type: string; schema: ModelSchema }[]): Promise<void>;
  validateInput(value: ModelData | IndefiniteModelData): typeof value;
  read(req: StorageReadRequest): Promise<ModelData>;
}

export interface CacheStore extends BaseStore {
  cache(value: ModelData): Promise<ModelData>;
  cacheAttributes(value: ModelData): Promise<ModelData>;
  cacheRelationship(value: ModelData): Promise<ModelData>;
  wipe(value: ModelReference, key?: string | string[]): void;
  hot(value: ModelReference): boolean;
}

export interface TerminalStore extends BaseStore {
  writeAttributes(value: IndefiniteModelData): Promise<ModelData>;
  delete(value: ModelReference): Promise<void>;
  fireReadUpdate(val: ModelData);
  fireWriteUpdate(val: ModelDelta);
  writeRelationshipItem(
    value: ModelReference,
    relName: string,
    child: UntypedRelationshipItem,
  ): Promise<ModelData>;
  deleteRelationshipItem(
    value: ModelReference,
    relName: string,
    child: UntypedRelationshipItem,
  ): Promise<ModelData>;
  query(type: string, q?: any): Promise<ModelReference[]>;
}
export interface AllocatingStore extends TerminalStore {
  allocateId(type: string): Promise<string | number>;
}

export interface GenericSchemaFieldSchema {
  type: any;
  default?: any;
  readOnly?: boolean;
}

export interface GenericAttributeFieldSchema extends GenericSchemaFieldSchema {
  type: string;
}

export interface NumberAttributeFieldSchema
  extends GenericAttributeFieldSchema {
  type: 'number';
  default?: number;
}

export interface StringAttributeFieldSchema
  extends GenericAttributeFieldSchema {
  type: 'string';
  default?: string;
}

export interface BooleanAttributeFieldSchema
  extends GenericAttributeFieldSchema {
  type: 'boolean';
  default?: boolean;
}

export interface DateAttributeFieldSchema extends GenericAttributeFieldSchema {
  type: 'date';
  default?: Date;
}

export interface ArrayAttributeFieldSchema extends GenericAttributeFieldSchema {
  type: 'array';
  default?: string[] | number[];
}

export interface ObjectAttributeFieldSchema
  extends GenericAttributeFieldSchema {
  type: 'object';
  default?: object;
}

export interface ReferenceAttributeFieldSchema
  extends GenericAttributeFieldSchema {
  type: 'reference';
  default?: { type: string; id: number };
}

export type AttributeFieldSchema =
  | NumberAttributeFieldSchema
  | StringAttributeFieldSchema
  | BooleanAttributeFieldSchema
  | DateAttributeFieldSchema
  | ArrayAttributeFieldSchema
  | ObjectAttributeFieldSchema
  | ReferenceAttributeFieldSchema;

export interface RelationshipFieldSchema extends GenericSchemaFieldSchema {
  type: RelationshipSchema;
}

export interface ReadOnlyFieldSchema extends GenericSchemaFieldSchema {
  readOnly: true;
}

export type ModelRelationshipsSchema = StringIndexed<RelationshipFieldSchema>;
export type ModelAttributesSchema = StringIndexed<AttributeFieldSchema>;

export interface TableView {
  name: string;
  contains?: string[];
}

export interface ModelSchema {
  idAttribute: string;
  name: string;
  attributes: ModelAttributesSchema;
  relationships: ModelRelationshipsSchema;
  storeData?: StringIndexed<any> & {
    sql?: {
      views: {
        default: TableView;
        [otherView: string]: TableView;
      };
    };
  };
}

export interface ModelReference {
  type: string;
  meta?: any;
  id: number | string;
}

export type ModelAttributes = StringIndexed<Attribute>;
export type ModelRelationships = StringIndexed<TypedRelationshipItem[]>;

export interface Attributed {
  id?: number | string;
  attributes?: ModelAttributes;
  meta?: any;
  type?: string;
}

export interface IndefiniteModelData {
  type: string;
  id?: number | string;
  meta?: any;
  attributes?: ModelAttributes;
  relationships?: ModelRelationships;
  included?: ModelData[];
}

export interface ModelData extends IndefiniteModelData {
  id: number | string;
}

export interface ModelDelta extends ModelData {
  invalidate: string[];
}

export interface DirtyValues {
  attributes?: ModelAttributes;
  relationships?: StringIndexed<RelationshipDelta[]>;
}

export interface DirtyModel extends DirtyValues {
  id?: string | number;
  type: string;
}
