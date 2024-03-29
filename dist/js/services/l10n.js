define('ember-l10n/services/l10n', ['exports', 'ember', 'i18n'], function (exports, _ember, _i18n) {
  'use strict';

  var computed = _ember['default'].computed;
  var Service = _ember['default'].Service;
  var inject = _ember['default'].inject;
  var Promise = _ember['default'].RSVP.Promise;
  var get = _ember['default'].get;
  var merge = _ember['default'].merge;
  var copy = _ember['default'].copy;
  var getTypeOf = _ember['default'].typeOf;
  var Evented = _ember['default'].Evented;
  var isNone = _ember['default'].isNone;

  /**
   * This service translates through gettext.js.
   * There are two available methods to be used
   * for translations message ids from JS source:
   *
   * - t(msgid, hash);
   * - n(msgid, msgidPlural, count, hash);
   *
   * Furthermore, there's an auto initialization
   * feature (default: true), which detects user's
   * locale according to system preferences. If the
   * user's locale is supported in `availableLocales`,
   * the corresponding translations are loaded. If the
   * user's locale is not supported, the default locale
   * will be used instead (default: 'en'). Please use the
   * following method to change locales:
   *
   * - setLocale(locale);
   *
   * The following utility methods are also availalbe:
   *
   * - hasLocale(locale);
   * - detectLocale();
   *
   * To configure the path of the JSON files (depending on
   * the path configured via gettext.sh extractor) use the
   * `jsonPath` property (default: '/assets/locales').
   *
   * @namespace Service
   * @class L10N
   * @extends Ember.Service
   * @extends Ember.Evented
   * @public
   */
  exports['default'] = Service.extend(Evented, {
    // -------------------------------------------------------------------------
    // Dependencies

    ajax: inject.service('l10n-ajax'),

    // -------------------------------------------------------------------------
    // Properties

    /**
     * Current locale from user, defaults
     * to 'defaultLocale' if not retrievable
     * or currently available due to missing
     * translations.
     *
     * @property locale
     * @type {String}
     * @default null
     * @public
     */
    locale: null,

    /**
     * Use this property if you want to force
     * a specific locale and skip automatic
     * detection of user's system settings.
     * This is useful for signed in users,
     * but beware that unsupported locales
     * will fallback to the default locale!
     *
     * @property forceLocale
     * @type {String}
     * @default null
     * @public
     */
    forceLocale: null,

    /**
     * Fallback locale for unavailable locales.
     *
     * @property defaultLocale
     * @type {String}
     * @default 'en'
     * @public
     */
    defaultLocale: 'en',

    /**
     * Will invoke a language detection or loads
     * language from `forceLanguage` on service
     * instantiation. If disabling, make sure to
     * set locale manually with setLocale().
     *
     * @property autoInitialize
     * @type {String}
     * @default null
     * @public
     */
    autoInitialize: true,

    /**
     * Directory containing JSON files with all
     * translations for corresponding locale.
     *
     * @property jsonPath
     * @type {String}
     * @default 'assets/locales'
     * @public
     */
    jsonPath: '/assets/locales',

    /**
     * A map of fingerprints per language.
     * Overwrite this with your actual fingerprint map!
     *
     * @property fingerprintMap
     * @type {Object}
     * @protected
     */
    fingerprintMap: null,

    /**
     * Currently available translations hash.
     *
     * @property availableLocales
     * @type {Object}
     * @public
     */
    availableLocales: computed(function () {
      return {
        'en': this.t('en')
      };
    }),

    /**
     * Cache persisting loaded JSON files to
     * avoid duplicated requests going out.
     *
     * @property _cache
     * @type {Object}
     * @default {}
     * @private
     */
    _cache: computed(function () {
      return {}; // complex type!
    }),

    /**
     * Reference to gettext library. This gets
     * lazily initialized within `init` method.
     *
     * @property _gettext
     * @type {String}
     * @default null
     * @private
     */
    _gettext: null,

    // -------------------------------------------------------------------------
    // Methods

    /**
     * Sets initial locale. If you want to to
     * skip language detection, please provide
     * `forceLocale` property with reopen().
     *
     * @method init
     * @return {Void}
     * @public
     */
    init: function init() {
      this._super.apply(this, arguments);
      this.set('_gettext', new _i18n['default']());
      if (!this.get('autoInitialize')) {
        return;
      }

      this.setLocale(this.detectLocale());
    },

    /**
     * Provides current locale. If not set,
     * delivers default locale.
     *
     * @method setLocale
     * @param {String} locale
     * @return {String}
     * @public
     */
    getLocale: function getLocale() {
      var defaultLocale = this.get('defaultLocale');
      var locale = this.get('locale');
      if (isNone(locale)) {
        return defaultLocale;
      }

      return locale;
    },

    /**
     * Sets active locale if available. Returns a
     * RSPV Promise for asynchronous JSON request.
     *
     * @method setLocale
     * @param {String} locale
     * @return {RSVP.Promise}
     * @public
     */
    setLocale: function setLocale(locale) {
      var _this = this;

      return new Promise(function (resolve, reject) {
        if (!_this.hasLocale(locale)) {
          reject();
          return;
        }

        var old = _this.getLocale();

        _this.set('locale', locale);
        _this.get('_gettext').setLocale(locale);

        var successCallback = function successCallback() {
          _this.notifyPropertyChange('locale');
          _this.notifyPropertyChange('availableLocales');

          resolve();
        };

        var failureCallback = function failureCallback() {
          try {
            _this.get('_gettext').setLocale(old);
            _this.set('locale', old);
          } catch (e) {}

          reject();
        };

        _this._loadJSON(locale).then(successCallback, failureCallback);
      });
    },

    /**
     * Checks if locale is available.
     *
     * @method setLocale
     * @param {String} locale
     * @return {Boolean}
     * @public
     */
    hasLocale: function hasLocale(locale) {
      var availableLocales = this.get('availableLocales');
      var hasLocale = !isNone(availableLocales[locale]);
      if (!hasLocale) {
        console.warn('l10n.js: Locale "' + locale + '" is not available!');
      }

      return hasLocale;
    },

    /**
     * Gets user's current client language and
     * provides extracted ISO-Code.
     *
     * @method detectLocale
     * @return {String}
     * @public
     */
    detectLocale: function detectLocale() {
      var defaultLocale = this.get('defaultLocale');
      var forceLocale = this.get('forceLocale');
      var navigator = window.navigator;

      var locale = undefined;

      // auto detect locale if no force locale
      if (isNone(forceLocale)) {

        // special case: android user agents
        if (navigator && navigator.userAgent && (locale = navigator.userAgent.match(/android.*\W(\w\w)-(\w\w)\W/i))) {
          locale = locale[1];
        }

        // for all other browsers
        if (isNone(locale) && navigator) {
          if (navigator.language) {
            locale = navigator.language;
          } else if (navigator.browserLanguage) {
            locale = navigator.browserLanguage;
          } else if (navigator.systemLanguage) {
            locale = navigator.systemLanguage;
          } else if (navigator.userLanguage) {
            locale = navigator.userLanguage;
          }
        }

        locale = locale.substr(0, 2);
      } else {
        locale = forceLocale;
      }

      // provide default locale if not available
      if (!this.hasLocale(locale)) {
        console.info('l10n.js: Falling back to default language: "' + defaultLocale + '"!');
        return defaultLocale;
      }

      // otherwise return detected locale
      if (isNone(forceLocale)) {
        console.info('l10n.js: Automatically detected user language: "' + locale + '"');
      } else {
        console.info('l10n.js: Using forced locale: "' + locale + '"');
      }

      return locale;
    },

    /**
     * Translates a singular form message id.
     *
     * @method t
     * @param {String} msgid
     * @param {Object} hash
     * @return {String}
     * @public
     */
    t: function t(msgid) {
      var hash = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

      if (getTypeOf(msgid) !== 'string') {
        try {
          msgid = msgid.toString();
        } catch (e) {
          console.log('l10n.js: "msgid" param for t() should be either a string or an object implementing toString() method!');
          return msgid;
        }
      }

      return this._strfmt(this.get('_gettext').gettext(msgid), hash);
    },

    /**
     * Translate a singular string without indexing it.
     * This is useful when passing variables to it, e.g. `l10n.tVar(myVar)`
     * If you would use `l10n.t(myVar)` in this case, myVar would be (wrongly) parsed by `gettext.sh`.
     *
     * @method tVariable
     * @param {String} msgid
     * @param {Object} hash
     * @return {String}
     * @public
     */
    tVar: function tVar(msgid) {
      var hash = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

      return this.t(msgid, hash);
    },

    /**
     * Translates a plural form message id.
     *
     * @method n
     * @param {String} msgid
     * @param {String} msgidPlural
     * @param {Number} count
     * @param {Object} hash
     * @return {String}
     * @public
     */
    n: function n(msgid, msgidPlural) {
      var count = arguments.length <= 2 || arguments[2] === undefined ? 1 : arguments[2];
      var hash = arguments.length <= 3 || arguments[3] === undefined ? {} : arguments[3];

      if (getTypeOf(msgid) !== 'string') {
        try {
          msgid = msgid.toString();
        } catch (e) {
          console.log('l10n.js: "msgid" param for n() should be either a string or an object implementing toString() method!');
          return msgid;
        }
      }

      if (getTypeOf(msgidPlural) !== 'string') {
        try {
          msgidPlural = msgidPlural.toString();
        } catch (e) {
          console.log('l10n.js: "msgid_plural" param for n() should be either a string or an object implementing toString() method!');
          return msgid;
        }
      }

      // If count is not manually set in the hash, use the provided count variable
      // This is a small utility function that can reduce boilerplate code
      if (!get(hash, 'count')) {
        // hash should not be mutated
        hash = merge({}, hash);
        hash.count = count;
      }

      return this._strfmt(this.get('_gettext').ngettext(msgid, msgidPlural, count), hash);
    },

    /**
     * Replaces placeholders like {{placeholder}} from string.
     *
     * @method _strfmt
     * @param {String} string
     * @param {Object} hash
     * @return {String}
     * @private
     */
    _strfmt: function _strfmt(string, hash) {
      var _this2 = this;

      // don't process empty hashes
      if (isNone(hash)) {
        return string;
      }

      // find and replace all {{placeholder}}
      var pattern = /{{\s*([\w]+)\s*}}/g;
      var replace = function replace(idx, match) {
        var value = hash[match];
        if (isNone(value)) {
          return '{{' + match + '}}';
        }

        if (getTypeOf(value) === 'string') {
          value = _this2.get('_gettext').gettext(value);
        }

        return value;
      };

      return string.replace(pattern, replace);
    },

    /**
     * Loads current locale translation file.
     * Note that `locale` will trigger change
     * after loading JSON file, so watching the
     * `locale` informs about new translations!
     *
     * @method _loadJSON
     * @param {String} locale
     * @return {Void}
     * @private
     */
    _loadJSON: function _loadJSON(locale) {
      var _this3 = this;

      return new Promise(function (resolve, reject) {
        var ajax = _this3.get('ajax');
        var cache = _this3.get('_cache');

        var fingerprintMap = get(_this3, 'fingerprintMap');
        var fingerprint = fingerprintMap ? get(fingerprintMap, locale) : null;

        var basePath = _this3.get('jsonPath');
        var path = fingerprint ? basePath + '/' + fingerprint : basePath;
        var url = path + '/' + locale + '.json';

        var successCallback = function successCallback(response) {
          var cachedResponse = copy(response, true);
          _this3.get('_gettext').loadJSON(response);

          cache[locale] = cachedResponse;
          resolve();
        };

        var failureCallback = function failureCallback(reason) {
          console.error('l10n.js: An error occurred loading "' + url + '": ' + reason);
          reject();
        };

        // used cache translation if present
        if (cache.hasOwnProperty(locale)) {
          successCallback(cache[locale]);
          resolve(cache[locale]);
          return;
        }

        // otherwise load json file from assets
        ajax.request(url).then(successCallback, failureCallback);
      });
    }

  });
});