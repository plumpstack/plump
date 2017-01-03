"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = unwrap;
function unwrap(value) {
  var valueStore = {};
  Object.keys(value.constructor.$fields).forEach(function (fieldName) {
    var field = value.constructor.$fields[fieldName];
    Object.defineProperty(valueStore, fieldName, {});
  });
}
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInVud3JhcC5qcyJdLCJuYW1lcyI6WyJ1bndyYXAiLCJ2YWx1ZSIsInZhbHVlU3RvcmUiLCJPYmplY3QiLCJrZXlzIiwiY29uc3RydWN0b3IiLCIkZmllbGRzIiwiZm9yRWFjaCIsImZpZWxkTmFtZSIsImZpZWxkIiwiZGVmaW5lUHJvcGVydHkiXSwibWFwcGluZ3MiOiI7Ozs7O2tCQUV3QkEsTTtBQUFULFNBQVNBLE1BQVQsQ0FBZ0JDLEtBQWhCLEVBQXVCO0FBQ3BDLE1BQU1DLGFBQWEsRUFBbkI7QUFDQUMsU0FBT0MsSUFBUCxDQUFZSCxNQUFNSSxXQUFOLENBQWtCQyxPQUE5QixFQUF1Q0MsT0FBdkMsQ0FBK0MsVUFBQ0MsU0FBRCxFQUFlO0FBQzVELFFBQU1DLFFBQVFSLE1BQU1JLFdBQU4sQ0FBa0JDLE9BQWxCLENBQTBCRSxTQUExQixDQUFkO0FBQ0FMLFdBQU9PLGNBQVAsQ0FBc0JSLFVBQXRCLEVBQWtDTSxTQUFsQyxFQUE2QyxFQUE3QztBQUNELEdBSEQ7QUFJRCIsImZpbGUiOiJ1bndyYXAuanMiLCJzb3VyY2VzQ29udGVudCI6WyJcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gdW53cmFwKHZhbHVlKSB7XG4gIGNvbnN0IHZhbHVlU3RvcmUgPSB7fTtcbiAgT2JqZWN0LmtleXModmFsdWUuY29uc3RydWN0b3IuJGZpZWxkcykuZm9yRWFjaCgoZmllbGROYW1lKSA9PiB7XG4gICAgY29uc3QgZmllbGQgPSB2YWx1ZS5jb25zdHJ1Y3Rvci4kZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHZhbHVlU3RvcmUsIGZpZWxkTmFtZSwge30pO1xuICB9KTtcbn1cbiJdfQ==
