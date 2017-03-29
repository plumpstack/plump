"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Rx_1 = require("rxjs/Rx");
var Bluebird = require("bluebird");
var Plump = (function () {
    function Plump() {
        this.teardownSubject = new Rx_1.Subject();
        this.storage = [];
        this.types = {};
        this.destroy$ = this.teardownSubject.asObservable();
    }
    Plump.prototype.addType = function (T) {
        var _this = this;
        if (this.types[T.typeName] === undefined) {
            this.types[T.typeName] = T;
            return Bluebird.all(this.storage.map(function (s) { return s.addSchema(T); })).then(function () {
                if (_this.terminal) {
                    _this.terminal.addSchema(T);
                }
            });
        }
        else {
            return Bluebird.reject("Duplicate Type registered: " + T.typeName);
        }
    };
    Plump.prototype.type = function (T) {
        return this.types[T];
    };
    Plump.prototype.addStore = function (store) {
        var _this = this;
        if (store.terminal) {
            if (this.terminal !== undefined) {
                throw new Error('cannot have more than one terminal store');
            }
            else {
                this.terminal = store;
                this.storage.forEach(function (cacheStore) {
                    cacheStore.wire(store, _this.destroy$);
                });
            }
        }
        else {
            this.storage.push(store);
            if (this.terminal !== undefined) {
                store.wire(this.terminal, this.destroy$);
            }
        }
        return store.addSchemas(Object.keys(this.types).map(function (k) { return _this.types[k]; }));
    };
    Plump.prototype.find = function (t, id) {
        var Type = typeof t === 'string' ? this.types[t] : t;
        return new Type((_a = {}, _a[Type.schema.idAttribute] = id, _a), this);
        var _a;
    };
    Plump.prototype.forge = function (t, val) {
        var Type = typeof t === 'string' ? this.types[t] : t;
        return new Type(val, this);
    };
    Plump.prototype.teardown = function () {
        this.teardownSubject.next('done');
    };
    Plump.prototype.get = function (value, opts) {
        var _this = this;
        if (opts === void 0) { opts = ['attributes']; }
        var keys = opts && !Array.isArray(opts) ? [opts] : opts;
        return this.storage.reduce(function (thenable, storage) {
            return thenable.then(function (v) {
                if (v !== null) {
                    return v;
                }
                else if (storage.hot(value)) {
                    return storage.read(value, keys);
                }
                else {
                    return null;
                }
            });
        }, Bluebird.resolve(null))
            .then(function (v) {
            if (((v === null) || (v.attributes === null)) && (_this.terminal)) {
                return _this.terminal.read(value, keys);
            }
            else {
                return v;
            }
        });
    };
    // bulkGet(type, id) {
    //   return this.terminal.bulkRead(type, id);
    // }
    Plump.prototype.save = function (value) {
        var _this = this;
        if (this.terminal) {
            return Bluebird.resolve()
                .then(function () {
                if (Object.keys(value.attributes).length > 0) {
                    return _this.terminal.writeAttributes({
                        attributes: value.attributes,
                        id: value.id,
                        typeName: value.typeName,
                    });
                }
                else {
                    return {
                        id: value.id,
                        typeName: value.typeName,
                    };
                }
            })
                .then(function (updated) {
                if (value.relationships && Object.keys(value.relationships).length > 0) {
                    return Bluebird.all(Object.keys(value.relationships).map(function (relName) {
                        return value.relationships[relName].reduce(function (thenable, delta) {
                            return thenable.then(function () {
                                if (delta.op === 'add') {
                                    return _this.terminal.writeRelationshipItem(updated, relName, delta.data);
                                }
                                else if (delta.op === 'remove') {
                                    return _this.terminal.deleteRelationshipItem(updated, relName, delta.data);
                                }
                                else if (delta.op === 'modify') {
                                    return _this.terminal.writeRelationshipItem(updated, relName, delta.data);
                                }
                                else {
                                    throw new Error("Unknown relationship delta " + JSON.stringify(delta));
                                }
                            });
                        }, Bluebird.resolve());
                    })).then(function () { return updated; });
                }
                else {
                    return updated;
                }
            });
        }
        else {
            return Bluebird.reject(new Error('Plump has no terminal store'));
        }
    };
    Plump.prototype.delete = function (item) {
        var _this = this;
        if (this.terminal) {
            return this.terminal.delete(item).then(function () {
                return Bluebird.all(_this.storage.map(function (store) {
                    return store.delete(item);
                }));
            });
        }
        else {
            return Bluebird.reject(new Error('Plump has no terminal store'));
        }
    };
    Plump.prototype.add = function (item, relName, child) {
        if (this.terminal) {
            return this.terminal.writeRelationshipItem(item, relName, child);
        }
        else {
            return Bluebird.reject(new Error('Plump has no terminal store'));
        }
    };
    // restRequest(opts) {
    //   if (this.terminal && this.terminal.rest) {
    //     return this.terminal.rest(opts);
    //   } else {
    //     return Bluebird.reject(new Error('No Rest terminal store'));
    //   }
    // }
    Plump.prototype.modifyRelationship = function (item, relName, child) {
        return this.add(item, relName, child);
    };
    Plump.prototype.query = function (q) {
        return this.terminal.query(q);
    };
    Plump.prototype.deleteRelationshipItem = function (item, relName, child) {
        if (this.terminal) {
            return this.terminal.deleteRelationshipItem(item, relName, child);
        }
        else {
            return Bluebird.reject(new Error('Plump has no terminal store'));
        }
    };
    Plump.prototype.invalidate = function (item, field) {
        var fields = Array.isArray(field) ? field : [field];
        this.terminal.fireWriteUpdate({ typeName: item.typeName, id: item.id, invalidate: fields });
    };
    return Plump;
}());
exports.Plump = Plump;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInBsdW1wLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsOEJBQThDO0FBQzlDLG1DQUFxQztBQWNyQztJQVNFO1FBQ0UsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLFlBQU8sRUFBRSxDQUFDO1FBQ3JDLElBQUksQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1FBQ2xCLElBQUksQ0FBQyxLQUFLLEdBQUcsRUFBRSxDQUFDO1FBQ2hCLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxZQUFZLEVBQUUsQ0FBQztJQUN0RCxDQUFDO0lBRUQsdUJBQU8sR0FBUCxVQUFRLENBQWU7UUFBdkIsaUJBYUM7UUFaQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQ3pDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUMzQixNQUFNLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FDakIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBQSxDQUFDLElBQUksT0FBQSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFkLENBQWMsQ0FBQyxDQUN0QyxDQUFDLElBQUksQ0FBQztnQkFDTCxFQUFFLENBQUMsQ0FBQyxLQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztvQkFDbEIsS0FBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzdCLENBQUM7WUFDSCxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNOLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLGdDQUE4QixDQUFDLENBQUMsUUFBVSxDQUFDLENBQUM7UUFDckUsQ0FBQztJQUNILENBQUM7SUFFRCxvQkFBSSxHQUFKLFVBQUssQ0FBUztRQUNaLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3ZCLENBQUM7SUFFRCx3QkFBUSxHQUFSLFVBQVMsS0FBYztRQUF2QixpQkFtQkM7UUFsQkMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7WUFDbkIsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDO2dCQUNoQyxNQUFNLElBQUksS0FBSyxDQUFDLDBDQUEwQyxDQUFDLENBQUM7WUFDOUQsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNOLElBQUksQ0FBQyxRQUFRLEdBQUcsS0FBSyxDQUFDO2dCQUN0QixJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFDLFVBQVU7b0JBQzlCLFVBQVUsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLEtBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDeEMsQ0FBQyxDQUFDLENBQUM7WUFDTCxDQUFDO1FBQ0gsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ04sSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDekIsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDO2dCQUNoQyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQzNDLENBQUM7UUFDSCxDQUFDO1FBQ0QsTUFBTSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQ3JCLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxVQUFBLENBQUMsSUFBSSxPQUFBLEtBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQWIsQ0FBYSxDQUFDLENBQ2hELENBQUM7SUFDSixDQUFDO0lBRUQsb0JBQUksR0FBSixVQUFLLENBQUMsRUFBRSxFQUFFO1FBQ1IsSUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLEtBQUssUUFBUSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3ZELE1BQU0sQ0FBQyxJQUFJLElBQUksV0FBRyxHQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxJQUFHLEVBQUUsT0FBSSxJQUFJLENBQUMsQ0FBQzs7SUFDM0QsQ0FBQztJQUVELHFCQUFLLEdBQUwsVUFBTSxDQUFDLEVBQUUsR0FBRztRQUNWLElBQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxLQUFLLFFBQVEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN2RCxNQUFNLENBQUMsSUFBSSxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQzdCLENBQUM7SUFFRCx3QkFBUSxHQUFSO1FBQ0UsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDcEMsQ0FBQztJQUVELG1CQUFHLEdBQUgsVUFBSSxLQUFxQixFQUFFLElBQStCO1FBQTFELGlCQW9CQztRQXBCMEIscUJBQUEsRUFBQSxRQUFrQixZQUFZLENBQUM7UUFDeEQsSUFBTSxJQUFJLEdBQUcsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQztRQUMxRCxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsVUFBQyxRQUFRLEVBQUUsT0FBTztZQUMzQyxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxVQUFDLENBQUM7Z0JBQ3JCLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUNmLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQ1gsQ0FBQztnQkFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQzlCLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFDbkMsQ0FBQztnQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFDTixNQUFNLENBQUMsSUFBSSxDQUFDO2dCQUNkLENBQUM7WUFDSCxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUMsRUFBRSxRQUFRLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO2FBQ3pCLElBQUksQ0FBQyxVQUFDLENBQUM7WUFDTixFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFVBQVUsS0FBSyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDakUsTUFBTSxDQUFDLEtBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztZQUN6QyxDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ04sTUFBTSxDQUFDLENBQUMsQ0FBQztZQUNYLENBQUM7UUFDSCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRCxzQkFBc0I7SUFDdEIsNkNBQTZDO0lBQzdDLElBQUk7SUFFSixvQkFBSSxHQUFKLFVBQUssS0FBaUI7UUFBdEIsaUJBeUNDO1FBeENDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1lBQ2xCLE1BQU0sQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFFO2lCQUN4QixJQUFJLENBQUM7Z0JBQ0osRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQzdDLE1BQU0sQ0FBQyxLQUFJLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQzt3QkFDbkMsVUFBVSxFQUFFLEtBQUssQ0FBQyxVQUFVO3dCQUM1QixFQUFFLEVBQUUsS0FBSyxDQUFDLEVBQUU7d0JBQ1osUUFBUSxFQUFFLEtBQUssQ0FBQyxRQUFRO3FCQUN6QixDQUFDLENBQUM7Z0JBQ0wsQ0FBQztnQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFDTixNQUFNLENBQUM7d0JBQ0wsRUFBRSxFQUFFLEtBQUssQ0FBQyxFQUFFO3dCQUNaLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUTtxQkFDekIsQ0FBQztnQkFDSixDQUFDO1lBQ0gsQ0FBQyxDQUFDO2lCQUNELElBQUksQ0FBQyxVQUFDLE9BQU87Z0JBQ1osRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLGFBQWEsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDdkUsTUFBTSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLENBQUMsR0FBRyxDQUFDLFVBQUMsT0FBTzt3QkFDL0QsTUFBTSxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDLFVBQUMsUUFBb0MsRUFBRSxLQUFLOzRCQUNyRixNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQztnQ0FDbkIsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLEVBQUUsS0FBSyxLQUFLLENBQUMsQ0FBQyxDQUFDO29DQUN2QixNQUFNLENBQUMsS0FBSSxDQUFDLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztnQ0FDM0UsQ0FBQztnQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLEVBQUUsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDO29DQUNqQyxNQUFNLENBQUMsS0FBSSxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztnQ0FDNUUsQ0FBQztnQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLEVBQUUsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDO29DQUNqQyxNQUFNLENBQUMsS0FBSSxDQUFDLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztnQ0FDM0UsQ0FBQztnQ0FBQyxJQUFJLENBQUMsQ0FBQztvQ0FDTixNQUFNLElBQUksS0FBSyxDQUFDLGdDQUE4QixJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBRyxDQUFDLENBQUM7Z0NBQ3pFLENBQUM7NEJBQ0gsQ0FBQyxDQUFDLENBQUM7d0JBQ0wsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO29CQUN6QixDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxjQUFNLE9BQUEsT0FBTyxFQUFQLENBQU8sQ0FBQyxDQUFDO2dCQUMxQixDQUFDO2dCQUFDLElBQUksQ0FBQyxDQUFDO29CQUNOLE1BQU0sQ0FBQyxPQUFPLENBQUM7Z0JBQ2pCLENBQUM7WUFDSCxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNOLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLDZCQUE2QixDQUFDLENBQUMsQ0FBQztRQUNuRSxDQUFDO0lBQ0gsQ0FBQztJQUVELHNCQUFNLEdBQU4sVUFBTyxJQUFvQjtRQUEzQixpQkFVQztRQVRDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1lBQ2xCLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUM7Z0JBQ3JDLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEtBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQUMsS0FBSztvQkFDekMsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQzVCLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDTixDQUFDLENBQUMsQ0FBQztRQUNMLENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNOLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLDZCQUE2QixDQUFDLENBQUMsQ0FBQztRQUNuRSxDQUFDO0lBQ0gsQ0FBQztJQUVELG1CQUFHLEdBQUgsVUFBSSxJQUFvQixFQUFFLE9BQWUsRUFBRSxLQUF1QjtRQUNoRSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztZQUNsQixNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ25FLENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNOLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLDZCQUE2QixDQUFDLENBQUMsQ0FBQztRQUNuRSxDQUFDO0lBQ0gsQ0FBQztJQUVELHNCQUFzQjtJQUN0QiwrQ0FBK0M7SUFDL0MsdUNBQXVDO0lBQ3ZDLGFBQWE7SUFDYixtRUFBbUU7SUFDbkUsTUFBTTtJQUNOLElBQUk7SUFFSixrQ0FBa0IsR0FBbEIsVUFBbUIsSUFBb0IsRUFBRSxPQUFlLEVBQUUsS0FBdUI7UUFDL0UsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQztJQUN4QyxDQUFDO0lBRUQscUJBQUssR0FBTCxVQUFNLENBQU07UUFDVixNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDaEMsQ0FBQztJQUVELHNDQUFzQixHQUF0QixVQUF1QixJQUFvQixFQUFFLE9BQWUsRUFBRSxLQUF1QjtRQUNuRixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztZQUNsQixNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3BFLENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNOLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLDZCQUE2QixDQUFDLENBQUMsQ0FBQztRQUNuRSxDQUFDO0lBQ0gsQ0FBQztJQUVELDBCQUFVLEdBQVYsVUFBVyxJQUFvQixFQUFFLEtBQXlCO1FBQ3hELElBQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsS0FBSyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDdEQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsRUFBRSxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxFQUFFLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRyxVQUFVLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUMvRixDQUFDO0lBQ0gsWUFBQztBQUFELENBM0xBLEFBMkxDLElBQUE7QUEzTFksc0JBQUsiLCJmaWxlIjoicGx1bXAuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBTdWJqZWN0LCBPYnNlcnZhYmxlIH0gZnJvbSAncnhqcy9SeCc7XG5pbXBvcnQgKiBhcyBCbHVlYmlyZCBmcm9tICdibHVlYmlyZCc7XG5cbmltcG9ydCB7IFN0b3JhZ2UgfSBmcm9tICcuL3N0b3JhZ2Uvc3RvcmFnZSc7XG5pbXBvcnQgeyBNb2RlbCB9IGZyb20gJy4vbW9kZWwnO1xuaW1wb3J0IHtcbiAgLy8gSW5kZWZpbml0ZU1vZGVsRGF0YSxcbiAgTW9kZWxEYXRhLFxuICAvLyBNb2RlbERlbHRhLFxuICAvLyBNb2RlbFNjaGVtYSxcbiAgTW9kZWxSZWZlcmVuY2UsXG4gIERpcnR5TW9kZWwsXG4gIFJlbGF0aW9uc2hpcEl0ZW0sXG59IGZyb20gJy4vZGF0YVR5cGVzJztcblxuZXhwb3J0IGNsYXNzIFBsdW1wIHtcblxuICBkZXN0cm95JDogT2JzZXJ2YWJsZTxzdHJpbmc+O1xuXG4gIHByaXZhdGUgdGVhcmRvd25TdWJqZWN0OiBTdWJqZWN0PHN0cmluZz47XG4gIHByaXZhdGUgc3RvcmFnZTogU3RvcmFnZVtdO1xuICBwcml2YXRlIHR5cGVzOiB7IFt0eXBlOiBzdHJpbmddOiB0eXBlb2YgTW9kZWwgfTtcbiAgcHJpdmF0ZSB0ZXJtaW5hbDogU3RvcmFnZTtcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLnRlYXJkb3duU3ViamVjdCA9IG5ldyBTdWJqZWN0KCk7XG4gICAgdGhpcy5zdG9yYWdlID0gW107XG4gICAgdGhpcy50eXBlcyA9IHt9O1xuICAgIHRoaXMuZGVzdHJveSQgPSB0aGlzLnRlYXJkb3duU3ViamVjdC5hc09ic2VydmFibGUoKTtcbiAgfVxuXG4gIGFkZFR5cGUoVDogdHlwZW9mIE1vZGVsKTogQmx1ZWJpcmQ8dm9pZD4ge1xuICAgIGlmICh0aGlzLnR5cGVzW1QudHlwZU5hbWVdID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHRoaXMudHlwZXNbVC50eXBlTmFtZV0gPSBUO1xuICAgICAgcmV0dXJuIEJsdWViaXJkLmFsbChcbiAgICAgICAgdGhpcy5zdG9yYWdlLm1hcChzID0+IHMuYWRkU2NoZW1hKFQpKVxuICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgaWYgKHRoaXMudGVybWluYWwpIHtcbiAgICAgICAgICB0aGlzLnRlcm1pbmFsLmFkZFNjaGVtYShUKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBCbHVlYmlyZC5yZWplY3QoYER1cGxpY2F0ZSBUeXBlIHJlZ2lzdGVyZWQ6ICR7VC50eXBlTmFtZX1gKTtcbiAgICB9XG4gIH1cblxuICB0eXBlKFQ6IHN0cmluZyk6IHR5cGVvZiBNb2RlbCB7XG4gICAgcmV0dXJuIHRoaXMudHlwZXNbVF07XG4gIH1cblxuICBhZGRTdG9yZShzdG9yZTogU3RvcmFnZSk6IEJsdWViaXJkPHZvaWQ+IHtcbiAgICBpZiAoc3RvcmUudGVybWluYWwpIHtcbiAgICAgIGlmICh0aGlzLnRlcm1pbmFsICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdjYW5ub3QgaGF2ZSBtb3JlIHRoYW4gb25lIHRlcm1pbmFsIHN0b3JlJyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnRlcm1pbmFsID0gc3RvcmU7XG4gICAgICAgIHRoaXMuc3RvcmFnZS5mb3JFYWNoKChjYWNoZVN0b3JlKSA9PiB7XG4gICAgICAgICAgY2FjaGVTdG9yZS53aXJlKHN0b3JlLCB0aGlzLmRlc3Ryb3kkKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuc3RvcmFnZS5wdXNoKHN0b3JlKTtcbiAgICAgIGlmICh0aGlzLnRlcm1pbmFsICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgc3RvcmUud2lyZSh0aGlzLnRlcm1pbmFsLCB0aGlzLmRlc3Ryb3kkKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHN0b3JlLmFkZFNjaGVtYXMoXG4gICAgICBPYmplY3Qua2V5cyh0aGlzLnR5cGVzKS5tYXAoayA9PiB0aGlzLnR5cGVzW2tdKVxuICAgICk7XG4gIH1cblxuICBmaW5kKHQsIGlkKTogTW9kZWwge1xuICAgIGNvbnN0IFR5cGUgPSB0eXBlb2YgdCA9PT0gJ3N0cmluZycgPyB0aGlzLnR5cGVzW3RdIDogdDtcbiAgICByZXR1cm4gbmV3IFR5cGUoeyBbVHlwZS5zY2hlbWEuaWRBdHRyaWJ1dGVdOiBpZCB9LCB0aGlzKTtcbiAgfVxuXG4gIGZvcmdlKHQsIHZhbCk6IE1vZGVsIHtcbiAgICBjb25zdCBUeXBlID0gdHlwZW9mIHQgPT09ICdzdHJpbmcnID8gdGhpcy50eXBlc1t0XSA6IHQ7XG4gICAgcmV0dXJuIG5ldyBUeXBlKHZhbCwgdGhpcyk7XG4gIH1cblxuICB0ZWFyZG93bigpOiB2b2lkIHtcbiAgICB0aGlzLnRlYXJkb3duU3ViamVjdC5uZXh0KCdkb25lJyk7XG4gIH1cblxuICBnZXQodmFsdWU6IE1vZGVsUmVmZXJlbmNlLCBvcHRzOiBzdHJpbmdbXSA9IFsnYXR0cmlidXRlcyddKTogQmx1ZWJpcmQ8TW9kZWxEYXRhPiB7XG4gICAgY29uc3Qga2V5cyA9IG9wdHMgJiYgIUFycmF5LmlzQXJyYXkob3B0cykgPyBbb3B0c10gOiBvcHRzO1xuICAgIHJldHVybiB0aGlzLnN0b3JhZ2UucmVkdWNlKCh0aGVuYWJsZSwgc3RvcmFnZSkgPT4ge1xuICAgICAgcmV0dXJuIHRoZW5hYmxlLnRoZW4oKHYpID0+IHtcbiAgICAgICAgaWYgKHYgIT09IG51bGwpIHtcbiAgICAgICAgICByZXR1cm4gdjtcbiAgICAgICAgfSBlbHNlIGlmIChzdG9yYWdlLmhvdCh2YWx1ZSkpIHtcbiAgICAgICAgICByZXR1cm4gc3RvcmFnZS5yZWFkKHZhbHVlLCBrZXlzKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSwgQmx1ZWJpcmQucmVzb2x2ZShudWxsKSlcbiAgICAudGhlbigodikgPT4ge1xuICAgICAgaWYgKCgodiA9PT0gbnVsbCkgfHwgKHYuYXR0cmlidXRlcyA9PT0gbnVsbCkpICYmICh0aGlzLnRlcm1pbmFsKSkge1xuICAgICAgICByZXR1cm4gdGhpcy50ZXJtaW5hbC5yZWFkKHZhbHVlLCBrZXlzKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB2O1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLy8gYnVsa0dldCh0eXBlLCBpZCkge1xuICAvLyAgIHJldHVybiB0aGlzLnRlcm1pbmFsLmJ1bGtSZWFkKHR5cGUsIGlkKTtcbiAgLy8gfVxuXG4gIHNhdmUodmFsdWU6IERpcnR5TW9kZWwpOiBCbHVlYmlyZDxNb2RlbERhdGE+IHtcbiAgICBpZiAodGhpcy50ZXJtaW5hbCkge1xuICAgICAgcmV0dXJuIEJsdWViaXJkLnJlc29sdmUoKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBpZiAoT2JqZWN0LmtleXModmFsdWUuYXR0cmlidXRlcykubGVuZ3RoID4gMCkge1xuICAgICAgICAgIHJldHVybiB0aGlzLnRlcm1pbmFsLndyaXRlQXR0cmlidXRlcyh7XG4gICAgICAgICAgICBhdHRyaWJ1dGVzOiB2YWx1ZS5hdHRyaWJ1dGVzLFxuICAgICAgICAgICAgaWQ6IHZhbHVlLmlkLFxuICAgICAgICAgICAgdHlwZU5hbWU6IHZhbHVlLnR5cGVOYW1lLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBpZDogdmFsdWUuaWQsXG4gICAgICAgICAgICB0eXBlTmFtZTogdmFsdWUudHlwZU5hbWUsXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC50aGVuKCh1cGRhdGVkKSA9PiB7XG4gICAgICAgIGlmICh2YWx1ZS5yZWxhdGlvbnNoaXBzICYmIE9iamVjdC5rZXlzKHZhbHVlLnJlbGF0aW9uc2hpcHMpLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICByZXR1cm4gQmx1ZWJpcmQuYWxsKE9iamVjdC5rZXlzKHZhbHVlLnJlbGF0aW9uc2hpcHMpLm1hcCgocmVsTmFtZSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlLnJlbGF0aW9uc2hpcHNbcmVsTmFtZV0ucmVkdWNlKCh0aGVuYWJsZTogQmx1ZWJpcmQ8dm9pZCB8IE1vZGVsRGF0YT4sIGRlbHRhKSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiB0aGVuYWJsZS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZGVsdGEub3AgPT09ICdhZGQnKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy50ZXJtaW5hbC53cml0ZVJlbGF0aW9uc2hpcEl0ZW0odXBkYXRlZCwgcmVsTmFtZSwgZGVsdGEuZGF0YSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChkZWx0YS5vcCA9PT0gJ3JlbW92ZScpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnRlcm1pbmFsLmRlbGV0ZVJlbGF0aW9uc2hpcEl0ZW0odXBkYXRlZCwgcmVsTmFtZSwgZGVsdGEuZGF0YSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChkZWx0YS5vcCA9PT0gJ21vZGlmeScpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnRlcm1pbmFsLndyaXRlUmVsYXRpb25zaGlwSXRlbSh1cGRhdGVkLCByZWxOYW1lLCBkZWx0YS5kYXRhKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHJlbGF0aW9uc2hpcCBkZWx0YSAke0pTT04uc3RyaW5naWZ5KGRlbHRhKX1gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSwgQmx1ZWJpcmQucmVzb2x2ZSgpKTtcbiAgICAgICAgICB9KSkudGhlbigoKSA9PiB1cGRhdGVkKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gdXBkYXRlZDtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBCbHVlYmlyZC5yZWplY3QobmV3IEVycm9yKCdQbHVtcCBoYXMgbm8gdGVybWluYWwgc3RvcmUnKSk7XG4gICAgfVxuICB9XG5cbiAgZGVsZXRlKGl0ZW06IE1vZGVsUmVmZXJlbmNlKTogQmx1ZWJpcmQ8dm9pZFtdPiB7XG4gICAgaWYgKHRoaXMudGVybWluYWwpIHtcbiAgICAgIHJldHVybiB0aGlzLnRlcm1pbmFsLmRlbGV0ZShpdGVtKS50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIEJsdWViaXJkLmFsbCh0aGlzLnN0b3JhZ2UubWFwKChzdG9yZSkgPT4ge1xuICAgICAgICAgIHJldHVybiBzdG9yZS5kZWxldGUoaXRlbSk7XG4gICAgICAgIH0pKTtcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gQmx1ZWJpcmQucmVqZWN0KG5ldyBFcnJvcignUGx1bXAgaGFzIG5vIHRlcm1pbmFsIHN0b3JlJykpO1xuICAgIH1cbiAgfVxuXG4gIGFkZChpdGVtOiBNb2RlbFJlZmVyZW5jZSwgcmVsTmFtZTogc3RyaW5nLCBjaGlsZDogUmVsYXRpb25zaGlwSXRlbSkge1xuICAgIGlmICh0aGlzLnRlcm1pbmFsKSB7XG4gICAgICByZXR1cm4gdGhpcy50ZXJtaW5hbC53cml0ZVJlbGF0aW9uc2hpcEl0ZW0oaXRlbSwgcmVsTmFtZSwgY2hpbGQpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gQmx1ZWJpcmQucmVqZWN0KG5ldyBFcnJvcignUGx1bXAgaGFzIG5vIHRlcm1pbmFsIHN0b3JlJykpO1xuICAgIH1cbiAgfVxuXG4gIC8vIHJlc3RSZXF1ZXN0KG9wdHMpIHtcbiAgLy8gICBpZiAodGhpcy50ZXJtaW5hbCAmJiB0aGlzLnRlcm1pbmFsLnJlc3QpIHtcbiAgLy8gICAgIHJldHVybiB0aGlzLnRlcm1pbmFsLnJlc3Qob3B0cyk7XG4gIC8vICAgfSBlbHNlIHtcbiAgLy8gICAgIHJldHVybiBCbHVlYmlyZC5yZWplY3QobmV3IEVycm9yKCdObyBSZXN0IHRlcm1pbmFsIHN0b3JlJykpO1xuICAvLyAgIH1cbiAgLy8gfVxuXG4gIG1vZGlmeVJlbGF0aW9uc2hpcChpdGVtOiBNb2RlbFJlZmVyZW5jZSwgcmVsTmFtZTogc3RyaW5nLCBjaGlsZDogUmVsYXRpb25zaGlwSXRlbSkge1xuICAgIHJldHVybiB0aGlzLmFkZChpdGVtLCByZWxOYW1lLCBjaGlsZCk7XG4gIH1cblxuICBxdWVyeShxOiBhbnkpOiBCbHVlYmlyZDxNb2RlbFJlZmVyZW5jZVtdPiB7XG4gICAgcmV0dXJuIHRoaXMudGVybWluYWwucXVlcnkocSk7XG4gIH1cblxuICBkZWxldGVSZWxhdGlvbnNoaXBJdGVtKGl0ZW06IE1vZGVsUmVmZXJlbmNlLCByZWxOYW1lOiBzdHJpbmcsIGNoaWxkOiBSZWxhdGlvbnNoaXBJdGVtKSB7XG4gICAgaWYgKHRoaXMudGVybWluYWwpIHtcbiAgICAgIHJldHVybiB0aGlzLnRlcm1pbmFsLmRlbGV0ZVJlbGF0aW9uc2hpcEl0ZW0oaXRlbSwgcmVsTmFtZSwgY2hpbGQpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gQmx1ZWJpcmQucmVqZWN0KG5ldyBFcnJvcignUGx1bXAgaGFzIG5vIHRlcm1pbmFsIHN0b3JlJykpO1xuICAgIH1cbiAgfVxuXG4gIGludmFsaWRhdGUoaXRlbTogTW9kZWxSZWZlcmVuY2UsIGZpZWxkPzogc3RyaW5nIHwgc3RyaW5nW10pOiB2b2lkIHtcbiAgICBjb25zdCBmaWVsZHMgPSBBcnJheS5pc0FycmF5KGZpZWxkKSA/IGZpZWxkIDogW2ZpZWxkXTtcbiAgICB0aGlzLnRlcm1pbmFsLmZpcmVXcml0ZVVwZGF0ZSh7IHR5cGVOYW1lOiBpdGVtLnR5cGVOYW1lLCBpZDogaXRlbS5pZCAsIGludmFsaWRhdGU6IGZpZWxkcyB9KTtcbiAgfVxufVxuIl19
