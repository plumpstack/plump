"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var mergeOptions = require("merge-options");
var rxjs_1 = require("rxjs");
var plumpObservable_1 = require("./plumpObservable");
var Model = (function () {
    function Model(opts, plump) {
        this.plump = plump;
        if (this.type === 'BASE') {
            throw new TypeError('Cannot instantiate base plump Models, please subclass with a schema and valid type');
        }
        this.dirty = {
            attributes: {},
            relationships: {}
        };
        this.$$copyValuesFrom(opts);
    }
    Object.defineProperty(Model.prototype, "type", {
        get: function () {
            return this.constructor['type'];
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Model.prototype, "schema", {
        get: function () {
            return this.constructor['schema'];
        },
        enumerable: true,
        configurable: true
    });
    Model.prototype.dirtyFields = function () {
        var _this = this;
        return Object.keys(this.dirty.attributes)
            .filter(function (k) { return k !== _this.schema.idAttribute; })
            .concat(Object.keys(this.dirty.relationships));
    };
    Model.prototype.$$copyValuesFrom = function (opts) {
        if (opts === void 0) { opts = {}; }
        if (this.id === undefined && opts[this.schema.idAttribute]) {
            this.id = opts[this.schema.idAttribute];
        }
        this.dirty = mergeOptions(this.dirty, { attributes: opts });
    };
    Model.prototype.$$resetDirty = function () {
        this.dirty = {
            attributes: {},
            relationships: {}
        };
    };
    Model.prototype.get = function (opts) {
        var _this = this;
        if (opts === void 0) { opts = 'attributes'; }
        var keys = opts && !Array.isArray(opts) ? [opts] : opts;
        return this.plump.get(this, keys).then(function (self) {
            if (!self && _this.dirtyFields().length === 0) {
                return null;
            }
            else if (_this.dirtyFields().length === 0) {
                return self;
            }
            else {
                var resolved = Model.resolveAndOverlay(_this.dirty, self || undefined);
                return mergeOptions({}, self || { id: _this.id, type: _this.type }, resolved);
            }
        });
    };
    Model.prototype.bulkGet = function () {
        return this.plump.bulkGet(this);
    };
    Model.prototype.save = function () {
        var _this = this;
        var update = mergeOptions({ id: this.id, type: this.type }, this.dirty);
        return this.plump
            .save(update)
            .then(function (updated) {
            _this.$$resetDirty();
            if (updated.id) {
                _this.id = updated.id;
            }
            return _this.get();
        })
            .catch(function (err) {
            throw err;
        });
    };
    Model.prototype.set = function (update) {
        var _this = this;
        var flat = update.attributes || update;
        var sanitized = Object.keys(flat)
            .filter(function (k) { return k in _this.schema.attributes; })
            .map(function (k) {
            return _a = {}, _a[k] = flat[k], _a;
            var _a;
        })
            .reduce(function (acc, curr) { return mergeOptions(acc, curr); }, {});
        this.$$copyValuesFrom(sanitized);
        return this;
    };
    Model.prototype.asObservable = function (opts) {
        var _this = this;
        if (opts === void 0) { opts = ['relationships', 'attributes']; }
        var fields = Array.isArray(opts) ? opts.concat() : [opts];
        if (fields.indexOf('relationships') >= 0) {
            fields = fields.concat(Object.keys(this.schema.relationships).map(function (k) { return "relationships." + k; }));
        }
        var hots = this.plump.caches.filter(function (s) { return s.hot(_this); });
        var colds = this.plump.caches.filter(function (s) { return !s.hot(_this); });
        var terminal = this.plump.terminal;
        var preload$ = rxjs_1.Observable.from(hots)
            .flatMap(function (s) { return rxjs_1.Observable.fromPromise(s.read(_this, fields)); })
            .defaultIfEmpty(null)
            .flatMap(function (v) {
            if (v !== null) {
                return rxjs_1.Observable.of(v);
            }
            else {
                var terminal$ = rxjs_1.Observable.fromPromise(terminal.read(_this, fields));
                var cold$ = rxjs_1.Observable.from(colds).flatMap(function (s) {
                    return rxjs_1.Observable.fromPromise(s.read(_this, fields));
                });
                return rxjs_1.Observable.merge(terminal$, cold$.takeUntil(terminal$));
            }
        });
        var watchWrite$ = terminal.write$
            .filter(function (v) {
            return (v.type === _this.type &&
                v.id === _this.id &&
                v.invalidate.some(function (i) { return fields.indexOf(i) >= 0; }));
        })
            .flatMapTo(rxjs_1.Observable.of(terminal).flatMap(function (s) {
            return rxjs_1.Observable.fromPromise(s.read(_this, fields));
        }));
        return rxjs_1.Observable.merge(preload$, watchWrite$).let(function (obs) {
            return new plumpObservable_1.PlumpObservable(_this.plump, obs);
        });
    };
    Model.prototype.subscribe = function (arg1, arg2) {
        var fields = [];
        var cb = null;
        if (arg2) {
            cb = arg2;
            if (Array.isArray(arg1)) {
                fields = arg1;
            }
            else {
                fields = [arg1];
            }
        }
        else {
            cb = arg1;
            fields = ['attributes'];
        }
        return this.asObservable(fields).subscribe(cb);
    };
    Model.prototype.delete = function () {
        return this.plump.delete(this);
    };
    Model.prototype.add = function (key, item) {
        if (key in this.schema.relationships) {
            if (item.id >= 1) {
                if (this.dirty.relationships[key] === undefined) {
                    this.dirty.relationships[key] = [];
                }
                this.dirty.relationships[key].push({
                    op: 'add',
                    data: item
                });
                return this;
            }
            else {
                throw new Error('Invalid item added to hasMany');
            }
        }
        else {
            throw new Error('Cannot $add except to hasMany field');
        }
    };
    Model.prototype.modifyRelationship = function (key, item) {
        if (key in this.schema.relationships) {
            if (item.id >= 1) {
                this.dirty.relationships[key] = this.dirty.relationships[key] || [];
                this.dirty.relationships[key].push({
                    op: 'modify',
                    data: item
                });
                return this;
            }
            else {
                throw new Error('Invalid item added to hasMany');
            }
        }
        else {
            throw new Error('Cannot $add except to hasMany field');
        }
    };
    Model.prototype.remove = function (key, item) {
        if (key in this.schema.relationships) {
            if (item.id >= 1) {
                if (!(key in this.dirty.relationships)) {
                    this.dirty.relationships[key] = [];
                }
                this.dirty.relationships[key].push({
                    op: 'remove',
                    data: item
                });
                return this;
            }
            else {
                throw new Error('Invalid item $removed from hasMany');
            }
        }
        else {
            throw new Error('Cannot $remove except from hasMany field');
        }
    };
    Model.applyDelta = function (current, delta) {
        if (delta.op === 'add' || delta.op === 'modify') {
            var retVal = mergeOptions({}, current, delta.data);
            return retVal;
        }
        else if (delta.op === 'remove') {
            return undefined;
        }
        else {
            return current;
        }
    };
    Model.resolveAndOverlay = function (update, base) {
        if (base === void 0) { base = {
            attributes: {},
            relationships: {}
        }; }
        var attributes = mergeOptions({}, base.attributes, update.attributes);
        var resolvedRelationships = this.resolveRelationships(update.relationships, base.relationships);
        return { attributes: attributes, relationships: resolvedRelationships };
    };
    Model.resolveRelationships = function (deltas, base) {
        var _this = this;
        if (base === void 0) { base = {}; }
        var updates = Object.keys(deltas)
            .map(function (relName) {
            var resolved = _this.resolveRelationship(deltas[relName], base[relName]);
            return _a = {}, _a[relName] = resolved, _a;
            var _a;
        })
            .reduce(function (acc, curr) { return mergeOptions(acc, curr); }, {});
        return mergeOptions({}, base, updates);
    };
    Model.resolveRelationship = function (deltas, base) {
        if (base === void 0) { base = []; }
        var retVal = base.concat();
        deltas.forEach(function (delta) {
            if (delta.op === 'add' || delta.op === 'modify') {
                var currentIndex = retVal.findIndex(function (v) { return v.id === delta.data.id; });
                if (currentIndex >= 0) {
                    retVal[currentIndex] = delta.data;
                }
                else {
                    retVal.push(delta.data);
                }
            }
            else if (delta.op === 'remove') {
                var currentIndex = retVal.findIndex(function (v) { return v.id === delta.data.id; });
                if (currentIndex >= 0) {
                    retVal.splice(currentIndex, 1);
                }
            }
        });
        return retVal;
    };
    Model.type = 'BASE';
    Model.schema = {
        idAttribute: 'id',
        name: 'BASE',
        attributes: {},
        relationships: {}
    };
    return Model;
}());
exports.Model = Model;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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QUUsQ0FBQyxDQUFDLFlBQVksSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUN0QixNQUFNLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDakMsQ0FBQztZQUNILENBQUM7UUFDSCxDQUFDLENBQUMsQ0FBQztRQUNILE1BQU0sQ0FBQyxNQUFNLENBQUM7SUFDaEIsQ0FBQztJQXBVTSxVQUFJLEdBQUcsTUFBTSxDQUFDO0lBQ2QsWUFBTSxHQUFnQjtRQUMzQixXQUFXLEVBQUUsSUFBSTtRQUNqQixJQUFJLEVBQUUsTUFBTTtRQUNaLFVBQVUsRUFBRSxFQUFFO1FBQ2QsYUFBYSxFQUFFLEVBQUU7S0FDbEIsQ0FBQztJQStUSixZQUFDO0NBdlVELEFBdVVDLElBQUE7QUF2VVksc0JBQUsiLCJmaWxlIjoibW9kZWwuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBtZXJnZU9wdGlvbnMgZnJvbSAnbWVyZ2Utb3B0aW9ucyc7XG5pbXBvcnQgeyBPYnNlcnZhYmxlLCBTdWJzY3JpcHRpb24sIE9ic2VydmVyIH0gZnJvbSAncnhqcyc7XG5cbmltcG9ydCB7XG4gIE1vZGVsRGF0YSxcbiAgTW9kZWxEZWx0YSxcbiAgTW9kZWxTY2hlbWEsXG4gIERpcnR5VmFsdWVzLFxuICBEaXJ0eU1vZGVsLFxuICBSZWxhdGlvbnNoaXBEZWx0YSxcbiAgUmVsYXRpb25zaGlwSXRlbSxcbiAgQ2FjaGVTdG9yZSxcbiAgVGVybWluYWxTdG9yZVxufSBmcm9tICcuL2RhdGFUeXBlcyc7XG5cbmltcG9ydCB7IFBsdW1wIH0gZnJvbSAnLi9wbHVtcCc7XG5pbXBvcnQgeyBQbHVtcE9ic2VydmFibGUgfSBmcm9tICcuL3BsdW1wT2JzZXJ2YWJsZSc7XG5cbi8vIFRPRE86IGZpZ3VyZSBvdXQgd2hlcmUgZXJyb3IgZXZlbnRzIG9yaWdpbmF0ZSAoc3RvcmFnZSBvciBtb2RlbClcbi8vIGFuZCB3aG8ga2VlcHMgYSByb2xsLWJhY2thYmxlIGRlbHRhXG5cbmV4cG9ydCBjbGFzcyBNb2RlbDxUIGV4dGVuZHMgTW9kZWxEYXRhPiB7XG4gIGlkOiBzdHJpbmcgfCBudW1iZXI7XG4gIHN0YXRpYyB0eXBlID0gJ0JBU0UnO1xuICBzdGF0aWMgc2NoZW1hOiBNb2RlbFNjaGVtYSA9IHtcbiAgICBpZEF0dHJpYnV0ZTogJ2lkJyxcbiAgICBuYW1lOiAnQkFTRScsXG4gICAgYXR0cmlidXRlczoge30sXG4gICAgcmVsYXRpb25zaGlwczoge31cbiAgfTtcblxuICBwcml2YXRlIGRpcnR5OiBEaXJ0eVZhbHVlcztcblxuICBnZXQgdHlwZSgpIHtcbiAgICByZXR1cm4gdGhpcy5jb25zdHJ1Y3RvclsndHlwZSddO1xuICB9XG5cbiAgZ2V0IHNjaGVtYSgpIHtcbiAgICByZXR1cm4gdGhpcy5jb25zdHJ1Y3Rvclsnc2NoZW1hJ107XG4gIH1cblxuICBkaXJ0eUZpZWxkcygpIHtcbiAgICByZXR1cm4gT2JqZWN0LmtleXModGhpcy5kaXJ0eS5hdHRyaWJ1dGVzKVxuICAgICAgLmZpbHRlcihrID0+IGsgIT09IHRoaXMuc2NoZW1hLmlkQXR0cmlidXRlKVxuICAgICAgLmNvbmNhdChPYmplY3Qua2V5cyh0aGlzLmRpcnR5LnJlbGF0aW9uc2hpcHMpKTtcbiAgfVxuXG4gIGNvbnN0cnVjdG9yKG9wdHMsIHByaXZhdGUgcGx1bXA6IFBsdW1wKSB7XG4gICAgLy8gVE9ETzogRGVmaW5lIERlbHRhIGludGVyZmFjZVxuICAgIGlmICh0aGlzLnR5cGUgPT09ICdCQVNFJykge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcbiAgICAgICAgJ0Nhbm5vdCBpbnN0YW50aWF0ZSBiYXNlIHBsdW1wIE1vZGVscywgcGxlYXNlIHN1YmNsYXNzIHdpdGggYSBzY2hlbWEgYW5kIHZhbGlkIHR5cGUnXG4gICAgICApO1xuICAgIH1cblxuICAgIHRoaXMuZGlydHkgPSB7XG4gICAgICBhdHRyaWJ1dGVzOiB7fSwgLy8gU2ltcGxlIGtleS12YWx1ZVxuICAgICAgcmVsYXRpb25zaGlwczoge30gLy8gcmVsTmFtZTogRGVsdGFbXVxuICAgIH07XG4gICAgdGhpcy4kJGNvcHlWYWx1ZXNGcm9tKG9wdHMpO1xuICAgIC8vIHRoaXMuJCRmaXJlVXBkYXRlKG9wdHMpO1xuICB9XG5cbiAgJCRjb3B5VmFsdWVzRnJvbShvcHRzID0ge30pOiB2b2lkIHtcbiAgICAvLyBjb25zdCBpZEZpZWxkID0gdGhpcy5jb25zdHJ1Y3Rvci4kaWQgaW4gb3B0cyA/IHRoaXMuY29uc3RydWN0b3IuJGlkIDogJ2lkJztcbiAgICAvLyB0aGlzW3RoaXMuY29uc3RydWN0b3IuJGlkXSA9IG9wdHNbaWRGaWVsZF0gfHwgdGhpcy5pZDtcbiAgICBpZiAodGhpcy5pZCA9PT0gdW5kZWZpbmVkICYmIG9wdHNbdGhpcy5zY2hlbWEuaWRBdHRyaWJ1dGVdKSB7XG4gICAgICB0aGlzLmlkID0gb3B0c1t0aGlzLnNjaGVtYS5pZEF0dHJpYnV0ZV07XG4gICAgfVxuICAgIHRoaXMuZGlydHkgPSBtZXJnZU9wdGlvbnModGhpcy5kaXJ0eSwgeyBhdHRyaWJ1dGVzOiBvcHRzIH0pO1xuICB9XG5cbiAgJCRyZXNldERpcnR5KCk6IHZvaWQge1xuICAgIHRoaXMuZGlydHkgPSB7XG4gICAgICBhdHRyaWJ1dGVzOiB7fSwgLy8gU2ltcGxlIGtleS12YWx1ZVxuICAgICAgcmVsYXRpb25zaGlwczoge30gLy8gcmVsTmFtZTogRGVsdGFbXVxuICAgIH07XG4gIH1cblxuICBnZXQob3B0czogc3RyaW5nIHwgc3RyaW5nW10gPSAnYXR0cmlidXRlcycpOiBQcm9taXNlPFQ+IHtcbiAgICAvLyBJZiBvcHRzIGlzIGZhbHN5IChpLmUuLCB1bmRlZmluZWQpLCBnZXQgYXR0cmlidXRlc1xuICAgIC8vIE90aGVyd2lzZSwgZ2V0IHdoYXQgd2FzIHJlcXVlc3RlZCxcbiAgICAvLyB3cmFwcGluZyB0aGUgcmVxdWVzdCBpbiBhIEFycmF5IGlmIGl0IHdhc24ndCBhbHJlYWR5IG9uZVxuICAgIGNvbnN0IGtleXMgPSBvcHRzICYmICFBcnJheS5pc0FycmF5KG9wdHMpID8gW29wdHNdIDogb3B0cyBhcyBzdHJpbmdbXTtcbiAgICByZXR1cm4gdGhpcy5wbHVtcC5nZXQodGhpcywga2V5cykudGhlbihzZWxmID0+IHtcbiAgICAgIGlmICghc2VsZiAmJiB0aGlzLmRpcnR5RmllbGRzKCkubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfSBlbHNlIGlmICh0aGlzLmRpcnR5RmllbGRzKCkubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHJldHVybiBzZWxmO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSBNb2RlbC5yZXNvbHZlQW5kT3ZlcmxheSh0aGlzLmRpcnR5LCBzZWxmIHx8IHVuZGVmaW5lZCk7XG4gICAgICAgIHJldHVybiBtZXJnZU9wdGlvbnMoXG4gICAgICAgICAge30sXG4gICAgICAgICAgc2VsZiB8fCB7IGlkOiB0aGlzLmlkLCB0eXBlOiB0aGlzLnR5cGUgfSxcbiAgICAgICAgICByZXNvbHZlZFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgYnVsa0dldCgpOiBQcm9taXNlPFQ+IHtcbiAgICByZXR1cm4gdGhpcy5wbHVtcC5idWxrR2V0KHRoaXMpIGFzIFByb21pc2U8VD47XG4gIH1cblxuICAvLyBUT0RPOiBTaG91bGQgJHNhdmUgdWx0aW1hdGVseSByZXR1cm4gdGhpcy5nZXQoKT9cbiAgc2F2ZSgpOiBQcm9taXNlPFQ+IHtcbiAgICBjb25zdCB1cGRhdGU6IERpcnR5TW9kZWwgPSBtZXJnZU9wdGlvbnMoXG4gICAgICB7IGlkOiB0aGlzLmlkLCB0eXBlOiB0aGlzLnR5cGUgfSxcbiAgICAgIHRoaXMuZGlydHlcbiAgICApO1xuICAgIHJldHVybiB0aGlzLnBsdW1wXG4gICAgICAuc2F2ZSh1cGRhdGUpXG4gICAgICAudGhlbih1cGRhdGVkID0+IHtcbiAgICAgICAgdGhpcy4kJHJlc2V0RGlydHkoKTtcbiAgICAgICAgaWYgKHVwZGF0ZWQuaWQpIHtcbiAgICAgICAgICB0aGlzLmlkID0gdXBkYXRlZC5pZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5nZXQoKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgfSk7XG4gIH1cblxuICBzZXQodXBkYXRlKTogdGhpcyB7XG4gICAgY29uc3QgZmxhdCA9IHVwZGF0ZS5hdHRyaWJ1dGVzIHx8IHVwZGF0ZTtcbiAgICAvLyBGaWx0ZXIgb3V0IG5vbi1hdHRyaWJ1dGUga2V5c1xuICAgIGNvbnN0IHNhbml0aXplZCA9IE9iamVjdC5rZXlzKGZsYXQpXG4gICAgICAuZmlsdGVyKGsgPT4gayBpbiB0aGlzLnNjaGVtYS5hdHRyaWJ1dGVzKVxuICAgICAgLm1hcChrID0+IHtcbiAgICAgICAgcmV0dXJuIHsgW2tdOiBmbGF0W2tdIH07XG4gICAgICB9KVxuICAgICAgLnJlZHVjZSgoYWNjLCBjdXJyKSA9PiBtZXJnZU9wdGlvbnMoYWNjLCBjdXJyKSwge30pO1xuXG4gICAgdGhpcy4kJGNvcHlWYWx1ZXNGcm9tKHNhbml0aXplZCk7XG4gICAgLy8gdGhpcy4kJGZpcmVVcGRhdGUoc2FuaXRpemVkKTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIGFzT2JzZXJ2YWJsZShcbiAgICBvcHRzOiBzdHJpbmcgfCBzdHJpbmdbXSA9IFsncmVsYXRpb25zaGlwcycsICdhdHRyaWJ1dGVzJ11cbiAgKTogUGx1bXBPYnNlcnZhYmxlPFQ+IHtcbiAgICBsZXQgZmllbGRzID0gQXJyYXkuaXNBcnJheShvcHRzKSA/IG9wdHMuY29uY2F0KCkgOiBbb3B0c107XG4gICAgaWYgKGZpZWxkcy5pbmRleE9mKCdyZWxhdGlvbnNoaXBzJykgPj0gMCkge1xuICAgICAgZmllbGRzID0gZmllbGRzLmNvbmNhdChcbiAgICAgICAgT2JqZWN0LmtleXModGhpcy5zY2hlbWEucmVsYXRpb25zaGlwcykubWFwKGsgPT4gYHJlbGF0aW9uc2hpcHMuJHtrfWApXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IGhvdHMgPSB0aGlzLnBsdW1wLmNhY2hlcy5maWx0ZXIocyA9PiBzLmhvdCh0aGlzKSk7XG4gICAgY29uc3QgY29sZHMgPSB0aGlzLnBsdW1wLmNhY2hlcy5maWx0ZXIocyA9PiAhcy5ob3QodGhpcykpO1xuICAgIGNvbnN0IHRlcm1pbmFsID0gdGhpcy5wbHVtcC50ZXJtaW5hbDtcblxuICAgIGNvbnN0IHByZWxvYWQkID0gT2JzZXJ2YWJsZS5mcm9tKGhvdHMpXG4gICAgICAuZmxhdE1hcCgoczogQ2FjaGVTdG9yZSkgPT4gT2JzZXJ2YWJsZS5mcm9tUHJvbWlzZShzLnJlYWQodGhpcywgZmllbGRzKSkpXG4gICAgICAuZGVmYXVsdElmRW1wdHkobnVsbClcbiAgICAgIC5mbGF0TWFwKHYgPT4ge1xuICAgICAgICBpZiAodiAhPT0gbnVsbCkge1xuICAgICAgICAgIHJldHVybiBPYnNlcnZhYmxlLm9mKHYpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnN0IHRlcm1pbmFsJCA9IE9ic2VydmFibGUuZnJvbVByb21pc2UodGVybWluYWwucmVhZCh0aGlzLCBmaWVsZHMpKTtcbiAgICAgICAgICBjb25zdCBjb2xkJCA9IE9ic2VydmFibGUuZnJvbShjb2xkcykuZmxhdE1hcCgoczogQ2FjaGVTdG9yZSkgPT5cbiAgICAgICAgICAgIE9ic2VydmFibGUuZnJvbVByb21pc2Uocy5yZWFkKHRoaXMsIGZpZWxkcykpXG4gICAgICAgICAgKTtcbiAgICAgICAgICAvLyAuc3RhcnRXaXRoKHVuZGVmaW5lZCk7XG4gICAgICAgICAgcmV0dXJuIE9ic2VydmFibGUubWVyZ2UodGVybWluYWwkLCBjb2xkJC50YWtlVW50aWwodGVybWluYWwkKSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIC8vIFRPRE86IGNhY2hlYWJsZSByZWFkc1xuICAgIC8vIGNvbnN0IHdhdGNoUmVhZCQgPSBPYnNlcnZhYmxlLmZyb20odGVybWluYWwpXG4gICAgLy8gLmZsYXRNYXAocyA9PiBzLnJlYWQkLmZpbHRlcih2ID0+IHYudHlwZSA9PT0gdGhpcy50eXBlICYmIHYuaWQgPT09IHRoaXMuaWQpKTtcbiAgICBjb25zdCB3YXRjaFdyaXRlJDogT2JzZXJ2YWJsZTxNb2RlbERhdGE+ID0gdGVybWluYWwud3JpdGUkXG4gICAgICAuZmlsdGVyKCh2OiBNb2RlbERlbHRhKSA9PiB7XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgdi50eXBlID09PSB0aGlzLnR5cGUgJiZcbiAgICAgICAgICB2LmlkID09PSB0aGlzLmlkICYmXG4gICAgICAgICAgdi5pbnZhbGlkYXRlLnNvbWUoaSA9PiBmaWVsZHMuaW5kZXhPZihpKSA+PSAwKVxuICAgICAgICApO1xuICAgICAgfSlcbiAgICAgIC5mbGF0TWFwVG8oXG4gICAgICAgIE9ic2VydmFibGUub2YodGVybWluYWwpLmZsYXRNYXAoKHM6IFRlcm1pbmFsU3RvcmUpID0+XG4gICAgICAgICAgT2JzZXJ2YWJsZS5mcm9tUHJvbWlzZShzLnJlYWQodGhpcywgZmllbGRzKSlcbiAgICAgICAgKVxuICAgICAgKTtcbiAgICAvLyApO1xuICAgIHJldHVybiBPYnNlcnZhYmxlLm1lcmdlKHByZWxvYWQkLCB3YXRjaFdyaXRlJCkubGV0KG9icyA9PiB7XG4gICAgICByZXR1cm4gbmV3IFBsdW1wT2JzZXJ2YWJsZSh0aGlzLnBsdW1wLCBvYnMpO1xuICAgIH0pIGFzIFBsdW1wT2JzZXJ2YWJsZTxUPjtcbiAgfVxuXG4gIHN1YnNjcmliZShjYjogT2JzZXJ2ZXI8VD4pOiBTdWJzY3JpcHRpb247XG4gIHN1YnNjcmliZShmaWVsZHM6IHN0cmluZyB8IHN0cmluZ1tdLCBjYjogT2JzZXJ2ZXI8VD4pOiBTdWJzY3JpcHRpb247XG4gIHN1YnNjcmliZShcbiAgICBhcmcxOiBPYnNlcnZlcjxUPiB8IHN0cmluZyB8IHN0cmluZ1tdLFxuICAgIGFyZzI/OiBPYnNlcnZlcjxUPlxuICApOiBTdWJzY3JpcHRpb24ge1xuICAgIGxldCBmaWVsZHM6IHN0cmluZ1tdID0gW107XG4gICAgbGV0IGNiOiBPYnNlcnZlcjxUPiA9IG51bGw7XG5cbiAgICBpZiAoYXJnMikge1xuICAgICAgY2IgPSBhcmcyO1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoYXJnMSkpIHtcbiAgICAgICAgZmllbGRzID0gYXJnMSBhcyBzdHJpbmdbXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZpZWxkcyA9IFthcmcxIGFzIHN0cmluZ107XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNiID0gYXJnMSBhcyBPYnNlcnZlcjxUPjtcbiAgICAgIGZpZWxkcyA9IFsnYXR0cmlidXRlcyddO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5hc09ic2VydmFibGUoZmllbGRzKS5zdWJzY3JpYmUoY2IpO1xuICB9XG5cbiAgZGVsZXRlKCkge1xuICAgIHJldHVybiB0aGlzLnBsdW1wLmRlbGV0ZSh0aGlzKTtcbiAgfVxuXG4gIC8vICRyZXN0KG9wdHMpIHtcbiAgLy8gICBjb25zdCByZXN0T3B0cyA9IE9iamVjdC5hc3NpZ24oXG4gIC8vICAgICB7fSxcbiAgLy8gICAgIG9wdHMsXG4gIC8vICAgICB7XG4gIC8vICAgICAgIHVybDogYC8ke3RoaXMuY29uc3RydWN0b3JbJ3R5cGUnXX0vJHt0aGlzLmlkfS8ke29wdHMudXJsfWAsXG4gIC8vICAgICB9XG4gIC8vICAgKTtcbiAgLy8gICByZXR1cm4gdGhpcy5wbHVtcC5yZXN0UmVxdWVzdChyZXN0T3B0cykudGhlbihyZXMgPT4gcmVzLmRhdGEpO1xuICAvLyB9XG5cbiAgYWRkKGtleTogc3RyaW5nLCBpdGVtOiBSZWxhdGlvbnNoaXBJdGVtKTogdGhpcyB7XG4gICAgaWYgKGtleSBpbiB0aGlzLnNjaGVtYS5yZWxhdGlvbnNoaXBzKSB7XG4gICAgICBpZiAoaXRlbS5pZCA+PSAxKSB7XG4gICAgICAgIGlmICh0aGlzLmRpcnR5LnJlbGF0aW9uc2hpcHNba2V5XSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgdGhpcy5kaXJ0eS5yZWxhdGlvbnNoaXBzW2tleV0gPSBbXTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuZGlydHkucmVsYXRpb25zaGlwc1trZXldLnB1c2goe1xuICAgICAgICAgIG9wOiAnYWRkJyxcbiAgICAgICAgICBkYXRhOiBpdGVtXG4gICAgICAgIH0pO1xuICAgICAgICAvLyB0aGlzLiQkZmlyZVVwZGF0ZSgpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBpdGVtIGFkZGVkIHRvIGhhc01hbnknKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgJGFkZCBleGNlcHQgdG8gaGFzTWFueSBmaWVsZCcpO1xuICAgIH1cbiAgfVxuXG4gIG1vZGlmeVJlbGF0aW9uc2hpcChrZXk6IHN0cmluZywgaXRlbTogUmVsYXRpb25zaGlwSXRlbSk6IHRoaXMge1xuICAgIGlmIChrZXkgaW4gdGhpcy5zY2hlbWEucmVsYXRpb25zaGlwcykge1xuICAgICAgaWYgKGl0ZW0uaWQgPj0gMSkge1xuICAgICAgICB0aGlzLmRpcnR5LnJlbGF0aW9uc2hpcHNba2V5XSA9IHRoaXMuZGlydHkucmVsYXRpb25zaGlwc1trZXldIHx8IFtdO1xuICAgICAgICB0aGlzLmRpcnR5LnJlbGF0aW9uc2hpcHNba2V5XS5wdXNoKHtcbiAgICAgICAgICBvcDogJ21vZGlmeScsXG4gICAgICAgICAgZGF0YTogaXRlbVxuICAgICAgICB9KTtcbiAgICAgICAgLy8gdGhpcy4kJGZpcmVVcGRhdGUoKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgaXRlbSBhZGRlZCB0byBoYXNNYW55Jyk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ2Fubm90ICRhZGQgZXhjZXB0IHRvIGhhc01hbnkgZmllbGQnKTtcbiAgICB9XG4gIH1cblxuICByZW1vdmUoa2V5OiBzdHJpbmcsIGl0ZW06IFJlbGF0aW9uc2hpcEl0ZW0pOiB0aGlzIHtcbiAgICBpZiAoa2V5IGluIHRoaXMuc2NoZW1hLnJlbGF0aW9uc2hpcHMpIHtcbiAgICAgIGlmIChpdGVtLmlkID49IDEpIHtcbiAgICAgICAgaWYgKCEoa2V5IGluIHRoaXMuZGlydHkucmVsYXRpb25zaGlwcykpIHtcbiAgICAgICAgICB0aGlzLmRpcnR5LnJlbGF0aW9uc2hpcHNba2V5XSA9IFtdO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZGlydHkucmVsYXRpb25zaGlwc1trZXldLnB1c2goe1xuICAgICAgICAgIG9wOiAncmVtb3ZlJyxcbiAgICAgICAgICBkYXRhOiBpdGVtXG4gICAgICAgIH0pO1xuICAgICAgICAvLyB0aGlzLiQkZmlyZVVwZGF0ZSgpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBpdGVtICRyZW1vdmVkIGZyb20gaGFzTWFueScpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCAkcmVtb3ZlIGV4Y2VwdCBmcm9tIGhhc01hbnkgZmllbGQnKTtcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgYXBwbHlEZWx0YShjdXJyZW50LCBkZWx0YSkge1xuICAgIGlmIChkZWx0YS5vcCA9PT0gJ2FkZCcgfHwgZGVsdGEub3AgPT09ICdtb2RpZnknKSB7XG4gICAgICBjb25zdCByZXRWYWwgPSBtZXJnZU9wdGlvbnMoe30sIGN1cnJlbnQsIGRlbHRhLmRhdGEpO1xuICAgICAgcmV0dXJuIHJldFZhbDtcbiAgICB9IGVsc2UgaWYgKGRlbHRhLm9wID09PSAncmVtb3ZlJykge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGN1cnJlbnQ7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHJlc29sdmVBbmRPdmVybGF5KFxuICAgIHVwZGF0ZSxcbiAgICBiYXNlOiB7IGF0dHJpYnV0ZXM/OiBhbnk7IHJlbGF0aW9uc2hpcHM/OiBhbnkgfSA9IHtcbiAgICAgIGF0dHJpYnV0ZXM6IHt9LFxuICAgICAgcmVsYXRpb25zaGlwczoge31cbiAgICB9XG4gICkge1xuICAgIGNvbnN0IGF0dHJpYnV0ZXMgPSBtZXJnZU9wdGlvbnMoe30sIGJhc2UuYXR0cmlidXRlcywgdXBkYXRlLmF0dHJpYnV0ZXMpO1xuICAgIGNvbnN0IHJlc29sdmVkUmVsYXRpb25zaGlwcyA9IHRoaXMucmVzb2x2ZVJlbGF0aW9uc2hpcHMoXG4gICAgICB1cGRhdGUucmVsYXRpb25zaGlwcyxcbiAgICAgIGJhc2UucmVsYXRpb25zaGlwc1xuICAgICk7XG4gICAgcmV0dXJuIHsgYXR0cmlidXRlcywgcmVsYXRpb25zaGlwczogcmVzb2x2ZWRSZWxhdGlvbnNoaXBzIH07XG4gIH1cblxuICBzdGF0aWMgcmVzb2x2ZVJlbGF0aW9uc2hpcHMoZGVsdGFzLCBiYXNlID0ge30pIHtcbiAgICBjb25zdCB1cGRhdGVzID0gT2JqZWN0LmtleXMoZGVsdGFzKVxuICAgICAgLm1hcChyZWxOYW1lID0+IHtcbiAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVSZWxhdGlvbnNoaXAoXG4gICAgICAgICAgZGVsdGFzW3JlbE5hbWVdLFxuICAgICAgICAgIGJhc2VbcmVsTmFtZV1cbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIHsgW3JlbE5hbWVdOiByZXNvbHZlZCB9O1xuICAgICAgfSlcbiAgICAgIC5yZWR1Y2UoKGFjYywgY3VycikgPT4gbWVyZ2VPcHRpb25zKGFjYywgY3VyciksIHt9KTtcbiAgICByZXR1cm4gbWVyZ2VPcHRpb25zKHt9LCBiYXNlLCB1cGRhdGVzKTtcbiAgfVxuXG4gIHN0YXRpYyByZXNvbHZlUmVsYXRpb25zaGlwKFxuICAgIGRlbHRhczogUmVsYXRpb25zaGlwRGVsdGFbXSxcbiAgICBiYXNlOiBSZWxhdGlvbnNoaXBJdGVtW10gPSBbXVxuICApIHtcbiAgICBjb25zdCByZXRWYWwgPSBiYXNlLmNvbmNhdCgpO1xuICAgIGRlbHRhcy5mb3JFYWNoKGRlbHRhID0+IHtcbiAgICAgIGlmIChkZWx0YS5vcCA9PT0gJ2FkZCcgfHwgZGVsdGEub3AgPT09ICdtb2RpZnknKSB7XG4gICAgICAgIGNvbnN0IGN1cnJlbnRJbmRleCA9IHJldFZhbC5maW5kSW5kZXgodiA9PiB2LmlkID09PSBkZWx0YS5kYXRhLmlkKTtcbiAgICAgICAgaWYgKGN1cnJlbnRJbmRleCA+PSAwKSB7XG4gICAgICAgICAgcmV0VmFsW2N1cnJlbnRJbmRleF0gPSBkZWx0YS5kYXRhO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldFZhbC5wdXNoKGRlbHRhLmRhdGEpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGRlbHRhLm9wID09PSAncmVtb3ZlJykge1xuICAgICAgICBjb25zdCBjdXJyZW50SW5kZXggPSByZXRWYWwuZmluZEluZGV4KHYgPT4gdi5pZCA9PT0gZGVsdGEuZGF0YS5pZCk7XG4gICAgICAgIGlmIChjdXJyZW50SW5kZXggPj0gMCkge1xuICAgICAgICAgIHJldFZhbC5zcGxpY2UoY3VycmVudEluZGV4LCAxKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiByZXRWYWw7XG4gIH1cbn1cbiJdfQ==
