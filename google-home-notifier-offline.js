'use strict';

var Client = require('castv2-client').Client;
const EventEmitter = require('events');
var DefaultMediaReceiver = require('castv2-client').DefaultMediaReceiver;
var Googletts = require('google-tts-api');
var net = require('net');

var actualVolume=0; // actual Volume of the assistant
var emitVolume=20/100; // volume level to use for notificaiton/play
var playerState="IDLE"; // holds the player status

function GoogleHomeNotifier(deviceip, language, speed) {

  this.deviceip = deviceip;
  this.language = language;
  this.speed = speed;

  var emitter = this;

  this.setEmitVolume=function(pctVolume,callback){
    
    if (pctVolume!=undefined){ // if not defined then the (default/last set) emitValue will be used
      emitVolume=pctVolume;
      // make sure volume is a percentage, else adjust
      if (emitVolume>100) emitVolume=100;
      if (emitVolume<0) emitVolume=0;
      if (emitVolume>1) emitVolume=emitVolume/100;
    }
    callback();
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
    Googletts(text, language, 1).then(function (url) {
      onDeviceUp(host, url, function (res) {
        callback(res);
      });
    }).catch(function (err) {
      emitter.emit("error", err);
    });
  };

  var getPlayUrl = function (url, host, callback) {
    onDeviceUp(host, url, function (res) {
      callback(res);
    });
  };

  var onDeviceUp = function (host, url, callback) {
    var client = new Client();
    var clienttcp = new net.Socket();
    clienttcp.connect(8009, host, function () {
      client.connect(host, function () {
        client.getVolume(function(err,volume){
          actualVolume=volume.level;
          client.setVolume({ level: emitVolume },function(err,response){ // set the notification volume
            client.launch(DefaultMediaReceiver, function (err, player) {
              var media = {
                contentId: url,
                contentType: 'audio/mp3',
                streamType: 'BUFFERED' // or LIVE
              };
              player.on('status', function(status) {
                // console.log('status broadcast playerState=%s', status.playerState);
                if ((playerState==="PLAYING"||playerState==="BUFFERING") && status.playerState==="IDLE"){
                  // reset volume to initial level and close the connection
                    client.setVolume({ level: actualVolume },function(err,response){
                      setTimeout(function(){
                        client.close();
                        callback('Device notified');
                      },1000);
                    });
                }
                playerState=status.playerState; // save current player state
              });              
              player.load(media, {
                autoplay: true
              }, function (err, status) {
                // console.log(status); 
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

    client.on('status', function (status){
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
