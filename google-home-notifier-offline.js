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



var timeoutRestoreDevicesVolume = null;

function GoogleHomeNotifier(deviceip, language, speed, mediaServerIp, mediaServerPort, cacheFolder) {

  this.deviceip = deviceip;
  this.language = language;
  this.speed = speed;

  var emitter = this;

  this.notify = function (message, callback) {
    getSpeechUrl(message, this.deviceip, function (res) {
      emitter.emit("speech", res);
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
    let url = "http://" + mediaServerIp + ":" + mediaServerPort + "/" + fileNameWithSpeedAndLanguage;

    if (fs.existsSync(fileToCheckInCache)) {
      onDeviceUp(host, url, function (res) {
        callback(res);
      });

    } else {
      // Googletts(text, language, textSpeed).then(function (url) {
      Download_Mp3(text, language, fileNameWithSpeedAndLanguage, (textSpeed != 1 ? true : false), cacheFolder, () => {
        onDeviceUp(host, url, function (res) {
          callback(res);
        });
      });
    }

  };

  // var onDeviceUp = function (host, url, callback) {
  //   if (global.castedDevices === undefined) {
  //     global.castedDevices = {};
  //   }
  //   var DefaultMediaReceiver = require('castv2-client').DefaultMediaReceiver;

  //   console.log("new message -----");
  //   var client = new Client();
  //   var clienttcp = new net.Socket();
  //   clienttcp.connect(8009, host, function () {
  //     global.castedDevices[host] = {};
  //     client.connect(host, function () {
  //       client.getVolume(function (err, volume) {
  //         global.castedDevices[host].actualVolume = volume.level;
  //         console.log("inital vol level", global.castedDevices[host].actualVolume, "host", host);
  //         client.setVolume({ level: emitVolume }, function (err, response) { // set the notification volume
  //           if (timeoutRestoreDevicesVolume == null) {
  //             timeoutRestoreDevicesVolume = setTimeout(function () {
  //               console.warn("fallback timeout triggered for restoring devices initial volume on host ", host);
  //               restorVolumeOfCastedDevies();
  //             }, 10000);
  //           }
  //           console.log("Vol level set to ", emitVolume, "host", host);
  //           client.launch(DefaultMediaReceiver, function (err, player) {
  //             if (err) {
  //               console.error(err);
  //             }
  //             var media = {
  //               contentId: url,
  //               contentType: 'audio/mp3',
  //               streamType: 'BUFFERED' // or LIVE
  //             };
  //             player.on('status', function (status) {
  //               var currentPlayerState = status.playerState;
  //               console.log('status broadcast currentPlayerState=%s', currentPlayerState, "for host", host);

  //               if (currentPlayerState === "PLAYING") {
  //                 if (timeoutRestoreDevicesVolume != null) {
  //                   clearTimeout(timeoutRestoreDevicesVolume);
  //                   timeoutRestoreDevicesVolume = null;
  //                 }
  //               }

  //               if (currentPlayerState === "PAUSED") {
  //                 restorVolumeOfCastedDevies();
  //               }


  //               var finishedPlaying = (previousPlayerState === "PLAYING" || previousPlayerState === "BUFFERING") && currentPlayerState === "IDLE";
  //               if (finishedPlaying) {
  //                 // reset volume to initial level and close the connection
  //                 // client.setVolume({ level: global.castedDevices[host].actualVolume },function(err,response){
  //                 //   console.log("Vol level restored to ",global.castedDevices[host].actualVolume,"host",host);
  //                 setTimeout(function () {
  //                   restorVolumeOfCastedDevies();
  //                   // client.close();
  //                   // console.log("Connection closed to host ",host);
  //                   // callback('Device notified');
  //                 }, 1000);
  //                 // });
  //               } else {
  //                 // console.log("still playing for host ", host);
  //               }

  //               previousPlayerState = currentPlayerState; // save current player state
  //               // console.log("previousPlayerState set to ",previousPlayerState , "for host ", host);

  //             });
  //             player.load(media, {
  //               autoplay: true
  //             }, function (err, status) {
  //               // console.log("loading:",status); 
  //             });
  //           });
  //         });
  //       });
  //     })
  //   });
  //   clienttcp.on('error', function (error) {
  //     emitter.emit("error", error);
  //     callback('ERROR: Device not reachable');
  //   });

  //   client.on('error', function (err) {
  //     console.log('Error: %s', err.message);
  //     client.close();
  //     emitter.emit("error", err)
  //   });

  //   client.on('status', function (status) {
  //     // console.log("status",status);
  //   });

  // };

  var onDeviceUp = function (deviceIp, url, callback) {
    const deviceDetails = setupDeviceDetails(url, deviceIp);

    setupSocket(deviceDetails)
      .then(deviceDetails => 
        connectWithDevice(deviceDetails, deviceIp))

      .then(deviceDetails =>
        memoriseCurrentDeviceVolume(deviceDetails))

      .then(deviceDetails=>
        setDeviceVolume(deviceDetails))

      .then( deviceDetails =>
        setupPlayer(deviceDetails))

      .then(deviceDetails =>
        playMedia(deviceDetails))

      .then(deviceDetails =>
        restoreDeviceVolume(deviceDetails))
        
      .catch(e => {
        emitter.emit("error", e);
        console.error(e)
      });
  };


  var restorVolumeOfCastedDevies = function () {
    timeoutRestoreDevicesVolume = null;
    for (var host in global.castedDevices) {
      new restorVolumeOfDevice(host, global.castedDevices[host].actualVolume);
    }
  }

  // var restorVolumeOfDevice = function (host, volume) {
  //   var client = new Client();
  //   client.connect(host, function () {
  //     client.setVolume({ level: volume }, function (err, response) {
  //       console.log("volume restored to ", volume, " for device", host);
  //     });
  //   });
  // }

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
      // localFileServerRestart()
    }
    return this;
  }

  this.setFileServerPort = function (serverPortToSet) {
    // if (serverPortToSet !== "" && mediaServerPort !== serverPortToSet) {
    //   mediaServerPort = serverPortToSet;
    //   if (cacheFolder !== "") {
    //     // localFileServerRestart();
    //   }
    // }
    // return this;
  }


  this.play = function (mp3_url, callback) {
    getPlayUrl(mp3_url, this.deviceip, function (res) {
      emitter.emit("play", res)
    });
  };


  var getPlayUrl = function (url, host, callback) {
    onDeviceUp(host, url, function (res) {
      callback(res);
    });
  };

  function setupDeviceDetails(url, deviceIp) {
    const deviceDetails = {
      "url": url,
      "volume": 50,
      "ip": deviceIp
    };
    deviceDetails.defaultMediaReceiver = require('castv2-client').DefaultMediaReceiver;
    console.log("new message -----");
    deviceDetails.device = new Client();

    deviceDetails.device.on('error', function (err) {
      console.log('Error: %s', err.message);
      deviceDetails.device.close();
      emitter.emit("error", err);
    });

    deviceDetails.device.on('status', function (status) {
      // console.log("status",status);
    });
    return deviceDetails;
  }

  function setupSocket(deviceDetails) {
    return new Promise((resolve, reject) => {
      deviceDetails.clienttcp = new net.Socket();
      deviceDetails.clienttcp.on('error', function (error) {
        reject('ERROR: Device not reachable');
      });
      deviceDetails.clienttcp.connect(8009, deviceDetails.ip, () => {
        resolve(deviceDetails);
      });
    });
  }

  function connectWithDevice(deviceDetails, deviceIp) {
    return new Promise((resolve, reject) => {
      deviceDetails.device.connect(deviceIp, () => {
        resolve(deviceDetails);
      });
    });
  }

  function memoriseCurrentDeviceVolume(deviceDetails) {
    return new Promise((resolve, reject) => {
      deviceDetails.device.getVolume((err, volume) => {
        deviceDetails.memoVolume = volume;
        console.log("inital vol level", volume, "device", deviceDetails.ip);
        resolve(deviceDetails);
      });
    });
  }

  function restoreDeviceVolume(deviceDetails) {
    return new Promise((resolve, reject) => {
      deviceDetails.device.setVolume({ level: deviceDetails.memoVolume.level }, (err, response) => {
        if (err)
          reject(err);
        console.log("Vol level restored to ", deviceDetails.memoVolume.level, "device ", deviceDetails.ip);
        resolve(deviceDetails);
      });
    });
  }

  function setDeviceVolume(deviceDetails) {
    return new Promise((resolve, reject) => {
      deviceDetails.device.setVolume({ level: emitVolume }, (err, response) => {
        if (err)
          reject(err);
        console.log("Vol level set to ", emitVolume, "device ", deviceDetails.ip);
        resolve(deviceDetails);
      });
    });
  }

  function setupPlayer(deviceDetails) {
    return new Promise((resolve, reject) => {
      deviceDetails.device.launch(deviceDetails.defaultMediaReceiver, function (err, player) {
        if (err)
          reject(error);
          deviceDetails.player = player;
        resolve(deviceDetails);
      });
    });
  }

  function playMedia(deviceDetails) {
    return new Promise((resolve, reject) => {
      var media = {
        contentId: deviceDetails.url,
        contentType: 'audio/mp3',
        streamType: 'BUFFERED' // or LIVE
      };

      deviceDetails.player.load(media, {
        autoplay: true
      }, function (err, status) {
        // console.log("loading:",status); 
      });

      deviceDetails.player.on('status', function (status) {
        var currentPlayerState = status.playerState;
        console.log('status broadcast currentPlayerState=%s', currentPlayerState, "for host", deviceDetails.ip);

        if (currentPlayerState === "PLAYING") {
          if (timeoutRestoreDevicesVolume != null) {
            clearTimeout(timeoutRestoreDevicesVolume);
            timeoutRestoreDevicesVolume = null;

          }
        }

        if (currentPlayerState === "PAUSED") {
          restorVolumeOfCastedDevies();
          resolve(deviceDetails);
        }


        var finishedPlaying = (previousPlayerState === "PLAYING" || previousPlayerState === "BUFFERING") && currentPlayerState === "IDLE";
        if (finishedPlaying) {
          // reset volume to initial level and close the connection
          // client.setVolume({ level: global.castedDevices[host].actualVolume },function(err,response){
          //   console.log("Vol level restored to ",global.castedDevices[host].actualVolume,"host",host);
          setTimeout(function () {
            restorVolumeOfCastedDevies();
            resolve(deviceDetails);
            // client.close();
            // console.log("Connection closed to host ",host);
            // callback('Device notified');
          }, 1000);
          // });
        } else {
          // console.log("still playing for host ", host);
        }

        previousPlayerState = currentPlayerState;


      });
    });
  }
};

GoogleHomeNotifier.prototype.__proto__ = EventEmitter.prototype // inherit from EventEmitter

module.exports = function (deviceip, language, speed, mediaServerIp, mediaServerPort, cacheFolder) {
  if (deviceip && language) {
    if (!speed) {
      speed = 1
    };
    return new GoogleHomeNotifier(deviceip, language, speed, mediaServerIp, mediaServerPort, cacheFolder);
  }
}



function getDeviceIp(client) {
  return client.connection.channel.bus.socket.localAddress;
}

function Download_Mp3(text, language, fileNameWithSpeedAndLanguage, playSlow, cacheFolder, callback) {

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
