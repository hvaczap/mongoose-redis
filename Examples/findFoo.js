/**
 * Created by david on 10/14/16.
 */
var mongoose = require('mongoose');
var MongooseCache = require('../index');

var cache = MongooseCache(mongoose, {port: 6379, host: 'localhost', compress: true });


var rand = function() { return Math.floor(Math.random() * 500)};

var FooSchema = new mongoose.Schema({
  count: {
    type: Number,
    default: rand
  }
});
var Foo = mongoose.model('Foo',FooSchema);
var connection = mongoose.connection;
mongoose.connect('mongodb://localhost/FooExample');

connection.on('open', function () {
  Foo.create({});
  Foo.find({})
    .reCache(50)
    .then(function (data) {
      console.log('Data Promise',data);
    })
    .catch(function (err) {
      console.error(err);
    })
});