// Read in environment variables
require('dotenv').config();

// Ensure environment variables are set
if (typeof (process.env.WP_SITE_A) === 'undefined'
  || typeof (process.env.WP_SITE_B) === 'undefined'
  || process.env.WP_SITE_A === 'example-a.com'
  || process.env.WP_SITE_B === 'example-b.com'
) {
  console.log('Please specifiy WP_SITE_A and WP_SITE_B environment variables in .env before proceeding');
  process.exit();
}

var winston = require('winston'),
  request = require('request'),
  diff = require('deep-diff').diff,
  commandLineArgs = require('command-line-args'),
  optionDefinitions = [
    {
      name: 'maxPages',
      type: Number
    }
  ],
  options = commandLineArgs(optionDefinitions);

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.prettyPrint(),
  transports: [
    new winston.transports.File({
      json: false,
      filename: 'logs/' + options.endpoint + '-' + Math.ceil(Date.now() / 1000) + '.log'
    }),
    new winston.transports.Console()
  ]
});

/**
 *
 */
function errorHandler() {
  logger.log(error);
}

/**
 *
 */
function getWPJSON(site, endpoint) {

  // Determine the host to use
  var host = (site === 'b') ? process.env.WP_SITE_B : process.env.WP_SITE_A,
    url = host + '/wp-json/' + endpoint;

  /**
   *
   */
  var getPromise = function () {

    // Return a Promise object
    return new Promise(function (resolve, reject) {

      // Request the JSON
      request.get(url, (error, response, body) => {

        // Reject errors returned; otherwise resolve the promise
        if (error) {
          reject(error);
        } else {

          // String replace Site B domain with Site A so we don't get 
          if (site === 'b') {
            body = body.replace(new RegExp(process.env.WP_SITE_B, 'g'), process.env.WP_SITE_A)
          }

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

  // Return a Promise object
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
 *
 */


module.exports.options = options;
module.exports.getDiff = getDiff;
module.exports.getWPJSON = getWPJSON;
