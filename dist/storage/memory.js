'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MemoryStorage = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _bluebird = require('bluebird');

var Promise = _interopRequireWildcard(_bluebird);

var _keyValueStore = require('./keyValueStore');

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var $store = Symbol('$store');

var MemoryStorage = exports.MemoryStorage = function (_KeyValueStore) {
  _inherits(MemoryStorage, _KeyValueStore);

  function MemoryStorage() {
    var _ref;

    _classCallCheck(this, MemoryStorage);

    for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    var _this = _possibleConstructorReturn(this, (_ref = MemoryStorage.__proto__ || Object.getPrototypeOf(MemoryStorage)).call.apply(_ref, [this].concat(args)));

    _this[$store] = {};
    return _this;
  }

  _createClass(MemoryStorage, [{
    key: 'logStore',
    value: function logStore() {
      console.log(JSON.stringify(this[$store], null, 2));
    }
  }, {
    key: '_keys',
    value: function _keys(typeName) {
      return Promise.resolve(Object.keys(this[$store]).filter(function (k) {
        return k.indexOf(typeName + ':store:') === 0;
      }));
    }
  }, {
    key: '_get',
    value: function _get(k) {
      return Promise.resolve(this[$store][k] || null);
    }
  }, {
    key: '_set',
    value: function _set(k, v) {
      var _this2 = this;

      return Promise.resolve().then(function () {
        _this2[$store][k] = v;
      });
    }
  }, {
    key: '_del',
    value: function _del(k) {
      var _this3 = this;

      return Promise.resolve().then(function () {
        var retVal = _this3[$store][k];
        delete _this3[$store][k];
        return retVal;
      });
    }
  }]);

  return MemoryStorage;
}(_keyValueStore.KeyValueStore);
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInN0b3JhZ2UvbWVtb3J5LmpzIl0sIm5hbWVzIjpbIlByb21pc2UiLCIkc3RvcmUiLCJTeW1ib2wiLCJNZW1vcnlTdG9yYWdlIiwiYXJncyIsImNvbnNvbGUiLCJsb2ciLCJKU09OIiwic3RyaW5naWZ5IiwidHlwZU5hbWUiLCJyZXNvbHZlIiwiT2JqZWN0Iiwia2V5cyIsImZpbHRlciIsImsiLCJpbmRleE9mIiwidiIsInRoZW4iLCJyZXRWYWwiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFBOztJQUFZQSxPOztBQUNaOzs7Ozs7Ozs7O0FBRUEsSUFBTUMsU0FBU0MsT0FBTyxRQUFQLENBQWY7O0lBRWFDLGEsV0FBQUEsYTs7O0FBRVgsMkJBQXFCO0FBQUE7O0FBQUE7O0FBQUEsc0NBQU5DLElBQU07QUFBTkEsVUFBTTtBQUFBOztBQUFBLHlKQUNWQSxJQURVOztBQUVuQixVQUFLSCxNQUFMLElBQWUsRUFBZjtBQUZtQjtBQUdwQjs7OzsrQkFFVTtBQUNUSSxjQUFRQyxHQUFSLENBQVlDLEtBQUtDLFNBQUwsQ0FBZSxLQUFLUCxNQUFMLENBQWYsRUFBNkIsSUFBN0IsRUFBbUMsQ0FBbkMsQ0FBWjtBQUNEOzs7MEJBRUtRLFEsRUFBVTtBQUNkLGFBQU9ULFFBQVFVLE9BQVIsQ0FBZ0JDLE9BQU9DLElBQVAsQ0FBWSxLQUFLWCxNQUFMLENBQVosRUFBMEJZLE1BQTFCLENBQWlDLFVBQUNDLENBQUQ7QUFBQSxlQUFPQSxFQUFFQyxPQUFGLENBQWFOLFFBQWIsa0JBQW9DLENBQTNDO0FBQUEsT0FBakMsQ0FBaEIsQ0FBUDtBQUNEOzs7eUJBRUlLLEMsRUFBRztBQUNOLGFBQU9kLFFBQVFVLE9BQVIsQ0FBZ0IsS0FBS1QsTUFBTCxFQUFhYSxDQUFiLEtBQW1CLElBQW5DLENBQVA7QUFDRDs7O3lCQUVJQSxDLEVBQUdFLEMsRUFBRztBQUFBOztBQUNULGFBQU9oQixRQUFRVSxPQUFSLEdBQ05PLElBRE0sQ0FDRCxZQUFNO0FBQ1YsZUFBS2hCLE1BQUwsRUFBYWEsQ0FBYixJQUFrQkUsQ0FBbEI7QUFDRCxPQUhNLENBQVA7QUFJRDs7O3lCQUVJRixDLEVBQUc7QUFBQTs7QUFDTixhQUFPZCxRQUFRVSxPQUFSLEdBQ05PLElBRE0sQ0FDRCxZQUFNO0FBQ1YsWUFBTUMsU0FBUyxPQUFLakIsTUFBTCxFQUFhYSxDQUFiLENBQWY7QUFDQSxlQUFPLE9BQUtiLE1BQUwsRUFBYWEsQ0FBYixDQUFQO0FBQ0EsZUFBT0ksTUFBUDtBQUNELE9BTE0sQ0FBUDtBQU1EIiwiZmlsZSI6InN0b3JhZ2UvbWVtb3J5LmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgUHJvbWlzZSBmcm9tICdibHVlYmlyZCc7XG5pbXBvcnQgeyBLZXlWYWx1ZVN0b3JlIH0gZnJvbSAnLi9rZXlWYWx1ZVN0b3JlJztcblxuY29uc3QgJHN0b3JlID0gU3ltYm9sKCckc3RvcmUnKTtcblxuZXhwb3J0IGNsYXNzIE1lbW9yeVN0b3JhZ2UgZXh0ZW5kcyBLZXlWYWx1ZVN0b3JlIHtcblxuICBjb25zdHJ1Y3RvciguLi5hcmdzKSB7XG4gICAgc3VwZXIoLi4uYXJncyk7XG4gICAgdGhpc1skc3RvcmVdID0ge307XG4gIH1cblxuICBsb2dTdG9yZSgpIHtcbiAgICBjb25zb2xlLmxvZyhKU09OLnN0cmluZ2lmeSh0aGlzWyRzdG9yZV0sIG51bGwsIDIpKTtcbiAgfVxuXG4gIF9rZXlzKHR5cGVOYW1lKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShPYmplY3Qua2V5cyh0aGlzWyRzdG9yZV0pLmZpbHRlcigoaykgPT4gay5pbmRleE9mKGAke3R5cGVOYW1lfTpzdG9yZTpgKSA9PT0gMCkpO1xuICB9XG5cbiAgX2dldChrKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzWyRzdG9yZV1ba10gfHwgbnVsbCk7XG4gIH1cblxuICBfc2V0KGssIHYpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICB0aGlzWyRzdG9yZV1ba10gPSB2O1xuICAgIH0pO1xuICB9XG5cbiAgX2RlbChrKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgY29uc3QgcmV0VmFsID0gdGhpc1skc3RvcmVdW2tdO1xuICAgICAgZGVsZXRlIHRoaXNbJHN0b3JlXVtrXTtcbiAgICAgIHJldHVybiByZXRWYWw7XG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==
