var base = require('./base.js');

var options = {
  maxPages: (typeof (base.options.maxPages) === 'number') ? base.options.maxPages : null
}
function recursiveCompare(page = 1, options) {

  var page = page,
    params = {
      page: page,
      order: 'asc',
      orderby: 'id',
    },
    queryString = Object.keys(params).map(key => key + '=' + params[key]).join('&'),
    url = 'wp/v2/categories?' + queryString,
    maxPages = (typeof (options.maxPages) === 'number') ? options.maxPages : null,
    diff = base.getDiff(base.getWPJSON('a', url), base.getWPJSON('b', url));

  // Get diff and query next page until they're all empty
  diff.then(function (results) {

    // Bail if we've resached the max
    if (maxPages && page >= maxPages) {
      return;
    }

    if (results.objectA !== false && results.objectB !== false) {
      page++;
      recursiveCompare(page, options);
    }
  });
}

recursiveCompare(1, options)

