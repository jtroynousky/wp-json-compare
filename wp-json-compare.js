const winston = require('winston');
const request = require('request');
const colors = require('colors');
var diff = require('deep-diff').diff;
var program = require('commander');
var isUrl = require('is-url');

program
  .version('0.1.0')
  .option('-m, --model [model]', 'Which WordPress model: Post, Taxonomy, Media, Author')
  .option('-a, --siteA [host]', 'Origin Site: https://first-site.com')
  .option('-b, --siteB [host]', 'Copied Site: https://second-site.com')
  .option('-p, --page [number]', 'Optional page to start')
  .option('-x, --maxPages [number]', 'Optional page to end')
  .option('-s, --skip [string]', 'Optional comma-separated object properties to skip')
  .option('-A, --accessTokenA [string]', 'Optional OAuth2 access token for site A')
  .option('-B, --accessTokenB [string]', 'Optional OAuth2 access token for site B')
  .parse(process.argv);

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.prettyPrint(),
  transports: [
    new winston.transports.File({
      json: false,
      filename: 'logs/' + program.model + '-' + Math.ceil(Date.now() / 1000) + '.log'
    }),
    new winston.transports.Console()
  ]
});

if (program.siteA === undefined || program.siteB === undefined) {
  console.log('Please specifiy both siteA and siteB as command line args.'.red);
  process.exit();
}

if (program.page === undefined) {
  program.page = 1;
}


console.log(`Initializing wp-json-compare for model ${program.model}`.green)
console.log(`Comparing ${program.siteA} -> ${program.siteB}`.green)
console.log(`Starting on page ${program.page}`.green)
console.log('================'.rainbow)

/**
 * Callback to log errors
 */
function errorHandler() {
  logger.log(error);
}

/**
 * 
 * @param {*} response 
 */
function domainFilter(response) {

  var siteA = program.siteA.replace('http:', '').replace('https:', ''),
      siteB = program.siteB.replace('http:', '').replace('https:', '');

  var responseString = JSON.stringify(response);
  var replacedString = responseString
    .replace(new RegExp(siteB, 'g'), siteA)
    .replace(new RegExp('https?:\/\/[a-z0-9]+\.files\.wordpress\.com', 'g'), program.siteA + '/wp-content/uploads')
    .replace(new RegExp('https?:\/\/[a-z0-9]+\.wordpress\.com', 'g'), program.siteA)
    .replace(new RegExp('https?:\/\/i[0-9]+.wp.com\/[a-z0-9-\.]+', 'g'), program.siteA);

  result = JSON.parse(replacedString);

  return result;
}

/**
 *
 * @param {*} response
 */
function entityFilter(response) {

  if (typeof(response) === 'undefined') {
    return response;
  }

  var responseString = JSON.stringify(response);

  var replacedString = responseString
    .replace('&nbsp;', ' ')
    .replace('&#038;', ' ');

  result = JSON.parse(replacedString);

  return result;
}

/**
 *
 * @param {*} response
 */
function queryStringFilter(response) {

  if (typeof(response) === 'object') {

    // Loop through each object propertly
    for (var k in response){
      if (response.hasOwnProperty(k)) {
        if(typeof(response[k]) === 'object'){

          // Apply filter recursively to nested objects
          response[k] = queryStringFilter(response[k]);
        } else if (typeof(response[k]) === 'string' && isUrl(response[k])){

          // Remove query string from URLs
          response[k] = response[k].split("?")[0];
        }
      }
    }
  }

  return response;
}

/**
 * Retrieve the individual model page
 */
function getWPmodel(url, accessToken) {

  var getPromise = function () {

    return new Promise(function (resolve, reject) {

      // Specify request parameters
      var requestParams = {
        url: url
      };

      // Add authentication headers if specified
      if (accessToken !== undefined ) {
        requestParams.headers = {
          "Authorization" : "Bearer " + accessToken
        }
     }

      request.get(requestParams, (error, response, body) => {

        if (error) {
          reject(error);
        } else {
          resolve(body);
        }
      })
    });
  }

  return {
    getPromise: getPromise,
    url: url
  }
}

/**
 *
 */
function getDiff(requestA, requestB) {

  return new Promise(function (resolve, reject) {

    // Initiate request promises
    var promiseA = requestA.getPromise(),
      promiseB = requestB.getPromise(),
      results = {
        objectA: false,
        objectB: false
      };

    promiseA.then(JSON.parse, errorHandler)

      // Ensure both requests finish before attempting diff
      .then(function (result) {

        if (typeof (result) === 'object' && JSON.stringify(result) !== '[]') {

          var filteredResult = domainFilter(result);
          results.objectA = filteredResult;
        }

        promiseB.then(JSON.parse, errorHandler)
          .then(function (result) {
            if (typeof (result) === 'object' && JSON.stringify(result) !== '[]') {
              var filteredResult = domainFilter(result);
              results.objectB = filteredResult;
            }
          });

        return promiseB;
      }, errorHandler)

      // Run the diff and log the results
      .then(function (data) {

        var diffResults = diff(results.objectA, results.objectB, function (path, key) {
          var filter = false;

          // Filter out properties we do not want to test
          var filteredKeys = ['count']

          if (program.model === 'media') {
            filteredKeys.push('guid');
            filteredKeys.push('description');
          }

          // Add skipped properties
          if (typeof(program.skip) === 'string') {
            var skip = program.skip.split(',');
            if (skip.length > 0) {
              filteredKeys = filteredKeys.concat(skip);
            }
          }

          if (filteredKeys.indexOf(key) > -1) {
            filter = true;
          }

          // Check some other conditions for filtering
          if ( ! filter && JSON.stringify( results.objectA[key] ) !== JSON.stringify( results.objectB[key] ) ) {

            // See if HTML entity encoding is causing some false positives
            var dataA = entityFilter( results.objectA[key] );
            var dataB = entityFilter( results.objectB[key] );
            if ( JSON.stringify( dataA ) === JSON.stringify( dataB ) ) {
              filter = true;
            }

            if ( ! filter ) {
              var dataA = queryStringFilter( results.objectA[key] );
              var dataB = queryStringFilter( results.objectB[key] );
              if ( JSON.stringify( dataA ) === JSON.stringify( dataB ) ) {
                filter = true;
              }
            }
          }

          return filter;
        });

        var entry = {
          level: 'info',
          message: {
            urlA: requestA.url,
            urlB: requestB.url,
            diff: (typeof (diffResults) === 'object') ? diffResults : []
          }
        }

        if (entry.message.diff.length > 0) {
          logger.log(entry);
        }

        resolve(results);
      }, errorHandler);

  });
}

/**
 * Recursive walker that iterates over index pages and then deep dives into model pages
 * 
 * @param {*} startPage 
 * @param {*} options 
 */
function indexWalker(startPage = 1) {

  var params = {
    page: startPage,
    order: 'asc',
    orderby: 'id',
  },
    queryString = Object.keys(params).map(key => key + '=' + params[key]).join('&'),
    url = `${program.siteA}/wp-json/wp/v2/${program.model}?` + queryString;

  // Exit if we are done with the requested number of pages
  if (program.maxPages > 0 && params.page > program.maxPages) {
    console.log('================'.rainbow)
    console.log(`Finished on max page: ${program.maxPages}`.red);
    process.exit();
  }

  // Specify request parameters
  var requestParams = {
    url: url
  };

  // Add authentication headers if specified
  if (program.accessTokenA !== undefined ) {
    requestParams.headers = {
      "Authorization" : "Bearer " + program.accessTokenA
    }
 }

  console.log(`Processing index url ${url}`.yellow);

  request(requestParams, (error, response, body) => {
    if (error) {
      console.log('================'.rainbow)
      console.log(`${error}`.red);
      process.exit();
    }

    var wpObjects = JSON.parse(body),
      wpObjectsCount = wpObjects.length,
      requestCounter = 0;

    if (wpObjects.length === 0) {
      console.log('================'.rainbow)
      console.log(`Finished on page: ${params.page}`.red);
      process.exit();
    }

    wpObjects.forEach(function (obj) {
      wpObjectURL = obj._links.self[0].href;
      wpObjectURLB = wpObjectURL.replace(program.siteA, program.siteB);
      getDiff(getWPmodel(wpObjectURL, program.accessTokenA), getWPmodel(wpObjectURLB, program.accessTokenB))
        .then(() => {
          requestCounter++;
          if (requestCounter >= wpObjectsCount) {
            params.page++;
            indexWalker(params.page);
          }
        });
    });
  });

}

indexWalker(program.page)