"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var mergeOptions = require("merge-options");
var storage_1 = require("./storage");
var ModifiableKeyValueStore = (function (_super) {
    __extends(ModifiableKeyValueStore, _super);
    function ModifiableKeyValueStore() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.maxKeys = {};
        return _this;
    }
    ModifiableKeyValueStore.prototype.allocateId = function (typeName) {
        this.maxKeys[typeName] = this.maxKeys[typeName] + 1;
        return Promise.resolve(this.maxKeys[typeName]);
    };
    ModifiableKeyValueStore.prototype.writeAttributes = function (inputValue) {
        var _this = this;
        var value = this.validateInput(inputValue);
        delete value.relationships;
        return Promise.resolve()
            .then(function () {
            if ((value.id === undefined) || (value.id === null)) {
                if (!_this.terminal) {
                    throw new Error('Cannot create new content in a non-terminal store');
                }
                return _this.allocateId(value.typeName)
                    .then(function (n) {
                    return mergeOptions({}, value, { id: n, relationships: {} });
                });
            }
            else {
                return value;
            }
        })
            .then(function (toSave) {
            return _this._upsert(toSave)
                .then(function () {
                _this.fireWriteUpdate(Object.assign({}, toSave, { invalidate: ['attributes'] }));
                return toSave;
            });
        });
    };
    ModifiableKeyValueStore.prototype.readAttributes = function (value) {
        return this._get(value)
            .then(function (d) {
            if (d && d.attributes && Object.keys(d.attributes).length > 0) {
                return d;
            }
            else {
                return null;
            }
        });
    };
    ModifiableKeyValueStore.prototype.cache = function (value) {
        var _this = this;
        if ((value.id === undefined) || (value.id === null)) {
            return Promise.reject('Cannot cache data without an id - write it to a terminal first');
        }
        else {
            return this._get(value)
                .then(function (current) {
                var newVal = mergeOptions(current || {}, value);
                return _this._upsert(newVal);
            });
        }
    };
    ModifiableKeyValueStore.prototype.cacheAttributes = function (value) {
        var _this = this;
        if ((value.id === undefined) || (value.id === null)) {
            return Promise.reject('Cannot cache data without an id - write it to a terminal first');
        }
        else {
            return this._get(value)
                .then(function (current) {
                return _this._upsert({
                    typeName: value.typeName,
                    id: value.id,
                    attributes: value.attributes,
                    relationships: current.relationships || {},
                });
            });
        }
    };
    ModifiableKeyValueStore.prototype.cacheRelationship = function (value) {
        var _this = this;
        if ((value.id === undefined) || (value.id === null)) {
            return Promise.reject('Cannot cache data without an id - write it to a terminal first');
        }
        else {
            return this._get(value)
                .then(function (current) {
                return _this._upsert({
                    typeName: value.typeName,
                    id: value.id,
                    attributes: current.attributes || {},
                    relationships: value.relationships,
                });
            });
        }
    };
    ModifiableKeyValueStore.prototype.readRelationship = function (value, relName) {
        var _this = this;
        return this._get(value)
            .then(function (v) {
            var retVal = Object.assign({}, v);
            if (!v) {
                if (_this.terminal) {
                    return { typeName: value.typeName, id: value.id, relationships: (_a = {}, _a[relName] = [], _a) };
                }
                else {
                    return null;
                }
            }
            else if (!v.relationships && _this.terminal) {
                retVal.relationships = (_b = {}, _b[relName] = [], _b);
            }
            else if (!retVal.relationships[relName] && _this.terminal) {
                retVal.relationships[relName] = [];
            }
            return retVal;
            var _a, _b;
        });
    };
    ModifiableKeyValueStore.prototype.delete = function (value) {
        var _this = this;
        return this._del(value, ['attributes', 'relationships'])
            .then(function () {
            if (_this.terminal) {
                _this.fireWriteUpdate({ id: value.id, typeName: value.typeName, invalidate: ['attributes', 'relationships'] });
            }
        });
    };
    ModifiableKeyValueStore.prototype.wipe = function (value, field) {
        return this._del(value, [field]);
    };
    ModifiableKeyValueStore.prototype.writeRelationshipItem = function (value, relName, child) {
        var _this = this;
        var schema = this.getSchema(value.typeName);
        var relSchema = schema.relationships[relName].type;
        var otherRelType = relSchema.sides[relName].otherType;
        var otherRelName = relSchema.sides[relName].otherName;
        var otherReference = { typeName: otherRelType, id: child.id };
        var newChild = { id: child.id };
        var newParent = { id: value.id };
        if (relSchema.extras && child.meta) {
            newParent.meta = {};
            newChild.meta = {};
            for (var extra in child.meta) {
                if (extra in relSchema.extras) {
                    newChild.meta[extra] = child.meta[extra];
                    newParent.meta[extra] = child.meta[extra];
                }
            }
        }
        return Promise.all([
            this._updateArray(value, relName, newChild),
            this._updateArray(otherReference, otherRelName, newParent)
        ])
            .then(function () {
            _this.fireWriteUpdate(Object.assign(value, { invalidate: ["relationships." + relName] }));
            _this.fireWriteUpdate(Object.assign({ typeName: otherRelType, id: child.id }, { invalidate: ["relationships." + otherRelName] }));
        })
            .then(function () { return value; });
    };
    ModifiableKeyValueStore.prototype.deleteRelationshipItem = function (value, relName, child) {
        var _this = this;
        var schema = this.getSchema(value.typeName);
        var relSchema = schema.relationships[relName].type;
        var otherRelType = relSchema.sides[relName].otherType;
        var otherRelName = relSchema.sides[relName].otherName;
        var otherReference = { typeName: otherRelType, id: child.id };
        var newChild = { id: child.id };
        var newParent = { id: value.id };
        if (relSchema.extras && child.meta) {
            newParent.meta = {};
            newChild.meta = {};
            for (var extra in child.meta) {
                if (extra in relSchema.extras) {
                    newChild.meta[extra] = child.meta[extra];
                    newParent.meta[extra] = child.meta[extra];
                }
            }
        }
        return Promise.all([
            this._removeFromArray(value, relName, newChild),
            this._removeFromArray(otherReference, otherRelName, newParent)
        ])
            .then(function () {
            _this.fireWriteUpdate(Object.assign(value, { invalidate: ["relationships." + relName] }));
            _this.fireWriteUpdate(Object.assign({ typeName: otherRelType, id: child.id }, { invalidate: ["relationships." + otherRelName] }));
        })
            .then(function () { return value; });
    };
    ModifiableKeyValueStore.prototype.query = function (t) {
        return this._keys(t)
            .then(function (keys) {
            return keys.map(function (k) {
                return {
                    typeName: t,
                    id: parseInt(k.split(':')[1], 10),
                };
            }).filter(function (v) { return !isNaN(v.id); });
        });
    };
    ModifiableKeyValueStore.prototype.addSchema = function (t) {
        var _this = this;
        return _super.prototype.addSchema.call(this, t)
            .then(function () {
            _this.maxKeys[t.typeName] = 0;
        });
    };
    ModifiableKeyValueStore.prototype.keyString = function (value) {
        return value.typeName + ":" + value.id;
    };
    return ModifiableKeyValueStore;
}(storage_1.Storage));
exports.ModifiableKeyValueStore = ModifiableKeyValueStore;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9zdG9yYWdlL21vZGlmaWFibGVLZXlWYWx1ZVN0b3JlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7OztBQUFBLDRDQUE4QztBQUU5QyxxQ0FBb0M7QUFjcEM7SUFBc0QsMkNBQU87SUFBN0Q7UUFBQSxxRUFtTkM7UUFsTlcsYUFBTyxHQUFtQyxFQUFFLENBQUM7O0lBa056RCxDQUFDO0lBek1DLDRDQUFVLEdBQVYsVUFBVyxRQUFnQjtRQUN6QixJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3BELE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztJQUNqRCxDQUFDO0lBRUQsaURBQWUsR0FBZixVQUFnQixVQUErQjtRQUEvQyxpQkF5QkM7UUF4QkMsSUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUM3QyxPQUFPLEtBQUssQ0FBQyxhQUFhLENBQUM7UUFFM0IsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUU7YUFDdkIsSUFBSSxDQUFDO1lBQ0osRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsRUFBRSxLQUFLLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3BELEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7b0JBQ25CLE1BQU0sSUFBSSxLQUFLLENBQUMsbURBQW1ELENBQUMsQ0FBQztnQkFDdkUsQ0FBQztnQkFDRCxNQUFNLENBQUMsS0FBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDO3FCQUNyQyxJQUFJLENBQUMsVUFBQyxDQUFDO29CQUNOLE1BQU0sQ0FBQyxZQUFZLENBQUMsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsYUFBYSxFQUFFLEVBQUUsRUFBRSxDQUFjLENBQUM7Z0JBQzVFLENBQUMsQ0FBQyxDQUFDO1lBQ0wsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNOLE1BQU0sQ0FBQyxLQUFrQixDQUFDO1lBQzVCLENBQUM7UUFDSCxDQUFDLENBQUM7YUFDRCxJQUFJLENBQUMsVUFBQyxNQUFpQjtZQUN0QixNQUFNLENBQUMsS0FBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUM7aUJBQzFCLElBQUksQ0FBQztnQkFDSixLQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLE1BQU0sRUFBRSxFQUFFLFVBQVUsRUFBRSxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUNoRixNQUFNLENBQUMsTUFBTSxDQUFDO1lBQ2hCLENBQUMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsZ0RBQWMsR0FBZCxVQUFlLEtBQXFCO1FBQ2xDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQzthQUN0QixJQUFJLENBQUMsVUFBQSxDQUFDO1lBQ0wsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxVQUFVLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzlELE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDWCxDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ04sTUFBTSxDQUFDLElBQUksQ0FBQztZQUNkLENBQUM7UUFDSCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRCx1Q0FBSyxHQUFMLFVBQU0sS0FBZ0I7UUFBdEIsaUJBVUM7UUFUQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxFQUFFLEtBQUssU0FBUyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNwRCxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxnRUFBZ0UsQ0FBQyxDQUFDO1FBQzFGLENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNOLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQztpQkFDdEIsSUFBSSxDQUFDLFVBQUMsT0FBTztnQkFDWixJQUFNLE1BQU0sR0FBRyxZQUFZLENBQUMsT0FBTyxJQUFJLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztnQkFDbEQsTUFBTSxDQUFDLEtBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDOUIsQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDO0lBQ0gsQ0FBQztJQUVELGlEQUFlLEdBQWYsVUFBZ0IsS0FBZ0I7UUFBaEMsaUJBY0M7UUFiQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxFQUFFLEtBQUssU0FBUyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNwRCxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxnRUFBZ0UsQ0FBQyxDQUFDO1FBQzFGLENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNOLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQztpQkFDdEIsSUFBSSxDQUFDLFVBQUMsT0FBTztnQkFDWixNQUFNLENBQUMsS0FBSSxDQUFDLE9BQU8sQ0FBQztvQkFDbEIsUUFBUSxFQUFFLEtBQUssQ0FBQyxRQUFRO29CQUN4QixFQUFFLEVBQUUsS0FBSyxDQUFDLEVBQUU7b0JBQ1osVUFBVSxFQUFFLEtBQUssQ0FBQyxVQUFVO29CQUM1QixhQUFhLEVBQUUsT0FBTyxDQUFDLGFBQWEsSUFBSSxFQUFFO2lCQUMzQyxDQUFDLENBQUM7WUFDTCxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUM7SUFDSCxDQUFDO0lBRUQsbURBQWlCLEdBQWpCLFVBQWtCLEtBQWdCO1FBQWxDLGlCQWNDO1FBYkMsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsRUFBRSxLQUFLLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEQsTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsZ0VBQWdFLENBQUMsQ0FBQztRQUMxRixDQUFDO1FBQUMsSUFBSSxDQUFDLENBQUM7WUFDTixNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUM7aUJBQ3RCLElBQUksQ0FBQyxVQUFDLE9BQU87Z0JBQ1osTUFBTSxDQUFDLEtBQUksQ0FBQyxPQUFPLENBQUM7b0JBQ2xCLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUTtvQkFDeEIsRUFBRSxFQUFFLEtBQUssQ0FBQyxFQUFFO29CQUNaLFVBQVUsRUFBRSxPQUFPLENBQUMsVUFBVSxJQUFJLEVBQUU7b0JBQ3BDLGFBQWEsRUFBRSxLQUFLLENBQUMsYUFBYTtpQkFDbkMsQ0FBQyxDQUFDO1lBQ0wsQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDO0lBQ0gsQ0FBQztJQUVELGtEQUFnQixHQUFoQixVQUFpQixLQUFxQixFQUFFLE9BQWU7UUFBdkQsaUJBaUJDO1FBaEJDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQzthQUN0QixJQUFJLENBQUMsVUFBQyxDQUFDO1lBQ04sSUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDcEMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNQLEVBQUUsQ0FBQyxDQUFDLEtBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO29CQUNsQixNQUFNLENBQUMsRUFBRSxRQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVEsRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLEVBQUUsRUFBRSxhQUFhLFlBQUksR0FBQyxPQUFPLElBQUcsRUFBRSxLQUFFLEVBQUUsQ0FBQztnQkFDdEYsQ0FBQztnQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFDTixNQUFNLENBQUMsSUFBSSxDQUFDO2dCQUNkLENBQUM7WUFDSCxDQUFDO1lBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLGFBQWEsSUFBSSxLQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztnQkFDN0MsTUFBTSxDQUFDLGFBQWEsYUFBSyxHQUFDLE9BQU8sSUFBRyxFQUFFLEtBQUUsQ0FBQztZQUMzQyxDQUFDO1lBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsSUFBSSxLQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztnQkFDM0QsTUFBTSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDckMsQ0FBQztZQUNELE1BQU0sQ0FBQyxNQUFNLENBQUM7O1FBQ2hCLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELHdDQUFNLEdBQU4sVUFBTyxLQUFxQjtRQUE1QixpQkFPQztRQU5DLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDLFlBQVksRUFBRSxlQUFlLENBQUMsQ0FBQzthQUN2RCxJQUFJLENBQUM7WUFDSixFQUFFLENBQUMsQ0FBQyxLQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztnQkFDbEIsS0FBSSxDQUFDLGVBQWUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsRUFBRSxFQUFFLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUSxFQUFFLFVBQVUsRUFBRSxDQUFDLFlBQVksRUFBRSxlQUFlLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDaEgsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELHNDQUFJLEdBQUosVUFBSyxLQUFxQixFQUFFLEtBQWE7UUFDdkMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUNuQyxDQUFDO0lBRUQsdURBQXFCLEdBQXJCLFVBQXNCLEtBQXFCLEVBQUUsT0FBZSxFQUFFLEtBQXVCO1FBQXJGLGlCQTRCQztRQTNCQyxJQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM5QyxJQUFNLFNBQVMsR0FBRyxNQUFNLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQztRQUNyRCxJQUFNLFlBQVksR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUN4RCxJQUFNLFlBQVksR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUN4RCxJQUFNLGNBQWMsR0FBRyxFQUFFLFFBQVEsRUFBRSxZQUFZLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUVoRSxJQUFNLFFBQVEsR0FBcUIsRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ3BELElBQU0sU0FBUyxHQUFxQixFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDckQsRUFBRSxDQUFDLENBQUMsU0FBUyxDQUFDLE1BQU0sSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUNuQyxTQUFTLENBQUMsSUFBSSxHQUFHLEVBQUUsQ0FBQztZQUNwQixRQUFRLENBQUMsSUFBSSxHQUFHLEVBQUUsQ0FBQztZQUNuQixHQUFHLENBQUMsQ0FBQyxJQUFNLEtBQUssSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDL0IsRUFBRSxDQUFDLENBQUMsS0FBSyxJQUFJLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO29CQUM5QixRQUFRLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQ3pDLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDNUMsQ0FBQztZQUNILENBQUM7UUFDSCxDQUFDO1FBQ0QsTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUM7WUFDakIsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLFFBQVEsQ0FBQztZQUMzQyxJQUFJLENBQUMsWUFBWSxDQUFDLGNBQWMsRUFBRSxZQUFZLEVBQUUsU0FBUyxDQUFDO1NBQzNELENBQUM7YUFDRCxJQUFJLENBQUM7WUFDSixLQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLEVBQUUsVUFBVSxFQUFFLENBQUMsbUJBQWlCLE9BQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3pGLEtBQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLFFBQVEsRUFBRSxZQUFZLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLFVBQVUsRUFBRSxDQUFDLG1CQUFpQixZQUFjLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNuSSxDQUFDLENBQUM7YUFDRCxJQUFJLENBQUMsY0FBTSxPQUFBLEtBQUssRUFBTCxDQUFLLENBQUMsQ0FBQztJQUNyQixDQUFDO0lBRUQsd0RBQXNCLEdBQXRCLFVBQXVCLEtBQXFCLEVBQUUsT0FBZSxFQUFFLEtBQXVCO1FBQXRGLGlCQTRCQztRQTNCQyxJQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM5QyxJQUFNLFNBQVMsR0FBRyxNQUFNLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQztRQUNyRCxJQUFNLFlBQVksR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUN4RCxJQUFNLFlBQVksR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUN4RCxJQUFNLGNBQWMsR0FBRyxFQUFFLFFBQVEsRUFBRSxZQUFZLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUVoRSxJQUFNLFFBQVEsR0FBcUIsRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ3BELElBQU0sU0FBUyxHQUFxQixFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDckQsRUFBRSxDQUFDLENBQUMsU0FBUyxDQUFDLE1BQU0sSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUNuQyxTQUFTLENBQUMsSUFBSSxHQUFHLEVBQUUsQ0FBQztZQUNwQixRQUFRLENBQUMsSUFBSSxHQUFHLEVBQUUsQ0FBQztZQUNuQixHQUFHLENBQUMsQ0FBQyxJQUFNLEtBQUssSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDL0IsRUFBRSxDQUFDLENBQUMsS0FBSyxJQUFJLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO29CQUM5QixRQUFRLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQ3pDLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDNUMsQ0FBQztZQUNILENBQUM7UUFDSCxDQUFDO1FBQ0QsTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUM7WUFDakIsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEtBQUssRUFBRSxPQUFPLEVBQUUsUUFBUSxDQUFDO1lBQy9DLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxjQUFjLEVBQUUsWUFBWSxFQUFFLFNBQVMsQ0FBQztTQUMvRCxDQUFDO2FBQ0QsSUFBSSxDQUFDO1lBQ0osS0FBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxFQUFFLFVBQVUsRUFBRSxDQUFDLG1CQUFpQixPQUFTLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUN6RixLQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsRUFBRSxRQUFRLEVBQUUsWUFBWSxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxVQUFVLEVBQUUsQ0FBQyxtQkFBaUIsWUFBYyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbkksQ0FBQyxDQUFDO2FBQ0QsSUFBSSxDQUFDLGNBQU0sT0FBQSxLQUFLLEVBQUwsQ0FBSyxDQUFDLENBQUM7SUFDckIsQ0FBQztJQUVELHVDQUFLLEdBQUwsVUFBTSxDQUFTO1FBQ2IsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO2FBQ25CLElBQUksQ0FBQyxVQUFDLElBQUk7WUFDVCxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxVQUFBLENBQUM7Z0JBQ2YsTUFBTSxDQUFDO29CQUNMLFFBQVEsRUFBRSxDQUFDO29CQUNYLEVBQUUsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUM7aUJBQ2xDLENBQUM7WUFDSixDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsVUFBQSxDQUFDLElBQUksT0FBQSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQVosQ0FBWSxDQUFDLENBQUM7UUFDL0IsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsMkNBQVMsR0FBVCxVQUFVLENBQTBDO1FBQXBELGlCQUtDO1FBSkMsTUFBTSxDQUFDLGlCQUFNLFNBQVMsWUFBQyxDQUFDLENBQUM7YUFDeEIsSUFBSSxDQUFDO1lBQ0osS0FBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQy9CLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELDJDQUFTLEdBQVQsVUFBVSxLQUFxQjtRQUM3QixNQUFNLENBQUksS0FBSyxDQUFDLFFBQVEsU0FBSSxLQUFLLENBQUMsRUFBSSxDQUFDO0lBQ3pDLENBQUM7SUFDSCw4QkFBQztBQUFELENBbk5BLEFBbU5DLENBbk5xRCxpQkFBTyxHQW1ONUQ7QUFuTnFCLDBEQUF1QiIsImZpbGUiOiJzdG9yYWdlL21vZGlmaWFibGVLZXlWYWx1ZVN0b3JlLmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgbWVyZ2VPcHRpb25zIGZyb20gJ21lcmdlLW9wdGlvbnMnO1xuXG5pbXBvcnQgeyBTdG9yYWdlIH0gZnJvbSAnLi9zdG9yYWdlJztcbmltcG9ydCB7XG4gIEluZGVmaW5pdGVNb2RlbERhdGEsXG4gIE1vZGVsRGF0YSxcbiAgTW9kZWxSZWZlcmVuY2UsXG4gIE1vZGVsU2NoZW1hLFxuICBSZWxhdGlvbnNoaXBJdGVtLFxuICBUZXJtaW5hbFN0b3JlLFxuICBDYWNoZVN0b3JlLFxuICBBbGxvY2F0aW5nU3RvcmVcbn0gZnJvbSAnLi4vZGF0YVR5cGVzJztcblxuLy8gZGVjbGFyZSBmdW5jdGlvbiBwYXJzZUludChuOiBzdHJpbmcgfCBudW1iZXIsIHJhZGl4OiBudW1iZXIpOiBudW1iZXI7XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBNb2RpZmlhYmxlS2V5VmFsdWVTdG9yZSBleHRlbmRzIFN0b3JhZ2UgaW1wbGVtZW50cyBUZXJtaW5hbFN0b3JlLCBDYWNoZVN0b3JlLCBBbGxvY2F0aW5nU3RvcmUge1xuICBwcm90ZWN0ZWQgbWF4S2V5czogeyBbdHlwZU5hbWU6IHN0cmluZ106IG51bWJlciB9ID0ge307XG5cbiAgYWJzdHJhY3QgX2tleXModHlwZU5hbWU6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nW10+O1xuICBhYnN0cmFjdCBfZ2V0KHJlZjogTW9kZWxSZWZlcmVuY2UpOiBQcm9taXNlPE1vZGVsRGF0YSB8IG51bGw+O1xuICBhYnN0cmFjdCBfdXBzZXJ0KHY6IE1vZGVsRGF0YSk6IFByb21pc2U8TW9kZWxEYXRhPjtcbiAgYWJzdHJhY3QgX3VwZGF0ZUFycmF5KHJlZjogTW9kZWxSZWZlcmVuY2UsIHJlbE5hbWU6IHN0cmluZywgaXRlbTogUmVsYXRpb25zaGlwSXRlbSk6IFByb21pc2U8TW9kZWxSZWZlcmVuY2U+O1xuICBhYnN0cmFjdCBfcmVtb3ZlRnJvbUFycmF5KHJlZjogTW9kZWxSZWZlcmVuY2UsIHJlbE5hbWU6IHN0cmluZywgaXRlbTogUmVsYXRpb25zaGlwSXRlbSk6IFByb21pc2U8TW9kZWxSZWZlcmVuY2U+O1xuICBhYnN0cmFjdCBfZGVsKHJlZjogTW9kZWxSZWZlcmVuY2UsIGZpZWxkczogc3RyaW5nW10pOiBQcm9taXNlPE1vZGVsRGF0YT47XG5cbiAgYWxsb2NhdGVJZCh0eXBlTmFtZTogc3RyaW5nKSB7XG4gICAgdGhpcy5tYXhLZXlzW3R5cGVOYW1lXSA9IHRoaXMubWF4S2V5c1t0eXBlTmFtZV0gKyAxO1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5tYXhLZXlzW3R5cGVOYW1lXSk7XG4gIH1cblxuICB3cml0ZUF0dHJpYnV0ZXMoaW5wdXRWYWx1ZTogSW5kZWZpbml0ZU1vZGVsRGF0YSkge1xuICAgIGNvbnN0IHZhbHVlID0gdGhpcy52YWxpZGF0ZUlucHV0KGlucHV0VmFsdWUpO1xuICAgIGRlbGV0ZSB2YWx1ZS5yZWxhdGlvbnNoaXBzO1xuICAgIC8vIHRyaW0gb3V0IHJlbGF0aW9uc2hpcHMgZm9yIGEgZGlyZWN0IHdyaXRlLlxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIGlmICgodmFsdWUuaWQgPT09IHVuZGVmaW5lZCkgfHwgKHZhbHVlLmlkID09PSBudWxsKSkge1xuICAgICAgICBpZiAoIXRoaXMudGVybWluYWwpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBjcmVhdGUgbmV3IGNvbnRlbnQgaW4gYSBub24tdGVybWluYWwgc3RvcmUnKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5hbGxvY2F0ZUlkKHZhbHVlLnR5cGVOYW1lKVxuICAgICAgICAudGhlbigobikgPT4ge1xuICAgICAgICAgIHJldHVybiBtZXJnZU9wdGlvbnMoe30sIHZhbHVlLCB7IGlkOiBuLCByZWxhdGlvbnNoaXBzOiB7fSB9KSBhcyBNb2RlbERhdGE7IC8vIGlmIG5ldy5cbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdmFsdWUgYXMgTW9kZWxEYXRhO1xuICAgICAgfVxuICAgIH0pXG4gICAgLnRoZW4oKHRvU2F2ZTogTW9kZWxEYXRhKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5fdXBzZXJ0KHRvU2F2ZSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgdGhpcy5maXJlV3JpdGVVcGRhdGUoT2JqZWN0LmFzc2lnbih7fSwgdG9TYXZlLCB7IGludmFsaWRhdGU6IFsnYXR0cmlidXRlcyddIH0pKTtcbiAgICAgICAgcmV0dXJuIHRvU2F2ZTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgcmVhZEF0dHJpYnV0ZXModmFsdWU6IE1vZGVsUmVmZXJlbmNlKTogUHJvbWlzZTxNb2RlbERhdGE+IHtcbiAgICByZXR1cm4gdGhpcy5fZ2V0KHZhbHVlKVxuICAgIC50aGVuKGQgPT4ge1xuICAgICAgaWYgKGQgJiYgZC5hdHRyaWJ1dGVzICYmIE9iamVjdC5rZXlzKGQuYXR0cmlidXRlcykubGVuZ3RoID4gMCkge1xuICAgICAgICByZXR1cm4gZDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgY2FjaGUodmFsdWU6IE1vZGVsRGF0YSkge1xuICAgIGlmICgodmFsdWUuaWQgPT09IHVuZGVmaW5lZCkgfHwgKHZhbHVlLmlkID09PSBudWxsKSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KCdDYW5ub3QgY2FjaGUgZGF0YSB3aXRob3V0IGFuIGlkIC0gd3JpdGUgaXQgdG8gYSB0ZXJtaW5hbCBmaXJzdCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdGhpcy5fZ2V0KHZhbHVlKVxuICAgICAgLnRoZW4oKGN1cnJlbnQpID0+IHtcbiAgICAgICAgY29uc3QgbmV3VmFsID0gbWVyZ2VPcHRpb25zKGN1cnJlbnQgfHwge30sIHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3Vwc2VydChuZXdWYWwpO1xuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgY2FjaGVBdHRyaWJ1dGVzKHZhbHVlOiBNb2RlbERhdGEpIHtcbiAgICBpZiAoKHZhbHVlLmlkID09PSB1bmRlZmluZWQpIHx8ICh2YWx1ZS5pZCA9PT0gbnVsbCkpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdCgnQ2Fubm90IGNhY2hlIGRhdGEgd2l0aG91dCBhbiBpZCAtIHdyaXRlIGl0IHRvIGEgdGVybWluYWwgZmlyc3QnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHRoaXMuX2dldCh2YWx1ZSlcbiAgICAgIC50aGVuKChjdXJyZW50KSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLl91cHNlcnQoe1xuICAgICAgICAgIHR5cGVOYW1lOiB2YWx1ZS50eXBlTmFtZSxcbiAgICAgICAgICBpZDogdmFsdWUuaWQsXG4gICAgICAgICAgYXR0cmlidXRlczogdmFsdWUuYXR0cmlidXRlcyxcbiAgICAgICAgICByZWxhdGlvbnNoaXBzOiBjdXJyZW50LnJlbGF0aW9uc2hpcHMgfHwge30sXG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgY2FjaGVSZWxhdGlvbnNoaXAodmFsdWU6IE1vZGVsRGF0YSkge1xuICAgIGlmICgodmFsdWUuaWQgPT09IHVuZGVmaW5lZCkgfHwgKHZhbHVlLmlkID09PSBudWxsKSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KCdDYW5ub3QgY2FjaGUgZGF0YSB3aXRob3V0IGFuIGlkIC0gd3JpdGUgaXQgdG8gYSB0ZXJtaW5hbCBmaXJzdCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdGhpcy5fZ2V0KHZhbHVlKVxuICAgICAgLnRoZW4oKGN1cnJlbnQpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3Vwc2VydCh7XG4gICAgICAgICAgdHlwZU5hbWU6IHZhbHVlLnR5cGVOYW1lLFxuICAgICAgICAgIGlkOiB2YWx1ZS5pZCxcbiAgICAgICAgICBhdHRyaWJ1dGVzOiBjdXJyZW50LmF0dHJpYnV0ZXMgfHwge30sXG4gICAgICAgICAgcmVsYXRpb25zaGlwczogdmFsdWUucmVsYXRpb25zaGlwcyxcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICByZWFkUmVsYXRpb25zaGlwKHZhbHVlOiBNb2RlbFJlZmVyZW5jZSwgcmVsTmFtZTogc3RyaW5nKTogUHJvbWlzZTxNb2RlbERhdGE+IHtcbiAgICByZXR1cm4gdGhpcy5fZ2V0KHZhbHVlKVxuICAgIC50aGVuKCh2KSA9PiB7XG4gICAgICBjb25zdCByZXRWYWwgPSBPYmplY3QuYXNzaWduKHt9LCB2KTtcbiAgICAgIGlmICghdikge1xuICAgICAgICBpZiAodGhpcy50ZXJtaW5hbCkge1xuICAgICAgICAgIHJldHVybiB7IHR5cGVOYW1lOiB2YWx1ZS50eXBlTmFtZSwgaWQ6IHZhbHVlLmlkLCByZWxhdGlvbnNoaXBzOiB7IFtyZWxOYW1lXTogW10gfSB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKCF2LnJlbGF0aW9uc2hpcHMgJiYgdGhpcy50ZXJtaW5hbCkge1xuICAgICAgICByZXRWYWwucmVsYXRpb25zaGlwcyA9IHsgW3JlbE5hbWVdOiBbXSB9O1xuICAgICAgfSBlbHNlIGlmICghcmV0VmFsLnJlbGF0aW9uc2hpcHNbcmVsTmFtZV0gJiYgdGhpcy50ZXJtaW5hbCkge1xuICAgICAgICByZXRWYWwucmVsYXRpb25zaGlwc1tyZWxOYW1lXSA9IFtdO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJldFZhbDtcbiAgICB9KTtcbiAgfVxuXG4gIGRlbGV0ZSh2YWx1ZTogTW9kZWxSZWZlcmVuY2UpIHtcbiAgICByZXR1cm4gdGhpcy5fZGVsKHZhbHVlLCBbJ2F0dHJpYnV0ZXMnLCAncmVsYXRpb25zaGlwcyddKVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIGlmICh0aGlzLnRlcm1pbmFsKSB7XG4gICAgICAgIHRoaXMuZmlyZVdyaXRlVXBkYXRlKHsgaWQ6IHZhbHVlLmlkLCB0eXBlTmFtZTogdmFsdWUudHlwZU5hbWUsIGludmFsaWRhdGU6IFsnYXR0cmlidXRlcycsICdyZWxhdGlvbnNoaXBzJ10gfSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICB3aXBlKHZhbHVlOiBNb2RlbFJlZmVyZW5jZSwgZmllbGQ6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9kZWwodmFsdWUsIFtmaWVsZF0pO1xuICB9XG5cbiAgd3JpdGVSZWxhdGlvbnNoaXBJdGVtKHZhbHVlOiBNb2RlbFJlZmVyZW5jZSwgcmVsTmFtZTogc3RyaW5nLCBjaGlsZDogUmVsYXRpb25zaGlwSXRlbSkge1xuICAgIGNvbnN0IHNjaGVtYSA9IHRoaXMuZ2V0U2NoZW1hKHZhbHVlLnR5cGVOYW1lKTtcbiAgICBjb25zdCByZWxTY2hlbWEgPSBzY2hlbWEucmVsYXRpb25zaGlwc1tyZWxOYW1lXS50eXBlO1xuICAgIGNvbnN0IG90aGVyUmVsVHlwZSA9IHJlbFNjaGVtYS5zaWRlc1tyZWxOYW1lXS5vdGhlclR5cGU7XG4gICAgY29uc3Qgb3RoZXJSZWxOYW1lID0gcmVsU2NoZW1hLnNpZGVzW3JlbE5hbWVdLm90aGVyTmFtZTtcbiAgICBjb25zdCBvdGhlclJlZmVyZW5jZSA9IHsgdHlwZU5hbWU6IG90aGVyUmVsVHlwZSwgaWQ6IGNoaWxkLmlkIH07XG5cbiAgICBjb25zdCBuZXdDaGlsZDogUmVsYXRpb25zaGlwSXRlbSA9IHsgaWQ6IGNoaWxkLmlkIH07XG4gICAgY29uc3QgbmV3UGFyZW50OiBSZWxhdGlvbnNoaXBJdGVtID0geyBpZDogdmFsdWUuaWQgfTtcbiAgICBpZiAocmVsU2NoZW1hLmV4dHJhcyAmJiBjaGlsZC5tZXRhKSB7XG4gICAgICBuZXdQYXJlbnQubWV0YSA9IHt9O1xuICAgICAgbmV3Q2hpbGQubWV0YSA9IHt9O1xuICAgICAgZm9yIChjb25zdCBleHRyYSBpbiBjaGlsZC5tZXRhKSB7XG4gICAgICAgIGlmIChleHRyYSBpbiByZWxTY2hlbWEuZXh0cmFzKSB7XG4gICAgICAgICAgbmV3Q2hpbGQubWV0YVtleHRyYV0gPSBjaGlsZC5tZXRhW2V4dHJhXTtcbiAgICAgICAgICBuZXdQYXJlbnQubWV0YVtleHRyYV0gPSBjaGlsZC5tZXRhW2V4dHJhXTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwoW1xuICAgICAgdGhpcy5fdXBkYXRlQXJyYXkodmFsdWUsIHJlbE5hbWUsIG5ld0NoaWxkKSxcbiAgICAgIHRoaXMuX3VwZGF0ZUFycmF5KG90aGVyUmVmZXJlbmNlLCBvdGhlclJlbE5hbWUsIG5ld1BhcmVudClcbiAgICBdKVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHRoaXMuZmlyZVdyaXRlVXBkYXRlKE9iamVjdC5hc3NpZ24odmFsdWUsIHsgaW52YWxpZGF0ZTogW2ByZWxhdGlvbnNoaXBzLiR7cmVsTmFtZX1gXSB9KSk7XG4gICAgICB0aGlzLmZpcmVXcml0ZVVwZGF0ZShPYmplY3QuYXNzaWduKHsgdHlwZU5hbWU6IG90aGVyUmVsVHlwZSwgaWQ6IGNoaWxkLmlkIH0sIHsgaW52YWxpZGF0ZTogW2ByZWxhdGlvbnNoaXBzLiR7b3RoZXJSZWxOYW1lfWBdIH0pKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHZhbHVlKTtcbiAgfVxuXG4gIGRlbGV0ZVJlbGF0aW9uc2hpcEl0ZW0odmFsdWU6IE1vZGVsUmVmZXJlbmNlLCByZWxOYW1lOiBzdHJpbmcsIGNoaWxkOiBSZWxhdGlvbnNoaXBJdGVtKSB7XG4gICAgY29uc3Qgc2NoZW1hID0gdGhpcy5nZXRTY2hlbWEodmFsdWUudHlwZU5hbWUpO1xuICAgIGNvbnN0IHJlbFNjaGVtYSA9IHNjaGVtYS5yZWxhdGlvbnNoaXBzW3JlbE5hbWVdLnR5cGU7XG4gICAgY29uc3Qgb3RoZXJSZWxUeXBlID0gcmVsU2NoZW1hLnNpZGVzW3JlbE5hbWVdLm90aGVyVHlwZTtcbiAgICBjb25zdCBvdGhlclJlbE5hbWUgPSByZWxTY2hlbWEuc2lkZXNbcmVsTmFtZV0ub3RoZXJOYW1lO1xuICAgIGNvbnN0IG90aGVyUmVmZXJlbmNlID0geyB0eXBlTmFtZTogb3RoZXJSZWxUeXBlLCBpZDogY2hpbGQuaWQgfTtcblxuICAgIGNvbnN0IG5ld0NoaWxkOiBSZWxhdGlvbnNoaXBJdGVtID0geyBpZDogY2hpbGQuaWQgfTtcbiAgICBjb25zdCBuZXdQYXJlbnQ6IFJlbGF0aW9uc2hpcEl0ZW0gPSB7IGlkOiB2YWx1ZS5pZCB9O1xuICAgIGlmIChyZWxTY2hlbWEuZXh0cmFzICYmIGNoaWxkLm1ldGEpIHtcbiAgICAgIG5ld1BhcmVudC5tZXRhID0ge307XG4gICAgICBuZXdDaGlsZC5tZXRhID0ge307XG4gICAgICBmb3IgKGNvbnN0IGV4dHJhIGluIGNoaWxkLm1ldGEpIHtcbiAgICAgICAgaWYgKGV4dHJhIGluIHJlbFNjaGVtYS5leHRyYXMpIHtcbiAgICAgICAgICBuZXdDaGlsZC5tZXRhW2V4dHJhXSA9IGNoaWxkLm1ldGFbZXh0cmFdO1xuICAgICAgICAgIG5ld1BhcmVudC5tZXRhW2V4dHJhXSA9IGNoaWxkLm1ldGFbZXh0cmFdO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLmFsbChbXG4gICAgICB0aGlzLl9yZW1vdmVGcm9tQXJyYXkodmFsdWUsIHJlbE5hbWUsIG5ld0NoaWxkKSxcbiAgICAgIHRoaXMuX3JlbW92ZUZyb21BcnJheShvdGhlclJlZmVyZW5jZSwgb3RoZXJSZWxOYW1lLCBuZXdQYXJlbnQpXG4gICAgXSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICB0aGlzLmZpcmVXcml0ZVVwZGF0ZShPYmplY3QuYXNzaWduKHZhbHVlLCB7IGludmFsaWRhdGU6IFtgcmVsYXRpb25zaGlwcy4ke3JlbE5hbWV9YF0gfSkpO1xuICAgICAgdGhpcy5maXJlV3JpdGVVcGRhdGUoT2JqZWN0LmFzc2lnbih7IHR5cGVOYW1lOiBvdGhlclJlbFR5cGUsIGlkOiBjaGlsZC5pZCB9LCB7IGludmFsaWRhdGU6IFtgcmVsYXRpb25zaGlwcy4ke290aGVyUmVsTmFtZX1gXSB9KSk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB2YWx1ZSk7XG4gIH1cblxuICBxdWVyeSh0OiBzdHJpbmcpOiBQcm9taXNlPE1vZGVsUmVmZXJlbmNlW10+IHtcbiAgICByZXR1cm4gdGhpcy5fa2V5cyh0KVxuICAgIC50aGVuKChrZXlzKSA9PiB7XG4gICAgICByZXR1cm4ga2V5cy5tYXAoayA9PiB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgdHlwZU5hbWU6IHQsXG4gICAgICAgICAgaWQ6IHBhcnNlSW50KGsuc3BsaXQoJzonKVsxXSwgMTApLFxuICAgICAgICB9O1xuICAgICAgfSkuZmlsdGVyKHYgPT4gIWlzTmFOKHYuaWQpKTtcbiAgICB9KTtcbiAgfVxuXG4gIGFkZFNjaGVtYSh0OiB7dHlwZU5hbWU6IHN0cmluZywgc2NoZW1hOiBNb2RlbFNjaGVtYX0pIHtcbiAgICByZXR1cm4gc3VwZXIuYWRkU2NoZW1hKHQpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgdGhpcy5tYXhLZXlzW3QudHlwZU5hbWVdID0gMDtcbiAgICB9KTtcbiAgfVxuXG4gIGtleVN0cmluZyh2YWx1ZTogTW9kZWxSZWZlcmVuY2UpIHtcbiAgICByZXR1cm4gYCR7dmFsdWUudHlwZU5hbWV9OiR7dmFsdWUuaWR9YDtcbiAgfVxufVxuIl19