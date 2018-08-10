var base = require('./base.js');

// Register recursive compare
if(typeof(base.options.endpoint) === 'string'){
  var options = {
    maxPages: (typeof(base.options.maxPages) === 'number') ? base.options.maxPages : null
  }
  base.recursiveCompare(base.options.endpoint, 1, options);
}
