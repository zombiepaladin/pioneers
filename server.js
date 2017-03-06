/**
 * server.js
 * This file defines the server for a
 * simple photo gallery web app.
 */
"use strict;"

/* global variables */
var multipart = require('./multipart');
var template = require('./template');
var staticFiles = require('./static');
var http = require('http');
var url = require('url');
var fs = require('fs');
var port = 4000;

/* load cached files */
var config = JSON.parse(fs.readFileSync('config.json'));

/* load public directory */
staticFiles.loadDir('public');

/* load templates */
template.loadDir('templates');

/** @function getPioneerFilenames
 * Retrieves the filenames for all images in the
 * /pioneers directory and supplies them to the callback.
 * @param {function} callback - function that takes an
 * error and array of filenames as parameters
 */
function getPioneerFilenames(callback) {
  fs.readdir('pioneers/', function(err, filenames){
    if(err) return callback(err, undefined);
    var filenamesWithDir = filenames.map(function(filename){
      return 'pioneers/' + filename;
    });
    callback(false, filenamesWithDir);
  });
}

/** @function parseFiles
 * Asynchronous gelper function that takes an array of JSON
 * filenames, and a callback.
 * The first argument of the callback is an error, and
 * the second is an array of the objects corresponding to
 * the JSON files.
 * @param {string[]} filenames - the JSON filenames
 * @param {function} callback - the callback function
 */
function parseFiles(filenames, callback) {
  var objectsToParse = filenames.length;
  var objects = [];
  filenames.forEach(function(filename){
    fs.readFile(filename, function(err, data){
      // if no error ocurrs, parse the file data and
      // store it in the objects array.
      if(err) console.error(err);
      else objects.push(JSON.parse(data));
      // We reduce the number of files to parse,
      // regardless of the outcome
      objectsToParse--;
      // If we've finished parsing all JSON files,
      // trigger the callback
      if(objectsToParse == 0) {
        callback(false, objects);
      }
    })
  });
}

/** @function getPioneerTags
 * A helper function to create anchor tags for each
 * computing pioneer with a JSON file in the /pioneers
 * directory.
 * The callback should accept an error and the parsed
 * JSON data as an array.
 * @param {function} callback - the callback function
 */
function getPioneerTags(callback) {
  getPioneerFilenames(function(err, filenames) {
    if(err) return callback(err);
    parseFiles(filenames, function(err, pioneers){
      if(err) return callback(err);
      var pioneerTags = pioneers.map(function(pioneer) {
        return template.render('pioneerTag.html', pioneer);
      }).join("");
      callback(false, pioneerTags);
    });
  });
}

/** @function serveIndex
 * A function to serve a HTML page representing an
 * index of computer science pioneers.
 * @param {http.incomingRequest} req - the request object
 * @param {http.serverResponse} res - the response object
 */
function serveIndex(req, res) {
  getPioneerTags(function(err, tags){
    if(err) {
      console.error(err);
      res.statusCode = 500;
      res.statusMessage = 'Server error';
      res.end();
      return;
    }
    res.setHeader('Content-Type', 'text/html');
    res.end(template.render('index.html', {pioneerTags: tags}));
  });
}

/** @function serveImage
 * A function to serve an image file.
 * @param {string} filename - the filename of the image
 * to serve.
 * @param {http.incomingRequest} - the request object
 * @param {http.serverResponse} - the response object
 */
function serveImage(fileName, req, res) {
  fs.readFile('images/' + decodeURIComponent(fileName), function(err, data){
    if(err) {
      console.error(err);
      res.statusCode = 404;
      res.statusMessage = "Resource not found";
      res.end();
      return;
    }
    res.setHeader('Content-Type', 'image/*');
    res.end(data);
  });
}

/** @function servePioneer
 * A function to serve a computing pioneer's JSON data.
 * @param {string} filename - the JSON filename
 * to serve.
 * @param {http.incomingRequest} - the request object
 * @param {http.serverResponse} - the response object
 */
function servePioneer(filename, req, res) {
  fs.readFile('pioneers/' + filename + '.json', function(err, data) {
    if(err) {
      console.error(err);
      res.statusCode = 500;
      res.statusMessage = "Server error";
      return;
    }
    var pioneer = JSON.parse(data);
    res.setHeader('Content-Type', 'text/html');
    res.end(template.render('pioneer.html', pioneer));
  })
}

/** @function uploadPioneer
 * A function to process an http POST request
 * containing a new computing pioneer to add to the collection.
 * @param {http.incomingRequest} req - the request object
 * @param {http.serverResponse} res - the response object
 */
function uploadPioneer(req, res) {
  multipart(req, res, function(req, res) {
    // make sure an image was uploaded
    if(!req.body.image.filename) {
      console.error("No file in upload");
      res.statusCode = 400;
      res.statusMessage = "No file specified"
      res.end("No file specified");
      return;
    }
    // make sure image was in jpeg format
    if(req.body.image.contentType != 'image/jpeg'){
      res.statusCode = 400;
      res.statusMessage = "Must be type image/jpeg";
      res.end("Your image file must be a JPEG");
      return;
    }
    // Write the image
    fs.writeFile('images/' + req.body.image.filename, req.body.image.data, function(err){
      if(err) {
        console.error(err);
        res.statusCode = 500;
        res.statusMessage = "Server Error";
        res.end("Server Error");
        return;
      }
      // Determine the id and advance the counter
      var id = config.entryCount;
      config.entryCount++;
      fs.writeFile('config.json', JSON.stringify(config));
      // Populate a pioneer object
      var pioneer = {
        id: id,
        name: req.body.name,
        description: req.body.description,
        imageUrl: req.body.image.filename
      }
      // Write the JSON file
      fs.writeFile('pioneers/' + id + '.json', JSON.stringify(pioneer), function(err){
        if(err) {
          console.error(err);
          req.statusCode = 500;
          req.statusMessage = "Server error";
          req.end("Unable to create pioneer");
          return;
        }
        // If we reach this point, everything is saved,
        // so serve the updated index.
        serveIndex(req, res);
      });
    });
  });
}

/** @function handleRequest
 * A function to determine what to do with
 * incoming http requests.
 * @param {http.incomingRequest} req - the incoming request object
 * @param {http.serverResponse} res - the response object
 */
function handleRequest(req, res) {
  var urlParts = url.parse(req.url);
  switch(urlParts.pathname) {
    // Simplest case is the user requests the index
    // or default page.
    case '/':
    case '/index':
    case '/index.html':
      if(req.method == 'GET') {
        serveIndex(req, res);
      } else if(req.method == 'POST') {
        uploadPioneer(req, res);
      }
      break;

    default:
      // Check if the request is for a file in the
      // public directory
      if(staticFiles.isCached('public' + req.url)) {
        staticFiles.serveFile('public' + req.url, req, res);
      }
      else {
        // Otherwise, we have three possibilities -
        // an image file in /images, a JSON file
        // in /pioneers, or a file we aren't serving.
        var resource = urlParts.pathname.split('/');
        switch(resource[1]) {
          case 'images':
            serveImage(resource[2], req, res);
            break;
          case 'pioneers':
            servePioneer(resource[2], req, res);
            break;
          default:
            res.statusCode = 404;
            res.end("Resource not found");
        }
      }
  }
}

/* Create and launch the webserver */
var server = http.createServer(handleRequest);
server.listen(port, function(){
  console.log("Server is listening on port ", port);
});
