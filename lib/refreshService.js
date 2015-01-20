/**
 * Module dependencies.
 */
var fs = require('fs');
var request = require('request');

/**
 * Refresh service.
 *
 * This service:
 * 1. holds array / list of files along with date/time of last screenshot
 * 2. runs a loop every hour. every screenshot that is older than 6 hours will be discarded and, the URL will be pinged. 
 *    If 200 - rasteriser will be called to get new screenshot. If any other response record will be cleared from refresh service
 * 3. On initialisation of service all files in tmp folder that match "Screenshot_*.png" pattern will be deleted
 *
 */
var RefreshService = function(app,refreshperiod,lifetime) {
  this.rasterizerService = app.settings.rasterizerService;
  this.refreshperiod = typeof refreshperiod === 'undefined' ? 60000 : refreshperiod;
  this.lifetime = lifetime;
  this.files = {};
  this.fileRefreshCounter = {};
  var self = this;
  process.on('exit', function() {
    self.removeAllFiles();
  });
}

RefreshService.prototype.addFile = function(counter,path,rasterizerOptions) {
  if (typeof this.files[path] != 'undefined') {
    // do nothing. The file will expire sooner than expected
    return;
  }
  var self = this;
  this.files[path] = setTimeout(function() {
    self.removeFile(counter,path,rasterizerOptions, function(err) { return; });
  }, this.refreshperiod);
  console.log('registered file in refresh service');
}

RefreshService.prototype.removeFile = function(counter,path,rasterizerOptions,callback) {
  var RefreshService = this;
  if (typeof this.files[path] == 'undefined') {
    console.log('File ' + path + ' is not managed by the refresh service');
    return;
  }
  delete this.files[path];
  try {
    if(RefreshService.fileRefreshCounter[path] > this.lifetime){
      console.log('Refresh service is deleting a registered file - ' + path);
      fs.unlinkSync(path);
    } else {
      console.log('Refresh service replacing a registered file - ' + path + 'counter ('+RefreshService.fileRefreshCounter[path]+'), lifetime ('+this.lifetime+')');
      request.get(rasterizerOptions, function(error, response, body) {
        if (error || response.statusCode != 200) {
          if(!error.message)
            error.message = "issue with error message";
          console.log('Error while requesting the rasterizer: %s', error.message);
          RefreshService.rasterizerService.restartService();
          return callback(new Error(body));
        }
        else if (body.indexOf('Error: ') == 0) {
          var errmsg = body.substring(7);
          console.log('Error while requesting the rasterizer: %s', errmsg);
          return callback(new Error(errmsg));
        }
        callback(null);
        RefreshService.fileRefreshCounter[path] ++;
        counter = counter + 1;
        RefreshService.addFile(counter, path, rasterizerOptions);
      });
    }
  } catch(e) {
    console.error(e);
  }
}

RefreshService.prototype.removeAllFiles = function() {
  for (path in this.files) {
    this.removeFile(path);
  }
}

module.exports = RefreshService;
