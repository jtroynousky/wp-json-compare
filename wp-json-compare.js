const winston = require('winston');
const request = require('request');
const colors = require('colors');
var diff = require('deep-diff').diff;
var program = require('commander');

program
  .version('0.1.0')
  .option('-m, --model [model]', 'Which WordPress model: Post, Taxonomy, Media, Author')
  .option('-a, --siteA [host]', 'Origin Site: https://first-site.com')
  .option('-b, --siteB [host]', 'Copied Site: https://second-site.com')
  .option('-p, --page [number]', 'Optional page to start')
  .option('-x, --maxPages [number]', 'Optional page to end')
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

  var responseString = JSON.stringify(response);
  var replacedString = responseString
    .replace(new RegExp(program.siteB, 'g'), program.siteA)
    .replace(new RegExp('https?:\/\/[a-z0-9]+\.files\.wordpress\.com', 'g'), program.siteA + '/wp-content/uploads')
    .replace(new RegExp('https?:\/\/[a-z0-9]+\.wordpress\.com', 'g'), program.siteA);

  result = JSON.parse(replacedString);

  return result;
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

          // Filter out count property
          // @TODO make this is list of props that are filtered out across different models
          if (key === 'count') {
            filter = true;
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