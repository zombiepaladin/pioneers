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

/* load cache */
var cache = new Map();
function loadCache() {
  var filenames = fs.readdirSync('pioneers');
  filenames.forEach(function(file){
    var data = fs.readFileSync('pioneers/' + file, {encoding: 'utf8'});
    var pioneer = JSON.parse(data);
    cache.set(pioneer.id, pioneer);
  });
}
// By placing the cache loading code into a function
// and then invoking it, we avoid polluting global
// scope with variables like 'filenames'
loadCache();

/** @function getPioneerTags
 * A helper function to create anchor tags for each
 * computing pioneer with a JSON file in the /pioneers
 * directory.
 * The callback should accept an error and the parsed
 * JSON data as an array.
 * @param {function} callback - the callback function
 */
function getPioneerTags() {
  var tags = [];
  cache.forEach(function(value){
    tags.push(template.render('pioneerTag.html', value));
  });
  return tags.join('');
}

/** @function serveIndex
 * A function to serve a HTML page representing an
 * index of computer science pioneers.
 * @param {http.incomingRequest} req - the request object
 * @param {http.serverResponse} res - the response object
 */
function serveIndex(req, res) {
  var tags = getPioneerTags();
  res.setHeader('Content-Type', 'text/html');
  res.end(template.render('index.html', {pioneerTags: tags}));
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
  var id = filename.split('.')[0];
  var pioneer = cache.get(parseInt(id));
  res.setHeader('Content-Type', 'text/html');
  res.end(template.render('pioneer.html', pioneer));
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
    // make sure image is in jpeg format
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
      // Save to cache
      cache.set(id, pioneer);
      // Write the JSON file
      fs.writeFile('pioneers/' + id + '.json', JSON.stringify(pioneer));
      // Since the pioneer is cached, we don't need
      // to wait for the JSON to save before serving
      // the updated index.
      serveIndex(req, res);
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
