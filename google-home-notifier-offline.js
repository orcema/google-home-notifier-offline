'use strict';//

var Client = require('castv2-client').Client;
const EventEmitter = require('events');

var Googletts = require('google-tts-api');
var net = require('net');
var fs = require('fs');
var ip = require("ip");
var network = require('network');

var request = require('request');
var path = require('path');

var actualVolume = 0; // actual Volume of the assistant
var emitVolume = 20 / 100; // volume level to use for notificaiton/play
var textSpeed = 1; // speak speed value between 0.1 up to 1
var previousPlayerState = "IDLE"; // holds the player status
var cacheFolder = "" // default init to no cache folder
var httpServer = "";
var httpServerPort = "8081"; // default port for serving mp3
var serverIP = "";

var timeoutRestoreDevicesVolume = null;


function localFileServerClose(callback) {
  if (httpServer !== "") {
    httpServer.close(function () {
      httpServer = "";
    });
  }
  callback();
}

function localFileServerStart() {
  const FileServer = require('file-server');

  const fileServer = new FileServer((error, request, response) => {
    response.statusCode = error.code || 500;
    response.end("404: Not Found " + request.url);
  });

  const serveRobots = fileServer.serveDirectory(cacheFolder, {
    '.mp3': 'audio/mpeg'
  });

  httpServer = require('http')
    .createServer(serveRobots)
    .listen(httpServerPort);
  console.log("fileServer listening on ip " + serverIP + " and port " + httpServerPort);

}

function localFileServerRestart() {
  if (httpServer === "") {
    localFileServerStart();
  } else {
    localFileServerClose(function () {
      localFileServerStart();
    })
  }
}

function Download_Mp3(text, language, fileNameWithSpeedAndLanguage, playSlow, callback) {

  var dstFilePath = path.join(cacheFolder, fileNameWithSpeedAndLanguage);
  // get base64 text
  Googletts
    .getAudioBase64(text, { lang: language, slow: playSlow })
    .then((base64) => {
      // console.log({ base64 });

      // save the audio file
      const buffer = Buffer.from(base64, 'base64');
      fs.writeFileSync(dstFilePath, buffer, { encoding: 'base64' });
      callback();
    })
    .catch(console.error);
}

function GoogleHomeNotifier(deviceip, language, speed) {
  var ip = require("ip");
  serverIP = ip.address();


  this.deviceip = deviceip;
  this.language = language;
  this.speed = speed;

  var emitter = this;
  this.setSpeechSpeed = (readSpeed) => {
    textSpeed = parseFloat(readSpeed);
    return this;
  }

  this.setEmitVolume = function (pctVolume) {

    if (pctVolume != undefined) { // if not defined then the (default/last set) emitValue will be used
      emitVolume = pctVolume;
      // make sure volume is a percentage, else adjust
      if (emitVolume > 100) emitVolume = 100;
      if (emitVolume < 0) emitVolume = 0;
      if (emitVolume > 1) emitVolume = emitVolume / 100;
    }
    return this;
  }

  this.setCacheFolder = function (cacheFolderToUse) {
    if (cacheFolderToUse !== "" && cacheFolder !== cacheFolderToUse) {
      cacheFolder = cacheFolderToUse;
      localFileServerRestart()
    }
    return this;
  }

  this.setFileServerPort = function (serverPortToSet) {
    if (serverPortToSet !== "" && httpServerPort !== serverPortToSet) {
      httpServerPort = serverPortToSet;
      if (cacheFolder !== "") {
        localFileServerRestart();
      }
    }
    return this;
  }

  this.notify = function (message, callback) {
    getSpeechUrl(message, this.deviceip, function (res) {
      emitter.emit("speech", res);
    });
  };

  this.play = function (mp3_url, callback) {
    getPlayUrl(mp3_url, this.deviceip, function (res) {
      emitter.emit("play", res)
    });
  };

  var getSpeechUrl = function (text, host, callback) {


    if (cacheFolder == "") {
      emitter.emit("error", "please setup a cache folder");
      return
    }
    let fileName = text.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
    const fileNameWithSpeedAndLanguage = fileName + "-" + (textSpeed != 1 ? "slow" : "normal") + ".mp3";
    let fileToCheckInCache = path.join(cacheFolder, fileNameWithSpeedAndLanguage);
    let url = "http://" + serverIP + ":" + httpServerPort + "/" + fileNameWithSpeedAndLanguage;

    if (fs.existsSync(fileToCheckInCache)) {
      onDeviceUp(host, url, function (res) {
        callback(res);
      });

    } else {
      // Googletts(text, language, textSpeed).then(function (url) {
      Download_Mp3(text, language, fileNameWithSpeedAndLanguage, (textSpeed != 1 ? true : false), () => {
        onDeviceUp(host, url, function (res) {
          callback(res);
        });
      });
    }
  };

  var getPlayUrl = function (url, host, callback) {
    onDeviceUp(host, url, function (res) {
      callback(res);
    });
  };

  var restorVolumeOfDevice = function (host, volume) {
    var client = new Client();
    client.connect(host, function () {
      client.setVolume({ level: volume }, function (err, response) {
        console.log("volume restored to ", volume, " for device", host);
      });
    });
  }

  var restorVolumeOfCastedDevies = function () {
    timeoutRestoreDevicesVolume = null;
    for (var host in global.castedDevices) {
      new restorVolumeOfDevice(host, global.castedDevices[host].actualVolume);
    }
  }

  var onDeviceUp = function (host, url, callback) {
    if (global.castedDevices === undefined) {
      global.castedDevices = {};
    }
    var DefaultMediaReceiver = require('castv2-client').DefaultMediaReceiver;

    console.log("new message -----");
    var client = new Client();
    var clienttcp = new net.Socket();
    clienttcp.connect(8009, host, function () {
      global.castedDevices[host] = {};
      client.connect(host, function () {
        client.getVolume(function (err, volume) {
          global.castedDevices[host].actualVolume = volume.level;
          console.log("inital vol level", global.castedDevices[host].actualVolume, "host", host);
          client.setVolume({ level: emitVolume }, function (err, response) { // set the notification volume
            if (timeoutRestoreDevicesVolume == null) {
              timeoutRestoreDevicesVolume = setTimeout(function () {
                console.warn("fallback timeout triggered for restoring devices initial volume on host ", host);
                restorVolumeOfCastedDevies();
              }, 10000);
            }
            console.log("Vol level set to ", emitVolume, "host", host);
            client.launch(DefaultMediaReceiver, function (err, player) {
              if (err) {
                console.error(err);
              }
              var media = {
                contentId: url,
                contentType: 'audio/mp3',
                streamType: 'BUFFERED' // or LIVE
              };
              player.on('status', function (status) {
                var currentPlayerState = status.playerState;
                console.log('status broadcast currentPlayerState=%s', currentPlayerState, "for host", host);

                if (currentPlayerState === "PLAYING") {
                  if (timeoutRestoreDevicesVolume != null) {
                    clearTimeout(timeoutRestoreDevicesVolume);
                    timeoutRestoreDevicesVolume = null;
                  }
                }

                if (currentPlayerState === "PAUSED") {
                  restorVolumeOfCastedDevies();
                }


                var finishedPlaying = (previousPlayerState === "PLAYING" || previousPlayerState === "BUFFERING") && currentPlayerState === "IDLE";
                if (finishedPlaying) {
                  // reset volume to initial level and close the connection
                  // client.setVolume({ level: global.castedDevices[host].actualVolume },function(err,response){
                  //   console.log("Vol level restored to ",global.castedDevices[host].actualVolume,"host",host);
                  setTimeout(function () {
                    restorVolumeOfCastedDevies();
                    // client.close();
                    // console.log("Connection closed to host ",host);
                    // callback('Device notified');
                  }, 1000);
                  // });
                } else {
                  // console.log("still playing for host ", host);
                }

                previousPlayerState = currentPlayerState; // save current player state
                // console.log("previousPlayerState set to ",previousPlayerState , "for host ", host);

              });
              player.load(media, {
                autoplay: true
              }, function (err, status) {
                // console.log("loading:",status); 
              });
            });
          });
        });
      })
    });
    clienttcp.on('error', function (error) {
      emitter.emit("error", error);
      callback('ERROR: Device not reachable');
    });

    client.on('error', function (err) {
      console.log('Error: %s', err.message);
      client.close();
      emitter.emit("error", err)
    });

    client.on('status', function (status) {
      // console.log("status",status);
    });

  };


};

GoogleHomeNotifier.prototype.__proto__ = EventEmitter.prototype // inherit from EventEmitter

module.exports = function (deviceip, language, speed) {
  if (deviceip && language) {
    if (!speed) {
      speed = 1
    };
    return new GoogleHomeNotifier(deviceip, language, speed);
  }
}

