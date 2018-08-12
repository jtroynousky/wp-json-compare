const winston = require('winston');
const request = require('request');
var diff = require('deep-diff').diff;
var program = require('commander');

program
  .version('0.1.0')
  .option('-m, --model [model]', 'Which WordPress model: Post, Taxonomy, Media, Author')
  .option('-a, --siteA [host]', 'Origin Site: https://first-site.com')
  .option('-b, --siteB [host]', 'Copied Site: https://second-site.com')
  .option('-p, --page [number]', 'Optional page to start')
  .option('-x, --maxPages [number]', 'Optional page to end')
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
  console.log('Please specifiy both siteA and siteB as command line args.');
  process.exit();
}

if (program.page === undefined) {
  program.page = 1;
}


console.log(`Initializing wp-json-compare for model ${program.model}`)
console.log(`Comparing ${program.siteA} -> ${program.siteB}`)

/**
 * Callback to log errors
 */
function errorHandler() {
  logger.log(error);
}

/**
 * Retrieve the individual model page
 */
function getWPmodel(url) {

  var getPromise = function () {

    return new Promise(function (resolve, reject) {

      request.get(url, (error, response, body) => {

        // Reject errors returned; otherwise resolve the promise
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
          results.objectA = result;
        }

        promiseB.then(JSON.parse, errorHandler)
          .then(function (result) {
            if (typeof (result) === 'object' && JSON.stringify(result) !== '[]') {
              // String replace Site B domain with Site A so we don't get false positives on mismatches
              var resultString = JSON.stringify(result);
              var replacedString = resultString.replace(new RegExp(program.siteB, 'g'), program.siteA);
              result = JSON.parse(replacedString);
              results.objectB = result;
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

        logger.log(entry);

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
  if (program.maxPages > 0 && page > program.maxPages) {
    console.log(`Finished on page ${page} of max ${maxPages}`);
    process.exit();
  }

  console.log(`Processing url ${url}`);

  request(url, (error, response, body) => {
    if (error) {
      console.error(error);
      process.exit();
    }

    var wpObjects = JSON.parse(body),
      wpObjectsCount = wpObjects.length,
      requestCounter = 0;

    wpObjects.forEach(function (obj) {
      wpObjectURL = obj._links.self[0].href;
      wpObjectURLB = wpObjectURL.replace(program.siteA, program.siteB);
      getDiff(getWPmodel(wpObjectURL), getWPmodel(wpObjectURLB))
        .then(() => {
          requestCounter++;
          if (requestCounter >= wpObjectsCount) {
            page++;
            indexWalker(page, options);
          }
        });
    });
  });

}

indexWalker(program.page)