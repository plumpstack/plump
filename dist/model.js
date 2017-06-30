"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var mergeOptions = require("merge-options");
var rxjs_1 = require("rxjs");
var plumpObservable_1 = require("./plumpObservable");
var Model = (function () {
    function Model(opts, plump) {
        this.plump = plump;
        this.error = null;
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
        return this.plump
            .get(this, keys)
            .catch(function (e) {
            _this.error = e;
            return null;
        })
            .then(function (self) {
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

//# sourceMappingURL=data:application/json;charset=utf8;base64,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QkFDakMsSUFBTSxZQUFZLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxVQUFBLENBQUMsSUFBSSxPQUFBLENBQUMsQ0FBQyxFQUFFLEtBQUssS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQXRCLENBQXNCLENBQUMsQ0FBQztnQkFDbkUsRUFBRSxDQUFDLENBQUMsWUFBWSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ3RCLE1BQU0sQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUNqQyxDQUFDO1lBQ0gsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxDQUFDLE1BQU0sQ0FBQztJQUNoQixDQUFDO0lBaFZNLFVBQUksR0FBRyxNQUFNLENBQUM7SUFDZCxZQUFNLEdBQWdCO1FBQzNCLFdBQVcsRUFBRSxJQUFJO1FBQ2pCLElBQUksRUFBRSxNQUFNO1FBQ1osVUFBVSxFQUFFLEVBQUU7UUFDZCxhQUFhLEVBQUUsRUFBRTtLQUNsQixDQUFDO0lBMlVKLFlBQUM7Q0FuVkQsQUFtVkMsSUFBQTtBQW5WWSxzQkFBSyIsImZpbGUiOiJtb2RlbC5qcyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIG1lcmdlT3B0aW9ucyBmcm9tICdtZXJnZS1vcHRpb25zJztcbmltcG9ydCB7IE9ic2VydmFibGUsIFN1YnNjcmlwdGlvbiwgT2JzZXJ2ZXIgfSBmcm9tICdyeGpzJztcblxuaW1wb3J0IHtcbiAgTW9kZWxEYXRhLFxuICBNb2RlbERlbHRhLFxuICBNb2RlbFNjaGVtYSxcbiAgRGlydHlWYWx1ZXMsXG4gIERpcnR5TW9kZWwsXG4gIFJlbGF0aW9uc2hpcERlbHRhLFxuICBSZWxhdGlvbnNoaXBJdGVtLFxuICBDYWNoZVN0b3JlLFxuICBUZXJtaW5hbFN0b3JlXG59IGZyb20gJy4vZGF0YVR5cGVzJztcblxuaW1wb3J0IHsgUGx1bXAgfSBmcm9tICcuL3BsdW1wJztcbmltcG9ydCB7IFBsdW1wT2JzZXJ2YWJsZSB9IGZyb20gJy4vcGx1bXBPYnNlcnZhYmxlJztcbmltcG9ydCB7IFBsdW1wRXJyb3IgfSBmcm9tICcuL2Vycm9ycyc7XG5cbi8vIFRPRE86IGZpZ3VyZSBvdXQgd2hlcmUgZXJyb3IgZXZlbnRzIG9yaWdpbmF0ZSAoc3RvcmFnZSBvciBtb2RlbClcbi8vIGFuZCB3aG8ga2VlcHMgYSByb2xsLWJhY2thYmxlIGRlbHRhXG5cbmV4cG9ydCBjbGFzcyBNb2RlbDxUIGV4dGVuZHMgTW9kZWxEYXRhPiB7XG4gIGlkOiBzdHJpbmcgfCBudW1iZXI7XG4gIHN0YXRpYyB0eXBlID0gJ0JBU0UnO1xuICBzdGF0aWMgc2NoZW1hOiBNb2RlbFNjaGVtYSA9IHtcbiAgICBpZEF0dHJpYnV0ZTogJ2lkJyxcbiAgICBuYW1lOiAnQkFTRScsXG4gICAgYXR0cmlidXRlczoge30sXG4gICAgcmVsYXRpb25zaGlwczoge31cbiAgfTtcblxuICBwdWJsaWMgZXJyb3I6IFBsdW1wRXJyb3I7XG5cbiAgcHJpdmF0ZSBkaXJ0eTogRGlydHlWYWx1ZXM7XG5cbiAgZ2V0IHR5cGUoKSB7XG4gICAgcmV0dXJuIHRoaXMuY29uc3RydWN0b3JbJ3R5cGUnXTtcbiAgfVxuXG4gIGdldCBzY2hlbWEoKSB7XG4gICAgcmV0dXJuIHRoaXMuY29uc3RydWN0b3JbJ3NjaGVtYSddO1xuICB9XG5cbiAgZGlydHlGaWVsZHMoKSB7XG4gICAgcmV0dXJuIE9iamVjdC5rZXlzKHRoaXMuZGlydHkuYXR0cmlidXRlcylcbiAgICAgIC5maWx0ZXIoayA9PiBrICE9PSB0aGlzLnNjaGVtYS5pZEF0dHJpYnV0ZSlcbiAgICAgIC5jb25jYXQoT2JqZWN0LmtleXModGhpcy5kaXJ0eS5yZWxhdGlvbnNoaXBzKSk7XG4gIH1cblxuICBjb25zdHJ1Y3RvcihvcHRzLCBwcml2YXRlIHBsdW1wOiBQbHVtcCkge1xuICAgIC8vIFRPRE86IERlZmluZSBEZWx0YSBpbnRlcmZhY2VcbiAgICB0aGlzLmVycm9yID0gbnVsbDtcbiAgICBpZiAodGhpcy50eXBlID09PSAnQkFTRScpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXG4gICAgICAgICdDYW5ub3QgaW5zdGFudGlhdGUgYmFzZSBwbHVtcCBNb2RlbHMsIHBsZWFzZSBzdWJjbGFzcyB3aXRoIGEgc2NoZW1hIGFuZCB2YWxpZCB0eXBlJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICB0aGlzLmRpcnR5ID0ge1xuICAgICAgYXR0cmlidXRlczoge30sIC8vIFNpbXBsZSBrZXktdmFsdWVcbiAgICAgIHJlbGF0aW9uc2hpcHM6IHt9IC8vIHJlbE5hbWU6IERlbHRhW11cbiAgICB9O1xuICAgIHRoaXMuJCRjb3B5VmFsdWVzRnJvbShvcHRzKTtcbiAgICAvLyB0aGlzLiQkZmlyZVVwZGF0ZShvcHRzKTtcbiAgfVxuXG4gICQkY29weVZhbHVlc0Zyb20ob3B0cyA9IHt9KTogdm9pZCB7XG4gICAgLy8gY29uc3QgaWRGaWVsZCA9IHRoaXMuY29uc3RydWN0b3IuJGlkIGluIG9wdHMgPyB0aGlzLmNvbnN0cnVjdG9yLiRpZCA6ICdpZCc7XG4gICAgLy8gdGhpc1t0aGlzLmNvbnN0cnVjdG9yLiRpZF0gPSBvcHRzW2lkRmllbGRdIHx8IHRoaXMuaWQ7XG4gICAgaWYgKHRoaXMuaWQgPT09IHVuZGVmaW5lZCAmJiBvcHRzW3RoaXMuc2NoZW1hLmlkQXR0cmlidXRlXSkge1xuICAgICAgdGhpcy5pZCA9IG9wdHNbdGhpcy5zY2hlbWEuaWRBdHRyaWJ1dGVdO1xuICAgIH1cbiAgICB0aGlzLmRpcnR5ID0gbWVyZ2VPcHRpb25zKHRoaXMuZGlydHksIHsgYXR0cmlidXRlczogb3B0cyB9KTtcbiAgfVxuXG4gICQkcmVzZXREaXJ0eSgpOiB2b2lkIHtcbiAgICB0aGlzLmRpcnR5ID0ge1xuICAgICAgYXR0cmlidXRlczoge30sIC8vIFNpbXBsZSBrZXktdmFsdWVcbiAgICAgIHJlbGF0aW9uc2hpcHM6IHt9IC8vIHJlbE5hbWU6IERlbHRhW11cbiAgICB9O1xuICB9XG5cbiAgZ2V0KG9wdHM6IHN0cmluZyB8IHN0cmluZ1tdID0gJ2F0dHJpYnV0ZXMnKTogUHJvbWlzZTxUPiB7XG4gICAgLy8gSWYgb3B0cyBpcyBmYWxzeSAoaS5lLiwgdW5kZWZpbmVkKSwgZ2V0IGF0dHJpYnV0ZXNcbiAgICAvLyBPdGhlcndpc2UsIGdldCB3aGF0IHdhcyByZXF1ZXN0ZWQsXG4gICAgLy8gd3JhcHBpbmcgdGhlIHJlcXVlc3QgaW4gYSBBcnJheSBpZiBpdCB3YXNuJ3QgYWxyZWFkeSBvbmVcbiAgICBjb25zdCBrZXlzID0gb3B0cyAmJiAhQXJyYXkuaXNBcnJheShvcHRzKSA/IFtvcHRzXSA6IG9wdHMgYXMgc3RyaW5nW107XG4gICAgcmV0dXJuIHRoaXMucGx1bXBcbiAgICAgIC5nZXQodGhpcywga2V5cylcbiAgICAgIC5jYXRjaCgoZTogUGx1bXBFcnJvcikgPT4ge1xuICAgICAgICB0aGlzLmVycm9yID0gZTtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9KVxuICAgICAgLnRoZW4oc2VsZiA9PiB7XG4gICAgICAgIGlmICghc2VsZiAmJiB0aGlzLmRpcnR5RmllbGRzKCkubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5kaXJ0eUZpZWxkcygpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIHJldHVybiBzZWxmO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnN0IHJlc29sdmVkID0gTW9kZWwucmVzb2x2ZUFuZE92ZXJsYXkoXG4gICAgICAgICAgICB0aGlzLmRpcnR5LFxuICAgICAgICAgICAgc2VsZiB8fCB1bmRlZmluZWRcbiAgICAgICAgICApO1xuICAgICAgICAgIHJldHVybiBtZXJnZU9wdGlvbnMoXG4gICAgICAgICAgICB7fSxcbiAgICAgICAgICAgIHNlbGYgfHwgeyBpZDogdGhpcy5pZCwgdHlwZTogdGhpcy50eXBlIH0sXG4gICAgICAgICAgICByZXNvbHZlZFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgYnVsa0dldCgpOiBQcm9taXNlPFQ+IHtcbiAgICByZXR1cm4gdGhpcy5wbHVtcC5idWxrR2V0KHRoaXMpIGFzIFByb21pc2U8VD47XG4gIH1cblxuICAvLyBUT0RPOiBTaG91bGQgJHNhdmUgdWx0aW1hdGVseSByZXR1cm4gdGhpcy5nZXQoKT9cbiAgc2F2ZSgpOiBQcm9taXNlPFQ+IHtcbiAgICBjb25zdCB1cGRhdGU6IERpcnR5TW9kZWwgPSBtZXJnZU9wdGlvbnMoXG4gICAgICB7IGlkOiB0aGlzLmlkLCB0eXBlOiB0aGlzLnR5cGUgfSxcbiAgICAgIHRoaXMuZGlydHlcbiAgICApO1xuICAgIHJldHVybiB0aGlzLnBsdW1wXG4gICAgICAuc2F2ZSh1cGRhdGUpXG4gICAgICAudGhlbih1cGRhdGVkID0+IHtcbiAgICAgICAgdGhpcy4kJHJlc2V0RGlydHkoKTtcbiAgICAgICAgaWYgKHVwZGF0ZWQuaWQpIHtcbiAgICAgICAgICB0aGlzLmlkID0gdXBkYXRlZC5pZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5nZXQoKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgfSk7XG4gIH1cblxuICBzZXQodXBkYXRlKTogdGhpcyB7XG4gICAgY29uc3QgZmxhdCA9IHVwZGF0ZS5hdHRyaWJ1dGVzIHx8IHVwZGF0ZTtcbiAgICAvLyBGaWx0ZXIgb3V0IG5vbi1hdHRyaWJ1dGUga2V5c1xuICAgIGNvbnN0IHNhbml0aXplZCA9IE9iamVjdC5rZXlzKGZsYXQpXG4gICAgICAuZmlsdGVyKGsgPT4gayBpbiB0aGlzLnNjaGVtYS5hdHRyaWJ1dGVzKVxuICAgICAgLm1hcChrID0+IHtcbiAgICAgICAgcmV0dXJuIHsgW2tdOiBmbGF0W2tdIH07XG4gICAgICB9KVxuICAgICAgLnJlZHVjZSgoYWNjLCBjdXJyKSA9PiBtZXJnZU9wdGlvbnMoYWNjLCBjdXJyKSwge30pO1xuXG4gICAgdGhpcy4kJGNvcHlWYWx1ZXNGcm9tKHNhbml0aXplZCk7XG4gICAgLy8gdGhpcy4kJGZpcmVVcGRhdGUoc2FuaXRpemVkKTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIGFzT2JzZXJ2YWJsZShcbiAgICBvcHRzOiBzdHJpbmcgfCBzdHJpbmdbXSA9IFsncmVsYXRpb25zaGlwcycsICdhdHRyaWJ1dGVzJ11cbiAgKTogUGx1bXBPYnNlcnZhYmxlPFQ+IHtcbiAgICBsZXQgZmllbGRzID0gQXJyYXkuaXNBcnJheShvcHRzKSA/IG9wdHMuY29uY2F0KCkgOiBbb3B0c107XG4gICAgaWYgKGZpZWxkcy5pbmRleE9mKCdyZWxhdGlvbnNoaXBzJykgPj0gMCkge1xuICAgICAgZmllbGRzID0gZmllbGRzLmNvbmNhdChcbiAgICAgICAgT2JqZWN0LmtleXModGhpcy5zY2hlbWEucmVsYXRpb25zaGlwcykubWFwKGsgPT4gYHJlbGF0aW9uc2hpcHMuJHtrfWApXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IGhvdHMgPSB0aGlzLnBsdW1wLmNhY2hlcy5maWx0ZXIocyA9PiBzLmhvdCh0aGlzKSk7XG4gICAgY29uc3QgY29sZHMgPSB0aGlzLnBsdW1wLmNhY2hlcy5maWx0ZXIocyA9PiAhcy5ob3QodGhpcykpO1xuICAgIGNvbnN0IHRlcm1pbmFsID0gdGhpcy5wbHVtcC50ZXJtaW5hbDtcblxuICAgIGNvbnN0IHByZWxvYWQkID0gT2JzZXJ2YWJsZS5mcm9tKGhvdHMpXG4gICAgICAuZmxhdE1hcCgoczogQ2FjaGVTdG9yZSkgPT4gT2JzZXJ2YWJsZS5mcm9tUHJvbWlzZShzLnJlYWQodGhpcywgZmllbGRzKSkpXG4gICAgICAuZGVmYXVsdElmRW1wdHkobnVsbClcbiAgICAgIC5mbGF0TWFwKHYgPT4ge1xuICAgICAgICBpZiAodiAhPT0gbnVsbCkge1xuICAgICAgICAgIHJldHVybiBPYnNlcnZhYmxlLm9mKHYpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnN0IHRlcm1pbmFsJCA9IE9ic2VydmFibGUuZnJvbVByb21pc2UodGVybWluYWwucmVhZCh0aGlzLCBmaWVsZHMpKTtcbiAgICAgICAgICBjb25zdCBjb2xkJCA9IE9ic2VydmFibGUuZnJvbShjb2xkcykuZmxhdE1hcCgoczogQ2FjaGVTdG9yZSkgPT5cbiAgICAgICAgICAgIE9ic2VydmFibGUuZnJvbVByb21pc2Uocy5yZWFkKHRoaXMsIGZpZWxkcykpXG4gICAgICAgICAgKTtcbiAgICAgICAgICAvLyAuc3RhcnRXaXRoKHVuZGVmaW5lZCk7XG4gICAgICAgICAgcmV0dXJuIE9ic2VydmFibGUubWVyZ2UodGVybWluYWwkLCBjb2xkJC50YWtlVW50aWwodGVybWluYWwkKSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIC8vIFRPRE86IGNhY2hlYWJsZSByZWFkc1xuICAgIC8vIGNvbnN0IHdhdGNoUmVhZCQgPSBPYnNlcnZhYmxlLmZyb20odGVybWluYWwpXG4gICAgLy8gLmZsYXRNYXAocyA9PiBzLnJlYWQkLmZpbHRlcih2ID0+IHYudHlwZSA9PT0gdGhpcy50eXBlICYmIHYuaWQgPT09IHRoaXMuaWQpKTtcbiAgICBjb25zdCB3YXRjaFdyaXRlJDogT2JzZXJ2YWJsZTxNb2RlbERhdGE+ID0gdGVybWluYWwud3JpdGUkXG4gICAgICAuZmlsdGVyKCh2OiBNb2RlbERlbHRhKSA9PiB7XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgdi50eXBlID09PSB0aGlzLnR5cGUgJiZcbiAgICAgICAgICB2LmlkID09PSB0aGlzLmlkICYmXG4gICAgICAgICAgdi5pbnZhbGlkYXRlLnNvbWUoaSA9PiBmaWVsZHMuaW5kZXhPZihpKSA+PSAwKVxuICAgICAgICApO1xuICAgICAgfSlcbiAgICAgIC5mbGF0TWFwVG8oXG4gICAgICAgIE9ic2VydmFibGUub2YodGVybWluYWwpLmZsYXRNYXAoKHM6IFRlcm1pbmFsU3RvcmUpID0+XG4gICAgICAgICAgT2JzZXJ2YWJsZS5mcm9tUHJvbWlzZShzLnJlYWQodGhpcywgZmllbGRzKSlcbiAgICAgICAgKVxuICAgICAgKTtcbiAgICAvLyApO1xuICAgIHJldHVybiBPYnNlcnZhYmxlLm1lcmdlKHByZWxvYWQkLCB3YXRjaFdyaXRlJCkubGV0KG9icyA9PiB7XG4gICAgICByZXR1cm4gbmV3IFBsdW1wT2JzZXJ2YWJsZSh0aGlzLnBsdW1wLCBvYnMpO1xuICAgIH0pIGFzIFBsdW1wT2JzZXJ2YWJsZTxUPjtcbiAgfVxuXG4gIHN1YnNjcmliZShjYjogT2JzZXJ2ZXI8VD4pOiBTdWJzY3JpcHRpb247XG4gIHN1YnNjcmliZShmaWVsZHM6IHN0cmluZyB8IHN0cmluZ1tdLCBjYjogT2JzZXJ2ZXI8VD4pOiBTdWJzY3JpcHRpb247XG4gIHN1YnNjcmliZShcbiAgICBhcmcxOiBPYnNlcnZlcjxUPiB8IHN0cmluZyB8IHN0cmluZ1tdLFxuICAgIGFyZzI/OiBPYnNlcnZlcjxUPlxuICApOiBTdWJzY3JpcHRpb24ge1xuICAgIGxldCBmaWVsZHM6IHN0cmluZ1tdID0gW107XG4gICAgbGV0IGNiOiBPYnNlcnZlcjxUPiA9IG51bGw7XG5cbiAgICBpZiAoYXJnMikge1xuICAgICAgY2IgPSBhcmcyO1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoYXJnMSkpIHtcbiAgICAgICAgZmllbGRzID0gYXJnMSBhcyBzdHJpbmdbXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZpZWxkcyA9IFthcmcxIGFzIHN0cmluZ107XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNiID0gYXJnMSBhcyBPYnNlcnZlcjxUPjtcbiAgICAgIGZpZWxkcyA9IFsnYXR0cmlidXRlcyddO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5hc09ic2VydmFibGUoZmllbGRzKS5zdWJzY3JpYmUoY2IpO1xuICB9XG5cbiAgZGVsZXRlKCkge1xuICAgIHJldHVybiB0aGlzLnBsdW1wLmRlbGV0ZSh0aGlzKTtcbiAgfVxuXG4gIC8vICRyZXN0KG9wdHMpIHtcbiAgLy8gICBjb25zdCByZXN0T3B0cyA9IE9iamVjdC5hc3NpZ24oXG4gIC8vICAgICB7fSxcbiAgLy8gICAgIG9wdHMsXG4gIC8vICAgICB7XG4gIC8vICAgICAgIHVybDogYC8ke3RoaXMuY29uc3RydWN0b3JbJ3R5cGUnXX0vJHt0aGlzLmlkfS8ke29wdHMudXJsfWAsXG4gIC8vICAgICB9XG4gIC8vICAgKTtcbiAgLy8gICByZXR1cm4gdGhpcy5wbHVtcC5yZXN0UmVxdWVzdChyZXN0T3B0cykudGhlbihyZXMgPT4gcmVzLmRhdGEpO1xuICAvLyB9XG5cbiAgYWRkKGtleTogc3RyaW5nLCBpdGVtOiBSZWxhdGlvbnNoaXBJdGVtKTogdGhpcyB7XG4gICAgaWYgKGtleSBpbiB0aGlzLnNjaGVtYS5yZWxhdGlvbnNoaXBzKSB7XG4gICAgICBpZiAoaXRlbS5pZCA+PSAxKSB7XG4gICAgICAgIGlmICh0aGlzLmRpcnR5LnJlbGF0aW9uc2hpcHNba2V5XSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgdGhpcy5kaXJ0eS5yZWxhdGlvbnNoaXBzW2tleV0gPSBbXTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuZGlydHkucmVsYXRpb25zaGlwc1trZXldLnB1c2goe1xuICAgICAgICAgIG9wOiAnYWRkJyxcbiAgICAgICAgICBkYXRhOiBpdGVtXG4gICAgICAgIH0pO1xuICAgICAgICAvLyB0aGlzLiQkZmlyZVVwZGF0ZSgpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBpdGVtIGFkZGVkIHRvIGhhc01hbnknKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgJGFkZCBleGNlcHQgdG8gaGFzTWFueSBmaWVsZCcpO1xuICAgIH1cbiAgfVxuXG4gIG1vZGlmeVJlbGF0aW9uc2hpcChrZXk6IHN0cmluZywgaXRlbTogUmVsYXRpb25zaGlwSXRlbSk6IHRoaXMge1xuICAgIGlmIChrZXkgaW4gdGhpcy5zY2hlbWEucmVsYXRpb25zaGlwcykge1xuICAgICAgaWYgKGl0ZW0uaWQgPj0gMSkge1xuICAgICAgICB0aGlzLmRpcnR5LnJlbGF0aW9uc2hpcHNba2V5XSA9IHRoaXMuZGlydHkucmVsYXRpb25zaGlwc1trZXldIHx8IFtdO1xuICAgICAgICB0aGlzLmRpcnR5LnJlbGF0aW9uc2hpcHNba2V5XS5wdXNoKHtcbiAgICAgICAgICBvcDogJ21vZGlmeScsXG4gICAgICAgICAgZGF0YTogaXRlbVxuICAgICAgICB9KTtcbiAgICAgICAgLy8gdGhpcy4kJGZpcmVVcGRhdGUoKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgaXRlbSBhZGRlZCB0byBoYXNNYW55Jyk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ2Fubm90ICRhZGQgZXhjZXB0IHRvIGhhc01hbnkgZmllbGQnKTtcbiAgICB9XG4gIH1cblxuICByZW1vdmUoa2V5OiBzdHJpbmcsIGl0ZW06IFJlbGF0aW9uc2hpcEl0ZW0pOiB0aGlzIHtcbiAgICBpZiAoa2V5IGluIHRoaXMuc2NoZW1hLnJlbGF0aW9uc2hpcHMpIHtcbiAgICAgIGlmIChpdGVtLmlkID49IDEpIHtcbiAgICAgICAgaWYgKCEoa2V5IGluIHRoaXMuZGlydHkucmVsYXRpb25zaGlwcykpIHtcbiAgICAgICAgICB0aGlzLmRpcnR5LnJlbGF0aW9uc2hpcHNba2V5XSA9IFtdO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZGlydHkucmVsYXRpb25zaGlwc1trZXldLnB1c2goe1xuICAgICAgICAgIG9wOiAncmVtb3ZlJyxcbiAgICAgICAgICBkYXRhOiBpdGVtXG4gICAgICAgIH0pO1xuICAgICAgICAvLyB0aGlzLiQkZmlyZVVwZGF0ZSgpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBpdGVtICRyZW1vdmVkIGZyb20gaGFzTWFueScpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCAkcmVtb3ZlIGV4Y2VwdCBmcm9tIGhhc01hbnkgZmllbGQnKTtcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgYXBwbHlEZWx0YShjdXJyZW50LCBkZWx0YSkge1xuICAgIGlmIChkZWx0YS5vcCA9PT0gJ2FkZCcgfHwgZGVsdGEub3AgPT09ICdtb2RpZnknKSB7XG4gICAgICBjb25zdCByZXRWYWwgPSBtZXJnZU9wdGlvbnMoe30sIGN1cnJlbnQsIGRlbHRhLmRhdGEpO1xuICAgICAgcmV0dXJuIHJldFZhbDtcbiAgICB9IGVsc2UgaWYgKGRlbHRhLm9wID09PSAncmVtb3ZlJykge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGN1cnJlbnQ7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHJlc29sdmVBbmRPdmVybGF5KFxuICAgIHVwZGF0ZSxcbiAgICBiYXNlOiB7IGF0dHJpYnV0ZXM/OiBhbnk7IHJlbGF0aW9uc2hpcHM/OiBhbnkgfSA9IHtcbiAgICAgIGF0dHJpYnV0ZXM6IHt9LFxuICAgICAgcmVsYXRpb25zaGlwczoge31cbiAgICB9XG4gICkge1xuICAgIGNvbnN0IGF0dHJpYnV0ZXMgPSBtZXJnZU9wdGlvbnMoe30sIGJhc2UuYXR0cmlidXRlcywgdXBkYXRlLmF0dHJpYnV0ZXMpO1xuICAgIGNvbnN0IHJlc29sdmVkUmVsYXRpb25zaGlwcyA9IHRoaXMucmVzb2x2ZVJlbGF0aW9uc2hpcHMoXG4gICAgICB1cGRhdGUucmVsYXRpb25zaGlwcyxcbiAgICAgIGJhc2UucmVsYXRpb25zaGlwc1xuICAgICk7XG4gICAgcmV0dXJuIHsgYXR0cmlidXRlcywgcmVsYXRpb25zaGlwczogcmVzb2x2ZWRSZWxhdGlvbnNoaXBzIH07XG4gIH1cblxuICBzdGF0aWMgcmVzb2x2ZVJlbGF0aW9uc2hpcHMoZGVsdGFzLCBiYXNlID0ge30pIHtcbiAgICBjb25zdCB1cGRhdGVzID0gT2JqZWN0LmtleXMoZGVsdGFzKVxuICAgICAgLm1hcChyZWxOYW1lID0+IHtcbiAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVSZWxhdGlvbnNoaXAoXG4gICAgICAgICAgZGVsdGFzW3JlbE5hbWVdLFxuICAgICAgICAgIGJhc2VbcmVsTmFtZV1cbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIHsgW3JlbE5hbWVdOiByZXNvbHZlZCB9O1xuICAgICAgfSlcbiAgICAgIC5yZWR1Y2UoKGFjYywgY3VycikgPT4gbWVyZ2VPcHRpb25zKGFjYywgY3VyciksIHt9KTtcbiAgICByZXR1cm4gbWVyZ2VPcHRpb25zKHt9LCBiYXNlLCB1cGRhdGVzKTtcbiAgfVxuXG4gIHN0YXRpYyByZXNvbHZlUmVsYXRpb25zaGlwKFxuICAgIGRlbHRhczogUmVsYXRpb25zaGlwRGVsdGFbXSxcbiAgICBiYXNlOiBSZWxhdGlvbnNoaXBJdGVtW10gPSBbXVxuICApIHtcbiAgICBjb25zdCByZXRWYWwgPSBiYXNlLmNvbmNhdCgpO1xuICAgIGRlbHRhcy5mb3JFYWNoKGRlbHRhID0+IHtcbiAgICAgIGlmIChkZWx0YS5vcCA9PT0gJ2FkZCcgfHwgZGVsdGEub3AgPT09ICdtb2RpZnknKSB7XG4gICAgICAgIGNvbnN0IGN1cnJlbnRJbmRleCA9IHJldFZhbC5maW5kSW5kZXgodiA9PiB2LmlkID09PSBkZWx0YS5kYXRhLmlkKTtcbiAgICAgICAgaWYgKGN1cnJlbnRJbmRleCA+PSAwKSB7XG4gICAgICAgICAgcmV0VmFsW2N1cnJlbnRJbmRleF0gPSBkZWx0YS5kYXRhO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldFZhbC5wdXNoKGRlbHRhLmRhdGEpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGRlbHRhLm9wID09PSAncmVtb3ZlJykge1xuICAgICAgICBjb25zdCBjdXJyZW50SW5kZXggPSByZXRWYWwuZmluZEluZGV4KHYgPT4gdi5pZCA9PT0gZGVsdGEuZGF0YS5pZCk7XG4gICAgICAgIGlmIChjdXJyZW50SW5kZXggPj0gMCkge1xuICAgICAgICAgIHJldFZhbC5zcGxpY2UoY3VycmVudEluZGV4LCAxKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiByZXRWYWw7XG4gIH1cbn1cbiJdfQ==
