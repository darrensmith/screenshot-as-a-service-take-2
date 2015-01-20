var utils = require('../lib/utils');
var join = require('path').join;
var fs = require('fs');
var path = require('path');
var request = require('request');

module.exports = function(app, useCors) {
  var rasterizerService = app.settings.rasterizerService;
  var refreshService = app.settings.refreshService;

  // routes
  app.get('/', function(req, res, next) {
    if (!req.param('url', false)) {
      return res.redirect('/usage.html');
    }

    var url = utils.url(req.param('url'));
    // required options
    var options = {
      uri: 'http://localhost:' + rasterizerService.getPort() + '/',
      headers: { url: url }
    };
    ['width', 'height', 'clipRect', 'javascriptEnabled', 'loadImages', 'localToRemoteUrlAccessEnabled', 'userAgent', 'userName', 'password', 'delay'].forEach(function(name) {
      if (req.param(name, false)) options.headers[name] = req.param(name);
    });

    var optionsMinusURL = JSON.parse(JSON.stringify(options));
    optionsMinusURL.headers.url = "";
    var filename = 'screenshot_' + utils.md5(url.split("?")[0] + JSON.stringify(optionsMinusURL)) + '.png';
    options.headers.filename = filename;

    var filePath = join(rasterizerService.getPath(), filename);
    var filePathWithoutFile = rasterizerService.getPath();

    if (fs.existsSync(filePath)) {
      console.log('Request for %s - Found in cache', url);
      processImageUsingCache(filePathWithoutFile, options, filePath, res, function(err) { if (err) next(err); });
      return;
    }
    console.log('Request for %s - Rasterizing it', url);
    processImageUsingRasterizer(filePathWithoutFile, options, filePath, res, function(err) { if(err) next(err); });
  });

  app.get('*', function(req, res, next) {
    // for backwards compatibility, try redirecting to the main route if the request looks like /www.google.com
    res.redirect('/?url=' + req.url.substring(1));
  });

  // bits of logic
  var processImageUsingCache = function(filePathWithoutFile, rasterizerOptions, filePath, res, callback) {
    var PassThroughOptions = JSON.parse(JSON.stringify(rasterizerOptions));
    sendImageInResponse(filePathWithoutFile, filePath, res, PassThroughOptions, callback);
  }

  var processImageUsingRasterizer = function(filePathWithoutFile, rasterizerOptions, filePath, res, callback) {
    var PassThroughOptions = JSON.parse(JSON.stringify(rasterizerOptions));
    callRasterizer(rasterizerOptions, function(error) {
      if (error) return callback(error);
    });
    var defaultImage = "public/defaultImage.png";
    sendImageInResponse(filePathWithoutFile, defaultImage, res, PassThroughOptions, callback);
  }

  var callRasterizer = function(rasterizerOptions, callback) {
    request.get(rasterizerOptions, function(error, response, body) {
      if (error || response.statusCode != 200) {
        if(!error.message)
          error.message = "issue with error message";
        console.log('Error while requesting the rasterizer: %s', error.message);
        rasterizerService.restartService();
        return callback(new Error(body));
      }
      else if (body.indexOf('Error: ') == 0) {
        var errmsg = body.substring(7);
        console.log('Error while requesting the rasterizer: %s', errmsg);
        return callback(new Error(errmsg));
      }
      callback(null);
    });
  }

  var sendImageInResponse = function(filePathWithoutFile, imagePath, res, rasterizerOptions, callback) {
    if (useCors) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Expose-Headers", "Content-Type");
    }
    if(imagePath){
      if(imagePath == "public/defaultImage.png"){
        var FileToAdd = join(filePathWithoutFile, rasterizerOptions.headers.filename);
        console.log("adding uncached file to refreshService - " + FileToAdd);
        refreshService.fileRefreshCounter[FileToAdd] = 1;
        refreshService.addFile(1, FileToAdd, rasterizerOptions);
      }
      res.sendfile(imagePath, function(err) {
        if(imagePath !== "public/defaultImage.png"){
          console.log("adding cached file to refreshService - " + imagePath);
          refreshService.fileRefreshCounter[imagePath] = 1;
          refreshService.addFile(1, imagePath, rasterizerOptions);
        }
      });
    }
  }

};
