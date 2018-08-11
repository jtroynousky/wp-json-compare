var base = require('./base.js');
var request = require('request');

var options = {
  maxPages: (typeof (base.options.maxPages) === 'number') ? base.options.maxPages : null,
  startPage: (typeof (base.options.startPage) === 'number') ? base.options.startPage : 1
}

function indexWalker(startPage = 1, options) {

  var startPage = startPage,
    params = {
      page: startPage,
      order: 'asc',
      orderby: 'id',
    },
    queryString = Object.keys(params).map(key => key + '=' + params[key]).join('&'),
    endpoint = 'wp/v2/posts?' + queryString,
    maxPages = (typeof (options.maxPages) === 'number') ? options.maxPages : null,
    url = process.env.WP_SITE_A + '/wp-json/' + endpoint;

  // Exit if we are done with the requested number of pages
  if (maxPages > 0 && page > maxPages) {
    console.log(`Finished on page ${page} of max ${maxPages}`);
    process.exit();
  }

  console.debug(`Processing endpoint ${endpoint}`);

  request(url, (error, response, body) => {
    if (error) {
      console.error(error);
      process.exit();
    }

    var wpObjects = JSON.parse(body),
      wpObjectsCount = wpObjects.length,
      requestCounter = 0;

    wpObjects.forEach(function (obj) {
      wpObjectURL = obj._links.self[0].href.replace(`${process.env.WP_SITE_A}/wp-json/`, '');
      diff = base.getDiff(base.getWPJSON('a', wpObjectURL), base.getWPJSON('b', wpObjectURL));
      diff.then((results) => {
        requestCounter++;
        if (requestCounter >= wpObjectsCount) {
          page++;
          indexWalker(page, options);
        }
      });
    });
  });

}

indexWalker(options.startPage, options)