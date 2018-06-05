// Invoke 'strict' JavaScript mode
'use strict';
 var redis = require('redis'),
     zlib = require('zlib'),
     crypto = require('crypto'),
      _ = require('lodash');
module.exports = function (mongoose, options) {
  if (mongoose == null) {
    throw new Error('An instance of mongoose needs passing in')
  }

  console.log('mongoose-redis init create cache prototype.');
  var  host = options.host || "localhost";
  var  port = options.port || 6379;
  var  pwd = options.pass || options.password || options.pwd || "";
  var  redisOptions = options.options || {};
  var zip = options.compress || false;
  var  client = redis.createClient(port, host, redisOptions);

  if (pwd.length > 0) {
    client.auth(pwd, function(err) {
      if (err){
        throw new Error(err);
      }
    });
  }
  changeExec();
  function changeExec() {
    var Query = mongoose.Query
      , _exec = Query.prototype.exec;
    //  cachegoose
    if (Query.prototype.cache != null) {
      return
    }

    // add cache
    Query.prototype.cache = function(ttl, customKey) {
      ttl = ttl || 60;
      if (typeof ttl === 'string') {
        customKey = ttl;
        ttl = 60;
      }

      this._ttl = ttl;
      this._key = customKey;
      return this;
    };

    // cache again the request
    Query.prototype.reCache = function(ttl, customKey) {
      ttl = ttl || 60;
      if (typeof ttl === 'string') {
        customKey = ttl;
        ttl = 60;
      }

      this._ttl = ttl;
      this._reCache = true;
      this._key = customKey;
      return this;
    };

    Query.prototype.exec = function(op, cb) {
      if (!(this._ttl)) {
        return _exec.call(this, op, cb);
      }
      if (isFunction(op)) {
        cb = op;
        op = null
      }
      else {
        cb = cb || noop
      }
      var _self = this;
      var _expires = this._ttl;
      var _reCache = this._reCache;
      var _collectionName = this.model.collection.name;

      var  model = this.model;
      var _options = this._optionsForExec(model) || {};
      var fields = this._fields || {};
      var _meta = {
        zip: zip,
        host: _self.model.db.host,
        port: _self.model.db.port,
        db: _self.model.db.name,
        collection: _collectionName,
        populate: _self.options.populate || {},
        options: _options,
        query: _self._conditions,
        fields: _self._fields || {},
        path: _self._path,
        distinct: _self._distinct,
        op: _self.op,
      };

      var _key = this._key || crypto.createHash('md5').update(JSON.stringify(_meta)).digest('hex');

      function saveFind(callback) {
          return _exec.call(_self, op, function(err, docs) {
            if (err) {
              return callback(err);
            }
            var docsMapped = docs;
            if (!docs) {
              // return callback(null, docs);
            } else if (_.isArray(docs)) {
              docsMapped = _.map(docs, function (d) {
                return d.toJSON();
              })
            } else {
              docsMapped = docsMapped.toJSON();
            }
            var _val = JSON.stringify(docsMapped);
            if(zip){
              _val = zlib.deflate(_val, function(err, buffer){
                if(err)
                  console.log(err);
                _val = buffer.toString('base64');
                client.set(_key, _val);
                client.expire(_key, _expires);
              });
            } else {
              client.set(_key, _val);
              client.expire(_key, _expires);
            }
            return callback(null, docs);
          });
      }
      function parseResult(result, callback) {
        if(zip){
          var _input = new Buffer(result, 'base64');
          zlib.inflate(_input, function(err, buffer){
            if(err)
              console.log(err);
            if (!buffer) {
              return callback(null, null);
            }
            try {
              var _val = JSON.parse(buffer.toString());
              return callback(null, _val);
            } catch(err) {
              console.log(err);
              return callback(null, null);
            }
          });
        } else {
          try {
            var _val = JSON.parse(result);
            return callback(null, _val);
          } catch (err) {
            console.log(err);
            return callback(null, null);
          }
        }
      }

      function clientWillGet(callback) {
        client.get(_key, function(err, result){
          if(!result){ saveFind(callback) }
          else { parseResult(result, callback) }
          })
      }
      function findDocs(callback) {
        if(_reCache) {
          return saveFind(callback)
        }
        return clientWillGet(callback)
      }
      return createMongoosePromise(function (resolve, reject) {
        return findDocs(function (err, docs) {
          if (err) {
            return reject(err);
          }
          return resolve(docs);
        })
      }.bind(this));
    };
  }
  /**
   * Creates a Mongoose promise.
   */
  function createMongoosePromise(resolver) {
    var promise;

    if (mongoose.Promise.ES6) {
      // mongoose 4.1.x => 5.0.0
      promise = new mongoose.Promise.ES6(resolver);
    } else if (mongoose.Promise) {
      // mongoose > 5.0.0
      promise = new mongoose.Promise(resolver);
    }

    return promise
  }
  function isArray(obj) {
    return Object.prototype.toString.call(obj) === '[object Array]'
  }

  function isFunction(obj) {
    return Object.prototype.toString.call(obj) === '[object Function]'
  }
  function noop() {}
};
