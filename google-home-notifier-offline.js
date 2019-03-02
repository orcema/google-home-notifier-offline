'use strict';

var Client = require('castv2-client').Client;
const EventEmitter = require('events');
var DefaultMediaReceiver = require('castv2-client').DefaultMediaReceiver;
var Googletts = require('google-tts-api');
var net = require('net');
var fs = require('fs');
var ip = require("ip");
var network = require('network');

var request = require('request');
var path = require('path');

var actualVolume=0; // actual Volume of the assistant
var emitVolume=20/100; // volume level to use for notificaiton/play
var playerState="IDLE"; // holds the player status
var cacheFolder = "" // default init to no cache folder
var httpServer = "";
var httpServerPort ="8081"; // default port for serving mp3
var serverIP="";

function localFileServerClose(callback){
  if (httpServer!=="") {
    httpServer.close(function(){
      httpServer="";
    });
  }
  callback();
}

function localFileServerStart(){

    const FileServer = require('file-server');
    
    const fileServer = new FileServer((error, request, response) => {
        response.statusCode = error.code || 500;
        response.end("404: Not Found " +request.url);
    });
    
    const serveRobots = fileServer.serveDirectory(cacheFolder, {
      '.mp3':'audio/mpeg'
    });

    httpServer = require('http') 
    .createServer(serveRobots)
    .listen(httpServerPort);
    console.log ("fileServer listening on port " + httpServerPort);
  
}

function localFileServerRestart(){
  if (httpServer===""){
    localFileServerStart();
  }else{
    localFileServerClose(function(){
      localFileServerStart();
    })
  }
}

function Download_Mp3(url, fileName){

  var dstFilePath = path.resolve(cacheFolder+"\\"+fileName)+".mp3";
  request
  .get(url)
  .on('error', function(err) {
    // handle error
  })
  .pipe(fs.createWriteStream(dstFilePath));
}

function GoogleHomeNotifier(deviceip, language, speed) {
  
  network.get_private_ip(function(err, ip) {
    serverIP=ip;
  });

  this.deviceip = deviceip;
  this.language = language;
  this.speed = speed;

  var emitter = this;

  this.setEmitVolume=function(pctVolume){
    
    if (pctVolume!=undefined){ // if not defined then the (default/last set) emitValue will be used
      emitVolume=pctVolume;
      // make sure volume is a percentage, else adjust
      if (emitVolume>100) emitVolume=100;
      if (emitVolume<0) emitVolume=0;
      if (emitVolume>1) emitVolume=emitVolume/100;
    }
    return this;
  }

  this.setCacheFolder=function(cacheFolderToUse){
    if(cacheFolderToUse!=="" && cacheFolder!==cacheFolderToUse){
      cacheFolder=cacheFolderToUse;
      localFileServerRestart()
    }
    return this;
  }

  this.setFileServerPort=function(serverPortToSet){
    if(serverPortToSet!=="" && httpServerPort!==serverPortToSet ){
      httpServerPort=serverPortToSet;
      if(cacheFolder!=="") {
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


    if(cacheFolder!==""){
      let fileName=text.replace(/[^a-zA-Z0-9]/g,"_").toUpperCase() ;
      let fileToCheckInCache = path.resolve(cacheFolder+"\\"+fileName)+".mp3";

      if (fs.existsSync(fileToCheckInCache)) {
        let url="http://"+serverIP+":"+httpServerPort+"/"+fileName+".mp3";
        onDeviceUp(host, url, function (res) {
          callback(res);
        });          

      }else{
        Googletts(text, language, 1).then(function (url) {
          Download_Mp3(url,fileName);
          onDeviceUp(host, url, function (res) {
            callback(res);
          });            
        }).catch(function (err) {
          emitter.emit("error", err);
        });        
        
      }

    }else{
      Googletts(text, language, 1).then(function (url) {
        onDeviceUp(host, url, function (res) {
          callback(res);
        });            
      }).catch(function (err) {
        emitter.emit("error", err);
      });       
    }





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
