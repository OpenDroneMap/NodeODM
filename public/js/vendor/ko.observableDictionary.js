// Knockout Observable Dictionary
// (c) James Foster
// License: MIT (http://www.opensource.org/licenses/mit-license.php)

(function () {
    function DictionaryItem(key, value, dictionary) {
        var observableKey = new ko.observable(key);

        this.value = new ko.observable(value);
        this.key = new ko.computed({
            read: observableKey,
            write: function (newKey) {
                var current = observableKey();

                if (current == newKey) return;

                // no two items are allowed to share the same key.
                dictionary.remove(newKey);

                observableKey(newKey);
            }
        });
    }

    ko.observableDictionary = function (dictionary, keySelector, valueSelector) {
        var result = {};

        result.items = new ko.observableArray();

        result._wrappers = {};
        result._keySelector = keySelector || function (value, key) { return key; };
        result._valueSelector = valueSelector || function (value) { return value; };

        if (typeof keySelector == 'string') result._keySelector = function (value) { return value[keySelector]; };
        if (typeof valueSelector == 'string') result._valueSelector = function (value) { return value[valueSelector]; };

        ko.utils.extend(result, ko.observableDictionary['fn']);

        result.pushAll(dictionary);

        return result;
    };

    ko.observableDictionary['fn'] = {
        remove: function (valueOrPredicate) {
            var predicate = valueOrPredicate;

            if (valueOrPredicate instanceof DictionaryItem) {
                predicate = function (item) {
                    return item.key() === valueOrPredicate.key();
                };
            }
            else if (typeof valueOrPredicate != "function") {
                predicate = function (item) {
                    return item.key() === valueOrPredicate;
                };
            }

            ko.observableArray['fn'].remove.call(this.items, predicate);
        },

        push: function (key, value) {
            var item = null;

            if (key instanceof DictionaryItem) {
                // handle the case where only a DictionaryItem is passed in
                item = key;
                value = key.value();
                key = key.key();
            }

            if (value === undefined) {
                value = this._valueSelector(key);
                key = this._keySelector(value);
            }
            else {
                value = this._valueSelector(value);
            }

            var current = this.get(key, false);
            if (current) {
                // update existing value
                current(value);
                return current;
            }

            if (!item) {
                item = new DictionaryItem(key, value, this);
            }

            ko.observableArray['fn'].push.call(this.items, item);

            return value;
        },

        pushAll: function (dictionary) {
            var self = this;
            var items = self.items();

            if (dictionary instanceof Array) {
                $.each(dictionary, function (index, item) {
                    var key = self._keySelector(item, index);
                    var value = self._valueSelector(item);
                    items.push(new DictionaryItem(key, value, self));
                });
            }
            else {
                for (var prop in dictionary) {
                    if (dictionary.hasOwnProperty(prop)) {
                        var item = dictionary[prop];
                        var key = self._keySelector(item, prop);
                        var value = self._valueSelector(item);
                        items.push(new DictionaryItem(key, value, self));
                    }
                }
            }

            self.items.valueHasMutated();
        },

        sort: function (method) {
            if (method === undefined) {
                method = function (a, b) {
                    return defaultComparison(a.key(), b.key());
                };
            }

            return ko.observableArray['fn'].sort.call(this.items, method);
        },

        indexOf: function (key) {
            if (key instanceof DictionaryItem) {
                return ko.observableArray['fn'].indexOf.call(this.items, key);
            }

            var underlyingArray = this.items();
            for (var index = 0; index < underlyingArray.length; index++) {
                if (underlyingArray[index].key() == key)
                    return index;
            }
            return -1;
        },

        get: function (key, wrap) {
            if (wrap == false)
                return getValue(key, this.items());

            var wrapper = this._wrappers[key];

            if (wrapper == null) {
                wrapper = this._wrappers[key] = new ko.computed({
                    read: function () {
                        var value = getValue(key, this.items());
                        return value ? value() : null;
                    },
                    write: function (newValue) {
                        var value = getValue(key, this.items());

                        if (value)
                            value(newValue);
                        else
                            this.push(key, newValue);
                    }
                }, this);
            }

            return wrapper;
        },

        set: function (key, value) {
            return this.push(key, value);
        },

        keys: function () {
            return ko.utils.arrayMap(this.items(), function (item) { return item.key(); });
        },

        values: function () {
            return ko.utils.arrayMap(this.items(), function (item) { return item.value(); });
        },
        
        removeAll: function () {
            this.items.removeAll();
        },

        toJSON: function () {
            var result = {};
            var items = ko.utils.unwrapObservable(this.items);

            ko.utils.arrayForEach(items, function (item) {
                var key = ko.utils.unwrapObservable(item.key);
                var value = ko.utils.unwrapObservable(item.value);

                result[key] = value;
            });

            return result;
        }
    };

    function getValue(key, items) {
        var found = ko.utils.arrayFirst(items, function (item) {
            return item.key() == key;
        });
        return found ? found.value : null;
    }
})();


// Utility methods
// ---------------------------------------------
function isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}

function defaultComparison(a, b) {
    if (isNumeric(a) && isNumeric(b)) return a - b;

    a = a.toString();
    b = b.toString();

    return a == b ? 0 : (a < b ? -1 : 1);
}
// ---------------------------------------------
