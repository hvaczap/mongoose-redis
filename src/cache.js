// Invoke 'strict' JavaScript mode
'use strict';
 var redis = require('redis'),
     zlib = require('zlib'),
     crypto = require('crypto');
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
        distinct: _self._distinct
      };

      var _key = this._key || crypto.createHash('md5').update(JSON.stringify(_meta)).digest('hex');

      return createMongoosePromise(function (resolve, reject) {
        client.get(_key, function(err, result){
          if(!result){
            return _exec.call(_self, op, function(err, docs) {
              if (err) {
                return reject(err), cb(err);
              }
              var _val = JSON.stringify(docs);
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
              cb(null, docs);
              return resolve(docs);


            });
          }
          else {
            //var _val = JSON.parse(result);
            if(zip){
              var _input = new Buffer(result, 'base64');
              zlib.inflate(_input, function(err, buffer){
                if(err)
                  console.log(err);
                _val = JSON.parse(buffer.toString());
                cb(null, _val);
                return resolve(_val);
              });
            }
            else {
              var _val = JSON.parse(result);
              cb(null, _val);
              return resolve(_val);
            }

          }
        })
      }.bind(this));
    };
  }
  /**
   * Creates a Mongoose promise.
   */
  function createMongoosePromise(resolver) {
    var promise;

    // mongoose 4.1.x and up
    if (mongoose.Promise.ES6) {
      promise = new mongoose.Promise.ES6(resolver)
    }
    // backward compatibility
    else {
      promise = new mongoose.Promise;
      resolver(promise.resolve.bind(promise, null), promise.reject.bind(promise))
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
