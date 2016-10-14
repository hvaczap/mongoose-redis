// Invoke 'strict' JavaScript mode
'use strict';
module.exports = function(mongoose, options){
    return require('./src/cache')(mongoose, options || {});
};
