import { Model } from '../model';
import { Relationship } from '../relationship';

export class TestType extends Model {}

export class Children extends Relationship {}
export class ValenceChildren extends Relationship {}

Children.$name = 'children';
Children.$sides = {
  parents: {
    self: {
      field: 'child_id',
      type: 'tests',
    },
    other: {
      field: 'parent_id',
      type: 'tests',
      title: 'children',
    },
  },
  children: {
    self: {
      field: 'parent_id',
      type: 'tests',
    },
    other: {
      field: 'child_id',
      type: 'tests',
      title: 'parents',
    },
  },
};


ValenceChildren.$sides = {
  valenceParents: {
    self: {
      field: 'child_id',
      type: 'tests',
    },
    other: {
      field: 'parent_id',
      type: 'tests',
      title: 'valenceChildren',
    },
  },
  valenceChildren: {
    self: {
      field: 'parent_id',
      type: 'tests',
    },
    other: {
      field: 'child_id',
      type: 'tests',
      title: 'valenceParents',
    },
  },
};

ValenceChildren.$extras = ['perm'];
ValenceChildren.$name = 'valence_children';

TestType.$name = 'tests';
TestType.$id = 'id';
TestType.$fields = {
  id: {
    type: 'number',
  },
  name: {
    type: 'string',
  },
  extended: {
    type: 'object',
  },
  children: {
    type: 'hasMany',
    relationship: Children,
    field: 'parent_id',
    otherSide: 'parents',
  },
  valenceChildren: {
    type: 'hasMany',
    relationship: ValenceChildren,
    field: 'parent_id',
    otherSide: 'valenceParents',
  },
  parents: {
    type: 'hasMany',
    relationship: Children,
    field: 'child_id',
    otherSide: 'children',
  },
  valenceParents: {
    type: 'hasMany',
    relationship: ValenceChildren,
    field: 'child_id',
    otherSide: 'valenceChildren',
  },
};